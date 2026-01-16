// src/hooks/index.ts

/**
 * Hook System
 *
 * Event-driven hook system for custommcp MCP server.
 * Allows extending functionality through internal and external hooks.
 */

// Types
export type {
  HookEventType,
  HookDecision,
  HookPriority,
  HookBaseContext,
  HookContext,
  HookResult,
  HookHandler,
  HookDefinition,
  ExternalHookDefinition,
  HookConfig,
  HookStats,
  HookRegistryState,
  OnServerStartContext,
  OnServerStopContext,
  OnToolCallContext,
  OnToolResultContext,
  OnExpertCallContext,
  OnExpertResultContext,
  OnWorkflowStartContext,
  OnWorkflowPhaseContext,
  OnWorkflowEndContext,
  OnRalphLoopStartContext,
  OnRalphLoopIterationContext,
  OnRalphLoopEndContext,
  OnErrorContext,
  OnRateLimitContext
} from './types.js';

export {
  DEFAULT_HOOK_RESULT,
  DEFAULT_HOOK_CONFIG
} from './types.js';

// Manager
export {
  HookManager,
  getHookManager,
  executeHooks,
  registerHook,
  registerExternalHook
} from './manager.js';

// Config Loader
export {
  loadHookConfig,
  initializeHookSystem,
  saveHookConfig,
  createDefaultConfigIfNeeded,
  registerExternalHooksFromConfig
} from './config-loader.js';

// Built-in Hooks
export {
  registerAllBuiltinHooks,
  loggingHooks,
  registerLoggingHooks,
  contextInjectorHooks,
  registerContextInjectorHooks,
  rateLimitHooks,
  registerRateLimitHooks,
  errorRecoveryHooks,
  registerErrorRecoveryHooks
} from './builtin/index.js';

// Utilities from built-in hooks
export { getRateLimitState, clearAllRateLimits } from './builtin/rate-limit-handler.js';
export { getErrorStats, clearErrorState } from './builtin/error-recovery.js';

import { initializeHookSystem } from './config-loader.js';
import { registerAllBuiltinHooks } from './builtin/index.js';
import { getHookManager, executeHooks } from './manager.js';
import { logger } from '../utils/logger.js';

/**
 * Initializes the complete hook system with configuration and built-in hooks.
 */
export function setupHookSystem(): void {
  // Load configuration
  initializeHookSystem();

  // Register built-in hooks
  registerAllBuiltinHooks();

  const manager = getHookManager();
  const stats = manager.getSystemStats();

  logger.info({
    totalHooks: stats.totalHooks,
    internalHooks: stats.internalHooks,
    externalHooks: stats.externalHooks,
    enabled: manager.isEnabled()
  }, 'Hook system initialized');

  // Fire onServerStart hook
  executeHooks('onServerStart', {
    version: '2.0.0',
    toolCount: 25
  }).catch(error => {
    logger.error({ error }, 'Failed to execute onServerStart hooks');
  });
}

export default {
  setupHookSystem,
  getHookManager,
  executeHooks,
  registerHook: (hook: any) => getHookManager().registerHook(hook),
  registerExternalHook: (hook: any) => getHookManager().registerExternalHook(hook)
};
