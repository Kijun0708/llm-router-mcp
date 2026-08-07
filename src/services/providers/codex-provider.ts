// src/services/providers/codex-provider.ts
//
// OpenAI Codex CLI 0.146.1+ 프로바이더.
//
// 2026-08-07 실측으로 바뀐 것:
//  - `-o/--output-last-message <FILE>`이 최종 답변만 정확히 기록한다.
//    이전의 5단 NDJSON 폴백 사다리(마지막에 raw stdout을 답변으로 뱉던)를 폐기했다.
//  - `--json`은 토큰 사용량(turn.completed.usage)과 error item 수집용으로만 병행한다.
//    두 플래그는 서로 독립이라 같이 쓸 수 있다.
//  - `-m/--model`을 드디어 넘긴다. 이전엔 아예 안 넘겨서 MODEL_* env와
//    set_expert_model이 GPT 전문가 11명 전부에 대해 무의미했다.
//  - `--sandbox read-only`를 역할별로 적용한다. 이전엔 전원 workspace-write였다.

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { CliProviderError, type CliProvider, type CliCallParams, type CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { scanCodexNdjson } from './codex-parse.js';
import { classifyErrorText } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

/** codex는 시스템 프롬프트 채널이 없어 프롬프트에 합친다. */
export function buildCodexPrompt(params: CliCallParams): string {
  if (!params.systemPrompt) return params.prompt;
  return `[System Instructions]\n${params.systemPrompt}\n\n[Task]\n${params.prompt}`;
}

export function buildCodexArgs(params: CliCallParams, outFile: string): string[] {
  const args: string[] = [
    'exec', '-',              // 프롬프트는 stdin (긴 프롬프트/특수문자 안전)
    '--json',
    '--model', params.model,
    '--sandbox', params.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only',
    '--skip-git-repo-check',  // git 저장소 밖에서도 동작
    '--ephemeral',            // 일회성 전문가 호출이므로 세션 미저장
    '--output-last-message', outFile,
    // 코드 분석/리뷰가 본 역할이라 깊은 reasoning 우선.
    // (xhigh도 가능하나 credit 소모/latency가 커서 high가 균형점)
    '-c', 'model_reasoning_effort=high',
  ];

  if (params.workspaceDir) {
    args.push('-C', params.workspaceDir);
  }

  for (const dir of params.addDirs ?? []) {
    args.push('--add-dir', dir);
  }

  for (const img of params.imagePaths ?? []) {
    args.push('-i', img);
  }

  // --strict-config는 붙이지 않는다: 사용자 config.toml의 deprecated 키가 치명적이 된다.
  // --ignore-user-config도 붙이지 않는다: 인증/프로필이 날아간다.

  return args;
}

export class CodexCliProvider implements CliProvider {
  readonly id = 'codex' as const;

  async call(params: CliCallParams): Promise<CliCallResult> {
    const cliPath = config.cli.codexPath;
    const prompt = buildCodexPrompt(params);
    const outFile = join(tmpdir(), `codex-out-${randomUUID()}.txt`);
    const args = buildCodexArgs(params, outFile);

    logger.debug(
      { provider: this.id, model: params.model, expertId: params.expertId, sandbox: params.sandbox, promptLength: prompt.length },
      'Calling Codex CLI'
    );

    try {
      const result = await spawnCli(cliPath, args, {
        timeoutMs: params.timeoutMs,
        stdin: prompt,
        label: `codex(${params.model})`,
      });

      const scan = scanCodexNdjson(result.stdout);

      // error item은 진단용이지 실패 신호가 아니다.
      // 사용자 ~/.codex/config.toml의 deprecated features.codex_hooks가
      // 매 실행마다 error item을 하나씩 만든다 (실측).
      if (scan.errors.length > 0) {
        logger.warn(
          { provider: this.id, model: params.model, errors: scan.errors },
          'Codex reported error items (advisory)'
        );
      }

      let fileContent = '';
      if (existsSync(outFile)) {
        try {
          fileContent = readFileSync(outFile, 'utf-8').trim();
        } catch (err) {
          logger.warn({ outFile, err: (err as Error).message }, 'Failed to read codex output file');
        }
      }

      const content = fileContent || scan.lastAgentMessage || '';

      if (result.exitCode !== 0) {
        const detail = [result.stderr.trim(), ...scan.errors].filter(Boolean).join('\n') || result.stdout.slice(-2000);
        throw new CliProviderError(
          classifyErrorText(detail),
          this.id,
          params.model,
          `Codex CLI 실패 (exit ${result.exitCode}): ${detail || '(출력 없음)'}`,
          result.stdout
        );
      }

      if (!content) {
        const detail = [result.stderr.trim(), ...scan.errors].filter(Boolean).join('\n');
        throw new CliProviderError(
          classifyErrorText(detail),
          this.id,
          params.model,
          `Codex가 응답을 반환하지 않았습니다. ${detail || '(진단 정보 없음)'}`,
          result.stdout
        );
      }

      return {
        content,
        rawOutput: result.stdout,
        provider: this.id,
        model: params.model,
        usage: scan.usage,
        durationMs: result.durationMs,
      };
    } finally {
      try {
        if (existsSync(outFile)) unlinkSync(outFile);
      } catch (err) {
        logger.warn({ outFile, err: (err as Error).message }, 'Failed to clean up codex output file');
      }
    }
  }
}
