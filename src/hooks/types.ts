// src/hooks/types.ts

/**
 * Hook System Types
 *
 * Event-driven hook system for custommcp MCP server.
 * Inspired by oh-my-opencode's Claude Code hooks.
 */

/**
 * Available hook event types.
 */
export type HookEventType =
  | 'onServerStart'        // MCP 서버 시작 시
  | 'onServerStop'         // MCP 서버 종료 시
  | 'onToolCall'           // MCP 도구 호출 전
  | 'onToolResult'         // MCP 도구 실행 후
  | 'onExpertCall'         // Expert 호출 전
  | 'onExpertResult'       // Expert 응답 후
  | 'onWorkflowStart'      // orchestrate_task 시작
  | 'onWorkflowPhase'      // Workflow phase 전환
  | 'onWorkflowEnd'        // orchestrate_task 종료
  | 'onRalphLoopStart'     // Ralph Loop 시작
  | 'onRalphLoopIteration' // Ralph Loop 반복
  | 'onRalphLoopEnd'       // Ralph Loop 종료
  | 'onError'              // 에러 발생 시
  | 'onRateLimit';         // Rate limit 발생 시

/**
 * Hook execution decision.
 */
export type HookDecision = 'continue' | 'block' | 'modify';

/**
 * Hook priority levels.
 */
export type HookPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Base hook context passed to all hooks.
 */
export interface HookBaseContext {
  /** Unique hook execution ID */
  hookExecutionId: string;
  /** Event type */
  eventType: HookEventType;
  /** Timestamp */
  timestamp: string;
  /** Current working directory */
  cwd: string;
}

/**
 * Context for onServerStart hook.
 */
export interface OnServerStartContext extends HookBaseContext {
  eventType: 'onServerStart';
  /** Server version */
  version: string;
  /** Registered tools count */
  toolCount: number;
}

/**
 * Context for onServerStop hook.
 */
export interface OnServerStopContext extends HookBaseContext {
  eventType: 'onServerStop';
  /** Uptime in milliseconds */
  uptimeMs: number;
}

/**
 * Context for onToolCall hook.
 */
export interface OnToolCallContext extends HookBaseContext {
  eventType: 'onToolCall';
  /** Tool name being called */
  toolName: string;
  /** Tool input parameters */
  toolInput: Record<string, unknown>;
}

/**
 * Context for onToolResult hook.
 */
