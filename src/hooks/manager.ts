// src/hooks/manager.ts

/**
 * Hook Manager
 *
 * Central manager for registering, executing, and managing hooks.
 */

import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import {
  HookEventType,
  HookContext,
  HookResult,
  HookDefinition,
  ExternalHookDefinition,
  HookConfig,
  HookStats,
  HookRegistryState,
  HookPriority,
  DEFAULT_HOOK_RESULT,
  DEFAULT_HOOK_CONFIG
} from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Priority weights for sorting.
 */
const PRIORITY_WEIGHTS: Record<HookPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25
};

/**
 * Hook Manager class.
 * Singleton pattern for global hook management.
 */
export class HookManager {
  private static instance: HookManager | null = null;

  private state: HookRegistryState;
  private config: HookConfig;
  private startTime: number;

  private constructor() {
    this.state = {
      internalHooks: new Map(),
      externalHooks: new Map(),
      stats: new Map(),
      initialized: false
    };
    this.config = { ...DEFAULT_HOOK_CONFIG };
    this.startTime = Date.now();
  }

  /**
   * Gets the singleton instance.
   */
  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   */
  static resetInstance(): void {
    HookManager.instance = null;
  }

  /**
   * Initializes the hook manager with configuration.
   */
  initialize(config?: Partial<HookConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.state.initialized = true;
    logger.info({ enabled: this.config.enabled }, 'Hook manager initialized');
  }

  /**
   * Registers an internal hook.
   */
  registerHook<T extends HookContext>(hook: HookDefinition<T>): void {
    if (this.state.internalHooks.has(hook.id)) {
      logger.warn({ hookId: hook.id }, 'Hook already registered, overwriting');
    }

    this.state.internalHooks.set(hook.id, hook as HookDefinition);
    this.initializeStats(hook.id);

    logger.debug({
      hookId: hook.id,
      eventType: hook.eventType,
      priority: hook.priority
    }, 'Hook registered');
  }

  /**
   * Registers an external command hook.
   */
  registerExternalHook(hook: ExternalHookDefinition): void {
    if (this.state.externalHooks.has(hook.id)) {
      logger.warn({ hookId: hook.id }, 'External hook already registered, overwriting');
    }

    this.state.externalHooks.set(hook.id, hook);
    this.initializeStats(hook.id);

    logger.debug({
      hookId: hook.id,
      eventType: hook.eventType,
      command: hook.command
    }, 'External hook registered');
  }

  /**
   * Unregisters a hook by ID.
   */
  unregisterHook(hookId: string): boolean {
    const internal = this.state.internalHooks.delete(hookId);
    const external = this.state.externalHooks.delete(hookId);
    return internal || external;
  }

  /**
   * Enables or disables a hook.
   */
  setHookEnabled(hookId: string, enabled: boolean): boolean {
    const internal = this.state.internalHooks.get(hookId);
    if (internal) {
      internal.enabled = enabled;
      return true;
    }

    const external = this.state.externalHooks.get(hookId);
    if (external) {
      external.enabled = enabled;
      return true;
    }

    return false;
  }

