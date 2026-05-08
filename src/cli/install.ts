// src/cli/install.ts

/**
 * Installation script for custommcp
 *
 * Handles interactive and non-interactive installation of the MCP server.
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  InstallOptions,
  SubscriptionType,
  DefaultAgent,
  DefaultCommand
} from './types.js';
import { ConfigManager, PATHS, ensureDir } from './config-manager.js';

/**
 * Default agents to install
 */
const DEFAULT_AGENTS: DefaultAgent[] = [
  {
    name: 'research-agent',
    filename: 'research-agent.md',
    description: 'Deep research and analysis agent',
    content: `---
name: research-agent
description: Deep research and analysis specialist
tools:
  - WebSearch
  - WebFetch
  - Read
  - Grep
  - Glob
model: sonnet
---

# Research Agent

You are a research specialist focused on gathering comprehensive information and providing thorough analysis.

## Responsibilities

1. **Information Gathering**: Search the web, documentation, and codebase for relevant information
2. **Analysis**: Synthesize findings into clear, actionable insights
3. **Verification**: Cross-reference multiple sources to ensure accuracy
4. **Documentation**: Provide well-organized research reports

## Guidelines

- Always cite your sources
- Prioritize official documentation and authoritative sources
- Present findings in a structured format
- Highlight key insights and recommendations
- Note any uncertainties or conflicting information
`
  },
  {
    name: 'code-reviewer',
    filename: 'code-reviewer.md',
    description: 'Code review and quality analysis agent',
    content: `---
name: code-reviewer
description: Code review and quality analysis specialist
tools:
  - Read
  - Grep
  - Glob
  - mcp__ide__getDiagnostics
model: sonnet
---

# Code Reviewer Agent

You are a code review specialist focused on ensuring code quality, security, and maintainability.

## Responsibilities

1. **Code Quality**: Review code for clarity, consistency, and best practices
2. **Security**: Identify potential security vulnerabilities (OWASP Top 10)
3. **Performance**: Spot performance issues and optimization opportunities
4. **Maintainability**: Ensure code is readable and maintainable

## Review Checklist

- [ ] Logic correctness
- [ ] Error handling
- [ ] Input validation
- [ ] Security considerations
- [ ] Code style and conventions
- [ ] Documentation and comments
- [ ] Test coverage
- [ ] Performance implications

## Guidelines

- Be constructive and specific in feedback
- Explain the "why" behind suggestions
- Prioritize issues by severity
- Acknowledge good patterns when you see them
`
  },
  {
    name: 'test-writer',
    filename: 'test-writer.md',
    description: 'Test generation and verification agent',
    content: `---
name: test-writer
description: Test generation and verification specialist
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
model: sonnet
---

# Test Writer Agent

You are a testing specialist focused on writing comprehensive test suites.

## Responsibilities

1. **Unit Tests**: Write focused unit tests for individual functions/methods
2. **Integration Tests**: Test component interactions
3. **Edge Cases**: Cover boundary conditions and error scenarios
4. **Mocking**: Properly mock dependencies and external services

## Testing Principles

- Follow AAA pattern (Arrange, Act, Assert)
- One assertion focus per test
- Descriptive test names that explain the scenario
- Independent tests that don't rely on each other
- Fast execution - mock external dependencies

## Guidelines

- Match the project's existing test style
- Focus on behavior, not implementation details
- Cover happy path and error paths
- Include edge cases and boundary conditions
- Ensure tests are deterministic
`
  }
];

/**
 * Default commands to install
 */
