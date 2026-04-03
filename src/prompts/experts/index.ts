/**
 * Expert Prompts Index
 *
 * Exports all expert prompts and their metadata.
 */

// Strategist (Oracle pattern)
export {
  STRATEGIST_SYSTEM_PROMPT,
  STRATEGIST_METADATA,
  buildStrategistPrompt,
} from './strategist.prompt.js';

// Frontend (UI/UX Engineer)
export {
  FRONTEND_SYSTEM_PROMPT,
  FRONTEND_METADATA,
  buildFrontendPrompt,
} from './frontend.prompt.js';

// Codereview (Unified Code Review)
export {
  CODEREVIEW_SYSTEM_PROMPT,
  CODEREVIEW_METADATA,
  buildCodereviewPrompt,
  type CodereviewFocus,
  type CodereviewDepth,
} from './codereview.prompt.js';

// Metis (Pre-planning Analysis)
export {
  METIS_SYSTEM_PROMPT,
  METIS_METADATA,
  buildMetisPrompt,
} from './metis.prompt.js';

// Momus (Plan Validation)
export {
  MOMUS_SYSTEM_PROMPT,
  MOMUS_METADATA,
  buildMomusPrompt,
} from './momus.prompt.js';

// Security (OWASP/CWE Analysis)
export {
  SECURITY_SYSTEM_PROMPT,
  SECURITY_METADATA,
  buildSecurityPrompt,
  type SecurityDepth,
} from './security.prompt.js';

// Tester (TDD/Test Strategy)
export {
  TESTER_SYSTEM_PROMPT,
  TESTER_METADATA,
  buildTesterPrompt,
  type TestDepth,
} from './tester.prompt.js';

// Data (Database/Query Optimization)
export {
  DATA_SYSTEM_PROMPT,
  DATA_METADATA,
  buildDataPrompt,
  type DataDepth,
} from './data.prompt.js';

// DevOps (CI/CD, Docker, Kubernetes)
export {
  DEVOPS_SYSTEM_PROMPT,
  DEVOPS_METADATA,
  buildDevOpsPrompt,
  type DevOpsDepth,
} from './devops.prompt.js';

export {
  REALITY_CHECKER_SYSTEM_PROMPT,
  REALITY_CHECKER_METADATA,
  buildRealityCheckerPrompt,
} from './reality-checker.prompt.js';

export {
  LSP_INDEX_ENGINEER_SYSTEM_PROMPT,
  LSP_INDEX_ENGINEER_METADATA,
  buildLspIndexEngineerPrompt,
} from './lsp-index-engineer.prompt.js';

// Codereview GPT (GPT Code Reviewer)
export {
  CODEREVIEW_GPT_SYSTEM_PROMPT,
  CODEREVIEW_GPT_METADATA,
  buildCodereviewGptPrompt,
  type CodereviewGptDepth,
} from './codereview-gpt.prompt.js';

// Implementer (Implementation Expert)
export {
  IMPLEMENTER_SYSTEM_PROMPT,
  IMPLEMENTER_METADATA,
} from './implementer.prompt.js';

// Blank (Dynamic Persona)
export {
  BLANK_SYSTEM_PROMPT,
  BLANK_METADATA,
  buildBlankPromptWithPersona,
  buildDebatePrompt,
} from './blank.prompt.js';

// Debate Moderator (Persona Designer)
export {
  DEBATE_MODERATOR_SYSTEM_PROMPT,
  DEBATE_MODERATOR_METADATA,
  buildDebateModeratorPrompt,
} from './debate-moderator.prompt.js';

