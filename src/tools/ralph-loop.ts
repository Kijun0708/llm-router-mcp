// src/tools/ralph-loop.ts

/**
 * Ralph Loop MCP Tools
 *
 * Provides MCP tools for executing and controlling Ralph Loop tasks.
 */

import { z } from 'zod';
import {
  RalphLoopManager,
  createRalphLoopManager,
  RalphLoopResult
} from '../features/ralph-loop/index.js';
import { logger } from '../utils/logger.js';

// Schema definitions
export const ralphLoopStartSchema = z.object({
  prompt: z.string().min(10).describe('작업 내용 (최소 10자)'),
  max_iterations: z.number().min(1).max(50).default(10).optional()
    .describe('최대 반복 횟수 (기본: 10, 최대: 50)'),
  completion_promise: z.string().default('DONE').optional()
    .describe('완료 시 출력할 프라미스 텍스트 (기본: "DONE")'),
  expert: z.enum(['strategist', 'codereview', 'frontend', 'metis', 'momus', 'security', 'tester', 'data', 'devops', 'reality_checker', 'lsp_index_engineer'])
    .default('strategist').optional()
    .describe('작업에 사용할 전문가 (기본: strategist)'),
  context: z.string().optional()
    .describe('추가 컨텍스트 정보')
});

export const ralphLoopCancelSchema = z.object({});

export const ralphLoopStatusSchema = z.object({});

// Tool definitions
export const ralphLoopStartTool = {
  name: 'ralph_loop_start',
  description: `Ralph Loop 실행 - 완료될 때까지 자동으로 반복 실행

작업이 완료되면 <promise>DONE</promise>을 출력해야 합니다.
완료 프라미스가 감지되면 자동 종료, 미감지 시 자동 재시도합니다.

사용 예:
- 복잡한 분석 작업 (여러 단계 필요)
- 반복적인 개선 작업 (품질 달성까지)
- 검증이 필요한 작업 (성공까지 재시도)`
};

export const ralphLoopCancelTool = {
  name: 'ralph_loop_cancel',
  description: '실행 중인 Ralph Loop 취소'
};

export const ralphLoopStatusTool = {
  name: 'ralph_loop_status',
  description: '현재 Ralph Loop 상태 확인'
};

// Singleton manager instance
let managerInstance: RalphLoopManager | null = null;

function getManager(): RalphLoopManager {
  if (!managerInstance) {
    managerInstance = createRalphLoopManager(process.cwd());
  }
  return managerInstance;
}

// Handler implementations
export async function handleRalphLoopStart(
  args: z.infer<typeof ralphLoopStartSchema>
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const manager = getManager();

  // Check if a loop is already running
  if (manager.isActive()) {
    const state = manager.getState();
    return {
      content: [{
        type: 'text',
        text: `## ⚠️ Ralph Loop Already Active

**현재 상태**: 이미 실행 중인 Ralph Loop이 있습니다.
**반복 횟수**: ${state?.iteration}/${state?.maxIterations}
**시작 시간**: ${state?.startedAt}

새로운 루프를 시작하려면 먼저 \`ralph_loop_cancel\`로 취소하세요.`
      }]
    };
  }

  const taskId = `ralph_${Date.now()}`;

  logger.info({
    taskId,
    prompt: args.prompt.substring(0, 100),
    maxIterations: args.max_iterations,
    expert: args.expert
  }, 'Starting Ralph Loop');

  try {
    const result = await manager.execute(taskId, args.prompt, {
      maxIterations: args.max_iterations,
      completionPromise: args.completion_promise,
      expert: args.expert,
      context: args.context
    });

    return {
      content: [{
        type: 'text',
        text: formatRalphLoopResult(result)
      }]
    };
  } catch (error) {
    logger.error({ error, taskId }, 'Ralph Loop execution failed');

    return {
      content: [{
        type: 'text',
        text: `## ❌ Ralph Loop 실행 실패

**오류**: ${error instanceof Error ? error.message : 'Unknown error'}

다시 시도하거나 작업을 단순화해보세요.`
      }]
    };
  }
}