const DEFAULT_COMMANDS: DefaultCommand[] = [
  {
    name: 'review',
    filename: 'review.md',
    description: 'Code review command',
    content: `---
name: review
description: Review code for quality, security, and best practices
help: "/review [file or directory] - Review code"
aliases:
  - cr
  - code-review
---

Review the specified code for:

1. **Code Quality**
   - Clear and readable code
   - Consistent naming conventions
   - Appropriate abstractions
   - DRY principles

2. **Security**
   - Input validation
   - SQL injection vulnerabilities
   - XSS vulnerabilities
   - Authentication/authorization issues
   - Sensitive data exposure

3. **Performance**
   - Inefficient algorithms
   - N+1 queries
   - Memory leaks
   - Unnecessary computations

4. **Best Practices**
   - Error handling
   - Logging
   - Documentation
   - Test coverage

Provide specific, actionable feedback with code examples where appropriate.
`
  },
  {
    name: 'explain',
    filename: 'explain.md',
    description: 'Explain code in detail',
    content: `---
name: explain
description: Explain code functionality in detail
help: "/explain [file or function] - Get detailed explanation"
aliases:
  - e
  - what
---

Explain the specified code in detail:

1. **Overview**: What does this code do at a high level?
2. **Components**: Break down the key parts and their purposes
3. **Data Flow**: How does data move through the code?
4. **Dependencies**: What external modules/functions does it rely on?
5. **Side Effects**: Does it modify state, make API calls, etc.?
6. **Edge Cases**: What boundary conditions does it handle?

Use clear language and avoid unnecessary jargon. Include code snippets to illustrate points.
`
  },
  {
    name: 'refactor',
    namespace: 'code',
    filename: 'code/refactor.md',
    description: 'Refactor code for better quality',
    content: `---
name: refactor
description: Refactor code for improved quality and maintainability
help: "/code:refactor [target] - Refactor specified code"
---

Refactor the specified code with focus on:

1. **Readability**: Make the code easier to understand
2. **Maintainability**: Reduce complexity and improve structure
3. **Performance**: Optimize where beneficial
4. **Testability**: Make the code easier to test

## Refactoring Guidelines

- Make small, incremental changes
- Preserve existing behavior (unless bugs are found)
- Add/update tests to verify changes
- Document significant changes

## Common Refactorings

- Extract method/function
- Rename for clarity
- Remove duplication
- Simplify conditionals
- Introduce meaningful abstractions

Show before/after comparisons and explain the benefits of each change.
`
  },
  {
    name: 'test',
    namespace: 'code',
    filename: 'code/test.md',
    description: 'Generate tests for code',
    content: `---
name: test
description: Generate comprehensive tests for code
help: "/code:test [target] - Generate tests for specified code"
---

Generate comprehensive tests for the specified code:

1. **Unit Tests**: Test individual functions in isolation
2. **Edge Cases**: Cover boundary conditions
3. **Error Handling**: Test error scenarios
4. **Integration**: Test component interactions if applicable

## Test Requirements

- Follow the project's existing test patterns
- Use appropriate mocking for dependencies
- Include descriptive test names
- Cover both success and failure paths

## Output Format

Provide complete, runnable test code that can be added directly to the test suite.
`
  }
];

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  message: string;
  backupPath?: string;
  mcpServerPath?: string;
  replacedMcpRegistration: boolean;
  installedAgents: string[];
  installedCommands: string[];
  errors: string[];
}

/**
 * Performs the installation
 */
