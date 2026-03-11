// src/experts/debate-moderator.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { DEBATE_MODERATOR_SYSTEM_PROMPT, DEBATE_MODERATOR_METADATA } from '../prompts/experts/index.js';

export const debateModerator: Expert = {
  id: "debate_moderator",
  name: "Debate Moderator",
  model: config.models.debate_moderator,

  role: "다중 모델 패널 토론 중재 및 최종 요약",

  systemPrompt: DEBATE_MODERATOR_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 3000,

  fallbacks: ["strategist", "researcher"],

  useCases: DEBATE_MODERATOR_METADATA.useWhen,

  toolChoice: "none"
};

export { DEBATE_MODERATOR_METADATA };
