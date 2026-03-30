// src/tools/orchestrate-task.ts

/**
 * Orchestrate Task MCP Tool
 *
 * Exposes the phase-based workflow system as an MCP tool.
 * Provides autonomous multi-phase task execution with:
 * - Intent classification
 * - Codebase assessment
 * - Expert delegation
 * - Failure recovery (3-strike protocol)
 */

import { z } from 'zod';
import {
  WorkflowOrchestrator,
  WorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
  IntentType
} from '../workflow/index.js';
import {
  createRalphLoopManager,
  RalphLoopResult
} from '../features/ralph-loop/index.js';
import { logger } from '../utils/logger.js';
import { wrapMcpResponse } from '../utils/response-saver.js';

// Expert selection by intent for Ralph Loop mode
const INTENT_TO_EXPERT: Record<string, string> = {
  conceptual: 'strategist',
  implementation: 'strategist',
  debugging: 'strategist',
  refactoring: 'codereview',
  research: 'strategist',
  review: 'codereview',
  documentation: 'writer'
};

/**
 * Input schema for orchestrate_task tool.
 */
export const orchestrateTaskSchema = z.object({
  request: z.string()
    .min(10)
    .describe('The task to execute (describe what you want to accomplish)'),

  intent_hint: z.enum([
    'conceptual',
    'implementation',
    'debugging',
    'refactoring',
    'research',
    'review',
    'documentation'
  ])
    .optional()
    .describe('Optional hint for task classification (auto-detected if not provided)'),

  max_attempts: z.number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Maximum implementation attempts before escalation (default: 3)'),

  timeout_minutes: z.number()
    .min(1)
    .max(30)
    .default(10)
    .describe('Overall workflow timeout in minutes (default: 10)'),

  skip_exploration: z.boolean()
    .default(false)
    .describe('Skip the exploration phase (faster but less context)'),

  // Ralph Loop options
  use_ralph_loop: z.boolean()
    .default(false)
    .describe('Enable Ralph Loop mode for iterative task completion (auto-retry until done)'),

  ralph_max_iterations: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .optional()
    .describe('Max Ralph Loop iterations (default: 10, only used when use_ralph_loop=true)'),

  ralph_completion_promise: z.string()
    .default('DONE')
    .optional()
    .describe('Completion promise text for Ralph Loop (default: "DONE")')
}).strict();

/**
 * Tool definition for MCP server.
 */
export const orchestrateTaskTool = {
  name: 'orchestrate_task',

  title: 'Orchestrate Task',

  description: `복잡한 작업을 단계별 워크플로우로 자동 실행.
Intent분류 → Assessment → Exploration(선택) → Implementation → Recovery(실패시) → Completion
use_ralph_loop=true: 완료될 때까지 반복 실행 모드`,

  inputSchema: orchestrateTaskSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

/**
 * Handles the orchestrate_task tool invocation.
 */
export async function handleOrchestrateTask(
  params: z.infer<typeof orchestrateTaskSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const {
    request,
    intent_hint,
    max_attempts,
    timeout_minutes,
    skip_exploration,
    use_ralph_loop,
    ralph_max_iterations,
    ralph_completion_promise
  } = params;

  logger.info({
    requestLength: request.length,
    intentHint: intent_hint,
    maxAttempts: max_attempts,
    useRalphLoop: use_ralph_loop
  }, 'Starting orchestrated task');

  // Ralph Loop mode
  if (use_ralph_loop) {
    return handleRalphLoopMode(
      request,
      intent_hint,
      ralph_max_iterations ?? 10,
      ralph_completion_promise ?? 'DONE'
    );
  }

  // Normal workflow mode
  // Build workflow config
  const config: Partial<WorkflowConfig> = {
    maxAttempts: max_attempts,
    timeoutMs: timeout_minutes * 60 * 1000
  };

  // Create orchestrator
  const orchestrator = new WorkflowOrchestrator(config);

  try {
    // Execute workflow
    const result = await orchestrator.execute(request, config);

    // Format output
    const output = formatWorkflowResult(result, request);

    return wrapMcpResponse(output, {
      toolName: 'orchestrate_task',
      isWorkflow: true,
      expertInfo: { name: 'Orchestrated Workflow' }
    });
  } catch (error) {
    logger.error({ error }, 'Orchestrated task failed');

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [{
        type: 'text' as const,
        text: formatWorkflowError(errorMessage, request)
      }]
    };
  }
}

/**
 * Handles Ralph Loop execution mode.
 */
