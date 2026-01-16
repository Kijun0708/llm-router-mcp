// src/features/boulder-state/manager.ts

/**
 * Boulder State Manager
 *
 * Manages the lifecycle of Boulder State for workflow crash recovery.
 * Provides methods for creating, updating, checkpointing, and recovering boulders.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BoulderState,
  BoulderStatus,
  BoulderSummary,
  BoulderRecoveryResult,
  BoulderStateConfig,
  CreateBoulderOptions,
  UpdateBoulderOptions,
  PhaseCheckpoint,
  ImplementationAttempt,
  WorkflowPhase,
  TaskIntent,
  DEFAULT_BOULDER_CONFIG
} from './types.js';
import {
  readBoulderState,
  writeBoulderState,
  clearBoulderState,
  archiveBoulder,
  listBoulderHistory,
  readBoulderFromHistory,
  hasActiveBoulder,
  detectCrashedBoulder
} from './storage.js';
import { logger } from '../../utils/logger.js';
import { executeHooks } from '../../hooks/index.js';

/**
 * Boulder State Manager class.
 *
 * Singleton pattern for global boulder state management.
 */
export class BoulderStateManager {
  private static instance: BoulderStateManager | null = null;
  private directory: string;
  private config: BoulderStateConfig;

  private constructor(directory: string, config?: Partial<BoulderStateConfig>) {
    this.directory = directory;
    this.config = { ...DEFAULT_BOULDER_CONFIG, ...config };
  }

  /**
   * Gets or creates the singleton instance.
   */
  static getInstance(directory?: string, config?: Partial<BoulderStateConfig>): BoulderStateManager {
    if (!BoulderStateManager.instance) {
      if (!directory) {
        directory = process.cwd();
      }
      BoulderStateManager.instance = new BoulderStateManager(directory, config);
    }
    return BoulderStateManager.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   */
  static resetInstance(): void {
    BoulderStateManager.instance = null;
  }

  /**
   * Creates a new boulder for a workflow task.
   */
  async createBoulder(options: CreateBoulderOptions): Promise<BoulderState> {
    // Check for existing active boulder
    if (hasActiveBoulder(this.directory, this.config)) {
      const existing = readBoulderState(this.directory, this.config);
      throw new Error(
        `Active boulder already exists (ID: ${existing?.id}). ` +
        `Complete or cancel it before starting a new one.`
      );
    }

    const now = new Date().toISOString();

    const boulder: BoulderState = {
      id: uuidv4().substring(0, 8),
      version: this.config.stateVersion,
      status: 'active',
      request: options.request,
      intent: options.intent,
      currentPhase: 'intent',
      checkpoints: [],
      implementationAttempts: [],
      maxAttempts: options.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      ralphLoopTaskId: options.ralphLoopTaskId,
      metadata: options.metadata
    };

    writeBoulderState(this.directory, boulder, this.config);

    logger.info({
      boulderId: boulder.id,
      request: boulder.request.substring(0, 100)
    }, 'Boulder created');

    // Execute hook
    await executeHooks('onWorkflowStart', {
      request: options.request,
      ralphLoopMode: !!options.ralphLoopTaskId,
      maxAttempts: boulder.maxAttempts
    });

    return boulder;
  }

  /**
   * Gets the current boulder state.
   */
  getCurrentBoulder(): BoulderState | null {
    return readBoulderState(this.directory, this.config);
  }

  /**
   * Updates boulder state.
   */
  updateBoulder(updates: UpdateBoulderOptions): BoulderState | null {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to update');
      return null;
    }

    // Apply updates
    if (updates.status) boulder.status = updates.status;
    if (updates.currentPhase) boulder.currentPhase = updates.currentPhase;
    if (updates.intent) boulder.intent = updates.intent;
    if (updates.explorationContext) boulder.explorationContext = updates.explorationContext;
    if (updates.relevantFiles) boulder.relevantFiles = updates.relevantFiles;
    if (updates.escalationRequired !== undefined) boulder.escalationRequired = updates.escalationRequired;
    if (updates.escalationReason) boulder.escalationReason = updates.escalationReason;
    if (updates.finalOutput) boulder.finalOutput = updates.finalOutput;
    if (updates.metadata) {
      boulder.metadata = { ...boulder.metadata, ...updates.metadata };
    }

    writeBoulderState(this.directory, boulder, this.config);
    return boulder;
  }

