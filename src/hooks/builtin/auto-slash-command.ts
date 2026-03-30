// src/hooks/builtin/auto-slash-command.ts

/**
 * Auto Slash Command Hook
 *
 * Automatically detects and processes /command patterns in text.
 * Routes to appropriate handlers or tools.
 *
 * Features:
 * - Pattern detection (/command, /command args)
 * - Built-in command support
 * - Custom command routing
 * - Argument parsing
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnExpertCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Parsed command
 */
interface ParsedCommand {
  command: string;
  args: string[];
  rawArgs: string;
  fullMatch: string;
}

/**
 * Command handler result
 */
interface CommandHandlerResult {
  handled: boolean;
  response?: string;
  shouldContinue: boolean;
  routeToExpert?: string;
  modifyPrompt?: string;
}

/**
 * Command definition
 */
interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  handler: (args: string[], rawArgs: string) => CommandHandlerResult;
}

/**
 * Auto slash command configuration
 */
interface AutoSlashCommandConfig {
  /** Whether auto detection is enabled */
  enabled: boolean;
  /** Command prefix (default: /) */
  prefix: string;
  /** Whether to handle built-in commands */
  handleBuiltins: boolean;
  /** Whether to route unknown commands to command discovery */
  routeToDiscovery: boolean;
}

/**
 * Auto slash command statistics
 */
interface AutoSlashCommandStats {
  totalDetections: number;
  commandsExecuted: number;
  commandsByName: Record<string, number>;
  lastCommandTime?: number;
  unknownCommands: number;
}

// State
let config: AutoSlashCommandConfig = {
  enabled: true,
  prefix: '/',
  handleBuiltins: true,
  routeToDiscovery: true
};

let stats: AutoSlashCommandStats = {
  totalDetections: 0,
  commandsExecuted: 0,
  commandsByName: {},
  unknownCommands: 0
};

/**
 * Built-in commands
 */
