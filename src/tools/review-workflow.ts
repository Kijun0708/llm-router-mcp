// src/tools/review-workflow.ts

/**
 * Code Review MCP Tool (GPT Only)
 *
 * perspectives: 몇 가지 관점에서 리뷰할 건지
 *   1: [버그/보안] → 1 GPT 에이전트
 *   2: [버그/보안] + [아키텍처] → 2 GPT 에이전트
 *   3: [버그/보안] + [아키텍처] + [비판적] → 3 GPT 에이전트
 */

import { z } from "zod";
import { callExpertsParallel, WorkflowCallOptions } from "../services/expert-router.js";
import { startBackgroundWorkflow } from "../services/background-manager.js";
import { SESSION_ID } from "../session.js";

export const reviewCodeSchema = z.object({
  code: z.string()
    .min(10, "코드는 최소 10자 이상")
    .optional()
    .describe("인라인 코드 (기존 호환)"),

  files: z.array(z.string().refine(
    (p) => !p.includes('..') && !p.startsWith('/') && !p.match(/^[a-zA-Z]:\\/),
    { message: "상대 경로만 허용, 경로 탈출(..) 금지" }
  ))
    .optional()
    .describe("리뷰할 파일 경로 (CLI가 직접 읽음, 상대경로만)"),

  context_docs: z.array(z.string().refine(
    (p) => !p.includes('..') && !p.startsWith('/') && !p.match(/^[a-zA-Z]:\\/),
    { message: "상대 경로만 허용, 경로 탈출(..) 금지" }
  ))
    .optional()
    .describe("리뷰 전 필수 읽기 문서 경로 (CLI가 직접 읽음, 상대경로만)"),

  language: z.string()
    .optional()
    .describe("프로그래밍 언어 (자동 감지)"),

  focus: z.enum(["bugs", "performance", "security", "architecture", "style", "all"])
    .default("all")
    .describe("집중할 리뷰 영역 (perspectives=1일 때 적용)"),

  perspectives: z.number()
    .int().min(1).max(3)
    .default(1)
    .describe("리뷰 관점 수 (1: 버그/보안, 2: +아키텍처, 3: +비판적). 각 관점마다 GPT 1 에이전트"),

  // 기존 호환
  include_strategist: z.boolean()
    .default(false)
    .describe("[deprecated] perspectives 사용 권장"),

  parallel: z.boolean()
    .default(true)
    .describe("[deprecated] 항상 병렬 실행")
}).strict().refine(
  (data) => data.code || (data.files && data.files.length > 0),
  { message: "code 또는 files 중 하나는 필수입니다" }
);

