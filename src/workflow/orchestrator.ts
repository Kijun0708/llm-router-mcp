// src/workflow/orchestrator.ts

/**
 * Workflow Orchestrator
 *
 * Main controller for the phase-based workflow system.
 * Coordinates execution flow: Intent → Assessment → Exploration → Implementation → Recovery → Completion
 *
 * Based on oh-my-opencode's Sisyphus orchestration pattern.
 * Uses stability polling for long-running phases instead of hard timeouts.
 */

import {
  WorkflowContext,
  WorkflowConfig,
  WorkflowResult,
  PhaseId,
  PhaseResult,
  DEFAULT_WORKFLOW_CONFIG,
  IWorkflowOrchestrator,
  PhaseHistoryEntry
} from './types.js';
import { PHASE_HANDLERS, contextToResult } from './phases/index.js';
import { logger } from '../utils/logger.js';
import { executeHooks } from '../hooks/index.js';
import {
  getBoulderManager,
  BoulderStateManager,
  WorkflowPhase
} from '../features/boulder-state/index.js';

/**
 * Sleep utility for polling.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Maps PhaseId to WorkflowPhase for Boulder State.
 */
function mapPhaseIdToWorkflowPhase(phaseId: PhaseId): WorkflowPhase {
  const mapping: Record<PhaseId, WorkflowPhase> = {
    'intent': 'intent',
    'assessment': 'assessment',
    'exploration': 'exploration',
    'implementation': 'implementation',
    'recovery': 'recovery',
    'verification': 'verification',
    'completion': 'completion'
  };
  return mapping[phaseId] || 'intent';
}

/**
 * Creates initial workflow context.
 */
function createInitialContext(
  request: string,
  config: WorkflowConfig
): WorkflowContext {
  return {
    originalRequest: request,
    implementationAttempts: 0,
    verificationAttempts: 0,  // Sisyphus mode: track verification attempts
    maxAttempts: config.maxAttempts,
    startTime: Date.now(),
    phaseHistory: []
  };
}

/**
 * Records a phase execution in history.
 */
function recordPhaseExecution(
  context: WorkflowContext,
  phaseId: PhaseId,
  startTime: number,
  success: boolean,
  error?: string
): void {
  const entry: PhaseHistoryEntry = {
    phaseId,
    startTime,
    endTime: Date.now(),
    success,
    error
  };
  context.phaseHistory.push(entry);
}

/**
 * Workflow Orchestrator class.
 *
 * Manages the execution of a multi-phase workflow for task processing.
 *
 * @example
 * ```typescript
 * const orchestrator = new WorkflowOrchestrator();
 * const result = await orchestrator.execute("Add a logout button to the header");
 * console.log(result.output);
 * ```
 */
export class WorkflowOrchestrator implements IWorkflowOrchestrator {
  private config: WorkflowConfig;
  private cancelled: boolean = false;
  private currentContext: WorkflowContext | null = null;
  private boulderManager: BoulderStateManager;

  constructor(config?: Partial<WorkflowConfig>) {
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.boulderManager = getBoulderManager();
  }

