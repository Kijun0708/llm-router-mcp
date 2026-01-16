// src/features/boulder-state/index.ts

/**
 * Boulder State Feature
 *
 * Persistent state management for workflow crash recovery.
 * Enables resuming workflows from the last checkpoint after crashes or interruptions.
 */

export {
  // Types
  TaskIntent,
  WorkflowPhase,
  BoulderStatus,
  PhaseCheckpoint,
  ImplementationAttempt,
  BoulderState,
  CreateBoulderOptions,
  UpdateBoulderOptions,
  BoulderRecoveryResult,
  BoulderSummary,
  BoulderStateConfig,
  DEFAULT_BOULDER_CONFIG
} from './types.js';

export {
  // Storage functions
  readBoulderState,
  writeBoulderState,
  clearBoulderState,
  archiveBoulder,
  listBoulderHistory,
  readBoulderFromHistory,
  hasActiveBoulder,
  detectCrashedBoulder
} from './storage.js';

export {
  // Manager
  BoulderStateManager,
  getBoulderManager
} from './manager.js';
