// src/features/boulder-state/storage.ts

/**
 * Boulder State Storage
 *
 * File-based persistence for Boulder State.
 * Handles reading, writing, and history management.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import {
  BoulderState,
  BoulderSummary,
  BoulderStateConfig,
  DEFAULT_BOULDER_CONFIG
} from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolves the full path for boulder state file.
 */
function resolveStatePath(directory: string, config: BoulderStateConfig): string {
  return join(directory, config.stateFilePath);
}

/**
 * Resolves the history directory path.
 */
function resolveHistoryDir(directory: string, config: BoulderStateConfig): string {
  return join(directory, config.historyDir);
}

/**
 * Ensures directory exists.
 */
function ensureDirectory(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Reads the current boulder state from disk.
 */
export function readBoulderState(
  directory: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): BoulderState | null {
  const statePath = resolveStatePath(directory, config);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as BoulderState;

    // Validate required fields
    if (!state.id || !state.request || !state.status || !state.currentPhase) {
      logger.warn({ statePath }, 'Invalid boulder state file - missing required fields');
      return null;
    }

    // Check version compatibility
    if (state.version !== config.stateVersion) {
      logger.warn({
        fileVersion: state.version,
        expectedVersion: config.stateVersion
      }, 'Boulder state version mismatch - migration may be needed');
    }

    return state;
  } catch (error) {
    logger.error({ error, statePath }, 'Failed to read boulder state');
    return null;
  }
}

/**
 * Writes boulder state to disk.
 */
export function writeBoulderState(
  directory: string,
  state: BoulderState,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): boolean {
  const statePath = resolveStatePath(directory, config);

  try {
    ensureDirectory(statePath);

    // Update timestamp
    state.updatedAt = new Date().toISOString();

    const content = JSON.stringify(state, null, 2);
    writeFileSync(statePath, content, 'utf-8');

    logger.debug({
      boulderId: state.id,
      status: state.status,
      phase: state.currentPhase
    }, 'Boulder state written');

    return true;
  } catch (error) {
    logger.error({ error, statePath }, 'Failed to write boulder state');
    return false;
  }
}

/**
 * Clears the current boulder state (deletes file).
 */
export function clearBoulderState(
  directory: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): boolean {
  const statePath = resolveStatePath(directory, config);

  if (!existsSync(statePath)) {
    return true;
  }

  try {
    unlinkSync(statePath);
    logger.debug({ statePath }, 'Boulder state cleared');
    return true;
  } catch (error) {
    logger.error({ error, statePath }, 'Failed to clear boulder state');
    return false;
  }
}

/**
 * Archives a completed boulder to history.
 */
export function archiveBoulder(
  directory: string,
  state: BoulderState,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): boolean {
  const historyDir = resolveHistoryDir(directory, config);

  try {
    ensureDirectory(join(historyDir, 'dummy'));

    // Create filename with timestamp and ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${state.id}.json`;
    const archivePath = join(historyDir, filename);

    // Set completion timestamp if not set
    if (!state.completedAt) {
      state.completedAt = new Date().toISOString();
    }

    // Calculate total time
    if (!state.totalTimeMs && state.createdAt) {
      state.totalTimeMs = Date.now() - new Date(state.createdAt).getTime();
    }

    const content = JSON.stringify(state, null, 2);
    writeFileSync(archivePath, content, 'utf-8');

    logger.info({
      boulderId: state.id,
      archivePath,
      status: state.status
    }, 'Boulder archived to history');

    // Cleanup old history
    cleanupHistory(directory, config);

    return true;
  } catch (error) {
    logger.error({ error, boulderId: state.id }, 'Failed to archive boulder');
    return false;
  }
}

/**
 * Cleans up old history files.
 */
function cleanupHistory(
  directory: string,
  config: BoulderStateConfig
): void {
  const historyDir = resolveHistoryDir(directory, config);

  if (!existsSync(historyDir)) {
    return;
  }

  try {
    const files = readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: join(historyDir, f),
        mtime: statSync(join(historyDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    const cutoffTime = Date.now() - config.historyRetentionMs;

    // Remove files beyond max count or older than retention
    files.forEach((file, index) => {
      if (index >= config.maxHistoryCount || file.mtime < cutoffTime) {
        try {
          unlinkSync(file.path);
          logger.debug({ file: file.name }, 'Removed old boulder history');
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup boulder history');
  }
}

/**
 * Lists all boulders in history.
 */
export function listBoulderHistory(
  directory: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): BoulderSummary[] {
  const historyDir = resolveHistoryDir(directory, config);
  const summaries: BoulderSummary[] = [];

  // Check current active boulder
  const currentBoulder = readBoulderState(directory, config);
  if (currentBoulder) {
    summaries.push(boulderToSummary(currentBoulder));
  }

  // List history
  if (!existsSync(historyDir)) {
    return summaries;
  }

  try {
    const files = readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse(); // Newest first

    for (const file of files.slice(0, 20)) { // Limit to 20
      try {
        const content = readFileSync(join(historyDir, file), 'utf-8');
        const state = JSON.parse(content) as BoulderState;
        summaries.push(boulderToSummary(state));
      } catch {
        // Skip invalid files
      }
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to list boulder history');
  }

  return summaries;
}

/**
 * Converts boulder state to summary.
 */
function boulderToSummary(state: BoulderState): BoulderSummary {
  return {
    id: state.id,
    status: state.status,
    requestPreview: state.request.length > 100
      ? state.request.substring(0, 100) + '...'
      : state.request,
    currentPhase: state.currentPhase,
    attemptsMade: state.implementationAttempts.length,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    escalationRequired: state.escalationRequired || false
  };
}

/**
 * Reads a specific boulder from history by ID.
 */
export function readBoulderFromHistory(
  directory: string,
  boulderId: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): BoulderState | null {
  // Check current first
  const current = readBoulderState(directory, config);
  if (current?.id === boulderId) {
    return current;
  }

  // Search history
  const historyDir = resolveHistoryDir(directory, config);
  if (!existsSync(historyDir)) {
    return null;
  }

  try {
    const files = readdirSync(historyDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      if (file.includes(boulderId)) {
        const content = readFileSync(join(historyDir, file), 'utf-8');
        return JSON.parse(content) as BoulderState;
      }
    }
  } catch (error) {
    logger.warn({ error, boulderId }, 'Failed to read boulder from history');
  }

  return null;
}

/**
 * Checks if there's an active or crashed boulder.
 */
export function hasActiveBoulder(
  directory: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): boolean {
  const state = readBoulderState(directory, config);
  return state !== null && (state.status === 'active' || state.status === 'crashed');
}

/**
 * Detects crashed boulder (incomplete state from previous run).
 */
export function detectCrashedBoulder(
  directory: string,
  config: BoulderStateConfig = DEFAULT_BOULDER_CONFIG
): BoulderState | null {
  const state = readBoulderState(directory, config);

  if (!state) {
    return null;
  }

  // If status is 'active' but we're checking on startup, it's a crash
  if (state.status === 'active') {
    // Mark as crashed
    state.status = 'crashed';
    writeBoulderState(directory, state, config);

    logger.info({
      boulderId: state.id,
      phase: state.currentPhase,
      attempts: state.implementationAttempts.length
    }, 'Detected crashed boulder from previous session');

    return state;
  }

  // Return if already marked as crashed
  if (state.status === 'crashed') {
    return state;
  }

  return null;
}
