// src/hooks/builtin/session-recovery.ts

/**
 * Session Recovery Hook
 *
 * Automatically recovers from API errors and session disruptions.
 * Implements retry strategies, state preservation, and graceful degradation.
 *
 * Features:
 * - API error detection and classification
 * - Automatic retry with exponential backoff
 * - Session state preservation
 * - Graceful degradation suggestions
 */

import {
  HookDefinition,
  HookResult,
  OnErrorContext,
  OnExpertResultContext,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { classifyErrorText, kindOf, type ErrorKind } from '../../utils/errors.js';

/**
 * Error classification
 */
type ErrorType =
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'server'
  | 'invalid_request'
  | 'context_overflow'
  | 'unknown';

/**
 * Recovery strategy
 */
interface RecoveryStrategy {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Delay before retry (ms) */
  retryDelay: number;
  /** Maximum retries */
  maxRetries: number;
  /** Fallback action */
  fallbackAction?: string;
  /** User message */
  userMessage: string;
}

/**
 * Configuration
 */
interface SessionRecoveryConfig {
  /** Enable automatic retry */
  autoRetry: boolean;
  /** Maximum consecutive errors before circuit break */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset time (ms) */
  circuitBreakerResetMs: number;
  /** Base retry delay (ms) */
  baseRetryDelayMs: number;
  /** Maximum retry delay (ms) */
  maxRetryDelayMs: number;
  /** Enable state preservation */
  preserveState: boolean;
}

const DEFAULT_CONFIG: SessionRecoveryConfig = {
  autoRetry: true,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  preserveState: true
};

let config: SessionRecoveryConfig = { ...DEFAULT_CONFIG };

/**
 * Session state
 */
interface SessionState {
  /** Consecutive error count */
  consecutiveErrors: number;
  /** Last error timestamp */
  lastErrorAt?: number;
  /** Circuit breaker active */
  circuitBreakerActive: boolean;
  /** Circuit breaker activated at */
  circuitBreakerActivatedAt?: number;
  /** Error history */
  errorHistory: Array<{
    type: ErrorType;
    message: string;
    timestamp: number;
    recovered: boolean;
  }>;
  /** Recovery attempts */
  recoveryAttempts: number;
  /** Successful recoveries */
  successfulRecoveries: number;
  /** Last successful operation */
  lastSuccessAt?: number;
}

let state: SessionState = {
  consecutiveErrors: 0,
  circuitBreakerActive: false,
  errorHistory: [],
  recoveryAttempts: 0,
  successfulRecoveries: 0
};

/**
 * ErrorKind(단일 분류) -> 이 모듈의 ErrorType.
 *
 * 자체 ERROR_PATTERNS 표(8종 x 5~7개 정규식)는 삭제했다. 특히 /auth/i 단독 패턴이
 * "authenticated"/"author"가 들어간 모든 문자열을 auth로 오분류했고,
 * 벌거벗은 /400/ /500/ 이 "14002ms" 같은 숫자에도 걸렸다.
 */
const KIND_TO_ERROR_TYPE: Record<ErrorKind, ErrorType> = {
  quota: 'rate_limit',
  timeout: 'timeout',
  network: 'network',
  auth: 'auth',
  // CLI argv 문제도 사용자가 손봐야 하는 종류라 auth와 같은 경로로 보낸다
  permission_denied: 'auth',
  server: 'server',
  bad_request: 'invalid_request',
  bad_model: 'invalid_request',
  context_overflow: 'context_overflow',
  unknown: 'unknown',
};

/**
 * Classifies an error
 */
function classifyError(error: string | Error): ErrorType {
  const kind = typeof error === 'string' ? classifyErrorText(error) : kindOf(error);
  return KIND_TO_ERROR_TYPE[kind];
}

/**
 * Gets recovery strategy for error type
 */
function getRecoveryStrategy(errorType: ErrorType, attemptCount: number): RecoveryStrategy {
  const delay = Math.min(
    config.baseRetryDelayMs * Math.pow(2, attemptCount),
    config.maxRetryDelayMs
  );

  switch (errorType) {
    case 'rate_limit':
      return {
        shouldRetry: attemptCount < 3,
        retryDelay: Math.max(delay, 5000), // At least 5 seconds
        maxRetries: 3,
        fallbackAction: 'use_fallback_expert',
        userMessage: '요청 제한에 도달했습니다. 잠시 후 재시도합니다.'
      };

    case 'timeout':
      return {
        shouldRetry: attemptCount < 2,
        retryDelay: delay,
        maxRetries: 2,
        fallbackAction: 'simplify_request',
        userMessage: '요청 시간이 초과되었습니다. 재시도 중...'
      };

    case 'network':
      return {
        shouldRetry: attemptCount < 3,
        retryDelay: delay,
        maxRetries: 3,
        userMessage: '네트워크 오류가 발생했습니다. 연결을 확인하고 재시도합니다.'
      };

    case 'auth':
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries: 0,
        fallbackAction: 'check_credentials',
        userMessage: '인증 오류입니다. API 키를 확인해주세요.'
      };

    case 'server':
      return {
        shouldRetry: attemptCount < 2,
        retryDelay: Math.max(delay, 3000),
        maxRetries: 2,
        fallbackAction: 'use_fallback_expert',
        userMessage: '서버 오류가 발생했습니다. 재시도 중...'
      };

    case 'invalid_request':
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries: 0,
        userMessage: '잘못된 요청입니다. 요청 형식을 확인해주세요.'
      };

    case 'context_overflow':
      return {
        shouldRetry: false,
        retryDelay: 0,
        maxRetries: 0,
        fallbackAction: 'truncate_context',
        userMessage: '컨텍스트 제한을 초과했습니다. 대화를 요약하거나 새 세션을 시작하세요.'
      };

    default:
      return {
        shouldRetry: attemptCount < 1,
        retryDelay: delay,
        maxRetries: 1,
        userMessage: '알 수 없는 오류가 발생했습니다.'
      };
  }
}

