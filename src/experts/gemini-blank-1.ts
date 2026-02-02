// src/experts/gemini-blank-1.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from '../prompts/experts/index.js';

export const geminiBlank1: Expert = {
  id: "gemini_blank_1",
  name: "Gemini Blank #1 (Pro)",
  model: config.models.gemini_blank_1,

  role: "사용자 정의 페르소나 (Gemini Pro 기반)",

  systemPrompt: BLANK_SYSTEM_PROMPT,

  temperature: 0.3,  // Moderate creativity for debates
  maxTokens: 4000,

  fallbacks: ["gemini_blank_2", "gpt_blank_1"],

  useCases: BLANK_METADATA.useWhen,

  toolChoice: "none"
};
