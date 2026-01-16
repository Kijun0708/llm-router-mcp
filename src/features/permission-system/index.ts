// src/features/permission-system/index.ts

/**
 * Permission System Module
 *
 * 위험한 작업 수행 전 사용자 확인을 요청하는 권한 시스템
 */

export {
  RiskLevel,
  PermissionStatus,
  OperationCategory,
  RiskPattern,
  PermissionRequest,
  PermissionRule,
  PermissionConfig,
  PermissionCheckResult,
  DEFAULT_RISK_PATTERNS,
  RISK_LEVEL_TIMEOUTS,
  RISK_LEVEL_INFO
} from './types.js';

export {
  loadPermissionConfig,
  savePermissionConfig,
  generateId
} from './storage.js';

export {
  getPermissionManager,
  resetPermissionManager
} from './manager.js';
