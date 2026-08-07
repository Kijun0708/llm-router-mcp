// src/services/providers/agy-provider.ts
//
// Antigravity CLI (agy) 1.1.11+ 프로바이더.
//
// 2026-08-07 이전 구조에서 삭제된 것:
//   agy 1.0.x는 -p print mode가 stdout에 응답을 내지 않아, 프롬프트 끝에
//   "네 답변을 이 임시파일에 써라"를 붙이고 --dangerously-skip-permissions로
//   파일 쓰기를 자동 승인시킨 뒤 그 파일을 읽는 우회를 썼다. 로그 파일도 따로
//   받아 quota 에러를 스크래핑했다.
//   1.1.11에서 --output-format json이 stdout으로 정상 출력됨을 실측 확인했으므로
//   그 우회 전체(약 80줄)를 제거했다.
//
// 남은 제약:
//   - stdin 프롬프트 모드가 없다 → 프롬프트가 argv를 탄다 → Windows 32767자 상한.
//     초과분만 임시파일로 우회한다 (ARGV_PROMPT_LIMIT).
//   - --dangerously-skip-permissions가 없으면 모든 툴 사용이 headless에서 자동 거부된다.
//     역할 게이트는 --sandbox가 담당한다.
//   - --effort는 슬러그에 effort가 박힌 모델에서 거부된다 → 절대 넘기지 않는다.

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { CliProviderError, type CliProvider, type CliCallParams, type CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { parseAgyStdout, classifyAgy } from './agy-parse.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

/**
 * Windows CreateProcessW의 커맨드라인 상한은 32767자다.
 * 프롬프트 + 나머지 argv + 셸 오버헤드를 감안해 보수적으로 24K에서 파일 우회로 전환.
 */
export const ARGV_PROMPT_LIMIT = 24_000;

/** agy --print-timeout에 우리 kill 타이머보다 주는 여유. 두 타임아웃이 경합하지 않도록. */
const PRINT_TIMEOUT_HEADROOM_MS = 15_000;

export function toGoDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export function buildAgyPrompt(params: CliCallParams): string {
  // agy는 별도 시스템 프롬프트 채널이 없다 → 프롬프트에 합친다.
  if (!params.systemPrompt) return params.prompt;
  return `[System Instructions]\n${params.systemPrompt}\n\n${params.prompt}`;
}

export function buildAgyArgs(params: CliCallParams, promptArg: string, extraDirs: string[] = []): string[] {
  const args: string[] = [
    '--print', promptArg,
    '--model', params.model,
    '--output-format', 'json',
    // 없으면 headless에서 모든 툴 호출이 자동 거부된다 (실측).
    '--dangerously-skip-permissions',
    '--print-timeout', toGoDuration(params.timeoutMs + PRINT_TIMEOUT_HEADROOM_MS),
    '--disable-slash-commands',
  ];

  if (params.workspaceDir) {
    args.push('--project', params.workspaceDir);
  }

  // 역할 게이트. --sandbox는 터미널 제약을 건다.
  // read-only 전문가에만 적용하고 implementer는 제외.
  if (params.sandbox === 'read-only') {
    args.push('--sandbox');
  }

  for (const dir of [...(params.addDirs ?? []), ...extraDirs]) {
    args.push('--add-dir', dir);
  }

  // --effort는 의도적으로 넘기지 않는다.
  // 레지스트리의 모든 agy 슬러그는 effort가 이름에 인코딩돼 있고(-high/-low/-thinking),
  // 그런 모델에 --effort를 주면 agy가 "--effort is not supported"로 거절한다.

  return args;
}

export class AgyCliProvider implements CliProvider {
  readonly id = 'agy' as const;

  async call(params: CliCallParams): Promise<CliCallResult> {
    if (params.imagePaths && params.imagePaths.length > 0) {
      throw new CliProviderError(
        'bad_request',
        this.id,
        params.model,
        'agy는 이미지 입력을 지원하지 않습니다. 이미지가 필요하면 codex 전문가를 사용하세요.'
      );
    }

    const cliPath = config.cli.agyPath;
    const prompt = buildAgyPrompt(params);

    // Windows argv 상한 우회 — 초과 프롬프트만 파일로.
    let promptArg = prompt;
    let promptFile: string | undefined;
    const extraDirs: string[] = [];

    if (prompt.length > ARGV_PROMPT_LIMIT) {
      promptFile = join(tmpdir(), `agy-prompt-${randomUUID()}.md`);
      writeFileSync(promptFile, prompt, 'utf-8');
      promptArg =
        `Read the file at ${promptFile} and follow the instructions inside it completely. ` +
        `Do not modify that file. Answer directly; do not mention the file.`;
      extraDirs.push(tmpdir());
      logger.debug(
        { provider: this.id, promptLength: prompt.length, promptFile },
        'agy prompt exceeded argv limit, using file handoff'
      );
    }

    const args = buildAgyArgs(params, promptArg, extraDirs);

    logger.debug(
      { provider: this.id, model: params.model, expertId: params.expertId, sandbox: params.sandbox, promptLength: prompt.length },
      'Calling agy CLI'
    );

    try {
      const result = await spawnCli(cliPath, args, {
        timeoutMs: params.timeoutMs,
        env: { TZ: 'UTC' },
        // 프롬프트 argv에 백슬래시 경로/줄바꿈이 들어가 cmd quoting이 깨진다.
        shell: false,
        label: `agy(${params.model})`,
      });

      if (result.stdoutTruncated) {
        throw new CliProviderError(
          'unknown',
          this.id,
          params.model,
          'agy 출력이 버퍼 상한에서 잘려 JSON 봉투를 복원할 수 없습니다.'
        );
      }

      const { envelope, preamble } = parseAgyStdout(result.stdout);
      const outcome = classifyAgy(envelope, preamble, result.exitCode, result.stderr);

      if (!outcome.ok) {
        throw new CliProviderError(outcome.kind, this.id, params.model, outcome.message, result.stdout);
      }

      if (result.stderr.trim()) {
        logger.debug({ provider: this.id, stderr: result.stderr.slice(0, 500) }, 'agy stderr');
      }

      return {
        content: outcome.content,
        rawOutput: result.stdout,
        provider: this.id,
        model: params.model,
        usage: outcome.usage,
        durationMs: result.durationMs,
      };
    } finally {
      if (promptFile) {
        try {
          if (existsSync(promptFile)) unlinkSync(promptFile);
        } catch (err) {
          logger.warn({ promptFile, err: (err as Error).message }, 'Failed to clean up agy prompt file');
        }
      }
    }
  }
}
