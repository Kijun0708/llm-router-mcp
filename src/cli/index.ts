#!/usr/bin/env node
// src/cli/index.ts

/**
 * custommcp CLI
 *
 * Installation and management CLI for the LLM Router MCP server.
 *
 * Commands:
 *   install     Install and configure custommcp
 *   uninstall   Remove custommcp configuration
 *   doctor      Diagnose installation issues
 *   update      Check for and apply updates
 *   enable      Enable the MCP server
 *   disable     Disable the MCP server
 *   status      Show installation status
 */

import { install, uninstall, getInstallationStatus } from './install.js';
import { runDoctor, formatDoctorReport } from './commands/doctor.js';
import { checkForUpdates, formatUpdateInfo, performUpdate } from './commands/update.js';
import { ConfigManager } from './config-manager.js';
import { InstallOptions, SubscriptionType } from './types.js';

/**
 * Prints usage help
 */
function printHelp(): void {
  console.log(`
custommcp - LLM Router MCP Server CLI

Usage: custommcp <command> [options]

Commands:
  install       Install and configure custommcp
  uninstall     Remove custommcp from Claude Code settings
  doctor        Diagnose installation issues
  update        Check for and apply updates
  enable        Enable the MCP server
  disable       Disable the MCP server
  status        Show installation status
  help          Show this help message

Install Options:
  --no-tui              Non-interactive mode
  --claude              Configure for Claude (default)
  --skip-agents         Skip default agent installation
  --skip-commands       Skip default command installation
  --force               Overwrite existing files

Examples:
  custommcp install
  custommcp install --no-tui
  custommcp doctor
  custommcp update
  custommcp status
`);
}

/**
 * Parses command line arguments
 */
function parseArgs(args: string[]): {
  command: string;
  options: InstallOptions;
} {
  const command = args[0] || 'help';
  const options: InstallOptions = {
    subscriptions: []
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--no-tui':
        options.noTui = true;
        break;
      case '--claude':
        options.subscriptions!.push('claude');
        break;
      case '--chatgpt':
        options.subscriptions!.push('chatgpt');
        break;
      case '--gemini':
        options.subscriptions!.push('gemini');
        break;
      case '--skip-agents':
        options.skipAgents = true;
        break;
      case '--skip-commands':
        options.skipCommands = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  // Default to claude if no subscriptions specified
  if (options.subscriptions!.length === 0) {
    options.subscriptions = ['claude'];
  }

  return { command, options };
}

/**
 * Handles install command
 */
async function handleInstall(options: InstallOptions): Promise<void> {
  console.log('\ncustommcp Installation');
  console.log('======================\n');

  if (!options.noTui) {
    console.log('Installing with default options...');
    console.log('Use --no-tui for non-interactive mode.\n');
  }

  const result = await install(options);

  if (result.success) {
    console.log('Installation successful!\n');

    if (result.backupPath) {
      console.log(`Settings backup: ${result.backupPath}`);
    }

    if (result.mcpServerPath) {
      console.log(`MCP server path: ${result.mcpServerPath}`);
    }

    if (result.replacedMcpRegistration) {
      console.log('Existing llm-router-mcp registration was replaced.');
    }

    if (result.installedAgents.length > 0) {
      console.log(`\nInstalled agents (${result.installedAgents.length}):`);
      for (const agent of result.installedAgents) {
        console.log(`  - ${agent}`);
      }
    }

    if (result.installedCommands.length > 0) {
      console.log(`\nInstalled commands (${result.installedCommands.length}):`);
      for (const cmd of result.installedCommands) {
        console.log(`  - /${cmd}`);
      }
    }

    console.log('\nNext steps:');
    console.log('1. Restart Claude Code to load the MCP server');
    console.log('2. Run "custommcp doctor" to verify installation');
    console.log('3. Try using the installed agents and commands');
  } else {
    console.error(`Installation failed: ${result.message}`);
    if (result.errors.length > 0) {
      console.error('\nErrors:');
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }
}

/**
 * Handles uninstall command
 */
async function handleUninstall(): Promise<void> {
  console.log('\ncustommcp Uninstall');
  console.log('===================\n');

  const result = await uninstall();

  if (result.success) {
    console.log('Uninstall successful!');
    console.log('The MCP server has been removed from Claude Code settings.');
    console.log('Note: Agent and command files were not removed.');
  } else {
    console.error(`Uninstall failed: ${result.message}`);
    process.exit(1);
  }
}

/**
 * Handles doctor command
 */
async function handleDoctor(): Promise<void> {
  const report = await runDoctor();
  console.log(formatDoctorReport(report));

  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

/**
 * Handles update command
 */
async function handleUpdate(doUpdate: boolean = false): Promise<void> {
  const info = await checkForUpdates();
  console.log(formatUpdateInfo(info));

  if (doUpdate && info.hasUpdate) {
    console.log('\nPerforming update...\n');
    const result = await performUpdate();

    if (result.success) {
      console.log(`Updated from ${result.previousVersion} to ${result.newVersion}`);
    } else {
      console.error(`Update failed: ${result.message}`);
      process.exit(1);
    }
  }
}

/**
 * Handles enable command
 */
function handleEnable(): void {
  const result = ConfigManager.setMcpServerEnabled(true);

  if (result) {
    console.log('MCP server enabled');
  } else {
    console.error('MCP server is not registered. Run "custommcp install" first.');
    process.exit(1);
  }
}

/**
 * Handles disable command
 */
function handleDisable(): void {
  const result = ConfigManager.setMcpServerEnabled(false);

  if (result) {
    console.log('MCP server disabled');
  } else {
    console.error('MCP server is not registered.');
    process.exit(1);
  }
}

/**
 * Handles status command
 */
function handleStatus(): void {
  const status = getInstallationStatus();

  console.log('\ncustommcp Status');
  console.log('================\n');

  console.log(`Installed: ${status.installed ? 'Yes' : 'No'}`);
  console.log(`MCP Registered: ${status.mcpRegistered ? 'Yes' : 'No'}`);
  console.log('');
  console.log('Directories:');
  console.log(`  ~/.claude/: ${status.directories.claudeDir ? 'Exists' : 'Missing'}`);
  console.log(`  settings.json: ${status.directories.settings ? 'Exists' : 'Missing'}`);
  console.log(`  agents/: ${status.directories.agents ? 'Exists' : 'Missing'}`);
  console.log(`  commands/: ${status.directories.commands ? 'Exists' : 'Missing'}`);
  console.log('');
  console.log(`Agents: ${status.agentCount}`);
  console.log(`Commands: ${status.commandCount}`);

  if (!status.installed) {
    console.log('\nRun "custommcp install" to set up custommcp.');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  try {
    switch (command) {
      case 'install':
      case 'i':
        await handleInstall(options);
        break;

      case 'uninstall':
      case 'remove':
        await handleUninstall();
        break;

      case 'doctor':
      case 'd':
        await handleDoctor();
        break;

      case 'update':
      case 'u':
        await handleUpdate(args.includes('--yes') || args.includes('-y'));
        break;

      case 'enable':
        handleEnable();
        break;

      case 'disable':
        handleDisable();
        break;

      case 'status':
      case 's':
        handleStatus();
        break;

      case 'help':
      case '-h':
      case '--help':
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err}`);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

export { main };