export async function handleRalphLoopCancel(): Promise<{ content: { type: 'text'; text: string }[] }> {
  const manager = getManager();
  const state = manager.getState();

  if (!state?.active) {
    return {
      content: [{
        type: 'text',
        text: `## ℹ️ 실행 중인 Ralph Loop 없음

현재 활성화된 Ralph Loop이 없습니다.`
      }]
    };
  }

  const cancelled = manager.cancel();

  if (cancelled) {
    return {
      content: [{
        type: 'text',
        text: `## ✅ Ralph Loop 취소됨

**작업 ID**: ${state.taskId}
**반복 횟수**: ${state.iteration}/${state.maxIterations}
**실행 시간**: ${state.startedAt}

루프가 성공적으로 취소되었습니다.`
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: `## ⚠️ 취소 실패

Ralph Loop 취소에 실패했습니다. 상태 파일을 확인하세요.`
    }]
  };
}

export async function handleRalphLoopStatus(): Promise<{ content: { type: 'text'; text: string }[] }> {
  const manager = getManager();
  const state = manager.getState();

  if (!state) {
    return {
      content: [{
        type: 'text',
        text: `## ℹ️ Ralph Loop 상태

**상태**: 비활성
**설명**: 현재 실행 중인 Ralph Loop이 없습니다.

새 루프를 시작하려면 \`ralph_loop_start\`를 사용하세요.`
      }]
    };
  }

  const elapsedMs = Date.now() - new Date(state.startedAt).getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);

  return {
    content: [{
      type: 'text',
      text: `## 🔄 Ralph Loop 상태

**상태**: ${state.active ? '✅ 활성' : '⏹️ 비활성'}
**작업 ID**: ${state.taskId || 'N/A'}
**반복 횟수**: ${state.iteration}/${state.maxIterations}
**완료 프라미스**: \`<promise>${state.completionPromise}</promise>\`
**전문가**: ${state.expert || 'strategist'}
**시작 시간**: ${state.startedAt}
**경과 시간**: ${elapsedSec}초

### 원본 작업
\`\`\`
${state.prompt.substring(0, 500)}${state.prompt.length > 500 ? '...' : ''}
\`\`\`

${state.lastOutput ? `### 마지막 출력 (일부)
\`\`\`
${state.lastOutput.substring(0, 300)}${state.lastOutput.length > 300 ? '...' : ''}
\`\`\`` : ''}`
    }]
  };
}

/**
 * Formats the Ralph Loop result for display.
 */
function formatRalphLoopResult(result: RalphLoopResult): string {
  const statusEmoji = result.completed ? '✅' : (result.cancelled ? '⏹️' : '⚠️');
  const statusText = result.completed
    ? 'COMPLETE'
    : (result.cancelled ? 'CANCELLED' : (result.maxIterationsReached ? 'MAX_ITERATIONS' : 'FAILED'));

  const seconds = Math.floor(result.totalTimeMs / 1000);

  let output = `## ${statusEmoji} Ralph Loop ${statusText}

### 실행 요약
| 항목 | 값 |
|------|-----|
| 완료 여부 | ${result.completed ? '✅ 예' : '❌ 아니오'} |
| 반복 횟수 | ${result.iterations} |
| 최대 반복 도달 | ${result.maxIterationsReached ? '예' : '아니오'} |
| 취소됨 | ${result.cancelled ? '예' : '아니오'} |
| 총 소요 시간 | ${seconds}초 |
${result.detectedPromise ? `| 감지된 프라미스 | \`<promise>${result.detectedPromise}</promise>\` |` : ''}

### 결과
${result.output}`;

  if (!result.completed && result.maxIterationsReached) {
    output += `

---
⚠️ **최대 반복 횟수에 도달했습니다.**
작업이 완료되지 않았을 수 있습니다. 더 많은 반복이 필요하면 \`max_iterations\`를 늘려서 다시 시도하세요.`;
  }

  return output;
}
