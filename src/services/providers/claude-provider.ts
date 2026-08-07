// src/services/providers/claude-provider.ts
//
// Claude Code CLI (`claude -p`) 프로바이더 — opt-in 전용.
//
// 배경: 예전에는 Claude Code 세션 안에서 claude -p를 호출할 수 없어 Claude 전문가를
// 삭제했다. 2026-08-07 Claude Code 2.1.132에서 CLAUDECODE가 설정된 중첩 환경에서도
// 정상 동작함을 실측 확인했다.
//
// **이 프로바이더는 사용자 본인의 Claude 구독 한도를 소모한다.**
// 이 MCP의 존재 이유(타 벤더로 오프로드)와 상충하므로 3중으로 막는다:
//   1. model-registry의 scarce: true → 폴백 꼬리로 도달 불가, 명시 요청 0번 스텝에서만
//   2. 어떤 전문가의 기본 모델도 아님
//   3. --max-budget-usd 로 호출당 상한
//
// codex/agy 대비 강점: 진짜 --system-prompt 채널, 정밀한 툴 게이팅, 압도적 속도(4.5초).

import { CliProviderError, type CliProvider, type CliCallParams, type CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { parseClaudeStdout, classifyClaude, primaryModelOf } from './claude-parse.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

/** read-only 전문가에게 허용할 툴. 파일 읽기/검색만. */
const READ_ONLY_TOOLS = 'Read,Grep,Glob';

export function buildClaudeArgs(params: CliCallParams, maxBudgetUsd: number): string[] {
  const args: string[] = [
    '--print',
    '--model', params.model,
    '--output-format', 'json',
    // 이 MCP 서버 자신이 claude -p 안에서 다시 로드되는 재귀를 차단한다.
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--tools', params.sandbox === 'workspace-write' ? 'default' : READ_ONLY_TOOLS,
  ];

  if (params.systemPrompt) {
    // codex/agy와 달리 진짜 시스템 프롬프트 채널이 있다.
    args.push('--system-prompt', params.systemPrompt);
  }

  if (maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(maxBudgetUsd));
  }

  for (const dir of params.addDirs ?? []) {
    args.push('--add-dir', dir);
  }

  // --bare는 절대 쓰지 않는다: 인증이 ANTHROPIC_API_KEY 전용으로 바뀌어
  // 구독 OAuth 인증이 깨진다.

  return args;
}

export class ClaudeCliProvider implements CliProvider {
  readonly id = 'claude' as const;

  async call(params: CliCallParams): Promise<CliCallResult> {
    if (params.imagePaths && params.imagePaths.length > 0) {
      throw new CliProviderError(
        'bad_request',
        this.id,
        params.model,
        'claude -p 프로바이더는 이미지 입력을 지원하지 않습니다. codex 전문가를 사용하세요.'
      );
    }

    const cliPath = config.cli.claudePath;
    const args = buildClaudeArgs(params, config.claudeMaxBudgetUsd);

    logger.debug(
      { provider: this.id, model: params.model, expertId: params.expertId, sandbox: params.sandbox, promptLength: params.prompt.length },
      'Calling Claude CLI (opt-in, consumes user quota)'
    );

    const result = await spawnCli(cliPath, args, {
      timeoutMs: params.timeoutMs,
      // 프롬프트는 stdin — argv 상한 회피
      stdin: params.prompt,
      env: params.workspaceDir ? { PWD: params.workspaceDir } : undefined,
      label: `claude(${params.model})`,
    });

    if (result.stdoutTruncated) {
      throw new CliProviderError(
        'unknown',
        this.id,
        params.model,
        'claude -p 출력이 버퍼 상한에서 잘려 JSON 봉투를 복원할 수 없습니다.'
      );
    }

    const { envelope, preamble } = parseClaudeStdout(result.stdout);
    const outcome = classifyClaude(envelope, preamble, result.exitCode, result.stderr);

    if (!outcome.ok) {
      throw new CliProviderError(outcome.kind, this.id, params.model, outcome.message, result.stdout);
    }

    const actualModel = primaryModelOf(envelope) ?? params.model;

    if (outcome.usage?.costUsd !== undefined) {
      logger.info(
        { provider: this.id, model: actualModel, costUsd: outcome.usage.costUsd, expertId: params.expertId },
        'Claude CLI call billed to user quota'
      );
    }

    return {
      content: outcome.content,
      rawOutput: result.stdout,
      provider: this.id,
      model: actualModel,
      usage: outcome.usage,
      durationMs: result.durationMs,
    };
  }
}
