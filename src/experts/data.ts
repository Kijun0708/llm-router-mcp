// src/experts/data.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { DATA_SYSTEM_PROMPT, DATA_METADATA } from '../prompts/experts/index.js';

export const data: Expert = {
  id: "data",
  name: "GPT Data Architect",
  model: config.models.data,

  role: "DB 설계/쿼리 최적화 전문가",

  systemPrompt: DATA_SYSTEM_PROMPT,

  temperature: 0.1,  // Conservative for accurate query optimization
  maxTokens: 4000,

  fallbacks: ["strategist", "researcher"],

  useCases: DATA_METADATA.useWhen,

  toolChoice: "auto"
};

export { DATA_METADATA };
