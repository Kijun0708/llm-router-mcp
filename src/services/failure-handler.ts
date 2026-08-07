// src/services/failure-handler.ts

/**
 * Failure Handler Service
 *
 * Implements the 3-strike escalation protocol for handling expert call failures.
 * Based on oh-my-opencode's recovery pattern.
 *
 * Strike Protocol:
 * 1. First failure: Retry with same expert, potentially modified approach
 * 2. Second failure: Switch to fallback expert
 * 3. Third failure: Escalate to user with detailed report
 */

import { FALLBACK_CHAIN, experts } from '../experts/index.js';
import { classifyErrorText, kindOf, type ErrorKind } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isRateLimitError } from '../utils/rate-limit.js';

/**
 * Failure types that can be identified.
 */
export type FailureType =
  | 'rate_limit'
  | 'timeout'
  | 'auth_error'
  | 'model_error'
  | 'content_filter'
  | 'invalid_response'
  | 'network_error'
  | 'unknown';

/**
 * Recovery action recommendations.
 */
export type RecoveryAction =
  | 'retry'
  | 'retry_modified'
  | 'switch_expert'
  | 'escalate'
  | 'abort';

/**
 * Failure analysis result.
 */
export interface FailureAnalysis {
  type: FailureType;
  message: string;
  recoverable: boolean;
  suggestedAction: RecoveryAction;
  retryDelayMs?: number;
  alternateExpert?: string;
}

/**
 * Escalation report structure.
 */
export interface EscalationReport {
  originalRequest: string;
  expertsTried: string[];
  failureHistory: FailureRecord[];
  recommendations: string[];
  canContinue: boolean;
}

/**
 * Record of a single failure.
 */
export interface FailureRecord {
  expertId: string;
  attemptNumber: number;
  timestamp: Date;
  failureType: FailureType;
  errorMessage: string;
  actionTaken: RecoveryAction;
}

/**
 * Failure context for tracking across attempts.
 */
export interface FailureContext {
  originalRequest: string;
  currentExpert: string;
  attemptCount: number;
  maxAttempts: number;
  failureHistory: FailureRecord[];
  lastError?: Error;
}

/**
 * ErrorKind(단일 분류) → 이 모듈의 FailureType/복구 액션.
 *
 * 판정 자체는 utils/errors.ts가 한다. 여기 있던 자체 ERROR_PATTERNS 표는 삭제했다 —
 * 특히 /401|403|unauthorized|forbidden|auth|permission/i 가 "auth"를 포함한 모든
 * 문자열(예: agy 권한 경고, "authenticated user quota reached")을 삼켜
 * recoverable: false 로 만들어 복구 경로 전체를 중단시켰다.
 */
const KIND_TO_FAILURE: Record<ErrorKind, {
  type: FailureType;
  recoverable: boolean;
  action: RecoveryAction;
}> = {
  quota:             { type: 'rate_limit',       recoverable: true,  action: 'switch_expert' },
  // 타임아웃 재시도는 대기시간을 배로 만든다. 같은 모델 재시도 대신 전문가 교체.
  timeout:           { type: 'timeout',          recoverable: true,  action: 'switch_expert' },
  auth:              { type: 'auth_error',       recoverable: false, action: 'escalate' },
  bad_model:         { type: 'model_error',      recoverable: true,  action: 'switch_expert' },
  bad_request:       { type: 'invalid_response', recoverable: false, action: 'escalate' },
  // 우리 argv가 틀렸다는 신호. 조용히 우회하면 원인이 영영 안 드러난다.
  permission_denied: { type: 'auth_error',       recoverable: false, action: 'escalate' },
  network:           { type: 'network_error',    recoverable: true,  action: 'retry' },
  server:            { type: 'network_error',    recoverable: true,  action: 'retry' },
  context_overflow:  { type: 'invalid_response', recoverable: true,  action: 'retry_modified' },
  unknown:           { type: 'unknown',          recoverable: true,  action: 'retry' },
};

/**
 * 핵심 분류표가 모르는(unknown) 경우에만 보는 보조 패턴.
 * 이 두 유형은 CLI 공통 실패가 아니라 워크플로 고유 개념이라 core에 넣지 않았다.
 */
const EXTRA_PATTERNS: Array<{
  pattern: RegExp;
  type: FailureType;
  recoverable: boolean;
  action: RecoveryAction;
}> = [
  {
    pattern: /content\s*filter|safety\s*(filter|block)|\bblocked\b|\bharmful\b/i,
    type: 'content_filter',
    recoverable: true,
    action: 'retry_modified',
  },
  {
    // 이전엔 여기에 단독 /JSON/ 이 있어 JSON을 언급하는 모든 에러를 삼켰다.
    pattern: /invalid.*response|parse\s*error|malformed/i,
    type: 'invalid_response',
    recoverable: true,
    action: 'retry',
  },
];

/**
 * Analyzes a failure and provides recommendations.
 */
export function analyzeFailure(
  error: Error | string,
  context: FailureContext
): FailureAnalysis {
  const errorMessage = typeof error === 'string' ? error : error.message;

  // 1) 단일 분류표 우선 — 순서가 검증된 판정을 그대로 따른다
  const kind = typeof error === 'string' ? classifyErrorText(error) : kindOf(error);
  if (kind !== 'unknown') {
    const m = KIND_TO_FAILURE[kind];
    return buildAnalysis(m.type, errorMessage, m.recoverable, m.action, context);
  }

  // 2) core가 모르는 워크플로 고유 유형만 보조 패턴으로
  for (const { pattern, type, recoverable, action } of EXTRA_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return buildAnalysis(type, errorMessage, recoverable, action, context);
    }
  }

  return buildAnalysis('unknown', errorMessage, true, 'retry', context);
}

