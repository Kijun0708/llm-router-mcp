// src/experts/tester.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { TESTER_SYSTEM_PROMPT, TESTER_METADATA } from '../prompts/experts/index.js';

export const tester: Expert = {
  id: "tester",
  name: "Claude Tester",
  model: config.models.tester,

  role: "TDD/테스트 전략 전문가",

  systemPrompt: TESTER_SYSTEM_PROMPT,

  temperature: 0.2,  // Slightly creative for edge case discovery
  maxTokens: 4000,

  fallbacks: ["reviewer", "researcher"],

  useCases: TESTER_METADATA.useWhen,

  toolChoice: "auto"
};

export { TESTER_METADATA };
