// src/experts/strategist.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { STRATEGIST_SYSTEM_PROMPT, STRATEGIST_METADATA } from '../prompts/experts/index.js';

export const strategist: Expert = {
  id: "strategist",
  name: "GPT Strategist",
  model: config.models.strategist,

  role: "전략/설계/아키텍처 전문가 (READ-ONLY)",

  // Enhanced prompt from prompts/experts/strategist.prompt.ts
  systemPrompt: STRATEGIST_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 4000,  // Increased for detailed responses

  fallbacks: ["codereview", "momus"],

  useCases: STRATEGIST_METADATA.useWhen,

  // READ-ONLY: strategist analyzes but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { STRATEGIST_METADATA };
