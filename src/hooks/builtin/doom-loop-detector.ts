// src/hooks/builtin/doom-loop-detector.ts

/**
 * Doom Loop Detector Hook
 *
 * Detects and breaks infinite loops in AI agent execution.
 * Prevents the agent from getting stuck in repetitive patterns.
 *
 * Detection strategies:
 * - Repeated tool calls with same/similar inputs
 * - Circular error-retry patterns
 * - Excessive calls within time window
 * - Similar output patterns
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext,
  OnErrorContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Record of a tool call for pattern detection
 */
interface ToolCallRecord {
  toolName: string;
  inputHash: string;
  timestamp: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * Doom loop detection configuration
 */
interface DoomLoopConfig {
  /** Whether detection is enabled */
  enabled: boolean;
  /** Maximum identical calls before triggering */
  maxIdenticalCalls: number;
  /** Time window for detection (ms) */
  detectionWindowMs: number;
  /** Maximum total calls in window */
  maxCallsInWindow: number;
  /** Similarity threshold for fuzzy matching (0-1) */
  similarityThreshold: number;
  /** Whether to auto-break loops */
  autoBreak: boolean;
  /** Cooldown after breaking a loop (ms) */
  breakCooldownMs: number;
  /** Maximum consecutive errors */
  maxConsecutiveErrors: number;
}

/**
 * Doom loop detection statistics
 */
interface DoomLoopStats {
  totalDetections: number;
  loopsBroken: number;
  detectionsByType: Record<string, number>;
  lastDetection?: {
    type: string;
    toolName: string;
    timestamp: number;
  };
  currentPatternLength: number;
}

// ============================================================================
// Constants
// ============================================================================

/** 히스토리 최대 크기 (메모리 보호) */
const MAX_HISTORY_SIZE = 100;

/** 유사도 검사 시 최근 N개만 검사 (성능 최적화) */
const SIMILARITY_CHECK_LIMIT = 20;

/** 히스토리 정리 주기 (매 N번째 호출마다) */
const CLEANUP_INTERVAL = 10;

// ============================================================================
// State
// ============================================================================

let config: DoomLoopConfig = {
  enabled: true,
  maxIdenticalCalls: 3,
  detectionWindowMs: 60000, // 1 minute
  maxCallsInWindow: 20,
  similarityThreshold: 0.9,
  autoBreak: true,
  breakCooldownMs: 30000, // 30 seconds
  maxConsecutiveErrors: 5
};

let stats: DoomLoopStats = {
  totalDetections: 0,
  loopsBroken: 0,
  detectionsByType: {},
  currentPatternLength: 0
};

let callHistory: ToolCallRecord[] = [];
let consecutiveErrors = 0;
let lastBreakTime = 0;
let lastErrorToolName = '';
let callCount = 0; // 정리 주기 추적용

// ============================================================================
// Hash & Similarity Functions (Optimized)
// ============================================================================

/**
 * JSON 객체의 키를 정렬하여 정규화 (해시 일관성 보장)
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Generates a normalized hash of tool input for comparison
 * (키 순서와 관계없이 동일한 해시 생성)
 */
function hashInput(input: unknown): string {
  try {
    const normalized = sortObjectKeys(input);
    return JSON.stringify(normalized);
  } catch {
    return String(input);
  }
}

/**
 * Calculates similarity between two strings (optimized Jaccard)
 * - 긴 문자열은 토큰 수 제한으로 성능 보호
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  // 토큰 수 제한 (긴 입력 성능 보호)
  const MAX_TOKENS = 100;
  const tokensA = a.split(/\s+/).slice(0, MAX_TOKENS);
  const tokensB = b.split(/\s+/).slice(0, MAX_TOKENS);

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ============================================================================
// History Management (Memory Optimized)
// ============================================================================

/**
 * Cleans old records from history (시간 기반 + 크기 기반)
 * - 시간창 초과 레코드 제거
 * - 최대 크기 초과 시 오래된 것부터 제거
 */
function cleanHistory(): void {
  const now = Date.now();
  const cutoff = now - config.detectionWindowMs;

  // 시간창 기반 정리 (최적화: 앞에서부터 찾아서 splice)
  let removeCount = 0;
  for (let i = 0; i < callHistory.length; i++) {
    if (callHistory[i].timestamp > cutoff) {
      break;
    }
    removeCount++;
  }

  if (removeCount > 0) {
    callHistory.splice(0, removeCount);
  }

  // 최대 크기 제한 (추가 안전장치)
  if (callHistory.length > MAX_HISTORY_SIZE) {
    const excessCount = callHistory.length - MAX_HISTORY_SIZE;
    callHistory.splice(0, excessCount);
    logger.debug({ removed: excessCount }, 'History trimmed due to max size');
  }
}

/**
 * 주기적 정리 트리거 (매 호출마다 실행하지 않음)
 */
function maybeCleanHistory(): void {
  callCount++;
  if (callCount % CLEANUP_INTERVAL === 0) {
    cleanHistory();
  }
}

// ============================================================================
// Detection Functions (Optimized)
// ============================================================================

/**
 * Detects identical call patterns (시간창 내에서만 검사)
 */
function detectIdenticalCalls(toolName: string, inputHash: string): boolean {
  const now = Date.now();
  const cutoff = now - config.detectionWindowMs;

  let count = 0;
  // 역순 순회 (최신 것부터, 시간창 벗어나면 중단)
  for (let i = callHistory.length - 1; i >= 0; i--) {
    const record = callHistory[i];
    if (record.timestamp < cutoff) break; // 시간창 벗어남

    if (record.toolName === toolName && record.inputHash === inputHash) {
      count++;
      if (count >= config.maxIdenticalCalls) return true;
    }
  }

  return false;
}

/**
 * Detects similar call patterns (최근 N개만 검사, 성능 최적화)
 */
function detectSimilarCalls(toolName: string, inputHash: string): boolean {
  const now = Date.now();
  const cutoff = now - config.detectionWindowMs;

  // 최근 SIMILARITY_CHECK_LIMIT개만 검사 (성능 최적화)
  const startIdx = Math.max(0, callHistory.length - SIMILARITY_CHECK_LIMIT);
  let similarCount = 0;

  for (let i = callHistory.length - 1; i >= startIdx; i--) {
    const record = callHistory[i];
    if (record.timestamp < cutoff) break; // 시간창 벗어남

    if (record.toolName === toolName) {
      const similarity = calculateSimilarity(record.inputHash, inputHash);
      if (similarity >= config.similarityThreshold) {
        similarCount++;
        if (similarCount >= config.maxIdenticalCalls) return true;
      }
    }
  }

  return false;
}

/**
 * Detects excessive call volume (시간창 내 호출 수 검사)
 */
function detectExcessiveCalls(): boolean {
  const now = Date.now();
  const cutoff = now - config.detectionWindowMs;

  // 시간창 내 호출 수 계산 (역순 순회로 최적화)
  let count = 0;
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (callHistory[i].timestamp < cutoff) break;
    count++;
    if (count >= config.maxCallsInWindow) return true;
  }

