// src/cli/commands/doctor.ts

/**
 * Doctor command - diagnoses installation issues
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { DoctorCheckResult, DoctorReport } from '../types.js';
import { ConfigManager, PATHS, MCP_SERVER_NAME } from '../config-manager.js';

/**
 * Runs all diagnostic checks
 */
export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheckResult[] = [];

  // Check 1: Claude directory exists
  checks.push(checkClaudeDirectory());

  // Check 2: Settings file exists and is valid JSON
  checks.push(checkSettingsFile());

  // Check 3: MCP server is registered
  checks.push(checkMcpRegistration());

  // Check 4: MCP server is not disabled
  checks.push(checkMcpEnabled());

  // Check 5: Node.js version
  checks.push(checkNodeVersion());

  // Check 6-7: Required local LLM CLIs
  checks.push(checkCliAvailability('Codex CLI', process.env.CLI_CODEX_PATH || 'codex'));
  // USE_ANTIGRAVITY=true 시 agy, 아니면 gemini CLI 체크 (active provider만 검증)
  if (process.env.USE_ANTIGRAVITY === 'true') {
    checks.push(checkCliAvailability('Antigravity CLI', process.env.CLI_ANTIGRAVITY_PATH || 'agy'));
  } else {
    checks.push(checkCliAvailability('Gemini CLI', process.env.CLI_GEMINI_PATH || 'gemini'));
  }

  // Check 8: Agents directory exists
  checks.push(checkAgentsDirectory());

  // Check 9: Commands directory exists
  checks.push(checkCommandsDirectory());

  // Check 10: MCP server path is valid
  checks.push(checkMcpServerPath());

  // Calculate summary
  const summary = {
    passed: checks.filter(c => c.status === 'pass').length,
    warnings: checks.filter(c => c.status === 'warn').length,
    failed: checks.filter(c => c.status === 'fail').length
  };

  return {
    timestamp: new Date().toISOString(),
    checks,
    summary
  };
}

/**
 * Check: Claude directory exists
 */
function checkClaudeDirectory(): DoctorCheckResult {
  const exists = existsSync(PATHS.claudeDir);

  return {
    name: 'Claude Directory',
    status: exists ? 'pass' : 'fail',
    message: exists
      ? `Found at ${PATHS.claudeDir}`
      : `Not found at ${PATHS.claudeDir}`,
    fix: exists ? undefined : 'Run: custommcp install'
  };
}

/**
 * Check: Settings file exists and is valid
 */
function checkSettingsFile(): DoctorCheckResult {
  if (!existsSync(PATHS.claudeSettings)) {
    return {
      name: 'Settings File',
      status: 'warn',
      message: 'settings.json does not exist',
      fix: 'Run: custommcp install'
    };
  }

  try {
    ConfigManager.readClaudeSettings();
    return {
      name: 'Settings File',
      status: 'pass',
      message: 'Valid JSON at ' + PATHS.claudeSettings
    };
  } catch (err) {
    return {
      name: 'Settings File',
      status: 'fail',
      message: `Invalid JSON: ${err}`,
      fix: 'Fix the JSON syntax in settings.json or restore from backup'
    };
  }
}

/**
 * Check: MCP server is registered
 */
function checkMcpRegistration(): DoctorCheckResult {
  const isRegistered = ConfigManager.isMcpServerRegistered();

  return {
    name: 'MCP Registration',
    status: isRegistered ? 'pass' : 'fail',
    message: isRegistered
      ? `${MCP_SERVER_NAME} is registered`
      : `${MCP_SERVER_NAME} is not registered`,
    fix: isRegistered ? undefined : 'Run: custommcp install'
  };
}

/**
 * Check: MCP server is not disabled
 */
function checkMcpEnabled(): DoctorCheckResult {
  const config = ConfigManager.getMcpServerConfig();

  if (!config) {
    return {
      name: 'MCP Enabled',
      status: 'warn',
      message: 'MCP server not registered (cannot check enabled state)',
      fix: 'Run: custommcp install'
    };
  }

  const isEnabled = config.disabled !== true;

  return {
    name: 'MCP Enabled',
    status: isEnabled ? 'pass' : 'warn',
    message: isEnabled
      ? 'MCP server is enabled'
      : 'MCP server is disabled',
    fix: isEnabled ? undefined : 'Enable it in Claude Code settings or run: custommcp enable'
  };
}

/**
 * Check: Node.js version
 */
function checkNodeVersion(): DoctorCheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  const minVersion = 18;

  if (major >= minVersion) {
    return {
      name: 'Node.js Version',
      status: 'pass',
      message: `Node.js ${version} (>= ${minVersion} required)`
    };
  } else {
    return {
      name: 'Node.js Version',
      status: 'fail',
      message: `Node.js ${version} is too old (>= ${minVersion} required)`,
      fix: 'Upgrade Node.js to version 18 or later'
    };
  }
}

