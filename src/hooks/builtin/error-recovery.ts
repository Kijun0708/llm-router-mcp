// src/hooks/builtin/error-recovery.ts

/**
 * Error Recovery Hooks
 *
 * Built-in hooks for handling and recovering from errors.
 */

import {
  HookDefinition,
  HookResult,
  OnErrorContext,
  OnToolResultContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Error tracking state.
 */
interface ErrorTrackingState {
  /** Recent errors by source */
  recentErrors: Map<string, Array<{ message: string; timestamp: number }>>;
  /** Total error count */
  totalErrors: number;
  /** Recovered error count */
  recoveredErrors: number;
}

/**
 * Global error tracking state.
 */
const errorState: ErrorTrackingState = {
  recentErrors: new Map(),
  totalErrors: 0,
  recoveredErrors: 0
};

/**
 * Records an error for tracking.
 */
function recordError(source: string, message: string): void {
  const now = Date.now();
  errorState.totalErrors++;

  if (!errorState.recentErrors.has(source)) {
    errorState.recentErrors.set(source, []);
  }

  const errors = errorState.recentErrors.get(source)!;
  errors.push({ message, timestamp: now });

  // Keep only last 10 errors per source
  if (errors.length > 10) {
    errors.shift();
  }

  // Clean up old errors (> 5 minutes)
  const cutoff = now - 5 * 60 * 1000;
  for (const [src, errs] of errorState.recentErrors.entries()) {
    const filtered = errs.filter(e => e.timestamp > cutoff);
    if (filtered.length === 0) {
      errorState.recentErrors.delete(src);
    } else {
      errorState.recentErrors.set(src, filtered);
    }
  }
}

/**
 * Gets recent error count for a source.
 */
function getRecentErrorCount(source: string): number {
  const errors = errorState.recentErrors.get(source);
  if (!errors) return 0;

  const cutoff = Date.now() - 5 * 60 * 1000;
  return errors.filter(e => e.timestamp > cutoff).length;
}

/**
 * Suggests recovery actions based on error type.
 */
function suggestRecoveryAction(errorMessage: string, source: string): string[] {
  const suggestions: string[] = [];
  const lowerError = errorMessage.toLowerCase();

  // Network errors
  if (lowerError.includes('network') || lowerError.includes('fetch') ||
      lowerError.includes('connection') || lowerError.includes('timeout')) {
    suggestions.push('Check network connectivity');
    suggestions.push('CLIProxyAPI may need restart');
    suggestions.push('Try again after a brief delay');
  }

  // Rate limit errors
  if (lowerError.includes('rate') || lowerError.includes('429') ||
      lowerError.includes('too many')) {
    suggestions.push('Wait before retrying');
    suggestions.push('Use a different expert/model');
    suggestions.push('Check rate limit status with llm_router_health');
  }

  // Authentication errors
  if (lowerError.includes('auth') || lowerError.includes('401') ||
      lowerError.includes('403') || lowerError.includes('unauthorized')) {
    suggestions.push('Check authentication with auth_status');
    suggestions.push('Re-authenticate using auth_gpt/auth_claude/auth_gemini');
  }

  // Context/token errors
  if (lowerError.includes('context') || lowerError.includes('token') ||
      lowerError.includes('too long') || lowerError.includes('max length')) {
    suggestions.push('Reduce input/prompt length');
    suggestions.push('Split the task into smaller parts');
  }

  // Tool-specific errors
  if (source.includes('tool')) {
    suggestions.push('Verify tool parameters are correct');
    suggestions.push('Try a simpler version of the request');
  }

  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push('Try again with a simpler request');
    suggestions.push('Check llm_router_health for system status');
  }

  return suggestions;
}

/**
 * Hook: Track and analyze errors
 */
const trackErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin_track_error',
  name: 'Track Error',
  description: 'Tracks errors for pattern detection and recovery suggestions',
  eventType: 'onError',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    recordError(context.source, context.errorMessage);

    const recentCount = getRecentErrorCount(context.source);
    const suggestions = suggestRecoveryAction(context.errorMessage, context.source);

    logger.info({
      source: context.source,
      errorCode: context.errorCode,
      recentErrorCount: recentCount,
      recoverable: context.recoverable
    }, '[Hook] Error tracked');

    // If too many recent errors from same source, provide warning
    if (recentCount >= 3) {
      return {
        decision: 'continue',
        injectMessage: `⚠️ Multiple errors from ${context.source} (${recentCount} in last 5 minutes).

**Suggestions:**
${suggestions.map(s => `- ${s}`).join('\n')}`,
        metadata: {
          recentErrorCount: recentCount,
          suggestions
        }
      };
    }

    return {
      decision: 'continue',
      metadata: {
        suggestions,
        recentErrorCount: recentCount
      }
    };
  }
};

/**
 * Hook: Detect recoverable errors in tool results
 */
const toolErrorRecoveryHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_tool_error_recovery',
  name: 'Tool Error Recovery',
  description: 'Detects and suggests recovery for tool errors',
  eventType: 'onToolResult',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (context.success) {
      return { decision: 'continue' };
    }

    const errorMessage = context.error || 'Unknown error';
    recordError(`tool:${context.toolName}`, errorMessage);

    const suggestions = suggestRecoveryAction(errorMessage, `tool:${context.toolName}`);

    // Check if this is a recurring error
    const recentCount = getRecentErrorCount(`tool:${context.toolName}`);

    if (recentCount >= 2) {
      logger.warn({
        tool: context.toolName,
        error: errorMessage,
        recentCount
      }, '[Hook] Recurring tool error detected');

      return {
        decision: 'continue',
        injectMessage: `⚠️ Tool "${context.toolName}" has failed ${recentCount} times recently.

**Error:** ${errorMessage}

**Recovery suggestions:**
${suggestions.map(s => `- ${s}`).join('\n')}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Detect issues in expert results
 */
const expertResultRecoveryHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin_expert_result_recovery',
  name: 'Expert Result Recovery',
  description: 'Detects potential issues in expert responses',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Check for very short responses (might indicate an issue)
    if (context.responseLength < 50 && !context.fromCache) {
      logger.debug({
        expert: context.expertId,
        responseLength: context.responseLength
      }, '[Hook] Unusually short expert response');

      return {
        decision: 'continue',
        metadata: {
          warning: 'short_response',
          responseLength: context.responseLength
        }
      };
    }

    // Check for fallback usage pattern
    if (context.usedFallback) {
      const originalExpert = context.originalExpert || 'unknown';

      return {
        decision: 'continue',
        injectMessage: `ℹ️ Response from fallback expert ${context.expertId} (original: ${originalExpert}).`,
        metadata: {
          fallbackUsed: true,
          originalExpert
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Gets error tracking statistics.
 */
export function getErrorStats(): {
  totalErrors: number;
  recoveredErrors: number;
  recentErrorsBySource: Record<string, number>;
} {
  const recentBySource: Record<string, number> = {};
  const cutoff = Date.now() - 5 * 60 * 1000;

  for (const [source, errors] of errorState.recentErrors.entries()) {
    const recent = errors.filter(e => e.timestamp > cutoff);
    if (recent.length > 0) {
      recentBySource[source] = recent.length;
    }
  }

  return {
    totalErrors: errorState.totalErrors,
    recoveredErrors: errorState.recoveredErrors,
    recentErrorsBySource: recentBySource
  };
}

/**
 * Clears error tracking state.
 */
export function clearErrorState(): void {
  errorState.recentErrors.clear();
  errorState.totalErrors = 0;
  errorState.recoveredErrors = 0;
}

/**
 * All error recovery hooks.
 */
export const errorRecoveryHooks = [
  trackErrorHook,
  toolErrorRecoveryHook,
  expertResultRecoveryHook
] as HookDefinition[];

/**
 * Registers all error recovery hooks.
 */
export function registerErrorRecoveryHooks(): void {
  for (const hook of errorRecoveryHooks) {
    registerHook(hook);
  }
}
