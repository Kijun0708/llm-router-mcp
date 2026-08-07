// src/services/cliproxy-client.ts

import { Expert, ExpertResponse, ToolDefinition, ToolCall, ChatMessage, MessageContent, TextContent, ImageUrlContent } from '../types.js';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { config } from '../config.js';
import { logger, createExpertLogger } from '../utils/logger.js';
import { getCached, setCache } from '../utils/cache.js';
import { markRateLimited, isCurrentlyLimited } from '../utils/rate-limit.js';
import { ERROR_POLICY, kindOf, type ErrorKind } from '../utils/errors.js';
import { withRetry } from '../utils/retry.js';
import {
  runModelChain,
  composeChain,
  timeoutFor,
  getModel,
  type ChainStep,
  type CliCallParams,
} from './providers/index.js';

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

/** rate limit 트래커 기본 차단 시간. */
const RATE_LIMIT_DEFAULT_MS = 60_000;

/**
 * 통합 분류(utils/errors)의 ErrorKind를 기존 커스텀 에러 클래스로 매핑한다.
 *
 * 클래스 자체는 유지한다 — 여러 도구가 instanceof로 분기하고 있다.
 * 바뀐 것은 "분류를 여기서 문자열로 다시 하지 않는다"는 점이다.
 */
function toLegacyError(error: unknown, expertId: string, model: string, timeoutMs: number): Error {
  const kind: ErrorKind = kindOf(error);
  const original = error instanceof Error ? error : new Error(String(error));

  switch (kind) {
    case 'timeout':
      return new TimeoutError(expertId, model, timeoutMs);
    case 'quota':
      markRateLimited(model, RATE_LIMIT_DEFAULT_MS);
      return new RateLimitExceededError(expertId, model, RATE_LIMIT_DEFAULT_MS);
    default:
      return new ExpertCallError(expertId, original, ERROR_POLICY[kind].tryFallbackExpert);
  }
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
  /**
   * 이 호출에만 적용할 모델 슬러그 (MODELS의 키).
   * 전문가 기본 모델 앞에 붙어 0번 스텝이 되므로 scarce 모델(Claude 계열)도 여기서만 도달 가능하다.
   * 한도 소진 시 자동으로 전문가 기본 모델로 강등된다.
   */
  model?: string;
  /** CLI 작업 루트. 기본 process.cwd(). */
  workspaceDir?: string;
}

/** 전문가 + 요청 모델 → 실행할 모델 체인. */
export function buildExpertChain(expert: Expert, requestedModel?: string): ChainStep[] {
  const base: ChainStep[] = expert.modelChain?.length
    ? expert.modelChain
    : [{ provider: expert.provider, model: expert.model }];

  if (!requestedModel) return base;

  // getModel이 미등록 슬러그를 여기서 터뜨린다 (CLI까지 가서 실패하지 않도록)
  const spec = getModel(requestedModel);
  return composeChain(base, { provider: spec.provider, model: spec.id });
}

export async function callExpert(
  expert: Expert,
  prompt: string,
  options: CallExpertOptions = {}
): Promise<ExpertResponse> {
  const { context, skipCache = false, tools, toolChoice, messages, imagePath, workspaceDir } = options;
  const expertLogger = createExpertLogger(expert.id);
  const startTime = Date.now();

  const chain = buildExpertChain(expert, options.model);

  // 1. 현재 Rate Limit 상태 체크 — 체인 전체가 막혔을 때만 조기 실패한다.
  //    (예전엔 expert.model 하나만 보고 던져서, 대체 모델이 멀쩡해도 폴백으로 새어나갔다)
  if (chain.every(step => isCurrentlyLimited(step.model))) {
    expertLogger.warn({ chain }, 'All models in chain are rate limited, will try fallback expert');
    throw new RateLimitExceededError(expert.id, expert.model, 0);
  }

  // 2. 캐시 체크 (이미지가 없는 경우만).
  //    명시 모델 요청은 캐시 키에 반영되어야 하므로 options.model을 컨텍스트에 섞는다.
  const cacheContext = options.model ? `${context ?? ''}\n[model:${options.model}]` : context;
  if (!skipCache && !imagePath) {
    const cached = getCached(expert.id, prompt, cacheContext);
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
  }

  // 이미지: codex는 -i 로 진짜 첨부한다. agy/claude는 미지원이라 프로바이더가 거절하므로,
  // 텍스트 힌트는 codex가 아닌 경로에만 남긴다.
  const imagePaths = imagePath ? [imagePath] : undefined;
  if (imagePath && chain[0].provider !== 'codex') {
    effectivePrompt += `\n\n[이미지 첨부: ${imagePath}]`;
    expertLogger.debug({ imagePath }, 'Including image reference in prompt (non-codex provider)');
  }

  const cwd = workspaceDir ?? process.cwd();

  const buildParams = (step: ChainStep): CliCallParams => ({
    prompt: effectivePrompt,
    systemPrompt: effectiveSystemPrompt,
    model: step.model,
    timeoutMs: expert.timeoutMs ?? timeoutFor(step.model),
    sandbox: expert.sandbox,
    workspaceDir: cwd,
    imagePaths: step.provider === 'codex' ? imagePaths : undefined,
    expertId: expert.id,
  });

  expertLogger.debug({
    chain,
    sandbox: expert.sandbox,
    promptLength: effectivePrompt.length,
  }, 'Calling CLI provider chain');

  // 4. CLI 호출.
  //    동시성 제어는 runModelChain 안에서 스텝 단위로 잡는다 — 예전처럼 체인 바깥에서
  //    하나를 붙들면 멈춘 호출이 다른 모델의 슬롯까지 점유한다.
  const chainResult = await withRetry(
    async () => {
      const result = await runModelChain(chain, buildParams, {
        expertId: expert.id,
        providerConcurrency: config.concurrency.byProvider,
      });

      if (result.content.length > MAX_RESPONSE_SIZE) {
        throw new Error(
          `Response too large (${Math.round(result.content.length / 1024 / 1024)}MB). ` +
          `Maximum allowed: ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`
        );
      }

      return result;
    },
    {
      maxRetries: config.retry.maxRetries,
      shouldRetry: (error) => ERROR_POLICY[kindOf(error)].retrySameModel,
    }
  ).catch((error: unknown) => {
    const classified = toLegacyError(error, expert.id, expert.model, expert.timeoutMs ?? timeoutFor(expert.model));
    expertLogger.error({
      error: classified.message,
      errorType: classified.name,
      kind: kindOf(error),
      chain,
    }, 'Expert CLI call failed');
    throw classified;
  });

  const content = chainResult.content;
  const latencyMs = Date.now() - startTime;

  // 5. 캐시 저장 (CLI 모드에서는 toolCalls가 없으므로 항상 캐시 가능)
  if (content) {
    setCache(expert.id, prompt, content, cacheContext);
  }

  expertLogger.info({
    latencyMs,
    provider: chainResult.provider,
    model: chainResult.model,
    contentLength: content.length,
    usage: chainResult.usage,
  }, 'Expert CLI call completed');

  return {
    response: content || "",
    actualExpert: expert.id,
    fellBack: false,
    cached: false,
    latencyMs,
    actualModel: chainResult.model,
    usage: chainResult.usage,
    // CLI 모드에서는 tool_calls 미지원 → 항상 undefined
    toolCalls: undefined,
    finishReason: "stop",
  };
}