/**
 * Check: required local CLI command is available.
 */
function checkCliAvailability(name: string, command: string): DoctorCheckResult {
  const commandLine = `${quoteShellCommand(command)} --version`;
  const result = spawnSync(commandLine, {
    encoding: 'utf-8',
    timeout: 10000,
    shell: true,
    windowsHide: true
  });

  if (result.error) {
    const timedOut = result.error.message.toLowerCase().includes('timed out');
    return {
      name,
      status: 'fail',
      message: timedOut
        ? `${command} --version timed out`
        : `${command} is not available: ${result.error.message}`,
      fix: `Install/authenticate ${command}, add it to PATH, or set ${envHintFor(name)}`
    };
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    return {
      name,
      status: 'fail',
      message: `${command} --version exited with ${result.status}: ${stderr || stdout || 'no output'}`,
      fix: `Install/authenticate ${command}, add it to PATH, or set ${envHintFor(name)}`
    };
  }

  const version = ((result.stdout || result.stderr || '').trim().split(/\r?\n/)[0]) || 'version command succeeded';
  return {
    name,
    status: 'pass',
    message: `${command} available (${version})`
  };
}

function envHintFor(name: string): string {
  if (name.startsWith('Codex')) return 'CLI_CODEX_PATH';
  if (name.startsWith('Antigravity')) return 'CLI_ANTIGRAVITY_PATH';
  return 'CLI_GEMINI_PATH';
}

function quoteShellCommand(command: string): string {
  if ((command.startsWith('"') && command.endsWith('"')) || (command.startsWith("'") && command.endsWith("'"))) {
    return command;
  }

  return /\s/.test(command) ? `"${command.replace(/"/g, '\\"')}"` : command;
}

/**
 * Check: Agents directory exists
 */
function checkAgentsDirectory(): DoctorCheckResult {
  const exists = existsSync(PATHS.claudeAgents);

  return {
    name: 'Agents Directory',
    status: exists ? 'pass' : 'warn',
    message: exists
      ? `Found at ${PATHS.claudeAgents}`
      : `Not found at ${PATHS.claudeAgents}`,
    fix: exists ? undefined : 'Run: custommcp install'
  };
}

/**
 * Check: Commands directory exists
 */
function checkCommandsDirectory(): DoctorCheckResult {
  const exists = existsSync(PATHS.claudeCommands);

  return {
    name: 'Commands Directory',
    status: exists ? 'pass' : 'warn',
    message: exists
      ? `Found at ${PATHS.claudeCommands}`
      : `Not found at ${PATHS.claudeCommands}`,
    fix: exists ? undefined : 'Run: custommcp install'
  };
}

/**
 * Check: MCP server path is valid
 */
function checkMcpServerPath(): DoctorCheckResult {
  const config = ConfigManager.getMcpServerConfig();

  if (!config) {
    return {
      name: 'MCP Server Path',
      status: 'warn',
      message: 'MCP server not registered',
      fix: 'Run: custommcp install'
    };
  }

  // Check if it's a node command with args
  if (config.command === 'node' && config.args && config.args.length > 0) {
    const scriptPath = config.args[0];

    if (existsSync(scriptPath)) {
      try {
        const stats = statSync(scriptPath);
        if (stats.isFile()) {
          return {
            name: 'MCP Server Path',
            status: 'pass',
            message: `Script exists at ${scriptPath}`
          };
        }
      } catch { /* ignore */ }
    }

    return {
      name: 'MCP Server Path',
      status: 'fail',
      message: `Script not found at ${scriptPath}`,
      fix: 'Rebuild the project (npm run build) or reinstall custommcp'
    };
  }

  // Check if command exists (for npx or other commands)
  return {
    name: 'MCP Server Path',
    status: 'pass',
    message: `Command: ${config.command} ${(config.args || []).join(' ')}`
  };
}

/**
 * Formats doctor report for console output
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('custommcp Doctor');
  lines.push('================');
  lines.push('');

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '[OK]' : check.status === 'warn' ? '[!!]' : '[XX]';
    lines.push(`${icon} ${check.name}`);
    lines.push(`    ${check.message}`);
    if (check.fix) {
      lines.push(`    Fix: ${check.fix}`);
    }
    lines.push('');
  }

  lines.push('Summary');
  lines.push('-------');
  lines.push(`Passed:   ${report.summary.passed}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push(`Failed:   ${report.summary.failed}`);
  lines.push('');

  if (report.summary.failed > 0) {
    lines.push('Some checks failed. Run the suggested fixes to resolve issues.');
  } else if (report.summary.warnings > 0) {
    lines.push('Some warnings were found. Consider running the suggested fixes.');
  } else {
    lines.push('All checks passed! custommcp is properly configured.');
  }

  return lines.join('\n');
}

export default {
  runDoctor,
  formatDoctorReport
};
