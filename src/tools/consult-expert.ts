// src/tools/consult-expert.ts

import { z } from "zod";
import { experts } from "../experts/index.js";
import { callExpertWithFallback, callExpertWithToolsAndFallback } from "../services/expert-router.js";
import { sessionMemory } from "../services/session-memory.js";

export const consultExpertSchema = z.object({
  expert: z.enum([
    // 기본 전문가 (11명)
    "strategist", "researcher", "reviewer", "frontend", "writer", "explorer", "multimodal",
    "librarian", "metis", "momus", "prometheus",
    // 특화 전문가 (4명)
    "security", "tester", "data", "codex_reviewer"
  ]).describe("자문할 전문가"),

  question: z.string()
    .min(10, "질문은 최소 10자 이상")
    .max(5000, "질문은 최대 5000자")
    .describe("전문가에게 할 질문"),

  context: z.string()
    .max(10000, "컨텍스트는 최대 10000자")
    .optional()
    .describe("관련 코드, 설계 문서 등 추가 컨텍스트"),

  image_path: z.string()
    .optional()
    .describe("분석할 이미지 파일 경로 또는 URL (multimodal 전문가용)"),

  skip_cache: z.boolean()
    .default(false)
    .optional()
    .describe("캐시 무시하고 새로 호출"),

  use_tools: z.boolean()
    .default(true)
    .optional()
    .describe("전문가가 웹 검색, 문서 조회 등 도구를 사용할 수 있게 함 (기본: true)")
}).strict();

