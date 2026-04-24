// src/hooks/builtin/tool-output-truncator.ts

/**
 * Tool Output Truncator Hook
 *
 * Dynamically truncates tool output based on remaining context window.
 * Prevents context overflow by intelligently limiting response sizes.
 *
 * Features:
 * - Estimates remaining context capacity
 * - Truncates large outputs with summary
 * - Preserves important parts (start/end)
 * - Adds truncation notices
 */

import {
  HookDefinition,
  HookResult,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { getContextUsageStats } from './context-window-monitor.js';

/**
 * Configuration for output truncator
 */
interface TruncatorConfig {
  /** Maximum output length in characters (default fallback) */
  maxOutputLength: number;
  /** Minimum output length to preserve */
  minOutputLength: number;
  /** Percentage of context to reserve for response */
  responseReserve: number;
  /** Characters per token estimate */
  charsPerToken: number;
  /** Whether to show truncation notice */
  showTruncationNotice: boolean;
  /** Percentage of truncated content to show from start */
  startPercentage: number;
  /** Percentage of truncated content to show from end */
  endPercentage: number;
  /** Tools to exclude from truncation */
  excludeTools: string[];
}

const DEFAULT_CONFIG: TruncatorConfig = {
  maxOutputLength: 50000,
  minOutputLength: 1000,
  responseReserve: 0.3, // Reserve 30% for response
  charsPerToken: 4,
  showTruncationNotice: true,
  startPercentage: 0.6,
  endPercentage: 0.3,
  excludeTools: []
};

let config: TruncatorConfig = { ...DEFAULT_CONFIG };

/**
 * Model context limits (same as context monitor)
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-5': 200000,
  'claude-sonnet-4-5': 200000,
  'gpt-5.5': 1000000,
  'gpt-4o': 128000,
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-3.1-pro-preview': 2000000,
  'gemini-3-flash-preview': 1000000,
  'gemini-3.1-flash-lite-preview': 1000000,
  'default': 100000
};

/**
 * Gets context limit for model
 */
function getContextLimit(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.includes(key) || key.includes(model)) {
      return limit;
    }
  }
  return MODEL_CONTEXT_LIMITS['default'];
}

/**
 * Calculates maximum allowed output based on context state
 */
function calculateMaxOutput(): number {
  try {
    const stats = getContextUsageStats();
    const limit = stats.limit;
    const used = stats.totalTokens;

    // Calculate remaining capacity
    const remaining = limit - used;
    const reserveForResponse = Math.floor(remaining * config.responseReserve);
    const availableForOutput = remaining - reserveForResponse;

    // Convert to characters
    const maxChars = availableForOutput * config.charsPerToken;

    // Clamp to configured bounds
    return Math.max(
      config.minOutputLength,
      Math.min(config.maxOutputLength, maxChars)
    );
  } catch {
    // Fallback if context monitor not available
    return config.maxOutputLength;
  }
}

/**
 * Truncates text intelligently
 */
function truncateText(
  text: string,
  maxLength: number,
  toolName: string
): { text: string; wasTruncated: boolean; originalLength: number } {
  const originalLength = text.length;

  if (text.length <= maxLength) {
    return { text, wasTruncated: false, originalLength };
  }

  // Calculate portions
  const startLength = Math.floor((maxLength - 200) * config.startPercentage); // Reserve 200 for notice
  const endLength = Math.floor((maxLength - 200) * config.endPercentage);
  const middleRemoved = text.length - startLength - endLength;

  // Extract portions
  const startPortion = text.substring(0, startLength);
  const endPortion = text.substring(text.length - endLength);

  // Build truncated text
  let truncated = startPortion;

  if (config.showTruncationNotice) {
    truncated += `\n\n... [${middleRemoved.toLocaleString()} characters truncated from ${toolName} output] ...\n\n`;
  } else {
    truncated += '\n...\n';
  }

  truncated += endPortion;

  return {
    text: truncated,
    wasTruncated: true,
    originalLength
  };
}

/**
 * Truncates structured content (arrays, objects)
 */
