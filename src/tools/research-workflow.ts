// src/tools/research-workflow.ts

import { z } from "zod";
import { callExpertWithFallback, WorkflowCallOptions } from "../services/expert-router.js";
import { SESSION_ID } from "../session.js";
import { wrapMcpResponse } from "../utils/response-saver.js";

export const researchTopicSchema = z.object({
  topic: z.string()
    .min(3, "주제는 최소 3자 이상")
    .describe("조사 주제"),

  depth: z.enum(["quick", "normal", "deep"])
    .default("normal")
    .describe("조사 깊이"),

  context: z.string()
    .optional()
    .describe("추가 컨텍스트 (프로젝트 정보 등)")
}).strict();

export const researchTopicTool = {
  name: "research_topic",

  title: "주제 조사",

  description: `주제에 대한 조사를 Claude Researcher에게 요청합니다.

## 깊이 옵션
- quick: 핵심만 빠르게
- normal: 일반적인 수준
- deep: 심층 분석

## 사용 시점
- 라이브러리 사용법 조사
- 코드베이스 분석
- 기술 비교 분석

## 사용 예시
topic: "React Query vs SWR 비교"
depth: "deep"`,

  inputSchema: researchTopicSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleResearchTopic(params: z.infer<typeof researchTopicSchema>) {
  const depthGuide: Record<string, string> = {
    quick: "핵심만 간단히 (2-3문장)",
    normal: "일반적인 수준으로 상세히",
    deep: "심층적으로 모든 측면을 분석"
  };

  const researchPrompt = `
[조사 요청]
주제: ${params.topic}
깊이: ${depthGuide[params.depth]}
${params.context ? `\n컨텍스트:\n${params.context}` : ""}

위 주제에 대해 ${depthGuide[params.depth]} 조사해주세요.
  `.trim();

  const startTime = Date.now();
  const workflowId = `research_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const workflowOptions: WorkflowCallOptions = { workflowId, workflowType: 'research_topic', callPhase: 'research', sessionId: SESSION_ID };
    const result = await callExpertWithFallback('researcher', researchPrompt, params.context, false, undefined, false, workflowOptions);

    // 소요 시간 포맷
    const totalMs = Date.now() - startTime;
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

    const responseText = `## 조사 결과: ${params.topic} (${timeStr})\n\n` +
          `### 📚 Claude Researcher\n${result.response}` +
          (result.fellBack ? `\n\n⚠️ 폴백: researcher → ${result.actualExpert}` : '');

    return wrapMcpResponse(responseText, {
      expertId: 'researcher',
      toolName: 'research_topic',
      isWorkflow: false,
      expertInfo: {
        fellBack: result.fellBack,
        actualExpert: result.actualExpert,
      }
    });
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 조사 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
