// src/services/providers/codex-parse.ts
//
// codex exec --json NDJSON 스캔. 순수 함수.
//
// 2026-08-07 codex 0.146.1 실측 기준.
//
// 이전 parseResponse는 5단 폴백 사다리였고 마지막 단계에서 raw stdout(=NDJSON 원문)을
// 답변으로 반환했다. 파싱이 깨져도 에러가 아니라 "쓰레기 답변"이 나오는 구조였다.
// 지금은 -o(--output-last-message) 파일이 정본이고 이 스캔은 보조 역할만 한다:
//   - 토큰 사용량 (turn.completed.usage)
//   - error item 수집 (진단용. 실패 신호로는 쓰지 않는다)
//   - -o 파일이 비었을 때의 백업 콘텐츠

import type { TokenUsage } from './types.js';

export interface CodexScan {
  /** 마지막 agent_message. -o 파일이 비었을 때만 쓰는 백업. */
  lastAgentMessage?: string;
  /** item.type === 'error' 메시지들. 진단용이며 실패 신호가 아니다. */
  errors: string[];
  usage?: TokenUsage;
}

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

function toTokenUsage(u: CodexUsage): TokenUsage {
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    reasoningTokens: u.reasoning_output_tokens,
    cachedInputTokens: u.cached_input_tokens,
    totalTokens: input + output,
  };
}

export function scanCodexNdjson(stdout: string): CodexScan {
  const scan: CodexScan = { errors: [] };
  if (!stdout) return scan;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue; // codex는 비 JSON 상태 줄도 섞어 낸다
    }

    if (event.type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) continue;

      if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
        scan.lastAgentMessage = item.text.trim();
        continue;
      }

      if (item.type === 'error' && typeof item.message === 'string') {
        scan.errors.push(item.message);
        continue;
      }
    }

    if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object') {
      scan.usage = toTokenUsage(event.usage as CodexUsage);
    }
  }

  return scan;
}
