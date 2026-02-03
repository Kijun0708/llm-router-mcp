// src/services/expert-router.ts

import { ExpertResponse } from '../types.js';
import { experts, FALLBACK_CHAIN } from '../experts/index.js';
import { callExpert, RateLimitExceededError, ExpertCallError } from './cliproxy-client.js';
import { callExpertWithTools } from './expert-with-tools.js';
import { logger } from '../utils/logger.js';
import { executeHooks } from '../hooks/index.js';
import { wrapWithPreamble, hasPreamble } from '../utils/worker-preamble.js';

// ============================================================================
// Error Classification for Fallback Decision
// ============================================================================

/**
 * 폴백을 시도해야 하는 에러인지 판단
 * - Rate Limit: 폴백 시도
 * - Timeout: 폴백 시도
 * - 5xx 서버 에러: 폴백 시도
 * - 인증 에러 (401, 403): 즉시 throw (폴백 무의미)
 * - 잘못된 요청 (400): 즉시 throw (폴백 무의미)
 */
function shouldAttemptFallback(error: Error): { shouldFallback: boolean; reason: string } {
  // Rate Limit 에러는 항상 폴백
  if (error instanceof RateLimitExceededError) {
    return { shouldFallback: true, reason: 'rate_limit' };
  }

  const message = error.message.toLowerCase();

  // Timeout 에러: 폴백 시도
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
    return { shouldFallback: true, reason: 'timeout' };
  }

  // 5xx 서버 에러: 폴백 시도
  if (message.includes('500') || message.includes('502') || message.includes('503') ||
      message.includes('504') || message.includes('server error') || message.includes('internal error')) {
    return { shouldFallback: true, reason: 'server_error' };
  }

  // 과부하: 폴백 시도
  if (message.includes('overloaded') || message.includes('capacity') || message.includes('unavailable')) {
    return { shouldFallback: true, reason: 'overloaded' };
  }

  // 인증 에러: 폴백 무의미 (즉시 throw)
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized') ||
      message.includes('forbidden') || message.includes('authentication') || message.includes('api key')) {
    return { shouldFallback: false, reason: 'auth_error' };
  }

  // 잘못된 요청: 폴백 무의미 (즉시 throw)
  if (message.includes('400') || message.includes('bad request') || message.includes('invalid')) {
    return { shouldFallback: false, reason: 'bad_request' };
  }

  // 기타 에러: 기본적으로 폴백 시도
  return { shouldFallback: true, reason: 'unknown' };
}

/**
 * 폴백 시도 결과 기록
 */
interface FallbackAttempt {
  expertId: string;
  error: Error;
  reason: string;
  timestamp: number;
}

/**
 * 폴백 에러 상세 로깅
 */
function logFallbackError(
  originalExpertId: string,
  fallbackId: string,
  error: Error,
  attemptNumber: number,
  totalFallbacks: number
): void {
  const { reason } = shouldAttemptFallback(error);

  logger.warn({
    originalExpert: originalExpertId,
    fallbackExpert: fallbackId,
    attemptNumber,
    totalFallbacks,
    errorType: reason,
    errorMessage: error.message,
    errorName: error.name,
    stack: error.stack?.split('\n').slice(0, 3).join('\n') // 스택 상위 3줄만
  }, `Fallback attempt ${attemptNumber}/${totalFallbacks} failed`);
}

