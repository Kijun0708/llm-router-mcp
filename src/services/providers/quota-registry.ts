// src/services/providers/quota-registry.ts
//
// 한도 소진 모델의 차단 상태. 프로바이더 무관.
//
// 이전에는 antigravity-model-manager.ts 안의 모듈 레벨 Map이었고 agy 전용이었다.
// codex/claude도 한도가 있으므로 프로바이더 무관 레지스트리로 승격.

import { logger } from '../../utils/logger.js';
import { quotaBlockMsFor, type ProviderId } from './model-registry.js';

function keyOf(provider: ProviderId, model: string): string {
  return `${provider}:${model}`;
}

/** key → 차단 해제 타임스탬프(ms). */
const blocked = new Map<string, number>();

export function isBlocked(provider: ProviderId, model: string): boolean {
  const key = keyOf(provider, model);
  const until = blocked.get(key);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    blocked.delete(key); // 만료분 정리
    return false;
  }
  return true;
}

export function block(provider: ProviderId, model: string, ms?: number): void {
  const duration = ms ?? quotaBlockMsFor(model);
  const until = Date.now() + duration;
  blocked.set(keyOf(provider, model), until);
  logger.warn(
    { provider, model, unblockAt: new Date(until).toISOString(), durationMs: duration },
    'Model blocked (quota exhausted)'
  );
}

export function unblockAt(provider: ProviderId, model: string): number | null {
  const until = blocked.get(keyOf(provider, model));
  if (until === undefined || until <= Date.now()) return null;
  return until;
}

export function clearBlock(provider: ProviderId, model: string): void {
  blocked.delete(keyOf(provider, model));
}

/** llm_router_health 노출용. 만료분은 지나가면서 정리한다. */
export function snapshot(): Array<{ provider: string; model: string; unblockAt: string; remainingMs: number }> {
  const now = Date.now();
  const rows: Array<{ provider: string; model: string; unblockAt: string; remainingMs: number }> = [];

  for (const [key, until] of [...blocked]) {
    if (until <= now) {
      blocked.delete(key);
      continue;
    }
    const sep = key.indexOf(':');
    rows.push({
      provider: key.slice(0, sep),
      model: key.slice(sep + 1),
      unblockAt: new Date(until).toISOString(),
      remainingMs: until - now,
    });
  }

  return rows.sort((a, b) => a.remainingMs - b.remainingMs);
}

/** 테스트 전용. */
export function resetAll(): void {
  blocked.clear();
}
