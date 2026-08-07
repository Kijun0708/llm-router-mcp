// src/experts/tester.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { TESTER_SYSTEM_PROMPT, TESTER_METADATA } from '../prompts/experts/index.js';

export const tester: Expert = {
  id: "tester",
  name: "Claude Tester",
  model: config.models.tester,

  provider: EXPERT_RUNTIME_DEFAULTS.tester.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.tester.sandbox,
  role: "TDD/테스트 전략 전문가",

  systemPrompt: TESTER_SYSTEM_PROMPT,

  temperature: 0.2,  // Slightly creative for edge case discovery
  maxTokens: 4000,
  useCases: TESTER_METADATA.useWhen,

  toolChoice: "auto"
};

export { TESTER_METADATA };
