// src/hooks/builtin/keyword-detector.ts

/**
 * Keyword Detector Hook
 *
 * consult_expert 호출 시 질문 텍스트에서 키워드를 감지하여
 * 자동으로 적절한 expert를 추천합니다.
 */

import {
  HookDefinition,
  HookResult,
  DEFAULT_HOOK_RESULT,
  OnToolCallContext,
  OnExpertCallContext
} from '../types.js';
import { getHookManager } from '../manager.js';
import { getKeywordDetector } from '../../features/keyword-detector/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Keyword detector hook for tool calls
 */
const keywordDetectorOnToolCall: HookDefinition<OnToolCallContext> = {
  id: 'builtin_keyword_detector',
  name: 'Keyword Detector',
  description: 'consult_expert 호출 시 키워드를 감지하여 적절한 expert를 추천합니다.',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,
  toolPattern: 'consult_expert',
  handler: async (context: OnToolCallContext): Promise<HookResult> => {
    // consult_expert 도구 호출 시에만 실행
    if (context.toolName !== 'consult_expert') {
      return DEFAULT_HOOK_RESULT;
    }

    const detector = getKeywordDetector();

    // 시스템 비활성화 시 스킵
    if (!detector.isEnabled()) {
      return DEFAULT_HOOK_RESULT;
    }

    // 질문 텍스트 추출
    const question = context.toolInput?.question as string;
    if (!question) {
      return DEFAULT_HOOK_RESULT;
    }

    // 키워드 감지
    const result = detector.detect(question);

    if (!result.detected || !result.suggestedExpert) {
      return DEFAULT_HOOK_RESULT;
    }

    // 현재 지정된 expert
    const requestedExpert = context.toolInput?.expert as string;

    // 이미 올바른 expert가 지정되어 있으면 스킵
    if (requestedExpert === result.suggestedExpert) {
      logger.debug({
        question: question.substring(0, 50),
        expert: requestedExpert
      }, 'Keyword detection: expert already matches');
      return DEFAULT_HOOK_RESULT;
    }

    // 신뢰도가 높으면 메시지 추가
    if (result.confidence >= 0.6) {
      const matchedKeywords = result.matchedRules
        .flatMap(r => r.matchedKeywords)
        .slice(0, 3)
        .join(', ');

      logger.info({
        question: question.substring(0, 50),
        requestedExpert,
        suggestedExpert: result.suggestedExpert,
        confidence: result.confidence,
        matchedKeywords
      }, 'Keyword detection: expert suggestion');

      // 메시지로 추천 정보 전달
      return {
        decision: 'continue',
        injectMessage: `[Keyword Detector] 감지된 키워드(${matchedKeywords})에 따라 '${result.suggestedExpert}' expert가 더 적합할 수 있습니다. (신뢰도: ${(result.confidence * 100).toFixed(0)}%)`
      };
    }

    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Keyword detector hook for expert calls (statistics only)
 */
const keywordSuggestionOnExpertCall: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_keyword_suggestion',
  name: 'Keyword Expert Suggestion',
  description: 'Expert 호출 시 키워드 감지 통계를 업데이트합니다.',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,
  handler: async (context: OnExpertCallContext): Promise<HookResult> => {
    const detector = getKeywordDetector();

    if (!detector.isEnabled()) {
      return DEFAULT_HOOK_RESULT;
    }

    // 프롬프트 텍스트에서 키워드 감지 (통계 업데이트용)
    const text = context.prompt || '';
    if (!text) {
      return DEFAULT_HOOK_RESULT;
    }

    // 키워드 감지 (통계 업데이트용)
    const result = detector.detect(text);

    if (result.detected) {
      logger.debug({
        expertId: context.expertId,
        matchedRulesCount: result.matchedRules.length,
        suggestedExpert: result.suggestedExpert
      }, 'Keyword detection on expert call');
    }

    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Keyword detector hook definitions
 */
export const keywordDetectorHooks: HookDefinition[] = [
  keywordDetectorOnToolCall as HookDefinition,
  keywordSuggestionOnExpertCall as HookDefinition
];

/**
 * Registers keyword detector hooks.
 */
export function registerKeywordDetectorHooks(): void {
  const manager = getHookManager();

  for (const hook of keywordDetectorHooks) {
    manager.registerHook(hook);
  }

  logger.info({ hookCount: keywordDetectorHooks.length }, 'Keyword detector hooks registered');
}
