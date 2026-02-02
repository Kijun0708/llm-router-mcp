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

// Researcher (Librarian pattern)
export {
  RESEARCHER_SYSTEM_PROMPT,
  RESEARCHER_METADATA,
  buildResearcherPrompt,
  type ResearchDepth,
} from './researcher.prompt.js';

// Explorer (Explore pattern)
export {
  EXPLORER_SYSTEM_PROMPT,
  EXPLORER_METADATA,
  buildExplorerPrompt,
  type ExplorerThoroughness,
} from './explorer.prompt.js';

// Frontend (UI/UX Engineer)
export {
  FRONTEND_SYSTEM_PROMPT,
  FRONTEND_METADATA,
  buildFrontendPrompt,
} from './frontend.prompt.js';

// Reviewer (Code Review)
export {
  REVIEWER_SYSTEM_PROMPT,
  REVIEWER_METADATA,
  buildReviewerPrompt,
  type ReviewFocus,
} from './reviewer.prompt.js';

// Writer (Technical Documentation)
export {
  WRITER_SYSTEM_PROMPT,
  WRITER_METADATA,
  buildWriterPrompt,
  type DocumentationType,
} from './writer.prompt.js';

// Multimodal Looker (Visual Analysis)
export {
  MULTIMODAL_SYSTEM_PROMPT,
  MULTIMODAL_METADATA,
  buildMultimodalPrompt,
  type MultimodalDepth,
} from './multimodal.prompt.js';

// Prometheus (Strategic Planning)
export {
  PROMETHEUS_SYSTEM_PROMPT,
  PROMETHEUS_METADATA,
  buildPrometheusPrompt,
} from './prometheus.prompt.js';

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

// Librarian (Multi-repo Analysis)
export {
  LIBRARIAN_SYSTEM_PROMPT,
  LIBRARIAN_METADATA,
  buildLibrarianPrompt,
} from './librarian.prompt.js';

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

// Codex Reviewer (GPT Code Review)
export {
  CODEX_REVIEWER_SYSTEM_PROMPT,
  CODEX_REVIEWER_METADATA,
  buildCodexReviewerPrompt,
  type CodexReviewDepth,
} from './codex-reviewer.prompt.js';

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
import { RESEARCHER_SYSTEM_PROMPT, RESEARCHER_METADATA } from './researcher.prompt.js';
import { EXPLORER_SYSTEM_PROMPT, EXPLORER_METADATA } from './explorer.prompt.js';
import { FRONTEND_SYSTEM_PROMPT, FRONTEND_METADATA } from './frontend.prompt.js';
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_METADATA } from './reviewer.prompt.js';
import { WRITER_SYSTEM_PROMPT, WRITER_METADATA } from './writer.prompt.js';
import { MULTIMODAL_SYSTEM_PROMPT, MULTIMODAL_METADATA } from './multimodal.prompt.js';
import { PROMETHEUS_SYSTEM_PROMPT, PROMETHEUS_METADATA } from './prometheus.prompt.js';
import { METIS_SYSTEM_PROMPT, METIS_METADATA } from './metis.prompt.js';
import { MOMUS_SYSTEM_PROMPT, MOMUS_METADATA } from './momus.prompt.js';
import { LIBRARIAN_SYSTEM_PROMPT, LIBRARIAN_METADATA } from './librarian.prompt.js';
import { SECURITY_SYSTEM_PROMPT, SECURITY_METADATA } from './security.prompt.js';
import { TESTER_SYSTEM_PROMPT, TESTER_METADATA } from './tester.prompt.js';
import { DATA_SYSTEM_PROMPT, DATA_METADATA } from './data.prompt.js';
import { CODEX_REVIEWER_SYSTEM_PROMPT, CODEX_REVIEWER_METADATA } from './codex-reviewer.prompt.js';
import { BLANK_SYSTEM_PROMPT, BLANK_METADATA } from './blank.prompt.js';
import { DEBATE_MODERATOR_SYSTEM_PROMPT, DEBATE_MODERATOR_METADATA } from './debate-moderator.prompt.js';
import type { ExpertRegistry } from '../metadata/expert-metadata.js';

/**
 * Complete registry of all expert metadata.
 */
export const EXPERT_REGISTRY: ExpertRegistry = {
  strategist: STRATEGIST_METADATA,
  researcher: RESEARCHER_METADATA,
  explorer: EXPLORER_METADATA,
  frontend: FRONTEND_METADATA,
  reviewer: REVIEWER_METADATA,
  writer: WRITER_METADATA,
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
  // Blank experts (share same metadata)
  gpt_blank_1: BLANK_METADATA,
  gpt_blank_2: BLANK_METADATA,
  claude_blank_1: BLANK_METADATA,
  claude_blank_2: BLANK_METADATA,
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
  researcher: RESEARCHER_SYSTEM_PROMPT,
  explorer: EXPLORER_SYSTEM_PROMPT,
  frontend: FRONTEND_SYSTEM_PROMPT,
  reviewer: REVIEWER_SYSTEM_PROMPT,
  writer: WRITER_SYSTEM_PROMPT,
  multimodal: MULTIMODAL_SYSTEM_PROMPT,
  prometheus: PROMETHEUS_SYSTEM_PROMPT,
  metis: METIS_SYSTEM_PROMPT,
  momus: MOMUS_SYSTEM_PROMPT,
  librarian: LIBRARIAN_SYSTEM_PROMPT,
  // New specialized experts
  security: SECURITY_SYSTEM_PROMPT,
  tester: TESTER_SYSTEM_PROMPT,
  data: DATA_SYSTEM_PROMPT,
  codex_reviewer: CODEX_REVIEWER_SYSTEM_PROMPT,
  // Blank experts (share same minimal prompt)
  gpt_blank_1: BLANK_SYSTEM_PROMPT,
  gpt_blank_2: BLANK_SYSTEM_PROMPT,
  claude_blank_1: BLANK_SYSTEM_PROMPT,
  claude_blank_2: BLANK_SYSTEM_PROMPT,
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
