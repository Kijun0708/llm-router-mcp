// src/services/providers/claude-parse.ts
//
// claude -p --output-format json 출력 파싱. 순수 함수.
//
// 2026-08-07 Claude Code 2.1.132 실측 응답:
// {"type":"result","subtype":"success","is_error":false,"api_error_status":null,
//  "duration_ms":3309,"num_turns":1,"result":"PROBE_OK","stop_reason":"end_turn",
//  "session_id":"...","total_cost_usd":0.2055,
//  "usage":{"input_tokens":6,"cache_creation_input_tokens":32757,
//           "cache_read_input_tokens":0,"output_tokens":14,...},
//  "modelUsage":{"claude-opus-4-7":{...}},"permission_denials":[]}

import type { ErrorKind } from '../../utils/errors.js';
import { classifyErrorText } from '../../utils/errors.js';
import type { ParseOutcome, TokenUsage } from './types.js';

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ClaudeEnvelope {
  type: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: string | null;
  result?: string;
  stop_reason?: string;
  session_id?: string;
  num_turns?: number;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: ClaudeUsage;
  modelUsage?: Record<string, unknown>;
  permission_denials?: unknown[];
  error?: string;
}

function isEnvelope(value: unknown): value is ClaudeEnvelope {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).type === 'result';
}

/**
 * stdout에서 마지막 result 봉투를 찾는다.
 * --output-format json은 보통 한 줄이지만, 경고가 앞에 섞일 수 있으므로 agy와 같은 전략.
 */
export function parseClaudeStdout(stdout: string): { envelope: ClaudeEnvelope | null; preamble: string } {
  if (!stdout) return { envelope: null, preamble: '' };

  const trimmedAll = stdout.trim();
  // 대부분의 경우: 전체가 하나의 JSON
  if (trimmedAll.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedAll);
      if (isEnvelope(parsed)) return { envelope: parsed, preamble: '' };
    } catch {
      // 여러 줄일 수 있으니 아래로
    }
  }

  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed[0] !== '{') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isEnvelope(parsed)) {
        return { envelope: parsed, preamble: lines.slice(0, i).join('\n').trim() };
      }
    } catch {
      // 계속
    }
  }

  return { envelope: null, preamble: trimmedAll };
}

const PREVIEW_LIMIT = 2000;

function preview(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join('\n').trim().slice(0, PREVIEW_LIMIT);
}

function toTokenUsage(u: ClaudeUsage | undefined, costUsd?: number): TokenUsage | undefined {
  if (!u && costUsd === undefined) return undefined;
  const input = u?.input_tokens ?? 0;
  const output = u?.output_tokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: u?.cache_read_input_tokens,
    totalTokens: input + output,
    costUsd,
  };
}

/**
 * 판정 순서:
 *  1. 봉투 없음                    → unknown
 *  2. is_error / subtype !== success → 세부 분류
 *  3. 빈 result                     → permission_denials가 있으면 permission_denied
 *  4. 정상
 */
export function classifyClaude(
  envelope: ClaudeEnvelope | null,
  preamble: string,
  exitCode: number,
  stderr: string
): ParseOutcome {
  if (!envelope) {
    return {
      ok: false,
      kind: 'unknown',
      message:
        `claude -p 가 result 봉투를 내지 않았습니다 (exit ${exitCode}). ` +
        `출력: ${preview(preamble, stderr) || '(없음)'}`,
    };
  }

  const isFailure = envelope.is_error === true || (envelope.subtype !== undefined && envelope.subtype !== 'success');

  if (isFailure) {
    const detail = preview(envelope.error, envelope.api_error_status, envelope.subtype, envelope.result, stderr);
    let kind: ErrorKind = classifyErrorText(detail);

    // subtype으로만 알 수 있는 케이스들
    if (kind === 'unknown') {
      if (envelope.subtype === 'error_max_turns') kind = 'bad_request';
      else if (envelope.subtype === 'error_during_execution') kind = 'server';
      else if (envelope.subtype === 'error_max_budget') kind = 'quota';
    }

    return {
      ok: false,
      kind,
      message: `claude -p 오류 (subtype=${envelope.subtype ?? '?'}): ${detail || '(상세 없음)'}`,
    };
  }

  const content = (envelope.result ?? '').trim();

  if (content === '') {
    const denials = envelope.permission_denials ?? [];
    if (denials.length > 0) {
      return {
        ok: false,
        kind: 'permission_denied',
        message:
          `claude -p 가 툴 권한을 거부했습니다 (${denials.length}건). ` +
          `--tools 설정이 작업에 필요한 권한을 막고 있을 수 있습니다: ${JSON.stringify(denials).slice(0, 500)}`,
      };
    }
    return {
      ok: false,
      kind: 'unknown',
      message: `claude -p 가 성공을 반환했지만 응답이 비어 있습니다. 출력: ${preview(preamble, stderr) || '(없음)'}`,
    };
  }

  return {
    ok: true,
    content,
    usage: toTokenUsage(envelope.usage, envelope.total_cost_usd),
  };
}

/**
 * modelUsage 키 중 실제 응답 모델을 고른다. 로깅/과금 표시용.
 *
 * claude -p는 툴 라우팅 등 내부 작업에 haiku를 함께 쓰므로 modelUsage에 여러 항목이 온다.
 *
 * 판별 기준은 **비용**이다. output 토큰으로 고르면 틀린다 — 실측에서 한 단어 답변은
 * sonnet이 4토큰인데 내부 haiku가 9토큰을 써서 haiku가 이겼다. 반면 비용은 주 모델이
 * 전체 컨텍스트를 지고 있어 압도적이다(sonnet $0.0615 vs haiku $0.0004).
 */
export function primaryModelOf(envelope: ClaudeEnvelope | null): string | undefined {
  const usage = envelope?.modelUsage;
  if (!usage) return undefined;

  const keys = Object.keys(usage);
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return keys[0];

  const num = (r: Record<string, unknown> | undefined, ...names: string[]): number => {
    for (const n of names) {
      const v = Number(r?.[n]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return 0;
  };

  let best = keys[0];
  let bestCost = -1;
  let bestOut = -1;

  for (const [model, raw] of Object.entries(usage)) {
    const r = raw as Record<string, unknown> | undefined;
    const cost = num(r, 'costUSD', 'cost_usd', 'costUsd');
    const out = num(r, 'outputTokens', 'output_tokens');
    if (cost > bestCost || (cost === bestCost && out > bestOut)) {
      bestCost = cost;
      bestOut = out;
      best = model;
    }
  }
  return best;
}
