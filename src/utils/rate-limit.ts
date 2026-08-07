// src/utils/rate-limit.ts

import { logger } from './logger.js';
import { classifyErrorText, kindOf } from './errors.js';

/**
 * 한도 소진 여부.
 *
 * 판정은 utils/errors.ts의 단일 분류표에 위임한다. 여기 있던 자체
 * RATE_LIMIT_PATTERNS는 삭제했다 — /capacity/ 와 벌거벗은 /429/ 가
 * 모델의 평범한 답변 텍스트에까지 걸려 오탐을 냈고, /overloaded/를
 * quota로 잡아 5xx 과부하와 구분하지 못했다.
 */
export function isRateLimitError(error: unknown, responseText?: string): boolean {
  // HTTP 429 체크 (구조적 신호 우선)
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.status === 429) return true;
    if (err.response && typeof err.response === 'object') {
      const response = err.response as Record<string, unknown>;
      if (response.status === 429) return true;
    }
  }

  if (responseText !== undefined) {
    return classifyErrorText(responseText) === 'quota';
  }
  return kindOf(error) === 'quota';
}

export function parseRetryAfter(headers: Headers): number | null {
  const retryAfter = headers.get('retry-after') || headers.get('Retry-After');
  if (!retryAfter) return null;

  // 초 단위 숫자
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  // HTTP 날짜 형식
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

// detectProvider는 삭제됐다.
// 모델명 문자열로 프로바이더를 추론하는 것은 원리적으로 불가능하다 —
// agy 하나가 Gemini·Claude·GPT-OSS를 모두 서빙하므로 "claude-opus-4-6-thinking"이
// agy로 갈지 claude CLI로 갈지 이름만으로는 결정할 수 없다.
// 라우팅은 Expert.provider(명시), 과금 라벨은 billingProviderOf()를 쓴다.

// Rate Limit 추적
const rateLimitTracker = new Map<string, {
  limitedAt: Date;
  retryAfter: number;
}>();

export function markRateLimited(model: string, retryAfterMs: number): void {
  rateLimitTracker.set(model, {
    limitedAt: new Date(),
    retryAfter: retryAfterMs
  });
  logger.warn({ model, retryAfterMs }, 'Model rate limited');
}

export function isCurrentlyLimited(model: string): boolean {
  const info = rateLimitTracker.get(model);
  if (!info) return false;

  const elapsed = Date.now() - info.limitedAt.getTime();
  if (elapsed >= info.retryAfter) {
    rateLimitTracker.delete(model);
    return false;
  }

  return true;
}

export function getRateLimitStatus(): Record<string, { limited: boolean; retryInMs?: number }> {
  const status: Record<string, { limited: boolean; retryInMs?: number }> = {};

  for (const [model, info] of rateLimitTracker) {
    const elapsed = Date.now() - info.limitedAt.getTime();
    const remaining = info.retryAfter - elapsed;

    if (remaining > 0) {
      status[model] = { limited: true, retryInMs: remaining };
    } else {
      rateLimitTracker.delete(model);
      status[model] = { limited: false };
    }
  }

  return status;
}
