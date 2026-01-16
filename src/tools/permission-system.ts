// src/tools/permission-system.ts

/**
 * Permission System MCP Tools
 *
 * 위험 작업 권한 관리 도구
 */

import { z } from 'zod';
import {
  getPermissionManager,
  RiskLevel,
  OperationCategory,
  RISK_LEVEL_INFO
} from '../features/permission-system/index.js';

// ============================================================================
// Tool Schemas
// ============================================================================

const riskLevelEnum = z.enum(['low', 'medium', 'high', 'critical']);
const operationCategoryEnum = z.enum([
  'file_write', 'file_delete', 'config_change', 'system_command',
  'network_request', 'auth_change', 'data_export', 'destructive',
  'sensitive_read', 'bulk_operation'
]);

export const permissionCheckSchema = z.object({
  tool_name: z.string().optional()
    .describe('검사할 도구 이름'),
  command: z.string().optional()
    .describe('검사할 명령어'),
  file_path: z.string().optional()
    .describe('검사할 파일 경로'),
  prompt: z.string().optional()
    .describe('검사할 프롬프트 텍스트')
}).strict();

export const permissionGrantSchema = z.object({
  request_id: z.string()
    .describe('승인할 요청 ID'),
  grant_for_session: z.boolean()
    .default(false)
    .optional()
    .describe('세션 동안 동일 패턴 자동 승인'),
  reason: z.string()
    .max(200)
    .optional()
    .describe('승인 이유')
}).strict();

export const permissionDenySchema = z.object({
  request_id: z.string()
    .describe('거부할 요청 ID'),
  reason: z.string()
    .max(200)
    .optional()
    .describe('거부 이유')
}).strict();

export const permissionListSchema = z.object({
  include_patterns: z.boolean()
    .default(false)
    .optional()
    .describe('위험 패턴 목록 포함'),
  include_rules: z.boolean()
    .default(false)
    .optional()
    .describe('규칙 목록 포함'),
  include_disabled: z.boolean()
    .default(false)
    .optional()
    .describe('비활성화된 항목 포함')
}).strict();

export const permissionPatternToggleSchema = z.object({
  pattern_id: z.string()
    .describe('토글할 패턴 ID'),
  enabled: z.boolean()
    .describe('활성화 여부')
}).strict();

export const permissionSystemToggleSchema = z.object({
  enabled: z.boolean()
    .describe('시스템 활성화 여부')
}).strict();

export const permissionClearSessionSchema = z.object({
  confirm: z.boolean()
    .default(false)
    .describe('세션 승인 초기화 확인')
}).strict();

// ============================================================================
// Tool Definitions
// ============================================================================

