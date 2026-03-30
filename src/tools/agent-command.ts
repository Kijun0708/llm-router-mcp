// src/tools/agent-command.ts

/**
 * Agent & Command MCP Tools
 *
 * MCP tools for managing and executing Claude Code-style agents and commands.
 * Bridges the gap between MCP and Claude Code's agent/command system.
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import {
  getAgentManager,
  LoadedAgent
} from '../features/claude-code-agent-loader/index.js';
import {
  getCommandManager,
  LoadedCommand
} from '../features/claude-code-command-loader/index.js';
import { callExpertWithFallback } from '../services/expert-router.js';

// MCP response type
type McpResponse = { content: Array<{ type: 'text'; text: string }> };

/**
 * Creates MCP response
 */
function mcpResponse(text: string): McpResponse {
  return { content: [{ type: 'text', text }] };
}

// ============================================================================
// Agent Tools
// ============================================================================

/**
 * Schema for list_agents
 */
export const listAgentsSchema = z.object({
  reload: z.boolean().optional().describe('Force reload agents from disk')
});

/**
 * Tool definition for list_agents
 */
export const listAgentsTool = {
  name: 'list_agents',
  description: `Lists all available Claude Code-style agents.

Agents are loaded from:
- ~/.claude/agents/*.md (user agents)
- .claude/agents/*.md (project agents)

Returns agent names, descriptions, and available tools.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      reload: {
        type: 'boolean',
        description: 'Force reload agents from disk'
      }
    }
  }
};

/**
 * Formats agent for display
 */
function formatAgent(agent: LoadedAgent): string {
  let info = `### ${agent.name}\n`;
  info += `- **ID:** \`${agent.id}\`\n`;
  info += `- **Source:** ${agent.sourceType}\n`;

  if (agent.metadata.description) {
    info += `- **Description:** ${agent.metadata.description}\n`;
  }

  if (agent.metadata.tools && agent.metadata.tools.length > 0) {
    info += `- **Tools:** ${agent.metadata.tools.join(', ')}\n`;
  }

  if (agent.metadata.model) {
    info += `- **Model:** ${agent.metadata.model}\n`;
  }

  return info;
}

/**
 * Handler for list_agents
 */
export async function handleListAgents(args: z.infer<typeof listAgentsSchema>): Promise<McpResponse> {
  try {
    const manager = getAgentManager();
    const agents = manager.getAgents(args.reload || false);

    if (agents.length === 0) {
      return mcpResponse(`📭 **No agents found**

Agents can be placed in:
- \`~/.claude/agents/*.md\` (user agents)
- \`.claude/agents/*.md\` (project agents)

Example agent file (\`research-agent.md\`):
\`\`\`markdown
---
name: research-agent
description: Deep research specialist
tools:
  - WebSearch
  - Read
model: sonnet
---

You are a research specialist...
\`\`\``);
    }

    let result = `# 🤖 Available Agents (${agents.length})\n\n`;

    // Group by source type
    const bySource: Record<string, LoadedAgent[]> = {};
    for (const agent of agents) {
      if (!bySource[agent.sourceType]) {
        bySource[agent.sourceType] = [];
      }
      bySource[agent.sourceType].push(agent);
    }

    for (const [source, sourceAgents] of Object.entries(bySource)) {
      result += `## ${source} (${sourceAgents.length})\n\n`;
      for (const agent of sourceAgents) {
        result += formatAgent(agent) + '\n';
      }
    }

    result += `\n---\n**Usage:** \`run_agent { "name": "agent-name", "task": "your task" }\``;

    return mcpResponse(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list agents');
    return mcpResponse(`❌ Failed to list agents: ${error}`);
  }
}

/**
 * Schema for run_agent
 */
export const runAgentSchema = z.object({
  name: z.string().describe('Agent name or ID'),
  task: z.string().describe('Task to give to the agent'),
  context: z.string().optional().describe('Additional context for the agent')
});

/**
 * Tool definition for run_agent
 */
export const runAgentTool = {
  name: 'run_agent',
  description: `Runs a Claude Code-style agent with the given task.

The agent's prompt is loaded from its markdown file and combined with your task.
Uses the configured model and tools for that agent.

Example: run_agent { "name": "research-agent", "task": "Find best practices for React testing" }`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Agent name or ID'
      },
      task: {
        type: 'string',
        description: 'Task to give to the agent'
      },
      context: {
        type: 'string',
        description: 'Additional context for the agent'
      }
    },
    required: ['name', 'task']
  }
};

/**
 * Handler for run_agent
 */
