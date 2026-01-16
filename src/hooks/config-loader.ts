// src/hooks/config-loader.ts

/**
 * Hook Configuration Loader
 *
 * Loads and merges hook configurations from multiple sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  HookConfig,
  DEFAULT_HOOK_CONFIG,
  ExternalHookDefinition,
  HookEventType,
  HookPriority
} from './types.js';
import { getHookManager, registerExternalHook } from './manager.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration file paths to check (in priority order).
 */
const CONFIG_PATHS = [
  '.llm-router/hooks.json',           // Project local (highest priority)
  '.llm-router/hooks.local.json',     // Project local override
  '~/.llm-router/hooks.json'          // User global
];

/**
 * Expands ~ to home directory.
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, filePath.slice(1));
  }
  return filePath;
}

/**
 * Reads and parses a JSON config file.
 */
function readConfigFile(filePath: string): Partial<HookConfig> | null {
  try {
    const expanded = expandPath(filePath);
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.join(process.cwd(), expanded);

    if (!fs.existsSync(resolved)) {
      return null;
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    const config = JSON.parse(content);

    logger.debug({ filePath: resolved }, 'Loaded hook config file');
    return config;
  } catch (error) {
    logger.warn({
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Failed to load hook config file');
    return null;
  }
}

/**
 * Merges multiple hook configurations.
 * Later configs override earlier ones.
 */
function mergeConfigs(...configs: Array<Partial<HookConfig> | null>): HookConfig {
  const result: HookConfig = { ...DEFAULT_HOOK_CONFIG };

  for (const config of configs) {
    if (!config) continue;

    // Merge basic properties
    if (config.version) result.version = config.version;
    if (typeof config.enabled === 'boolean') result.enabled = config.enabled;

    // Merge hooks (concatenate, don't replace)
    if (config.hooks) {
      for (const [eventType, hooks] of Object.entries(config.hooks)) {
        const key = eventType as HookEventType;
        if (!result.hooks[key]) {
          result.hooks[key] = [];
        }
        result.hooks[key]!.push(...(hooks || []));
      }
    }

    // Merge external hooks (concatenate)
    if (config.externalHooks) {
      if (!result.externalHooks) result.externalHooks = {};
      for (const [eventType, hooks] of Object.entries(config.externalHooks)) {
        const key = eventType as HookEventType;
        if (!result.externalHooks[key]) {
          result.externalHooks[key] = [];
        }
        result.externalHooks[key]!.push(...(hooks || []));
      }
    }

    // Merge disabled hooks (union)
    if (config.disabledHooks) {
      const existingDisabled = new Set(result.disabledHooks || []);
      for (const hookId of config.disabledHooks) {
        existingDisabled.add(hookId);
      }
      result.disabledHooks = Array.from(existingDisabled);
    }
  }

  return result;
}

/**
 * Loads hook configuration from all sources.
 */
export function loadHookConfig(): HookConfig {
  const configs: Array<Partial<HookConfig> | null> = [];

  // Load configs in priority order (later overrides earlier)
  for (const configPath of CONFIG_PATHS.reverse()) {
    const config = readConfigFile(configPath);
    if (config) {
      configs.push(config);
    }
  }

  const merged = mergeConfigs(...configs);

  logger.info({
    enabled: merged.enabled,
    hookEventTypes: Object.keys(merged.hooks).length,
    externalHookTypes: Object.keys(merged.externalHooks || {}).length,
    disabledCount: merged.disabledHooks?.length || 0
  }, 'Hook configuration loaded');

  return merged;
}

/**
 * Registers external hooks from configuration.
 */
export function registerExternalHooksFromConfig(config: HookConfig): void {
  if (!config.externalHooks) return;

  let count = 0;

  for (const [eventType, hooks] of Object.entries(config.externalHooks)) {
    if (!hooks) continue;

    for (let i = 0; i < hooks.length; i++) {
      const hookConfig = hooks[i];

      const hook: ExternalHookDefinition = {
        id: `external_${eventType}_${i}_${hookConfig.name.replace(/\s+/g, '_')}`,
        name: hookConfig.name,
        description: `External hook: ${hookConfig.command}`,
        eventType: eventType as HookEventType,
        command: hookConfig.command,
        timeoutMs: hookConfig.timeoutMs || 30000,
        priority: (hookConfig.priority as HookPriority) || 'normal',
        enabled: true,
        toolPattern: hookConfig.pattern,
        expertPattern: hookConfig.pattern
      };

      registerExternalHook(hook);
      count++;
    }
  }

  if (count > 0) {
    logger.info({ count }, 'External hooks registered from config');
  }
}

/**
 * Initializes the hook system with configuration.
 */
export function initializeHookSystem(): HookConfig {
  const config = loadHookConfig();
  const manager = getHookManager();

  // Initialize manager with config
  manager.initialize(config);

  // Register external hooks
  registerExternalHooksFromConfig(config);

  return config;
}

/**
 * Saves the current hook configuration to a file.
 */
export function saveHookConfig(config: HookConfig, filePath?: string): boolean {
  const targetPath = filePath || '.llm-router/hooks.json';

  try {
    const expanded = expandPath(targetPath);
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.join(process.cwd(), expanded);

    // Ensure directory exists
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolved, JSON.stringify(config, null, 2), 'utf-8');
    logger.info({ filePath: resolved }, 'Hook config saved');
    return true;
  } catch (error) {
    logger.error({
      filePath: targetPath,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Failed to save hook config');
    return false;
  }
}

/**
 * Creates a default configuration file if none exists.
 */
export function createDefaultConfigIfNeeded(): boolean {
  const configPath = '.llm-router/hooks.json';
  const expanded = path.join(process.cwd(), configPath);

  if (fs.existsSync(expanded)) {
    return false;
  }

  const defaultConfig: HookConfig = {
    version: '1.0.0',
    enabled: true,
    hooks: {
      onServerStart: [],
      onToolCall: [],
      onExpertCall: [],
      onError: []
    },
    externalHooks: {
      // Example external hook (disabled by default)
      // onToolCall: [
      //   {
      //     name: 'Log Tool Calls',
      //     command: 'echo "Tool called: $HOOK_CONTEXT" >> /tmp/tool-calls.log',
      //     pattern: '*',
      //     priority: 'low'
      //   }
      // ]
    },
    disabledHooks: []
  };

  return saveHookConfig(defaultConfig, configPath);
}

export default {
  loadHookConfig,
  initializeHookSystem,
  saveHookConfig,
  createDefaultConfigIfNeeded,
  registerExternalHooksFromConfig
};
