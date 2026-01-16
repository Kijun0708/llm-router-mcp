// src/hooks/builtin/index.ts

/**
 * Built-in Hooks Index
 *
 * Exports all built-in hooks for easy registration.
 */

export { loggingHooks, registerLoggingHooks } from './logging.js';
export { contextInjectorHooks, registerContextInjectorHooks } from './context-injector.js';
export { rateLimitHooks, registerRateLimitHooks } from './rate-limit-handler.js';
export { errorRecoveryHooks, registerErrorRecoveryHooks } from './error-recovery.js';
export { keywordDetectorHooks, registerKeywordDetectorHooks } from './keyword-detector.js';
export { permissionCheckerHooks, registerPermissionCheckerHooks } from './permission-checker.js';

import { registerLoggingHooks } from './logging.js';
import { registerContextInjectorHooks } from './context-injector.js';
import { registerRateLimitHooks } from './rate-limit-handler.js';
import { registerErrorRecoveryHooks } from './error-recovery.js';
import { registerKeywordDetectorHooks } from './keyword-detector.js';
import { registerPermissionCheckerHooks } from './permission-checker.js';

/**
 * Registers all built-in hooks.
 */
export function registerAllBuiltinHooks(): void {
  registerLoggingHooks();
  registerContextInjectorHooks();
  registerRateLimitHooks();
  registerErrorRecoveryHooks();
  registerKeywordDetectorHooks();
  registerPermissionCheckerHooks();
}
