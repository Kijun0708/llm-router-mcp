export type DashboardEventType =
  | 'expert_call_start'
  | 'expert_call_end'
  | 'expert_call_error'
  | 'rate_limit'
  | 'background_update'
  | 'state_snapshot'
  | 'workflow_start'
  | 'workflow_end';

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
  serverStartedAt: string;
  totalCalls: number;
  workflows: Record<string, WorkflowInfo>;
  sessions: Record<string, SessionInfo>;
}
