// src/features/permission-system/manager.ts

/**
 * Permission System Manager
 *
 * 위험 작업 감지 및 권한 확인을 관리하는 싱글톤
 */

import { logger } from '../../utils/logger.js';
import {
  PermissionConfig,
  RiskPattern,
  PermissionRule,
  PermissionRequest,
  PermissionCheckResult,
  RiskLevel,
  OperationCategory,
  RISK_LEVEL_TIMEOUTS,
  RISK_LEVEL_INFO
} from './types.js';
import {
  loadPermissionConfig,
  savePermissionConfig,
  addPattern,
  updatePattern,
  removePattern,
  addRule,
  updateRule,
  removeRule,
  addSessionGrant,
  removeSessionGrant,
  clearSessionGrants,
  generateId
} from './storage.js';

/**
 * Permission Manager
 */
class PermissionManager {
  private config: PermissionConfig;
  private pendingRequests: Map<string, PermissionRequest>;
  private stats: {
    checksPerformed: number;
    permissionsGranted: number;
    permissionsDenied: number;
    autoGranted: number;
  };

  constructor() {
    this.config = loadPermissionConfig();
    this.pendingRequests = new Map();
    this.stats = {
      checksPerformed: 0,
      permissionsGranted: 0,
      permissionsDenied: 0,
      autoGranted: 0
    };

    logger.info({
      enabled: this.config.enabled,
      patternsCount: this.config.patterns.length,
      rulesCount: this.config.rules.length
    }, 'PermissionManager initialized');
  }

