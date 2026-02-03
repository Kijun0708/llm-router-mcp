// src/services/background-manager.ts

import { BackgroundTask } from '../types.js';
import { callExpertWithFallback } from './expert-router.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { experts } from '../experts/index.js';
import crypto from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Persistence Configuration
// ============================================================================

/** 영속성 저장 경로 */
const DATA_DIR = join(process.cwd(), '.llm-router-data');
const TASKS_FILE = join(DATA_DIR, 'background-tasks.json');
const QUEUE_FILE = join(DATA_DIR, 'pending-queue.json');

/** 자동 저장 간격 (ms) */
const AUTO_SAVE_INTERVAL = 5000;

/** 최대 복원 가능 작업 나이 (ms) - 1시간 */
const MAX_RECOVERABLE_AGE = 3600000;

// ============================================================================
// Persistence Types
// ============================================================================

interface PersistedTask extends Omit<BackgroundTask, 'startedAt' | 'completedAt'> {
  startedAt: string; // ISO string
  completedAt?: string;
}

interface PersistedQueueItem {
  taskId: string;
  expertId: string;
  model: string;
  prompt: string;
  context?: string;
}

interface PersistenceState {
  tasks: Record<string, PersistedTask>;
  savedAt: string;
}

// ============================================================================
// Storage
// ============================================================================

// 백그라운드 작업 저장소
const tasks = new Map<string, BackgroundTask>();

// 동시성 제어
const runningByProvider = new Map<string, number>();
const runningByModel = new Map<string, number>();

// 자동 저장 타이머
let autoSaveTimer: NodeJS.Timeout | null = null;
let isDirty = false;

// ============================================================================
// Persistence Functions
// ============================================================================

/**
 * 데이터 디렉토리 확인/생성
 */
function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    logger.debug({ path: DATA_DIR }, 'Created data directory');
  }
}

/**
 * 작업 상태를 파일에 저장
 */
function saveTasks(): void {
  try {
    ensureDataDir();

    const tasksObj: Record<string, PersistedTask> = {};
    for (const [id, task] of tasks) {
      tasksObj[id] = {
        ...task,
        startedAt: task.startedAt.toISOString(),
        completedAt: task.completedAt?.toISOString()
      };
    }

    const state: PersistenceState = {
      tasks: tasksObj,
      savedAt: new Date().toISOString()
    };

    writeFileSync(TASKS_FILE, JSON.stringify(state, null, 2), 'utf-8');
    isDirty = false;
    logger.debug({ taskCount: tasks.size }, 'Tasks saved to disk');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to save tasks');
  }
}

/**
 * 대기 큐를 파일에 저장
 */
function saveQueue(queue: PersistedQueueItem[]): void {
  try {
    ensureDataDir();
    writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
    logger.debug({ queueLength: queue.length }, 'Queue saved to disk');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to save queue');
  }
}

/**
 * 파일에서 작업 상태 복원
 */
function loadTasks(): void {
  try {
    if (!existsSync(TASKS_FILE)) {
      logger.debug('No persisted tasks file found');
      return;
    }

    const content = readFileSync(TASKS_FILE, 'utf-8');
    const state: PersistenceState = JSON.parse(content);
    const now = Date.now();

    let restoredCount = 0;
    let skippedCount = 0;

    for (const [id, persisted] of Object.entries(state.tasks)) {
      const startedAt = new Date(persisted.startedAt);
      const age = now - startedAt.getTime();

      // 너무 오래된 작업은 복원하지 않음
      if (age > MAX_RECOVERABLE_AGE) {
        skippedCount++;
        continue;
      }

      // running 상태였던 작업은 pending으로 복원 (재실행 필요)
      const status = persisted.status === 'running' ? 'pending' : persisted.status;

      const task: BackgroundTask = {
        id: persisted.id,
        expert: persisted.expert,
        status,
        result: persisted.result,
        error: persisted.error,
        startedAt,
        completedAt: persisted.completedAt ? new Date(persisted.completedAt) : undefined
      };

      tasks.set(id, task);
      restoredCount++;
    }

    logger.info({ restoredCount, skippedCount }, 'Tasks restored from disk');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to load tasks');
  }
}

