// src/tools/delegate-task.ts

/**
 * Task Delegation MCP Tool
 *
 * Claude(팀장)가 GPT(codex) 에이전트에게 구현 작업을 위임합니다.
 * 1~3명의 에이전트를 병렬로 spawn하여 plan→execute→report 패턴으로 실행.
 * GPT만 사용 (코드 변경 가능). Gemini는 위임 대상에서 제외.
 */

import { z } from "zod";
import { callExpertsParallel } from "../services/expert-router.js";
import { startBackgroundWorkflow } from "../services/background-manager.js";
import { wrapMcpResponse } from "../utils/response-saver.js";
import { logger } from "../utils/logger.js";

// ============================================================================
// Schema
// ============================================================================

export const delegateTaskSchema = z.object({
  task: z.string()
    .min(10, "작업 설명은 최소 10자 이상")
    .describe("전체 작업 설명"),

  files: z.array(z.string().refine(
    (p) => !p.includes('..') && !p.startsWith('/') && !p.match(/^[a-zA-Z]:\\/),
    { message: "상대 경로만 허용, 경로 탈출(..) 금지" }
  ))
    .optional()
    .describe("작업 대상 파일 경로 (codex가 직접 읽음, 상대경로만)"),

  context: z.string()
    .max(50000)
    .optional()
    .describe("추가 컨텍스트 (계획 발췌, 요구사항 등)"),

  context_docs: z.array(z.string().refine(
    (p) => !p.includes('..') && !p.startsWith('/') && !p.match(/^[a-zA-Z]:\\/),
    { message: "상대 경로만 허용, 경로 탈출(..) 금지" }
  ))
    .optional()
    .describe("필수 읽기 문서 경로 (CLAUDE.md, AGENTS.md 등 - codex가 직접 읽음, 상대경로만)"),

  parallel_agents: z.number()
    .int().min(1).max(3)
    .default(1)
    .describe("병렬 GPT 에이전트 수 (1~3)"),

  agent_tasks: z.array(z.string())
    .optional()
    .describe("에이전트별 서브태스크 설명 (parallel_agents > 1일 때 필수)"),
}).strict().refine(
  (data) => data.parallel_agents <= 1 || (data.agent_tasks && data.agent_tasks.length === data.parallel_agents),
  { message: "parallel_agents > 1일 때 agent_tasks 배열의 길이가 일치해야 합니다" }
);

// ============================================================================
// Tool Definition
// ============================================================================

export const delegateTaskTool = {
  name: "delegate_task",

  title: "GPT 에이전트에게 작업 위임",

  description: `GPT(codex) 에이전트에게 구현 작업을 위임합니다.

## 특징
- **GPT만 사용**: codex --full-auto로 실행, 파일 읽기/쓰기 가능
- **병렬 실행**: 1~3명 에이전트 동시 spawn (Promise.all)
- **자동 plan→execute→report**: 프롬프트로 3단계 프로토콜 강제
- **파일 경로 기반**: 경로만 넘기면 codex가 직접 읽음

## 사용 예시
\`\`\`json
{
  "task": "인증 미들웨어 구현",
  "files": ["src/auth/middleware.ts", "src/auth/types.ts"],
  "context_docs": ["CLAUDE.md"],
  "parallel_agents": 2,
  "agent_tasks": ["JWT 토큰 서비스 구현", "미들웨어 + 라우트 가드 구현"]
}
\`\`\``,

  inputSchema: delegateTaskSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true
  }
};

// ============================================================================
// Delegation Prompt Builder
// ============================================================================

function buildDelegationPrompt(params: {
  subtask: string;
  files?: string[];
  context?: string;
  contextDocs?: string[];
}): string {
  const sections: string[] = [];

  sections.push('You are an implementation agent. Follow this protocol exactly.');

  // Pre-reading
  if (params.contextDocs && params.contextDocs.length > 0) {
    sections.push(`\n## PRE-READING (MANDATORY)\nRead these files first before doing anything:\n${params.contextDocs.map(d => `- ${d}`).join('\n')}`);
  }

  // Task
  sections.push(`\n## TASK\n${params.subtask}`);

  // Target files
  if (params.files && params.files.length > 0) {
    sections.push(`\n## TARGET FILES\n${params.files.map(f => `- ${f}`).join('\n')}`);
  }

  // Context
  if (params.context) {
    sections.push(`\n## CONTEXT\n${params.context}`);
  }

  // Execution protocol
  sections.push(`
## EXECUTION PROTOCOL

### Phase 1: PLAN
- Read the target files and context docs
- Analyze requirements
- List specific changes you will make
- Do NOT modify files yet

### Phase 2: EXECUTE
- Implement changes per your plan
- Modify files as needed
- Handle edge cases

### Phase 3: REPORT
When finished, output your report in EXACTLY this format:

---REPORT-START---
## Files Changed
- path/to/file.ts: description of changes

## Summary
What was implemented

## Issues
Any problems or concerns (or "None")

## Verification
How to verify changes work
---REPORT-END---`);

  return sections.join('\n');
}

