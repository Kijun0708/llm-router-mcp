// src/hooks/builtin/context-window-monitor.ts

/**
 * Context Window Monitor Hook
 *
 * Monitors token usage and warns when approaching context limits.
 * Tracks cumulative token usage across expert calls and tool results.
 *
 * Features:
 * - Tracks estimated token count per interaction
 * - Warns at configurable threshold (default: 70%)
 * - Provides context usage statistics
 * - Recommends compaction when limits approach
 */

import {
  HookDefinition,
  HookResult,
  OnExpertResultContext,
  OnToolResultContext,
  OnWorkflowStartContext,
  OnWorkflowEndContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Context window limits by model (approximate tokens)
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude models
  'claude-opus-4-5': 200000,
  'claude-sonnet-4-5': 200000,
  'claude-haiku-3-5': 200000,
  'claude-sonnet-4-5-20250929': 200000,

  // GPT models
  'gpt-5.4': 1000000,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,

  // Gemini models
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-3.0-pro': 2000000,
  'gemini-3.0-flash': 1000000,
  'gemini-3.1-pro-preview': 2000000,
  'gemini-3-flash-preview': 1000000,

  // Default
  'default': 100000
};

/**
 * Configuration for context monitor
 */
interface ContextMonitorConfig {
  /** Warning threshold as percentage (0-1) */
  warningThreshold: number;
  /** Critical threshold as percentage (0-1) */
  criticalThreshold: number;
  /** Characters per token estimate */
  charsPerToken: number;
  /** Whether to inject warning messages */
  injectWarnings: boolean;
}

const DEFAULT_CONFIG: ContextMonitorConfig = {
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  charsPerToken: 4,
  injectWarnings: true
};

/**
 * Context usage state
 */
interface ContextUsageState {
  /** Total estimated tokens used */
  totalTokens: number;
  /** Tokens from expert responses */
  expertTokens: number;
  /** Tokens from tool results */
  toolTokens: number;
  /** Number of interactions */
  interactionCount: number;
  /** Current session model (for limit calculation) */
  currentModel: string;
  /** Session start time */
  sessionStartTime: number;
  /** Last warning level */
  lastWarningLevel: 'none' | 'warning' | 'critical';
  /** Timestamps of warnings */
  warningHistory: string[];
}

// Global state
let contextState: ContextUsageState = {
  totalTokens: 0,
  expertTokens: 0,
  toolTokens: 0,
  interactionCount: 0,
  currentModel: 'default',
  sessionStartTime: Date.now(),
  lastWarningLevel: 'none',
  warningHistory: []
};

let config: ContextMonitorConfig = { ...DEFAULT_CONFIG };

/**
 * Estimates token count from text
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / config.charsPerToken);
}

/**
 * Gets context limit for a model
 */
function getContextLimit(model: string): number {
  // Try exact match first
  if (MODEL_CONTEXT_LIMITS[model]) {
    return MODEL_CONTEXT_LIMITS[model];
  }

  // Try partial match
  const modelLower = model.toLowerCase();
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelLower.includes(key) || key.includes(modelLower)) {
      return limit;
    }
  }

  return MODEL_CONTEXT_LIMITS['default'];
}

/**
 * Gets current usage percentage
 */
function getUsagePercentage(): number {
  const limit = getContextLimit(contextState.currentModel);
  return contextState.totalTokens / limit;
}

/**
 * Generates warning message based on usage level
 */
function generateWarningMessage(percentage: number): string | undefined {
  if (percentage >= config.criticalThreshold) {
    return `⚠️ **컨텍스트 윈도우 위험** (${(percentage * 100).toFixed(1)}%)\n\n` +
      `토큰 사용량이 임계치에 도달했습니다.\n` +
      `- 현재 사용: ~${contextState.totalTokens.toLocaleString()} 토큰\n` +
      `- 한계: ~${getContextLimit(contextState.currentModel).toLocaleString()} 토큰\n\n` +
      `**권장 조치:**\n` +
      `1. 현재 작업을 완료하고 새 세션 시작\n` +
      `2. 불필요한 컨텍스트 정리\n` +
      `3. 복잡한 작업은 여러 세션으로 분할`;
  }

  if (percentage >= config.warningThreshold) {
    return `⚡ **컨텍스트 윈도우 주의** (${(percentage * 100).toFixed(1)}%)\n\n` +
      `토큰 사용량이 ${(config.warningThreshold * 100)}%를 초과했습니다.\n` +
      `- 현재 사용: ~${contextState.totalTokens.toLocaleString()} 토큰\n\n` +
      `긴 작업은 단계별로 나누어 진행하세요.`;
  }

  return undefined;
}

/**
 * Resets context state (for new session/workflow)
 */
export function resetContextState(): void {
  contextState = {
    totalTokens: 0,
    expertTokens: 0,
    toolTokens: 0,
    interactionCount: 0,
    currentModel: contextState.currentModel,
    sessionStartTime: Date.now(),
    lastWarningLevel: 'none',
    warningHistory: []
  };
}

