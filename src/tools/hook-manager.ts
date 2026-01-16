// src/tools/hook-manager.ts

/**
 * Hook Manager MCP Tool
 *
 * Provides MCP tools for managing the hook system.
 */

import { z } from 'zod';
import {
  getHookManager,
  getRateLimitState,
  getErrorStats
} from '../hooks/index.js';
import { logger } from '../utils/logger.js';

/**
 * Input schema for hook_status tool.
 */
export const hookStatusSchema = z.object({
  include_hooks: z.boolean()
    .default(false)
    .optional()
    .describe('Include list of registered hooks'),
  include_stats: z.boolean()
    .default(true)
    .optional()
    .describe('Include hook execution statistics')
});

/**
 * Input schema for hook_toggle tool.
 */
export const hookToggleSchema = z.object({
  hook_id: z.string()
    .describe('Hook ID to enable/disable'),
  enabled: z.boolean()
    .describe('Whether to enable or disable the hook')
});

/**
 * Input schema for hook_system_toggle tool.
 */
export const hookSystemToggleSchema = z.object({
  enabled: z.boolean()
    .describe('Whether to enable or disable the entire hook system')
});

/**
 * Tool definition for hook_status.
 */
export const hookStatusTool = {
  name: 'hook_status',
  description: `Hook 시스템 상태 확인

현재 등록된 훅, 실행 통계, 시스템 상태를 확인합니다.

## 정보
- 등록된 내부/외부 훅 목록
- 훅 실행 통계 (성공/실패/블록)
- Rate limit 상태
- 에러 추적 상태`
};

/**
 * Tool definition for hook_toggle.
 */
export const hookToggleTool = {
  name: 'hook_toggle',
  description: `특정 훅 활성화/비활성화

개별 훅을 켜거나 끕니다.`
};

/**
 * Tool definition for hook_system_toggle.
 */
export const hookSystemToggleTool = {
  name: 'hook_system_toggle',
  description: `전체 Hook 시스템 활성화/비활성화

모든 훅을 일괄적으로 켜거나 끕니다.`
};

/**
 * Handles hook_status tool invocation.
 */