/**
 * 파일에서 대기 큐 복원
 */
function loadQueue(): PersistedQueueItem[] {
  try {
    if (!existsSync(QUEUE_FILE)) {
      return [];
    }

    const content = readFileSync(QUEUE_FILE, 'utf-8');
    const queue: PersistedQueueItem[] = JSON.parse(content);
    logger.info({ queueLength: queue.length }, 'Queue restored from disk');
    return queue;
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to load queue');
    return [];
  }
}

/**
 * 변경 사항 표시 (지연 저장용)
 */
function markDirty(): void {
  isDirty = true;
}

/**
 * 자동 저장 시작
 */
function startAutoSave(): void {
  if (autoSaveTimer) return;

  autoSaveTimer = setInterval(() => {
    if (isDirty) {
      saveTasks();
    }
  }, AUTO_SAVE_INTERVAL);

  logger.debug('Auto-save started');
}

/**
 * 자동 저장 중지
 */
function stopAutoSave(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    // 마지막 저장
    if (isDirty) {
      saveTasks();
    }
    logger.debug('Auto-save stopped');
  }
}

// ============================================================================
// Initialize: Load persisted state on module load
// ============================================================================

loadTasks();
startAutoSave();

function getProvider(model: string): string {
  if (model.includes('gpt') || model.includes('openai')) return 'openai';
  if (model.includes('claude') || model.includes('anthropic')) return 'anthropic';
  return 'google';
}

function canStartTask(model: string): boolean {
  const provider = getProvider(model);

  // 모델별 한도 체크
  const modelLimit = config.concurrency.byModel[model] || Infinity;
  const modelRunning = runningByModel.get(model) || 0;
  if (modelRunning >= modelLimit) return false;

  // 프로바이더별 한도 체크
  const providerLimit = config.concurrency.byProvider[provider] || config.concurrency.default;
  const providerRunning = runningByProvider.get(provider) || 0;
  if (providerRunning >= providerLimit) return false;

  return true;
}

function incrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, (runningByModel.get(model) || 0) + 1);
  runningByProvider.set(provider, (runningByProvider.get(provider) || 0) + 1);
}

function decrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, Math.max(0, (runningByModel.get(model) || 1) - 1));
  runningByProvider.set(provider, Math.max(0, (runningByProvider.get(provider) || 1) - 1));
}

// 대기 큐 (초기화 시 파일에서 복원)
const pendingQueue: Array<{
  taskId: string;
  expertId: string;
  model: string;
  prompt: string;
  context?: string;
}> = loadQueue();

function processQueue(): void {
  let processed = false;

  while (pendingQueue.length > 0) {
    const next = pendingQueue[0];
    if (!canStartTask(next.model)) break;

    pendingQueue.shift();
    processed = true;
    executeTask(next.taskId, next.expertId, next.prompt, next.context);
  }

  // 큐 변경 시 저장
  if (processed) {
    saveQueue(pendingQueue);
  }
}

async function executeTask(
  taskId: string,
  expertId: string,
  prompt: string,
  context?: string
): Promise<void> {
  const task = tasks.get(taskId);
  if (!task || task.status === 'cancelled') return;

  const expert = experts[expertId];
  const model = expert?.model || 'gemini-3.0-flash';
  incrementRunning(model);

  task.status = 'running';
  tasks.set(taskId, task);
  markDirty(); // 상태 변경 저장 예약

  logger.info({ taskId, expertId }, 'Background task started');

  try {
    const result = await callExpertWithFallback(expertId, prompt, context);

    const updatedTask: BackgroundTask = {
      ...task,
      status: 'completed',
      result: result.response,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);
    markDirty(); // 상태 변경 저장 예약

    logger.info({ taskId, expertId, latencyMs: result.latencyMs }, 'Background task completed');
  } catch (error) {
    const updatedTask: BackgroundTask = {
      ...task,
      status: 'failed',
      error: (error as Error).message,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);
    markDirty(); // 상태 변경 저장 예약

    logger.error({ taskId, expertId, error: (error as Error).message }, 'Background task failed');
  } finally {
    decrementRunning(model);
    processQueue();
  }
}

