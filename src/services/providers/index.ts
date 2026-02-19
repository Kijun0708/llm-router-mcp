// src/services/providers/index.ts

import { CliProvider } from './types.js';
import { GeminiCliProvider } from './gemini-provider.js';
import { ClaudeCliProvider } from './claude-provider.js';
import { CodexCliProvider } from './codex-provider.js';
import { detectProvider } from '../../utils/rate-limit.js';

// 싱글톤 프로바이더 인스턴스
const providers: Record<string, CliProvider> = {
  google: new GeminiCliProvider(),
  anthropic: new ClaudeCliProvider(),
  openai: new CodexCliProvider(),
};

/**
 * 모델명으로 적절한 CLI 프로바이더를 반환
 */
export function getProvider(model: string): CliProvider {
  const providerType = detectProvider(model);
  return providers[providerType] || providers.google;
}

export { CliProvider, CliCallParams, CliCallResult } from './types.js';
export { getProviderSemaphore } from './concurrency.js';
