// src/features/permission-system/types.ts

/**
 * Permission System Types
 *
 * 위험한 작업 수행 전 사용자 확인을 요청하는 권한 시스템
 */

/**
 * 위험 레벨 정의
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 권한 상태
 */
export type PermissionStatus = 'pending' | 'granted' | 'denied' | 'expired';

/**
 * 작업 카테고리
 */
export type OperationCategory =
  | 'file_write'       // 파일 쓰기/수정
  | 'file_delete'      // 파일 삭제
  | 'config_change'    // 설정 변경
  | 'system_command'   // 시스템 명령 실행
  | 'network_request'  // 외부 네트워크 요청
  | 'auth_change'      // 인증 관련 변경
  | 'data_export'      // 데이터 내보내기
  | 'destructive'      // 되돌릴 수 없는 작업
  | 'sensitive_read'   // 민감한 데이터 읽기
  | 'bulk_operation';  // 대량 작업

/**
 * 위험 작업 패턴 정의
 */
export interface RiskPattern {
  id: string;
  name: string;
  description: string;
  category: OperationCategory;
  riskLevel: RiskLevel;
  patterns: string[];           // 감지할 패턴 (정규식)
  toolPatterns?: string[];      // 감지할 도구 이름 패턴
  keywords?: string[];          // 감지할 키워드
  requiresConfirmation: boolean;
  autoGrant?: boolean;          // 자동 승인 여부 (낮은 위험)
  enabled: boolean;
}

/**
 * 권한 요청
 */
export interface PermissionRequest {
  id: string;
  operation: string;            // 수행하려는 작업 설명
  category: OperationCategory;
  riskLevel: RiskLevel;
  matchedPatterns: string[];    // 매칭된 패턴 ID
  context: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    expertId?: string;
    prompt?: string;
    filePath?: string;
    command?: string;
  };
  status: PermissionStatus;
  requestedAt: string;
  respondedAt?: string;
  expiresAt?: string;
  response?: {
    decision: 'grant' | 'deny';
    reason?: string;
    grantedBy: 'user' | 'auto' | 'rule';
  };
}

/**
 * 권한 규칙 (자동 승인/거부)
 */
export interface PermissionRule {
  id: string;
  name: string;
  description?: string;
  conditions: {
    categories?: OperationCategory[];
    riskLevels?: RiskLevel[];
    toolPatterns?: string[];
    pathPatterns?: string[];     // 파일 경로 패턴
  };
  action: 'auto_grant' | 'auto_deny' | 'require_confirmation';
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 권한 시스템 설정
 */
export interface PermissionConfig {
  version: string;
  enabled: boolean;
  defaultAction: 'require_confirmation' | 'auto_grant' | 'auto_deny';
  permissionTimeout: number;     // 권한 만료 시간 (초)
  patterns: RiskPattern[];
  rules: PermissionRule[];
  sessionGrants: string[];       // 세션 동안 승인된 패턴 ID
}

/**
 * 권한 확인 결과
 */
export interface PermissionCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  request?: PermissionRequest;
  matchedPatterns: RiskPattern[];
  riskLevel: RiskLevel;
  reason: string;
}

/**
 * 기본 위험 패턴 정의
 */
