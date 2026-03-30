// src/experts/metis.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { METIS_SYSTEM_PROMPT, METIS_METADATA } from '../prompts/experts/metis.prompt.js';

export const metis: Expert = {
  id: "metis",
  name: "Metis Analyst",
  model: config.models.metis,

  role: "사전 분석 전문가 (요구사항/가능성 분석)",

  systemPrompt: METIS_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 3500,

  fallbacks: ["strategist", "codereview"],

  useCases: METIS_METADATA.useWhen,

  // READ-ONLY: metis analyzes but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { METIS_METADATA };