  /**
   * 작업 위험도 확인
   */
  checkPermission(context: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    expertId?: string;
    prompt?: string;
    command?: string;
    filePath?: string;
  }): PermissionCheckResult {
    this.stats.checksPerformed++;

    if (!this.config.enabled) {
      return {
        allowed: true,
        requiresConfirmation: false,
        matchedPatterns: [],
        riskLevel: 'low',
        reason: '권한 시스템 비활성화됨'
      };
    }

    // 컨텍스트에서 검사할 텍스트 추출
    const textToCheck = this.extractTextToCheck(context);

    // 매칭되는 패턴 찾기
    const matchedPatterns = this.findMatchingPatterns(textToCheck, context);

    if (matchedPatterns.length === 0) {
      return {
        allowed: true,
        requiresConfirmation: false,
        matchedPatterns: [],
        riskLevel: 'low',
        reason: '위험 패턴 감지되지 않음'
      };
    }

    // 가장 높은 위험 레벨 결정
    const riskLevel = this.getHighestRiskLevel(matchedPatterns);

    // 규칙 확인 (자동 승인/거부)
    const ruleResult = this.checkRules(matchedPatterns, context);
    if (ruleResult) {
      if (ruleResult.action === 'auto_grant') {
        this.stats.autoGranted++;
        return {
          allowed: true,
          requiresConfirmation: false,
          matchedPatterns,
          riskLevel,
          reason: `규칙 '${ruleResult.name}'에 의해 자동 승인됨`
        };
      } else if (ruleResult.action === 'auto_deny') {
        return {
          allowed: false,
          requiresConfirmation: false,
          matchedPatterns,
          riskLevel,
          reason: `규칙 '${ruleResult.name}'에 의해 자동 거부됨`
        };
      }
    }

    // 세션 승인 확인
    const sessionGranted = matchedPatterns.every(
      p => this.config.sessionGrants.includes(p.id) || p.autoGrant
    );

    if (sessionGranted) {
      this.stats.autoGranted++;
      return {
        allowed: true,
        requiresConfirmation: false,
        matchedPatterns,
        riskLevel,
        reason: '세션 동안 이미 승인됨'
      };
    }

    // 확인 필요 여부 결정
    const requiresConfirmation = matchedPatterns.some(p => p.requiresConfirmation);

    if (!requiresConfirmation) {
      // 자동 승인 가능한 패턴만 있는 경우
      this.stats.autoGranted++;
      return {
        allowed: true,
        requiresConfirmation: false,
        matchedPatterns,
        riskLevel,
        reason: '낮은 위험도로 자동 승인됨'
      };
    }

    // 권한 요청 생성
    const request = this.createPermissionRequest(
      matchedPatterns,
      riskLevel,
      context
    );

    return {
      allowed: false,
      requiresConfirmation: true,
      request,
      matchedPatterns,
      riskLevel,
      reason: '사용자 확인 필요'
    };
  }

  /**
   * 검사할 텍스트 추출
   */
  private extractTextToCheck(context: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    prompt?: string;
    command?: string;
    filePath?: string;
  }): string {
    const parts: string[] = [];

    if (context.toolName) parts.push(context.toolName);
    if (context.prompt) parts.push(context.prompt);
    if (context.command) parts.push(context.command);
    if (context.filePath) parts.push(context.filePath);

    if (context.toolInput) {
      // toolInput에서 문자열 값 추출
      for (const value of Object.values(context.toolInput)) {
        if (typeof value === 'string') {
          parts.push(value);
        }
      }
    }

    return parts.join(' ');
  }

  /**
   * 매칭되는 패턴 찾기
   */
  private findMatchingPatterns(
    text: string,
    context: { toolName?: string; filePath?: string }
  ): RiskPattern[] {
    const matched: RiskPattern[] = [];
    const activePatterns = this.config.patterns.filter(p => p.enabled);

    for (const pattern of activePatterns) {
      let isMatch = false;

      // 도구 패턴 매칭
      if (pattern.toolPatterns && context.toolName) {
        for (const toolPattern of pattern.toolPatterns) {
          if (new RegExp(toolPattern, 'i').test(context.toolName)) {
            isMatch = true;
            break;
          }
        }
      }

      // 정규식 패턴 매칭
      if (!isMatch && pattern.patterns) {
        for (const regexPattern of pattern.patterns) {
          try {
            if (new RegExp(regexPattern, 'i').test(text)) {
              isMatch = true;
              break;
            }
          } catch {
            // 잘못된 정규식 무시
          }
        }
      }

      // 키워드 매칭
      if (!isMatch && pattern.keywords) {
        const lowerText = text.toLowerCase();
        for (const keyword of pattern.keywords) {
          if (lowerText.includes(keyword.toLowerCase())) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        matched.push(pattern);
      }
    }

    return matched;
  }

  /**
   * 가장 높은 위험 레벨 결정
   */
  private getHighestRiskLevel(patterns: RiskPattern[]): RiskLevel {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    let maxIndex = 0;

    for (const pattern of patterns) {
      const index = levels.indexOf(pattern.riskLevel);
      if (index > maxIndex) {
        maxIndex = index;
      }
    }

    return levels[maxIndex];
  }

  /**
   * 규칙 확인
   */
  private checkRules(
    patterns: RiskPattern[],
    context: { toolName?: string; filePath?: string }
  ): PermissionRule | null {
    const activeRules = this.config.rules
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      let matches = true;

      // 카테고리 조건 확인
      if (rule.conditions.categories && rule.conditions.categories.length > 0) {
        const patternCategories = patterns.map(p => p.category);
        matches = rule.conditions.categories.some(c => patternCategories.includes(c));
      }

      // 위험 레벨 조건 확인
      if (matches && rule.conditions.riskLevels && rule.conditions.riskLevels.length > 0) {
        const patternRiskLevels = patterns.map(p => p.riskLevel);
        matches = rule.conditions.riskLevels.some(l => patternRiskLevels.includes(l));
      }

      // 도구 패턴 조건 확인
      if (matches && rule.conditions.toolPatterns && context.toolName) {
        matches = rule.conditions.toolPatterns.some(p =>
          new RegExp(p, 'i').test(context.toolName!)
        );
      }

      // 경로 패턴 조건 확인
      if (matches && rule.conditions.pathPatterns && context.filePath) {
        matches = rule.conditions.pathPatterns.some(p =>
          new RegExp(p, 'i').test(context.filePath!)
        );
      }

      if (matches) {
        return rule;
      }
    }

    return null;
  }

  /**
   * 권한 요청 생성
   */
  private createPermissionRequest(
    patterns: RiskPattern[],
    riskLevel: RiskLevel,
    context: {
      toolName?: string;
      toolInput?: Record<string, unknown>;
      expertId?: string;
      prompt?: string;
      command?: string;
      filePath?: string;
    }
  ): PermissionRequest {
    const now = new Date();
    const timeout = RISK_LEVEL_TIMEOUTS[riskLevel];
    const expiresAt = new Date(now.getTime() + timeout * 1000);

    const request: PermissionRequest = {
      id: generateId('req'),
      operation: this.generateOperationDescription(patterns, context),
      category: patterns[0].category,
      riskLevel,
      matchedPatterns: patterns.map(p => p.id),
      context: {
        toolName: context.toolName,
        toolInput: context.toolInput,
        expertId: context.expertId,
        prompt: context.prompt,
        filePath: context.filePath,
        command: context.command
      },
      status: 'pending',
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.pendingRequests.set(request.id, request);

    logger.info({
      requestId: request.id,
      riskLevel,
      patterns: patterns.map(p => p.name)
    }, 'Permission request created');

    return request;
  }

  /**
   * 작업 설명 생성
   */
  private generateOperationDescription(
    patterns: RiskPattern[],
    context: { toolName?: string; filePath?: string; command?: string }
  ): string {
    const patternNames = patterns.map(p => p.name).join(', ');

    if (context.command) {
      return `명령어 실행: ${context.command.substring(0, 50)}... (${patternNames})`;
    }
    if (context.filePath) {
      return `파일 작업: ${context.filePath} (${patternNames})`;
    }
    if (context.toolName) {
      return `도구 호출: ${context.toolName} (${patternNames})`;
    }

    return `위험 작업 감지: ${patternNames}`;
  }

  /**
   * 권한 승인
   */
  grantPermission(
    requestId: string,
    options: { grantForSession?: boolean; reason?: string } = {}
  ): PermissionRequest | null {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return null;
    }

    request.status = 'granted';
    request.respondedAt = new Date().toISOString();
    request.response = {
      decision: 'grant',
      reason: options.reason,
      grantedBy: 'user'
    };

    this.pendingRequests.delete(requestId);
    this.stats.permissionsGranted++;

    // 세션 동안 승인
    if (options.grantForSession) {
      for (const patternId of request.matchedPatterns) {
        this.config = addSessionGrant(this.config, patternId);
      }
      savePermissionConfig(this.config);
    }

    logger.info({
      requestId,
      grantForSession: options.grantForSession
    }, 'Permission granted');

    return request;
  }

  /**
   * 권한 거부
   */
  denyPermission(requestId: string, reason?: string): PermissionRequest | null {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return null;
    }

    request.status = 'denied';
    request.respondedAt = new Date().toISOString();
    request.response = {
      decision: 'deny',
      reason,
      grantedBy: 'user'
    };

    this.pendingRequests.delete(requestId);
    this.stats.permissionsDenied++;

    logger.info({ requestId, reason }, 'Permission denied');

    return request;
  }

  /**
   * 대기 중인 요청 조회
   */
  getPendingRequest(requestId: string): PermissionRequest | null {
    const request = this.pendingRequests.get(requestId);

    // 만료 확인
    if (request && request.expiresAt) {
      if (new Date() > new Date(request.expiresAt)) {
        request.status = 'expired';
        this.pendingRequests.delete(requestId);
        return null;
      }
    }

    return request || null;
  }

  /**
   * 모든 대기 중인 요청 조회
   */
  listPendingRequests(): PermissionRequest[] {
    const now = new Date();
    const pending: PermissionRequest[] = [];

    for (const [id, request] of this.pendingRequests) {
      if (request.expiresAt && new Date(request.expiresAt) < now) {
        request.status = 'expired';
        this.pendingRequests.delete(id);
      } else {
        pending.push(request);
      }
    }

    return pending;
  }

  /**
   * 패턴 추가
   */
  createPattern(pattern: Omit<RiskPattern, 'id'>): RiskPattern {
    const newPattern: RiskPattern = {
      ...pattern,
      id: generateId('pattern')
    };

    this.config = addPattern(this.config, newPattern);
    savePermissionConfig(this.config);

    logger.info({ patternId: newPattern.id, name: newPattern.name }, 'Pattern created');
    return newPattern;
  }

  /**
   * 패턴 토글
   */
  togglePattern(patternId: string, enabled: boolean): boolean {
    const pattern = this.config.patterns.find(p => p.id === patternId);
    if (!pattern) {
      return false;
    }

    this.config = updatePattern(this.config, patternId, { enabled });
    savePermissionConfig(this.config);

    logger.info({ patternId, enabled }, 'Pattern toggled');
    return true;
  }

  /**
   * 패턴 삭제
   */
  deletePattern(patternId: string): boolean {
    const pattern = this.config.patterns.find(p => p.id === patternId);
    if (!pattern) {
      return false;
    }

    // 기본 패턴은 비활성화만
    if (patternId.startsWith('default_')) {
      return this.togglePattern(patternId, false);
    }

    this.config = removePattern(this.config, patternId);
    savePermissionConfig(this.config);

    logger.info({ patternId }, 'Pattern deleted');
    return true;
  }

  /**
   * 규칙 추가
   */
  createRule(rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>): PermissionRule {
    const now = new Date().toISOString();
    const newRule: PermissionRule = {
      ...rule,
      id: generateId('rule'),
      createdAt: now,
      updatedAt: now
    };

    this.config = addRule(this.config, newRule);
    savePermissionConfig(this.config);

    logger.info({ ruleId: newRule.id, name: newRule.name }, 'Rule created');
    return newRule;
  }

  /**
   * 규칙 삭제
   */
  deleteRule(ruleId: string): boolean {
    const rule = this.config.rules.find(r => r.id === ruleId);
    if (!rule) {
      return false;
    }

    this.config = removeRule(this.config, ruleId);
    savePermissionConfig(this.config);

    logger.info({ ruleId }, 'Rule deleted');
    return true;
  }

  /**
   * 패턴 목록 조회
   */
  listPatterns(includeDisabled: boolean = false): RiskPattern[] {
    if (includeDisabled) {
      return this.config.patterns;
    }
    return this.config.patterns.filter(p => p.enabled);
  }

  /**
   * 규칙 목록 조회
   */
  listRules(): PermissionRule[] {
    return this.config.rules;
  }

  /**
   * 세션 승인 초기화
   */
  clearSession(): void {
    this.config = clearSessionGrants(this.config);
    savePermissionConfig(this.config);
    this.pendingRequests.clear();

    logger.info('Session grants cleared');
  }

  /**
   * 시스템 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    savePermissionConfig(this.config);

    logger.info({ enabled }, 'Permission system toggled');
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
  getStats(): typeof this.stats & { pendingCount: number; sessionGrantsCount: number } {
    return {
      ...this.stats,
      pendingCount: this.pendingRequests.size,
      sessionGrantsCount: this.config.sessionGrants.length
    };
  }

  /**
   * 위험 레벨 정보 조회
   */
  getRiskLevelInfo(level: RiskLevel): { emoji: string; label: string; color: string } {
    return RISK_LEVEL_INFO[level];
  }

  /**
   * 설정 리로드
   */
  reload(): void {
    this.config = loadPermissionConfig();
    logger.info('Permission config reloaded');
  }
}

// 싱글톤 인스턴스
let managerInstance: PermissionManager | null = null;

/**
 * PermissionManager 인스턴스 반환
 */
export function getPermissionManager(): PermissionManager {
  if (!managerInstance) {
    managerInstance = new PermissionManager();
  }
  return managerInstance;
}

/**
 * 인스턴스 리셋 (테스트용)
 */
export function resetPermissionManager(): void {
  managerInstance = null;
}
