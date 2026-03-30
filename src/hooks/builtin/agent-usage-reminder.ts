// src/hooks/builtin/agent-usage-reminder.ts

/**
 * Agent Usage Reminder Hook
 *
 * Suggests appropriate expert agents based on the current task context.
 * Helps users leverage the full power of the multi-expert system.
 *
 * Features:
 * - Detects task patterns that match specific experts
 * - Suggests underutilized experts
 * - Reminds about expert capabilities
 * - Tracks expert usage patterns
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnWorkflowStartContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { EXPERT_METADATA_REGISTRY } from '../../experts/index.js';

/**
 * Expert suggestion
 */
interface ExpertSuggestion {
  expertId: string;
  reason: string;
  confidence: number; // 0-1
  keywords: string[];
}

/**
 * Configuration for agent usage reminder
 */
interface ReminderConfig {
  /** Whether reminders are enabled */
  enabled: boolean;
  /** Minimum confidence to suggest */
  minConfidence: number;
  /** Maximum suggestions per session */
  maxSuggestionsPerSession: number;
  /** Cooldown between suggestions (ms) */
  suggestionCooldownMs: number;
  /** Whether to inject suggestion messages */
  injectSuggestions: boolean;
  /** Experts to exclude from suggestions */
  excludedExperts: string[];
}

/**
 * Statistics for reminder
 */
interface ReminderStats {
  totalSuggestions: number;
  suggestionsByExpert: Record<string, number>;
  lastSuggestionTime?: number;
  suggestionsAccepted: number;
  sessionSuggestionCount: number;
}

/**
 * Expert detection patterns
 */
interface ExpertPattern {
  expertId: string;
  keywords: string[];
  patterns: RegExp[];
  description: string;
}

// State
let config: ReminderConfig = {
  enabled: true,
  minConfidence: 0.6,
  maxSuggestionsPerSession: 5,
  suggestionCooldownMs: 300000, // 5 minutes
  injectSuggestions: true,
  excludedExperts: []
};

let stats: ReminderStats = {
  totalSuggestions: 0,
  suggestionsByExpert: {},
  suggestionsAccepted: 0,
  sessionSuggestionCount: 0
};

/**
 * Expert detection patterns
 */