  /**
   * Records a phase checkpoint.
   */
  async checkpoint(
    phaseId: WorkflowPhase,
    success: boolean,
    output?: string,
    error?: string,
    metadata?: Record<string, unknown>
  ): Promise<BoulderState | null> {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder for checkpoint');
      return null;
    }

    // Find existing checkpoint for this phase or create new
    let checkpoint = boulder.checkpoints.find(c => c.phaseId === phaseId && !c.completedAt);

    if (!checkpoint) {
      checkpoint = {
        phaseId,
        startedAt: new Date().toISOString()
      };
      boulder.checkpoints.push(checkpoint);
    }

    // Update checkpoint
    checkpoint.completedAt = new Date().toISOString();
    checkpoint.success = success;
    if (output) checkpoint.output = output.substring(0, 2000); // Truncate
    if (error) checkpoint.error = error;
    if (metadata) checkpoint.metadata = metadata;

    // Update current phase
    boulder.currentPhase = phaseId;

    writeBoulderState(this.directory, boulder, this.config);

    logger.info({
      boulderId: boulder.id,
      phase: phaseId,
      success
    }, 'Boulder checkpoint recorded');

    return boulder;
  }

  /**
   * Starts a phase (creates initial checkpoint).
   */
  startPhase(phaseId: WorkflowPhase): BoulderState | null {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to start phase');
      return null;
    }

    // Create new checkpoint
    const checkpoint: PhaseCheckpoint = {
      phaseId,
      startedAt: new Date().toISOString()
    };

    boulder.checkpoints.push(checkpoint);
    boulder.currentPhase = phaseId;

    writeBoulderState(this.directory, boulder, this.config);

    logger.debug({ boulderId: boulder.id, phase: phaseId }, 'Phase started');

    return boulder;
  }

  /**
   * Records an implementation attempt.
   */
  recordAttempt(
    expert: string,
    success: boolean,
    approach?: string,
    output?: string,
    error?: string
  ): BoulderState | null {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to record attempt');
      return null;
    }

    const attempt: ImplementationAttempt = {
      attemptNumber: boulder.implementationAttempts.length + 1,
      timestamp: new Date().toISOString(),
      expert,
      approach,
      success,
      error,
      output: output?.substring(0, 1000)
    };

    boulder.implementationAttempts.push(attempt);

    // Check if max attempts reached
    if (!success && boulder.implementationAttempts.length >= boulder.maxAttempts) {
      boulder.escalationRequired = true;
      boulder.escalationReason = `Max attempts (${boulder.maxAttempts}) reached without success`;

      logger.warn({
        boulderId: boulder.id,
        attempts: boulder.implementationAttempts.length
      }, 'Boulder max attempts reached - escalation required');
    }

    writeBoulderState(this.directory, boulder, this.config);

    return boulder;
  }

  /**
   * Completes the boulder successfully.
   */
  async complete(finalOutput?: string): Promise<BoulderState | null> {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to complete');
      return null;
    }

    boulder.status = 'completed';
    boulder.completedAt = new Date().toISOString();
    boulder.totalTimeMs = Date.now() - new Date(boulder.createdAt).getTime();
    if (finalOutput) boulder.finalOutput = finalOutput;

    // Archive and clear
    archiveBoulder(this.directory, boulder, this.config);
    clearBoulderState(this.directory, this.config);

    logger.info({
      boulderId: boulder.id,
      totalTimeMs: boulder.totalTimeMs,
      attempts: boulder.implementationAttempts.length
    }, 'Boulder completed successfully');

    // Execute hook
    await executeHooks('onWorkflowEnd', {
      success: true,
      phasesExecuted: boulder.checkpoints.map(c => c.phaseId),
      totalDurationMs: boulder.totalTimeMs,
      escalated: false,
      output: finalOutput?.substring(0, 1000) || ''
    });

    return boulder;
  }

  /**
   * Fails the boulder.
   */
  async fail(reason: string): Promise<BoulderState | null> {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to fail');
      return null;
    }

    boulder.status = 'failed';
    boulder.completedAt = new Date().toISOString();
    boulder.totalTimeMs = Date.now() - new Date(boulder.createdAt).getTime();
    boulder.escalationRequired = true;
    boulder.escalationReason = reason;

    // Archive and clear
    archiveBoulder(this.directory, boulder, this.config);
    clearBoulderState(this.directory, this.config);

    logger.warn({
      boulderId: boulder.id,
      reason,
      attempts: boulder.implementationAttempts.length
    }, 'Boulder failed');

    // Execute hook
    await executeHooks('onWorkflowEnd', {
      success: false,
      phasesExecuted: boulder.checkpoints.map(c => c.phaseId),
      totalDurationMs: boulder.totalTimeMs,
      escalated: true,
      output: reason
    });

    return boulder;
  }

  /**
   * Cancels the boulder.
   */
  async cancel(): Promise<BoulderState | null> {
    const boulder = readBoulderState(this.directory, this.config);
    if (!boulder) {
      logger.warn('No active boulder to cancel');
      return null;
    }

    boulder.status = 'cancelled';
    boulder.completedAt = new Date().toISOString();
    boulder.totalTimeMs = Date.now() - new Date(boulder.createdAt).getTime();

    // Archive and clear
    archiveBoulder(this.directory, boulder, this.config);
    clearBoulderState(this.directory, this.config);

    logger.info({ boulderId: boulder.id }, 'Boulder cancelled');

    return boulder;
  }

  /**
   * Checks for and recovers crashed boulder.
   */
  checkForCrashedBoulder(): BoulderRecoveryResult {
    const crashed = detectCrashedBoulder(this.directory, this.config);

    if (!crashed) {
      return {
        canRecover: false,
        message: 'No crashed boulder found'
      };
    }

    // Determine resume point
    const lastSuccessfulPhase = this.findLastSuccessfulPhase(crashed);
    const resumePhase = this.getNextPhase(lastSuccessfulPhase);

    const suggestions = this.generateRecoverySuggestions(crashed, resumePhase);

    return {
      canRecover: true,
      boulder: crashed,
      resumeFromPhase: resumePhase,
      suggestions,
      message: `Found crashed boulder (ID: ${crashed.id}). ` +
               `Last successful phase: ${lastSuccessfulPhase || 'none'}. ` +
               `Can resume from: ${resumePhase}`
    };
  }

  /**
   * Resumes a crashed boulder.
   */
  resumeBoulder(): BoulderState | null {
    const boulder = readBoulderState(this.directory, this.config);

    if (!boulder || boulder.status !== 'crashed') {
      logger.warn('No crashed boulder to resume');
      return null;
    }

    // Mark as active again
    boulder.status = 'active';
    writeBoulderState(this.directory, boulder, this.config);

    logger.info({
      boulderId: boulder.id,
      currentPhase: boulder.currentPhase
    }, 'Boulder resumed');

    return boulder;
  }

  /**
   * Lists boulder history.
   */
  listHistory(): BoulderSummary[] {
    return listBoulderHistory(this.directory, this.config);
  }

  /**
   * Gets a boulder by ID (current or history).
   */
  getBoulder(boulderId: string): BoulderState | null {
    return readBoulderFromHistory(this.directory, boulderId, this.config);
  }

  /**
   * Checks if there's an active boulder.
   */
  hasActiveBoulder(): boolean {
    return hasActiveBoulder(this.directory, this.config);
  }

  /**
   * Generates an escalation report for a failed/stuck boulder.
   */
  generateEscalationReport(boulder?: BoulderState): string {
    const b = boulder || readBoulderState(this.directory, this.config);

    if (!b) {
      return 'No boulder found for escalation report.';
    }

    const attempts = b.implementationAttempts
      .map(a => `  - Attempt ${a.attemptNumber} (${a.expert}): ${a.success ? 'Success' : 'Failed'} - ${a.error || a.approach || 'No details'}`)
      .join('\n');

    const phases = b.checkpoints
      .map(c => `  - ${c.phaseId}: ${c.success ? 'OK' : 'Failed'} (${c.error || 'No error'})`)
      .join('\n');

    return `
## Escalation Report

**Boulder ID**: ${b.id}
**Status**: ${b.status}
**Request**: ${b.request}

### Phase History
${phases || '  No phases recorded'}

### Implementation Attempts (${b.implementationAttempts.length}/${b.maxAttempts})
${attempts || '  No attempts recorded'}

### Escalation Reason
${b.escalationReason || 'Unknown'}

### Suggested Actions
1. Review the error messages above
2. Check if the task needs to be broken down further
3. Consider manual intervention for blocked issues
4. Try a different approach or expert

### Context Gathered
${b.explorationContext?.substring(0, 500) || 'No context'}

### Relevant Files
${b.relevantFiles?.join('\n') || 'None identified'}
`.trim();
  }

  /**
   * Finds the last successful phase from checkpoints.
   */
  private findLastSuccessfulPhase(boulder: BoulderState): WorkflowPhase | null {
    const successfulCheckpoints = boulder.checkpoints
      .filter(c => c.success && c.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

    return successfulCheckpoints[0]?.phaseId || null;
  }

  /**
   * Gets the next phase after a given phase.
   */
  private getNextPhase(phase: WorkflowPhase | null): WorkflowPhase {
    const phaseOrder: WorkflowPhase[] = [
      'intent',
      'assessment',
      'exploration',
      'implementation',
      'verification',
      'completion'
    ];

    if (!phase) {
      return 'intent';
    }

    const currentIndex = phaseOrder.indexOf(phase);
    if (currentIndex === -1 || currentIndex >= phaseOrder.length - 1) {
      return phase; // Stay at current if at end
    }

    return phaseOrder[currentIndex + 1];
  }

  /**
   * Generates recovery suggestions based on boulder state.
   */
  private generateRecoverySuggestions(boulder: BoulderState, resumePhase: WorkflowPhase): string[] {
    const suggestions: string[] = [];

    // Based on current phase
    switch (resumePhase) {
      case 'intent':
        suggestions.push('Re-analyze the request to classify intent');
        break;
      case 'assessment':
        suggestions.push('Re-assess the codebase for the task');
        break;
      case 'exploration':
        suggestions.push('Continue exploring relevant files and context');
        break;
      case 'implementation':
        if (boulder.implementationAttempts.length > 0) {
          suggestions.push(`Previous ${boulder.implementationAttempts.length} attempt(s) failed`);
          suggestions.push('Try a different approach or expert');
        }
        break;
      case 'verification':
        suggestions.push('Re-verify the implementation');
        break;
      case 'completion':
        suggestions.push('Finalize and complete the task');
        break;
    }

    // Based on attempts
    if (boulder.implementationAttempts.length >= boulder.maxAttempts - 1) {
      suggestions.push('Consider escalating to user for guidance');
    }

    // Based on context
    if (!boulder.explorationContext) {
      suggestions.push('Gather more context before implementation');
    }

    return suggestions;
  }
}

/**
 * Creates and returns the Boulder State manager singleton.
 */
export function getBoulderManager(
  directory?: string,
  config?: Partial<BoulderStateConfig>
): BoulderStateManager {
  return BoulderStateManager.getInstance(directory, config);
}