const builtinCommands: CommandDefinition[] = [
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands',
    handler: () => ({
      handled: true,
      response: generateHelpText(),
      shouldContinue: false
    })
  },
  {
    name: 'think',
    aliases: ['t', 'deep'],
    description: 'Enable extended thinking mode',
    handler: (args) => ({
      handled: true,
      modifyPrompt: `[THINK MODE: ${args[0] || 'normal'}] `,
      shouldContinue: true,
      response: '🧠 Think mode activated'
    })
  },
  {
    name: 'expert',
    aliases: ['e', 'ask'],
    description: 'Route to specific expert',
    handler: (args) => {
      const expert = args[0];
      if (!expert) {
        return {
          handled: true,
          response: 'Usage: /expert <name> [prompt]',
          shouldContinue: false
        };
      }
      return {
        handled: true,
        routeToExpert: expert,
        modifyPrompt: args.slice(1).join(' '),
        shouldContinue: true
      };
    }
  },
  {
    name: 'search',
    aliases: ['s', 'find'],
    description: 'Search across codebase',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'momus',
      modifyPrompt: `Search for: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'review',
    aliases: ['r', 'check'],
    description: 'Code review mode',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'codereview',
      modifyPrompt: `Review: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'design',
    aliases: ['d', 'architect'],
    description: 'Architecture/design mode',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'strategist',
      modifyPrompt: `Design: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'doc',
    aliases: ['docs', 'document'],
    description: 'Documentation mode',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'strategist',
      modifyPrompt: `Document: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'ui',
    aliases: ['frontend', 'ux'],
    description: 'UI/UX mode',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'frontend',
      modifyPrompt: `UI/UX: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'research',
    aliases: ['learn', 'investigate'],
    description: 'Research mode',
    handler: (args, rawArgs) => ({
      handled: true,
      routeToExpert: 'strategist',
      modifyPrompt: `Research: ${rawArgs}`,
      shouldContinue: true
    })
  },
  {
    name: 'clear',
    aliases: ['reset', 'new'],
    description: 'Clear context/start fresh',
    handler: () => ({
      handled: true,
      response: '🔄 Context reset requested',
      shouldContinue: false
    })
  },
  {
    name: 'status',
    aliases: ['stat', 'info'],
    description: 'Show current status',
    handler: () => ({
      handled: true,
      response: generateStatusText(),
      shouldContinue: false
    })
  }
];

/**
 * Generates help text
 */
function generateHelpText(): string {
  let help = '## 📖 Available Slash Commands\n\n';

  for (const cmd of builtinCommands) {
    const aliases = cmd.aliases.length > 0
      ? ` (aliases: ${cmd.aliases.map(a => '/' + a).join(', ')})`
      : '';
    help += `- **/${cmd.name}**${aliases}: ${cmd.description}\n`;
  }

  help += '\n_Use /command [args] to execute_';
  return help;
}

/**
 * Generates status text
 */
function generateStatusText(): string {
  return `## 📊 Command Statistics

- Total detections: ${stats.totalDetections}
- Commands executed: ${stats.commandsExecuted}
- Unknown commands: ${stats.unknownCommands}
- Last command: ${stats.lastCommandTime ? new Date(stats.lastCommandTime).toISOString() : 'N/A'}

### Commands Used
${Object.entries(stats.commandsByName)
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => `- /${name}: ${count}`)
  .join('\n') || 'None yet'}`;
}

/**
 * Parses a slash command from text
 */
function parseCommand(text: string): ParsedCommand | null {
  if (!text) return null;

  // Match /command or /command args
  const regex = new RegExp(`^\\s*${escapeRegex(config.prefix)}(\\w+)(?:\\s+(.*))?$`, 'im');
  const match = text.match(regex);

  if (!match) return null;

  const command = match[1].toLowerCase();
  const rawArgs = (match[2] || '').trim();
  const args = rawArgs ? rawArgs.split(/\s+/) : [];

  return {
    command,
    args,
    rawArgs,
    fullMatch: match[0]
  };
}

/**
 * Escapes regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds command by name or alias
 */
function findCommand(name: string): CommandDefinition | null {
  const lowerName = name.toLowerCase();

  for (const cmd of builtinCommands) {
    if (cmd.name === lowerName || cmd.aliases.includes(lowerName)) {
      return cmd;
    }
  }

  return null;
}

/**
 * Handles a detected command
 */
function handleCommand(parsed: ParsedCommand): CommandHandlerResult {
  const cmd = findCommand(parsed.command);

  if (!cmd) {
    stats.unknownCommands++;
    return {
      handled: false,
      shouldContinue: true
    };
  }

  stats.commandsExecuted++;
  stats.commandsByName[cmd.name] = (stats.commandsByName[cmd.name] || 0) + 1;
  stats.lastCommandTime = Date.now();

  return cmd.handler(parsed.args, parsed.rawArgs);
}

/**
 * Hook: Detect slash commands in tool calls
 */
const detectInToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:auto-slash-command:tool-call',
  name: 'Auto Slash Command (Tool Call)',
  description: 'Detects slash commands in tool call inputs',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check relevant tool inputs
    const input = context.toolInput as Record<string, unknown>;
    const textFields = ['prompt', 'query', 'text', 'message', 'question'];

    for (const field of textFields) {
      if (typeof input[field] === 'string') {
        const parsed = parseCommand(input[field] as string);

        if (parsed && config.handleBuiltins) {
          stats.totalDetections++;

          const result = handleCommand(parsed);

          if (result.handled) {
            logger.info({
              command: parsed.command,
              args: parsed.args,
              tool: context.toolName
            }, 'Slash command detected and handled');

            if (!result.shouldContinue) {
              return {
                decision: 'block',
                reason: result.response || `Command /${parsed.command} executed`,
                metadata: {
                  slashCommand: parsed.command,
                  response: result.response
                }
              };
            }

            if (result.modifyPrompt || result.routeToExpert) {
              return {
                decision: 'modify',
                modifiedData: {
                  ...(result.modifyPrompt && { modifiedPrompt: result.modifyPrompt }),
                  ...(result.routeToExpert && { routeToExpert: result.routeToExpert })
                },
                metadata: {
                  slashCommand: parsed.command,
                  routeToExpert: result.routeToExpert
                }
              };
            }
          }
        }
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Detect slash commands in expert calls
 */
const detectInExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:auto-slash-command:expert-call',
  name: 'Auto Slash Command (Expert Call)',
  description: 'Detects slash commands in expert call prompts',
  eventType: 'onExpertCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const parsed = parseCommand(context.prompt);

    if (!parsed) {
      return { decision: 'continue' };
    }

    stats.totalDetections++;

    if (config.handleBuiltins) {
      const result = handleCommand(parsed);

      if (result.handled) {
        logger.info({
          command: parsed.command,
          args: parsed.args,
          expert: context.expertId
        }, 'Slash command detected in expert call');

        if (!result.shouldContinue) {
          return {
            decision: 'block',
            reason: result.response || `Command /${parsed.command} executed`,
            metadata: {
              slashCommand: parsed.command,
              response: result.response
            }
          };
        }

        // Route to different expert if specified
        if (result.routeToExpert && result.routeToExpert !== context.expertId) {
          return {
            decision: 'modify',
            modifiedData: {
              expertId: result.routeToExpert,
              prompt: result.modifyPrompt || parsed.rawArgs
            },
            metadata: {
              slashCommand: parsed.command,
              originalExpert: context.expertId,
              routedToExpert: result.routeToExpert
            }
          };
        }

        if (result.modifyPrompt) {
          return {
            decision: 'modify',
            modifiedData: {
              promptPrefix: result.modifyPrompt
            },
            metadata: { slashCommand: parsed.command }
          };
        }
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * All auto slash command hooks
 */
export const autoSlashCommandHooks = [
  detectInToolCallHook,
  detectInExpertCallHook
] as HookDefinition[];

/**
 * Registers auto slash command hooks
 */
export function registerAutoSlashCommandHooks(): void {
  for (const hook of autoSlashCommandHooks) {
    registerHook(hook);
  }
  logger.debug('Auto slash command hooks registered');
}

/**
 * Gets auto slash command statistics
 */
export function getAutoSlashCommandStats(): AutoSlashCommandStats & {
  config: AutoSlashCommandConfig;
  availableCommands: string[];
} {
  return {
    ...stats,
    config,
    availableCommands: builtinCommands.map(c => c.name)
  };
}

/**
 * Resets auto slash command state
 */
export function resetAutoSlashCommandState(): void {
  stats = {
    totalDetections: 0,
    commandsExecuted: 0,
    commandsByName: {},
    unknownCommands: 0
  };
}

/**
 * Updates auto slash command configuration
 */
export function updateAutoSlashCommandConfig(updates: Partial<AutoSlashCommandConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Auto slash command config updated');
}

/**
 * Adds a custom command
 */
export function addCustomCommand(command: CommandDefinition): void {
  builtinCommands.push(command);
  logger.info({ command: command.name }, 'Custom command added');
}

/**
 * Removes a custom command
 */
export function removeCustomCommand(name: string): boolean {
  const index = builtinCommands.findIndex(c => c.name === name);
  if (index > -1) {
    builtinCommands.splice(index, 1);
    logger.info({ command: name }, 'Custom command removed');
    return true;
  }
  return false;
}

export default {
  registerAutoSlashCommandHooks,
  getAutoSlashCommandStats,
  resetAutoSlashCommandState,
  updateAutoSlashCommandConfig,
  addCustomCommand,
  removeCustomCommand
};