function truncateStructured(
  data: unknown,
  maxLength: number,
  toolName: string
): { data: unknown; wasTruncated: boolean; originalLength: number } {
  const jsonString = JSON.stringify(data, null, 2);
  const originalLength = jsonString.length;

  if (jsonString.length <= maxLength) {
    return { data, wasTruncated: false, originalLength };
  }

  // For arrays, truncate items
  if (Array.isArray(data)) {
    const itemEstimate = jsonString.length / data.length;
    const maxItems = Math.max(5, Math.floor(maxLength / itemEstimate));

    if (data.length > maxItems) {
      const truncatedArray = [
        ...data.slice(0, Math.ceil(maxItems * 0.7)),
        { _truncated: true, _message: `... ${data.length - maxItems} more items ...` },
        ...data.slice(-Math.floor(maxItems * 0.3))
      ];
      return { data: truncatedArray, wasTruncated: true, originalLength };
    }
  }

  // For objects or fallback, stringify and truncate
  const truncatedResult = truncateText(jsonString, maxLength, toolName);
  if (truncatedResult.wasTruncated) {
    return {
      data: {
        _truncated: true,
        _originalLength: originalLength,
        _content: truncatedResult.text
      },
      wasTruncated: true,
      originalLength
    };
  }

  return { data, wasTruncated: false, originalLength };
}

/**
 * Updates configuration
 */
export function updateTruncatorConfig(newConfig: Partial<TruncatorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Hook: Truncate tool output
 */
const truncateToolOutputHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_tool_output_truncator',
  name: 'Tool Output Truncator',
  description: 'Dynamically truncates large tool outputs based on context capacity',
  eventType: 'onToolResult',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Skip excluded tools
    if (config.excludeTools.includes(context.toolName)) {
      return { decision: 'continue' };
    }

    // Skip failed results
    if (!context.success) {
      return { decision: 'continue' };
    }

    const maxOutput = calculateMaxOutput();

    // Handle different result types
    let result = context.toolResult;
    let wasTruncated = false;
    let originalLength = 0;

    if (typeof result === 'string') {
      const truncated = truncateText(result, maxOutput, context.toolName);
      result = truncated.text;
      wasTruncated = truncated.wasTruncated;
      originalLength = truncated.originalLength;
    } else if (result && typeof result === 'object') {
      // Handle MCP content format
      if ('content' in result && Array.isArray((result as any).content)) {
        const content = (result as any).content;
        for (let i = 0; i < content.length; i++) {
          if (content[i].type === 'text' && typeof content[i].text === 'string') {
            const truncated = truncateText(content[i].text, maxOutput, context.toolName);
            if (truncated.wasTruncated) {
              content[i] = { ...content[i], text: truncated.text };
              wasTruncated = true;
              originalLength = truncated.originalLength;
            }
          }
        }
        result = { ...result as object, content };
      } else {
        // Generic object truncation
        const truncated = truncateStructured(result, maxOutput, context.toolName);
        result = truncated.data;
        wasTruncated = truncated.wasTruncated;
        originalLength = truncated.originalLength;
      }
    }

    if (wasTruncated) {
      logger.info({
        tool: context.toolName,
        originalLength,
        maxAllowed: maxOutput,
        truncatedTo: typeof result === 'string' ? result.length : JSON.stringify(result).length
      }, '[Truncator] Tool output truncated');

      return {
        decision: 'modify',
        modifiedData: { toolResult: result },
        metadata: {
          truncated: true,
          originalLength,
          maxAllowed: maxOutput
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Gets truncator statistics
 */
export function getTruncatorStats(): {
  currentMaxOutput: number;
  config: TruncatorConfig;
} {
  return {
    currentMaxOutput: calculateMaxOutput(),
    config: { ...config }
  };
}

/**
 * Registers the truncator hook
 */
export function registerToolOutputTruncatorHook(): void {
  registerHook(truncateToolOutputHook);
  logger.debug('Tool Output Truncator hook registered');
}

export default {
  registerToolOutputTruncatorHook,
  updateTruncatorConfig,
  getTruncatorStats
};