export const reviewCodeTool = {
  name: "review_code",

  title: "코드 리뷰 (GPT 멀티 관점)",

  description: `GPT 코드 리뷰 (관점별 병렬).

## 리뷰 대상 (둘 중 하나 필수)
- **code**: 인라인 코드 문자열
- **files**: 파일 경로 배열 (CLI가 직접 읽음)

## perspectives (관점 수)
- **1** (기본): [버그/보안] = 1 GPT 에이전트
- **2**: [버그/보안] + [아키텍처] = 2 GPT 에이전트
- **3**: [버그/보안] + [아키텍처] + [비판적] = 3 GPT 에이전트

## 사용 예시
\`\`\`json
{
  "files": ["src/auth/middleware.ts"],
  "context_docs": ["CLAUDE.md"],
  "perspectives": 2
}
\`\`\``,

  inputSchema: reviewCodeSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

// ============================================================================
// Perspective Definitions
// ============================================================================

interface PerspectiveDef {
  name: string;
  gptLabel: string;
  geminiLabel: string;
  gptExpertId: string;
  geminiExpertId: string;
  buildGptPrompt: (target: string, context: string, language: string, focus?: string) => string;
  buildGeminiPrompt: (target: string, context: string, language: string, focus?: string) => string;
}

const PERSPECTIVES: PerspectiveDef[] = [
  {
    name: '버그/보안',
    gptLabel: '🎯 GPT (버그/보안/품질)',
    geminiLabel: '🔵 Gemini (버그/보안/품질)',
    gptExpertId: 'codereview_gpt',
    geminiExpertId: 'codereview',
    buildGptPrompt: (target, context, lang, focus) => {
      const focusHint = focus && focus !== 'all' ? `\n집중 영역: ${focus}` : '';
      return `[GPT 코드 리뷰 - 버그/보안 관점]\n언어: ${lang}${focusHint}${context}\n\n${target}\n\n실무 관점에서 프로덕션 장애를 유발할 수 있는 버그, 보안 취약점, 성능 병목을 찾아주세요.\n과거 프로덕션 인시던트 사례를 참고하여 실제 위험도를 평가하세요.\n심각도(Critical/High/Medium/Low)와 신뢰도(%)를 표시하세요.`;
    },
    buildGeminiPrompt: (target, context, lang, focus) => {
      const focusHint = focus && focus !== 'all' ? `\n집중 영역: ${focus}` : '';
      return `[Gemini 코드 리뷰 - 버그/보안 관점]\n언어: ${lang}${focusHint}${context}\n\n${target}\n\n버그, 보안 취약점, 에러 처리 누락, 잠재적 런타임 오류를 찾아주세요.\n심각도(Critical/High/Medium/Low)와 신뢰도(%)를 표시하세요.`;
    },
  },
  {
    name: '아키텍처/설계',
    gptLabel: '🏛️ GPT (아키텍처/설계)',
    geminiLabel: '🔵 Gemini (아키텍처/설계)',
    gptExpertId: 'codereview_gpt',
    geminiExpertId: 'codereview',
    buildGptPrompt: (target, context, lang) =>
      `[GPT 코드 리뷰 - 아키텍처/설계 관점]\n언어: ${lang}${context}\n\n${target}\n\n장기 유지보수 관점에서 모듈 경계, 의존성 방향, 추상화 수준을 평가해주세요.\nSOLID 원칙, 복잡도 메트릭(Cyclomatic/Cognitive), 구체적 리팩토링 패턴을 제안하세요.`,
    buildGeminiPrompt: (target, context, lang) =>
      `[Gemini 코드 리뷰 - 아키텍처/설계 관점]\n언어: ${lang}${context}\n\n${target}\n\n모듈 구조, 의존성 방향, 계층 분리, 추상화 수준을 평가해주세요.\n개선이 필요한 설계 패턴과 구체적 리팩토링 방안을 제시하세요.`,
  },
  {
    name: '비판적 분석',
    gptLabel: '🔥 GPT (비판적 분석)',
    geminiLabel: '🔵 Gemini (비판적 분석)',
    gptExpertId: 'codereview_gpt',
    geminiExpertId: 'codereview',
    buildGptPrompt: (target, context, lang) =>
      `[GPT 비판적 코드 분석]\n언어: ${lang}${context}\n\n${target}\n\n이 코드의 장기 유지보수 위험, 기술 부채 축적 가능성, 팀 확장 시 병목을 분석해주세요.\n숨겨진 가정, 암묵적 의존성, 확장성 한계를 찾고 "6개월 후 이 코드가 문제가 될 이유"를 구체적으로 제시하세요.`,
    buildGeminiPrompt: (target, context, lang) =>
      `[Gemini 비판적 코드 분석]\n언어: ${lang}${context}\n\n${target}\n\n기술 부채, 숨겨진 가정, 확장성 한계, 유지보수 리스크를 분석해주세요.\n"6개월 후 이 코드가 문제가 될 이유"를 구체적으로 제시하세요.`,
  },
];

// ============================================================================
// Handler
// ============================================================================

export async function handleReviewCode(params: z.infer<typeof reviewCodeSchema>) {
  // 하위 호환: include_strategist → perspectives=2
  const perspectives = params.include_strategist && params.perspectives === 1
    ? 2
    : params.perspectives;

  const language = params.language || '자동 감지';
  const totalAgents = perspectives * 2;

  // 리뷰 대상 프롬프트
  let targetSection: string;
  if (params.files && params.files.length > 0) {
    targetSection = `다음 파일들을 리뷰해줘:\n${params.files.map(f => `- ${f}`).join('\n')}`;
  } else {
    targetSection = `\`\`\`\n${params.code}\n\`\`\``;
  }

  // 컨텍스트 문서
  let contextSection = '';
  if (params.context_docs && params.context_docs.length > 0) {
    contextSection = `\n\n리뷰 전에 먼저 이 문서들을 읽어:\n${params.context_docs.map(d => `- ${d}`).join('\n')}`;
  }

  // 백그라운드 executor
  const executor = async (): Promise<string> => {
    const startTime = Date.now();
    const workflowId = `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const workflowOptions: WorkflowCallOptions = { workflowId, workflowType: 'review_code', callPhase: 'parallel_review', sessionId: SESSION_ID };

    type ReviewCall = { expertId: string; prompt: string };
    const calls: ReviewCall[] = [];

    for (let i = 0; i < perspectives; i++) {
      const perspective = PERSPECTIVES[i];
      const focus = i === 0 ? params.focus : undefined;

      calls.push({
        expertId: perspective.gptExpertId,
        prompt: perspective.buildGptPrompt(targetSection, contextSection, language, focus),
      });
      calls.push({
        expertId: perspective.geminiExpertId,
        prompt: perspective.buildGeminiPrompt(targetSection, contextSection, language, focus),
      });
    }

    const results = await callExpertsParallel(calls, workflowOptions);

    const totalMs = Date.now() - startTime;
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

    let output = `## 코드 리뷰 결과 (${timeStr}, ${perspectives}관점 × GPT+Gemini = ${totalAgents} 에이전트)\n\n`;

    for (let p = 0; p < perspectives; p++) {
      const perspective = PERSPECTIVES[p];
      const gptResult = results[p * 2];
      const geminiResult = results[p * 2 + 1];

      const gptMs = gptResult.latencyMs || 0;
      const gptTime = gptMs >= 60000
        ? `${Math.floor(gptMs / 60000)}분 ${Math.floor((gptMs % 60000) / 1000)}초`
        : `${Math.floor(gptMs / 1000)}초`;

      const geminiMs = geminiResult.latencyMs || 0;
      const geminiTime = geminiMs >= 60000
        ? `${Math.floor(geminiMs / 60000)}분 ${Math.floor((geminiMs % 60000) / 1000)}초`
        : `${Math.floor(geminiMs / 1000)}초`;

      output += `## 관점 ${p + 1}: ${perspective.name}\n\n`;
      output += `### ${perspective.gptLabel} (${gptTime})\n${gptResult.response}\n\n`;
      output += `### ${perspective.geminiLabel} (${geminiTime})\n${geminiResult.response}\n\n`;

      if (p < perspectives - 1) {
        output += `---\n\n`;
      }
    }

    output += `---\n\n### 📊 리뷰 요약\n`;
    output += `- **${perspectives}관점 × GPT+Gemini = ${totalAgents}명**의 전문가가 독립 리뷰했습니다.\n`;
    output += `- GPT와 Gemini가 **동일 관점에서 교차 검증**하여 신뢰도를 높였습니다.\n`;
    output += `- 여러 관점에서 반복 지적된 이슈를 **최우선 수정 대상**으로 판단하세요.\n`;

    return output;
  };

  // 백그라운드로 시작, task_id 즉시 반환
  const task = startBackgroundWorkflow(`review_code(${totalAgents} agents)`, executor);

  const targetDesc = params.files ? params.files.join(', ') : '인라인 코드';

  return {
    content: [{
      type: "text" as const,
      text: `## 코드 리뷰 시작 (백그라운드)\n\n`
        + `- **task_id**: \`${task.id}\`\n`
        + `- **관점**: ${perspectives}관점 × GPT+Gemini = ${totalAgents} 에이전트\n`
        + `- **대상**: ${targetDesc}\n\n`
        + `결과 확인: \`background_expert_result({ task_id: "${task.id}" })\``,
    }],
  };
}
