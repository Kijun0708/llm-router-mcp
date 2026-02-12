// src/tools/design-workflow.ts

import { z } from "zod";
import { callExpertWithFallback, callExpertsParallel } from "../services/expert-router.js";
import { wrapMcpResponse } from "../utils/response-saver.js";

export const designWorkflowSchema = z.object({
  topic: z.string()
    .min(5, "주제는 최소 5자 이상")
    .describe("설계 주제 (예: '트레이딩 알고리즘', '인증 시스템')"),

  requirements: z.string()
    .optional()
    .describe("요구사항 목록"),

  constraints: z.string()
    .optional()
    .describe("제약조건 (기술 스택, 성능 요구 등)"),

  skip_review: z.boolean()
    .default(false)
    .describe("리뷰 단계 건너뛰기 (기본: false)"),

  parallel: z.boolean()
    .default(false)
    .describe("설계와 조사를 병렬로 실행 (기본: false)")
}).strict();

export const designWorkflowTool = {
  name: "design_with_experts",

  title: "전문가 협업 설계",

  description: `설계 작업을 전문가 협업으로 진행합니다.

## 자동 워크플로우
1. **GPT Strategist**: 설계 방향 및 아키텍처 제안
2. **Gemini Reviewer**: 설계안 검토 및 피드백 (skip_review=false일 때)

## 옵션
- parallel=true: Claude Researcher가 관련 레퍼런스 병렬 조사

## 반환값
- strategy: GPT의 설계 제안
- review: Gemini의 검토 의견 (선택)
- research: Claude의 레퍼런스 조사 (parallel=true일 때)

## 사용 예시
topic: "주식 자동매매 룰엔진"
requirements: "YAML 룰파일, 실시간 처리, 백테스트"
constraints: "Rust, PostgreSQL, 1ms 이하 응답"`,

  inputSchema: designWorkflowSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export async function handleDesignWorkflow(params: z.infer<typeof designWorkflowSchema>) {
  const strategyPrompt = `
[설계 요청]
주제: ${params.topic}
요구사항: ${params.requirements || "없음"}
제약조건: ${params.constraints || "없음"}

설계 방향과 아키텍처를 제안해주세요.
  `.trim();

  let strategy: string;
  let review: string = '';
  let research: string = '';
  let fellBack = false;

  try {
    if (params.parallel) {
      // 병렬 실행: 설계 + 조사
      const [strategyResult, researchResult] = await callExpertsParallel([
        { expertId: 'strategist', prompt: strategyPrompt },
        {
          expertId: 'researcher',
          prompt: `[레퍼런스 조사]\n주제: ${params.topic}\n\n관련 라이브러리, 패턴, 베스트 프랙티스를 조사해주세요.`
        }
      ]);

      strategy = strategyResult.response;
      research = researchResult.response;
      fellBack = strategyResult.fellBack || researchResult.fellBack;
    } else {
      // 순차 실행
      const strategyResult = await callExpertWithFallback('strategist', strategyPrompt);
      strategy = strategyResult.response;
      fellBack = strategyResult.fellBack;
    }

    // 리뷰 (선택)
    if (!params.skip_review) {
      const reviewPrompt = `
[설계 리뷰 요청]
주제: ${params.topic}

GPT 제안:
${strategy}

이 설계의 문제점과 개선점을 검토해주세요.
      `.trim();

      const reviewResult = await callExpertWithFallback('reviewer', reviewPrompt);
      review = reviewResult.response;
      fellBack = fellBack || reviewResult.fellBack;
    }

    // 결과 포맷팅
    let output = `## 설계 결과: ${params.topic}\n\n`;
    output += `### 🎯 GPT Strategist 제안\n${strategy}\n\n`;

    if (research) {
      output += `### 📚 Claude Researcher 조사\n${research}\n\n`;
    }

    if (review) {
      output += `### 🔍 Gemini Reviewer 검토\n${review}\n\n`;
    }

    output += `---\n위 전문가 의견을 참고하여 설계를 진행하세요.`;

    if (fellBack) {
      output += `\n\n⚠️ 일부 전문가가 한도 초과로 대체되었습니다.`;
    }

    return wrapMcpResponse(output, {
      toolName: 'design_with_experts',
      isWorkflow: true,
      expertInfo: { name: 'Design Workflow', fellBack }
    });

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 설계 워크플로우 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
