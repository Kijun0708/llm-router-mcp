// src/tools/category-task.ts

import { z } from "zod";
import { categories } from "../categories.js";
import { experts } from "../experts/index.js";
import { callExpertWithFallback } from "../services/expert-router.js";
import { wrapMcpResponse } from "../utils/response-saver.js";

export const categoryTaskSchema = z.object({
  category: z.enum(["visual", "business-logic", "research", "quick", "review", "documentation"])
    .describe("작업 카테고리"),

  prompt: z.string()
    .min(5, "프롬프트는 최소 5자 이상")
    .describe("작업 내용"),

  context: z.string()
    .optional()
    .describe("추가 컨텍스트"),

  override_expert: z.enum([
    "strategist", "researcher", "reviewer", "frontend", "writer", "explorer", "multimodal",
    "librarian", "metis", "momus", "prometheus", "security", "tester", "data", "codex_reviewer", "devops"
  ]).optional()
    .describe("카테고리 기본 전문가 대신 사용할 전문가")
}).strict();

export const categoryTaskTool = {
  name: "route_by_category",

  title: "카테고리 기반 작업 라우팅",

  description: `카테고리별 최적 전문가 자동 라우팅.
- visual: frontend (UI/UX)
- business-logic: strategist (아키텍처)
- research: researcher (조사/분석)
- quick: explorer (빠른탐색)
- review: reviewer (코드리뷰)
- documentation: writer (문서작성)`,

  inputSchema: categoryTaskSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export async function handleCategoryTask(params: z.infer<typeof categoryTaskSchema>) {
  const category = categories[params.category];
  const expertId = params.override_expert || category.defaultExpert;

  // 카테고리별 프롬프트 보강
  const enhancedPrompt = category.promptAppend
    ? `${params.prompt}\n\n[지침]\n${category.promptAppend}`
    : params.prompt;

  try {
    const result = await callExpertWithFallback(
      expertId,
      enhancedPrompt,
      params.context
    );

    const expert = experts[result.actualExpert];

    const responseText = `## ${expert.name} 응답\n` +
          `_카테고리: ${category.description}_\n\n` +
          `${result.response}` +
          (result.fellBack ? `\n\n---\n⚠️ 폴백: ${expertId} → ${result.actualExpert}` : '');

    return wrapMcpResponse(responseText, {
      expertId: result.actualExpert,
      toolName: 'route_by_category',
      isWorkflow: false,
      expertInfo: {
        name: expert.name,
        fellBack: result.fellBack,
        actualExpert: result.actualExpert,
      }
    });
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 카테고리 작업 실패\n\n` +
              `**카테고리**: ${params.category}\n` +
              `**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
