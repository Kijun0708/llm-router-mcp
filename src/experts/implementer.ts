// src/experts/implementer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { IMPLEMENTER_SYSTEM_PROMPT, IMPLEMENTER_METADATA } from '../prompts/experts/implementer.prompt.js';

export const implementer: Expert = {
  id: "implementer",
  name: "GPT Implementer",
  model: config.models.implementer,

  role: "코드 구현 에이전트 - 파일 읽기/쓰기 가능 (READ-WRITE)",

  systemPrompt: IMPLEMENTER_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 4000,

  fallbacks: ["strategist", "codereview_gpt"],

  useCases: IMPLEMENTER_METADATA.useWhen,

  toolChoice: "auto"
};

export { IMPLEMENTER_METADATA };
