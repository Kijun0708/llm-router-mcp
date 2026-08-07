// src/services/providers/registry.ts
//
// 프로바이더 싱글톤. model-chain이 여기서 인스턴스를 가져간다.
// (index.ts가 model-chain을 re-export하므로 순환 import를 피해 별도 모듈로 분리)
//
// 이전에는 index.ts 모듈 로드 시점에 USE_ANTIGRAVITY 환경변수를 읽어
// gemini/agy 중 하나를 골랐다. 그 토글은 사라졌다 — Gemini CLI는 2026-06-18
// 공식 종료됐고 이 머신에서는 패키지 자체가 삭제되어 MODULE_NOT_FOUND를 낸다.

import type { CliProvider } from './types.js';
import type { ProviderId } from './model-registry.js';
import { CodexCliProvider } from './codex-provider.js';
import { AgyCliProvider } from './agy-provider.js';
import { ClaudeCliProvider } from './claude-provider.js';

const PROVIDERS: Record<ProviderId, CliProvider> = {
  codex: new CodexCliProvider(),
  agy: new AgyCliProvider(),
  claude: new ClaudeCliProvider(),
};

export function providerFor(id: ProviderId): CliProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown provider "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

export function listProviderIds(): ProviderId[] {
  return Object.keys(PROVIDERS) as ProviderId[];
}
