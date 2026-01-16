// src/hooks/builtin/permission-checker.ts

/**
 * Permission Checker Hook
 *
 * 도구 호출 시 위험 작업을 감지하고 권한 확인을 요청합니다.
 */

import {
  HookDefinition,
  HookResult,
  DEFAULT_HOOK_RESULT,
  OnToolCallContext
} from '../types.js';
import { getHookManager } from '../manager.js';
import { getPermissionManager, RISK_LEVEL_INFO } from '../../features/permission-system/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Permission checker hook for tool calls
 */
const permissionCheckerOnToolCall: HookDefinition<OnToolCallContext> = {
  id: 'builtin_permission_checker',
  name: 'Permission Checker',
  description: '도구 호출 시 위험 작업을 감지하고 권한 확인을 요청합니다.',
  eventType: 'onToolCall',
  priority: 'critical', // 가장 먼저 실행
  enabled: true,
  handler: async (context: OnToolCallContext): Promise<HookResult> => {
    const manager = getPermissionManager();

    // 시스템 비활성화 시 스킵
    if (!manager.isEnabled()) {
      return DEFAULT_HOOK_RESULT;
    }

    // 자체 권한 도구는 검사하지 않음
    if (context.toolName.startsWith('permission_')) {
      return DEFAULT_HOOK_RESULT;
    }

    // 읽기 전용 도구는 검사하지 않음 (일반적으로 안전)
    const readOnlyTools = [
      'keyword_list', 'keyword_detect',
      'hook_status', 'external_hook_list',
      'boulder_status', 'boulder_detail',
      'memory_list', 'auth_status',
      'llm_router_health', 'background_expert_list',
      'background_expert_result', 'ralph_loop_status'
    ];
    if (readOnlyTools.includes(context.toolName)) {
      return DEFAULT_HOOK_RESULT;
    }

    // 권한 확인
    const result = manager.checkPermission({
      toolName: context.toolName,
      toolInput: context.toolInput,
      command: context.toolInput?.command as string,
      filePath: context.toolInput?.file_path as string || context.toolInput?.filePath as string,
      prompt: context.toolInput?.prompt as string
    });

    // 허용된 경우 계속 진행
    if (result.allowed) {
      if (result.matchedPatterns.length > 0) {
        logger.debug({
          toolName: context.toolName,
          reason: result.reason
        }, 'Permission auto-granted');
      }
      return DEFAULT_HOOK_RESULT;
    }

    // 확인이 필요한 경우 메시지 주입
    if (result.requiresConfirmation && result.request) {
      const riskInfo = RISK_LEVEL_INFO[result.riskLevel];
      const patternNames = result.matchedPatterns.map(p => p.name).join(', ');

      logger.warn({
        toolName: context.toolName,
        riskLevel: result.riskLevel,
        requestId: result.request.id,
        patterns: patternNames
      }, 'Permission required for risky operation');

      // 블록하고 메시지 표시
      return {
        decision: 'block',
        reason: `위험 작업 감지: ${patternNames}`,
        injectMessage: [
          `## ${riskInfo.emoji} 권한 확인 필요`,
          '',
          `**위험 레벨**: ${riskInfo.emoji} ${riskInfo.label}`,
          `**감지된 패턴**: ${patternNames}`,
          `**작업**: ${result.request.operation}`,
          '',
          `**요청 ID**: \`${result.request.id}\``,
          '',
          '승인하려면:',
          '```',
          `permission_grant request_id="${result.request.id}"`,
          '```',
          '',
          '세션 동안 자동 승인하려면:',
          '```',
          `permission_grant request_id="${result.request.id}" grant_for_session=true`,
          '```',
          '',
          '거부하려면:',
          '```',
          `permission_deny request_id="${result.request.id}"`,
          '```'
        ].join('\n')
      };
    }

    return DEFAULT_HOOK_RESULT;
  }
};

/**
 * Permission checker hook definitions
 */
export const permissionCheckerHooks: HookDefinition[] = [
  permissionCheckerOnToolCall as HookDefinition
];

/**
 * Registers permission checker hooks.
 */
export function registerPermissionCheckerHooks(): void {
  const manager = getHookManager();

  for (const hook of permissionCheckerHooks) {
    manager.registerHook(hook);
  }

  logger.info({ hookCount: permissionCheckerHooks.length }, 'Permission checker hooks registered');
}
