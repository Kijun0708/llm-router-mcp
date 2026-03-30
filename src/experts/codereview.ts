// src/experts/codereview.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { CODEREVIEW_SYSTEM_PROMPT, CODEREVIEW_METADATA } from '../prompts/experts/codereview.prompt.js';

export const codereview: Expert = {
  id: "codereview",
  name: "Code Reviewer",
  model: config.models.codereview,

  role: "통합 코드 리뷰 전문가 - 버그/보안 + SOLID/설계 (READ-ONLY)",

  systemPrompt: CODEREVIEW_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 4000,

  fallbacks: ["strategist", "momus"],

  useCases: CODEREVIEW_METADATA.useWhen,

  toolChoice: "auto"
};

export { CODEREVIEW_METADATA };