export async function handleRunAgent(args: z.infer<typeof runAgentSchema>): Promise<McpResponse> {
  try {
    const manager = getAgentManager();
    const agent = manager.getAgentByName(args.name) || manager.getAgentById(args.name);

    if (!agent) {
      const available = manager.listAgentNames();
      return mcpResponse(`❌ Agent "${args.name}" not found.

Available agents: ${available.length > 0 ? available.join(', ') : 'none'}

Use \`list_agents\` to see all available agents.`);
    }

    // Build the full prompt
    const agentPrompt = manager.getAgentPrompt(agent.name);
    const fullPrompt = `${agentPrompt}

---

## Current Task

${args.task}

${args.context ? `### Additional Context\n\n${args.context}` : ''}`;

    logger.info({
      agent: agent.name,
      taskLength: args.task.length
    }, 'Running agent');

    // Determine which expert to use based on agent metadata
    const expertId = mapAgentToExpert(agent);

    // Execute via expert system
    const result = await callExpertWithFallback(
      expertId,
      fullPrompt
    );

    return mcpResponse(`# 🤖 ${agent.name} Response\n\n${result.response}`);
  } catch (error) {
    logger.error({ error, agent: args.name }, 'Failed to run agent');
    return mcpResponse(`❌ Failed to run agent: ${error}`);
  }
}

/**
 * Maps agent metadata to expert ID
 */
function mapAgentToExpert(agent: LoadedAgent): string {
  const model = agent.metadata.model?.toLowerCase();

  if (model?.includes('gpt') || model?.includes('openai')) {
    return 'strategist';
  }
  if (model?.includes('gemini')) {
    return 'codereview';
  }
  if (model?.includes('claude') || model?.includes('sonnet')) {
    return 'strategist';
  }

  // Default based on agent name/description
  const name = agent.name.toLowerCase();
  const desc = (agent.metadata.description || '').toLowerCase();

  if (name.includes('research') || desc.includes('research')) {
    return 'strategist';
  }
  if (name.includes('review') || desc.includes('review')) {
    return 'codereview';
  }
  if (name.includes('frontend') || desc.includes('ui')) {
    return 'frontend';
  }
  if (name.includes('doc') || desc.includes('write')) {
    return 'strategist';
  }

  return 'strategist'; // Default
}

// ============================================================================
// Command Tools
// ============================================================================

/**
 * Schema for list_commands
 */
export const listCommandsSchema = z.object({
  namespace: z.string().optional().describe('Filter by namespace (e.g., "git")'),
  reload: z.boolean().optional().describe('Force reload commands from disk')
});

/**
 * Tool definition for list_commands
 */
export const listCommandsTool = {
  name: 'list_commands',
  description: `Lists all available Claude Code-style slash commands.

Commands are loaded from:
- ~/.claude/commands/ (user commands)
- .claude/commands/ (project commands)

Directory structure becomes namespace:
- commands/git/commit.md → /git:commit`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      namespace: {
        type: 'string',
        description: 'Filter by namespace (e.g., "git")'
      },
      reload: {
        type: 'boolean',
        description: 'Force reload commands from disk'
      }
    }
  }
};

/**
 * Formats command for display
 */
function formatCommand(cmd: LoadedCommand): string {
  let info = `- **${cmd.slashCommand}**`;

  if (cmd.metadata.description) {
    info += `: ${cmd.metadata.description}`;
  }

  if (cmd.metadata.aliases && cmd.metadata.aliases.length > 0) {
    info += ` _(aliases: ${cmd.metadata.aliases.map(a => '/' + a).join(', ')})_`;
  }

  return info;
}

/**
 * Handler for list_commands
 */
export async function handleListCommands(args: z.infer<typeof listCommandsSchema>): Promise<McpResponse> {
  try {
    const manager = getCommandManager();

    if (args.reload) {
      manager.reload();
    }

    let commands: LoadedCommand[];

    if (args.namespace) {
      commands = manager.getCommandsInNamespace(args.namespace);
    } else {
      commands = manager.getCommands();
    }

    // Filter out hidden commands
    commands = commands.filter(c => !c.metadata.hidden);

    if (commands.length === 0) {
      const msg = args.namespace
        ? `📭 **No commands found in namespace "${args.namespace}"**`
        : `📭 **No commands found**`;

      return mcpResponse(`${msg}

Commands can be placed in:
- \`~/.claude/commands/*.md\` (user commands)
- \`.claude/commands/*.md\` (project commands)

Example command file (\`review.md\`):
\`\`\`markdown
---
name: review
description: Review code for quality
aliases:
  - cr
---

Review the specified code for...
\`\`\``);
    }

    let result = args.namespace
      ? `# 📋 Commands in "${args.namespace}" (${commands.length})\n\n`
      : `# 📋 Available Commands (${commands.length})\n\n`;

    // Group by namespace
    const byNamespace = new Map<string, LoadedCommand[]>();
    const rootCommands: LoadedCommand[] = [];

    for (const cmd of commands) {
      if (cmd.namespace) {
        if (!byNamespace.has(cmd.namespace)) {
          byNamespace.set(cmd.namespace, []);
        }
        byNamespace.get(cmd.namespace)!.push(cmd);
      } else {
        rootCommands.push(cmd);
      }
    }

    if (rootCommands.length > 0) {
      result += `## General\n\n`;
      for (const cmd of rootCommands.sort((a, b) => a.name.localeCompare(b.name))) {
        result += formatCommand(cmd) + '\n';
      }
      result += '\n';
    }

    for (const [ns, cmds] of Array.from(byNamespace.entries()).sort()) {
      result += `## ${ns}\n\n`;
      for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
        result += formatCommand(cmd) + '\n';
      }
      result += '\n';
    }

    result += `---\n**Usage:** \`run_command { "command": "/review", "input": "file.ts" }\``;

    return mcpResponse(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list commands');
    return mcpResponse(`❌ Failed to list commands: ${error}`);
  }
}

