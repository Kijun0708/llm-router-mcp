// src/hooks/builtin/cost-tracker.ts

/**
 * Cost Tracking Hook
 *
 * Expert 호출 결과를 추적하여 비용을 계산합니다.
 * 토큰 사용량은 텍스트 길이 기반으로 추정합니다.
 */

import { logger } from '../../utils/logger.js';
import { getCostTracker, Provider } from '../../features/cost-tracking/index.js';
import {
  HookDefinition,
  OnExpertResultContext,
  DEFAULT_HOOK_RESULT
} from '../types.js';
import { billingProviderOf } from '../../services/providers/index.js';

/**
 * 텍스트 기반 토큰 추정
 *
 * - 영어: 1 토큰 ≈ 4 characters
 * - 코드/한국어: 1 토큰 ≈ 2-3 characters
 * - 평균: 1 토큰 ≈ 3.5 characters
 */
function estimateTokens(text: string): number {
  if (!text) return 0;

  // 한글이나 코드가 포함된 경우 더 많은 토큰 사용
  const hasKorean = /[\uAC00-\uD7AF]/.test(text);
  const hasCode = /```|function|const |let |var |class |import |export /.test(text);

  // 토큰당 문자 수 조정
  let charsPerToken = 4;
  if (hasKorean) charsPerToken = 2.5;
  else if (hasCode) charsPerToken = 3;

  return Math.ceil(text.length / charsPerToken);
}

/**
 * 모델 ID에서 Provider 추출
 */
function getProviderFromModel(model: string): Provider {
  // 레지스트리 단일 소스 (미등록 이름도 안전하게 추정)
  return billingProviderOf(model) as Provider;
}

/**
 * Cost Tracking Hook Definition
 */
export const costTrackingHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:cost-tracker',
  name: 'Cost Tracker',
  description: 'Expert 호출 비용을 추적합니다',
  eventType: 'onExpertResult',
  priority: 'low',  // 다른 훅 이후에 실행
  enabled: true,

  handler: async (context) => {
    try {
      const tracker = getCostTracker();

      // 비활성화 상태면 스킵
      if (!tracker.isEnabled()) {
        return DEFAULT_HOOK_RESULT;
      }

      // 캐시된 응답은 비용 없음 (이미 기록됨)
      if (context.fromCache) {
        logger.debug({ expertId: context.expertId }, 'Skipping cost tracking for cached response');
        return DEFAULT_HOOK_RESULT;
      }

      // 토큰 추정
      // 입력: prompt + context (OnExpertCallContext에서 전달되어야 하지만,
      // OnExpertResultContext에서는 response만 있음)
      // 따라서 입력 토큰은 응답 길이의 비율로 추정
      const outputTokens = estimateTokens(context.response);

      // 일반적으로 입력이 출력보다 짧거나 비슷함 (1:1 ~ 2:1 비율 가정)
      // 정확한 추정을 위해서는 OnExpertCallContext의 정보가 필요
      const estimatedInputTokens = Math.ceil(outputTokens * 0.8);

      const usage = {
        inputTokens: estimatedInputTokens,
        outputTokens: outputTokens,
        totalTokens: estimatedInputTokens + outputTokens
      };

      const provider = getProviderFromModel(context.model);

      // 비용 기록
      const record = tracker.trackApiCall({
        expertId: context.expertId,
        modelId: context.model,
        provider,
        usage,
        cached: context.fromCache,
        durationMs: context.durationMs,
        success: true
      });

      logger.debug({
        expertId: context.expertId,
        model: context.model,
        cost: record.cost.totalCost,
        tokens: usage.totalTokens,
        estimated: true
      }, 'Tracked API cost');

      return {
        decision: 'continue',
        metadata: {
          costTracked: true,
          estimatedCost: record.cost.totalCost,
          estimatedTokens: usage.totalTokens
        }
      };
    } catch (error) {
      logger.error({ error, expertId: context.expertId }, 'Failed to track cost');
      return DEFAULT_HOOK_RESULT;
    }
  }
};

/**
 * Hook 등록 함수
 */
export function registerCostTrackingHook(): HookDefinition<OnExpertResultContext> {
  return costTrackingHook;
}

export const costTrackerHooks = [costTrackingHook];
