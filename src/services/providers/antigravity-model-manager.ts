// src/services/providers/antigravity-model-manager.ts
//
// Antigravity 모델 자동 fallback 관리.
//
// agy 1.0.5부터 `--model <name>` argv가 공식 지원되므로 settings.json을 건드리지 않고
// 모델을 per-call 단위로 지정. 동시 호출이 서로의 모델을 덮어쓸 race가 사라져 mutex
// 직렬화 불필요 → 진정한 병렬 호출 회복.
//
// 동작:
//  1. 우선순위 리스트(ANTIGRAVITY_MODEL_PRIORITY)에서 quota 차단되지 않은 첫 번째 모델 선택
//  2. callback에 모델명 전달 → callback이 spawn agy with `--model <name>`
//  3. callback이 quota 에러를 감지하면 해당 모델 차단 (1h30m) + 다음 모델로 재시도

import { logger } from '../../utils/logger.js';

const DEFAULT_PRIORITY = [
  'Claude Opus 4.6 (Thinking)',
  'Gemini 3.1 Pro (High)',
];

// 1시간 30분 — agy quota reset 주기 관찰값
const QUOTA_BLOCK_MS = 90 * 60 * 1000;

// 모듈 레벨 상태 — 모델별 unblock timestamp
const quotaExhausted = new Map<string, number>();

function getModelPriority(): string[] {
  const env = process.env.ANTIGRAVITY_MODEL_PRIORITY;
  if (!env) return DEFAULT_PRIORITY;
  const parsed = env.split(',').map(s => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_PRIORITY;
}

/**
 * 우선순위 리스트에서 현재 사용 가능한 첫 번째 모델 반환.
 * 모두 차단된 경우 null.
 */
function pickAvailableModel(): string | null {
  const priority = getModelPriority();
  const now = Date.now();
  for (const model of priority) {
    const unblockAt = quotaExhausted.get(model);
    if (!unblockAt || unblockAt < now) {
      if (unblockAt) {
        // 만료됐으니 정리
        quotaExhausted.delete(model);
      }
      return model;
    }
  }
  return null;
}

/**
 * 모델을 quota exhausted로 표시 (1h30m 차단).
 */
export function markQuotaExhausted(modelName: string): void {
  const until = Date.now() + QUOTA_BLOCK_MS;
  quotaExhausted.set(modelName, until);
  logger.warn({
    model: modelName,
    unblockAt: new Date(until).toISOString(),
  }, 'Antigravity model marked quota-exhausted');
}

/**
 * 로그 파일에서 agy quota 에러 감지.
 */
export function detectQuotaError(logContent: string): boolean {
  if (!logContent) return false;
  return /RESOURCE_EXHAUSTED|code 429|Individual quota reached|quota exceeded/i.test(logContent);
}

/**
 * 활성 모델을 결정해 callback에 전달. quota 에러 시 차단 + 다음 모델로 재시도.
 *
 * 1.0.4 이전: settings.json `model` 필드를 매 호출 mutate → 동시 호출 race 위험 →
 *             mutex로 직렬화 강제 (병렬성 손상).
 * 1.0.5 이후: `--model <name>` argv를 callback이 직접 spawn 인자로 전달 →
 *             settings.json 안 건드림 → race 없음 → mutex 불필요, 진정한 병렬.
 */
export async function withAntigravityModel<T>(
  callback: (activeModel: string) => Promise<{ result: T; quotaExhausted: boolean }>
): Promise<T> {
  const priority = getModelPriority();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < priority.length; attempt++) {
    const activeModel = pickAvailableModel();
    if (!activeModel) {
      const unblockTimes = Array.from(quotaExhausted.values());
      const earliest = unblockTimes.length > 0
        ? new Date(Math.min(...unblockTimes)).toISOString()
        : 'unknown';
      throw new Error(
        `All Antigravity models in priority [${priority.join(', ')}] are quota-exhausted. ` +
        `Earliest unblock: ${earliest}`
      );
    }

    try {
      const { result, quotaExhausted: isQuota } = await callback(activeModel);
      if (isQuota) {
        markQuotaExhausted(activeModel);
        continue; // 다음 모델로 재시도
      }
      return result;
    } catch (err) {
      lastError = err as Error;
      // quota 외 에러는 전파 (재시도 안 함)
      throw err;
    }
  }

  throw lastError ?? new Error('Antigravity model fallback exhausted without success');
}

/**
 * 테스트/디버깅용 — 현재 quota 상태 dump.
 */
export function getQuotaState(): Record<string, string> {
  const state: Record<string, string> = {};
  for (const [model, until] of quotaExhausted) {
    state[model] = new Date(until).toISOString();
  }
  return state;
}
