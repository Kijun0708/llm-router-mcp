// src/services/providers/index.ts
// NOTE: Claude provider removed - Claude Code handles Claude calls natively

import { CliProvider } from './types.js';
import { GeminiCliProvider } from './gemini-provider.js';
import { CodexCliProvider } from './codex-provider.js';
import { detectProvider } from '../../utils/rate-limit.js';

// 싱글톤 프로바이더 인스턴스 (GPT/Gemini only)
const providers: Record<string, CliProvider> = {
  google: new GeminiCliProvider(),
  openai: new CodexCliProvider(),
};

/**
 * 모델명으로 적절한 CLI 프로바이더를 반환
 * NOTE: anthropic 모델은 지원하지 않음 (Claude Code가 직접 처리)
 */
export function getProvider(model: string): CliProvider {
  const providerType = detectProvider(model);

  if (providerType === 'anthropic') {
    throw new Error(
      `Claude models are not supported via MCP. ` +
      `Claude Code handles Claude calls natively. ` +
      `Model: ${model}`
    );
  }

  return providers[providerType] || providers.google;
}

export { CliProvider, CliCallParams, CliCallResult } from './types.js';
export { getProviderSemaphore } from './concurrency.js';
