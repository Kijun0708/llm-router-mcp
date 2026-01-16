// src/features/keyword-detector/manager.ts

/**
 * Keyword Detector Manager
 *
 * 키워드 감지 및 expert 자동 라우팅을 관리하는 싱글톤
 */

import { logger } from '../../utils/logger.js';
import {
  KeywordRule,
  KeywordConfig,
  DetectionResult,
  MatchedRule,
  CreateRuleParams,
  UpdateRuleParams,
  ExpertId,
  MatchType
} from './types.js';
import {
  loadKeywordConfig,
  saveKeywordConfig,
  addRule,
  updateRule,
  removeRule,
  toggleDefaultRule,
  getAllActiveRules,
  generateRuleId
} from './storage.js';

/**
 * Keyword Detector Manager
 */
class KeywordDetectorManager {
  private config: KeywordConfig;
  private detectionStats: Map<string, { hits: number; lastHit: string }>;

  constructor() {
    this.config = loadKeywordConfig();
    this.detectionStats = new Map();
    logger.info({
      enabled: this.config.enabled,
      userRules: this.config.rules.length,
      defaultRules: this.config.defaultRules.length
    }, 'KeywordDetectorManager initialized');
  }

  /**
   * 텍스트에서 키워드 감지
   */
  detect(text: string): DetectionResult {
    if (!this.config.enabled || !text) {
      return {
        detected: false,
        matchedRules: [],
        confidence: 0
      };
    }

    const activeRules = getAllActiveRules(this.config);
    const matchedRules: MatchedRule[] = [];

    for (const rule of activeRules) {
      const matchedKeywords = this.matchKeywords(text, rule);

      if (matchedKeywords.length > 0) {
        matchedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matchedKeywords,
          targetExpert: rule.targetExpert,
          priority: rule.priority
        });

        // 통계 업데이트
        this.updateStats(rule.id);
      }
    }

    if (matchedRules.length === 0) {
      return {
        detected: false,
        matchedRules: [],
        confidence: 0
      };
    }

    // 가장 높은 우선순위 규칙 선택
    const topRule = matchedRules[0];

    // 신뢰도 계산: 매칭된 규칙 수, 우선순위, 매칭된 키워드 수 기반
    const confidence = this.calculateConfidence(matchedRules, topRule);

    logger.debug({
      text: text.substring(0, 100),
      matchedRulesCount: matchedRules.length,
      suggestedExpert: topRule.targetExpert,
      confidence
    }, 'Keyword detection completed');

    return {
      detected: true,
      matchedRules,
      suggestedExpert: topRule.targetExpert,
      confidence
    };
  }

  /**
   * 키워드 매칭 수행
   */
  private matchKeywords(text: string, rule: KeywordRule): string[] {
    const matchedKeywords: string[] = [];
    const searchText = rule.caseSensitive ? text : text.toLowerCase();

    for (const keyword of rule.keywords) {
      const searchKeyword = rule.caseSensitive ? keyword : keyword.toLowerCase();

      if (this.matchSingle(searchText, searchKeyword, rule.matchType)) {
        matchedKeywords.push(keyword);
      }
    }

    return matchedKeywords;
  }

  /**
   * 단일 키워드 매칭
   */
  private matchSingle(text: string, keyword: string, matchType: MatchType): boolean {
    switch (matchType) {
      case 'exact':
        // 단어 경계로 정확히 일치
        const exactRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
        return exactRegex.test(text);

      case 'contains':
        return text.includes(keyword);

      case 'startsWith':
        return text.startsWith(keyword);

      case 'endsWith':
        return text.endsWith(keyword);

      case 'regex':
        try {
          const regex = new RegExp(keyword, 'i');
          return regex.test(text);
        } catch {
          logger.warn({ keyword }, 'Invalid regex pattern');
          return false;
        }

      default:
        return text.includes(keyword);
    }
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(matchedRules: MatchedRule[], topRule: MatchedRule): number {
    // 기본 점수: 우선순위 기반 (0-100 -> 0-0.5)
    let score = (topRule.priority / 100) * 0.5;

    // 매칭된 키워드 수 보너스 (최대 0.3)
    const keywordBonus = Math.min(topRule.matchedKeywords.length * 0.1, 0.3);
    score += keywordBonus;

    // 여러 규칙 매칭 시 보너스 (최대 0.2)
    const multiRuleBonus = Math.min((matchedRules.length - 1) * 0.05, 0.2);
    score += multiRuleBonus;

    return Math.min(score, 1);
  }

  /**
   * 통계 업데이트
   */
  private updateStats(ruleId: string): void {
    const current = this.detectionStats.get(ruleId) || { hits: 0, lastHit: '' };
    this.detectionStats.set(ruleId, {
      hits: current.hits + 1,
      lastHit: new Date().toISOString()
    });
  }

  /**
   * 규칙 추가
   */
  createRule(params: CreateRuleParams): KeywordRule {
    const now = new Date().toISOString();
    const rule: KeywordRule = {
      id: generateRuleId(),
      name: params.name,
      keywords: params.keywords,
      matchType: params.matchType || 'contains',
      caseSensitive: params.caseSensitive ?? false,
      targetExpert: params.targetExpert,
      priority: params.priority ?? 50,
      enabled: true,
      description: params.description,
      createdAt: now,
      updatedAt: now
    };

    this.config = addRule(this.config, rule);
    saveKeywordConfig(this.config);

    logger.info({ ruleId: rule.id, name: rule.name }, 'Keyword rule created');
    return rule;
  }

  /**
   * 규칙 업데이트
   */
  modifyRule(params: UpdateRuleParams): KeywordRule | null {
    const existingRule = this.getRule(params.id);
    if (!existingRule) {
      return null;
    }

    const updates: Partial<KeywordRule> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.keywords !== undefined) updates.keywords = params.keywords;
    if (params.matchType !== undefined) updates.matchType = params.matchType;
    if (params.caseSensitive !== undefined) updates.caseSensitive = params.caseSensitive;
    if (params.targetExpert !== undefined) updates.targetExpert = params.targetExpert;
    if (params.priority !== undefined) updates.priority = params.priority;
    if (params.enabled !== undefined) updates.enabled = params.enabled;
    if (params.description !== undefined) updates.description = params.description;

    this.config = updateRule(this.config, params.id, updates);
    saveKeywordConfig(this.config);

    const updatedRule = this.getRule(params.id);
    logger.info({ ruleId: params.id }, 'Keyword rule updated');
    return updatedRule;
  }

  /**
   * 규칙 삭제
   */
  deleteRule(ruleId: string): boolean {
    const existingRule = this.config.rules.find(r => r.id === ruleId);
    if (!existingRule) {
      // 기본 규칙은 삭제 대신 비활성화
      const defaultRule = this.config.defaultRules.find(r => r.id === ruleId);
      if (defaultRule) {
        this.config = toggleDefaultRule(this.config, ruleId, false);
        saveKeywordConfig(this.config);
        logger.info({ ruleId }, 'Default keyword rule disabled');
        return true;
      }
      return false;
    }

    this.config = removeRule(this.config, ruleId);
    saveKeywordConfig(this.config);
    this.detectionStats.delete(ruleId);

    logger.info({ ruleId }, 'Keyword rule deleted');
    return true;
  }

  /**
   * 규칙 조회
   */
  getRule(ruleId: string): KeywordRule | null {
    const userRule = this.config.rules.find(r => r.id === ruleId);
    if (userRule) return userRule;

    const defaultRule = this.config.defaultRules.find(r => r.id === ruleId);
    return defaultRule || null;
  }

  /**
   * 모든 규칙 조회
   */
  listRules(includeDisabled: boolean = false): { userRules: KeywordRule[]; defaultRules: KeywordRule[] } {
    const userRules = includeDisabled
      ? this.config.rules
      : this.config.rules.filter(r => r.enabled);

    const defaultRules = includeDisabled
      ? this.config.defaultRules
      : this.config.defaultRules.filter(r => r.enabled);

    return { userRules, defaultRules };
  }

  /**
   * 규칙 활성화/비활성화
   */
  toggleRule(ruleId: string, enabled: boolean): boolean {
    const userRule = this.config.rules.find(r => r.id === ruleId);
    if (userRule) {
      this.config = updateRule(this.config, ruleId, { enabled });
      saveKeywordConfig(this.config);
      return true;
    }

    const defaultRule = this.config.defaultRules.find(r => r.id === ruleId);
    if (defaultRule) {
      this.config = toggleDefaultRule(this.config, ruleId, enabled);
      saveKeywordConfig(this.config);
      return true;
    }

    return false;
  }

  /**
   * 시스템 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    saveKeywordConfig(this.config);
    logger.info({ enabled }, 'Keyword detector system toggled');
  }

  /**
   * 시스템 상태 확인
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 통계 조회
   */
  getStats(): { ruleId: string; name: string; hits: number; lastHit: string }[] {
    const stats: { ruleId: string; name: string; hits: number; lastHit: string }[] = [];

    for (const [ruleId, data] of this.detectionStats) {
      const rule = this.getRule(ruleId);
      stats.push({
        ruleId,
        name: rule?.name || 'Unknown',
        hits: data.hits,
        lastHit: data.lastHit
      });
    }

    return stats.sort((a, b) => b.hits - a.hits);
  }

  /**
   * 설정 리로드
   */
  reload(): void {
    this.config = loadKeywordConfig();
    logger.info('Keyword detector config reloaded');
  }

  /**
   * Expert별 키워드 규칙 요약
   */
  getSummaryByExpert(): Map<ExpertId, { ruleCount: number; keywords: string[] }> {
    const summary = new Map<ExpertId, { ruleCount: number; keywords: string[] }>();
    const activeRules = getAllActiveRules(this.config);

    for (const rule of activeRules) {
      const current = summary.get(rule.targetExpert) || { ruleCount: 0, keywords: [] };
      current.ruleCount++;
      current.keywords.push(...rule.keywords.slice(0, 3)); // 각 규칙에서 3개만
      summary.set(rule.targetExpert, current);
    }

    return summary;
  }
}

// 싱글톤 인스턴스
let managerInstance: KeywordDetectorManager | null = null;

/**
 * KeywordDetectorManager 인스턴스 반환
 */
export function getKeywordDetector(): KeywordDetectorManager {
  if (!managerInstance) {
    managerInstance = new KeywordDetectorManager();
  }
  return managerInstance;
}

/**
 * 인스턴스 리셋 (테스트용)
 */
export function resetKeywordDetector(): void {
  managerInstance = null;
}
