// src/tools/boulder-state.ts

/**
 * Boulder State MCP Tools
 *
 * Tools for managing Boulder State - persistent workflow state for crash recovery.
 */

import { z } from 'zod';
import {
  getBoulderManager,
  BoulderSummary,
  BoulderState
} from '../features/boulder-state/index.js';

// ============================================================================
// Tool Schemas
// ============================================================================

export const boulderStatusSchema = z.object({
  include_history: z.boolean()
    .default(false)
    .optional()
    .describe('Include recent boulder history')
}).strict();

export const boulderRecoverSchema = z.object({
  action: z.enum(['check', 'resume', 'cancel'])
    .describe('Recovery action: check (check for crashed boulders), resume (resume crashed), cancel (cancel current)')
}).strict();

export const boulderDetailSchema = z.object({
  boulder_id: z.string()
    .describe('Boulder ID to get details for')
}).strict();

// ============================================================================
// Tool Definitions
// ============================================================================

export const boulderStatusTool = {
  name: 'boulder_status',

  title: 'Boulder State 상태 확인',

  description: `현재 Boulder State 상태를 확인합니다.

Boulder State는 워크플로우 크래시 복구를 위한 영속적 상태 관리 시스템입니다.

## 반환 정보
- 현재 활성 Boulder 상태
- 크래시된 Boulder 감지
- 최근 Boulder 히스토리 (옵션)

## 사용 시점
- 워크플로우 실행 전 상태 확인
- 크래시 복구 가능 여부 확인
- 디버깅 및 모니터링`,

  inputSchema: boulderStatusSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const boulderRecoverTool = {
  name: 'boulder_recover',

  title: 'Boulder State 복구 관리',

  description: `Boulder State 복구 작업을 수행합니다.

## 액션
- **check**: 크래시된 Boulder가 있는지 확인하고 복구 정보 제공
- **resume**: 크래시된 Boulder를 재개 (active 상태로 변경)
- **cancel**: 현재 활성 Boulder를 취소

## 사용 시점
- 서버 재시작 후 크래시 복구
- 스택된 워크플로우 취소
- 복구 가능 여부 진단`,

  inputSchema: boulderRecoverSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }
};