// ============================================================================
// Report Parser
// ============================================================================

interface DelegationReport {
  agentIndex: number;
  subtask: string;
  report: string;
  filesChanged: string[];
  success: boolean;
  durationMs: number;
}

function parseReport(rawResponse: string, agentIndex: number, subtask: string, durationMs: number): DelegationReport {
  const reportMatch = rawResponse.match(/---REPORT-START---([\s\S]*?)---REPORT-END---/);
  const report = reportMatch ? reportMatch[1].trim() : rawResponse;

  // Extract file paths from "## Files Changed" section
  const filesChanged: string[] = [];
  const filesSection = report.match(/## Files Changed\n([\s\S]*?)(?=\n## |$)/);
  if (filesSection) {
    const lines = filesSection[1].trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^- (.+?):/);
      if (match) {
        filesChanged.push(match[1].trim());
      }
    }
  }

  return {
    agentIndex,
    subtask,
    report,
    filesChanged,
    success: reportMatch !== null,
    durationMs,
  };
}

// ============================================================================
// Handler
// ============================================================================

export async function handleDelegateTask(params: z.infer<typeof delegateTaskSchema>) {
  const agentCount = params.parallel_agents;
  const subtasks = params.agent_tasks || [params.task];

  logger.info({
    task: params.task.substring(0, 100),
    agentCount,
    files: params.files,
  }, 'Task delegation started (background)');

  // 백그라운드 executor: 실제 작업을 비동기로 실행
  const executor = async (): Promise<string> => {
    const startTime = Date.now();

    const calls = subtasks.map((subtask) => ({
      expertId: 'strategist' as const,
      prompt: buildDelegationPrompt({
        subtask,
        files: params.files,
        context: params.context,
        contextDocs: params.context_docs,
      }),
    }));

    const agentStartTimes = calls.map(() => Date.now());
    const results = await callExpertsParallel(calls);

    const reports: DelegationReport[] = results.map((result, i) =>
      parseReport(
        result.response,
        i + 1,
        subtasks[i],
        result.latencyMs || (Date.now() - agentStartTimes[i])
      )
    );

    const totalMs = Date.now() - startTime;
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

    let output = `## 작업 위임 결과 (${timeStr}, 에이전트 ${agentCount}명)\n\n`;

    const allChangedFiles = reports.flatMap(r => r.filesChanged);
    if (allChangedFiles.length > 0) {
      output += `### 📁 변경된 파일\n${[...new Set(allChangedFiles)].map(f => `- ${f}`).join('\n')}\n\n`;
    }

    reports.forEach((report) => {
      const min = Math.floor(report.durationMs / 60000);
      const sec = Math.floor((report.durationMs % 60000) / 1000);
      const agentTime = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
      const status = report.success ? '✅' : '⚠️';

      output += `### ${status} Agent #${report.agentIndex} (${agentTime})\n`;
      output += `**서브태스크**: ${report.subtask}\n\n`;
      output += `${report.report}\n\n`;

      if (report.agentIndex < reports.length) {
        output += `---\n\n`;
      }
    });

    logger.info({
      totalMs,
      agentCount,
      allChangedFiles,
      success: reports.every(r => r.success),
    }, 'Task delegation completed');

    return output;
  };

  // 백그라운드로 시작, task_id 즉시 반환
  const task = startBackgroundWorkflow(`delegate_task(${agentCount} agents)`, executor);

  return {
    content: [{
      type: "text" as const,
      text: `## 작업 위임 시작 (백그라운드)\n\n`
        + `- **task_id**: \`${task.id}\`\n`
        + `- **에이전트**: ${agentCount}명 병렬\n`
        + `- **서브태스크**: ${subtasks.map((t, i) => `\n  ${i + 1}. ${t}`).join('')}\n\n`
        + `결과 확인: \`background_expert_result({ task_id: "${task.id}" })\``,
    }],
  };
}
