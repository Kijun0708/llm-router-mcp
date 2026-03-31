// src/experts/index.ts

import { Expert } from '../types.js';
import { strategist, STRATEGIST_METADATA } from './strategist.js';
import { codereview, CODEREVIEW_METADATA } from './codereview.js';
import { frontend, FRONTEND_METADATA } from './frontend.js';
import { metis, METIS_METADATA } from './metis.js';
import { momus, MOMUS_METADATA } from './momus.js';
import { security, SECURITY_METADATA } from './security.js';
import { tester, TESTER_METADATA } from './tester.js';
import { data, DATA_METADATA } from './data.js';
import { devops, DEVOPS_METADATA } from './devops.js';
import { realityChecker, REALITY_CHECKER_METADATA } from './reality-checker.js';
import { lspIndexEngineer, LSP_INDEX_ENGINEER_METADATA } from './lsp-index-engineer.js';
import { codereviewGpt, CODEREVIEW_GPT_METADATA } from './codereview-gpt.js';
// Blank experts for dynamic persona debates (GPT/Gemini only - Claude Code handles Claude)
import { gptBlank1 } from './gpt-blank-1.js';
import { gptBlank2 } from './gpt-blank-2.js';
import { geminiBlank1 } from './gemini-blank-1.js';
import { geminiBlank2 } from './gemini-blank-2.js';
// Debate moderator
import { debateModerator, DEBATE_MODERATOR_METADATA } from './debate-moderator.js';
import { BLANK_METADATA } from '../prompts/experts/index.js';
import type { ExpertPromptMetadata } from '../prompts/metadata/expert-metadata.js';

export const experts: Record<string, Expert> = {
  strategist,
  codereview,
  frontend,
  metis,
  momus,
  security,
  tester,
  data,
  devops,
  reality_checker: realityChecker,
  lsp_index_engineer: lspIndexEngineer,
  codereview_gpt: codereviewGpt,
  // Blank experts for dynamic persona debates (GPT/Gemini only)
  gpt_blank_1: gptBlank1,
  gpt_blank_2: gptBlank2,
  gemini_blank_1: geminiBlank1,
  gemini_blank_2: geminiBlank2,
  // Debate moderator
  debate_moderator: debateModerator
};

export type ExpertId = keyof typeof experts;

// 폴백 매핑
export const FALLBACK_CHAIN: Record<string, string[]> = {
  strategist: ['codereview', 'momus'],
  codereview: ['strategist', 'momus'],
  frontend: ['strategist', 'momus'],
  metis: ['strategist', 'codereview'],
  momus: ['codereview', 'strategist'],
  security: ['codereview', 'strategist'],
  tester: ['codereview', 'strategist'],
  data: ['strategist', 'codereview'],
  devops: ['strategist', 'codereview'],
  reality_checker: ['momus', 'codereview'],
  lsp_index_engineer: ['codereview', 'strategist'],
  codereview_gpt: ['codereview', 'momus'],
  // Blank experts (교차 프로바이더 우선 폴백)
  gpt_blank_1: ['gemini_blank_1', 'gpt_blank_2'],
  gpt_blank_2: ['gemini_blank_2', 'gpt_blank_1'],
  gemini_blank_1: ['gpt_blank_1', 'gemini_blank_2'],
  gemini_blank_2: ['gpt_blank_2', 'gemini_blank_1'],
  // Debate moderator
  debate_moderator: ['strategist', 'momus']
};

// Export individual experts
export {
  strategist, codereview, frontend,
  metis, momus,
  security, tester, data, devops, realityChecker, lspIndexEngineer,
  codereviewGpt,
  gptBlank1, gptBlank2, geminiBlank1, geminiBlank2,
  debateModerator
};

// Export metadata
export {
  STRATEGIST_METADATA,
  CODEREVIEW_METADATA,
  FRONTEND_METADATA,
  METIS_METADATA,
  MOMUS_METADATA,
  SECURITY_METADATA,
  TESTER_METADATA,
  DATA_METADATA,
  DEVOPS_METADATA,
  REALITY_CHECKER_METADATA,
  LSP_INDEX_ENGINEER_METADATA,
  CODEREVIEW_GPT_METADATA,
  BLANK_METADATA,
  DEBATE_MODERATOR_METADATA
};

/**
 * Complete registry of all expert metadata for auto-routing.
 */
export const EXPERT_METADATA_REGISTRY: Record<string, ExpertPromptMetadata> = {
  strategist: STRATEGIST_METADATA,
  codereview: CODEREVIEW_METADATA,
  frontend: FRONTEND_METADATA,
  metis: METIS_METADATA,
  momus: MOMUS_METADATA,
  security: SECURITY_METADATA,
  tester: TESTER_METADATA,
  data: DATA_METADATA,
  devops: DEVOPS_METADATA,
  reality_checker: REALITY_CHECKER_METADATA,
  lsp_index_engineer: LSP_INDEX_ENGINEER_METADATA,
  codereview_gpt: CODEREVIEW_GPT_METADATA,
  // Blank experts (shared metadata, GPT/Gemini only)
  gpt_blank_1: BLANK_METADATA,
  gpt_blank_2: BLANK_METADATA,
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
