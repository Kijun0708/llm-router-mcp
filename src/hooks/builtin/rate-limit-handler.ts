// src/hooks/builtin/rate-limit-handler.ts

/**
 * Rate Limit Handler Hooks
 *
 * Built-in hooks for handling rate limits gracefully.
 */

import {
  HookDefinition,
  HookResult,
  OnRateLimitContext,
  OnExpertCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Rate limit state tracking.
 */
interface RateLimitState {
  /** Provider rate limit timestamps */
  providerLimits: Map<string, number>;
  /** Model rate limit timestamps */
  modelLimits: Map<string, number>;
  /** Consecutive rate limit count */
  consecutiveRateLimits: number;
  /** Last rate limit timestamp */
  lastRateLimitAt: number;
}

/**
 * Global rate limit state.
 */
const rateLimitState: RateLimitState = {
  providerLimits: new Map(),
  modelLimits: new Map(),
  consecutiveRateLimits: 0,
  lastRateLimitAt: 0
};

/**
 * Checks if a provider/model is currently rate limited.
 */
function isRateLimited(provider: string, model: string): { limited: boolean; retryAfterMs?: number } {
  const now = Date.now();

  // Check provider limit
  const providerLimit = rateLimitState.providerLimits.get(provider);
  if (providerLimit && providerLimit > now) {
    return { limited: true, retryAfterMs: providerLimit - now };
  }

  // Check model limit
  const modelLimit = rateLimitState.modelLimits.get(model);
  if (modelLimit && modelLimit > now) {
    return { limited: true, retryAfterMs: modelLimit - now };
  }

  return { limited: false };
}

/**
 * Records a rate limit event.
 */
function recordRateLimit(provider: string, model: string, retryAfterSeconds?: number): void {
  const now = Date.now();
  const retryAfterMs = (retryAfterSeconds || 60) * 1000;

  // Set provider limit
  rateLimitState.providerLimits.set(provider, now + retryAfterMs);

  // Set model limit
  rateLimitState.modelLimits.set(model, now + retryAfterMs);

  // Update consecutive count
  if (now - rateLimitState.lastRateLimitAt < 60000) {
    rateLimitState.consecutiveRateLimits++;
  } else {
    rateLimitState.consecutiveRateLimits = 1;
  }
  rateLimitState.lastRateLimitAt = now;
}

/**
 * Clears rate limit for a provider/model.
 */
function clearRateLimit(provider: string, model: string): void {
  rateLimitState.providerLimits.delete(provider);
  rateLimitState.modelLimits.delete(model);
}

/**
 * Hook: Track rate limits
 */
const trackRateLimitHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin_track_rate_limit',
  name: 'Track Rate Limit',
  description: 'Tracks rate limit events for intelligent routing',
  eventType: 'onRateLimit',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    recordRateLimit(context.provider, context.model, context.retryAfterSeconds);

    logger.info({
      provider: context.provider,
      model: context.model,
      retryAfterSeconds: context.retryAfterSeconds,
      consecutiveRateLimits: rateLimitState.consecutiveRateLimits
    }, '[Hook] Rate limit tracked');

    // If too many consecutive rate limits, suggest slowing down
    if (rateLimitState.consecutiveRateLimits >= 3) {
      return {
        decision: 'continue',
        injectMessage: `⚠️ Multiple rate limits detected (${rateLimitState.consecutiveRateLimits} consecutive). Consider slowing down requests.`,
        metadata: {
          warningLevel: 'high',
          consecutiveRateLimits: rateLimitState.consecutiveRateLimits
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Pre-check rate limits before expert calls
 */
const preCheckRateLimitHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_precheck_rate_limit',
  name: 'Pre-check Rate Limit',
  description: 'Checks if provider/model is rate limited before making a call',
  eventType: 'onExpertCall',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Extract provider from model name
    const provider = getProviderFromModel(context.model);
    const { limited, retryAfterMs } = isRateLimited(provider, context.model);

    if (limited) {
      const retryAfterSeconds = Math.ceil((retryAfterMs || 60000) / 1000);

      logger.warn({
        expert: context.expertId,
        model: context.model,
        provider,
        retryAfterSeconds
      }, '[Hook] Expert call blocked due to active rate limit');

      return {
        decision: 'continue', // Don't block, let the fallback system handle it
        injectMessage: `ℹ️ ${provider}/${context.model} is currently rate limited. Retry after ${retryAfterSeconds}s or fallback will be used.`,
        metadata: {
          rateLimited: true,
          provider,
          model: context.model,
          retryAfterSeconds
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Suggest fallback on rate limit
 */
const suggestFallbackHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin_suggest_fallback',
  name: 'Suggest Fallback',
  description: 'Suggests fallback experts when rate limited',
  eventType: 'onRateLimit',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!context.fallbackAvailable) {
      return {
        decision: 'continue',
        injectMessage: `⚠️ Rate limited on ${context.model} with no fallback available. Please wait ${context.retryAfterSeconds || 60} seconds.`
      };
    }

    return {
      decision: 'continue',
      metadata: {
        suggestionGiven: true,
        useFallback: true
      }
    };
  }
};

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
 * Gets the current rate limit state (for debugging/monitoring).
 */
export function getRateLimitState(): {
  providerLimits: Record<string, number>;
  modelLimits: Record<string, number>;
  consecutiveRateLimits: number;
} {
  return {
    providerLimits: Object.fromEntries(rateLimitState.providerLimits),
    modelLimits: Object.fromEntries(rateLimitState.modelLimits),
    consecutiveRateLimits: rateLimitState.consecutiveRateLimits
  };
}

/**
 * Clears all rate limit state (for testing/reset).
 */
export function clearAllRateLimits(): void {
  rateLimitState.providerLimits.clear();
  rateLimitState.modelLimits.clear();
  rateLimitState.consecutiveRateLimits = 0;
  rateLimitState.lastRateLimitAt = 0;
}

/**
 * All rate limit hooks.
 */
export const rateLimitHooks = [
  trackRateLimitHook,
  preCheckRateLimitHook,
  suggestFallbackHook
] as HookDefinition[];

/**
 * Registers all rate limit hooks.
 */
export function registerRateLimitHooks(): void {
  for (const hook of rateLimitHooks) {
    registerHook(hook);
  }
}