/**
 * Gets current context usage statistics
 */
export function getContextUsageStats(): {
  totalTokens: number;
  expertTokens: number;
  toolTokens: number;
  interactionCount: number;
  usagePercentage: number;
  limit: number;
  model: string;
  warningLevel: 'none' | 'warning' | 'critical';
  sessionDurationMs: number;
} {
  const percentage = getUsagePercentage();
  return {
    ...contextState,
    usagePercentage: percentage,
    limit: getContextLimit(contextState.currentModel),
    model: contextState.currentModel,
    warningLevel: percentage >= config.criticalThreshold ? 'critical' :
                  percentage >= config.warningThreshold ? 'warning' : 'none',
    sessionDurationMs: Date.now() - contextState.sessionStartTime
  };
}

/**
 * Updates configuration
 */
export function updateContextMonitorConfig(newConfig: Partial<ContextMonitorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Hook: Monitor expert result token usage
 */
const monitorExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin_context_monitor_expert',
  name: 'Context Monitor (Expert)',
  description: 'Tracks token usage from expert responses',
  eventType: 'onExpertResult',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Update model
    contextState.currentModel = context.model || contextState.currentModel;

    // Estimate tokens from response
    const responseTokens = estimateTokens(context.response);
    contextState.expertTokens += responseTokens;
    contextState.totalTokens += responseTokens;
    contextState.interactionCount++;

    // Check usage level
    const percentage = getUsagePercentage();
    const currentLevel = percentage >= config.criticalThreshold ? 'critical' :
                        percentage >= config.warningThreshold ? 'warning' : 'none';

    // Log usage
    logger.debug({
      expertId: context.expertId,
      responseTokens,
      totalTokens: contextState.totalTokens,
      usagePercentage: (percentage * 100).toFixed(1) + '%'
    }, '[Context Monitor] Expert response tracked');

    // Generate warning if level changed
    if (config.injectWarnings && currentLevel !== 'none' && currentLevel !== contextState.lastWarningLevel) {
      contextState.lastWarningLevel = currentLevel;
      contextState.warningHistory.push(new Date().toISOString());

      const warningMessage = generateWarningMessage(percentage);
      if (warningMessage) {
        logger.warn({ percentage: (percentage * 100).toFixed(1) + '%' }, '[Context Monitor] Usage warning');
        return {
          decision: 'continue',
          injectMessage: warningMessage,
          metadata: { contextUsage: percentage }
        };
      }
    }

    return { decision: 'continue', metadata: { contextUsage: percentage } };
  }
};

/**
 * Hook: Monitor tool result token usage
 */
const monitorToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_context_monitor_tool',
  name: 'Context Monitor (Tool)',
  description: 'Tracks token usage from tool results',
  eventType: 'onToolResult',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Estimate tokens from result
    const resultText = typeof context.toolResult === 'string'
      ? context.toolResult
      : JSON.stringify(context.toolResult);
    const resultTokens = estimateTokens(resultText);

    contextState.toolTokens += resultTokens;
    contextState.totalTokens += resultTokens;

    // Log for debugging
    logger.debug({
      tool: context.toolName,
      resultTokens,
      totalTokens: contextState.totalTokens
    }, '[Context Monitor] Tool result tracked');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Reset context on workflow start
 */
const monitorWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin_context_monitor_workflow_start',
  name: 'Context Monitor (Workflow Start)',
  description: 'Optionally resets context tracking on new workflow',
  eventType: 'onWorkflowStart',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Log current state before potential reset
    logger.info({
      currentTokens: contextState.totalTokens,
      interactionCount: contextState.interactionCount,
      request: context.request.substring(0, 100)
    }, '[Context Monitor] Workflow started');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Log context usage on workflow end
 */
const monitorWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin_context_monitor_workflow_end',
  name: 'Context Monitor (Workflow End)',
  description: 'Logs context usage summary when workflow ends',
  eventType: 'onWorkflowEnd',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    const stats = getContextUsageStats();

    logger.info({
      totalTokens: stats.totalTokens,
      expertTokens: stats.expertTokens,
      toolTokens: stats.toolTokens,
      usagePercentage: (stats.usagePercentage * 100).toFixed(1) + '%',
      interactionCount: stats.interactionCount,
      workflowSuccess: context.success
    }, '[Context Monitor] Workflow ended - usage summary');

    return { decision: 'continue', metadata: { contextStats: stats } };
  }
};

/**
 * Registers all context monitor hooks
 */
export function registerContextMonitorHooks(): void {
  registerHook(monitorExpertResultHook);
  registerHook(monitorToolResultHook);
  registerHook(monitorWorkflowStartHook);
  registerHook(monitorWorkflowEndHook);

  logger.debug('Context Monitor hooks registered');
}

export default {
  registerContextMonitorHooks,
  getContextUsageStats,
  resetContextState,
  updateContextMonitorConfig
};
