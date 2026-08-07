// src/services/providers/index.ts
//
// 프로바이더 계층 공개 API.
//
// NOTE: Claude는 이제 지원된다 — 단 opt-in 전용이고 사용자 본인 구독 한도를 쓴다.
// 자세한 가드는 claude-provider.ts와 model-registry.ts의 scarce 플래그 참고.

export type { CliProvider, CliCallParams, CliCallResult, SandboxMode, TokenUsage, ParseOutcome } from './types.js';
export { CliProviderError } from './types.js';

export type { ProviderId, ModelFamily, ModelSpec, BillingProvider } from './model-registry.js';
export {
  MODELS,
  getModel,
  isKnownModel,
  timeoutFor,
  familyOf,
  providerOf,
  concurrencyFor,
  isScarce,
  listModels,
  billingProviderOf,
  FAMILY_TO_BILLING_PROVIDER,
} from './model-registry.js';

export { providerFor, listProviderIds } from './registry.js';
export { runModelChain, composeChain, type ChainStep, type ChainResult, type ChainAttempt } from './model-chain.js';
export { getSemaphore, semaphoreSnapshot, Semaphore } from './concurrency.js';
export {
  isBlocked as isModelBlocked,
  block as blockModel,
  unblockAt as modelUnblockAt,
  snapshot as quotaSnapshot,
} from './quota-registry.js';
