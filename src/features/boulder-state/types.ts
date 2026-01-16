// src/features/boulder-state/types.ts

/**
 * Boulder State Types
 *
 * Persistent state management for crash recovery.
 * Named after the Sisyphus metaphor - "rolling the boulder up the hill again"
 * after a crash or interruption.
 *
 * Key concepts:
 * - Checkpoint: A snapshot of workflow state at a specific point
 * - Boulder: The persistent task state that survives crashes
 * - Recovery: Resuming from the last checkpoint
 */

/**
 * Task intent classification for routing and recovery.
 */
export type TaskIntent =
  | 'conceptual'
  | 'implementation'
  | 'debugging'
  | 'refactoring'
  | 'research'
  | 'review'
  | 'documentation'
  | 'unknown';

/**
 * Workflow phase identifiers.
 */
export type WorkflowPhase =
  | 'intent'
  | 'assessment'
  | 'exploration'
  | 'implementation'
  | 'recovery'
  | 'verification'
  | 'completion';

/**
 * Boulder state status.
 */
export type BoulderStatus =
  | 'active'        // Currently executing
  | 'paused'        // Manually paused
  | 'crashed'       // Detected crash (incomplete state)
  | 'completed'     // Successfully completed
  | 'failed'        // Failed after max attempts
  | 'cancelled';    // User cancelled

/**
 * Checkpoint data for a specific phase.
 */
export interface PhaseCheckpoint {
  /** Phase identifier */
  phaseId: WorkflowPhase;

  /** Phase start timestamp */
  startedAt: string;

  /** Phase completion timestamp (if completed) */
  completedAt?: string;

  /** Whether phase completed successfully */
  success?: boolean;

  /** Phase output/result summary */
  output?: string;

  /** Any error message */
  error?: string;

  /** Phase-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Attempt record for implementation phase.
 */
export interface ImplementationAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;

  /** Timestamp */
  timestamp: string;

  /** Expert used */
  expert: string;

  /** Brief description of approach */
  approach?: string;

  /** Whether attempt succeeded */
  success: boolean;

  /** Error if failed */
  error?: string;

  /** Output summary */
  output?: string;
}

/**
 * Main Boulder State interface.
 * Persisted to disk for crash recovery.
 */
export interface BoulderState {
  /** Unique boulder ID */
  id: string;

  /** Version for migration compatibility */
  version: number;

  /** Current status */
  status: BoulderStatus;

  /** Original user request */
  request: string;

  /** Classified intent */
  intent?: TaskIntent;

  /** Current phase */
  currentPhase: WorkflowPhase;

  /** Phase history with checkpoints */
  checkpoints: PhaseCheckpoint[];

  /** Implementation attempts (for 3-strike protocol) */
  implementationAttempts: ImplementationAttempt[];

  /** Max implementation attempts before escalation */
  maxAttempts: number;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  /** Completion timestamp */
  completedAt?: string;

  /** Total execution time in ms */
  totalTimeMs?: number;

  /** Associated Ralph Loop task ID (if using Ralph Loop mode) */
  ralphLoopTaskId?: string;

  /** Whether escalation is required */
  escalationRequired?: boolean;

  /** Escalation reason */
  escalationReason?: string;

  /** Context gathered during exploration */
  explorationContext?: string;

  /** Files identified as relevant */
  relevantFiles?: string[];

  /** Final output/result */
  finalOutput?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a new boulder.
 */
export interface CreateBoulderOptions {
  /** User request */
  request: string;

  /** Pre-classified intent (optional) */
  intent?: TaskIntent;

  /** Max implementation attempts */
  maxAttempts?: number;

  /** Associated Ralph Loop task ID */
  ralphLoopTaskId?: string;

  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for updating boulder state.
 */
export interface UpdateBoulderOptions {
  /** New status */
  status?: BoulderStatus;

  /** New phase */
  currentPhase?: WorkflowPhase;

  /** Intent classification */
  intent?: TaskIntent;

  /** Exploration context */
  explorationContext?: string;

  /** Relevant files */
  relevantFiles?: string[];

  /** Escalation required flag */
  escalationRequired?: boolean;

  /** Escalation reason */
  escalationReason?: string;

  /** Final output */
  finalOutput?: string;

  /** Additional metadata to merge */
  metadata?: Record<string, unknown>;
}

/**
 * Boulder recovery result.
 */
export interface BoulderRecoveryResult {
  /** Whether recovery is possible */
  canRecover: boolean;

  /** Recovered boulder state */
  boulder?: BoulderState;

  /** Phase to resume from */
  resumeFromPhase?: WorkflowPhase;

  /** Recovery suggestions */
  suggestions?: string[];

  /** Recovery message */
  message: string;
}

/**
 * Boulder state summary for listing.
 */
export interface BoulderSummary {
  /** Boulder ID */
  id: string;

  /** Status */
  status: BoulderStatus;

  /** Request preview (truncated) */
  requestPreview: string;

  /** Current phase */
  currentPhase: WorkflowPhase;

  /** Number of implementation attempts */
  attemptsMade: number;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;

  /** Whether escalation needed */
  escalationRequired: boolean;
}

/**
 * Boulder State configuration.
 */
export interface BoulderStateConfig {
  /** State file path (relative to working directory) */
  stateFilePath: string;

  /** History directory for completed boulders */
  historyDir: string;

  /** Max boulders to keep in history */
  maxHistoryCount: number;

  /** Auto-cleanup completed boulders older than (ms) */
  historyRetentionMs: number;

  /** Current state version */
  stateVersion: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_BOULDER_CONFIG: BoulderStateConfig = {
  stateFilePath: '.llm-router/boulder-state.json',
  historyDir: '.llm-router/boulder-history',
  maxHistoryCount: 50,
  historyRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  stateVersion: 1
};
