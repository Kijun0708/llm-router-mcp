// src/types.ts

import type { ProviderId, SandboxMode, TokenUsage, ChainStep } from './services/providers/index.js';
import type { ExpertId } from './model-defaults.js';

export type { ProviderId, SandboxMode, TokenUsage, ChainStep, ExpertId };

// Function Calling 관련 타입
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;  // JSON 문자열
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

// Multimodal content types
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageUrlContent {
  type: "image_url";
  image_url: {
    url: string;  // Can be URL or data:image/...;base64,...
    detail?: "auto" | "low" | "high";
  };
}

export type MessageContent = string | Array<TextContent | ImageUrlContent>;

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Expert {
  id: string;
  name: string;
  /** CLI 슬러그. model-registry.MODELS의 키여야 한다 (부팅 시 검증). */
  model: string;
  /**
   * 어느 CLI로 부를지. 명시 필수.
   * agy 하나가 Gemini·Claude·GPT-OSS를 전부 서빙하므로 모델명으로는 추론이 불가능하다.
   */
  provider: ProviderId;
  /** 역할 권한. implementer만 'workspace-write'. */
  sandbox: SandboxMode;
  /** 명시 모델 체인. 미지정 시 [{provider, model}] 하나짜리. */
  modelChain?: ChainStep[];
  /** MODELS[model].timeoutMs 오버라이드. */
  timeoutMs?: number;
  role: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  useCases: string[];
  tools?: ToolDefinition[];  // 전문가가 사용할 수 있는 도구
  toolChoice?: "auto" | "required" | "none";  // 도구 사용 모드
}

export interface ExpertResponse {
  response: string;
  actualExpert: string;
  fellBack: boolean;
  cached: boolean;
  latencyMs: number;
  toolCalls?: ToolCall[];           // 전문가가 요청한 도구 호출
  finishReason?: "stop" | "tool_calls";  // 응답 종료 이유
  toolsUsed?: string[];             // 실제 사용된 도구 목록
  /** 실제로 응답한 모델 (체인 폴백 시 expert.model과 다를 수 있다). */
  actualModel?: string;
  /** CLI가 보고한 실측 토큰 사용량. 추정이 아니다. */
  usage?: TokenUsage;
}

export interface RateLimitInfo {
  isLimited: boolean;
  retryAfter?: number;
  provider: 'openai' | 'anthropic' | 'google';
}

export interface APIError {
  type: 'rate_limit' | 'api_error' | 'network_error' | 'auth_error' | 'timeout';
  status?: number;
  message: string;
  retryable: boolean;
  retryAfter?: number;
}

export interface BackgroundTask {
  id: string;
  expert: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface Category {
  id: string;
  defaultExpert: string;
  model?: string;
  temperature?: number;
  description: string;
  promptAppend?: string;
}

export interface Config {
  cli: {
    /** Antigravity CLI(agy) 경로. Google 계열 유일 프로바이더 (default: 'agy') */
    agyPath: string;
    /** Codex CLI 경로 (default: 'codex') */
    codexPath: string;
    /** Claude Code CLI 경로. opt-in 전용 (default: 'claude') */
    claudePath: string;
  };
  /** claude -p 호출당 비용 상한(USD). 0이면 상한 없음. */
  claudeMaxBudgetUsd: number;
  exaApiKey?: string;     // Exa AI 검색 API 키
  context7ApiKey?: string; // Context7 문서 API 키
  cache: {
    enabled: boolean;
    ttlMs: number;
    maxSize: number;
  };
  retry: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  concurrency: {
    default: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  };
  /**
   * 전문가별 모델 슬러그. 키는 model-defaults의 EXPERT_IDS와 정확히 일치하며
   * 값은 MODELS에 등록된 슬러그임이 config 로드 시 검증된다.
   * MODEL_<EXPERT_ID> 환경변수로 개별 오버라이드 가능.
   */
  models: Record<ExpertId, string>;
  hybrid: {
    enabled: boolean;
    inlineThresholdChars: number;
    alwaysSaveWorkflows: boolean;
    cleanupMaxAgeMs: number;
    previewLines: number;
  };
}
