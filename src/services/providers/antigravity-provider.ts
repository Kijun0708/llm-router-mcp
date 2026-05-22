// src/services/providers/antigravity-provider.ts
//
// Antigravity CLI (agy) — Gemini CLI 후속작.
//
// 핵심 차이점:
//  - --model argv 미지원 → settings.json `model` 필드로 결정. [model-manager.ts]가
//    우선순위 리스트(ANTIGRAVITY_MODEL_PRIORITY)를 따라 활성 모델을 자동 스위칭.
//  - --output-format json 미지원 → plain text 응답
//  - --yolo → --dangerously-skip-permissions 로 개명
//
// **파일 우회 + 로그 파일 모니터**:
//   agy 1.0.x의 -p print mode는 stdout이 TTY가 아닐 때 응답을 출력하지 않음
//   ([Issue #7](https://github.com/google-antigravity/antigravity-cli/issues/7)).
//   prompt에 임시 파일 경로를 명시하고 agy의 file editing tool로 답변을 받음.
//   --log-file로 agy 내부 로그를 캡처해 quota 에러(429 RESOURCE_EXHAUSTED) 감지.

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, unlinkSync, statSync } from 'fs';
import { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { withAntigravityModel, detectQuotaError } from './antigravity-model-manager.js';
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

function toGoDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

const MAX_OUTPUT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class AntigravityCliProvider implements CliProvider {
  name = 'antigravity';

  async call(params: CliCallParams): Promise<CliCallResult> {
    return withAntigravityModel(async (activeModel) => {
      const cliPath = config.cli.antigravityPath;
      const outputPath = join(tmpdir(), `agy-out-${randomUUID()}.txt`);
      const logPath = join(tmpdir(), `agy-log-${randomUUID()}.log`);
      const prompt = buildWrappedPrompt(params, outputPath);

      const args: string[] = [
        '-p', prompt,
        '--dangerously-skip-permissions',
        '--print-timeout', toGoDuration(params.timeoutMs),
        '--log-file', logPath,
      ];

      logger.debug({
        provider: 'antigravity',
        activeModel,
        requestedModel: params.model,
        outputPath,
        logPath,
        promptLength: prompt.length,
      }, 'Calling Antigravity CLI');

      try {
        const result = await spawnCli(cliPath, args, {
          timeoutMs: params.timeoutMs,
          env: {
            GEMINI_FORCE_FILE_STORAGE: 'true',
            TZ: 'UTC',
          },
          shell: false,
        });

        // quota 에러 감지 — 로그 파일 우선, fallback으로 stdout/stderr
        let logContent = '';
        if (existsSync(logPath)) {
          try {
            logContent = readFileSync(logPath, 'utf-8');
          } catch { /* ignore */ }
        }
        const combinedForQuotaCheck = `${logContent}\n${result.stdout}\n${result.stderr}`;
        const isQuota = detectQuotaError(combinedForQuotaCheck);

        if (isQuota) {
          logger.warn({
            provider: 'antigravity',
            activeModel,
            logSample: logContent.slice(-500),
          }, 'Antigravity quota exhausted, will fallback to next model');
          return {
            result: { content: '', rawOutput: '' } as CliCallResult,
            quotaExhausted: true,
          };
        }

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
          result: { content, rawOutput: content },
          quotaExhausted: false,
        };
      } finally {
        // cleanup
        for (const p of [outputPath, logPath]) {
          try {
            if (existsSync(p)) unlinkSync(p);
          } catch (err) {
            logger.warn({ path: p, err: (err as Error).message }, 'Failed to clean up Antigravity temp file');
          }
        }
      }
    });
  }
}