const EXPERT_PATTERNS: ExpertPattern[] = [
  {
    expertId: 'strategist',
    keywords: ['architecture', 'design', 'strategy', 'approach', 'tradeoff', '아키텍처', '설계', '전략'],
    patterns: [
      /how should (i|we) (design|architect|structure)/i,
      /what('s| is) the best (approach|way|strategy)/i,
      /trade.?offs?/i,
      /어떻게 설계/i,
      /어떤 방식으로/i
    ],
    description: '아키텍처 및 전략적 결정'
  },
  {
    expertId: 'metis',
    keywords: ['requirements', 'feasibility', 'scope', 'analysis', '요구사항', '가능성', '범위', '분석'],
    patterns: [
      /what (are|do we need) the requirements/i,
      /is (this|it) (feasible|possible)/i,
      /scope (of|for)/i,
      /요구사항/i,
      /가능한가요/i
    ],
    description: '요구사항 분석 및 가능성 평가'
  },
  {
    expertId: 'momus',
    keywords: ['review', 'validate', 'check', 'verify', 'qa', '검토', '검증', '확인'],
    patterns: [
      /review (this|my) (plan|approach|design)/i,
      /(validate|verify|check) (this|my)/i,
      /what('s| is) wrong with/i,
      /검토해/i,
      /확인해/i
    ],
    description: '계획 검증 및 QA'
  },
  {
    expertId: 'codereview',
    keywords: ['code review', 'bug', 'security', 'performance', '코드 리뷰', '버그', '보안', '성능'],
    patterns: [
      /review (this|my) code/i,
      /(find|check for) bugs/i,
      /security (issue|concern|vulnerability)/i,
      /코드 리뷰/i,
      /버그 찾아/i
    ],
    description: '코드 리뷰 및 품질 검사'
  },
  {
    expertId: 'frontend',
    keywords: ['ui', 'ux', 'component', 'css', 'style', 'accessibility', 'UI', '컴포넌트', '스타일'],
    patterns: [
      /(ui|ux|user interface)/i,
      /component (design|structure)/i,
      /(css|style|styling)/i,
      /accessibility/i,
      /접근성/i
    ],
    description: 'UI/UX 및 프론트엔드'
  },
];

/**
 * Detects relevant experts from text
 */
function detectRelevantExperts(text: string): ExpertSuggestion[] {
  const suggestions: ExpertSuggestion[] = [];
  const textLower = text.toLowerCase();

  for (const pattern of EXPERT_PATTERNS) {
    // Skip excluded experts
    if (config.excludedExperts.includes(pattern.expertId)) continue;

    let confidence = 0;
    const matchedKeywords: string[] = [];

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        confidence += 0.15;
        matchedKeywords.push(keyword);
      }
    }

    // Check patterns
    for (const regex of pattern.patterns) {
      if (regex.test(text)) {
        confidence += 0.25;
      }
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    if (confidence >= config.minConfidence) {
      suggestions.push({
        expertId: pattern.expertId,
        reason: pattern.description,
        confidence,
        keywords: matchedKeywords
      });
    }
  }

  // Sort by confidence descending
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generates suggestion message
 */
function generateSuggestionMessage(suggestions: ExpertSuggestion[]): string | undefined {
  if (suggestions.length === 0) return undefined;

  const top = suggestions[0];
  const metadata = EXPERT_METADATA_REGISTRY[top.expertId];
  const expertName = metadata?.name || top.expertId;

  let message = `💡 **전문가 추천**: **${expertName}**\n`;
  message += `${top.reason}\n\n`;

  if (metadata?.useWhen && metadata.useWhen.length > 0) {
    message += `**활용 사례:**\n`;
    for (const useCase of metadata.useWhen.slice(0, 3)) {
      message += `- ${useCase}\n`;
    }
  }

  message += `\n_\`consult_expert\`로 ${expertName}에게 상담하세요._`;

  return message;
}

/**
 * Checks if suggestion should be made
 */
function shouldSuggest(): boolean {
  if (!config.enabled) return false;

  // Check session limit
  if (stats.sessionSuggestionCount >= config.maxSuggestionsPerSession) {
    return false;
  }

  // Check cooldown
  if (stats.lastSuggestionTime) {
    const elapsed = Date.now() - stats.lastSuggestionTime;
    if (elapsed < config.suggestionCooldownMs) {
      return false;
    }
  }

  return true;
}

/**
 * Records a suggestion
 */
function recordSuggestion(expertId: string): void {
  stats.totalSuggestions++;
  stats.sessionSuggestionCount++;
  stats.lastSuggestionTime = Date.now();
  stats.suggestionsByExpert[expertId] = (stats.suggestionsByExpert[expertId] || 0) + 1;
}

/**
 * Hook: Check tool calls for expert suggestions
 */
const suggestOnToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:agent-usage-reminder:tool-call',
  name: 'Agent Usage Reminder (Tool Call)',
  description: 'Suggests experts based on tool call context',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!shouldSuggest()) return { decision: 'continue' };

    // Skip if this is already an expert consultation
    if (context.toolName === 'consult_expert') {
      return { decision: 'continue' };
    }

    // Check tool input for patterns
    const inputText = JSON.stringify(context.toolInput);
    const suggestions = detectRelevantExperts(inputText);

    if (suggestions.length > 0 && config.injectSuggestions) {
      const top = suggestions[0];
      recordSuggestion(top.expertId);

      logger.debug({
        tool: context.toolName,
        suggestedExpert: top.expertId,
        confidence: top.confidence
      }, 'Expert suggestion triggered');

      const message = generateSuggestionMessage(suggestions);
      if (message) {
        return {
          decision: 'continue',
          injectMessage: message,
          metadata: { suggestedExpert: top.expertId }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check workflow start for expert suggestions
 */
const suggestOnWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:agent-usage-reminder:workflow-start',
  name: 'Agent Usage Reminder (Workflow Start)',
  description: 'Suggests experts based on workflow request',
  eventType: 'onWorkflowStart',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!shouldSuggest()) return { decision: 'continue' };

    const suggestions = detectRelevantExperts(context.request);

    if (suggestions.length > 0 && config.injectSuggestions) {
      const top = suggestions[0];
      recordSuggestion(top.expertId);

      logger.debug({
        request: context.request.substring(0, 100),
        suggestedExpert: top.expertId,
        confidence: top.confidence
      }, 'Expert suggestion triggered on workflow start');

      const message = generateSuggestionMessage(suggestions);
      if (message) {
        return {
          decision: 'continue',
          injectMessage: message,
          metadata: { suggestedExpert: top.expertId }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * All agent usage reminder hooks
 */
export const agentUsageReminderHooks = [
  suggestOnToolCallHook,
  suggestOnWorkflowStartHook
] as HookDefinition[];

/**
 * Registers agent usage reminder hooks
 */
export function registerAgentUsageReminderHooks(): void {
  for (const hook of agentUsageReminderHooks) {
    registerHook(hook);
  }
  logger.debug('Agent usage reminder hooks registered');
}

/**
 * Gets reminder statistics
 */
export function getAgentUsageReminderStats(): ReminderStats & { config: ReminderConfig } {
  return {
    ...stats,
    config
  };
}

/**
 * Resets reminder state
 */
export function resetAgentUsageReminderState(): void {
  stats = {
    totalSuggestions: 0,
    suggestionsByExpert: {},
    suggestionsAccepted: 0,
    sessionSuggestionCount: 0
  };
}

/**
 * Updates reminder configuration
 */
export function updateAgentUsageReminderConfig(updates: Partial<ReminderConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Agent usage reminder config updated');
}

/**
 * Manually detects experts from text
 */
export function detectExperts(text: string): ExpertSuggestion[] {
  return detectRelevantExperts(text);
}

export default {
  registerAgentUsageReminderHooks,
  getAgentUsageReminderStats,
  resetAgentUsageReminderState,
  updateAgentUsageReminderConfig,
  detectExperts
};