export async function callExpertWithFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  imagePath?: string,
  applyPreamble: boolean = false
): Promise<ExpertResponse> {
  const expert = experts[expertId];

  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }

  const startTime = Date.now();

  // Execute onExpertCall hooks
  const preHookResult = await executeHooks('onExpertCall', {
    expertId,
    model: expert.model,
    prompt,
    context,
    skipCache
  });

  // Check if hooks blocked the call
  if (preHookResult.decision === 'block') {
    throw new Error(`Expert call blocked by hook: ${preHookResult.reason || 'No reason provided'}`);
  }

  // Apply any injected context from hooks
  const finalContext = preHookResult.injectMessage
    ? (context ? `${context}\n\n${preHookResult.injectMessage}` : preHookResult.injectMessage)
    : context;

  // Worker Preamble 적용 (orchestrate 모드에서만)
  const finalPrompt = (applyPreamble && !hasPreamble(prompt))
    ? wrapWithPreamble(prompt)
    : prompt;

  try {
    const result = await callExpert(expert, finalPrompt, { context: finalContext, skipCache, imagePath });
    const durationMs = Date.now() - startTime;

    // Execute onExpertResult hooks
    await executeHooks('onExpertResult', {
      expertId,
      model: expert.model,
      response: result.response,
      responseLength: result.response.length,
      durationMs,
      fromCache: result.cached || false,
      usedFallback: false
    });

    return result;
  } catch (error) {
    // Rate Limit이 아닌 에러는 그대로 throw
    if (!(error instanceof RateLimitExceededError)) {
      // Execute onError hook for non-rate-limit errors
      await executeHooks('onError', {
        errorMessage: (error as Error).message,
        source: `expert:${expertId}`,
        recoverable: false
      });
      throw error;
    }

    // Execute onRateLimit hook
    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    await executeHooks('onRateLimit', {
      provider: getProviderFromModel(expert.model),
      model: expert.model,
      expertId,
      fallbackAvailable: fallbacks.length > 0
    });

    logger.warn({ expertId, error: error.message }, 'Primary expert failed, trying fallbacks');

    // 폴백 시도 기록
    const fallbackAttempts: FallbackAttempt[] = [{
      expertId,
      error,
      reason: shouldAttemptFallback(error).reason,
      timestamp: Date.now()
    }];

    // 폴백 체인 시도
    for (let i = 0; i < fallbacks.length; i++) {
      const fallbackId = fallbacks[i];
      const fallbackExpert = experts[fallbackId];

      if (!fallbackExpert) {
        logger.error({ fallbackId }, 'Fallback expert not found in registry');
        continue;
      }

      try {
        logger.info({
          from: expertId,
          to: fallbackId,
          attemptNumber: i + 1,
          totalFallbacks: fallbacks.length,
          model: fallbackExpert.model
        }, 'Attempting fallback');

        // 폴백 전문가에 대한 훅 실행
        const fallbackPreHookResult = await executeHooks('onExpertCall', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          prompt: finalPrompt,
          context: finalContext,
          skipCache,
          isFallback: true,
          originalExpert: expertId
        });

        if (fallbackPreHookResult.decision === 'block') {
          logger.warn({ fallbackId, reason: fallbackPreHookResult.reason }, 'Fallback blocked by hook');
          continue;
        }

        const fallbackStartTime = Date.now();
        const result = await callExpert(fallbackExpert, finalPrompt, { context: finalContext, skipCache, imagePath });
        const fallbackDurationMs = Date.now() - fallbackStartTime;

        logger.info({
          fallbackId,
          durationMs: fallbackDurationMs,
          attemptNumber: i + 1
        }, 'Fallback succeeded');

        // Execute onExpertResult hooks for fallback
        await executeHooks('onExpertResult', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          response: result.response,
          responseLength: result.response.length,
          durationMs: fallbackDurationMs,
          fromCache: result.cached || false,
          usedFallback: true,
          originalExpert: expertId,
          fallbackAttempts: fallbackAttempts.length
        });

        return {
          ...result,
          fellBack: true,
          actualExpert: fallbackId
        };
      } catch (fallbackError) {
        const fbError = fallbackError as Error;
        const { shouldFallback, reason } = shouldAttemptFallback(fbError);

        // 에러 기록
        fallbackAttempts.push({
          expertId: fallbackId,
          error: fbError,
          reason,
          timestamp: Date.now()
        });

        // 상세 로깅
        logFallbackError(expertId, fallbackId, fbError, i + 1, fallbacks.length);

        // 치명적 에러는 즉시 throw (폴백 무의미)
        if (!shouldFallback) {
          logger.error({
            fallbackId,
            errorType: reason,
            message: fbError.message
          }, 'Fatal error during fallback, stopping fallback chain');

          await executeHooks('onError', {
            errorMessage: fbError.message,
            source: `expert:${fallbackId}`,
            recoverable: false,
            errorType: reason
          });

          throw fbError;
        }

        // 폴백 가능한 에러는 다음 폴백 시도
        continue;
      }
    }

    // 모든 폴백 실패 - 상세 에러 정보 포함
    const attemptSummary = fallbackAttempts.map(a =>
      `${a.expertId} (${a.reason}: ${a.error.message.substring(0, 50)})`
    ).join(' -> ');

    const exhaustedError = new Error(
      `All experts exhausted for ${expertId}. ` +
      `Chain: ${attemptSummary}. ` +
      `Please try again later.`
    );

    // 모든 시도 에러 로깅
    logger.error({
      originalExpert: expertId,
      totalAttempts: fallbackAttempts.length,
      attempts: fallbackAttempts.map(a => ({
        expert: a.expertId,
        reason: a.reason,
        error: a.error.message.substring(0, 100)
      }))
    }, 'All fallback attempts exhausted');

    await executeHooks('onError', {
      errorMessage: exhaustedError.message,
      source: `expert:${expertId}`,
      recoverable: false,
      fallbackAttempts: fallbackAttempts.length
    });

    throw exhaustedError;
  }
}

