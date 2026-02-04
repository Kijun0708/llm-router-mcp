// src/services/cliproxy-client.ts

import { Expert, ExpertResponse, ToolDefinition, ToolCall, ChatMessage, MessageContent, TextContent, ImageUrlContent } from '../types.js';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { config } from '../config.js';
import { logger, createExpertLogger } from '../utils/logger.js';
import { getCached, setCache } from '../utils/cache.js';
import { isRateLimitError, parseRetryAfter, markRateLimited, isCurrentlyLimited } from '../utils/rate-limit.js';
import { withRetry } from '../utils/retry.js';

// 모델별 타임아웃 설정 (ms)
// GPT: deep thinking으로 오래 걸림, Claude: 중간, Gemini: 빠름
function getModelTimeout(model: string): number {
  if (model.includes('gpt-5') || model.includes('codex')) {
    return 600000;  // 10분 - GPT 5.x는 deep thinking으로 오래 걸림
  }
  if (model.includes('claude') && model.includes('opus')) {
    return 180000;  // 3분 - Opus도 deep thinking
  }
  if (model.includes('claude')) {
    return 120000;  // 2분 - Sonnet/Haiku
  }
  if (model.includes('gemini')) {
    return 90000;   // 1.5분 - Gemini
  }
  return 60000;     // 기본 1분
}

interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: MessageContent | null; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  temperature: number;
  max_tokens: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "required" | "none";
}

// Helper: Get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml'
  };
  return mimeTypes[ext] || 'image/png';
}

// Helper: Load image and convert to base64 data URL
export function loadImageAsDataUrl(imagePath: string): string {
  if (!existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = getMimeType(imagePath);

  return `data:${mimeType};base64,${base64}`;
}

// Helper: Build multimodal content with text and optional image
export function buildMultimodalContent(text: string, imagePath?: string): MessageContent {
  if (!imagePath) {
    return text;
  }

  const content: Array<TextContent | ImageUrlContent> = [
    { type: "text", text }
  ];

  // Check if it's a URL or file path
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    content.push({
      type: "image_url",
      image_url: { url: imagePath, detail: "high" }
    });
  } else {
    // Load local file as base64
    const dataUrl = loadImageAsDataUrl(imagePath);
    content.push({
      type: "image_url",
      image_url: { url: dataUrl, detail: "high" }
    });
  }

  return content;
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
}

// 커스텀 에러 클래스
export class RateLimitExceededError extends Error {
  constructor(
    public expertId: string,
    public model: string,
    public retryAfterMs: number
  ) {
    super(
      `Rate limit exceeded for ${expertId} (${model}). ` +
      `Retry after: ${Math.round(retryAfterMs / 1000)}s`
    );
    this.name = 'RateLimitExceededError';
  }
}

export class ExpertCallError extends Error {
  constructor(
    public expertId: string,
    public originalError: Error,
    public retryable: boolean
  ) {
    super(`Expert ${expertId} call failed: ${originalError.message}`);
    this.name = 'ExpertCallError';
  }
}

export class TimeoutError extends Error {
  constructor(
    public expertId: string,
    public model: string,
    public timeoutMs: number
  ) {
    super(
      `Request timed out for ${expertId} (${model}) after ${Math.round(timeoutMs / 1000)}s. ` +
      `The model may be overloaded or the request was too complex.`
    );
    this.name = 'TimeoutError';
  }
}

/** 최대 응답 크기 (5MB) */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/**
 * AbortError를 TimeoutError로 변환
 */
function wrapTimeoutError(error: Error, expertId: string, model: string, timeoutMs: number): Error {
  if (error.name === 'AbortError' || error.name === 'TimeoutError' ||
      error.message.includes('aborted') || error.message.includes('timed out')) {
    return new TimeoutError(expertId, model, timeoutMs);
  }
  return error;
}

export interface CallExpertOptions {
  context?: string;
  skipCache?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "required" | "none";
  messages?: ChatMessage[];  // 기존 대화 이력 (Tool Loop용)
  imagePath?: string;        // 이미지 파일 경로 또는 URL (multimodal용)
}

