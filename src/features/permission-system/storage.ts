// src/features/permission-system/storage.ts

/**
 * Permission System Storage
 *
 * 권한 설정 및 요청을 파일 시스템에 영속화
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import {
  PermissionConfig,
  RiskPattern,
  PermissionRule,
  DEFAULT_RISK_PATTERNS
} from './types.js';

const CONFIG_DIR = '.llm-router';
const CONFIG_FILE = 'permissions.json';
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
export function generateId(prefix: string = 'perm'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 기본 패턴을 RiskPattern으로 변환
 */
function createDefaultPatterns(): RiskPattern[] {
  return DEFAULT_RISK_PATTERNS.map((pattern, index) => ({
    ...pattern,
    id: `default_${index}_${pattern.name.toLowerCase().replace(/\s+/g, '_')}`
  }));
}

/**
 * 권한 설정 로드
 */
export function loadPermissionConfig(): PermissionConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as PermissionConfig;

      // 기본 패턴이 없으면 추가
      if (!config.patterns || config.patterns.length === 0) {
        config.patterns = createDefaultPatterns();
      }

      logger.debug({
        patternsCount: config.patterns.length,
        rulesCount: config.rules.length
      }, 'Loaded permission config');
      return config;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load permission config, using defaults');
  }

  // 기본 설정 반환
  return {
    version: CONFIG_VERSION,
    enabled: true,
    defaultAction: 'require_confirmation',
    permissionTimeout: 1800, // 30분
    patterns: createDefaultPatterns(),
    rules: [],
    sessionGrants: []
  };
}

/**
 * 권한 설정 저장
 */
export function savePermissionConfig(config: PermissionConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();

  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    logger.info({
      configPath,
      patternsCount: config.patterns.length,
      rulesCount: config.rules.length
    }, 'Saved permission config');
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to save permission config');
    throw new Error(`Failed to save permission config: ${error}`);
  }
}

/**
 * 패턴 추가
 */
export function addPattern(config: PermissionConfig, pattern: RiskPattern): PermissionConfig {
  return {
    ...config,
    patterns: [...config.patterns, pattern]
  };
}

/**
 * 패턴 업데이트
 */
export function updatePattern(
  config: PermissionConfig,
  patternId: string,
  updates: Partial<RiskPattern>
): PermissionConfig {
  return {
    ...config,
    patterns: config.patterns.map(pattern =>
      pattern.id === patternId
        ? { ...pattern, ...updates }
        : pattern
    )
  };
}

/**
 * 패턴 삭제
 */
export function removePattern(config: PermissionConfig, patternId: string): PermissionConfig {
  return {
    ...config,
    patterns: config.patterns.filter(pattern => pattern.id !== patternId)
  };
}

/**
 * 규칙 추가
 */
export function addRule(config: PermissionConfig, rule: PermissionRule): PermissionConfig {
  return {
    ...config,
    rules: [...config.rules, rule]
  };
}

/**
 * 규칙 업데이트
 */
export function updateRule(
  config: PermissionConfig,
  ruleId: string,
  updates: Partial<PermissionRule>
): PermissionConfig {
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
export function removeRule(config: PermissionConfig, ruleId: string): PermissionConfig {
  return {
    ...config,
    rules: config.rules.filter(rule => rule.id !== ruleId)
  };
}

/**
 * 세션 승인 추가
 */
export function addSessionGrant(config: PermissionConfig, patternId: string): PermissionConfig {
  if (config.sessionGrants.includes(patternId)) {
    return config;
  }
  return {
    ...config,
    sessionGrants: [...config.sessionGrants, patternId]
  };
}

/**
 * 세션 승인 제거
 */
export function removeSessionGrant(config: PermissionConfig, patternId: string): PermissionConfig {
  return {
    ...config,
    sessionGrants: config.sessionGrants.filter(id => id !== patternId)
  };
}

/**
 * 모든 세션 승인 초기화
 */
export function clearSessionGrants(config: PermissionConfig): PermissionConfig {
  return {
    ...config,
    sessionGrants: []
  };
}