/**
 * Builds a failure analysis result.
 */
function buildAnalysis(
  type: FailureType,
  message: string,
  recoverable: boolean,
  defaultAction: RecoveryAction,
  context: FailureContext
): FailureAnalysis {
  // Adjust action based on attempt count
  let suggestedAction = defaultAction;

  if (context.attemptCount >= context.maxAttempts) {
    suggestedAction = 'escalate';
    recoverable = false;
  } else if (context.attemptCount >= 2 && suggestedAction !== 'escalate') {
    // After 2 attempts, prefer switching expert
    suggestedAction = 'switch_expert';
  }

  // Find alternate expert if needed
  let alternateExpert: string | undefined;
  if (suggestedAction === 'switch_expert') {
    const fallbacks = FALLBACK_CHAIN[context.currentExpert] || [];
    const triedExperts = context.failureHistory.map(f => f.expertId);
    alternateExpert = fallbacks.find(e => !triedExperts.includes(e));

    if (!alternateExpert) {
      // No more fallbacks available
      suggestedAction = 'escalate';
      recoverable = false;
    }
  }

  // Calculate retry delay
  let retryDelayMs: number | undefined;
  if (suggestedAction === 'retry' || suggestedAction === 'retry_modified') {
    retryDelayMs = calculateRetryDelay(type, context.attemptCount);
  }

  return {
    type,
    message,
    recoverable,
    suggestedAction,
    retryDelayMs,
    alternateExpert
  };
}

/**
 * Calculates retry delay with exponential backoff.
 */
function calculateRetryDelay(type: FailureType, attemptNumber: number): number {
  const baseDelay = type === 'rate_limit' ? 5000 : 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);

  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Records a failure in the context.
 */
export function recordFailure(
  context: FailureContext,
  analysis: FailureAnalysis
): void {
  const record: FailureRecord = {
    expertId: context.currentExpert,
    attemptNumber: context.attemptCount,
    timestamp: new Date(),
    failureType: analysis.type,
    errorMessage: analysis.message,
    actionTaken: analysis.suggestedAction
  };

  context.failureHistory.push(record);

  logger.warn({
    expertId: context.currentExpert,
    attempt: context.attemptCount,
    failureType: analysis.type,
    action: analysis.suggestedAction
  }, 'Failure recorded');
}

/**
 * Generates an escalation report for user intervention.
 */
export function generateEscalationReport(context: FailureContext): EscalationReport {
  const expertsTried = [...new Set(context.failureHistory.map(f => f.expertId))];

  const recommendations: string[] = [];

  // Analyze failure patterns
  const failureTypes = context.failureHistory.map(f => f.failureType);

  if (failureTypes.includes('rate_limit')) {
    recommendations.push('Wait a few minutes before retrying - rate limits may have been hit');
  }

  if (failureTypes.includes('auth_error')) {
    recommendations.push('Check authentication status with auth_status tool');
  }

  if (failureTypes.includes('content_filter')) {
    recommendations.push('Rephrase the request to avoid triggering content filters');
  }

  if (failureTypes.includes('timeout')) {
    recommendations.push('Try breaking down the request into smaller parts');
  }

  // General recommendations
  recommendations.push('Try using a different expert directly');
  recommendations.push('Simplify the request');
  recommendations.push('Provide more specific context');

  return {
    originalRequest: context.originalRequest,
    expertsTried,
    failureHistory: context.failureHistory,
    recommendations,
    canContinue: false
  };
}

/**
 * Formats escalation report as markdown.
 */
export function formatEscalationReport(report: EscalationReport): string {
  let output = `## ⚠️ Escalation Required

### Original Request
${report.originalRequest.substring(0, 500)}${report.originalRequest.length > 500 ? '...' : ''}

### Experts Tried
${report.expertsTried.map(e => `- ${e}`).join('\n')}

### Failure History
`;

  for (const failure of report.failureHistory) {
    output += `
**Attempt ${failure.attemptNumber}** (${failure.expertId})
- Type: ${failure.failureType}
- Error: ${failure.errorMessage.substring(0, 200)}
- Action: ${failure.actionTaken}
- Time: ${failure.timestamp.toISOString()}
`;
  }

  output += `
### Recommendations
${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### What You Can Do
- Use \`consult_expert\` to try a specific expert directly
- Use \`llm_router_health\` to check system status
- Check \`auth_status\` if authentication issues were detected
`;

  return output;
}

/**
 * Creates a new failure context.
 */
export function createFailureContext(
  originalRequest: string,
  initialExpert: string,
  maxAttempts: number = 3
): FailureContext {
  return {
    originalRequest,
    currentExpert: initialExpert,
    attemptCount: 0,
    maxAttempts,
    failureHistory: []
  };
}

/**
 * Updates context for a new attempt.
 */
export function prepareNextAttempt(
  context: FailureContext,
  analysis: FailureAnalysis
): void {
  context.attemptCount++;

  if (analysis.alternateExpert) {
    context.currentExpert = analysis.alternateExpert;
  }
}

/**
 * Checks if context indicates escalation is needed.
 */
export function shouldEscalate(context: FailureContext): boolean {
  return context.attemptCount >= context.maxAttempts;
}

/**
 * Gets the next expert to try based on context.
 */
export function getNextExpert(context: FailureContext): string | null {
  const fallbacks = FALLBACK_CHAIN[context.currentExpert] || [];
  const triedExperts = context.failureHistory.map(f => f.expertId);

  return fallbacks.find(e => !triedExperts.includes(e)) || null;
}

export default {
  analyzeFailure,
  recordFailure,
  generateEscalationReport,
  formatEscalationReport,
  createFailureContext,
  prepareNextAttempt,
  shouldEscalate,
  getNextExpert
};
