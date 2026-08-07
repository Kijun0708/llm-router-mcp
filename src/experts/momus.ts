// src/experts/momus.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { MOMUS_SYSTEM_PROMPT, MOMUS_METADATA } from '../prompts/experts/momus.prompt.js';

export const momus: Expert = {
  id: "momus",
  name: "Momus Validator",
  model: config.models.momus,

  provider: EXPERT_RUNTIME_DEFAULTS.momus.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.momus.sandbox,
  role: "계획 검증 및 QA 전문가",

  systemPrompt: MOMUS_SYSTEM_PROMPT,

  temperature: 0.3,
  maxTokens: 3500,  useCases: MOMUS_METADATA.useWhen,

  // READ-ONLY: momus validates but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { MOMUS_METADATA };
