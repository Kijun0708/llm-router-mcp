// src/experts/codereview-gpt.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { CODEREVIEW_GPT_SYSTEM_PROMPT, CODEREVIEW_GPT_METADATA } from '../prompts/experts/codereview-gpt.prompt.js';

export const codereviewGpt: Expert = {
  id: "codereview_gpt",
  name: "GPT Code Reviewer",
  model: config.models.codereview_gpt,

  provider: EXPERT_RUNTIME_DEFAULTS.codereview_gpt.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.codereview_gpt.sandbox,
  role: "GPT 코드리뷰 전문가 - 실무/SOLID/설계 관점 (READ-ONLY)",

  systemPrompt: CODEREVIEW_GPT_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 4000,  useCases: CODEREVIEW_GPT_METADATA.useWhen,

  toolChoice: "auto"
};

export { CODEREVIEW_GPT_METADATA };
