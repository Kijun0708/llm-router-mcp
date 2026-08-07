// src/services/providers/agy-parse.ts
//
// agy(Antigravity CLI) --output-format json 출력 파싱. 순수 함수.
//
// 2026-08-07 agy 1.1.11 실측 기준. 함정 3개를 여기서 전부 흡수한다:
//
//  1. 에러도 exit 1과 함께 정상 JSON 봉투로 나온다
//     → exitCode를 1차 신호로 쓰면 안 된다.
//  2. 툴 권한이 headless에서 자동 거부되면 status:"SUCCESS" + response:"" 가 나오고
//     JSON 앞에 평문 경고가 먼저 찍힌다
//     → 전체 stdout을 JSON.parse하면 실패하고, 빈 response를 성공으로 오인한다.
//  3. --effort는 슬러그에 effort가 박힌 모델에서 거부된다
//     → bad_model로 분류해 다음 모델로 강등.

import type { ErrorKind } from '../../utils/errors.js';
import type { ParseOutcome, TokenUsage } from './types.js';

export interface AgyUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}

export interface AgyEnvelope {
  conversation_id: string;
  status: 'SUCCESS' | 'ERROR';
  response: string;
  error?: string;
  duration_seconds: number;
  num_turns: number;
  usage: AgyUsage;
}

function isEnvelope(value: unknown): value is AgyEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  // status와 usage를 동시에 가진 객체만 봉투로 인정한다.
  // 모델이 답변 안에서 JSON을 출력해도 오탐하지 않도록 두 조건을 모두 요구.
  return typeof v.status === 'string' && typeof v.usage === 'object' && v.usage !== null;
}

/**
 * stdout에서 마지막 봉투 라인을 찾는다.
 * 봉투 앞에 나온 모든 것(평문 경고 등)은 preamble로 분리해 진단에 쓴다.
 */
export function parseAgyStdout(stdout: string): { envelope: AgyEnvelope | null; preamble: string } {
  if (!stdout) return { envelope: null, preamble: '' };

  const lines = stdout.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed[0] !== '{') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isEnvelope(parsed)) {
        return {
          envelope: parsed,
          preamble: lines.slice(0, i).join('\n').trim(),
        };
      }
    } catch {
      // JSON이 아닌 줄은 계속 위로
    }
  }

  return { envelope: null, preamble: stdout.trim() };
}

const QUOTA_RE = /RESOURCE_EXHAUSTED|(?<!\d)429(?!\d)|individual quota reached|quota\s*(exceeded|reached|exhausted)|rate[\s._-]?limit/i;
const BAD_MODEL_RE = /invalid model selection|--effort is not supported|(unknown|unrecognized|unsupported) model|is not recognized as a known model/i;
const AUTH_RE = /not (logged[\s._-]?in|authenticated)|\bunauthorized\b|authentication (failed|required)|please (run )?`?(agy )?login`?/i;
const AUTO_DENY_RE = /permission that headless mode cannot prompt for|auto-denied|no output produced/i;

const PREVIEW_LIMIT = 2000;

function preview(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('\n').trim().slice(0, PREVIEW_LIMIT);
}

function toTokenUsage(u: AgyUsage | undefined): TokenUsage | undefined {
  if (!u) return undefined;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningTokens: u.thinking_tokens,
    cachedInputTokens: u.cache_read_tokens,
    totalTokens: u.total_tokens,
  };
}

/**
 * 판정 순서가 곧 사양이다. 바꾸지 말 것.
 *
 *  1. 봉투 없음            → unknown (stdout 잘림, agy 크래시 등)
 *  2. quota                → 최우선. SUCCESS-empty로 위장해서 오는 quota까지 잡기 위해
 *                            error/preamble/stderr를 전부 훑는다.
 *  3. status === 'ERROR'   → error 문자열 세부 분류
 *  4. SUCCESS + 빈 response → auto-deny 프리앰블이면 permission_denied, 아니면 unknown
 *  5. 정상
 */
export function classifyAgy(
  envelope: AgyEnvelope | null,
  preamble: string,
  exitCode: number,
  stderr: string
): ParseOutcome {
  if (!envelope) {
    const kind: ErrorKind = 'unknown';
    return {
      ok: false,
      kind,
      message:
        `agy가 JSON 응답 봉투를 내지 않았습니다 (exit ${exitCode}). ` +
        `출력: ${preview(preamble, stderr) || '(없음)'}`,
    };
  }

  const haystack = preview(envelope.error, preamble, stderr);

  if (QUOTA_RE.test(haystack)) {
    return {
      ok: false,
      kind: 'quota',
      message: `agy 한도 소진: ${envelope.error || haystack || '(상세 없음)'}`,
    };
  }

  if (envelope.status === 'ERROR') {
    const detail = envelope.error || haystack || '(상세 없음)';
    let kind: ErrorKind = 'unknown';
    if (BAD_MODEL_RE.test(detail)) kind = 'bad_model';
    else if (AUTH_RE.test(detail)) kind = 'auth';
    return { ok: false, kind, message: `agy 오류: ${detail}` };
  }

  if (envelope.response.trim() === '') {
    if (AUTO_DENY_RE.test(preview(preamble, stderr))) {
      return {
        ok: false,
        kind: 'permission_denied',
        message:
          'agy가 툴 권한을 자동 거부했습니다. argv에 --dangerously-skip-permissions가 ' +
          `누락됐을 가능성이 큽니다. 출력: ${preview(preamble, stderr)}`,
      };
    }
    return {
      ok: false,
      kind: 'unknown',
      message: `agy가 SUCCESS를 반환했지만 응답이 비어 있습니다. 출력: ${preview(preamble, stderr) || '(없음)'}`,
    };
  }

  return {
    ok: true,
    content: envelope.response.trim(),
    usage: toTokenUsage(envelope.usage),
  };
}