export const consultExpertTool = {
  name: "consult_expert",

  title: "외부 AI 전문가 자문",

  description: `외부 AI 전문가에게 자문을 구합니다.

## 전문가 목록

### strategist (GPT 5.2)
- 역할: 전략, 설계, 아키텍처, 디버깅 전략
- 사용 시점: 복잡한 설계 결정, 아키텍처 자문, 새로운 기능 설계

### researcher (Claude Sonnet)
- 역할: 문서 분석, 코드 탐색, 레퍼런스 조사
- 사용 시점: 라이브러리 사용법, 코드베이스 분석, 대량 문서 처리

### reviewer (Gemini 3.0 Pro)
- 역할: 코드 리뷰, 버그 탐지, 성능/보안 분석
- 사용 시점: 코드 품질 검토, 버그 찾기, 보안 점검

### frontend (Gemini 3.0 Pro)
- 역할: UI/UX 설계, 프론트엔드 컴포넌트, CSS/스타일링
- 사용 시점: UI 설계, 반응형 디자인, 접근성 검토

### writer (Gemini 3.0 Flash)
- 역할: 문서 작성, README, API 문서화
- 사용 시점: 기술 문서 작성, 문서 정리, 보고서 작성

### explorer (Gemini 3.0 Flash)
- 역할: 빠른 코드베이스 탐색, 패턴 매칭, 간단한 질문
- 사용 시점: 파일 찾기, 빠른 답변, 구조 파악

### multimodal (GPT 5.2)
- 역할: 이미지/시각적 콘텐츠 분석, 스크린샷 해석, 다이어그램 이해
- 사용 시점: 스크린샷 분석, UI 목업 리뷰, 다이어그램 해석, 에러 메시지 이미지 읽기
- **이미지 전달**: image_path 파라미터로 로컬 파일 경로 또는 URL 전달

### librarian (Claude Sonnet)
- 역할: 지식 관리, 세션 히스토리 검색, 컨텍스트 정리
- 사용 시점: 이전 대화 참조, 세션 간 정보 연결, 지식 베이스 관리

### metis (GPT 5.2)
- 역할: 전략적 계획, 복잡한 문제 분해, 단계별 실행 계획
- 사용 시점: 복잡한 프로젝트 계획, 문제 분해, 실행 로드맵 작성

### momus (Gemini Pro)
- 역할: 비판적 분석, 품질 평가, 약점 발견
- 사용 시점: 솔루션 비평, 품질 검증, 잠재적 문제점 도출

### prometheus (Claude Sonnet)
- 역할: 창의적 솔루션, 혁신적 접근, 새로운 아이디어
- 사용 시점: 브레인스토밍, 창의적 문제 해결, 대안 탐색

---

## 특화 전문가

### security (Claude Sonnet)
- 역할: OWASP/CWE 보안 취약점 분석, 보안 감사
- 사용 시점: 보안 코드 리뷰, 취약점 분석, 보안 모범 사례 자문

### tester (Claude Sonnet)
- 역할: TDD/테스트 전략 설계, 테스트 케이스 작성
- 사용 시점: 테스트 계획, 테스트 코드 작성, 커버리지 분석

### data (GPT 5.2)
- 역할: DB 설계, 쿼리 최적화, 데이터 모델링
- 사용 시점: 스키마 설계, SQL 최적화, 데이터 아키텍처 자문

### codex_reviewer (GPT Codex)
- 역할: GPT 관점 코드 리뷰, 코드 품질 분석
- 사용 시점: OpenAI 관점의 코드 리뷰, reviewer와 다른 시각 필요 시

---

## Rate Limit 자동 처리
- 전문가가 한도 초과 시 자동으로 대체 전문가로 폴백
- 폴백 시 응답에 알림 포함

## 도구 사용 (Function Calling)
- 전문가들은 필요시 자동으로 도구를 호출할 수 있습니다
- 사용 가능한 도구: web_search (최신 정보), get_library_docs (라이브러리 문서)
- use_tools=false로 비활성화 가능
- explorer는 빠른 응답을 위해 도구를 사용하지 않음

## 사용 예시
- 설계 자문: expert="strategist", question="REST vs GraphQL 어떤 게 나을까요?"
- 코드 분석: expert="researcher", question="이 코드의 동작 방식을 분석해주세요"
- 코드 리뷰: expert="reviewer", question="이 코드의 문제점을 찾아주세요"
- UI 피드백: expert="frontend", question="이 대시보드 레이아웃 개선점은?"
- 문서 작성: expert="writer", question="이 API의 README를 작성해주세요"
- 빠른 탐색: expert="explorer", question="인증 관련 파일들이 어디에 있나요?"
- 이미지 분석: expert="multimodal", question="이 스크린샷을 분석해주세요", image_path="./screenshot.png"`,

  inputSchema: consultExpertSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleConsultExpert(params: z.infer<typeof consultExpertSchema>) {
  try {
    // use_tools가 true이면 도구 사용 가능한 함수 호출
    const enableTools = params.use_tools !== false;

    // 세션 메모리에서 공유 컨텍스트 가져오기
    const sharedContext = sessionMemory.getContextForExpert();

    // 사용자 제공 컨텍스트와 세션 메모리 병합
    let fullContext = '';
    if (sharedContext) {
      fullContext += `[세션 공유 컨텍스트]\n${sharedContext}\n\n`;
    }
    if (params.context) {
      fullContext += `[추가 컨텍스트]\n${params.context}`;
    }

    const result = await callExpertWithToolsAndFallback(
      params.expert,
      params.question,
      fullContext || undefined,
      params.skip_cache,
      enableTools,
      params.image_path
    );

    // 전문가 응답을 세션 메모리에 저장
    sessionMemory.addExpertResponse(result.actualExpert, params.question, result.response);

    const expert = experts[params.expert];
    const actualExpert = experts[result.actualExpert];

    let response = `## ${actualExpert.name} 응답\n\n${result.response}`;

    // 사용된 도구 표시
    if (result.toolsUsed && result.toolsUsed.length > 0) {
      response += `\n\n---\n🔧 **사용된 도구**: ${result.toolsUsed.join(', ')}`;
    }

    // 폴백 알림
    if (result.fellBack) {
      response += `\n\n⚠️ **알림**: 원래 요청한 \`${expert.name}\`이(가) 한도 초과로 \`${actualExpert.name}\`으로 대체되었습니다.`;
    }

    // 캐시 히트 알림
    if (result.cached) {
      response += `\n\n_📦 캐시된 응답 (${result.latencyMs}ms)_`;
    }

    // 이미지 분석 알림
    if (params.image_path) {
      response += `\n\n_🖼️ 이미지 분석: ${params.image_path}_`;
    }

    return {
      content: [{
        type: "text" as const,
        text: response
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 전문가 호출 실패\n\n` +
              `**요청 전문가**: ${params.expert}\n` +
              `**오류**: ${(error as Error).message}\n\n` +
              `💡 잠시 후 다시 시도하거나 다른 전문가를 사용해보세요.`
      }],
      isError: true
    };
  }
}
