// src/tools/review-workflow.ts

import { z } from "zod";
import { callExpertWithFallback, callExpertsParallel } from "../services/expert-router.js";
import { wrapMcpResponse } from "../utils/response-saver.js";

export const reviewCodeSchema = z.object({
  code: z.string()
    .min(10, "코드는 최소 10자 이상")
    .describe("리뷰할 코드"),

  language: z.string()
    .optional()
    .describe("프로그래밍 언어 (자동 감지)"),

  focus: z.enum(["bugs", "performance", "security", "style", "all"])
    .default("all")
    .describe("집중할 리뷰 영역"),

  include_strategist: z.boolean()
    .default(false)
    .describe("GPT 설계 관점 리뷰 추가"),

  parallel: z.boolean()
    .default(true)
    .describe("병렬 실행 (include_strategist=true일 때)")
}).strict();

export const reviewCodeTool = {
  name: "review_code",

  title: "코드 리뷰",

  description: `코드 리뷰를 전문가에게 요청합니다.

## 기본 워크플로우
- **Gemini Reviewer**: 버그, 성능, 보안, 스타일 검토

## 옵션
- include_strategist=true: GPT의 설계 관점 리뷰 추가
- focus: 특정 영역에 집중 (bugs/performance/security/style/all)

## 사용 예시
code: "function fetchData() { ... }"
focus: "security"
include_strategist: true`,

  inputSchema: reviewCodeSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleReviewCode(params: z.infer<typeof reviewCodeSchema>) {
  const focusGuide: Record<string, string> = {
    bugs: "버그, 엣지케이스, 예외처리",
    performance: "성능 이슈, 병목점, 최적화",
    security: "보안 취약점, 인젝션, 인증",
    style: "코드 스타일, 가독성, 네이밍",
    all: "전체 (버그, 성능, 보안, 스타일)"
  };

  const reviewPrompt = `
[코드 리뷰 요청]
언어: ${params.language || "자동 감지"}
집중 영역: ${focusGuide[params.focus]}

\`\`\`
${params.code}
\`\`\`

위 코드를 리뷰해주세요.
  `.trim();

  try {
    let geminiReview: string;
    let gptReview: string = '';

    if (params.include_strategist && params.parallel) {
      // 병렬 실행
      const [reviewResult, strategyResult] = await callExpertsParallel([
        { expertId: 'reviewer', prompt: reviewPrompt },
        {
          expertId: 'strategist',
          prompt: `[설계 관점 코드 리뷰]\n\`\`\`\n${params.code}\n\`\`\`\n\n설계/구조 관점에서 검토해주세요.`
        }
      ]);

      geminiReview = reviewResult.response;
      gptReview = strategyResult.response;
    } else {
      // 순차 실행
      const reviewResult = await callExpertWithFallback('reviewer', reviewPrompt);
      geminiReview = reviewResult.response;

      if (params.include_strategist) {
        const strategyResult = await callExpertWithFallback(
          'strategist',
          `[설계 관점 코드 리뷰]\n\`\`\`\n${params.code}\n\`\`\`\n\n설계/구조 관점에서 검토해주세요.`
        );
        gptReview = strategyResult.response;
      }
    }

    let output = `## 코드 리뷰 결과\n\n`;
    output += `### 🔍 Gemini Reviewer\n${geminiReview}\n\n`;

    if (gptReview) {
      output += `### 🎯 GPT Strategist (설계 관점)\n${gptReview}`;
    }

    return wrapMcpResponse(output, {
      toolName: 'review_code',
      isWorkflow: params.include_strategist,
      expertInfo: { name: 'Code Review' }
    });

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 코드 리뷰 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
