// src/cli/config-manager.ts

/**
 * Configuration Manager for custommcp CLI
 *
 * Manages Claude Code settings file and MCP server configuration.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import {
  ClaudeCodeSettings,
  McpServerConfig,
  CliConfig,
  SubscriptionType
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Path constants
 */
export const PATHS = {
  // Claude Code paths
  claudeDir: join(homedir(), '.claude'),
  claudeSettings: join(homedir(), '.claude', 'settings.json'),
  claudeAgents: join(homedir(), '.claude', 'agents'),
  claudeCommands: join(homedir(), '.claude', 'commands'),

  // OpenCode paths
  opencodeDir: join(homedir(), '.config', 'opencode'),
  opencodeAgents: join(homedir(), '.config', 'opencode', 'agents'),
  opencodeCommands: join(homedir(), '.config', 'opencode', 'command'),

  // CLI config
  cliConfig: join(homedir(), '.config', 'custommcp', 'config.json')
};

/**
 * MCP server name
 */
export const MCP_SERVER_NAME = 'llm-router-mcp';

/**
 * Resolves the MCP server entrypoint from the installed package location.
 *
 * In the published package this file runs from dist/cli/config-manager.js,
 * so ../index.js is the compiled MCP server entrypoint at dist/index.js.
 */
export function resolveDefaultMcpServerPath(): string {
  return process.env.CUSTOMMCP_PATH || join(__dirname, '..', 'index.js');
}

/**
 * Ensures a directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Reads JSON file safely
 */
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (!existsSync(filePath)) {
      return defaultValue;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Writes JSON file with pretty formatting
 */
function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Configuration Manager
 */
export class ConfigManager {
  /**
   * Reads Claude Code settings
   */
  static readClaudeSettings(): ClaudeCodeSettings {
    return readJsonFile<ClaudeCodeSettings>(PATHS.claudeSettings, {});
  }

  /**
   * Writes Claude Code settings
   */
  static writeClaudeSettings(settings: ClaudeCodeSettings): void {
    writeJsonFile(PATHS.claudeSettings, settings);
  }

  /**
   * Checks if MCP server is registered
   */
  static isMcpServerRegistered(): boolean {
    const settings = this.readClaudeSettings();
    return Boolean(settings.mcpServers?.[MCP_SERVER_NAME]);
  }

  /**
   * Gets MCP server configuration
   */
  static getMcpServerConfig(): McpServerConfig | null {
    const settings = this.readClaudeSettings();
    return settings.mcpServers?.[MCP_SERVER_NAME] || null;
  }

  /**
   * Registers MCP server in Claude Code settings
   */
  static registerMcpServer(config: McpServerConfig): void {
    const settings = this.readClaudeSettings();

    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    settings.mcpServers[MCP_SERVER_NAME] = config;
    this.writeClaudeSettings(settings);
  }

  /**
   * Unregisters MCP server from Claude Code settings
   */
  static unregisterMcpServer(): boolean {
    const settings = this.readClaudeSettings();

    if (!settings.mcpServers?.[MCP_SERVER_NAME]) {
      return false;
    }

    delete settings.mcpServers[MCP_SERVER_NAME];
    this.writeClaudeSettings(settings);
    return true;
  }

  /**
   * Enables or disables MCP server
   */
  static setMcpServerEnabled(enabled: boolean): boolean {
    const settings = this.readClaudeSettings();

    if (!settings.mcpServers?.[MCP_SERVER_NAME]) {
      return false;
    }

    settings.mcpServers[MCP_SERVER_NAME].disabled = !enabled;
    this.writeClaudeSettings(settings);
    return true;
  }

  /**
   * Gets default MCP server configuration
   */
  static getDefaultMcpConfig(): McpServerConfig {
    const serverPath = resolveDefaultMcpServerPath();

    return {
      command: 'node',
      args: [serverPath],
      env: {
        NODE_ENV: 'production'
      }
    };
  }

  /**
   * Reads CLI configuration
   */
  static readCliConfig(): CliConfig | null {
    return readJsonFile<CliConfig | null>(PATHS.cliConfig, null);
  }

  /**
   * Writes CLI configuration
   */
  static writeCliConfig(config: CliConfig): void {
    writeJsonFile(PATHS.cliConfig, config);
  }

  /**
   * Creates or updates CLI configuration
   */
  static saveCliConfig(subscriptions: SubscriptionType[]): CliConfig {
    const existingConfig = this.readCliConfig();

    const config: CliConfig = {
      version: existingConfig?.version || '2.0.0',
      subscriptions,
      installedAt: existingConfig?.installedAt || new Date().toISOString(),
      lastUpdateCheck: new Date().toISOString(),
      mcpServerPaths: {
        config: PATHS.claudeSettings,
        agents: PATHS.claudeAgents,
        commands: PATHS.claudeCommands
      }
    };

    this.writeCliConfig(config);
    return config;
  }

  /**
   * Checks if Claude Code directories exist
   */
  static checkClaudeCodeDirectories(): {
    claudeDir: boolean;
    settings: boolean;
    agents: boolean;
    commands: boolean;
  } {
    return {
      claudeDir: existsSync(PATHS.claudeDir),
      settings: existsSync(PATHS.claudeSettings),
      agents: existsSync(PATHS.claudeAgents),
      commands: existsSync(PATHS.claudeCommands)
    };
  }

  /**
   * Creates Claude Code directories if they don't exist
   */
  static ensureClaudeCodeDirectories(): void {
    ensureDir(PATHS.claudeDir);
    ensureDir(PATHS.claudeAgents);
    ensureDir(PATHS.claudeCommands);
  }

  /**
   * Creates OpenCode directories if they don't exist
   */
  static ensureOpenCodeDirectories(): void {
    ensureDir(PATHS.opencodeDir);
    ensureDir(PATHS.opencodeAgents);
    ensureDir(PATHS.opencodeCommands);
  }

  /**
   * Adds Bash permission to Claude Code settings
   */
  static addBashPermission(pattern: string): void {
    const settings = this.readClaudeSettings();

    if (!settings.permissions) {
      settings.permissions = { allow: [], deny: [] };
    }

    if (!settings.permissions.allow) {
      settings.permissions.allow = [];
    }

    if (!settings.permissions.allow.includes(pattern)) {
      settings.permissions.allow.push(pattern);
      this.writeClaudeSettings(settings);
    }
  }

  /**
   * Sets environment variable in Claude Code settings
   */
  static setEnvVar(key: string, value: string): void {
    const settings = this.readClaudeSettings();

    if (!settings.env) {
      settings.env = {};
    }

    settings.env[key] = value;
    this.writeClaudeSettings(settings);
  }

  /**
   * Gets all registered MCP servers
   */
  static getAllMcpServers(): Record<string, McpServerConfig> {
    const settings = this.readClaudeSettings();
    return settings.mcpServers || {};
  }

  /**
   * Backs up current settings
   */
  static backupSettings(): string | null {
    if (!existsSync(PATHS.claudeSettings)) {
      return null;
    }

    const backupPath = `${PATHS.claudeSettings}.backup.${Date.now()}`;
    const content = readFileSync(PATHS.claudeSettings, 'utf-8');
    writeFileSync(backupPath, content, 'utf-8');
    return backupPath;
  }

  /**
   * Restores settings from backup
   */
  static restoreSettings(backupPath: string): boolean {
    if (!existsSync(backupPath)) {
      return false;
    }

    const content = readFileSync(backupPath, 'utf-8');
    writeFileSync(PATHS.claudeSettings, content, 'utf-8');
    return true;
  }
}

export default ConfigManager;
