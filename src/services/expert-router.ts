// src/services/expert-router.ts

import { ExpertResponse } from '../types.js';
import { experts, FALLBACK_CHAIN } from '../experts/index.js';
import { callExpert, RateLimitExceededError, ExpertCallError } from './cliproxy-client.js';
import { ERROR_POLICY, kindOf } from '../utils/errors.js';
import { billingProviderOf } from './providers/index.js';
import { callExpertWithTools } from './expert-with-tools.js';
import { logger } from '../utils/logger.js';
import { executeHooks } from '../hooks/index.js';
import { wrapWithPreamble, hasPreamble } from '../utils/worker-preamble.js';

// ============================================================================
// Error Classification for Fallback Decision
// ============================================================================

/**
 * 폴백을 시도해야 하는 에러인지 판단.
 *
 * 판정 자체는 utils/errors.ts의 단일 분류표에 위임한다.
 * 예전에는 여기 인라인 문자열 매칭이 있었고, 같은 일을 하는 표가 총 5벌이라
 * 새 CLI 에러 문자열 하나를 처리하려면 최대 5곳을 고쳐야 했다.
 * 게다가 message.includes('400')이 "14002ms"에도 걸리는 등 오분류가 있었다.
 */
function shouldAttemptFallback(error: Error): { shouldFallback: boolean; reason: string } {
  const kind = kindOf(error);
  return { shouldFallback: ERROR_POLICY[kind].tryFallbackExpert, reason: kind };
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

export interface WorkflowCallOptions {
  workflowId?: string;
  workflowType?: string;
  parentCallId?: string;
  callPhase?: string;
  sessionId?: string;
}

export async function callExpertWithFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  imagePath?: string,
  applyPreamble: boolean = false,
  workflowOptions?: WorkflowCallOptions,
  // 명시 모델은 1차 전문가에만 적용한다. 폴백 전문가는 자기 기본 모델을 쓴다 —
  // scarce 모델(Claude)이 폴백 체인 전체로 번지면 opt-in 가드가 무의미해진다.
  requestedModel?: string
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
    skipCache,
    ...workflowOptions
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
    const result = await callExpert(expert, finalPrompt, { context: finalContext, skipCache, imagePath, model: requestedModel });
    const durationMs = Date.now() - startTime;

    // Execute onExpertResult hooks
    await executeHooks('onExpertResult', {
      expertId,
      model: expert.model,
      response: result.response,
      responseLength: result.response.length,
      durationMs,
      fromCache: result.cached || false,
      usedFallback: false,
      ...workflowOptions
    });

    return result;
  } catch (error) {
    const primaryError = error as Error;
    const { shouldFallback: primaryShouldFallback, reason: primaryReason } = shouldAttemptFallback(primaryError);

    // 폴백 불가능한 에러는 즉시 throw (인증 에러, 잘못된 요청 등)
    if (!primaryShouldFallback) {
      await executeHooks('onError', {
        errorMessage: primaryError.message,
        source: `expert:${expertId}`,
        recoverable: false,
        errorType: primaryReason
      });
      throw error;
    }

    // Rate Limit인 경우 onRateLimit 훅 실행
    if (primaryError instanceof RateLimitExceededError) {
      const fallbacks = FALLBACK_CHAIN[expertId] || [];
      await executeHooks('onRateLimit', {
        provider: getProviderFromModel(expert.model),
        model: expert.model,
        expertId,
        fallbackAvailable: fallbacks.length > 0
      });
    }

    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    logger.warn({ expertId, error: primaryError.message, reason: primaryReason }, 'Primary expert failed, trying fallbacks');

    // 폴백 시도 기록
    const fallbackAttempts: FallbackAttempt[] = [{
      expertId,
      error: primaryError,
      reason: primaryReason,
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
          originalExpert: expertId,
          ...workflowOptions
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
          fallbackAttempts: fallbackAttempts.length,
          ...workflowOptions
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
 * 모델명 → 과금/집계용 프로바이더 라벨.
 * 레지스트리가 단일 소스이며, 미등록 이름(과거 로그 등)에도 안전하다.
 */
function getProviderFromModel(model: string): string {
  return billingProviderOf(model);
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
  applyPreamble: boolean = false,
  workflowOptions?: WorkflowCallOptions,
  // 명시 모델은 1차 전문가에만 적용한다. 폴백 전문가는 자기 기본 모델을 쓴다 —
  // scarce 모델(Claude)이 폴백 체인 전체로 번지면 opt-in 가드가 무의미해진다.
  requestedModel?: string
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
    skipCache,
    ...workflowOptions
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
      requestedModel,
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
      usedFallback: false,
      ...workflowOptions
    });

    return result;
  } catch (error) {
    const primaryError = error as Error;
    const { shouldFallback: primaryShouldFallback, reason: primaryReason } = shouldAttemptFallback(primaryError);

    // 폴백 불가능한 에러는 즉시 throw (인증 에러, 잘못된 요청 등)
    if (!primaryShouldFallback) {
      await executeHooks('onError', {
        errorMessage: primaryError.message,
        source: `expert:${expertId}`,
        recoverable: false,
        errorType: primaryReason
      });
      throw error;
    }

    // Rate Limit인 경우 onRateLimit 훅 실행
    if (primaryError instanceof RateLimitExceededError) {
      const fallbacks = FALLBACK_CHAIN[expertId] || [];
      await executeHooks('onRateLimit', {
        provider: getProviderFromModel(expert.model),
        model: expert.model,
        expertId,
        fallbackAvailable: fallbacks.length > 0
      });
    }

    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    logger.warn({ expertId, error: primaryError.message, reason: primaryReason }, 'Primary expert failed, trying fallbacks');

    // 폴백 시도 기록
    const fallbackAttempts: FallbackAttempt[] = [{
      expertId,
      error: primaryError,
      reason: primaryReason,
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
          originalExpert: expertId,
          ...workflowOptions
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
          fallbackAttempts: fallbackAttempts.length,
          ...workflowOptions
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
  calls: Array<{ expertId: string; prompt: string; context?: string }>,
  workflowOptions?: WorkflowCallOptions
): Promise<ExpertResponse[]> {
  return Promise.all(
    calls.map(({ expertId, prompt, context }) =>
      callExpertWithFallback(expertId, prompt, context, false, undefined, false, workflowOptions)
    )
  );
}