async function handleRalphLoopMode(
  request: string,
  intentHint: string | undefined,
  maxIterations: number,
  completionPromise: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const taskId = `orchestrate_ralph_${Date.now()}`;

  // Determine expert based on intent hint or default to strategist
  const expert = intentHint
    ? (INTENT_TO_EXPERT[intentHint] || 'strategist')
    : 'strategist';

  logger.info({
    taskId,
    expert,
    maxIterations,
    completionPromise
  }, 'Starting Ralph Loop mode in orchestrate_task');

  try {
    const manager = createRalphLoopManager(process.cwd());

    // Check if a loop is already running
    if (manager.isActive()) {
      const state = manager.getState();
      return {
        content: [{
          type: 'text' as const,
          text: `## ⚠️ Ralph Loop Already Active

**현재 상태**: 이미 실행 중인 Ralph Loop이 있습니다.
**반복 횟수**: ${state?.iteration}/${state?.maxIterations}
**시작 시간**: ${state?.startedAt}

새로운 루프를 시작하려면 먼저 \`ralph_loop_cancel\`로 취소하세요.`
        }]
      };
    }

    // Build context with the request
    const context = `orchestrate_task에서 실행됨\nIntent: ${intentHint || 'auto-detected'}`;

    // Execute Ralph Loop
    const result = await manager.execute(taskId, request, {
      maxIterations,
      completionPromise,
      expert: expert as 'strategist' | 'codereview' | 'frontend' | 'metis' | 'momus',
      context
    });

    // Format and return result
    return wrapMcpResponse(formatRalphLoopResult(result, request), {
      toolName: 'orchestrate_task',
      isWorkflow: true,
      expertInfo: { name: 'Ralph Loop' }
    });
  } catch (error) {
    logger.error({ error, taskId }, 'Ralph Loop mode failed');

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [{
        type: 'text' as const,
        text: `## ❌ Ralph Loop 실행 실패

### Request
${request.substring(0, 300)}${request.length > 300 ? '...' : ''}

### Error
\`\`\`
${errorMessage}
\`\`\`

### Suggestions
1. Try without Ralph Loop mode (\`use_ralph_loop=false\`)
2. Use \`ralph_loop_start\` directly for more control
3. Check \`llm_router_health\` to verify system status`
      }]
    };
  }
}

/**
 * Formats Ralph Loop result for orchestrate_task output.
 */
function formatRalphLoopResult(result: RalphLoopResult, request: string): string {
  const statusEmoji = result.completed ? '✅' : (result.cancelled ? '⏹️' : '⚠️');
  const statusText = result.completed
    ? 'Completed (Ralph Loop)'
    : (result.cancelled ? 'Cancelled' : (result.maxIterationsReached ? 'Max Iterations Reached' : 'Failed'));

  const seconds = Math.floor(result.totalTimeMs / 1000);

  let output = `## ${statusEmoji} Workflow ${statusText}

### Request
${request.substring(0, 300)}${request.length > 300 ? '...' : ''}

### Execution (Ralph Loop Mode)
| 항목 | 값 |
|------|-----|
| Mode | Ralph Loop |
| 완료 여부 | ${result.completed ? '✅ 예' : '❌ 아니오'} |
| 반복 횟수 | ${result.iterations} |
| 최대 반복 도달 | ${result.maxIterationsReached ? '예' : '아니오'} |
| 취소됨 | ${result.cancelled ? '예' : '아니오'} |
| 총 소요 시간 | ${seconds}초 |
${result.detectedPromise ? `| 감지된 프라미스 | \`<promise>${result.detectedPromise}</promise>\` |` : ''}

---

${result.output}`;

  if (!result.completed && result.maxIterationsReached) {
    output += `

---
⚠️ **최대 반복 횟수에 도달했습니다.**
작업이 완료되지 않았을 수 있습니다. 더 많은 반복이 필요하면 \`ralph_max_iterations\`를 늘려서 다시 시도하세요.`;
  }

  return output;
}

/**
 * Formats successful workflow result.
 */
function formatWorkflowResult(
  result: Awaited<ReturnType<WorkflowOrchestrator['execute']>>,
  originalRequest: string
): string {
  const statusIcon = result.success ? '✅' : '⚠️';
  const statusText = result.success ? 'Completed' : 'Completed with Issues';

  let output = `## ${statusIcon} Workflow ${statusText}

### Request
${originalRequest.substring(0, 300)}${originalRequest.length > 300 ? '...' : ''}

### Classification
- **Intent**: ${result.intent || 'Not classified'}
- **Complexity**: ${result.complexity || 'Not assessed'}

### Execution
- **Phases**: ${result.phasesExecuted.join(' → ')}
- **Time**: ${(result.totalTimeMs / 1000).toFixed(2)}s
- **Attempts**: ${result.attemptsMade}
${result.escalated ? '- **Status**: Escalated to user' : ''}

---

${result.output}
`;

  // Add metadata if available
  if (result.metadata) {
    const meta = result.metadata as Record<string, unknown>;

    if (meta.relevantFiles && Array.isArray(meta.relevantFiles)) {
      output += `\n### Files Involved\n`;
      for (const file of (meta.relevantFiles as string[]).slice(0, 10)) {
        output += `- \`${file}\`\n`;
      }
    }

    if (meta.recoveryActions && Array.isArray(meta.recoveryActions)) {
      output += `\n### Recovery Actions Taken\n`;
      for (const action of meta.recoveryActions as string[]) {
        output += `- ${action}\n`;
      }
    }
  }

  return output;
}

/**
 * Formats workflow error.
 */
function formatWorkflowError(errorMessage: string, request: string): string {
  return `## ❌ Workflow Failed

### Request
${request.substring(0, 300)}${request.length > 300 ? '...' : ''}

### Error
\`\`\`
${errorMessage}
\`\`\`

### Suggestions
1. Try using \`consult_expert\` directly with a specific expert
2. Check \`llm_router_health\` to verify system status
3. Simplify the request and try again
4. Check \`auth_status\` if authentication might be an issue
`;
}

export default handleOrchestrateTask;
