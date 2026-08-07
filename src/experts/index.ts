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
import { implementer, IMPLEMENTER_METADATA } from './implementer.js';
// Blank experts for dynamic persona debates (GPT/Gemini only - Claude Code handles Claude)
import { gptBlank1 } from './gpt-blank-1.js';
import { gptBlank2 } from './gpt-blank-2.js';
import { geminiBlank1 } from './gemini-blank-1.js';
import { geminiBlank2 } from './gemini-blank-2.js';
// Debate moderator
import { debateModerator, DEBATE_MODERATOR_METADATA } from './debate-moderator.js';
import { BLANK_METADATA } from '../prompts/experts/index.js';
import type { ExpertPromptMetadata } from '../prompts/metadata/expert-metadata.js';
import { EXPERT_IDS } from '../model-defaults.js';
import { isKnownModel, providerOf } from '../services/providers/model-registry.js';

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
  implementer,
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
  implementer: ['strategist', 'codereview_gpt'],
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
  implementer,
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
  IMPLEMENTER_METADATA,
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
  implementer: IMPLEMENTER_METADATA,
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

/**
 * 부팅 시점 정합성 검증.
 *
 * 손으로 관리되는 목록이 6개(experts / EXPERT_RUNTIME_DEFAULTS / config.models /
 * FALLBACK_CHAIN / EXPERT_METADATA_REGISTRY / set-expert-model의 enum)나 되고
 * 실제로 서로 어긋나 있었다. 새벽 3시에 CLI가 "invalid model selection"을 뱉는 것보다
 * 부팅 실패가 낫다.
 */
export function validateExpertRegistry(): void {
  const problems: string[] = [];
  const expertIds: string[] = Object.keys(experts).sort();
  const runtimeIds: string[] = [...EXPERT_IDS].sort();

  if (expertIds.join(',') !== runtimeIds.join(',')) {
    problems.push(
      `experts와 EXPERT_RUNTIME_DEFAULTS의 키가 다릅니다.\n` +
      `  experts에만: ${expertIds.filter(id => !runtimeIds.includes(id)).join(', ') || '(없음)'}\n` +
      `  defaults에만: ${runtimeIds.filter(id => !expertIds.includes(id)).join(', ') || '(없음)'}`
    );
  }

  for (const [id, expert] of Object.entries(experts)) {
    if (expert.id !== id) {
      problems.push(`전문가 "${id}"의 id 필드가 "${expert.id}"입니다.`);
    }
    if (!isKnownModel(expert.model)) {
      problems.push(`전문가 "${id}"의 모델 "${expert.model}"이 레지스트리에 없습니다.`);
      continue;
    }
    const declared = providerOf(expert.model);
    if (declared !== expert.provider) {
      problems.push(
        `전문가 "${id}": 모델 "${expert.model}"은 프로바이더 "${declared}" 소속인데 ` +
        `"${expert.provider}"로 선언됐습니다.`
      );
    }
    if (!EXPERT_METADATA_REGISTRY[id]) {
      problems.push(`전문가 "${id}"의 메타데이터가 없습니다.`);
    }
  }

  for (const [id, chain] of Object.entries(FALLBACK_CHAIN)) {
    if (!experts[id]) {
      problems.push(`FALLBACK_CHAIN에 존재하지 않는 전문가 "${id}"가 있습니다.`);
    }
    for (const target of chain) {
      if (!experts[target]) {
        problems.push(`FALLBACK_CHAIN["${id}"]가 존재하지 않는 "${target}"를 가리킵니다.`);
      }
    }
  }
  for (const id of expertIds) {
    if (!FALLBACK_CHAIN[id]) {
      problems.push(`전문가 "${id}"의 FALLBACK_CHAIN 항목이 없습니다.`);
    }
  }

  // implementer만 쓰기 권한을 가져야 한다.
  for (const [id, expert] of Object.entries(experts)) {
    if (expert.sandbox === 'workspace-write' && id !== 'implementer') {
      problems.push(`전문가 "${id}"가 쓰기 권한(workspace-write)을 갖고 있습니다. implementer만 허용됩니다.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`전문가 레지스트리 정합성 오류:\n - ${problems.join('\n - ')}`);
  }
}
