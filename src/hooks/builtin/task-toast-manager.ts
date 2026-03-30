// src/hooks/builtin/task-toast-manager.ts

/**
 * Task Toast Manager Hook
 *
 * Provides toast-like notifications for task status updates.
 * Creates non-intrusive visual feedback for async operations.
 *
 * Features:
 * - Task completion notifications
 * - Error notifications
 * - Progress updates
 * - Customizable toast formats
 */

import {
  HookDefinition,
  HookResult,
  OnToolResultContext,
  OnExpertResultContext,
  OnWorkflowEndContext,
  OnRalphLoopEndContext,
  OnErrorContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Toast type
 */
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'progress';

/**
 * Toast message
 */
interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Task toast manager configuration
 */
interface TaskToastManagerConfig {
  /** Whether toast notifications are enabled */
  enabled: boolean;
  /** Show success toasts */
  showSuccess: boolean;
  /** Show error toasts */
  showError: boolean;
  /** Show warning toasts */
  showWarning: boolean;
  /** Show info toasts */
  showInfo: boolean;
  /** Show progress toasts */
  showProgress: boolean;
  /** Toast format: 'minimal', 'standard', 'detailed' */
  format: 'minimal' | 'standard' | 'detailed';
  /** Max toasts to keep in history */
  maxHistory: number;
  /** Include timestamp in toast */
  includeTimestamp: boolean;
  /** Compact mode (single line) */
  compactMode: boolean;
}

/**
 * Task toast manager statistics
 */
interface TaskToastManagerStats {
  totalToasts: number;
  toastsByType: Record<ToastType, number>;
  lastToast?: ToastMessage;
}

// State
let config: TaskToastManagerConfig = {
  enabled: true,
  showSuccess: true,
  showError: true,
  showWarning: true,
  showInfo: true,
  showProgress: true,
  format: 'standard',
  maxHistory: 50,
  includeTimestamp: true,
  compactMode: false
};

let stats: TaskToastManagerStats = {
  totalToasts: 0,
  toastsByType: {
    success: 0,
    error: 0,
    warning: 0,
    info: 0,
    progress: 0
  }
};

const toastHistory: ToastMessage[] = [];
let toastCounter = 0;

/**
 * Gets emoji for toast type
 */
function getToastEmoji(type: ToastType): string {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    case 'progress': return '🔄';
  }
}

/**
 * Formats a toast message
 */
function formatToast(toast: ToastMessage): string {
  const emoji = getToastEmoji(toast.type);

  if (config.compactMode) {
    let line = `${emoji} **${toast.title}**`;
    if (toast.message) {
      line += `: ${toast.message}`;
    }
    return line;
  }

  let formatted = '';

  switch (config.format) {
    case 'minimal':
      formatted = `${emoji} ${toast.title}`;
      if (toast.message) {
        formatted += ` - ${toast.message}`;
      }
      break;

    case 'standard':
      formatted = `\n${emoji} **${toast.title}**`;
      if (toast.message) {
        formatted += `\n${toast.message}`;
      }
      if (config.includeTimestamp) {
        formatted += `\n_${new Date(toast.timestamp).toLocaleTimeString()}_`;
      }
      break;

    case 'detailed':
      formatted = `\n---\n${emoji} **${toast.title}**\n`;
      if (toast.message) {
        formatted += `\n${toast.message}\n`;
      }
      if (toast.metadata && Object.keys(toast.metadata).length > 0) {
        formatted += '\n| Key | Value |\n|-----|-------|\n';
        for (const [key, value] of Object.entries(toast.metadata)) {
          formatted += `| ${key} | ${String(value).substring(0, 50)} |\n`;
        }
      }
      if (config.includeTimestamp) {
        formatted += `\n_${new Date(toast.timestamp).toLocaleString()}_`;
      }
      formatted += '\n---\n';
      break;
  }

  return formatted;
}

/**
 * Creates a toast message
 */
function createToast(
  type: ToastType,
  title: string,
  message?: string,
  metadata?: Record<string, unknown>
): ToastMessage | null {
  // Check if this type is enabled
  const shouldShow = (type === 'success' && config.showSuccess) ||
    (type === 'error' && config.showError) ||
    (type === 'warning' && config.showWarning) ||
    (type === 'info' && config.showInfo) ||
    (type === 'progress' && config.showProgress);

  if (!shouldShow) {
    return null;
  }

  const toast: ToastMessage = {
    id: `toast_${++toastCounter}`,
    type,
    title,
    message,
    timestamp: Date.now(),
    metadata
  };

  toastHistory.push(toast);

  // Trim history
  while (toastHistory.length > config.maxHistory) {
    toastHistory.shift();
  }

  stats.totalToasts++;
  stats.toastsByType[type]++;
  stats.lastToast = toast;

  return toast;
}

/**
 * Hook: Toast on tool result
 */
const toastOnToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:task-toast-manager:tool-result',
  name: 'Task Toast (Tool Result)',
  description: 'Shows toast for significant tool results',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Only toast for certain tools
    const significantTools = [
      'background_expert_result',
      'design_with_experts',
      'review_code',
      'research_topic',
      'ensemble_query',
      'skill_execute',
      'interactive_bash_send'
    ];

    if (!significantTools.some(t => context.toolName.includes(t))) {
      return { decision: 'continue' };
    }

    const isError = !context.success;
    const toast = createToast(
      isError ? 'error' : 'success',
      isError ? `${context.toolName} Failed` : `${context.toolName} Complete`,
      context.error,
      { tool: context.toolName, durationMs: context.durationMs }
    );

    if (toast) {
      return {
        decision: 'continue',
        injectMessage: formatToast(toast),
        metadata: { toastId: toast.id }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Toast on expert result
 */
const toastOnExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:task-toast-manager:expert-result',
  name: 'Task Toast (Expert Result)',
  description: 'Shows toast when expert completes',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const expertNames: Record<string, string> = {
      strategist: 'Strategist',
      codereview: 'Code Reviewer',
      frontend: 'Frontend Expert'
    };

    const expertName = expertNames[context.expertId] || context.expertId;
    const isError = context.usedFallback && !context.response;

    const toast = createToast(
      isError ? 'warning' : 'info',
      isError ? `${expertName} Fallback Used` : `${expertName} Responded`,
      context.usedFallback ? `Fallback from ${context.originalExpert}` : undefined,
      {
        expert: context.expertId,
        durationMs: context.durationMs,
        fromCache: context.fromCache
      }
    );

    if (toast) {
      return {
        decision: 'continue',
        injectMessage: formatToast(toast),
        metadata: { toastId: toast.id }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Toast on workflow end
 */
const toastOnWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:task-toast-manager:workflow-end',
  name: 'Task Toast (Workflow End)',
  description: 'Shows toast when workflow completes',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const toast = createToast(
      context.success ? 'success' : 'error',
      context.success ? 'Workflow Complete' : 'Workflow Failed',
      context.escalated ? 'Escalated to user' : undefined,
      {
        success: context.success,
        durationMs: context.totalDurationMs,
        phasesExecuted: context.phasesExecuted.join(', ')
      }
    );

    if (toast) {
      return {
        decision: 'continue',
        injectMessage: formatToast(toast),
        metadata: { toastId: toast.id }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Toast on Ralph loop end
 */
const toastOnRalphLoopEndHook: HookDefinition<OnRalphLoopEndContext> = {
  id: 'builtin:task-toast-manager:ralph-loop-end',
  name: 'Task Toast (Ralph Loop End)',
  description: 'Shows toast when Ralph loop completes',
  eventType: 'onRalphLoopEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const toast = createToast(
      context.completed ? 'success' : 'warning',
      context.completed ? 'Ralph Loop Completed' : 'Ralph Loop Ended',
      `${context.iterations} iterations`,
      {
        completed: context.completed,
        iterations: context.iterations,
        maxIterationsReached: context.maxIterationsReached,
        cancelled: context.cancelled
      }
    );

    if (toast) {
      return {
        decision: 'continue',
        injectMessage: formatToast(toast),
        metadata: { toastId: toast.id }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Toast on error
 */
const toastOnErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:task-toast-manager:error',
  name: 'Task Toast (Error)',
  description: 'Shows toast when errors occur',
  eventType: 'onError',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const toast = createToast(
      'error',
      'Error Occurred',
      context.errorMessage?.substring(0, 200) || 'Unknown error',
      {
        source: context.source,
        code: context.errorCode,
        recoverable: context.recoverable
      }
    );

    if (toast) {
      return {
        decision: 'continue',
        injectMessage: formatToast(toast),
        metadata: { toastId: toast.id }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All task toast manager hooks
 */
export const taskToastManagerHooks = [
  toastOnToolResultHook,
  toastOnExpertResultHook,
  toastOnWorkflowEndHook,
  toastOnRalphLoopEndHook,
  toastOnErrorHook
] as HookDefinition[];

/**
 * Registers task toast manager hooks
 */
export function registerTaskToastManagerHooks(): void {
  for (const hook of taskToastManagerHooks) {
    registerHook(hook);
  }
  logger.debug('Task toast manager hooks registered');
}

/**
 * Gets task toast manager statistics
 */
export function getTaskToastManagerStats(): TaskToastManagerStats & {
  config: TaskToastManagerConfig;
  historyCount: number;
} {
  return {
    ...stats,
    config,
    historyCount: toastHistory.length
  };
}

/**
 * Resets task toast manager state
 */
export function resetTaskToastManagerState(): void {
  stats = {
    totalToasts: 0,
    toastsByType: {
      success: 0,
      error: 0,
      warning: 0,
      info: 0,
      progress: 0
    }
  };
  toastHistory.length = 0;
  toastCounter = 0;
}

/**
 * Updates task toast manager configuration
 */
export function updateTaskToastManagerConfig(updates: Partial<TaskToastManagerConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Task toast manager config updated');
}

/**
 * Gets toast history
 */
export function getToastHistory(): ToastMessage[] {
  return [...toastHistory];
}

/**
 * Manually creates a toast
 */
export function showToast(
  type: ToastType,
  title: string,
  message?: string,
  metadata?: Record<string, unknown>
): string | null {
  const toast = createToast(type, title, message, metadata);
  if (toast) {
    logger.debug({ toast }, 'Manual toast created');
    return formatToast(toast);
  }
  return null;
}

export default {
  registerTaskToastManagerHooks,
  getTaskToastManagerStats,
  resetTaskToastManagerState,
  updateTaskToastManagerConfig,
  getToastHistory,
  showToast
};