// Import for internal use
import { STRATEGIST_SYSTEM_PROMPT, STRATEGIST_METADATA } from './strategist.prompt.js';
import { FRONTEND_SYSTEM_PROMPT, FRONTEND_METADATA } from './frontend.prompt.js';
import { CODEREVIEW_SYSTEM_PROMPT, CODEREVIEW_METADATA } from './codereview.prompt.js';
import { METIS_SYSTEM_PROMPT, METIS_METADATA } from './metis.prompt.js';
import { MOMUS_SYSTEM_PROMPT, MOMUS_METADATA } from './momus.prompt.js';
import { SECURITY_SYSTEM_PROMPT, SECURITY_METADATA } from './security.prompt.js';
import { TESTER_SYSTEM_PROMPT, TESTER_METADATA } from './tester.prompt.js';
import { DATA_SYSTEM_PROMPT, DATA_METADATA } from './data.prompt.js';
import { DEVOPS_SYSTEM_PROMPT, DEVOPS_METADATA } from './devops.prompt.js';
import { REALITY_CHECKER_SYSTEM_PROMPT, REALITY_CHECKER_METADATA } from './reality-checker.prompt.js';
import { LSP_INDEX_ENGINEER_SYSTEM_PROMPT, LSP_INDEX_ENGINEER_METADATA } from './lsp-index-engineer.prompt.js';
import { CODEREVIEW_GPT_SYSTEM_PROMPT, CODEREVIEW_GPT_METADATA } from './codereview-gpt.prompt.js';
import { IMPLEMENTER_SYSTEM_PROMPT, IMPLEMENTER_METADATA } from './implementer.prompt.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from './blank.prompt.js';
import { DEBATE_MODERATOR_SYSTEM_PROMPT, DEBATE_MODERATOR_METADATA } from './debate-moderator.prompt.js';
import type { ExpertRegistry } from '../metadata/expert-metadata.js';

/**
 * Complete registry of all expert metadata.
 */
export const EXPERT_REGISTRY: ExpertRegistry = {
  strategist: STRATEGIST_METADATA,
  frontend: FRONTEND_METADATA,
  codereview: CODEREVIEW_METADATA,
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
  // Blank experts (share same metadata) - GPT/Gemini only
  gpt_blank_1: BLANK_METADATA,
  gpt_blank_2: BLANK_METADATA,
  gemini_blank_1: BLANK_METADATA,
  gemini_blank_2: BLANK_METADATA,
  // Debate moderator
  debate_moderator: DEBATE_MODERATOR_METADATA,
};

/**
 * Map of expert IDs to their system prompts.
 */
export const EXPERT_PROMPTS: Record<string, string> = {
  strategist: STRATEGIST_SYSTEM_PROMPT,
  frontend: FRONTEND_SYSTEM_PROMPT,
  codereview: CODEREVIEW_SYSTEM_PROMPT,
  metis: METIS_SYSTEM_PROMPT,
  momus: MOMUS_SYSTEM_PROMPT,
  security: SECURITY_SYSTEM_PROMPT,
  tester: TESTER_SYSTEM_PROMPT,
  data: DATA_SYSTEM_PROMPT,
  devops: DEVOPS_SYSTEM_PROMPT,
  reality_checker: REALITY_CHECKER_SYSTEM_PROMPT,
  lsp_index_engineer: LSP_INDEX_ENGINEER_SYSTEM_PROMPT,
  codereview_gpt: CODEREVIEW_GPT_SYSTEM_PROMPT,
  implementer: IMPLEMENTER_SYSTEM_PROMPT,
  // Blank experts (share same minimal prompt) - GPT/Gemini only
  gpt_blank_1: BLANK_SYSTEM_PROMPT,
  gpt_blank_2: BLANK_SYSTEM_PROMPT,
  gemini_blank_1: BLANK_SYSTEM_PROMPT,
  gemini_blank_2: BLANK_SYSTEM_PROMPT,
  // Debate moderator
  debate_moderator: DEBATE_MODERATOR_SYSTEM_PROMPT,
};

/**
 * Gets the system prompt for an expert.
 */
export function getExpertPrompt(expertId: string): string | undefined {
  return EXPERT_PROMPTS[expertId];
}
