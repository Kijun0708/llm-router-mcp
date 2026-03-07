// src/tools/set-expert-model.ts

import { z } from "zod";
import { config } from "../config.js";
import { experts } from "../experts/index.js";

const expertIds = [
  "strategist", "researcher", "reviewer", "frontend", "writer", "explorer", "multimodal",
  "librarian", "metis", "momus", "prometheus", "security", "tester", "data", "codex_reviewer", "devops"
] as const;

export const setExpertModelSchema = z.object({
  expert: z.enum(expertIds)
    .describe("변경할 전문가 ID"),

  model: z.string()
    .min(1)
    .describe("새로운 모델 이름 (예: gpt-4o, claude-sonnet-4, gemini-2.0-pro)")
}).strict();

export const setExpertModelTool = {
  name: "set_expert_model",

  title: "전문가 모델 변경",

  description: `전문가가 사용하는 LLM 모델을 런타임에 변경합니다.

## 전문가 목록
- strategist: 전략/설계/아키텍처 (기본: gpt-5.4)
- researcher: 조사/문서분석 (기본: claude-sonnet-4-5-20250929)
- reviewer: 코드리뷰/보안 (기본: gemini-2.5-pro)
- frontend: UI/UX/컴포넌트 (기본: gemini-2.5-pro)
- writer: 문서작성 (기본: gemini-2.5-flash)
- explorer: 빠른검색 (기본: gemini-2.5-flash)
- multimodal: 이미지/시각분석 (기본: gemini-2.5-pro)

## 사용 예시
- expert: "strategist", model: "gpt-4o"
- expert: "researcher", model: "claude-opus-4"

## 참고
- 변경사항은 MCP 세션 동안만 유지됩니다
- 영구 변경은 .env 파일의 MODEL_* 환경변수를 수정하세요`,

  inputSchema: setExpertModelSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export async function handleSetExpertModel(params: z.infer<typeof setExpertModelSchema>) {
  const { expert, model } = params;

  const oldModel = config.models[expert];

  // config.models 업데이트
  (config.models as Record<string, string>)[expert] = model;

  // experts 객체도 업데이트
  if (experts[expert]) {
    (experts[expert] as { model: string }).model = model;
  }

  const output = `## ✅ 모델 변경 완료

| 항목 | 값 |
|------|-----|
| 전문가 | **${expert}** |
| 이전 모델 | \`${oldModel}\` |
| 새 모델 | \`${model}\` |

> 💡 이 변경은 현재 MCP 세션 동안만 유효합니다.
> 영구 변경은 \`.env\` 파일에서 \`MODEL_${expert.toUpperCase()}\` 환경변수를 설정하세요.`;

  return {
    content: [{ type: "text" as const, text: output }]
  };
}
