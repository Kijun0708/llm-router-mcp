// src/dashboard-server/types.ts

export type DashboardEventType =
  | 'expert_call_start'
  | 'expert_call_end'
  | 'expert_call_error'
  | 'rate_limit'
  | 'workflow_start'
  | 'workflow_end'
  | 'background_update'
  | 'state_snapshot';

export interface DashboardEvent {
  type: DashboardEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ActiveCall {
  id: string;
  expertId: string;
  model: string;
  provider: string;
  startedAt: string;
  promptPreview: string;
  status: 'running' | 'completed' | 'failed';
  workflowId?: string;
  parentCallId?: string;
  callPhase?: string;
  sessionId?: string;
}

export interface CallHistoryEntry {
  id: string;
  expertId: string;
  model: string;
  provider: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  fromCache: boolean;
  usedFallback: boolean;
  originalExpert?: string;
  success: boolean;
  responseLength: number;
  errorMessage?: string;
  workflowId?: string;
  parentCallId?: string;
  callPhase?: string;
  sessionId?: string;
}

export interface WorkflowInfo {
  workflowId: string;
  workflowType: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  childCallIds: string[];
}

export interface SessionInfo {
  sessionId: string;
  pid: number;
  startedAt: string;
  lastEventAt: string;
  totalCalls: number;
}

export interface ConcurrencyInfo {
  openai: { active: number; limit: number };
  google: { active: number; limit: number };
}

export interface DashboardState {
  activeCalls: Record<string, ActiveCall>;
  callHistory: CallHistoryEntry[];
  backgroundTasks: {
    running: number;
    pending: number;
    completed: number;
    failed: number;
  };
  rateLimits: Record<string, { limited: boolean; retryInMs?: number }>;
  cacheStats: { size: number; maxSize: number; hitRate: number };
  concurrency: ConcurrencyInfo;
  serverStartedAt: string;
  totalCalls: number;
  workflows: Record<string, WorkflowInfo>;
  sessions: Record<string, SessionInfo>;
}

const MAX_HISTORY = 200;

export function createInitialState(): DashboardState {
  return {
    activeCalls: {},
    callHistory: [],
    backgroundTasks: { running: 0, pending: 0, completed: 0, failed: 0 },
    rateLimits: {},
    cacheStats: { size: 0, maxSize: 100, hitRate: 0 },
    concurrency: { openai: { active: 0, limit: 5 }, google: { active: 0, limit: 10 } },
    serverStartedAt: new Date().toISOString(),
    totalCalls: 0,
    workflows: {},
    sessions: {},
  };
}

export function addToHistory(state: DashboardState, entry: CallHistoryEntry): void {
  state.callHistory.unshift(entry);
  if (state.callHistory.length > MAX_HISTORY) {
    state.callHistory.length = MAX_HISTORY;
  }
}
