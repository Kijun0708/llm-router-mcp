// src/types.ts

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
  model: string;
  role: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  useCases: string[];
  fallbacks?: string[];
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
  cliproxyUrl: string;
  cliproxyPath?: string;  // CLIProxyAPI 실행 파일 경로 (자동 시작용)
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
  models: {
    strategist: string;
    researcher: string;
    reviewer: string;
    frontend: string;
    writer: string;
    explorer: string;
    multimodal: string;
    prometheus: string;
    metis: string;
    momus: string;
    librarian: string;
    // 특화 전문가
    security: string;
    tester: string;
    data: string;
    codex_reviewer: string;
    // Blank 전문가 (동적 페르소나 토론용)
    gpt_blank_1: string;
    gpt_blank_2: string;
    claude_blank_1: string;
    claude_blank_2: string;
    gemini_blank_1: string;
    gemini_blank_2: string;
    // 페르소나 할당 전문가
    debate_moderator: string;
  };
}
