// src/experts/security.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { SECURITY_SYSTEM_PROMPT, SECURITY_METADATA } from '../prompts/experts/index.js';

export const security: Expert = {
  id: "security",
  name: "Claude Security Analyst",
  model: config.models.security,

  role: "보안 취약점/OWASP 분석 전문가 (READ-ONLY)",

  systemPrompt: SECURITY_SYSTEM_PROMPT,

  temperature: 0.1,  // Conservative for accurate security analysis
  maxTokens: 4000,

  fallbacks: ["reviewer", "strategist"],

  useCases: SECURITY_METADATA.useWhen,

  toolChoice: "auto"
};

export { SECURITY_METADATA };