/**
 * Checks if circuit breaker should trip
 */
function checkCircuitBreaker(): boolean {
  // Check if should reset
  if (state.circuitBreakerActive && state.circuitBreakerActivatedAt) {
    if (Date.now() - state.circuitBreakerActivatedAt > config.circuitBreakerResetMs) {
      state.circuitBreakerActive = false;
      state.consecutiveErrors = 0;
      logger.info('[Session Recovery] Circuit breaker reset');
    }
  }

  // Check if should trip
  if (state.consecutiveErrors >= config.circuitBreakerThreshold) {
    if (!state.circuitBreakerActive) {
      state.circuitBreakerActive = true;
      state.circuitBreakerActivatedAt = Date.now();
      logger.warn({
        consecutiveErrors: state.consecutiveErrors,
        threshold: config.circuitBreakerThreshold
      }, '[Session Recovery] Circuit breaker activated');
    }
    return true;
  }

  return state.circuitBreakerActive;
}

/**
 * Records an error
 */
function recordError(type: ErrorType, message: string, recovered: boolean): void {
  state.consecutiveErrors++;
  state.lastErrorAt = Date.now();
  state.errorHistory.push({
    type,
    message: message.substring(0, 200),
    timestamp: Date.now(),
    recovered
  });

  // Limit history size
  if (state.errorHistory.length > 50) {
    state.errorHistory = state.errorHistory.slice(-50);
  }

  if (recovered) {
    state.recoveryAttempts++;
    state.successfulRecoveries++;
  }
}

/**
 * Records a success (resets consecutive errors)
 */
function recordSuccess(): void {
  state.consecutiveErrors = 0;
  state.lastSuccessAt = Date.now();
}

/**
 * Updates configuration
 */
