// src/dashboard-server/event-collector.ts

import { v4 as uuidv4 } from 'uuid';
import { getHookManager } from '../hooks/manager.js';
import { DEFAULT_HOOK_RESULT } from '../hooks/types.js';
import type {
  HookDefinition,
  OnExpertCallContext,
  OnExpertResultContext,
  OnErrorContext,
  OnRateLimitContext,
} from '../hooks/types.js';
import { getRateLimitStatus } from '../utils/rate-limit.js';
import { getCacheStats } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { SESSION_ID } from '../session.js';
import { config } from '../config.js';
import {
  type DashboardState,
  type DashboardEvent,
  type ActiveCall,
  type CallHistoryEntry,
  type WorkflowInfo,
  createInitialState,
  addToHistory,
} from './types.js';
import { broadcast, sendSnapshot, onNewClient } from './ws-broadcaster.js';

let state: DashboardState = createInitialState();
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Dual-mode emit: Primary → broadcast, Sender → HTTP POST
let emitFn: (event: DashboardEvent) => void = broadcast;

export function setEmitFunction(fn: (event: DashboardEvent) => void): void {
  emitFn = fn;
}

function getProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('codex')) return 'openai';
  if (m.includes('gemini')) return 'google';
  return 'unknown';
}

function guessWorkflowType(workflowId: string): string {
  if (workflowId.startsWith('moderated_debate_') || workflowId.startsWith('debate_')) return 'moderated_debate';
  if (workflowId.startsWith('design_')) return 'design_with_experts';
  if (workflowId.startsWith('review_')) return 'review_code';
  if (workflowId.startsWith('research_')) return 'research_topic';
  if (workflowId.startsWith('ensemble_')) return 'ensemble_query';
  return 'unknown';
}

function emitEvent(event: DashboardEvent): void {
  emitFn(event);
}

function computeConcurrency(): { openai: { active: number; limit: number }; google: { active: number; limit: number } } {
  let openaiActive = 0;
  let googleActive = 0;
  for (const call of Object.values(state.activeCalls)) {
    const p = call.provider?.toLowerCase();
    if (p === 'openai') openaiActive++;
    else if (p === 'google') googleActive++;
  }
  return {
    openai: { active: openaiActive, limit: config.concurrency.byProvider.openai },
    google: { active: googleActive, limit: config.concurrency.byProvider.google },
  };
}

function updateSession(sessionId: string, timestamp: string): void {
  if (!sessionId) return;
  const existing = state.sessions[sessionId];
  if (existing) {
    existing.lastEventAt = timestamp;
    existing.totalCalls++;
  } else {
    state.sessions[sessionId] = {
      sessionId,
      pid: parseInt(sessionId.split('_')[1]) || 0,
      startedAt: timestamp,
      lastEventAt: timestamp,
      totalCalls: 1,
    };
  }
}

function updateWorkflow(workflowId: string | undefined, callId: string, sessionId: string | undefined, timestamp: string, workflowType?: string): void {
  if (!workflowId) return;
  const existing = state.workflows[workflowId];
  if (existing) {
    if (!existing.childCallIds.includes(callId)) {
      existing.childCallIds.push(callId);
    }
    // workflowType이 명시적으로 전달되면 업데이트 (guessed → explicit)
    if (workflowType && existing.workflowType === 'unknown') {
      existing.workflowType = workflowType;
    }
  } else {
    state.workflows[workflowId] = {
      workflowId,
      workflowType: workflowType || guessWorkflowType(workflowId),
      sessionId: sessionId || SESSION_ID,
      startedAt: timestamp,
      status: 'running',
      childCallIds: [callId],
    };
  }
}

function completeWorkflowIfDone(workflowId: string | undefined, timestamp: string): void {
  if (!workflowId) return;
  const wf = state.workflows[workflowId];
  if (!wf) return;

  // 모든 자식 호출이 activeCalls에서 사라졌으면 완료 처리
  const hasActiveChild = wf.childCallIds.some(id => state.activeCalls[id]);
  if (!hasActiveChild && wf.status === 'running') {
    // 아직 active call이 남아있을 수 있으므로, 잠시 후 다시 체크
    setTimeout(() => {
      const stillActive = wf.childCallIds.some(id => state.activeCalls[id]);
      if (!stillActive && wf.status === 'running') {
        wf.status = 'completed';
        wf.completedAt = new Date().toISOString();
        emitEvent({
          type: 'workflow_end',
          timestamp: wf.completedAt,
          data: { workflowId, status: 'completed' },
        });
      }
    }, 500);
  }
}

// ── Hook Definitions ──

const dashboardExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:dashboard-expert-call',
  name: 'Dashboard Expert Call Tracker',
  description: '전문가 호출 시작을 대시보드에 전송',
  eventType: 'onExpertCall',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    const sessionId = context.sessionId || SESSION_ID;
    const call: ActiveCall = {
      id: context.hookExecutionId,
      expertId: context.expertId,
      model: context.model,
      provider: getProvider(context.model),
      startedAt: context.timestamp,
      promptPreview: context.prompt.slice(0, 100),
      status: 'running',
      workflowId: context.workflowId,
      parentCallId: context.parentCallId,
      callPhase: context.callPhase,
      sessionId,
    };

    state.activeCalls[call.id] = call;
    state.totalCalls++;
    updateSession(sessionId, context.timestamp);
    updateWorkflow(context.workflowId, call.id, sessionId, context.timestamp, context.workflowType);

    emitEvent({
      type: 'expert_call_start',
      timestamp: context.timestamp,
      data: { ...call, workflowType: context.workflowType } as unknown as Record<string, unknown>,
    });

    return DEFAULT_HOOK_RESULT;
  },
};

const dashboardExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:dashboard-expert-result',
  name: 'Dashboard Expert Result Tracker',
  description: '전문가 응답을 대시보드에 전송',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    // ActiveCall에서 찾기 (hookExecutionId가 다를 수 있으므로 expertId + workflowId로 매칭)
    let callId: string | undefined;
    for (const [id, call] of Object.entries(state.activeCalls)) {
      if (call.expertId === context.expertId && call.status === 'running') {
        // workflowId가 있으면 같은 workflow의 호출만 매칭
        if (context.workflowId && call.workflowId !== context.workflowId) continue;
        callId = id;
        break;
      }
    }

    const activeCall = callId ? state.activeCalls[callId] : undefined;
    const sessionId = context.sessionId || activeCall?.sessionId || SESSION_ID;

    const historyEntry: CallHistoryEntry = {
      id: callId || uuidv4(),
      expertId: context.expertId,
      model: context.model,
      provider: getProvider(context.model),
      startedAt: activeCall?.startedAt || new Date(Date.now() - context.durationMs).toISOString(),
      completedAt: context.timestamp,
      durationMs: context.durationMs,
      fromCache: context.fromCache,
      usedFallback: context.usedFallback,
      originalExpert: context.originalExpert,
      success: true,
      responseLength: context.responseLength,
      workflowId: context.workflowId,
      parentCallId: context.parentCallId,
      callPhase: context.callPhase,
      sessionId,
    };

    addToHistory(state, historyEntry);

    if (callId) {
      delete state.activeCalls[callId];
    }

    updateSession(sessionId, context.timestamp);
    completeWorkflowIfDone(context.workflowId, context.timestamp);

    emitEvent({
      type: 'expert_call_end',
      timestamp: context.timestamp,
      data: historyEntry as unknown as Record<string, unknown>,
    });

    return DEFAULT_HOOK_RESULT;
  },
};

const dashboardErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:dashboard-error',
  name: 'Dashboard Error Tracker',
  description: '에러를 대시보드에 전송',
  eventType: 'onError',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    emitEvent({
      type: 'expert_call_error',
      timestamp: context.timestamp,
      data: {
        errorMessage: context.errorMessage,
        errorCode: context.errorCode,
        recoverable: context.recoverable,
        source: context.source,
      },
    });
    return DEFAULT_HOOK_RESULT;
  },
};

const dashboardRateLimitHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin:dashboard-rate-limit',
  name: 'Dashboard Rate Limit Tracker',
  description: 'Rate limit을 대시보드에 전송',
  eventType: 'onRateLimit',
  priority: 'low',
  enabled: true,
  handler: async (context) => {
    state.rateLimits[context.model] = {
      limited: true,
      retryInMs: undefined,
    };

    emitEvent({
      type: 'rate_limit',
      timestamp: context.timestamp,
      data: {
        model: context.model,
        provider: context.provider,
        expertId: context.expertId,
      },
    });
    return DEFAULT_HOOK_RESULT;
  },
};

const dashboardHooks = [
  dashboardExpertCallHook,
  dashboardExpertResultHook,
  dashboardErrorHook,
  dashboardRateLimitHook,
];

/**
 * 외부 MCP 인스턴스에서 POST로 받은 이벤트를 state에 주입 + broadcast
 */