  /**
   * Executes hooks for an event.
   * Returns aggregated result.
   */
  async executeHooks<T extends HookContext>(
    eventType: HookEventType,
    context: Omit<T, 'hookExecutionId' | 'eventType' | 'timestamp' | 'cwd'>
  ): Promise<HookResult> {
    if (!this.config.enabled) {
      return DEFAULT_HOOK_RESULT;
    }

    // Build full context
    const fullContext: HookContext = {
      hookExecutionId: uuidv4(),
      eventType,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
      ...context
    } as T;

    // Get matching hooks
    const hooks = this.getMatchingHooks(eventType, fullContext);

    if (hooks.length === 0) {
      return DEFAULT_HOOK_RESULT;
    }

    logger.debug({
      eventType,
      hookCount: hooks.length,
      executionId: fullContext.hookExecutionId
    }, 'Executing hooks');

    // Execute hooks in priority order
    let aggregatedResult: HookResult = { ...DEFAULT_HOOK_RESULT };

    for (const hook of hooks) {
      try {
        const startTime = Date.now();
        const result = await this.executeHook(hook, fullContext);
        const duration = Date.now() - startTime;

        this.updateStats(hook.id, true, duration);

        // Merge results
        aggregatedResult = this.mergeResults(aggregatedResult, result);

        // Stop if blocked
        if (result.decision === 'block') {
          logger.info({
            hookId: hook.id,
            reason: result.reason
          }, 'Hook blocked execution');
          break;
        }

        // Apply modifications to context
        if (result.decision === 'modify' && result.modifiedData) {
          Object.assign(fullContext, result.modifiedData);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.updateStats(hook.id, false, 0);

        logger.error({
          hookId: hook.id,
          error: errorMessage
        }, 'Hook execution failed');

        // Continue with other hooks unless critical
        if (hook.priority === 'critical') {
          aggregatedResult.decision = 'block';
          aggregatedResult.reason = `Critical hook failed: ${errorMessage}`;
          break;
        }
      }
    }

    return aggregatedResult;
  }

  /**
   * Gets hooks matching an event type and context.
   */
  private getMatchingHooks(
    eventType: HookEventType,
    context: HookContext
  ): Array<HookDefinition | ExternalHookDefinition> {
    const hooks: Array<HookDefinition | ExternalHookDefinition> = [];

    // Check disabled hooks
    const disabledSet = new Set(this.config.disabledHooks || []);

    // Get internal hooks
    for (const hook of this.state.internalHooks.values()) {
      if (hook.eventType !== eventType) continue;
      if (!hook.enabled) continue;
      if (disabledSet.has(hook.id)) continue;

      // Check pattern matching
      if (!this.matchesPattern(hook, context)) continue;

      hooks.push(hook);
    }

    // Get external hooks
    for (const hook of this.state.externalHooks.values()) {
      if (hook.eventType !== eventType) continue;
      if (!hook.enabled) continue;
      if (disabledSet.has(hook.id)) continue;

      // Check pattern matching
      if (!this.matchesPattern(hook, context)) continue;

      hooks.push(hook);
    }

    // Sort by priority (highest first)
    hooks.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority];
      const weightB = PRIORITY_WEIGHTS[b.priority];
      return weightB - weightA;
    });

    return hooks;
  }

  /**
   * Checks if a hook matches the context pattern.
   */
  private matchesPattern(
    hook: HookDefinition | ExternalHookDefinition,
    context: HookContext
  ): boolean {
    // Tool pattern matching
    if (hook.toolPattern) {
      const toolName = (context as any).toolName;
      if (!toolName || !this.matchPattern(hook.toolPattern, toolName)) {
        return false;
      }
    }

    // Expert pattern matching
    if (hook.expertPattern) {
      const expertId = (context as any).expertId;
      if (!expertId || !this.matchPattern(hook.expertPattern, expertId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Matches a pattern string against a value.
   * Supports: exact, wildcard (*), pipe-separated (a|b|c)
   */
  private matchPattern(pattern: string, value: string): boolean {
    // Pipe-separated patterns
    if (pattern.includes('|')) {
      const patterns = pattern.split('|');
      return patterns.some(p => this.matchPattern(p.trim(), value));
    }

    // Wildcard pattern
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$',
        'i'
      );
      return regex.test(value);
    }

    // Exact match (case-insensitive)
    return pattern.toLowerCase() === value.toLowerCase();
  }

  /**
   * Executes a single hook.
   */
  private async executeHook(
    hook: HookDefinition | ExternalHookDefinition,
    context: HookContext
  ): Promise<HookResult> {
    if ('handler' in hook) {
      // Internal hook
      return await hook.handler(context);
    } else {
      // External command hook
      return await this.executeExternalHook(hook, context);
    }
  }

  /**
   * Executes an external command hook.
   */
  private async executeExternalHook(
    hook: ExternalHookDefinition,
    context: HookContext
  ): Promise<HookResult> {
    const timeoutMs = hook.timeoutMs || 30000;
    const cwd = hook.cwd || process.cwd();

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'bash';
      const shellArgs = isWindows ? ['/c', hook.command] : ['-c', hook.command];

      const child = spawn(shell, shellArgs, {
        cwd,
        env: {
          ...process.env,
          HOOK_CONTEXT: JSON.stringify(context)
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      // Send context as stdin
      child.stdin.write(JSON.stringify(context));
      child.stdin.end();

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Timeout
      const timeout = setTimeout(() => {
        child.kill();
        resolve({
          decision: 'continue',
          reason: `Hook ${hook.id} timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);

        // Parse exit code
        if (code === 2) {
          resolve({
            decision: 'block',
            reason: stderr || 'Blocked by external hook'
          });
          return;
        }

        if (code === 1) {
          resolve({
            decision: 'continue',
            reason: stderr || 'External hook requested continue'
          });
          return;
        }

        // Try to parse JSON output
        try {
          const result = JSON.parse(stdout.trim());
          resolve({
            decision: result.decision || 'continue',
            reason: result.reason,
            modifiedData: result.modifiedData,
            injectMessage: result.injectMessage,
            suppressOutput: result.suppressOutput,
            metadata: result.metadata
          });
        } catch {
          resolve({
            decision: 'continue',
            metadata: { stdout, stderr }
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        logger.error({ hookId: hook.id, error: error.message }, 'External hook error');
        resolve({
          decision: 'continue',
          reason: `Hook error: ${error.message}`
        });
      });
    });
  }

  /**
   * Merges two hook results.
   */
  private mergeResults(a: HookResult, b: HookResult): HookResult {
    return {
      decision: b.decision === 'block' ? 'block' : (b.decision === 'modify' ? 'modify' : a.decision),
      reason: b.reason || a.reason,
      modifiedData: { ...a.modifiedData, ...b.modifiedData },
      injectMessage: [a.injectMessage, b.injectMessage].filter(Boolean).join('\n') || undefined,
      suppressOutput: b.suppressOutput ?? a.suppressOutput,
      metadata: { ...a.metadata, ...b.metadata }
    };
  }

  /**
   * Initializes stats for a hook.
   */
  private initializeStats(hookId: string): void {
    if (!this.state.stats.has(hookId)) {
      this.state.stats.set(hookId, {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        blockedExecutions: 0,
        averageExecutionTimeMs: 0
      });
    }
  }

  /**
   * Updates stats for a hook execution.
   */
  private updateStats(hookId: string, success: boolean, durationMs: number): void {
    const stats = this.state.stats.get(hookId);
    if (!stats) return;

    stats.totalExecutions++;
    if (success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;
    }

    // Update average execution time
    const totalTime = stats.averageExecutionTimeMs * (stats.totalExecutions - 1) + durationMs;
    stats.averageExecutionTimeMs = totalTime / stats.totalExecutions;
    stats.lastExecutionAt = new Date().toISOString();
  }

  /**
   * Gets all registered hooks.
   */
  getRegisteredHooks(): {
    internal: HookDefinition[];
    external: ExternalHookDefinition[];
  } {
    return {
      internal: Array.from(this.state.internalHooks.values()),
      external: Array.from(this.state.externalHooks.values())
    };
  }

  /**
   * Gets hook statistics.
   */
  getStats(): Map<string, HookStats> {
    return new Map(this.state.stats);
  }

  /**
   * Gets overall hook system stats.
   */
  getSystemStats(): {
    totalHooks: number;
    internalHooks: number;
    externalHooks: number;
    enabledHooks: number;
    totalExecutions: number;
    uptimeMs: number;
  } {
    const internal = Array.from(this.state.internalHooks.values());
    const external = Array.from(this.state.externalHooks.values());

    const enabledInternal = internal.filter(h => h.enabled).length;
    const enabledExternal = external.filter(h => h.enabled).length;

    let totalExecutions = 0;
    for (const stats of this.state.stats.values()) {
      totalExecutions += stats.totalExecutions;
    }

    return {
      totalHooks: internal.length + external.length,
      internalHooks: internal.length,
      externalHooks: external.length,
      enabledHooks: enabledInternal + enabledExternal,
      totalExecutions,
      uptimeMs: Date.now() - this.startTime
    };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): HookConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<HookConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Hook configuration updated');
  }

  /**
   * Checks if hooks are enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enables or disables the hook system globally.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info({ enabled }, 'Hook system enabled state changed');
  }
}

/**
 * Gets the global hook manager instance.
 */
export function getHookManager(): HookManager {
  return HookManager.getInstance();
}

/**
 * Convenience function to execute hooks.
 */
export async function executeHooks<T extends HookContext>(
  eventType: HookEventType,
  context: Omit<T, 'hookExecutionId' | 'eventType' | 'timestamp' | 'cwd'>
): Promise<HookResult> {
  return getHookManager().executeHooks(eventType, context);
}

/**
 * Convenience function to register a hook.
 */
export function registerHook<T extends HookContext>(hook: HookDefinition<T>): void {
  getHookManager().registerHook(hook);
}

/**
 * Convenience function to register an external hook.
 */
export function registerExternalHook(hook: ExternalHookDefinition): void {
  getHookManager().registerExternalHook(hook);
}

export default HookManager;
