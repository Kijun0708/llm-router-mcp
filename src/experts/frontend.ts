// src/experts/frontend.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { FRONTEND_SYSTEM_PROMPT, FRONTEND_METADATA } from '../prompts/experts/index.js';

export const frontend: Expert = {
  id: "frontend",
  name: "Gemini Frontend",
  model: config.models.frontend,

  role: "UI/UX/프론트엔드 전문가 (Designer Pattern)",

  // Enhanced prompt from prompts/experts/frontend.prompt.ts
  systemPrompt: FRONTEND_SYSTEM_PROMPT,

  temperature: 0.3,
  maxTokens: 4000,  // Increased for detailed UI implementations

  fallbacks: ["strategist", "momus"],

  useCases: FRONTEND_METADATA.useWhen,

  toolChoice: "auto"
};

// Export metadata for external use
export { FRONTEND_METADATA };