  /**
   * Executes the workflow for a given request.
   */
  async execute(
    request: string,
    configOverrides?: Partial<WorkflowConfig>
  ): Promise<WorkflowResult> {
    // Merge config overrides
    const config = { ...this.config, ...configOverrides };
    this.cancelled = false;

    // Create initial context
    const context = createInitialContext(request, config);
    this.currentContext = context;

    logger.info({ request: request.substring(0, 100) }, 'Starting workflow');

    // Create Boulder State for crash recovery
    let boulder;
    try {
      boulder = await this.boulderManager.createBoulder({
        request,
        maxAttempts: config.maxAttempts
      });
      logger.debug({ boulderId: boulder.id }, 'Boulder state created');
    } catch (error) {
      // Boulder creation failed (likely existing active boulder)
      logger.warn({ error }, 'Failed to create boulder state, continuing without');
    }

    // Execute onWorkflowStart hook
    await executeHooks('onWorkflowStart', {
      request,
      ralphLoopMode: false,
      maxAttempts: config.maxAttempts
    });

    // Start with intent phase
    let currentPhase: PhaseId | undefined = 'intent';
    let lastOutput = '';
    let previousPhase: PhaseId | undefined;

    try {
      // Main execution loop
      while (currentPhase && !this.cancelled) {
        // Start phase in boulder
        if (boulder) {
          this.boulderManager.startPhase(mapPhaseIdToWorkflowPhase(currentPhase));
        }

        // Execute onWorkflowPhase hook
        await executeHooks('onWorkflowPhase', {
          phaseId: currentPhase,
          previousPhase,
          attemptNumber: context.implementationAttempts + 1,
          previousOutput: lastOutput.substring(0, 500)
        });

        const result = await this.executePhase(context, currentPhase);

        // Checkpoint phase completion in boulder
        if (boulder) {
          await this.boulderManager.checkpoint(
            mapPhaseIdToWorkflowPhase(currentPhase),
            result.success,
            result.output,
            result.success ? undefined : result.output
          );
        }

        lastOutput = result.output;
        previousPhase = currentPhase;
        currentPhase = result.nextPhase;

        // Check for workflow timeout
        const elapsed = Date.now() - context.startTime;
        if (elapsed > config.timeoutMs) {
          logger.warn({ elapsed, timeout: config.timeoutMs }, 'Workflow timeout');
          context.escalationRequired = true;
          currentPhase = 'completion';
        }
      }

      // Build final result
      const success = !context.escalationRequired &&
                     context.implementationAttempts < context.maxAttempts;

      const result = contextToResult(context, lastOutput, success);

      // Complete or fail boulder
      if (boulder) {
        if (success) {
          await this.boulderManager.complete(result.output);
        } else {
          await this.boulderManager.fail(
            context.escalationRequired ? 'Escalation required' : 'Max attempts reached'
          );
        }
      }

      // Execute onWorkflowEnd hook
      await executeHooks('onWorkflowEnd', {
        success: result.success,
        phasesExecuted: result.phasesExecuted,
        totalDurationMs: result.totalTimeMs,
        escalated: result.escalated,
        output: result.output.substring(0, 1000)
      });

      return result;

    } catch (error) {
      logger.error({ error }, 'Workflow execution failed');

      const errorResult = {
        success: false,
        output: `Workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        phasesExecuted: context.phaseHistory.map(p => p.phaseId),
        totalTimeMs: Date.now() - context.startTime,
        attemptsMade: context.implementationAttempts,
        escalated: true
      };

      // Fail boulder on error
      if (boulder) {
        await this.boulderManager.fail(
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // Execute onWorkflowEnd hook for failure
      await executeHooks('onWorkflowEnd', {
        success: false,
        phasesExecuted: errorResult.phasesExecuted,
        totalDurationMs: errorResult.totalTimeMs,
        escalated: true,
        output: errorResult.output
      });

      // Execute onError hook
      await executeHooks('onError', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        source: 'workflow',
        recoverable: false
      });

      return errorResult;
    } finally {
      this.currentContext = null;
    }
  }

  /**
   * Executes a single phase with stability polling for long-running phases.
   */
  private async executePhase(
    context: WorkflowContext,
    phaseId: PhaseId
  ): Promise<PhaseResult> {
    const handler = PHASE_HANDLERS[phaseId];

    if (!handler) {
      throw new Error(`Unknown phase: ${phaseId}`);
    }

    const phaseStartTime = Date.now();
    const phaseTimeout = this.config.phaseTimeouts[phaseId] || 60000;
    const { pollIntervalMs, minStabilityTimeMs, stabilityPollsRequired } = this.config.stability;

    logger.debug({ phaseId, timeout: phaseTimeout }, 'Executing phase');

    // For long phases (implementation, assessment, exploration, verification), use stability polling
    const usesStabilityPolling = ['implementation', 'assessment', 'exploration', 'verification'].includes(phaseId);

    try {
      if (usesStabilityPolling) {
        // Execute with stability polling (oh-my-opencode style)
        const result = await this.executeWithStabilityPolling(
          () => handler.execute(context),
          phaseId,
          phaseTimeout,
          pollIntervalMs,
          minStabilityTimeMs,
          stabilityPollsRequired
        );

        recordPhaseExecution(context, phaseId, phaseStartTime, result.success);

        logger.info({
          phaseId,
          success: result.success,
          nextPhase: result.nextPhase,
          duration: Date.now() - phaseStartTime,
          pollingUsed: true
        }, 'Phase completed with stability polling');

        return result;
      } else {
        // Simple execution with timeout for quick phases
        const result = await Promise.race([
          handler.execute(context),
          this.createPhaseTimeout(phaseTimeout, phaseId)
        ]);

        recordPhaseExecution(context, phaseId, phaseStartTime, result.success);

        logger.info({
          phaseId,
          success: result.success,
          nextPhase: result.nextPhase,
          duration: Date.now() - phaseStartTime
        }, 'Phase completed');

        return result;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      recordPhaseExecution(context, phaseId, phaseStartTime, false, errorMessage);

      logger.error({ phaseId, error: errorMessage }, 'Phase failed');

      return {
        phaseId,
        success: false,
        output: `Phase ${phaseId} failed: ${errorMessage}`,
        nextPhase: phaseId === 'implementation' ? 'recovery' : 'completion'
      };
    }
  }

  /**
   * Executes a phase with stability polling.
   * Waits for the execution to complete and uses polling to detect completion stability.
   * Based on oh-my-opencode's approach.
   */
  private async executeWithStabilityPolling(
    executor: () => Promise<PhaseResult>,
    phaseId: PhaseId,
    maxTimeoutMs: number,
    pollIntervalMs: number,
    minStabilityTimeMs: number,
    stabilityPollsRequired: number
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    let lastResultHash = '';
    let stablePolls = 0;

    // State container to track execution status
    const state: {
      result: PhaseResult | null;
      complete: boolean;
      error: Error | null;
    } = {
      result: null,
      complete: false,
      error: null
    };

    // Start the execution in the background
    const executionPromise = executor()
      .then(result => {
        state.result = result;
        state.complete = true;
        return result;
      })
      .catch(error => {
        state.error = error instanceof Error ? error : new Error(String(error));
        state.complete = true;
        throw error;
      });

    // Poll for stability
    while (Date.now() - startTime < maxTimeoutMs) {
      await sleep(pollIntervalMs);

      const elapsed = Date.now() - startTime;

      // Check if execution completed
      if (state.complete) {
        // Execution finished - check stability
        if (elapsed < minStabilityTimeMs) {
          // Wait for minimum stability time
          continue;
        }

        if (state.error) {
          throw state.error;
        }

        const result = state.result;
        if (result) {
          // Check if result is stable (same output for multiple polls)
          const resultHash = JSON.stringify({
            success: result.success,
            outputLength: result.output.length
          });

          if (resultHash === lastResultHash) {
            stablePolls++;
            logger.debug({
              phaseId,
              stablePolls,
              required: stabilityPollsRequired
            }, 'Stability poll check');

            if (stablePolls >= stabilityPollsRequired) {
              logger.info({ phaseId, elapsed }, 'Phase stable, returning result');
              return result;
            }
          } else {
            stablePolls = 0;
            lastResultHash = resultHash;
          }
        }
      }

      // Log progress periodically
      if (elapsed % 10000 < pollIntervalMs) {
        logger.debug({
          phaseId,
          elapsed,
          complete: state.complete,
          stablePolls
        }, 'Phase execution in progress');
      }
    }

    // Timeout reached
    if (state.result) {
      logger.warn({ phaseId }, 'Phase timeout reached but result available');
      return state.result;
    }

    // Still waiting for execution - try to get the result
    try {
      const result = await Promise.race([
        executionPromise,
        sleep(5000).then(() => {
          throw new Error(`Phase ${phaseId} timed out after ${maxTimeoutMs}ms`);
        })
      ]);
      return result;
    } catch {
      throw new Error(`Phase ${phaseId} timed out after ${maxTimeoutMs}ms`);
    }
  }

  /**
   * Creates a timeout promise for phase execution.
   */
  private createPhaseTimeout(timeoutMs: number, phaseId: PhaseId): Promise<PhaseResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Phase ${phaseId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Cancels the current workflow execution.
   */
  cancel(): void {
    this.cancelled = true;
    logger.info('Workflow cancelled');

    if (this.currentContext) {
      this.currentContext.escalationRequired = true;
    }
  }

  /**
   * Gets the current workflow context (for debugging/monitoring).
   */
  getContext(): WorkflowContext | null {
    return this.currentContext;
  }

  /**
   * Checks for crashed workflows and returns recovery info.
   */
  checkForCrash(): { canRecover: boolean; message: string; boulderId?: string } {
    const recovery = this.boulderManager.checkForCrashedBoulder();
    return {
      canRecover: recovery.canRecover,
      message: recovery.message,
      boulderId: recovery.boulder?.id
    };
  }

  /**
   * Resumes a crashed workflow.
   */
  async resumeCrashed(): Promise<WorkflowResult | null> {
    const recovery = this.boulderManager.checkForCrashedBoulder();

    if (!recovery.canRecover || !recovery.boulder) {
      logger.info('No crashed workflow to resume');
      return null;
    }

    const boulder = recovery.boulder;
    logger.info({
      boulderId: boulder.id,
      resumePhase: recovery.resumeFromPhase
    }, 'Resuming crashed workflow');

    // Resume the boulder
    this.boulderManager.resumeBoulder();

    // Re-execute from the beginning with the same request
    // The boulder manager will track this as a continuation
    return this.execute(boulder.request);
  }

  /**
   * Gets the boulder manager for direct access.
   */
  getBoulderManager(): BoulderStateManager {
    return this.boulderManager;
  }
}

/**
 * Creates a new workflow orchestrator with default config.
 */
export function createOrchestrator(config?: Partial<WorkflowConfig>): WorkflowOrchestrator {
  return new WorkflowOrchestrator(config);
}

/**
 * Convenience function to execute a single workflow.
 */
export async function executeWorkflow(
  request: string,
  config?: Partial<WorkflowConfig>
): Promise<WorkflowResult> {
  const orchestrator = new WorkflowOrchestrator(config);
  return orchestrator.execute(request);
}

export default WorkflowOrchestrator;
