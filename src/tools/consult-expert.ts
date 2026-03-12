// src/tools/consult-expert.ts

import { z } from "zod";
import { existsSync } from "fs";
import { resolve, normalize, isAbsolute, sep } from "path";
import { experts } from "../experts/index.js";
import { callExpertWithFallback, callExpertWithToolsAndFallback } from "../services/expert-router.js";
import { sessionMemory } from "../services/session-memory.js";
import { startBackgroundTask } from "../services/background-manager.js";
import { TimeoutError } from "../services/cliproxy-client.js";
import { wrapMcpResponse } from "../utils/response-saver.js";

// ============================================================================
// Security: Image Path Validation (LFI/SSRF Prevention)
// ============================================================================

/** 허용된 이미지 확장자 */
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

/** 허용된 로컬 디렉토리 (상대 경로) */
const ALLOWED_LOCAL_DIRECTORIES = ['./uploads', './images', './screenshots', './assets'];

/** 차단된 내부 IP 패턴 (SSRF 방지) */
const BLOCKED_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
];

/**
 * 이미지 경로 검증 (LFI/SSRF 방지)
 */
function validateImagePath(imagePath: string): { valid: boolean; error?: string } {
  // URL인 경우
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    // HTTP는 보안상 차단 (HTTPS만 허용)
    if (imagePath.startsWith('http://')) {
      return { valid: false, error: 'HTTP URL은 보안상 허용되지 않습니다. HTTPS를 사용하세요.' };
    }

    // 내부 IP/localhost 차단 (SSRF 방지)
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(imagePath)) {
        return { valid: false, error: '내부 네트워크 주소는 허용되지 않습니다.' };
      }
    }

    // URL 형식 검증
    try {
      const url = new URL(imagePath);
      // 허용된 프로토콜 확인
      if (url.protocol !== 'https:') {
        return { valid: false, error: 'HTTPS URL만 허용됩니다.' };
      }
    } catch {
      return { valid: false, error: '유효하지 않은 URL 형식입니다.' };
    }

    return { valid: true };
  }

  // 로컬 파일 경로인 경우
  // 경로 탈출 시도 차단 (../ 등)
  if (imagePath.includes('..')) {
    return { valid: false, error: '상위 디렉토리 접근(..)은 허용되지 않습니다.' };
  }

  // 절대 경로 차단 (보안상 상대 경로만 허용)
  if (isAbsolute(imagePath)) {
    return { valid: false, error: '절대 경로는 허용되지 않습니다. 상대 경로를 사용하세요.' };
  }

  // 절대 경로로 변환하여 비교 (디렉토리 경계 우회 방지)
  const resolvedPath = resolve(imagePath);

  // 허용된 디렉토리 내 파일인지 확인 (경로 경계 검사 포함)
  const isInAllowedDir = ALLOWED_LOCAL_DIRECTORIES.some(dir => {
    const resolvedDir = resolve(dir);
    // 디렉토리 경계까지 검사하여 ./images_evil 같은 우회 방지
    return resolvedPath === resolvedDir ||
           resolvedPath.startsWith(resolvedDir + sep);
  });

  if (!isInAllowedDir) {
    return {
      valid: false,
      error: `허용된 디렉토리만 접근 가능합니다: ${ALLOWED_LOCAL_DIRECTORIES.join(', ')}`
    };
  }

  // 확장자 검증
  const ext = resolvedPath.toLowerCase().slice(resolvedPath.lastIndexOf('.'));
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `허용된 이미지 형식만 가능합니다: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`
    };
  }

  // 파일 존재 여부 확인 (이미 resolve된 절대 경로 사용)
  if (!existsSync(resolvedPath)) {
    return { valid: false, error: `파일을 찾을 수 없습니다: ${imagePath}` };
  }

  return { valid: true };
}

// ============================================================================
// Schema
// ============================================================================