/**
 * Schema for run_command
 */
export const runCommandSchema = z.object({
  command: z.string().describe('Command name or slash command (e.g., "/review" or "git:commit")'),
  input: z.string().optional().describe('Input/arguments for the command'),
  context: z.string().optional().describe('Additional context')
});

/**
 * Tool definition for run_command
 */
export const runCommandTool = {
  name: 'run_command',
  description: `Runs a Claude Code-style slash command.

The command's prompt template is loaded from its markdown file.
The input is combined with the prompt and executed.

Example: run_command { "command": "/review", "input": "src/utils/auth.ts" }`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'Command name or slash command (e.g., "/review" or "git:commit")'
      },
      input: {
        type: 'string',
        description: 'Input/arguments for the command'
      },
      context: {
        type: 'string',
        description: 'Additional context'
      }
    },
    required: ['command']
  }
};

/**
 * Handler for run_command
 */
export async function handleRunCommand(args: z.infer<typeof runCommandSchema>): Promise<McpResponse> {
  try {
    const manager = getCommandManager();
    const command = manager.getCommandBySlash(args.command) ||
                   manager.getCommandById(args.command);

    if (!command) {
      const available = manager.listSlashCommands().slice(0, 10);
      return mcpResponse(`❌ Command "${args.command}" not found.

Available commands: ${available.length > 0 ? available.join(', ') : 'none'}${available.length >= 10 ? '...' : ''}

Use \`list_commands\` to see all available commands.`);
    }

    // Build the full prompt
    const fullPrompt = `${command.prompt}

---

## Input

${args.input || '(No specific input provided)'}

${args.context ? `### Additional Context\n\n${args.context}` : ''}`;

    logger.info({
      command: command.slashCommand,
      inputLength: args.input?.length || 0
    }, 'Running command');

    // Execute via researcher expert (default for commands)
    const result = await callExpertWithFallback(
      'researcher',
      fullPrompt
    );

    return mcpResponse(`# ${command.slashCommand} Result\n\n${result.response}`);
  } catch (error) {
    logger.error({ error, command: args.command }, 'Failed to run command');
    return mcpResponse(`❌ Failed to run command: ${error}`);
  }
}

/**
 * Schema for search_commands
 */
export const searchCommandsSchema = z.object({
  query: z.string().describe('Search query')
});

/**
 * Tool definition for search_commands
 */
export const searchCommandsTool = {
  name: 'search_commands',
  description: 'Searches commands by name, description, or tags',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      }
    },
    required: ['query']
  }
};

/**
 * Handler for search_commands
 */
export async function handleSearchCommands(args: z.infer<typeof searchCommandsSchema>): Promise<McpResponse> {
  try {
    const manager = getCommandManager();
    const results = manager.searchCommands(args.query);

    if (results.length === 0) {
      return mcpResponse(`🔍 No commands found matching "${args.query}"`);
    }

    let output = `# 🔍 Search Results for "${args.query}" (${results.length})\n\n`;

    for (const cmd of results) {
      output += formatCommand(cmd) + '\n';
    }

    return mcpResponse(output);
  } catch (error) {
    logger.error({ error }, 'Failed to search commands');
    return mcpResponse(`❌ Failed to search commands: ${error}`);
  }
}

export default {
  // Agent tools
  listAgentsTool,
  listAgentsSchema,
  handleListAgents,
  runAgentTool,
  runAgentSchema,
  handleRunAgent,

  // Command tools
  listCommandsTool,
  listCommandsSchema,
  handleListCommands,
  runCommandTool,
  runCommandSchema,
  handleRunCommand,
  searchCommandsTool,
  searchCommandsSchema,
  handleSearchCommands
};
