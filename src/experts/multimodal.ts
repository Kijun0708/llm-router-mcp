// src/experts/multimodal.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import {
  MULTIMODAL_SYSTEM_PROMPT,
  MULTIMODAL_METADATA
} from '../prompts/experts/multimodal.prompt.js';

/**
 * Multimodal Looker Expert
 *
 * Specialized in visual content analysis:
 * - Screenshots and images
 * - UI/UX designs and mockups
 * - Technical diagrams and flowcharts
 * - Charts, graphs, and data visualizations
 * - Error messages and logs in visual format
 *
 * Uses Gemini Pro for multimodal capabilities.
 */
export const multimodal: Expert = {
  id: "multimodal",
  name: "Multimodal Looker",
  model: config.models.multimodal || 'gemini-3.1-pro-preview',
  role: "이미지/시각적 콘텐츠 분석 전문가 (Multimodal Analysis)",
  systemPrompt: MULTIMODAL_SYSTEM_PROMPT,
  temperature: 0.3,
  maxTokens: 4000,
  fallbacks: ['researcher', 'reviewer'],
  useCases: MULTIMODAL_METADATA.useWhen,
  toolChoice: "none"
};

export { MULTIMODAL_METADATA };
