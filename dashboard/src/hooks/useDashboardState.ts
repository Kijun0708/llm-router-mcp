import { useReducer, useEffect } from 'react';
import type { DashboardState, DashboardEvent, ActiveCall, CallHistoryEntry, WorkflowInfo } from '../types';

const MAX_HISTORY = 200;

const initialState: DashboardState = {
  activeCalls: {},
  callHistory: [],
  backgroundTasks: { running: 0, pending: 0, completed: 0, failed: 0 },
  rateLimits: {},
  cacheStats: { size: 0, maxSize: 100, hitRate: 0 },
  serverStartedAt: new Date().toISOString(),
  totalCalls: 0,
  workflows: {},
  sessions: {},
};

function reducer(state: DashboardState, event: DashboardEvent): DashboardState {
  switch (event.type) {
    case 'state_snapshot':
      return event.data as unknown as DashboardState;

    case 'expert_call_start': {
      const call = event.data as unknown as ActiveCall;
      let workflows = state.workflows;
      if (call.workflowId && workflows[call.workflowId]) {
        const wf = workflows[call.workflowId];
        workflows = {
          ...workflows,
          [call.workflowId]: {
            ...wf,
            childCallIds: [...wf.childCallIds, call.id],
          },
        };
      }
      return {
        ...state,
        activeCalls: { ...state.activeCalls, [call.id]: call },
        totalCalls: state.totalCalls + 1,
        workflows,
      };
    }

    case 'expert_call_end': {
      const entry = event.data as unknown as CallHistoryEntry;
      const { [entry.id]: _, ...remainingCalls } = state.activeCalls;
      const newHistory = [entry, ...state.callHistory].slice(0, MAX_HISTORY);
      let workflows = state.workflows;
      if (entry.workflowId && workflows[entry.workflowId]) {
        const wf = workflows[entry.workflowId];
        const allChildIds = wf.childCallIds;
        const allDone = allChildIds.every((cid) => {
          if (cid === entry.id) return true;
          return !remainingCalls[cid];
        });
        if (allDone && wf.status === 'running') {
          workflows = {
            ...workflows,
            [entry.workflowId]: {
              ...wf,
              status: entry.success ? 'completed' : 'failed',
              completedAt: entry.completedAt,
            },
          };
        }
      }
      return {
        ...state,
        activeCalls: remainingCalls,
        callHistory: newHistory,
        workflows,
      };
    }

    case 'rate_limit': {
      const model = event.data.model as string;
      return {
        ...state,
        rateLimits: {
          ...state.rateLimits,
          [model]: { limited: true },
        },
      };
    }

    case 'background_update':
      return {
        ...state,
        rateLimits: (event.data.rateLimits as DashboardState['rateLimits']) || state.rateLimits,
        cacheStats: (event.data.cacheStats as DashboardState['cacheStats']) || state.cacheStats,
        backgroundTasks: (event.data.backgroundTasks as DashboardState['backgroundTasks']) || state.backgroundTasks,
        totalCalls: (event.data.totalCalls as number) || state.totalCalls,
        sessions: (event.data.sessions as DashboardState['sessions']) || state.sessions,
        workflows: (event.data.workflows as DashboardState['workflows']) || state.workflows,
      };

    case 'workflow_start': {
      const wf = event.data as unknown as WorkflowInfo;
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [wf.workflowId]: wf,
        },
      };
    }

    case 'workflow_end': {
      const wfData = event.data as unknown as WorkflowInfo;
      const existing = state.workflows[wfData.workflowId];
      return {
        ...state,
        workflows: {
          ...state.workflows,
          [wfData.workflowId]: {
            ...(existing || wfData),
            status: wfData.status,
            completedAt: wfData.completedAt,
          },
        },
      };
    }

    default:
      return state;
  }
}

export function useDashboardState(lastEvent: DashboardEvent | null) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (lastEvent) dispatch(lastEvent);
  }, [lastEvent]);

  return state;
}