  return false;
}

/**
 * Detects error loop (same tool failing repeatedly)
 */
function detectErrorLoop(toolName: string): boolean {
  if (toolName !== lastErrorToolName) {
    return false;
  }

  return consecutiveErrors >= config.maxConsecutiveErrors;
}

/**
 * Records a detection
 */
function recordDetection(type: string, toolName: string): void {
  stats.totalDetections++;
  stats.detectionsByType[type] = (stats.detectionsByType[type] || 0) + 1;
  stats.lastDetection = {
    type,
    toolName,
    timestamp: Date.now()
  };
}

/**
 * Generates break message
 */
function generateBreakMessage(type: string, toolName: string): string {
  const messages: Record<string, string> = {
    identical: `🔄 **무한 루프 감지**: \`${toolName}\`이(가) 동일한 입력으로 ${config.maxIdenticalCalls}회 이상 호출됨`,
    similar: `🔄 **패턴 루프 감지**: \`${toolName}\`이(가) 유사한 입력으로 반복 호출됨`,
    excessive: `⚠️ **과다 호출 감지**: ${config.detectionWindowMs / 1000}초 내 ${config.maxCallsInWindow}회 이상 호출됨`,
    error: `❌ **에러 루프 감지**: \`${toolName}\`이(가) ${config.maxConsecutiveErrors}회 연속 실패`
  };

  let message = messages[type] || `⚠️ 루프 감지: ${type}`;
  message += `\n\n**권장 조치**:\n`;
  message += `1. 다른 접근 방식을 시도해보세요\n`;
  message += `2. 입력 파라미터를 변경해보세요\n`;
  message += `3. 작업을 더 작은 단위로 분리해보세요\n`;

  return message;
}

/**
 * Checks if we're in cooldown period
 */
function isInCooldown(): boolean {
  return Date.now() - lastBreakTime < config.breakCooldownMs;
}

/**
 * Hook: Detect loops on tool call
 */
const detectOnToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:doom-loop-detector:on-tool-call',
  name: 'Doom Loop Detector (Tool Call)',
  description: 'Detects potential infinite loops before tool execution',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // 주기적 히스토리 정리 (매 호출이 아닌 N번째마다)
    maybeCleanHistory();

    const inputHash = hashInput(context.toolInput);
    let detectedType: string | null = null;

    // Check for identical calls
    if (detectIdenticalCalls(context.toolName, inputHash)) {
      detectedType = 'identical';
    }
    // Check for similar calls
    else if (detectSimilarCalls(context.toolName, inputHash)) {
      detectedType = 'similar';
    }
    // Check for excessive calls
    else if (detectExcessiveCalls()) {
      detectedType = 'excessive';
    }
    // Check for error loop
    else if (detectErrorLoop(context.toolName)) {
      detectedType = 'error';
    }

    if (detectedType) {
      recordDetection(detectedType, context.toolName);

      logger.warn({
        type: detectedType,
        tool: context.toolName,
        historySize: callHistory.length
      }, 'Doom loop detected');

      if (config.autoBreak && !isInCooldown()) {
        stats.loopsBroken++;
        lastBreakTime = Date.now();

        // Clear history to allow fresh start
        callHistory = [];
        consecutiveErrors = 0;

        return {
          decision: 'block',
          reason: generateBreakMessage(detectedType, context.toolName),
          metadata: { doomLoopDetected: true, type: detectedType }
        };
      }
    }

    // Record this call
    callHistory.push({
      toolName: context.toolName,
      inputHash,
      timestamp: Date.now(),
      success: true // Will be updated on result
    });

    stats.currentPatternLength = callHistory.length;

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track tool results for error pattern
 */
const trackToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:doom-loop-detector:track-result',
  name: 'Doom Loop Detector (Track Result)',
  description: 'Tracks tool results to detect error patterns',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Update last call record with success status
    const lastRecord = callHistory[callHistory.length - 1];
    if (lastRecord && lastRecord.toolName === context.toolName) {
      lastRecord.success = context.success;
    }

    // Reset consecutive errors on success
    if (context.success) {
      consecutiveErrors = 0;
      lastErrorToolName = '';
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track errors for error loop detection
 */
const trackErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:doom-loop-detector:track-error',
  name: 'Doom Loop Detector (Track Error)',
  description: 'Tracks errors to detect error loop patterns',
  eventType: 'onError',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Track consecutive errors from same source
    if (context.source === lastErrorToolName) {
      consecutiveErrors++;
    } else {
      consecutiveErrors = 1;
      lastErrorToolName = context.source;
    }

    // Update last call record
    const lastRecord = callHistory[callHistory.length - 1];
    if (lastRecord) {
      lastRecord.success = false;
      lastRecord.errorMessage = context.errorMessage;
    }

    logger.debug({
      source: context.source,
      consecutiveErrors,
      threshold: config.maxConsecutiveErrors
    }, 'Error tracked for doom loop detection');

    return { decision: 'continue' };
  }
};

/**
 * All doom loop detector hooks
 */
export const doomLoopDetectorHooks = [
  detectOnToolCallHook,
  trackToolResultHook,
  trackErrorHook
] as HookDefinition[];

/**
 * Registers doom loop detector hooks
 */
export function registerDoomLoopDetectorHooks(): void {
  for (const hook of doomLoopDetectorHooks) {
    registerHook(hook);
  }
  logger.debug('Doom loop detector hooks registered');
}

/**
 * Gets doom loop detector statistics
 */
export function getDoomLoopDetectorStats(): DoomLoopStats & {
  config: DoomLoopConfig;
  consecutiveErrors: number;
  historySize: number;
  memoryInfo: {
    maxHistorySize: number;
    currentSize: number;
    utilizationPercent: number;
  };
} {
  return {
    ...stats,
    config,
    consecutiveErrors,
    historySize: callHistory.length,
    memoryInfo: {
      maxHistorySize: MAX_HISTORY_SIZE,
      currentSize: callHistory.length,
      utilizationPercent: Math.round((callHistory.length / MAX_HISTORY_SIZE) * 100)
    }
  };
}

/**
 * Resets doom loop detector state
 */
export function resetDoomLoopDetectorState(): void {
  stats = {
    totalDetections: 0,
    loopsBroken: 0,
    detectionsByType: {},
    currentPatternLength: 0
  };
  callHistory = [];
  consecutiveErrors = 0;
  lastBreakTime = 0;
  lastErrorToolName = '';
  callCount = 0;
  logger.debug('Doom loop detector state reset');
}

/**
 * Updates doom loop detector configuration
 */
export function updateDoomLoopDetectorConfig(updates: Partial<DoomLoopConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Doom loop detector config updated');
}

/**
 * Manually breaks the current loop
 */
export function breakLoop(): void {
  callHistory = [];
  consecutiveErrors = 0;
  lastBreakTime = Date.now();
  stats.loopsBroken++;
  logger.info('Loop manually broken');
}

export default {
  registerDoomLoopDetectorHooks,
  getDoomLoopDetectorStats,
  resetDoomLoopDetectorState,
  updateDoomLoopDetectorConfig,
  breakLoop
};