export function updateSessionRecoveryConfig(newConfig: Partial<SessionRecoveryConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Gets session recovery statistics
 */
export function getSessionRecoveryStats(): {
  consecutiveErrors: number;
  circuitBreakerActive: boolean;
  errorHistory: SessionState['errorHistory'];
  recoveryAttempts: number;
  successfulRecoveries: number;
  recoveryRate: number;
} {
  return {
    consecutiveErrors: state.consecutiveErrors,
    circuitBreakerActive: state.circuitBreakerActive,
    errorHistory: [...state.errorHistory],
    recoveryAttempts: state.recoveryAttempts,
    successfulRecoveries: state.successfulRecoveries,
    recoveryRate: state.recoveryAttempts > 0
      ? state.successfulRecoveries / state.recoveryAttempts
      : 1
  };
}

/**
 * Resets session recovery state
 */
export function resetSessionRecoveryState(): void {
  state = {
    consecutiveErrors: 0,
    circuitBreakerActive: false,
    errorHistory: [],
    recoveryAttempts: 0,
    successfulRecoveries: 0
  };
}

/**
 * Hook: Handle errors with recovery logic
 */
const errorRecoveryHook: HookDefinition<OnErrorContext> = {
  id: 'builtin_session_recovery_error',
  name: 'Session Recovery (Error Handler)',
  description: 'Handles API errors with automatic recovery strategies',
  eventType: 'onError',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    const errorType = classifyError(context.errorMessage);
    const strategy = getRecoveryStrategy(errorType, state.consecutiveErrors);

    logger.info({
      errorType,
      source: context.source,
      shouldRetry: strategy.shouldRetry
    }, '[Session Recovery] Error classified');

    // Check circuit breaker
    if (checkCircuitBreaker()) {
      recordError(errorType, context.errorMessage.toString(), false);
      return {
        decision: 'block',
        reason: '연속 오류로 인해 일시적으로 요청이 차단되었습니다. 1분 후 다시 시도해주세요.',
        metadata: {
          circuitBreakerActive: true,
          consecutiveErrors: state.consecutiveErrors
        }
      };
    }

    // Build recovery message
    const lines: string[] = [
      `⚠️ **${strategy.userMessage}**`,
      '',
      `- 오류 유형: ${errorType}`,
      `- 연속 오류: ${state.consecutiveErrors + 1}회`
    ];

    if (strategy.shouldRetry && config.autoRetry) {
      lines.push(`- 재시도 대기: ${strategy.retryDelay / 1000}초`);
      recordError(errorType, context.errorMessage.toString(), true);
    } else {
      recordError(errorType, context.errorMessage.toString(), false);
    }

    if (strategy.fallbackAction) {
      lines.push('');
      switch (strategy.fallbackAction) {
        case 'use_fallback_expert':
          lines.push('💡 **권장**: 다른 전문가로 전환을 고려하세요.');
          break;
        case 'simplify_request':
          lines.push('💡 **권장**: 요청을 단순화하거나 분할하세요.');
          break;
        case 'truncate_context':
          lines.push('💡 **권장**: 컨텍스트를 정리하거나 새 세션을 시작하세요.');
          break;
        case 'check_credentials':
          lines.push('💡 **권장**: API 키와 인증 정보를 확인하세요.');
          break;
      }
    }

    return {
      decision: strategy.shouldRetry ? 'continue' : 'block',
      reason: strategy.shouldRetry ? undefined : strategy.userMessage,
      injectMessage: lines.join('\n'),
      metadata: {
        errorType,
        strategy,
        consecutiveErrors: state.consecutiveErrors
      }
    };
  }
};

/**
 * Hook: Track successful expert results (reset error count)
 */
const expertSuccessHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin_session_recovery_expert_success',
  name: 'Session Recovery (Expert Success)',
  description: 'Tracks successful expert calls to reset error state',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Only count as success if there's actual content
    if (context.response && context.response.length > 0) {
      recordSuccess();
    }
    return { decision: 'continue' };
  }
};

/**
 * Hook: Track successful tool results
 */
const toolSuccessHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_session_recovery_tool_success',
  name: 'Session Recovery (Tool Success)',
  description: 'Tracks successful tool calls to reset error state',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (context.success) {
      recordSuccess();
    }
    return { decision: 'continue' };
  }
};

/**
 * Registers all session recovery hooks
 */
export function registerSessionRecoveryHooks(): void {
  registerHook(errorRecoveryHook);
  registerHook(expertSuccessHook);
  registerHook(toolSuccessHook);

  logger.debug('Session Recovery hooks registered');
}

export default {
  registerSessionRecoveryHooks,
  updateSessionRecoveryConfig,
  getSessionRecoveryStats,
  resetSessionRecoveryState
};
