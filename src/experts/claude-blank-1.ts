// src/experts/claude-blank-1.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from '../prompts/experts/index.js';

export const claudeBlank1: Expert = {
  id: "claude_blank_1",
  name: "Claude Blank #1 (Opus)",
  model: config.models.claude_blank_1,

  role: "사용자 정의 페르소나 (Claude Opus 기반)",

  systemPrompt: BLANK_SYSTEM_PROMPT,

  temperature: 0.3,  // Moderate creativity for debates
  maxTokens: 4000,

  fallbacks: ["claude_blank_2", "gemini_blank_1"],

  useCases: BLANK_METADATA.useWhen,

  toolChoice: "none"
};
