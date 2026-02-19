// src/services/cliproxy-client.ts

import { Expert, ExpertResponse, ToolDefinition, ToolCall, ChatMessage, MessageContent, TextContent, ImageUrlContent } from '../types.js';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { config } from '../config.js';
import { logger, createExpertLogger } from '../utils/logger.js';
import { getCached, setCache } from '../utils/cache.js';
import { isRateLimitError, markRateLimited, isCurrentlyLimited, detectProvider } from '../utils/rate-limit.js';
import { withRetry } from '../utils/retry.js';
import { getProvider, getProviderSemaphore } from './providers/index.js';

// 모델별 타임아웃 설정 (ms)
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
 * CLI 에러를 적절한 커스텀 에러로 변환
 */
function classifyCliError(error: Error, expertId: string, model: string, timeoutMs: number): Error {
  const message = error.message;

  // 타임아웃 에러
  if (message.includes('timeout') || message.includes('timed out') || message.includes('CLI timeout')) {
    return new TimeoutError(expertId, model, timeoutMs);
  }

  // Rate Limit 에러
  if (isRateLimitError(null, message)) {
    const retryAfter = 60000; // 기본 1분
    markRateLimited(model, retryAfter);
    return new RateLimitExceededError(expertId, model, retryAfter);
  }

  // 인증 에러 (폴백 불가)
  if (message.includes('unauthorized') || message.includes('not authenticated') ||
      message.includes('login') || message.includes('auth')) {
    return new ExpertCallError(expertId, error, false);
  }

  // CLI 실행 실패 (명령어 없음 등 - 폴백 가능)
  if (message.includes('spawn failed') || message.includes('ENOENT')) {
    return new ExpertCallError(expertId, error, true);
  }

  // 기타 에러 (폴백 가능)
  return new ExpertCallError(expertId, error, true);
}

/**
 * ChatMessage 배열을 텍스트로 직렬화 (Tool Loop 계속용)
 */
function serializeMessages(messages: ChatMessage[]): { prompt: string; systemPrompt?: string } {
  let systemPrompt: string | undefined;
  let prompt = '';

  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : (msg.content ? JSON.stringify(msg.content) : '');

    switch (msg.role) {
      case 'system':
        systemPrompt = content;
        break;
      case 'user':
        prompt += `${content}\n\n`;
        break;
      case 'assistant':
        if (content) {
          prompt += `[이전 응답]\n${content}\n\n`;
        }
        if (msg.tool_calls) {
          prompt += `[이전 도구 호출]\n${JSON.stringify(msg.tool_calls, null, 2)}\n\n`;
        }
        break;
      case 'tool':
        prompt += `[도구 결과 (${msg.tool_call_id})]\n${content}\n\n`;
        break;
    }
  }

  return { prompt: prompt.trim(), systemPrompt };
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

  // 2. 캐시 체크 (이미지가 없는 경우만)
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

  // 3. 프롬프트 구성
  let effectivePrompt: string;
  let effectiveSystemPrompt: string | undefined;

  if (messages && messages.length > 0) {
    // Tool Loop 계속: 기존 대화 이력을 텍스트로 직렬화
    const serialized = serializeMessages(messages);
    effectivePrompt = serialized.prompt;
    effectiveSystemPrompt = serialized.systemPrompt;
  } else {
    // 새 대화
    effectivePrompt = context
      ? `${prompt}\n\n[컨텍스트]\n${context}`
      : prompt;
    effectiveSystemPrompt = expert.systemPrompt;

    if (imagePath) {
      effectivePrompt += `\n\n[이미지 첨부: ${imagePath}]`;
      expertLogger.debug({ imagePath }, 'Including image reference in prompt');
    }
  }

  const timeoutMs = getModelTimeout(expert.model);
  const provider = getProvider(expert.model);
  const providerType = detectProvider(expert.model);

  expertLogger.debug({
    model: expert.model,
    provider: provider.name,
    timeoutMs,
    promptLength: effectivePrompt.length,
  }, 'Calling CLI provider');

  // 4. CLI 호출 (재시도 로직 + 동시성 제어)
  const semaphore = getProviderSemaphore(providerType, config.concurrency.byProvider);
  let content: string;

  try {
    await semaphore.acquire();

    try {
      content = await withRetry(
        async () => {
          const result = await provider.call({
            prompt: effectivePrompt,
            systemPrompt: effectiveSystemPrompt,
            model: expert.model,
            timeoutMs,
            imagePath,
          });

          // 응답 크기 체크
          if (result.content.length > MAX_RESPONSE_SIZE) {
            throw new Error(
              `Response too large (${Math.round(result.content.length / 1024 / 1024)}MB). ` +
              `Maximum allowed: ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`
            );
          }

          return result.content;
        },
        {
          maxRetries: config.retry.maxRetries,
          shouldRetry: (error) => {
            if (error instanceof RateLimitExceededError) return false;
            if (error instanceof TimeoutError) return false;
            // ExpertCallError의 retryable 필드 확인
            if (error instanceof ExpertCallError) return error.retryable;
            return true;
          }
        }
      );
    } finally {
      semaphore.release();
    }
  } catch (error) {
    // CLI 에러를 적절한 커스텀 에러로 변환
    const classified = classifyCliError(error as Error, expert.id, expert.model, timeoutMs);

    expertLogger.error({
      error: (classified as Error).message,
      errorType: (classified as Error).name,
      timeoutMs,
      model: expert.model,
      provider: provider.name,
    }, 'Expert CLI call failed');

    throw classified;
  }

  const latencyMs = Date.now() - startTime;

  // 5. 캐시 저장 (CLI 모드에서는 toolCalls가 없으므로 항상 캐시 가능)
  if (content) {
    setCache(expert.id, prompt, content, context);
  }

  expertLogger.info({
    latencyMs,
    provider: provider.name,
    contentLength: content.length,
  }, 'Expert CLI call completed');

  return {
    response: content || "",
    actualExpert: expert.id,
    fellBack: false,
    cached: false,
    latencyMs,
    // CLI 모드에서는 tool_calls 미지원 → 항상 undefined
    toolCalls: undefined,
    finishReason: "stop",
  };
}
