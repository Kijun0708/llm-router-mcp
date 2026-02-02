// src/experts/codex-reviewer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { CODEX_REVIEWER_SYSTEM_PROMPT, CODEX_REVIEWER_METADATA } from '../prompts/experts/index.js';

export const codexReviewer: Expert = {
  id: "codex_reviewer",
  name: "GPT Codex Reviewer",
  model: config.models.codex_reviewer,

  role: "GPT 기반 코드 리뷰/리팩토링 전문가 (READ-ONLY)",

  systemPrompt: CODEX_REVIEWER_SYSTEM_PROMPT,

  temperature: 0.15,  // Slightly higher than reviewer for creative refactoring
  maxTokens: 4000,

  fallbacks: ["reviewer", "strategist"],

  useCases: CODEX_REVIEWER_METADATA.useWhen,

  toolChoice: "auto"
};

export { CODEX_REVIEWER_METADATA };