export function injectExternalEvent(event: DashboardEvent): void {
  const data = event.data || {};

  switch (event.type) {
    case 'expert_call_start': {
      const call = data as unknown as ActiveCall;
      const workflowType = (data as Record<string, unknown>).workflowType as string | undefined;
      if (call.id) {
        state.activeCalls[call.id] = call;
        state.totalCalls++;
        if (call.sessionId) updateSession(call.sessionId, event.timestamp);
        if (call.workflowId) updateWorkflow(call.workflowId, call.id, call.sessionId, event.timestamp, workflowType);
      }
      break;
    }
    case 'expert_call_end': {
      const entry = data as unknown as CallHistoryEntry;
      if (entry.id) {
        addToHistory(state, entry);
        delete state.activeCalls[entry.id];
        if (entry.sessionId) updateSession(entry.sessionId, event.timestamp);
        if (entry.workflowId) completeWorkflowIfDone(entry.workflowId, event.timestamp);
      }
      break;
    }
    case 'rate_limit': {
      const model = data.model as string;
      if (model) {
        state.rateLimits[model] = { limited: true };
      }
      break;
    }
    case 'workflow_end': {
      const wfId = data.workflowId as string;
      if (wfId && state.workflows[wfId]) {
        state.workflows[wfId].status = (data.status as 'completed' | 'failed') || 'completed';
        state.workflows[wfId].completedAt = event.timestamp;
      }
      break;
    }
    case 'background_update': {
      // Sender의 background_update: rate limit/cache만 병합, broadcast 안 함
      // Primary의 자체 poll이 병합된 전체 상태를 broadcast
      const senderRL = data.rateLimits as Record<string, { limited: boolean; retryInMs?: number }> | undefined;
      if (senderRL) {
        for (const [model, status] of Object.entries(senderRL)) {
          if (status.limited) {
            state.rateLimits[model] = status;
          }
        }
      }
      return; // broadcast하지 않고 리턴
    }
  }

  // Primary가 받은 외부 이벤트를 WS 클라이언트들에게 broadcast
  broadcast(event);
}

/**
 * 대시보드 훅 등록 + 주기적 폴링 시작
 */
export function startEventCollector(): void {
  const hookManager = getHookManager();
  for (const hook of dashboardHooks) {
    hookManager.registerHook(hook as HookDefinition);
  }

  // 새 WS 클라이언트 접속 시 전체 상태 스냅샷 전송
  onNewClient((ws) => {
    sendSnapshot(ws, state);
  });

  // 2초 간격으로 배경 상태 폴링
  pollTimer = setInterval(() => {
    try {
      // Rate limit 상태 업데이트
      const rlStatus = getRateLimitStatus();
      state.rateLimits = {};
      for (const [model, status] of Object.entries(rlStatus)) {
        if (status.limited) {
          state.rateLimits[model] = status;
        }
      }

      // 캐시 상태 업데이트
      const cache = getCacheStats();
      state.cacheStats = {
        size: cache.size,
        maxSize: cache.maxSize,
        hitRate: (cache as Record<string, unknown>).hitRate as number ?? 0,
      };

      // Background task 상태는 import cycle 방지를 위해 동적 import
      import('../services/background-manager.js').then(({ getStats: getBgStats }) => {
        if (typeof getBgStats === 'function') {
          const stats = getBgStats();
          state.backgroundTasks = {
            running: stats.running,
            pending: stats.pending,
            completed: stats.completed,
            failed: stats.failed,
          };
        }
      }).catch(() => {});

      // 오래된 세션 정리 (5분 무활동)
      const now = Date.now();
      for (const [sid, session] of Object.entries(state.sessions)) {
        if (now - new Date(session.lastEventAt).getTime() > 300000) {
          delete state.sessions[sid];
        }
      }

      state.concurrency = computeConcurrency();

      emitEvent({
        type: 'background_update',
        timestamp: new Date().toISOString(),
        data: {
          rateLimits: state.rateLimits,
          cacheStats: state.cacheStats,
          backgroundTasks: state.backgroundTasks,
          concurrency: state.concurrency,
          totalCalls: state.totalCalls,
          activeCallCount: Object.keys(state.activeCalls).length,
          sessions: state.sessions,
          workflows: state.workflows,
        },
      });
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Dashboard poll error');
    }
  }, 2000);

  logger.info('Dashboard event collector started');
}

/**
 * Sender 모드용: 훅만 등록 (WS 없음, polling은 여전히 필요)
 */
export function startEventCollectorSenderMode(): void {
  const hookManager = getHookManager();
  for (const hook of dashboardHooks) {
    hookManager.registerHook(hook as HookDefinition);
  }

  // Sender 모드에서도 주기적으로 로컬 상태를 전송
  pollTimer = setInterval(() => {
    try {
      const rlStatus = getRateLimitStatus();
      const rateLimits: Record<string, { limited: boolean; retryInMs?: number }> = {};
      for (const [model, status] of Object.entries(rlStatus)) {
        if (status.limited) {
          rateLimits[model] = status;
        }
      }

      const cache = getCacheStats();
      const cacheStats = {
        size: cache.size,
        maxSize: cache.maxSize,
        hitRate: (cache as Record<string, unknown>).hitRate as number ?? 0,
      };

      emitEvent({
        type: 'background_update',
        timestamp: new Date().toISOString(),
        data: {
          rateLimits,
          cacheStats,
          backgroundTasks: state.backgroundTasks,
          concurrency: computeConcurrency(),
          totalCalls: state.totalCalls,
          activeCallCount: Object.keys(state.activeCalls).length,
          sessions: state.sessions,
          workflows: state.workflows,
        },
      });
    } catch {}
  }, 3000);

  logger.info('Dashboard event collector started (sender mode)');
}

export function stopEventCollector(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function getDashboardState(): DashboardState {
  return state;
}