export function startBackgroundTask(
  expertId: string,
  prompt: string,
  context?: string,
  taskId?: string
): BackgroundTask {
  const id = taskId || crypto.randomUUID();

  const task: BackgroundTask = {
    id,
    expert: expertId,
    status: 'pending',
    startedAt: new Date()
  };

  tasks.set(id, task);
  markDirty(); // 새 작업 저장 예약

  const expert = experts[expertId];
  const model = expert?.model || 'gemini-3.0-flash';

  if (canStartTask(model)) {
    executeTask(id, expertId, prompt, context);
  } else {
    pendingQueue.push({ taskId: id, expertId, model, prompt, context });
    saveQueue(pendingQueue); // 큐 변경 즉시 저장
    logger.debug({ taskId: id }, 'Task queued, waiting for capacity');
  }

  return task;
}

export function getTaskStatus(taskId: string): BackgroundTask | null {
  return tasks.get(taskId) || null;
}

export function getTaskResult(taskId: string): { status: string; result?: string; error?: string } {
  const task = tasks.get(taskId);
  if (!task) {
    return { status: 'not_found' };
  }

  return {
    status: task.status,
    result: task.result,
    error: task.error
  };
}

export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;

  if (task.status === 'pending' || task.status === 'running') {
    task.status = 'cancelled';
    task.completedAt = new Date();
    tasks.set(taskId, task);
    markDirty(); // 상태 변경 저장 예약

    // 대기 큐에서 제거
    const queueIndex = pendingQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex !== -1) {
      pendingQueue.splice(queueIndex, 1);
      saveQueue(pendingQueue); // 큐 변경 즉시 저장
    }

    logger.info({ taskId }, 'Task cancelled');
    return true;
  }

  return false;
}

export function listTasks(status?: BackgroundTask['status']): BackgroundTask[] {
  const allTasks = Array.from(tasks.values());
  if (status) {
    return allTasks.filter(t => t.status === status);
  }
  return allTasks;
}

export function cleanupOldTasks(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [taskId, task] of tasks) {
    const taskAge = now - task.startedAt.getTime();
    if (taskAge > maxAgeMs && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
      tasks.delete(taskId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    markDirty(); // 정리 후 저장 예약
    logger.info({ cleaned }, 'Old tasks cleaned up');
  }

  return cleaned;
}

export function getStats() {
  const allTasks = Array.from(tasks.values());
  return {
    total: allTasks.length,
    pending: allTasks.filter(t => t.status === 'pending').length,
    running: allTasks.filter(t => t.status === 'running').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
    failed: allTasks.filter(t => t.status === 'failed').length,
    cancelled: allTasks.filter(t => t.status === 'cancelled').length,
    queueLength: pendingQueue.length,
    concurrency: {
      byProvider: Object.fromEntries(runningByProvider),
      byModel: Object.fromEntries(runningByModel)
    },
    persistence: {
      dataDir: DATA_DIR,
      autoSaveInterval: AUTO_SAVE_INTERVAL,
      isDirty
    }
  };
}

/**
 * 즉시 저장 (graceful shutdown 등에서 사용)
 */
export function saveNow(): void {
  saveTasks();
  saveQueue(pendingQueue);
}

/**
 * 영속성 종료 (프로세스 종료 시 호출)
 */
export function shutdownPersistence(): void {
  stopAutoSave();
  saveNow();
  logger.info('Background manager persistence shutdown complete');
}
