// src/services/providers/antigravity-model-manager.ts
//
// Antigravity 모델 자동 fallback 관리.
//
// agy 1.0.x는 settings.json `model` 필드 하나로만 모델을 결정 (--model argv 미지원,
// [Issue #35](https://github.com/google-antigravity/antigravity-cli/issues/35)).
// 한 모델이 quota 소진(429 RESOURCE_EXHAUSTED)되면 다음 모델로 자동 스위칭하는 우회.
//
// 동작:
//  1. 우선순위 리스트(ANTIGRAVITY_MODEL_PRIORITY)에서 quota 차단되지 않은 첫 번째 모델 선택
//  2. settings.json model 필드 업데이트 (필요 시)
//  3. spawn 후 agy 로그에서 quota 에러 감지 → 해당 모델 차단 (1h30m)
//  4. 동시 호출은 mutex로 직렬화 (settings.json race 방지)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { logger } from '../../utils/logger.js';

const SETTINGS_PATH = join(homedir(), '.gemini', 'antigravity-cli', 'settings.json');

const DEFAULT_PRIORITY = [
  'Claude Opus 4.6 (Thinking)',
  'Gemini 3.1 Pro (High)',
];

// 1시간 30분 — agy quota reset 주기 관찰값
const QUOTA_BLOCK_MS = 90 * 60 * 1000;

// 모듈 레벨 상태
const quotaExhausted = new Map<string, number>(); // modelName → unblock timestamp
let mutexChain: Promise<unknown> = Promise.resolve();

interface SettingsJson {
  model?: string;
  trustedWorkspaces?: string[];
  colorScheme?: string;
  [key: string]: unknown;
}

function getModelPriority(): string[] {
  const env = process.env.ANTIGRAVITY_MODEL_PRIORITY;
  if (!env) return DEFAULT_PRIORITY;
  const parsed = env.split(',').map(s => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_PRIORITY;
}

function readSettings(): SettingsJson {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: SettingsJson): void {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
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
 * settings.json model을 활성 모델로 보장 + mutex 직렬화된 호출 콜백 실행.
 *
 * 호출자는 callback 안에서 spawn agy. callback이 quota 에러를 감지하면
 * shouldRetry=true 반환하여 다음 모델로 재시도.
 */
export async function withAntigravityModel<T>(
  callback: (activeModel: string) => Promise<{ result: T; quotaExhausted: boolean }>
): Promise<T> {
  // 모듈 레벨 mutex — 동시 호출 직렬화
  let release: () => void;
  const localLock = new Promise<void>((resolve) => { release = resolve; });
  const prev = mutexChain;
  mutexChain = mutexChain.then(() => localLock);
  await prev;

  try {
    const priority = getModelPriority();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < priority.length; attempt++) {
      const activeModel = pickAvailableModel();
      if (!activeModel) {
        throw new Error(
          `All Antigravity models in priority [${priority.join(', ')}] are quota-exhausted. ` +
          `Earliest unblock: ${Math.min(...quotaExhausted.values()) ? new Date(Math.min(...quotaExhausted.values())).toISOString() : 'unknown'}`
        );
      }

      // settings.json model 동기화 (필요시)
      const settings = readSettings();
      if (settings.model !== activeModel) {
        const prevModel = settings.model;
        settings.model = activeModel;
        writeSettings(settings);
        logger.info({
          prevModel,
          newModel: activeModel,
          reason: 'priority/quota switch',
        }, 'Antigravity settings.json model updated');
      }

      try {
        const { result, quotaExhausted: isQuota } = await callback(activeModel);
        if (isQuota) {
          markQuotaExhausted(activeModel);
          // 다음 모델로 재시도
          continue;
        }
        return result;
      } catch (err) {
        lastError = err as Error;
        // quota 외 에러는 전파 (재시도 안 함)
        throw err;
      }
    }

    throw lastError ?? new Error('Antigravity model fallback exhausted without success');
  } finally {
    release!();
  }
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
