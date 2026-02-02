// src/experts/index.ts

import { Expert } from '../types.js';
import { strategist, STRATEGIST_METADATA } from './strategist.js';
import { researcher, RESEARCHER_METADATA } from './researcher.js';
import { reviewer, REVIEWER_METADATA } from './reviewer.js';
import { frontend, FRONTEND_METADATA } from './frontend.js';
import { writer, WRITER_METADATA } from './writer.js';
import { explorer, EXPLORER_METADATA } from './explorer.js';
import { multimodal, MULTIMODAL_METADATA } from './multimodal.js';
import { prometheus, PROMETHEUS_METADATA } from './prometheus.js';
import { metis, METIS_METADATA } from './metis.js';
import { momus, MOMUS_METADATA } from './momus.js';
import { librarian, LIBRARIAN_METADATA } from './librarian.js';
// New specialized experts
import { security, SECURITY_METADATA } from './security.js';
import { tester, TESTER_METADATA } from './tester.js';
import { data, DATA_METADATA } from './data.js';
import { codexReviewer, CODEX_REVIEWER_METADATA } from './codex-reviewer.js';
// Blank experts for dynamic persona debates
import { gptBlank1 } from './gpt-blank-1.js';
import { gptBlank2 } from './gpt-blank-2.js';
import { claudeBlank1 } from './claude-blank-1.js';
import { claudeBlank2 } from './claude-blank-2.js';
import { geminiBlank1 } from './gemini-blank-1.js';
import { geminiBlank2 } from './gemini-blank-2.js';
// Debate moderator
import { debateModerator, DEBATE_MODERATOR_METADATA } from './debate-moderator.js';
import { BLANK_METADATA } from '../prompts/experts/index.js';
import type { ExpertPromptMetadata } from '../prompts/metadata/expert-metadata.js';

export const experts: Record<string, Expert> = {
  strategist,
  researcher,
  reviewer,
  frontend,
  writer,
  explorer,
  multimodal,
  prometheus,
  metis,
  momus,
  librarian,
  // New specialized experts
  security,
  tester,
  data,
  codex_reviewer: codexReviewer,
  // Blank experts for dynamic persona debates
  gpt_blank_1: gptBlank1,
  gpt_blank_2: gptBlank2,
  claude_blank_1: claudeBlank1,
  claude_blank_2: claudeBlank2,
  gemini_blank_1: geminiBlank1,
  gemini_blank_2: geminiBlank2,
  // Debate moderator
  debate_moderator: debateModerator
};

export type ExpertId = keyof typeof experts;

// 폴백 매핑
export const FALLBACK_CHAIN: Record<string, string[]> = {
  strategist: ['researcher', 'reviewer'],
  researcher: ['reviewer', 'explorer'],
  reviewer: ['explorer', 'writer', 'codex_reviewer'],  // Added codex_reviewer
  frontend: ['writer', 'explorer'],
  writer: ['explorer', 'reviewer'],
  explorer: ['writer', 'researcher'],
  multimodal: ['researcher', 'reviewer'],  // Multimodal fallback chain
  prometheus: ['strategist', 'metis'],     // Planning agents
  metis: ['prometheus', 'strategist'],
  momus: ['reviewer', 'strategist'],
  librarian: ['researcher', 'explorer'],
  // New specialized experts
  security: ['reviewer', 'strategist'],
  tester: ['reviewer', 'researcher'],
  data: ['strategist', 'researcher'],
  codex_reviewer: ['reviewer', 'strategist'],
  // Blank experts (same provider first, then cross-provider)
  gpt_blank_1: ['gpt_blank_2', 'claude_blank_1'],
  gpt_blank_2: ['gpt_blank_1', 'claude_blank_2'],
  claude_blank_1: ['claude_blank_2', 'gemini_blank_1'],
  claude_blank_2: ['claude_blank_1', 'gemini_blank_2'],
  gemini_blank_1: ['gemini_blank_2', 'gpt_blank_1'],
  gemini_blank_2: ['gemini_blank_1', 'gpt_blank_2'],
  // Debate moderator
  debate_moderator: ['strategist', 'researcher']
};

// Export individual experts
export {
  strategist, researcher, reviewer, frontend, writer, explorer, multimodal,
  prometheus, metis, momus, librarian,
  security, tester, data, codexReviewer,
  gptBlank1, gptBlank2, claudeBlank1, claudeBlank2, geminiBlank1, geminiBlank2,
  debateModerator
};

// Export metadata
export {
  STRATEGIST_METADATA,
  RESEARCHER_METADATA,
  REVIEWER_METADATA,
  FRONTEND_METADATA,
  WRITER_METADATA,
  EXPLORER_METADATA,
  MULTIMODAL_METADATA,
  PROMETHEUS_METADATA,
  METIS_METADATA,
  MOMUS_METADATA,
  LIBRARIAN_METADATA,
  SECURITY_METADATA,
  TESTER_METADATA,
  DATA_METADATA,
  CODEX_REVIEWER_METADATA,
  BLANK_METADATA,
  DEBATE_MODERATOR_METADATA
};

/**
 * Complete registry of all expert metadata for auto-routing.
 */
export const EXPERT_METADATA_REGISTRY: Record<string, ExpertPromptMetadata> = {
  strategist: STRATEGIST_METADATA,
  researcher: RESEARCHER_METADATA,
  reviewer: REVIEWER_METADATA,
  frontend: FRONTEND_METADATA,
  writer: WRITER_METADATA,
  explorer: EXPLORER_METADATA,
  multimodal: MULTIMODAL_METADATA,
  prometheus: PROMETHEUS_METADATA,
  metis: METIS_METADATA,
  momus: MOMUS_METADATA,
  librarian: LIBRARIAN_METADATA,
  // New specialized experts
  security: SECURITY_METADATA,
  tester: TESTER_METADATA,
  data: DATA_METADATA,
  codex_reviewer: CODEX_REVIEWER_METADATA,
  // Blank experts (shared metadata)
  gpt_blank_1: BLANK_METADATA,
  gpt_blank_2: BLANK_METADATA,
  claude_blank_1: BLANK_METADATA,
  claude_blank_2: BLANK_METADATA,
  gemini_blank_1: BLANK_METADATA,
  gemini_blank_2: BLANK_METADATA,
  // Debate moderator
  debate_moderator: DEBATE_MODERATOR_METADATA
};

/**
 * Gets metadata for an expert by ID.
 */
export function getExpertMetadata(expertId: string): ExpertPromptMetadata | undefined {
  return EXPERT_METADATA_REGISTRY[expertId];
}

/**
 * Lists all available expert IDs.
 */
export function listExpertIds(): string[] {
  return Object.keys(experts);
}