export async function handleHookStatus(
  params: z.infer<typeof hookStatusSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  const systemStats = manager.getSystemStats();
  const config = manager.getConfig();

  let output = `## 🪝 Hook System Status

### 시스템 상태
| 항목 | 값 |
|------|-----|
| 활성화 | ${config.enabled ? '✅ 예' : '❌ 아니오'} |
| 총 훅 수 | ${systemStats.totalHooks} |
| 내부 훅 | ${systemStats.internalHooks} |
| 외부 훅 | ${systemStats.externalHooks} |
| 활성 훅 | ${systemStats.enabledHooks} |
| 총 실행 횟수 | ${systemStats.totalExecutions} |
| 업타임 | ${Math.floor(systemStats.uptimeMs / 1000)}초 |
`;

  // Include hook list if requested
  if (params.include_hooks) {
    const hooks = manager.getRegisteredHooks();

    output += `\n### 등록된 내부 훅 (${hooks.internal.length}개)\n`;
    if (hooks.internal.length === 0) {
      output += '_(없음)_\n';
    } else {
      output += '| ID | 이름 | 이벤트 | 우선순위 | 상태 |\n';
      output += '|----|------|--------|----------|------|\n';
      for (const hook of hooks.internal) {
        output += `| \`${hook.id}\` | ${hook.name} | ${hook.eventType} | ${hook.priority} | ${hook.enabled ? '✅' : '❌'} |\n`;
      }
    }

    output += `\n### 등록된 외부 훅 (${hooks.external.length}개)\n`;
    if (hooks.external.length === 0) {
      output += '_(없음)_\n';
    } else {
      output += '| ID | 이름 | 이벤트 | 명령어 | 상태 |\n';
      output += '|----|------|--------|--------|------|\n';
      for (const hook of hooks.external) {
        const shortCmd = hook.command.length > 30
          ? hook.command.substring(0, 30) + '...'
          : hook.command;
        output += `| \`${hook.id}\` | ${hook.name} | ${hook.eventType} | \`${shortCmd}\` | ${hook.enabled ? '✅' : '❌'} |\n`;
      }
    }
  }

  // Include stats if requested
  if (params.include_stats) {
    const hookStats = manager.getStats();

    if (hookStats.size > 0) {
      output += `\n### 훅 실행 통계\n`;
      output += '| Hook ID | 총 실행 | 성공 | 실패 | 평균 시간 |\n';
      output += '|---------|---------|------|------|----------|\n';

      for (const [hookId, stats] of hookStats) {
        if (stats.totalExecutions > 0) {
          output += `| \`${hookId.substring(0, 30)}\` | ${stats.totalExecutions} | ${stats.successfulExecutions} | ${stats.failedExecutions} | ${stats.averageExecutionTimeMs.toFixed(1)}ms |\n`;
        }
      }
    }

    // Rate limit state
    const rateLimitState = getRateLimitState();
    if (Object.keys(rateLimitState.providerLimits).length > 0 ||
        Object.keys(rateLimitState.modelLimits).length > 0) {
      output += `\n### Rate Limit 상태\n`;
      output += `- 연속 Rate Limit: ${rateLimitState.consecutiveRateLimits}회\n`;

      if (Object.keys(rateLimitState.providerLimits).length > 0) {
        output += `- Provider 제한: ${JSON.stringify(rateLimitState.providerLimits)}\n`;
      }
      if (Object.keys(rateLimitState.modelLimits).length > 0) {
        output += `- Model 제한: ${JSON.stringify(rateLimitState.modelLimits)}\n`;
      }
    }

    // Error state
    const errorStats = getErrorStats();
    if (errorStats.totalErrors > 0) {
      output += `\n### 에러 추적\n`;
      output += `- 총 에러: ${errorStats.totalErrors}\n`;
      output += `- 복구된 에러: ${errorStats.recoveredErrors}\n`;

      if (Object.keys(errorStats.recentErrorsBySource).length > 0) {
        output += `- 최근 5분 에러:\n`;
        for (const [source, count] of Object.entries(errorStats.recentErrorsBySource)) {
          output += `  - ${source}: ${count}건\n`;
        }
      }
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: output
    }]
  };
}

/**
 * Handles hook_toggle tool invocation.
 */
export async function handleHookToggle(
  params: z.infer<typeof hookToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  const success = manager.setHookEnabled(params.hook_id, params.enabled);

  if (!success) {
    return {
      content: [{
        type: 'text' as const,
        text: `## ❌ 훅을 찾을 수 없음

Hook ID \`${params.hook_id}\`가 존재하지 않습니다.

\`hook_status\` 도구로 등록된 훅 목록을 확인하세요.`
      }]
    };
  }

  logger.info({
    hookId: params.hook_id,
    enabled: params.enabled
  }, 'Hook toggled');

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ 훅 ${params.enabled ? '활성화' : '비활성화'}됨

**Hook ID**: \`${params.hook_id}\`
**상태**: ${params.enabled ? '✅ 활성' : '❌ 비활성'}`
    }]
  };
}

/**
 * Handles hook_system_toggle tool invocation.
 */
export async function handleHookSystemToggle(
  params: z.infer<typeof hookSystemToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  manager.setEnabled(params.enabled);

  logger.info({ enabled: params.enabled }, 'Hook system toggled');

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ Hook 시스템 ${params.enabled ? '활성화' : '비활성화'}됨

**상태**: ${params.enabled ? '✅ 모든 훅이 실행됩니다' : '❌ 모든 훅이 비활성화됩니다'}

${!params.enabled ? '⚠️ Hook 시스템이 비활성화되면 로깅, 컨텍스트 주입, 에러 추적 등의 기능이 작동하지 않습니다.' : ''}`
    }]
  };
}

export default {
  hookStatusTool,
  hookStatusSchema,
  handleHookStatus,
  hookToggleTool,
  hookToggleSchema,
  handleHookToggle,
  hookSystemToggleTool,
  hookSystemToggleSchema,
  handleHookSystemToggle
};
