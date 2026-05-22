// src/services/providers/index.ts
// NOTE: Claude provider removed - Claude Code handles Claude calls natively

import { CliProvider } from './types.js';
import { GeminiCliProvider } from './gemini-provider.js';
import { AntigravityCliProvider } from './antigravity-provider.js';
import { CodexCliProvider } from './codex-provider.js';
import { detectProvider } from '../../utils/rate-limit.js';

// 싱글톤 프로바이더 인스턴스 (GPT/Gemini only)
// Antigravity CLI(agy) 1.0.0은 `-p` print mode가 child_process.spawn 환경에서
// 응답을 stdout으로 출력하지 않는 알려진 이슈가 있어 기본 비활성화.
// agy print mode가 안정화되면 USE_ANTIGRAVITY=true 로 켜서 전환 가능.
// (Gemini CLI 종료 데드라인: 2026-06-18 — 그 전에 재평가 필요)
const useAntigravity = process.env.USE_ANTIGRAVITY === 'true';
const googleProvider: CliProvider = useAntigravity
  ? new AntigravityCliProvider()
  : new GeminiCliProvider();

const providers: Record<string, CliProvider> = {
  google: googleProvider,
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