export const consultExpertSchema = z.object({
  expert: z.enum([
    // 기본 전문가 (11명)
    "strategist", "researcher", "reviewer", "frontend", "writer", "explorer", "multimodal",
    "librarian", "metis", "momus", "prometheus",
    // 특화 전문가 (7명)
    "security", "tester", "data", "codex_reviewer", "devops", "reality_checker", "lsp_index_engineer"
  ]).describe("자문할 전문가"),

  question: z.string()
    .min(10, "질문은 최소 10자 이상")
    .max(5000, "질문은 최대 5000자")
    .describe("전문가에게 할 질문"),

  context: z.string()
    .max(50000, "컨텍스트는 최대 50000자")
    .optional()
    .describe("관련 코드, 설계 문서 등 추가 컨텍스트"),

  image_path: z.string()
    .optional()
    .refine(
      (path) => {
        if (!path) return true; // optional이므로 빈 값 허용
        const result = validateImagePath(path);
        return result.valid;
      },
      (path) => {
        if (!path) return { message: '' };
        const result = validateImagePath(path);
        return { message: result.error || '유효하지 않은 이미지 경로입니다.' };
      }
    )
    .describe("분석할 이미지 파일 경로 또는 URL (multimodal 전문가용). 로컬: ./uploads/, ./images/ 내 파일만 허용. URL: HTTPS만 허용."),

  skip_cache: z.boolean()
    .default(false)
    .describe("캐시 무시하고 새로 호출"),

  use_tools: z.boolean()
    .default(true)
    .describe("전문가가 웹 검색, 문서 조회 등 도구를 사용할 수 있게 함 (기본: true)")
}).strict();

export const consultExpertTool = {
  name: "consult_expert",

  title: "외부 AI 전문가 자문",

  description: `외부 AI 전문가에게 자문을 구합니다.

## 전문가
- strategist: 설계/아키텍처 (GPT)
- researcher: 조사/분석 (Gemini)
- reviewer: 코드리뷰/버그 (Gemini)
- frontend: UI/UX (Gemini)
- writer: 문서작성 (Gemini)
- explorer: 빠른탐색 (Gemini)
- multimodal: 이미지분석 (Gemini) - image_path로 이미지 전달
- librarian: 지식관리 (Gemini)
- metis: 전략계획 (GPT)
- momus: 비판분석 (Gemini)
- prometheus: 창의솔루션 (GPT)
- security: 보안분석 (Gemini)
- tester: TDD/테스트 (GPT)
- data: DB설계 (GPT)
- codex_reviewer: GPT코드리뷰 (GPT)
- devops: CI/CD, 인프라 (GPT)
- reality_checker: 현실검증/레거시 잔재 탐지 (Gemini)
- lsp_index_engineer: 참조/심볼/인덱스 분석 (GPT)

Rate Limit 초과 시 자동 폴백. use_tools=false로 도구 비활성화 가능.`,

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

    return wrapMcpResponse(response, {
      expertId: params.expert,
      toolName: 'consult_expert',
      isWorkflow: false,
      expertInfo: {
        name: actualExpert.name,
        model: actualExpert.model,
        fellBack: result.fellBack,
        cached: result.cached,
        actualExpert: result.actualExpert,
      }
    });

  } catch (error) {
    // 타임아웃 발생 시 자동으로 백그라운드로 전환
    if (error instanceof TimeoutError) {
      const fullContext = params.context || '';
      const task = startBackgroundTask(
        params.expert,
        params.question,
        fullContext || undefined
      );

      return {
        content: [{
          type: "text" as const,
          text: `## ⏱️ 타임아웃 → 백그라운드 전환\n\n` +
                `**요청 전문가**: ${params.expert}\n` +
                `**상황**: 응답 시간이 길어 백그라운드로 자동 전환되었습니다.\n\n` +
                `### 결과 조회 방법\n` +
                `\`\`\`\n` +
                `background_expert_result(task_id="${task.id}")\n` +
                `\`\`\`\n\n` +
                `💡 다른 작업을 진행하면서 나중에 결과를 확인하세요.`
        }]
      };
    }

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
