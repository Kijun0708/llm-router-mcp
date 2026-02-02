// src/experts/claude-blank-2.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from '../prompts/experts/index.js';

export const claudeBlank2: Expert = {
  id: "claude_blank_2",
  name: "Claude Blank #2 (Sonnet)",
  model: config.models.claude_blank_2,

  role: "사용자 정의 페르소나 (Claude Sonnet 기반)",

  systemPrompt: BLANK_SYSTEM_PROMPT,

  temperature: 0.3,  // Moderate creativity for debates
  maxTokens: 4000,

  fallbacks: ["claude_blank_1", "gemini_blank_2"],

  useCases: BLANK_METADATA.useWhen,

  toolChoice: "none"
};
