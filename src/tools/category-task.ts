// src/tools/category-task.ts

import { z } from "zod";
import { categories } from "../categories.js";
import { experts } from "../experts/index.js";
import { callExpertWithFallback } from "../services/expert-router.js";

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

  description: `작업 카테고리에 따라 최적의 전문가에게 자동 라우팅합니다.

## 카테고리

### visual
- 기본 전문가: frontend (Gemini Pro)
- 용도: UI/UX, 디자인, 프론트엔드 작업
- 특성: 높은 창의성 (temperature 0.7)

### business-logic
- 기본 전문가: strategist (GPT 5.2)
- 용도: 백엔드 로직, 아키텍처, 전략적 결정
- 특성: 낮은 창의성, 높은 정확도 (temperature 0.1)

### research
- 기본 전문가: researcher (Claude Sonnet)
- 용도: 조사, 분석, 문서 탐색
- 특성: 근거 기반 분석

### quick
- 기본 전문가: explorer (Gemini Flash)
- 용도: 빠른 탐색, 간단한 질문, 파일 찾기
- 특성: 빠른 응답, 짧은 출력

### review
- 기본 전문가: reviewer (Gemini Pro)
- 용도: 코드 리뷰, 버그 탐지, 품질 검사

### documentation
- 기본 전문가: writer (Gemini Flash)
- 용도: 문서 작성, README, API 문서화

## 사용 예시
- category="visual", prompt="대시보드 컴포넌트 설계해줘"
- category="business-logic", prompt="결제 시스템 아키텍처 제안해줘"
- category="quick", prompt="src 폴더에 있는 테스트 파일들 찾아줘"`,

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

    return {
      content: [{
        type: "text" as const,
        text: `## ${expert.name} 응답\n` +
              `_카테고리: ${category.description}_\n\n` +
              `${result.response}` +
              (result.fellBack ? `\n\n---\n⚠️ 폴백: ${expertId} → ${result.actualExpert}` : '')
      }]
    };
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