export async function install(options: InstallOptions = {}): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    message: '',
    replacedMcpRegistration: false,
    installedAgents: [],
    installedCommands: [],
    errors: []
  };

  try {
    const hadMcpRegistration = ConfigManager.isMcpServerRegistered();

    // Backup existing settings
    const backupPath = ConfigManager.backupSettings();
    if (backupPath) {
      result.backupPath = backupPath;
    }

    // Ensure directories exist
    ConfigManager.ensureClaudeCodeDirectories();

    // Register MCP server
    const mcpConfig = ConfigManager.getDefaultMcpConfig();
    ConfigManager.registerMcpServer(mcpConfig);
    result.mcpServerPath = mcpConfig.args?.[0];
    result.replacedMcpRegistration = hadMcpRegistration;

    // Install default agents (unless skipped)
    if (!options.skipAgents) {
      for (const agent of DEFAULT_AGENTS) {
        try {
          const agentPath = join(PATHS.claudeAgents, agent.filename);
          if (!existsSync(agentPath) || options.force) {
            writeFileSync(agentPath, agent.content, 'utf-8');
            result.installedAgents.push(agent.name);
          }
        } catch (err) {
          result.errors.push(`Failed to install agent ${agent.name}: ${err}`);
        }
      }
    }

    // Install default commands (unless skipped)
    if (!options.skipCommands) {
      for (const command of DEFAULT_COMMANDS) {
        try {
          const commandDir = command.namespace
            ? join(PATHS.claudeCommands, command.namespace)
            : PATHS.claudeCommands;

          ensureDir(commandDir);

          const commandPath = join(PATHS.claudeCommands, command.filename);
          if (!existsSync(commandPath) || options.force) {
            ensureDir(join(PATHS.claudeCommands, command.namespace || ''));
            writeFileSync(commandPath, command.content, 'utf-8');
            result.installedCommands.push(command.namespace ? `${command.namespace}:${command.name}` : command.name);
          }
        } catch (err) {
          result.errors.push(`Failed to install command ${command.name}: ${err}`);
        }
      }
    }

    // Save CLI config
    const subscriptions = options.subscriptions || ['claude' as SubscriptionType];
    ConfigManager.saveCliConfig(subscriptions);

    result.success = true;
    result.message = hadMcpRegistration
      ? 'Installation completed successfully; existing MCP registration was replaced'
      : 'Installation completed successfully';

  } catch (err) {
    result.success = false;
    result.message = `Installation failed: ${err}`;
    result.errors.push(String(err));
  }

  return result;
}

/**
 * Uninstalls custommcp
 */
export async function uninstall(): Promise<{ success: boolean; message: string }> {
  try {
    const removed = ConfigManager.unregisterMcpServer();

    if (removed) {
      return { success: true, message: 'MCP server unregistered successfully' };
    } else {
      return { success: false, message: 'MCP server was not registered' };
    }
  } catch (err) {
    return { success: false, message: `Uninstall failed: ${err}` };
  }
}

/**
 * Gets list of default agents
 */
export function getDefaultAgents(): DefaultAgent[] {
  return DEFAULT_AGENTS;
}

/**
 * Gets list of default commands
 */
export function getDefaultCommands(): DefaultCommand[] {
  return DEFAULT_COMMANDS;
}

/**
 * Checks if installation is needed
 */
export function isInstallationNeeded(): boolean {
  return !ConfigManager.isMcpServerRegistered();
}

/**
 * Gets installation status
 */
export function getInstallationStatus(): {
  installed: boolean;
  mcpRegistered: boolean;
  directories: {
    claudeDir: boolean;
    settings: boolean;
    agents: boolean;
    commands: boolean;
  };
  agentCount: number;
  commandCount: number;
} {
  const dirs = ConfigManager.checkClaudeCodeDirectories();

  // Count agents
  let agentCount = 0;
  if (existsSync(PATHS.claudeAgents)) {
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(PATHS.claudeAgents);
      agentCount = files.filter((f: string) => f.endsWith('.md')).length;
    } catch { /* ignore */ }
  }

  // Count commands (recursive would be more accurate but this is simpler)
  let commandCount = 0;
  if (existsSync(PATHS.claudeCommands)) {
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(PATHS.claudeCommands);
      commandCount = files.filter((f: string) => f.endsWith('.md')).length;
    } catch { /* ignore */ }
  }

  return {
    installed: ConfigManager.isMcpServerRegistered(),
    mcpRegistered: ConfigManager.isMcpServerRegistered(),
    directories: dirs,
    agentCount,
    commandCount
  };
}

export default {
  install,
  uninstall,
  getDefaultAgents,
  getDefaultCommands,
  isInstallationNeeded,
  getInstallationStatus
};