export const boulderDetailTool = {
  name: 'boulder_detail',

  title: 'Boulder 상세 정보',

  description: `특정 Boulder의 상세 정보를 조회합니다.

## 반환 정보
- Boulder 기본 정보 (ID, 상태, 요청)
- 페이즈 체크포인트 히스토리
- 구현 시도 내역
- 에스컬레이션 정보

## 사용 시점
- 특정 워크플로우 디버깅
- 실패 원인 분석
- 에스컬레이션 리포트 생성`,

  inputSchema: boulderDetailSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleBoulderStatus(
  params: z.infer<typeof boulderStatusSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getBoulderManager();

  const currentBoulder = manager.getCurrentBoulder();
  const crashCheck = manager.checkForCrashedBoulder();

  let response = '## 🪨 Boulder State 상태\n\n';

  // Current boulder status
  if (currentBoulder) {
    response += '### 현재 활성 Boulder\n';
    response += `| 항목 | 값 |\n`;
    response += `|------|-----|\n`;
    response += `| ID | \`${currentBoulder.id}\` |\n`;
    response += `| 상태 | ${formatStatus(currentBoulder.status)} |\n`;
    response += `| 현재 페이즈 | ${currentBoulder.currentPhase} |\n`;
    response += `| 요청 | ${currentBoulder.request.substring(0, 50)}... |\n`;
    response += `| 시도 횟수 | ${currentBoulder.implementationAttempts.length}/${currentBoulder.maxAttempts} |\n`;
    response += `| 생성 시간 | ${formatTime(currentBoulder.createdAt)} |\n`;
    response += `| 에스컬레이션 | ${currentBoulder.escalationRequired ? '⚠️ 필요' : '✅ 불필요'} |\n`;
    response += '\n';
  } else {
    response += '### 현재 활성 Boulder\n없음\n\n';
  }

  // Crash check
  if (crashCheck.canRecover) {
    response += '### ⚠️ 크래시 감지\n';
    response += `${crashCheck.message}\n\n`;
    if (crashCheck.suggestions) {
      response += '**복구 제안:**\n';
      crashCheck.suggestions.forEach(s => {
        response += `- ${s}\n`;
      });
      response += '\n';
    }
    response += '`boulder_recover` 도구를 사용하여 복구할 수 있습니다.\n\n';
  }

  // History
  if (params.include_history) {
    const history = manager.listHistory();
    if (history.length > 0) {
      response += '### 최근 Boulder 히스토리\n';
      response += '| ID | 상태 | 페이즈 | 시도 | 요청 |\n';
      response += '|----|------|--------|------|------|\n';
      history.slice(0, 10).forEach((b: BoulderSummary) => {
        response += `| \`${b.id}\` | ${formatStatus(b.status)} | ${b.currentPhase} | ${b.attemptsMade} | ${b.requestPreview.substring(0, 30)}... |\n`;
      });
      response += '\n';
    }
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleBoulderRecover(
  params: z.infer<typeof boulderRecoverSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getBoulderManager();

  switch (params.action) {
    case 'check': {
      const recovery = manager.checkForCrashedBoulder();

      if (!recovery.canRecover) {
        return {
          content: [{
            type: 'text',
            text: '## ✅ 크래시된 Boulder 없음\n\n복구가 필요한 Boulder가 없습니다.'
          }]
        };
      }

      let response = '## ⚠️ 크래시된 Boulder 감지\n\n';
      response += `**Boulder ID**: \`${recovery.boulder?.id}\`\n`;
      response += `**마지막 페이즈**: ${recovery.boulder?.currentPhase}\n`;
      response += `**재개 가능 페이즈**: ${recovery.resumeFromPhase}\n\n`;

      if (recovery.suggestions) {
        response += '### 복구 제안\n';
        recovery.suggestions.forEach(s => {
          response += `- ${s}\n`;
        });
        response += '\n';
      }

      response += '`boulder_recover action="resume"`으로 재개하거나 `action="cancel"`로 취소할 수 있습니다.';

      return {
        content: [{ type: 'text', text: response }]
      };
    }

    case 'resume': {
      const boulder = manager.resumeBoulder();

      if (!boulder) {
        return {
          content: [{
            type: 'text',
            text: '## ❌ 재개 실패\n\n재개할 크래시된 Boulder가 없습니다.'
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `## ✅ Boulder 재개됨\n\n` +
                `**Boulder ID**: \`${boulder.id}\`\n` +
                `**상태**: ${formatStatus(boulder.status)}\n` +
                `**현재 페이즈**: ${boulder.currentPhase}\n\n` +
                `\`orchestrate_task\`를 사용하여 워크플로우를 계속할 수 있습니다.`
        }]
      };
    }

    case 'cancel': {
      const boulder = await manager.cancel();

      if (!boulder) {
        return {
          content: [{
            type: 'text',
            text: '## ❌ 취소 실패\n\n취소할 활성 Boulder가 없습니다.'
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `## ✅ Boulder 취소됨\n\n` +
                `**Boulder ID**: \`${boulder.id}\`\n` +
                `**상태**: ${formatStatus(boulder.status)}\n\n` +
                `Boulder가 히스토리에 보관되었습니다.`
        }]
      };
    }

    default:
      return {
        content: [{
          type: 'text',
          text: '## ❌ 알 수 없는 액션\n\n지원되는 액션: check, resume, cancel'
        }]
      };
  }
}

export async function handleBoulderDetail(
  params: z.infer<typeof boulderDetailSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getBoulderManager();
  const boulder = manager.getBoulder(params.boulder_id);

  if (!boulder) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ Boulder를 찾을 수 없음\n\nID \`${params.boulder_id}\`에 해당하는 Boulder가 없습니다.`
      }]
    };
  }

  let response = `## 🪨 Boulder 상세 정보\n\n`;

  // Basic info
  response += '### 기본 정보\n';
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| ID | \`${boulder.id}\` |\n`;
  response += `| 상태 | ${formatStatus(boulder.status)} |\n`;
  response += `| 인텐트 | ${boulder.intent || 'unknown'} |\n`;
  response += `| 현재 페이즈 | ${boulder.currentPhase} |\n`;
  response += `| 생성 시간 | ${formatTime(boulder.createdAt)} |\n`;
  response += `| 업데이트 시간 | ${formatTime(boulder.updatedAt)} |\n`;
  if (boulder.completedAt) {
    response += `| 완료 시간 | ${formatTime(boulder.completedAt)} |\n`;
  }
  if (boulder.totalTimeMs) {
    response += `| 총 소요 시간 | ${Math.round(boulder.totalTimeMs / 1000)}초 |\n`;
  }
  response += '\n';

  // Request
  response += '### 요청\n';
  response += `\`\`\`\n${boulder.request}\n\`\`\`\n\n`;

  // Checkpoints
  if (boulder.checkpoints.length > 0) {
    response += '### 페이즈 체크포인트\n';
    response += '| 페이즈 | 상태 | 시작 시간 | 완료 시간 |\n';
    response += '|--------|------|----------|----------|\n';
    boulder.checkpoints.forEach(cp => {
      const status = cp.success === undefined ? '⏳ 진행 중' : (cp.success ? '✅ 성공' : '❌ 실패');
      response += `| ${cp.phaseId} | ${status} | ${formatTime(cp.startedAt)} | ${cp.completedAt ? formatTime(cp.completedAt) : '-'} |\n`;
    });
    response += '\n';
  }

  // Implementation attempts
  if (boulder.implementationAttempts.length > 0) {
    response += `### 구현 시도 (${boulder.implementationAttempts.length}/${boulder.maxAttempts})\n`;
    boulder.implementationAttempts.forEach(attempt => {
      response += `\n**시도 #${attempt.attemptNumber}** (${attempt.expert})\n`;
      response += `- 시간: ${formatTime(attempt.timestamp)}\n`;
      response += `- 결과: ${attempt.success ? '✅ 성공' : '❌ 실패'}\n`;
      if (attempt.approach) {
        response += `- 접근 방식: ${attempt.approach}\n`;
      }
      if (attempt.error) {
        response += `- 오류: ${attempt.error}\n`;
      }
    });
    response += '\n';
  }

  // Escalation
  if (boulder.escalationRequired) {
    response += '### ⚠️ 에스컬레이션 필요\n';
    response += `**이유**: ${boulder.escalationReason || '알 수 없음'}\n\n`;

    // Generate escalation report
    const report = manager.generateEscalationReport(boulder);
    response += '### 에스컬레이션 리포트\n';
    response += '```\n' + report + '\n```\n';
  }

  // Final output
  if (boulder.finalOutput) {
    response += '### 최종 출력\n';
    response += `\`\`\`\n${boulder.finalOutput.substring(0, 500)}${boulder.finalOutput.length > 500 ? '...' : ''}\n\`\`\`\n`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

// ============================================================================
// Helpers
// ============================================================================

function formatStatus(status: string): string {
  const statusIcons: Record<string, string> = {
    'active': '🔄 활성',
    'paused': '⏸️ 일시정지',
    'crashed': '💥 크래시',
    'completed': '✅ 완료',
    'failed': '❌ 실패',
    'cancelled': '🚫 취소'
  };
  return statusIcons[status] || status;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
