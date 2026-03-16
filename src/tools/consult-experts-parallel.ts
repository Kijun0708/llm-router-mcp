// src/tools/consult-experts-parallel.ts

import { z } from "zod";
import { experts } from "../experts/index.js";
import { callExpertsParallel } from "../services/expert-router.js";
import { sessionMemory } from "../services/session-memory.js";
import { wrapMcpResponse } from "../utils/response-saver.js";
import { logger } from "../utils/logger.js";

// ============================================================================
// Schema
// ============================================================================

const expertItemSchema = z.object({
  expert: z.enum([
    "strategist", "researcher", "reviewer", "frontend", "writer", "explorer", "multimodal",
    "librarian", "metis", "momus", "prometheus",
    "security", "tester", "data", "codex_reviewer", "devops", "reality_checker", "lsp_index_engineer",
    "gpt_blank_1", "gpt_blank_2", "gemini_blank_1", "gemini_blank_2"
  ]).describe("자문할 전문가"),
  question: z.string()
    .min(10, "질문은 최소 10자 이상")
    .max(5000, "질문은 최대 5000자")
    .describe("이 전문가에게 할 질문"),
  persona: z.string()
    .min(2).max(500)
    .optional()
    .describe("blank 전문가 사용 시 페르소나 설명"),
});

export const consultExpertsParallelSchema = z.object({
  experts: z.array(expertItemSchema)
    .min(2, "최소 2명의 전문가를 지정해야 합니다")
    .max(6, "최대 6명까지 동시 호출 가능합니다")
    .describe("동시에 호출할 전문가 목록"),
  context: z.string()
    .max(50000)
    .optional()
    .describe("모든 전문가에게 공유할 컨텍스트"),
  skip_cache: z.boolean()
    .default(false)
    .describe("캐시 무시하고 새로 호출"),
}).strict();

export const consultExpertsParallelTool = {
  name: "consult_experts_parallel",
  title: "여러 전문가 동시 자문",
  description: `여러 전문가에게 동시에 질문합니다 (내부 병렬 실행).

consult_expert를 여러 번 호출하면 순차 실행되지만, 이 도구는 단일 호출로 모든 전문가를 **동시에** 실행합니다.

예: GPT(7분) + Gemini(1분) = 순차 8분 → 병렬 7분

## 사용 예시
\`\`\`json
{
  "experts": [
    { "expert": "reviewer", "question": "이 코드의 버그를 찾아줘" },
    { "expert": "strategist", "question": "이 설계의 문제점을 분석해줘" }
  ],
  "context": "공유할 코드나 문서"
}
\`\`\``,
};

// ============================================================================
// Handler
// ============================================================================

export async function handleConsultExpertsParallel(
  params: z.infer<typeof consultExpertsParallelSchema>
) {
  const startTime = Date.now();

  logger.info({
    experts: params.experts.map(e => e.expert),
    count: params.experts.length,
  }, 'Parallel expert consultation started');

  try {
    // 각 전문가 호출 시작 시간 기록
    const callStartTimes = params.experts.map(() => Date.now());

    const results = await callExpertsParallel(
      params.experts.map((e) => ({
        expertId: e.expert,
        prompt: e.persona
          ? `[페르소나 지정]\n${e.persona}\n\n[질문]\n${e.question}`
          : e.question,
        context: params.context,
      }))
    );

    // 총 소요 시간
    const totalMs = Date.now() - startTime;
    const totalMinutes = Math.floor(totalMs / 60000);
    const totalSeconds = Math.floor((totalMs % 60000) / 1000);
    const totalTimeStr = totalMinutes > 0 ? `${totalMinutes}분 ${totalSeconds}초` : `${totalSeconds}초`;

    // 각 전문가 응답 포맷
    let response = `## 병렬 전문가 응답 (총 ${totalTimeStr}, ${results.length}명)\n\n`;

    results.forEach((result, i) => {
      const expertDef = experts[result.actualExpert];
      const latencyMs = result.latencyMs || 0;
      const min = Math.floor(latencyMs / 60000);
      const sec = Math.floor((latencyMs % 60000) / 1000);
      const timeStr = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;

      response += `### ${expertDef.name} (${timeStr})\n\n`;
      response += `${result.response}\n\n`;

      if (result.fellBack) {
        const originalExpert = experts[params.experts[i].expert];
        response += `> ⚠️ 폴백: ${originalExpert.name} → ${expertDef.name}\n\n`;
      }

      if (result.cached) {
        response += `> 📦 캐시된 응답\n\n`;
      }

      if (i < results.length - 1) {
        response += `---\n\n`;
      }

      // 세션 메모리에 저장
      sessionMemory.addExpertResponse(
        result.actualExpert,
        params.experts[i].question,
        result.response
      );
    });

    logger.info({
      totalMs,
      experts: results.map(r => r.actualExpert),
      fellBacks: results.filter(r => r.fellBack).length,
    }, 'Parallel expert consultation completed');

    return wrapMcpResponse(response, {
      toolName: 'consult_experts_parallel',
      isWorkflow: true,
      expertInfo: {
        name: `Parallel (${results.map(r => r.actualExpert).join(', ')})`,
      },
    });

  } catch (error) {
    const totalMs = Date.now() - startTime;
    logger.error({ error, totalMs }, 'Parallel expert consultation failed');

    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 병렬 전문가 호출 실패\n\n**오류**: ${(error as Error).message}\n**소요 시간**: ${Math.floor(totalMs / 1000)}초`,
      }],
      isError: true,
    };
  }
}
