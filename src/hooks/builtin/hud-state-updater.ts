// src/hooks/builtin/hud-state-updater.ts

/**
 * HUD State Updater Hook
 *
 * 각종 이벤트를 감지하여 HUD 상태를 실시간 업데이트합니다.
 * - Expert 호출/결과 → 프로바이더 카운트, 마지막 전문가
 * - Workflow 시작/종료 → 워크플로우 상태
 * - Ralph Loop 시작/종료 → 루프 상태
 * - Error/RateLimit → 에러 카운트, 제한 모델 목록
 */

import { logger } from '../../utils/logger.js';
import { getHudStateWriter } from '../../hud/index.js';
import { getCostTracker } from '../../features/cost-tracking/index.js';
import type {
  HookDefinition,
  OnExpertResultContext,
  OnExpertCallContext,
  OnWorkflowStartContext,
  OnWorkflowEndContext,
  OnRalphLoopStartContext,
  OnRalphLoopEndContext,
  OnErrorContext,
  OnRateLimitContext,
  OnToolResultContext
} from '../types.js';
import { DEFAULT_HOOK_RESULT } from '../types.js';
import { getHookManager } from '../manager.js';
import { billingProviderOf } from '../../services/providers/index.js';

type ProviderKey = 'openai' | 'anthropic' | 'google';

/**
 * 모델 ID에서 Provider 추출
 */
function getProvider(model: string): ProviderKey {
  return billingProviderOf(model) as ProviderKey;
}

/**
 * 비용 정보 동기화
 */
function syncCostInfo(): void {
  try {
    const tracker = getCostTracker();
    if (!tracker.isEnabled()) return;

    const sessionStats = tracker.getSessionStats();
    const allStats = tracker.getStats();

    // 오늘 비용: 일별 요약에서 조회
    const dailySummaries = tracker.getDailySummaries(1);
    const todayCost = dailySummaries.length > 0 ? dailySummaries[0].totalCost : 0;

    getHudStateWriter().updateCost(
      sessionStats.totalCost,
      todayCost
    );

    // 캐시 히트율 계산
    const total = allStats.totalCalls;
    if (total > 0) {
      const cacheRate = Math.round((allStats.cachedCalls / total) * 100);
      getHudStateWriter().updateCacheHitRate(cacheRate);
    }
  } catch {
    // cost tracker 미초기화 시 무시
  }
}

// ── Hook Definitions ──

/**
 * Expert 호출 시 HUD 업데이트
 */
const hudExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:hud-expert-call',
  name: 'HUD Expert Call Updater',
  description: 'Expert 호출 시 HUD 상태 업데이트',
  eventType: 'onExpertCall',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    const writer = getHudStateWriter();
    const provider = getProvider(context.model);
    writer.recordExpertCall(context.expertId, context.model, provider);
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Expert 결과 수신 시 비용 동기화
 */
const hudExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:hud-expert-result',
  name: 'HUD Expert Result Updater',
  description: 'Expert 결과 수신 시 비용 정보 동기화',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,
  handler: async () => {
    syncCostInfo();
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Workflow 시작 시 HUD 업데이트
 */
const hudWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:hud-workflow-start',
  name: 'HUD Workflow Start',
  description: 'Workflow 시작 시 HUD 상태 업데이트',
  eventType: 'onWorkflowStart',
  priority: 'low',
  enabled: true,
  handler: async () => {
    getHudStateWriter().updateWorkflowState(true);
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Workflow 종료 시 HUD 업데이트
 */
const hudWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:hud-workflow-end',
  name: 'HUD Workflow End',
  description: 'Workflow 종료 시 HUD 상태 업데이트',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,
  handler: async () => {
    getHudStateWriter().updateWorkflowState(false);
    syncCostInfo();
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Ralph Loop 시작 시 HUD 업데이트
 */
const hudRalphLoopStartHook: HookDefinition<OnRalphLoopStartContext> = {
  id: 'builtin:hud-ralph-start',
  name: 'HUD Ralph Loop Start',
  description: 'Ralph Loop 시작 시 HUD 상태 업데이트',
  eventType: 'onRalphLoopStart',
  priority: 'low',
  enabled: true,
  handler: async () => {
    getHudStateWriter().updateRalphLoopState(true);
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Ralph Loop 종료 시 HUD 업데이트
 */
const hudRalphLoopEndHook: HookDefinition<OnRalphLoopEndContext> = {
  id: 'builtin:hud-ralph-end',
  name: 'HUD Ralph Loop End',
  description: 'Ralph Loop 종료 시 HUD 상태 업데이트',
  eventType: 'onRalphLoopEnd',
  priority: 'low',
  enabled: true,
  handler: async () => {
    getHudStateWriter().updateRalphLoopState(false);
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * 에러 발생 시 HUD 업데이트
 */
const hudErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:hud-error',
  name: 'HUD Error Counter',
  description: '에러 발생 시 HUD 에러 카운트 증가',
  eventType: 'onError',
  priority: 'low',
  enabled: true,
  handler: async () => {
    getHudStateWriter().incrementErrors();
    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Rate Limit 발생 시 HUD 업데이트
 */
const hudRateLimitHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin:hud-rate-limit',
  name: 'HUD Rate Limit Tracker',
  description: 'Rate limit 발생 시 제한 모델 목록 업데이트',
  eventType: 'onRateLimit',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    const writer = getHudStateWriter();
    const currentState = writer.getState();
    const models = new Set(currentState.rateLimitedModels);
    models.add(context.model);
    writer.updateRateLimitedModels(Array.from(models));
    return DEFAULT_HOOK_RESULT;
  }
};

// ── 모든 HUD Hooks ──

export const hudStateUpdaterHooks = [
  hudExpertCallHook,
  hudExpertResultHook,
  hudWorkflowStartHook,
  hudWorkflowEndHook,
  hudRalphLoopStartHook,
  hudRalphLoopEndHook,
  hudErrorHook,
  hudRateLimitHook
];

/**
 * 모든 HUD hooks 등록
 */
export function registerHudStateUpdaterHooks(): void {
  const hookManager = getHookManager();
  for (const hook of hudStateUpdaterHooks) {
    hookManager.registerHook(hook as HookDefinition);
  }
  logger.info('HUD state updater hooks registered');
}

/**
 * HUD 상태 통계 반환
 */
export function getHudStats(): { stateFile: string; state: Record<string, unknown> } {
  const writer = getHudStateWriter();
  return {
    stateFile: '~/.custommcp/hud-state.json',
    state: writer.getState() as unknown as Record<string, unknown>
  };
}
