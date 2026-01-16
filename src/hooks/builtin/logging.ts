// src/hooks/builtin/logging.ts

/**
 * Logging Hooks
 *
 * Built-in hooks for logging events to the console and log files.
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext,
  OnExpertCallContext,
  OnExpertResultContext,
  OnWorkflowStartContext,
  OnWorkflowEndContext,
  OnErrorContext,
  OnRateLimitContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Hook: Log tool calls
 */
const logToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin_log_tool_call',
  name: 'Log Tool Call',
  description: 'Logs tool calls for debugging and monitoring',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.debug({
      tool: context.toolName,
      inputKeys: Object.keys(context.toolInput),
      executionId: context.hookExecutionId
    }, '[Hook] Tool call');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log tool results
 */
const logToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_log_tool_result',
  name: 'Log Tool Result',
  description: 'Logs tool results for debugging and monitoring',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.debug({
      tool: context.toolName,
      success: context.success,
      durationMs: context.durationMs,
      error: context.error
    }, '[Hook] Tool result');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log expert calls
 */
const logExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_log_expert_call',
  name: 'Log Expert Call',
  description: 'Logs expert calls for debugging and monitoring',
  eventType: 'onExpertCall',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.info({
      expert: context.expertId,
      model: context.model,
      promptLength: context.prompt.length,
      skipCache: context.skipCache
    }, '[Hook] Expert call');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log expert results
 */
const logExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin_log_expert_result',
  name: 'Log Expert Result',
  description: 'Logs expert results for debugging and monitoring',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.info({
      expert: context.expertId,
      model: context.model,
      responseLength: context.responseLength,
      durationMs: context.durationMs,
      fromCache: context.fromCache,
      usedFallback: context.usedFallback,
      originalExpert: context.originalExpert
    }, '[Hook] Expert result');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log workflow start
 */
const logWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin_log_workflow_start',
  name: 'Log Workflow Start',
  description: 'Logs workflow start events',
  eventType: 'onWorkflowStart',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.info({
      requestLength: context.request.length,
      ralphLoopMode: context.ralphLoopMode,
      maxAttempts: context.maxAttempts
    }, '[Hook] Workflow started');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log workflow end
 */
const logWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin_log_workflow_end',
  name: 'Log Workflow End',
  description: 'Logs workflow end events',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.info({
      success: context.success,
      phases: context.phasesExecuted.join(' → '),
      durationMs: context.totalDurationMs,
      escalated: context.escalated
    }, '[Hook] Workflow ended');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log errors
 */
const logErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin_log_error',
  name: 'Log Error',
  description: 'Logs errors for debugging',
  eventType: 'onError',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.error({
      source: context.source,
      errorMessage: context.errorMessage,
      errorCode: context.errorCode,
      recoverable: context.recoverable
    }, '[Hook] Error occurred');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log rate limits
 */
const logRateLimitHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin_log_rate_limit',
  name: 'Log Rate Limit',
  description: 'Logs rate limit events',
  eventType: 'onRateLimit',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    logger.warn({
      provider: context.provider,
      model: context.model,
      expertId: context.expertId,
      retryAfterSeconds: context.retryAfterSeconds,
      fallbackAvailable: context.fallbackAvailable
    }, '[Hook] Rate limit hit');

    return { decision: 'continue' };
  }
};

/**
 * All logging hooks.
 */
export const loggingHooks = [
  logToolCallHook,
  logToolResultHook,
  logExpertCallHook,
  logExpertResultHook,
  logWorkflowStartHook,
  logWorkflowEndHook,
  logErrorHook,
  logRateLimitHook
] as HookDefinition[];

/**
 * Registers all logging hooks.
 */
export function registerLoggingHooks(): void {
  for (const hook of loggingHooks) {
    registerHook(hook);
  }
}
