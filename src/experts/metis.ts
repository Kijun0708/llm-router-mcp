// src/experts/metis.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { METIS_SYSTEM_PROMPT, METIS_METADATA } from '../prompts/experts/metis.prompt.js';

export const metis: Expert = {
  id: "metis",
  name: "Metis Analyst",
  model: config.models.metis,

  provider: EXPERT_RUNTIME_DEFAULTS.metis.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.metis.sandbox,
  role: "사전 분석 전문가 (요구사항/가능성 분석)",

  systemPrompt: METIS_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 3500,  useCases: METIS_METADATA.useWhen,

  // READ-ONLY: metis analyzes but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { METIS_METADATA };
