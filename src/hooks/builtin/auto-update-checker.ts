// src/hooks/builtin/auto-update-checker.ts

/**
 * Auto Update Checker Hook
 *
 * Checks for updates to LLM Router MCP and notifies users.
 * Runs periodically and on server start.
 *
 * Features:
 * - Version comparison
 * - Changelog fetching
 * - Non-intrusive notifications
 * - Update command suggestion
 */

import {
  HookDefinition,
  HookResult,
  OnServerStartContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import * as https from 'https';

/**
 * Version information
 */
interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  changelog?: string;
  publishedAt?: string;
}

/**
 * Auto update checker configuration
 */
interface AutoUpdateCheckerConfig {
  /** Whether update checking is enabled */
  enabled: boolean;
  /** Current version */
  currentVersion: string;
  /** GitHub repository for update checks */
  repository: string;
  /** Check interval in ms (default: 24 hours) */
  checkIntervalMs: number;
  /** Show notification in response */
  showNotification: boolean;
  /** Include changelog in notification */
  includeChangelog: boolean;
  /** Max changelog length to show */
  maxChangelogLength: number;
}

/**
 * Auto update checker statistics
 */
interface AutoUpdateCheckerStats {
  totalChecks: number;
  updatesFound: number;
  lastCheckTime?: number;
  lastVersionInfo?: VersionInfo;
  checkErrors: number;
}

// State
let config: AutoUpdateCheckerConfig = {
  enabled: true,
  currentVersion: '1.0.0', // Will be updated from package.json
  repository: 'Kijun0708/llm-router-mcp',
  checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  showNotification: true,
  includeChangelog: true,
  maxChangelogLength: 500
};

let stats: AutoUpdateCheckerStats = {
  totalChecks: 0,
  updatesFound: 0,
  checkErrors: 0
};

let lastCheckTime = 0;

/**
 * Fetches latest release info from GitHub
 */
async function fetchLatestRelease(): Promise<VersionInfo | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${config.repository}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'LLM-Router-MCP-UpdateChecker',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            logger.debug({ statusCode: res.statusCode }, 'GitHub API non-200 response');
            resolve(null);
            return;
          }

          const release = JSON.parse(data);
          const latestVersion = release.tag_name?.replace(/^v/, '') || release.name;

          const versionInfo: VersionInfo = {
            current: config.currentVersion,
            latest: latestVersion,
            hasUpdate: compareVersions(latestVersion, config.currentVersion) > 0,
            releaseUrl: release.html_url,
            changelog: release.body?.substring(0, config.maxChangelogLength),
            publishedAt: release.published_at
          };

          resolve(versionInfo);
        } catch (error: any) {
          logger.debug({ error: error.message }, 'Failed to parse GitHub release');
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      logger.debug({ error: error.message }, 'GitHub API request failed');
      resolve(null);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * Compares semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Generates update notification message
 */
function generateUpdateNotification(info: VersionInfo): string {
  let message = `\n📦 **Update Available**\n\n`;
  message += `| Item | Value |\n`;
  message += `|------|-------|\n`;
  message += `| Current | v${info.current} |\n`;
  message += `| Latest | v${info.latest} |\n`;

  if (info.publishedAt) {
    const date = new Date(info.publishedAt).toLocaleDateString();
    message += `| Released | ${date} |\n`;
  }

  message += '\n';

  if (config.includeChangelog && info.changelog) {
    message += `**Changelog:**\n`;
    message += `\`\`\`\n${info.changelog}\n\`\`\`\n\n`;
  }

  if (info.releaseUrl) {
    message += `[View Release](${info.releaseUrl})\n\n`;
  }

  message += `**Update command:**\n`;
  message += `\`\`\`bash\nnpm update llm-router-mcp\n\`\`\`\n`;

  return message;
}

/**
 * Checks for updates
 */
async function checkForUpdates(): Promise<VersionInfo | null> {
  const now = Date.now();

  // Rate limiting
  if (now - lastCheckTime < config.checkIntervalMs) {
    logger.debug('Skipping update check (rate limited)');
    return stats.lastVersionInfo || null;
  }

  stats.totalChecks++;
  lastCheckTime = now;
  stats.lastCheckTime = now;

  try {
    const info = await fetchLatestRelease();

    if (info) {
      stats.lastVersionInfo = info;

      if (info.hasUpdate) {
        stats.updatesFound++;
        logger.info({
          current: info.current,
          latest: info.latest
        }, 'Update available');
      } else {
        logger.debug('No updates available');
      }

      return info;
    } else {
      stats.checkErrors++;
      return null;
    }
  } catch (error: any) {
    stats.checkErrors++;
    logger.warn({ error: error.message }, 'Update check failed');
    return null;
  }
}

/**
 * Hook: Check for updates on server start
 */
const checkUpdatesOnStartHook: HookDefinition<OnServerStartContext> = {
  id: 'builtin:auto-update-checker:on-start',
  name: 'Auto Update Checker (On Start)',
  description: 'Checks for updates when server starts',
  eventType: 'onServerStart',
  priority: 'low',
  enabled: true,

  handler: async (): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const info = await checkForUpdates();

    if (info?.hasUpdate && config.showNotification) {
      const notification = generateUpdateNotification(info);

      return {
        decision: 'continue',
        injectMessage: notification,
        metadata: {
          updateAvailable: true,
          currentVersion: info.current,
          latestVersion: info.latest
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All auto update checker hooks
 */
export const autoUpdateCheckerHooks = [
  checkUpdatesOnStartHook
] as HookDefinition[];

/**
 * Registers auto update checker hooks
 */
export function registerAutoUpdateCheckerHooks(): void {
  for (const hook of autoUpdateCheckerHooks) {
    registerHook(hook);
  }
  logger.debug('Auto update checker hooks registered');
}

/**
 * Gets auto update checker statistics
 */
export function getAutoUpdateCheckerStats(): AutoUpdateCheckerStats & {
  config: AutoUpdateCheckerConfig;
} {
  return {
    ...stats,
    config
  };
}

/**
 * Resets auto update checker state
 */
export function resetAutoUpdateCheckerState(): void {
  stats = {
    totalChecks: 0,
    updatesFound: 0,
    checkErrors: 0
  };
  lastCheckTime = 0;
}

/**
 * Updates auto update checker configuration
 */
export function updateAutoUpdateCheckerConfig(updates: Partial<AutoUpdateCheckerConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Auto update checker config updated');
}

/**
 * Manually triggers an update check
 */
export async function manualUpdateCheck(): Promise<VersionInfo | null> {
  // Force check by resetting last check time
  lastCheckTime = 0;
  return checkForUpdates();
}

/**
 * Gets last version info
 */
export function getLastVersionInfo(): VersionInfo | null {
  return stats.lastVersionInfo || null;
}

export default {
  registerAutoUpdateCheckerHooks,
  getAutoUpdateCheckerStats,
  resetAutoUpdateCheckerState,
  updateAutoUpdateCheckerConfig,
  manualUpdateCheck,
  getLastVersionInfo
};