export const permissionCheckTool = {
  name: 'permission_check',

  title: '권한 확인',

  description: `작업의 위험도를 확인하고 권한 필요 여부를 반환합니다.

## 검사 항목
- 파일 삭제/수정 작업
- 시스템 명령 실행
- 설정 파일 변경
- 민감한 데이터 접근

## 반환 정보
- 위험 레벨 (low/medium/high/critical)
- 매칭된 패턴
- 확인 필요 여부`,

  inputSchema: permissionCheckSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionGrantTool = {
  name: 'permission_grant',

  title: '권한 승인',

  description: `대기 중인 권한 요청을 승인합니다.

\`grant_for_session=true\`로 설정하면 세션 동안 동일 패턴의 작업이 자동 승인됩니다.`,

  inputSchema: permissionGrantSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionDenyTool = {
  name: 'permission_deny',

  title: '권한 거부',

  description: `대기 중인 권한 요청을 거부합니다.`,

  inputSchema: permissionDenySchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionListTool = {
  name: 'permission_list',

  title: '권한 상태 조회',

  description: `권한 시스템 상태 및 대기 중인 요청을 조회합니다.

옵션으로 위험 패턴 목록과 규칙 목록을 포함할 수 있습니다.`,

  inputSchema: permissionListSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionPatternToggleTool = {
  name: 'permission_pattern_toggle',

  title: '패턴 토글',

  description: `특정 위험 패턴을 활성화/비활성화합니다.`,

  inputSchema: permissionPatternToggleSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionSystemToggleTool = {
  name: 'permission_system_toggle',

  title: '시스템 토글',

  description: `권한 시스템 전체를 활성화/비활성화합니다.

⚠️ 비활성화 시 모든 위험 작업이 확인 없이 실행됩니다.`,

  inputSchema: permissionSystemToggleSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const permissionClearSessionTool = {
  name: 'permission_clear_session',

  title: '세션 초기화',

  description: `세션 동안 부여된 모든 권한을 초기화합니다.`,

  inputSchema: permissionClearSessionSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handlePermissionCheck(
  params: z.infer<typeof permissionCheckSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();

  const result = manager.checkPermission({
    toolName: params.tool_name,
    command: params.command,
    filePath: params.file_path,
    prompt: params.prompt
  });

  const riskInfo = manager.getRiskLevelInfo(result.riskLevel);

  let response = `## 🔒 권한 확인 결과\n\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| 허용 | ${result.allowed ? '✅ 예' : '❌ 아니오'} |\n`;
  response += `| 확인 필요 | ${result.requiresConfirmation ? '⚠️ 예' : '아니오'} |\n`;
  response += `| 위험 레벨 | ${riskInfo.emoji} ${riskInfo.label} |\n`;
  response += `| 사유 | ${result.reason} |\n\n`;

  if (result.matchedPatterns.length > 0) {
    response += `### 매칭된 패턴 (${result.matchedPatterns.length}개)\n\n`;
    response += `| 패턴 | 카테고리 | 위험 레벨 |\n`;
    response += `|------|----------|----------|\n`;

    for (const pattern of result.matchedPatterns) {
      const pInfo = manager.getRiskLevelInfo(pattern.riskLevel);
      response += `| ${pattern.name} | ${pattern.category} | ${pInfo.emoji} ${pInfo.label} |\n`;
    }
    response += '\n';
  }

  if (result.request) {
    response += `### 📋 권한 요청 생성됨\n\n`;
    response += `**요청 ID**: \`${result.request.id}\`\n`;
    response += `**작업**: ${result.request.operation}\n`;
    response += `**만료**: ${new Date(result.request.expiresAt!).toLocaleString('ko-KR')}\n\n`;
    response += `\`permission_grant request_id="${result.request.id}"\`로 승인하거나\n`;
    response += `\`permission_deny request_id="${result.request.id}"\`로 거부하세요.`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handlePermissionGrant(
  params: z.infer<typeof permissionGrantSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();

  const request = manager.grantPermission(params.request_id, {
    grantForSession: params.grant_for_session,
    reason: params.reason
  });

  if (!request) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 요청을 찾을 수 없음\n\nID \`${params.request_id}\`에 해당하는 대기 중인 요청이 없습니다.\n요청이 만료되었거나 이미 처리되었을 수 있습니다.`
      }]
    };
  }

  const riskInfo = manager.getRiskLevelInfo(request.riskLevel);

  let response = `## ✅ 권한 승인됨\n\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| 요청 ID | \`${request.id}\` |\n`;
  response += `| 작업 | ${request.operation} |\n`;
  response += `| 위험 레벨 | ${riskInfo.emoji} ${riskInfo.label} |\n`;
  response += `| 세션 승인 | ${params.grant_for_session ? '✅ 예' : '아니오'} |\n`;

  if (params.reason) {
    response += `| 승인 이유 | ${params.reason} |\n`;
  }

  if (params.grant_for_session) {
    response += `\n*세션 동안 동일 패턴의 작업이 자동 승인됩니다.*`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handlePermissionDeny(
  params: z.infer<typeof permissionDenySchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();

  const request = manager.denyPermission(params.request_id, params.reason);

  if (!request) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 요청을 찾을 수 없음\n\nID \`${params.request_id}\`에 해당하는 대기 중인 요청이 없습니다.`
      }]
    };
  }

  const riskInfo = manager.getRiskLevelInfo(request.riskLevel);

  let response = `## 🚫 권한 거부됨\n\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| 요청 ID | \`${request.id}\` |\n`;
  response += `| 작업 | ${request.operation} |\n`;
  response += `| 위험 레벨 | ${riskInfo.emoji} ${riskInfo.label} |\n`;

  if (params.reason) {
    response += `| 거부 이유 | ${params.reason} |\n`;
  }

  response += `\n*해당 작업이 실행되지 않습니다.*`;

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handlePermissionList(
  params: z.infer<typeof permissionListSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();
  const isEnabled = manager.isEnabled();
  const stats = manager.getStats();
  const pendingRequests = manager.listPendingRequests();

  let response = `## 🔒 권한 시스템 상태\n\n`;
  response += `**시스템 상태**: ${isEnabled ? '✅ 활성' : '❌ 비활성'}\n\n`;

  // 통계
  response += `### 통계\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| 검사 수행 | ${stats.checksPerformed} |\n`;
  response += `| 승인됨 | ${stats.permissionsGranted} |\n`;
  response += `| 거부됨 | ${stats.permissionsDenied} |\n`;
  response += `| 자동 승인 | ${stats.autoGranted} |\n`;
  response += `| 대기 중 | ${stats.pendingCount} |\n`;
  response += `| 세션 승인 | ${stats.sessionGrantsCount} |\n\n`;

  // 대기 중인 요청
  if (pendingRequests.length > 0) {
    response += `### ⏳ 대기 중인 요청 (${pendingRequests.length}개)\n\n`;
    response += `| ID | 작업 | 위험 | 만료 |\n`;
    response += `|----|------|------|------|\n`;

    for (const req of pendingRequests) {
      const riskInfo = manager.getRiskLevelInfo(req.riskLevel);
      const expires = new Date(req.expiresAt!).toLocaleTimeString('ko-KR');
      response += `| \`${req.id.substring(0, 12)}...\` | ${req.operation.substring(0, 30)}... | ${riskInfo.emoji} | ${expires} |\n`;
    }
    response += '\n';
  }

  // 패턴 목록
  if (params.include_patterns) {
    const patterns = manager.listPatterns(params.include_disabled);
    response += `### 위험 패턴 (${patterns.length}개)\n\n`;
    response += `| 이름 | 카테고리 | 위험 | 확인 필요 | 상태 |\n`;
    response += `|------|----------|------|----------|------|\n`;

    for (const pattern of patterns) {
      const riskInfo = manager.getRiskLevelInfo(pattern.riskLevel);
      const status = pattern.enabled ? '✅' : '❌';
      const confirm = pattern.requiresConfirmation ? '예' : '자동';
      response += `| ${pattern.name} | ${pattern.category} | ${riskInfo.emoji} | ${confirm} | ${status} |\n`;
    }
    response += '\n';
  }

  // 규칙 목록
  if (params.include_rules) {
    const rules = manager.listRules();
    if (rules.length > 0) {
      response += `### 규칙 (${rules.length}개)\n\n`;
      response += `| 이름 | 동작 | 우선순위 | 상태 |\n`;
      response += `|------|------|----------|------|\n`;

      for (const rule of rules) {
        const status = rule.enabled ? '✅' : '❌';
        response += `| ${rule.name} | ${rule.action} | ${rule.priority} | ${status} |\n`;
      }
      response += '\n';
    }
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handlePermissionPatternToggle(
  params: z.infer<typeof permissionPatternToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();

  const success = manager.togglePattern(params.pattern_id, params.enabled);

  if (!success) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 패턴을 찾을 수 없음\n\nID \`${params.pattern_id}\`에 해당하는 패턴이 없습니다.`
      }]
    };
  }

  const action = params.enabled ? '활성화' : '비활성화';

  return {
    content: [{
      type: 'text',
      text: `## ✅ 패턴 ${action}됨\n\n**패턴 ID**: \`${params.pattern_id}\`\n**상태**: ${params.enabled ? '✅ 활성' : '❌ 비활성'}`
    }]
  };
}

export async function handlePermissionSystemToggle(
  params: z.infer<typeof permissionSystemToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getPermissionManager();
  manager.setEnabled(params.enabled);

  const action = params.enabled ? '활성화' : '비활성화';

  let response = `## ✅ 권한 시스템 ${action}됨\n\n`;

  if (!params.enabled) {
    response += `⚠️ **경고**: 권한 시스템이 비활성화되었습니다.\n`;
    response += `모든 위험 작업이 확인 없이 실행됩니다.`;
  } else {
    response += `권한 시스템이 활성화되었습니다.\n`;
    response += `위험 작업 수행 전 확인이 요청됩니다.`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handlePermissionClearSession(
  params: z.infer<typeof permissionClearSessionSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!params.confirm) {
    return {
      content: [{
        type: 'text',
        text: `## ⚠️ 확인 필요\n\n세션 권한을 초기화하려면 \`confirm=true\`를 설정하세요.\n\n이 작업은 세션 동안 승인된 모든 권한을 취소합니다.`
      }]
    };
  }

  const manager = getPermissionManager();
  const stats = manager.getStats();
  const previousGrants = stats.sessionGrantsCount;

  manager.clearSession();

  return {
    content: [{
      type: 'text',
      text: `## ✅ 세션 초기화 완료\n\n**초기화된 세션 승인**: ${previousGrants}개\n\n이제 위험 작업 수행 시 다시 확인이 요청됩니다.`
    }]
  };
}
