// src/hooks/builtin/context-injector.ts

/**
 * Context Injector Hooks
 *
 * Built-in hooks for automatically injecting context into prompts.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  HookDefinition,
  HookResult,
  OnExpertCallContext,
  OnWorkflowStartContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Context injection configuration.
 */
interface ContextInjectorConfig {
  /** Files to auto-inject */
  autoInjectFiles: string[];
  /** Max file size to inject (bytes) */
  maxFileSize: number;
  /** Whether to inject project structure */
  injectProjectStructure: boolean;
  /** Max depth for project structure */
  projectStructureDepth: number;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: ContextInjectorConfig = {
  autoInjectFiles: [
    'CLAUDE.md',
    '.claude/context.md',
    '.llm-router/context.md',
    'AGENTS.md'
  ],
  maxFileSize: 50000, // 50KB
  injectProjectStructure: false,
  projectStructureDepth: 2
};

/**
 * Reads a file if it exists and is within size limit.
 */
function readContextFile(filePath: string, maxSize: number): string | null {
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (!fs.existsSync(resolved)) {
      return null;
    }

    const stats = fs.statSync(resolved);
    if (stats.size > maxSize) {
      logger.debug({ filePath, size: stats.size, maxSize }, 'Context file too large, skipping');
      return null;
    }

    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Gets a simple project structure.
 */
function getProjectStructure(depth: number = 2): string {
  const cwd = process.cwd();
  const lines: string[] = ['Project Structure:', '```'];

  function walk(dir: string, level: number, prefix: string = ''): void {
    if (level > depth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const filtered = entries.filter(e =>
        !e.name.startsWith('.') &&
        !['node_modules', 'dist', 'build', '__pycache__', '.git'].includes(e.name)
      );

      for (let i = 0; i < filtered.length && i < 20; i++) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1 || i === 19;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        lines.push(prefix + connector + entry.name + (entry.isDirectory() ? '/' : ''));

        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), level + 1, newPrefix);
        }
      }

      if (filtered.length > 20) {
        lines.push(prefix + '    ... and more');
      }
    } catch {
      // Ignore permission errors
    }
  }

  walk(cwd, 0);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Hook: Inject context files into expert calls
 */
const contextInjectorHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_context_injector',
  name: 'Context Injector',
  description: 'Automatically injects context from configured files into expert prompts',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    const config = DEFAULT_CONFIG;
    const injections: string[] = [];

    // Inject configured files
    for (const filePath of config.autoInjectFiles) {
      const content = readContextFile(filePath, config.maxFileSize);
      if (content) {
        injections.push(`[Auto-injected from ${filePath}]\n${content}`);
        logger.debug({ filePath }, '[Hook] Injecting context file');
      }
    }

    // Inject project structure if enabled
    if (config.injectProjectStructure) {
      const structure = getProjectStructure(config.projectStructureDepth);
      injections.push(structure);
    }

    if (injections.length === 0) {
      return { decision: 'continue' };
    }

    return {
      decision: 'modify',
      injectMessage: injections.join('\n\n---\n\n'),
      metadata: {
        injectedFiles: config.autoInjectFiles.filter(f =>
          readContextFile(f, config.maxFileSize) !== null
        )
      }
    };
  }
};

/**
 * Hook: Check for required context files at workflow start
 */
const contextCheckHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin_context_check',
  name: 'Context File Check',
  description: 'Checks for important context files at workflow start',
  eventType: 'onWorkflowStart',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    const importantFiles = ['CLAUDE.md', 'README.md'];
    const foundFiles: string[] = [];
    const missingFiles: string[] = [];

    for (const file of importantFiles) {
      const resolved = path.join(process.cwd(), file);
      if (fs.existsSync(resolved)) {
        foundFiles.push(file);
      } else {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      logger.debug({
        found: foundFiles,
        missing: missingFiles
      }, '[Hook] Context file check');
    }

    return {
      decision: 'continue',
      metadata: {
        foundContextFiles: foundFiles,
        missingContextFiles: missingFiles
      }
    };
  }
};

/**
 * Hook: Inject expert-specific context
 */
const expertContextHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_expert_context',
  name: 'Expert Context Injector',
  description: 'Injects expert-specific context files',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,
  expertPattern: '*',
  handler: async (context): Promise<HookResult> => {
    // Look for expert-specific context file
    const expertContextPath = `.llm-router/experts/${context.expertId}.md`;
    const content = readContextFile(expertContextPath, 20000);

    if (content) {
      logger.debug({
        expertId: context.expertId,
        filePath: expertContextPath
      }, '[Hook] Injecting expert-specific context');

      return {
        decision: 'modify',
        injectMessage: `[Expert-specific context for ${context.expertId}]\n${content}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All context injector hooks.
 */
export const contextInjectorHooks = [
  contextInjectorHook,
  contextCheckHook,
  expertContextHook
] as HookDefinition[];

/**
 * Registers all context injector hooks.
 */
export function registerContextInjectorHooks(): void {
  for (const hook of contextInjectorHooks) {
    registerHook(hook);
  }
}