export async function callExpert(
  expert: Expert,
  prompt: string,
  options: CallExpertOptions = {}
): Promise<ExpertResponse> {
  const { context, skipCache = false, tools, toolChoice, messages, imagePath } = options;
  const expertLogger = createExpertLogger(expert.id);
  const startTime = Date.now();

  // 1. 현재 Rate Limit 상태 체크
  if (isCurrentlyLimited(expert.model)) {
    expertLogger.warn('Model is currently rate limited, will try fallback');
    throw new RateLimitExceededError(expert.id, expert.model, 0);
  }

  // 2. 캐시 체크 (이미지가 없는 경우만 - 이미지 포함 요청은 캐시하지 않음)
  if (!skipCache && !imagePath) {
    const cached = getCached(expert.id, prompt, context);
    if (cached) {
      return {
        response: cached.response,
        actualExpert: expert.id,
        fellBack: false,
        cached: true,
        latencyMs: Date.now() - startTime
      };
    }
  }

  // 3. 메시지 구성
  let requestMessages: ChatRequest['messages'];

  if (messages && messages.length > 0) {
    // Tool Loop 계속: 기존 대화 이력 사용
    requestMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id
    }));
  } else {
    // 새 대화: 시스템 프롬프트 + 사용자 메시지
    const fullPrompt = context
      ? `${prompt}\n\n[컨텍스트]\n${context}`
      : prompt;

    // Build user content (with optional image for multimodal)
    const userContent = buildMultimodalContent(fullPrompt, imagePath);

    requestMessages = [
      { role: "system", content: expert.systemPrompt },
      { role: "user", content: userContent }
    ];

    if (imagePath) {
      expertLogger.debug({ imagePath }, 'Including image in request');
    }
  }

  const request: ChatRequest = {
    model: expert.model,
    messages: requestMessages,
    temperature: expert.temperature,
    max_tokens: expert.maxTokens
  };

  // tools 추가
  if (tools && tools.length > 0) {
    request.tools = tools;
    request.tool_choice = toolChoice || "auto";
  }

  const timeoutMs = getModelTimeout(expert.model);
  expertLogger.debug({ model: expert.model, timeoutMs }, 'Calling CLIProxyAPI');

  // 4. API 호출 (재시도 로직 포함 + 향상된 타임아웃 처리)
  let response: ChatResponse;

  try {
    response = await withRetry(
      async () => {
        let res: Response;

        try {
          res = await fetch(`${config.cliproxyUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(timeoutMs)
          });
        } catch (fetchError) {
          // AbortError를 명확한 TimeoutError로 변환
          throw wrapTimeoutError(fetchError as Error, expert.id, expert.model, timeoutMs);
        }

        // Rate Limit 체크
        if (res.status === 429) {
          const retryAfter = parseRetryAfter(res.headers) || 60000;
          markRateLimited(expert.model, retryAfter);
          throw new RateLimitExceededError(expert.id, expert.model, retryAfter);
        }

        if (!res.ok) {
          const errorText = await res.text();

          // 응답 텍스트에서 Rate Limit 패턴 체크
          if (isRateLimitError(null, errorText)) {
            const retryAfter = 60000; // 기본 1분
            markRateLimited(expert.model, retryAfter);
            throw new RateLimitExceededError(expert.id, expert.model, retryAfter);
          }

          throw new Error(`API error (${res.status}): ${errorText}`);
        }

        // 응답 크기 체크 (메모리 보호)
        const contentLength = res.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
          throw new Error(
            `Response too large (${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB). ` +
            `Maximum allowed: ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`
          );
        }

        return res.json() as Promise<ChatResponse>;
      },
      {
        maxRetries: config.retry.maxRetries,
        shouldRetry: (error) => {
          // Rate Limit 에러는 재시도하지 않음 (폴백으로 처리)
          if (error instanceof RateLimitExceededError) return false;
          // 타임아웃 에러는 재시도하지 않음 (폴백으로 처리)
          if (error instanceof TimeoutError) return false;
          // 네트워크 에러나 5xx는 재시도
          return true;
        }
      }
    );
  } catch (error) {
    // 최종 에러 로깅
    expertLogger.error({
      error: (error as Error).message,
      errorType: (error as Error).name,
      timeoutMs,
      model: expert.model
    }, 'Expert API call failed');
    throw error;
  }

  const choice = response.choices[0];
  const content = choice.message.content;
  const toolCalls = choice.message.tool_calls;
  // tool_calls가 있으면 "tool_calls", 없으면 "stop"
  const finishReason = (toolCalls && toolCalls.length > 0) ? "tool_calls" : "stop";
  const latencyMs = Date.now() - startTime;

  // 5. 캐시 저장 (도구 호출이 없는 경우만)
  if (!toolCalls && content) {
    setCache(expert.id, prompt, content, context);
  }

  expertLogger.info({
    latencyMs,
    finishReason,
    hasToolCalls: !!toolCalls
  }, 'Expert call completed');

  return {
    response: content || "",
    actualExpert: expert.id,
    fellBack: false,
    cached: false,
    latencyMs,
    toolCalls,
    finishReason
  };
}
