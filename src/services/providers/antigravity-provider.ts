// src/services/providers/antigravity-provider.ts
//
// Antigravity CLI (agy) — Gemini CLI 후속작.
//
// 핵심 차이점:
//  - --model argv 미지원 → 모델은 ~/.gemini/antigravity-cli/settings.json `model` 필드로 결정
//  - --output-format json 미지원 → plain text 응답
//  - --yolo → --dangerously-skip-permissions 로 개명
//
// **파일 우회 (1.0.1 기준 필수)**:
//   agy 1.0.1의 -p print mode는 stdout이 TTY가 아닐 때(파일/파이프/spawn) 응답을
//   stdout으로 출력하지 않는 알려진 이슈가 있다. 직접 호출은 동작하지만
//   child_process.spawn 환경에서는 항상 0B 응답 + exit 0.
//   우회: prompt에 임시 파일 경로를 명시하고 agy의 파일 쓰기 도구로 답변을 받는다.
//   --dangerously-skip-permissions 가 있어야 도구 사용이 자동 승인된다.

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, unlinkSync, statSync } from 'fs';
import { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

function buildWrappedPrompt(params: CliCallParams, outputPath: string): string {
  let prompt = '';
  if (params.systemPrompt) {
    prompt += `[System Instructions]\n${params.systemPrompt}\n\n`;
  }
  prompt += params.prompt;
  prompt += `\n\n---\nIMPORTANT OUTPUT INSTRUCTION:\nWrite your COMPLETE answer to this exact file path: ${outputPath}\nWrite ONLY the answer content to that file. Do not include explanations about saving the file.\nDo not create any other files or modify anything else.`;
  return prompt;
}

// ms → Go time.Duration 문자열 ("300s" 형식)
function toGoDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

const MAX_OUTPUT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class AntigravityCliProvider implements CliProvider {
  name = 'antigravity';

  async call(params: CliCallParams): Promise<CliCallResult> {
    const cliPath = config.cli.antigravityPath;
    const outputPath = join(tmpdir(), `agy-out-${randomUUID()}.txt`);
    const prompt = buildWrappedPrompt(params, outputPath);

    const args: string[] = [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--print-timeout', toGoDuration(params.timeoutMs),
    ];

    logger.debug({
      provider: 'antigravity',
      requestedModel: params.model,
      outputPath,
      promptLength: prompt.length,
    }, 'Calling Antigravity CLI with file-output workaround');

    let result;
    try {
      result = await spawnCli(cliPath, args, {
        timeoutMs: params.timeoutMs,
        env: {
          // Issue #53 워크어라운드 — keyring 우회, timezone 버그 회피
          GEMINI_FORCE_FILE_STORAGE: 'true',
          TZ: 'UTC',
        },
        // shell: false 필수 — Windows에서 cmd.exe quoting이 prompt의 백슬래시 경로
        // (C:\Users\...\agy-out-<uuid>.txt) 와 줄바꿈을 깨트려 agy가 잘못된 prompt를 받음.
        shell: false,
      });

      if (result.exitCode !== 0) {
        throw new Error(
          `Antigravity CLI error (exit ${result.exitCode}): ${result.stderr || result.stdout || '(no output)'}`
        );
      }

      if (!existsSync(outputPath)) {
        throw new Error(
          `Antigravity CLI did not write expected output file (${outputPath}). ` +
          `agy may have failed silently or refused the file-output instruction. ` +
          `stderr: ${result.stderr || '(empty)'}`
        );
      }

      const stats = statSync(outputPath);
      if (stats.size > MAX_OUTPUT_FILE_SIZE) {
        throw new Error(
          `Antigravity output file too large (${Math.round(stats.size / 1024 / 1024)}MB > ${MAX_OUTPUT_FILE_SIZE / 1024 / 1024}MB)`
        );
      }

      const content = readFileSync(outputPath, 'utf-8').trim();

      return {
        content,
        rawOutput: content,
      };
    } finally {
      // cleanup — best effort
      try {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
        }
      } catch (err) {
        logger.warn({ outputPath, err: (err as Error).message }, 'Failed to clean up Antigravity output file');
      }
    }
  }
}
