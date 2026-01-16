// src/features/keyword-detector/index.ts

/**
 * Keyword Detector Module
 *
 * 특정 키워드/패턴 감지 시 자동으로 적절한 expert로 라우팅
 */

export {
  ExpertId,
  MatchType,
  KeywordRule,
  DetectionResult,
  MatchedRule,
  KeywordConfig,
  CreateRuleParams,
  UpdateRuleParams,
  DEFAULT_KEYWORD_RULES
} from './types.js';

export {
  loadKeywordConfig,
  saveKeywordConfig,
  generateRuleId
} from './storage.js';

export {
  getKeywordDetector,
  resetKeywordDetector
} from './manager.js';