/**
 * Extracts provider from model name.
 */
function getProviderFromModel(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) {
    return 'openai';
  }
  if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
    return 'anthropic';
  }
  if (modelLower.includes('gemini') || modelLower.includes('google')) {
    return 'google';
  }
  return 'unknown';
}

/**
 * 도구 사용 가능한 전문가 호출 (폴백 지원)
 */
export async function callExpertWithToolsAndFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  enableTools: boolean = true,
  imagePath?: string,
  applyPreamble: boolean = false
): Promise<ExpertResponse> {
  const expert = experts[expertId];

  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }

  const startTime = Date.now();

  // Execute onExpertCall hooks
  const preHookResult = await executeHooks('onExpertCall', {
    expertId,
    model: expert.model,
    prompt,
    context,
    skipCache
  });

  // Check if hooks blocked the call
  if (preHookResult.decision === 'block') {
    throw new Error(`Expert call blocked by hook: ${preHookResult.reason || 'No reason provided'}`);
  }

  // Apply any injected context from hooks
  const finalContext = preHookResult.injectMessage
    ? (context ? `${context}\n\n${preHookResult.injectMessage}` : preHookResult.injectMessage)
    : context;

  // Worker Preamble 적용 (orchestrate 모드에서만)
  const finalPrompt = (applyPreamble && !hasPreamble(prompt))
    ? wrapWithPreamble(prompt)
    : prompt;

  try {
    const result = await callExpertWithTools(expert, finalPrompt, {
      context: finalContext,
      skipCache,
      enableTools: enableTools && expert.toolChoice !== "none",
      imagePath
    });

    const durationMs = Date.now() - startTime;

    // Execute onExpertResult hooks
    await executeHooks('onExpertResult', {
      expertId,
      model: expert.model,
      response: result.response,
      responseLength: result.response.length,
      durationMs,
      fromCache: result.cached || false,
      usedFallback: false
    });

    return result;
  } catch (error) {
    // Rate Limit이 아닌 에러는 그대로 throw
    if (!(error instanceof RateLimitExceededError)) {
      // Execute onError hook for non-rate-limit errors
      await executeHooks('onError', {
        errorMessage: (error as Error).message,
        source: `expert:${expertId}`,
        recoverable: false
      });
      throw error;
    }

    // Execute onRateLimit hook
    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    await executeHooks('onRateLimit', {
      provider: getProviderFromModel(expert.model),
      model: expert.model,
      expertId,
      fallbackAvailable: fallbacks.length > 0
    });

    logger.warn({ expertId, error: error.message }, 'Primary expert failed, trying fallbacks');

    // 폴백 시도 기록
    const fallbackAttempts: FallbackAttempt[] = [{
      expertId,
      error,
      reason: shouldAttemptFallback(error).reason,
      timestamp: Date.now()
    }];

    // 폴백 체인 시도
    for (let i = 0; i < fallbacks.length; i++) {
      const fallbackId = fallbacks[i];
      const fallbackExpert = experts[fallbackId];

      if (!fallbackExpert) {
        logger.error({ fallbackId }, 'Fallback expert not found in registry');
        continue;
      }

      try {
        logger.info({
          from: expertId,
          to: fallbackId,
          attemptNumber: i + 1,
          totalFallbacks: fallbacks.length,
          model: fallbackExpert.model,
          toolsEnabled: enableTools && fallbackExpert.toolChoice !== "none"
        }, 'Attempting fallback with tools');

        // 폴백 전문가에 대한 훅 실행
        const fallbackPreHookResult = await executeHooks('onExpertCall', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          prompt: finalPrompt,
          context: finalContext,
          skipCache,
          isFallback: true,
          originalExpert: expertId
        });

        if (fallbackPreHookResult.decision === 'block') {
          logger.warn({ fallbackId, reason: fallbackPreHookResult.reason }, 'Fallback blocked by hook');
          continue;
        }

        const fallbackStartTime = Date.now();
        const result = await callExpertWithTools(fallbackExpert, finalPrompt, {
          context: finalContext,
          skipCache,
          enableTools: enableTools && fallbackExpert.toolChoice !== "none",
          imagePath
        });
        const fallbackDurationMs = Date.now() - fallbackStartTime;

        logger.info({
          fallbackId,
          durationMs: fallbackDurationMs,
          attemptNumber: i + 1,
          toolsUsed: result.toolsUsed?.length || 0
        }, 'Fallback with tools succeeded');

        // Execute onExpertResult hooks for fallback
        await executeHooks('onExpertResult', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          response: result.response,
          responseLength: result.response.length,
          durationMs: fallbackDurationMs,
          fromCache: result.cached || false,
          usedFallback: true,
          originalExpert: expertId,
          fallbackAttempts: fallbackAttempts.length
        });

        return {
          ...result,
          fellBack: true,
          actualExpert: fallbackId
        };
      } catch (fallbackError) {
        const fbError = fallbackError as Error;
        const { shouldFallback, reason } = shouldAttemptFallback(fbError);

        // 에러 기록
        fallbackAttempts.push({
          expertId: fallbackId,
          error: fbError,
          reason,
          timestamp: Date.now()
        });

        // 상세 로깅
        logFallbackError(expertId, fallbackId, fbError, i + 1, fallbacks.length);

        // 치명적 에러는 즉시 throw
        if (!shouldFallback) {
          logger.error({
            fallbackId,
            errorType: reason,
            message: fbError.message
          }, 'Fatal error during fallback, stopping fallback chain');

          await executeHooks('onError', {
            errorMessage: fbError.message,
            source: `expert:${fallbackId}`,
            recoverable: false,
            errorType: reason
          });

          throw fbError;
        }

        continue;
      }
    }

    // 모든 폴백 실패 - 상세 에러 정보 포함
    const attemptSummary = fallbackAttempts.map(a =>
      `${a.expertId} (${a.reason}: ${a.error.message.substring(0, 50)})`
    ).join(' -> ');

    const exhaustedError = new Error(
      `All experts exhausted for ${expertId}. ` +
      `Chain: ${attemptSummary}. ` +
      `Please try again later.`
    );

    logger.error({
      originalExpert: expertId,
      totalAttempts: fallbackAttempts.length,
      attempts: fallbackAttempts.map(a => ({
        expert: a.expertId,
        reason: a.reason,
        error: a.error.message.substring(0, 100)
      }))
    }, 'All fallback attempts exhausted');

    await executeHooks('onError', {
      errorMessage: exhaustedError.message,
      source: `expert:${expertId}`,
      recoverable: false,
      fallbackAttempts: fallbackAttempts.length
    });

    throw exhaustedError;
  }
}

// 병렬 호출 지원
export async function callExpertsParallel(
  calls: Array<{ expertId: string; prompt: string; context?: string }>
): Promise<ExpertResponse[]> {
  return Promise.all(
    calls.map(({ expertId, prompt, context }) =>
      callExpertWithFallback(expertId, prompt, context)
    )
  );
}
