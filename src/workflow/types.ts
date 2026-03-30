// src/workflow/types.ts

/**
 * Phase identifiers for the workflow system.
 * Based on oh-my-opencode's Sisyphus orchestration pattern.
 */
export type PhaseId =
  | 'intent'         // Phase 0: Request classification
  | 'assessment'     // Phase 1: Codebase/context analysis
  | 'exploration'    // Phase 2A: Parallel exploration
  | 'implementation' // Phase 2B: Expert delegation
  | 'verification'   // Phase 2D: Result verification (Sisyphus mode)
  | 'recovery'       // Phase 2C: Failure recovery
  | 'completion';    // Phase 3: Wrap-up

/**
 * Intent classification for incoming requests.
 */
export type IntentType =
  | 'conceptual'      // Theoretical questions, explanations
  | 'implementation'  // Code writing, feature building
  | 'debugging'       // Bug fixing, error resolution
  | 'refactoring'     // Code improvement, restructuring
  | 'research'        // Documentation lookup, exploration
  | 'review'          // Code review, security audit
  | 'documentation';  // Writing docs, READMEs

/**
 * Complexity assessment for task estimation.
 */
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'epic';

/**
 * Result from a phase execution.
 */
export interface PhaseResult {
  phaseId: PhaseId;
  success: boolean;
  output: string;
  nextPhase?: PhaseId;
  metadata?: Record<string, unknown>;
}

/**
 * Context maintained throughout workflow execution.
 */
export interface WorkflowContext {
  // Original request
  originalRequest: string;

  // Intent classification (set in Phase 0)
  intent?: IntentType;
  complexity?: ComplexityLevel;

  // Assessment results (set in Phase 1)
  relevantFiles?: string[];
  codebaseContext?: string;

  // Exploration results (set in Phase 2A)
  explorationResults?: string[];

  // Implementation tracking (Phase 2B/2C)
  implementationAttempts: number;
  maxAttempts: number;
  lastError?: string;
  lastExpertUsed?: string;

  // Verification tracking (Phase 2D - Sisyphus mode)
  verificationAttempts: number;
  lastImplementationOutput?: string;
  verificationFailures?: string[];

  // Recovery state
  recoveryActions?: string[];
  escalationRequired?: boolean;

  // Timing
  startTime: number;
  phaseHistory: PhaseHistoryEntry[];
}

/**
 * Record of a phase execution for debugging/logging.
 */
export interface PhaseHistoryEntry {
  phaseId: PhaseId;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
}

/**
 * Configuration for workflow execution.
 */
export interface WorkflowConfig {
  maxAttempts: number;           // Max implementation attempts before escalation (default: 3)
  timeoutMs: number;             // Overall workflow timeout
  phaseTimeouts: Partial<Record<PhaseId, number>>;  // Per-phase timeouts
  enableParallelExploration: boolean;  // Allow parallel tool execution in Phase 2A
  autoRevert: boolean;           // Auto-revert changes on failure

  // Stability polling (oh-my-opencode style)
  stability: {
    pollIntervalMs: number;      // Polling interval (default: 500ms)
    minStabilityTimeMs: number;  // Minimum time before accepting completion (default: 5s)
    stabilityPollsRequired: number;  // Consecutive stable polls to confirm completion (default: 3)
  };
}

/**
 * Default workflow configuration.
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  maxAttempts: 3,
  timeoutMs: 900000,  // 15 minutes (overall)
  phaseTimeouts: {
    intent: 30000,        // 30초
    assessment: 300000,   // 5분 (momus 호출)
    exploration: 300000,  // 5분 (병렬 탐색)
    implementation: 600000, // 10분 (전문가 호출 - oh-my-opencode 스타일)
    verification: 180000, // 3분 (검증 - Sisyphus mode)
    recovery: 120000,     // 2분
    completion: 30000     // 30초
  },
  enableParallelExploration: true,
  autoRevert: true,

  // Stability polling (oh-my-opencode style)
  stability: {
    pollIntervalMs: 500,        // 0.5초마다 체크
    minStabilityTimeMs: 5000,   // 최소 5초 후 완료 가능
    stabilityPollsRequired: 3   // 3회 연속 안정 확인
  }
};

/**
 * Phase handler interface.
 */
export interface PhaseHandler {
  phaseId: PhaseId;
  execute(context: WorkflowContext): Promise<PhaseResult>;
}

/**
 * Workflow orchestrator interface.
 */
export interface IWorkflowOrchestrator {
  execute(request: string, config?: Partial<WorkflowConfig>): Promise<WorkflowResult>;
  cancel(): void;
}

/**
 * Final workflow result.
 */
export interface WorkflowResult {
  success: boolean;
  output: string;
  intent?: IntentType;
  complexity?: ComplexityLevel;
  phasesExecuted: PhaseId[];
  totalTimeMs: number;
  attemptsMade: number;
  escalated: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Expert selection criteria for Phase 2B.
 */
export interface ExpertSelectionCriteria {
  intent: IntentType;
  complexity: ComplexityLevel;
  preferredExperts?: string[];
  excludedExperts?: string[];
}

/**
 * Recovery action types for Phase 2C.
 */
export type RecoveryAction =
  | 'retry_same_expert'
  | 'switch_expert'
  | 'simplify_request'
  | 'request_clarification'
  | 'escalate_to_user';

/**
 * Recovery strategy based on failure analysis.
 */
export interface RecoveryStrategy {
  action: RecoveryAction;
  reason: string;
  newExpert?: string;
  modifiedRequest?: string;
}
