// src/features/keyword-detector/storage.ts

/**
 * Keyword Detector Storage
 *
 * 키워드 규칙을 파일 시스템에 영속화
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import {
  KeywordConfig,
  KeywordRule,
  DEFAULT_KEYWORD_RULES
} from './types.js';

const CONFIG_DIR = '.llm-router';
const CONFIG_FILE = 'keywords.json';
const CONFIG_VERSION = '1.0.0';

/**
 * 설정 파일 경로 반환
 */
function getConfigPath(): string {
  return path.join(process.cwd(), CONFIG_DIR, CONFIG_FILE);
}

/**
 * 설정 디렉토리 확인 및 생성
 */
function ensureConfigDir(): void {
  const dirPath = path.join(process.cwd(), CONFIG_DIR);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info({ dirPath }, 'Created config directory');
  }
}

/**
 * 고유 ID 생성
 */
export function generateRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 기본 규칙을 KeywordRule로 변환
 */
function createDefaultRules(): KeywordRule[] {
  const now = new Date().toISOString();
  return DEFAULT_KEYWORD_RULES.map((rule, index) => ({
    ...rule,
    id: `default_${index}_${rule.name.toLowerCase().replace(/\s+/g, '_')}`,
    createdAt: now,
    updatedAt: now
  }));
}

/**
 * 키워드 설정 로드
 */
export function loadKeywordConfig(): KeywordConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as KeywordConfig;

      // 기본 규칙이 없으면 추가
      if (!config.defaultRules || config.defaultRules.length === 0) {
        config.defaultRules = createDefaultRules();
      }

      logger.debug({ rulesCount: config.rules.length }, 'Loaded keyword config');
      return config;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load keyword config, using defaults');
  }

  // 기본 설정 반환
  return {
    version: CONFIG_VERSION,
    enabled: true,
    rules: [],
    defaultRules: createDefaultRules()
  };
}

/**
 * 키워드 설정 저장
 */
export function saveKeywordConfig(config: KeywordConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();

  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    logger.info({ configPath, rulesCount: config.rules.length }, 'Saved keyword config');
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to save keyword config');
    throw new Error(`Failed to save keyword config: ${error}`);
  }
}

/**
 * 규칙 추가
 */
export function addRule(config: KeywordConfig, rule: KeywordRule): KeywordConfig {
  return {
    ...config,
    rules: [...config.rules, rule]
  };
}

/**
 * 규칙 업데이트
 */
export function updateRule(config: KeywordConfig, ruleId: string, updates: Partial<KeywordRule>): KeywordConfig {
  return {
    ...config,
    rules: config.rules.map(rule =>
      rule.id === ruleId
        ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
        : rule
    )
  };
}

/**
 * 규칙 삭제
 */
export function removeRule(config: KeywordConfig, ruleId: string): KeywordConfig {
  return {
    ...config,
    rules: config.rules.filter(rule => rule.id !== ruleId)
  };
}

/**
 * 기본 규칙 토글
 */
export function toggleDefaultRule(config: KeywordConfig, ruleId: string, enabled: boolean): KeywordConfig {
  return {
    ...config,
    defaultRules: config.defaultRules.map(rule =>
      rule.id === ruleId
        ? { ...rule, enabled, updatedAt: new Date().toISOString() }
        : rule
    )
  };
}

/**
 * 모든 규칙 조회 (사용자 정의 + 활성화된 기본 규칙)
 */
export function getAllActiveRules(config: KeywordConfig): KeywordRule[] {
  if (!config.enabled) {
    return [];
  }

  const activeDefaultRules = config.defaultRules.filter(r => r.enabled);
  const activeUserRules = config.rules.filter(r => r.enabled);

  // 우선순위로 정렬 (높은 순)
  return [...activeUserRules, ...activeDefaultRules]
    .sort((a, b) => b.priority - a.priority);
}