export interface OnToolResultContext extends HookBaseContext {
  eventType: 'onToolResult';
  /** Tool name */
  toolName: string;
  /** Tool input parameters */
  toolInput: Record<string, unknown>;
  /** Tool execution result */
  toolResult: unknown;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Context for onExpertCall hook.
 */
export interface OnExpertCallContext extends HookBaseContext {
  eventType: 'onExpertCall';
  /** Expert ID */
  expertId: string;
  /** Model being used */
  model: string;
  /** Prompt being sent */
  prompt: string;
  /** Additional context */
  context?: string;
  /** Whether cache is being skipped */
  skipCache: boolean;
}

/**
 * Context for onExpertResult hook.
 */
export interface OnExpertResultContext extends HookBaseContext {
  eventType: 'onExpertResult';
  /** Expert ID */
  expertId: string;
  /** Model used */
  model: string;
  /** Response text */
  response: string;
  /** Response length */
  responseLength: number;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether from cache */
  fromCache: boolean;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Original expert if fallback was used */
  originalExpert?: string;
}

/**
 * Context for onWorkflowStart hook.
 */
export interface OnWorkflowStartContext extends HookBaseContext {
  eventType: 'onWorkflowStart';
  /** Original request */
  request: string;
  /** Whether Ralph Loop mode is enabled */
  ralphLoopMode: boolean;
  /** Max attempts configured */
  maxAttempts: number;
}

/**
 * Context for onWorkflowPhase hook.
 */
export interface OnWorkflowPhaseContext extends HookBaseContext {
  eventType: 'onWorkflowPhase';
  /** Phase ID */
  phaseId: string;
  /** Previous phase ID */
  previousPhase?: string;
  /** Phase attempt number */
  attemptNumber: number;
  /** Context from previous phase */
  previousOutput?: string;
}

/**
 * Context for onWorkflowEnd hook.
 */
export interface OnWorkflowEndContext extends HookBaseContext {
  eventType: 'onWorkflowEnd';
  /** Whether workflow succeeded */
  success: boolean;
  /** Phases executed */
  phasesExecuted: string[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** Whether escalated to user */
  escalated: boolean;
  /** Final output */
  output: string;
}

/**
 * Context for onRalphLoopStart hook.
 */
export interface OnRalphLoopStartContext extends HookBaseContext {
  eventType: 'onRalphLoopStart';
  /** Task ID */
  taskId: string;
  /** Original prompt */
  prompt: string;
  /** Max iterations */
  maxIterations: number;
  /** Completion promise text */
  completionPromise: string;
  /** Expert being used */
  expert: string;
}

/**
 * Context for onRalphLoopIteration hook.
 */
export interface OnRalphLoopIterationContext extends HookBaseContext {
  eventType: 'onRalphLoopIteration';
  /** Task ID */
  taskId: string;
  /** Current iteration */
  iteration: number;
  /** Max iterations */
  maxIterations: number;
  /** Output from this iteration */
  output: string;
  /** Whether completion was detected */
  completionDetected: boolean;
  /** Detected promise if any */
  detectedPromise?: string;
}

/**
 * Context for onRalphLoopEnd hook.
 */
export interface OnRalphLoopEndContext extends HookBaseContext {
  eventType: 'onRalphLoopEnd';
  /** Task ID */
  taskId: string;
  /** Whether completed successfully */
  completed: boolean;
  /** Total iterations */
  iterations: number;
  /** Whether max iterations reached */
  maxIterationsReached: boolean;
  /** Whether cancelled */
  cancelled: boolean;
  /** Total duration in ms */
  totalDurationMs: number;
}

/**
 * Context for onError hook.
 */
export interface OnErrorContext extends HookBaseContext {
  eventType: 'onError';
  /** Error message */
  errorMessage: string;
  /** Error code if available */
  errorCode?: string;
  /** Error source (tool name, expert ID, etc.) */
  source: string;
  /** Stack trace if available */
  stack?: string;
  /** Whether error is recoverable */
  recoverable: boolean;
}

/**
 * Context for onRateLimit hook.
 */
export interface OnRateLimitContext extends HookBaseContext {
  eventType: 'onRateLimit';
  /** Provider that rate limited */
  provider: string;
  /** Model that was rate limited */
  model: string;
  /** Expert ID if applicable */
  expertId?: string;
  /** Retry after seconds if known */
  retryAfterSeconds?: number;
  /** Whether fallback is available */
  fallbackAvailable: boolean;
}

/**
 * Union type of all hook contexts.
 */
export type HookContext =
  | OnServerStartContext
  | OnServerStopContext
  | OnToolCallContext
  | OnToolResultContext
  | OnExpertCallContext
  | OnExpertResultContext
  | OnWorkflowStartContext
  | OnWorkflowPhaseContext
  | OnWorkflowEndContext
  | OnRalphLoopStartContext
  | OnRalphLoopIterationContext
  | OnRalphLoopEndContext
  | OnErrorContext
  | OnRateLimitContext;

/**
 * Hook result returned by hook handlers.
 */
export interface HookResult {
  /** Decision: continue, block, or modify */
  decision: HookDecision;
  /** Reason for decision (shown in logs) */
  reason?: string;
  /** Modified data (for 'modify' decision) */
  modifiedData?: Record<string, unknown>;
  /** Message to inject into context */
  injectMessage?: string;
  /** Whether to suppress normal output */
  suppressOutput?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Default hook result (continue without changes).
 */
export const DEFAULT_HOOK_RESULT: HookResult = {
  decision: 'continue'
};

/**
 * Hook handler function signature.
 */
export type HookHandler<T extends HookContext = HookContext> = (
  context: T
) => Promise<HookResult> | HookResult;

/**
 * Hook definition for registration.
 */
export interface HookDefinition<T extends HookContext = HookContext> {
  /** Unique hook ID */
  id: string;
  /** Hook name for display */
  name: string;
  /** Description */
  description: string;
  /** Event type to listen for */
  eventType: HookEventType;
  /** Handler function */
  handler: HookHandler<T>;
  /** Priority (higher runs first) */
  priority: HookPriority;
  /** Whether hook is enabled */
  enabled: boolean;
  /** Tool name pattern to match (for tool events) */
  toolPattern?: string;
  /** Expert ID pattern to match (for expert events) */
  expertPattern?: string;
}

/**
 * External command hook definition.
 */
export interface ExternalHookDefinition {
  /** Unique hook ID */
  id: string;
  /** Hook name for display */
  name: string;
  /** Description */
  description: string;
  /** Event type to listen for */
  eventType: HookEventType;
  /** Shell command to execute */
  command: string;
  /** Working directory for command */
  cwd?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Priority */
  priority: HookPriority;
  /** Whether hook is enabled */
  enabled: boolean;
  /** Tool name pattern to match */
  toolPattern?: string;
  /** Expert ID pattern to match */
  expertPattern?: string;
}

/**
 * Hook configuration file format.
 */
export interface HookConfig {
  /** Version of config format */
  version: string;
  /** Whether hooks are enabled globally */
  enabled: boolean;
  /** Internal hooks configuration */
  hooks: {
    [K in HookEventType]?: Array<{
      /** Hook ID */
      id: string;
      /** Whether enabled */
      enabled: boolean;
      /** Priority override */
      priority?: HookPriority;
      /** Options passed to hook */
      options?: Record<string, unknown>;
    }>;
  };
  /** External command hooks */
  externalHooks?: {
    [K in HookEventType]?: Array<{
      /** Hook name */
      name: string;
      /** Command to execute */
      command: string;
      /** Timeout in ms */
      timeoutMs?: number;
      /** Pattern to match */
      pattern?: string;
      /** Priority */
      priority?: HookPriority;
    }>;
  };
  /** Disabled hooks list */
  disabledHooks?: string[];
}

/**
 * Default hook configuration.
 */
export const DEFAULT_HOOK_CONFIG: HookConfig = {
  version: '1.0.0',
  enabled: true,
  hooks: {},
  externalHooks: {},
  disabledHooks: []
};

/**
 * Hook execution statistics.
 */
export interface HookStats {
  /** Total executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Blocked executions */
  blockedExecutions: number;
  /** Average execution time in ms */
  averageExecutionTimeMs: number;
  /** Last execution timestamp */
  lastExecutionAt?: string;
}

/**
 * Hook registry state.
 */
export interface HookRegistryState {
  /** Registered internal hooks */
  internalHooks: Map<string, HookDefinition>;
  /** Registered external hooks */
  externalHooks: Map<string, ExternalHookDefinition>;
  /** Hook statistics */
  stats: Map<string, HookStats>;
  /** Whether registry is initialized */
  initialized: boolean;
}
