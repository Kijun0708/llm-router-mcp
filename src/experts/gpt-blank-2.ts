// src/experts/gpt-blank-2.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from '../prompts/experts/index.js';

export const gptBlank2: Expert = {
  id: "gpt_blank_2",
  name: "GPT Blank #2 (Codex)",
  model: config.models.gpt_blank_2,

  role: "사용자 정의 페르소나 (GPT Codex 기반)",

  systemPrompt: BLANK_SYSTEM_PROMPT,

  temperature: 0.3,  // Moderate creativity for debates
  maxTokens: 4000,

  fallbacks: ["gpt_blank_1", "claude_blank_2"],

  useCases: BLANK_METADATA.useWhen,

  toolChoice: "none"
};
