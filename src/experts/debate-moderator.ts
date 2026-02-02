// src/experts/debate-moderator.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { DEBATE_MODERATOR_SYSTEM_PROMPT, DEBATE_MODERATOR_METADATA } from '../prompts/experts/index.js';

export const debateModerator: Expert = {
  id: "debate_moderator",
  name: "Claude Debate Moderator",
  model: config.models.debate_moderator,

  role: "토론 주제 분석 및 페르소나 할당 전문가",

  systemPrompt: DEBATE_MODERATOR_SYSTEM_PROMPT,

  temperature: 0.4,  // Higher creativity for diverse persona generation
  maxTokens: 3000,

  fallbacks: ["strategist", "researcher"],

  useCases: DEBATE_MODERATOR_METADATA.useWhen,

  toolChoice: "none"  // No tools needed for persona design
};

export { DEBATE_MODERATOR_METADATA };