export const DEFAULT_RISK_PATTERNS: Omit<RiskPattern, 'id'>[] = [
  // Critical - 즉시 확인 필요
  {
    name: 'File Deletion',
    description: '파일 또는 디렉토리 삭제',
    category: 'file_delete',
    riskLevel: 'critical',
    patterns: ['rm\\s+-rf', 'rmdir', 'del\\s+/f', 'Remove-Item.*-Recurse'],
    keywords: ['삭제', 'delete', 'remove', '지워', 'rm -rf'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'Database Drop',
    description: '데이터베이스 테이블/스키마 삭제',
    category: 'destructive',
    riskLevel: 'critical',
    patterns: ['DROP\\s+TABLE', 'DROP\\s+DATABASE', 'DROP\\s+SCHEMA', 'TRUNCATE\\s+TABLE'],
    keywords: ['drop table', 'drop database', 'truncate'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'Git Force Push',
    description: 'Git 강제 푸시',
    category: 'destructive',
    riskLevel: 'critical',
    patterns: ['git\\s+push.*--force', 'git\\s+push.*-f\\b'],
    keywords: ['force push', '강제 푸시'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'Git Hard Reset',
    description: 'Git 하드 리셋',
    category: 'destructive',
    riskLevel: 'critical',
    patterns: ['git\\s+reset\\s+--hard'],
    keywords: ['hard reset', '하드 리셋'],
    requiresConfirmation: true,
    enabled: true
  },

  // High Risk
  {
    name: 'Environment File Change',
    description: '환경 변수 파일 수정',
    category: 'config_change',
    riskLevel: 'high',
    patterns: ['\\.env', '\\.env\\.local', '\\.env\\.production'],
    keywords: ['.env', '환경 변수', 'environment'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'Credential File Access',
    description: '인증 정보 파일 접근',
    category: 'sensitive_read',
    riskLevel: 'high',
    patterns: ['credentials', 'secrets', 'api[_-]?key', 'password', 'token'],
    keywords: ['비밀번호', 'password', 'secret', 'credential', 'api key'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'System Config Change',
    description: '시스템 설정 파일 수정',
    category: 'config_change',
    riskLevel: 'high',
    patterns: ['/etc/', 'system32', 'registry'],
    keywords: ['시스템 설정', 'system config'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'Package Install',
    description: '패키지 설치 (의존성 변경)',
    category: 'system_command',
    riskLevel: 'high',
    patterns: ['npm\\s+install(?!.*--save-dev)', 'pip\\s+install', 'apt\\s+install', 'brew\\s+install'],
    keywords: ['install', '설치'],
    requiresConfirmation: true,
    enabled: true
  },

  // Medium Risk
  {
    name: 'Bulk File Operation',
    description: '대량 파일 작업',
    category: 'bulk_operation',
    riskLevel: 'medium',
    patterns: ['find.*-exec', 'xargs', 'for.*in.*do'],
    keywords: ['모든 파일', 'all files', '일괄', 'bulk'],
    requiresConfirmation: true,
    enabled: true
  },
  {
    name: 'External API Call',
    description: '외부 API 호출',
    category: 'network_request',
    riskLevel: 'medium',
    patterns: ['curl\\s+', 'wget\\s+', 'fetch\\(', 'axios\\.', 'http\\.request'],
    keywords: ['API 호출', 'api call', 'request'],
    requiresConfirmation: false,
    autoGrant: true,
    enabled: true
  },
  {
    name: 'Config File Write',
    description: '설정 파일 쓰기',
    category: 'config_change',
    riskLevel: 'medium',
    patterns: ['package\\.json', 'tsconfig', 'webpack\\.config', '\\.eslintrc'],
    keywords: ['config', '설정'],
    requiresConfirmation: false,
    autoGrant: true,
    enabled: true
  },

  // Low Risk
  {
    name: 'Source File Write',
    description: '소스 코드 파일 수정',
    category: 'file_write',
    riskLevel: 'low',
    patterns: ['\\.ts$', '\\.js$', '\\.tsx$', '\\.jsx$', '\\.py$', '\\.go$'],
    keywords: [],
    requiresConfirmation: false,
    autoGrant: true,
    enabled: true
  },
  {
    name: 'Documentation Write',
    description: '문서 파일 수정',
    category: 'file_write',
    riskLevel: 'low',
    patterns: ['\\.md$', '\\.txt$', '\\.rst$', 'README'],
    keywords: ['문서', 'docs', 'readme'],
    requiresConfirmation: false,
    autoGrant: true,
    enabled: true
  }
];

/**
 * 위험 레벨별 기본 타임아웃 (초)
 */
export const RISK_LEVEL_TIMEOUTS: Record<RiskLevel, number> = {
  low: 3600,      // 1시간
  medium: 1800,   // 30분
  high: 600,      // 10분
  critical: 300   // 5분
};

/**
 * 위험 레벨별 표시 정보
 */
export const RISK_LEVEL_INFO: Record<RiskLevel, { emoji: string; label: string; color: string }> = {
  low: { emoji: '🟢', label: '낮음', color: 'green' },
  medium: { emoji: '🟡', label: '중간', color: 'yellow' },
  high: { emoji: '🟠', label: '높음', color: 'orange' },
  critical: { emoji: '🔴', label: '심각', color: 'red' }
};
