// src/experts/gpt-blank-1.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from '../prompts/experts/index.js';

export const gptBlank1: Expert = {
  id: "gpt_blank_1",
  name: "GPT Blank #1",
  model: config.models.gpt_blank_1,

  role: "사용자 정의 페르소나 (GPT 5.2 기반)",

  systemPrompt: BLANK_SYSTEM_PROMPT,

  temperature: 0.3,  // Moderate creativity for debates
  maxTokens: 4000,

  fallbacks: ["gpt_blank_2", "claude_blank_1"],

  useCases: BLANK_METADATA.useWhen,

  toolChoice: "none"  // No tools for debate participants
};
