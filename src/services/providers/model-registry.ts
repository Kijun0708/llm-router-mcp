// src/services/providers/model-registry.ts
//
// 모델 → (프로바이더, 타임아웃, 동시성) 단일 레지스트리.
//
// 왜 문자열 추론을 버렸나:
//   agy(Antigravity CLI) 하나가 Gemini · Claude · GPT-OSS를 전부 서빙한다.
//   즉 "claude-opus-4-6-thinking"이라는 이름만 보고 프로바이더를 정할 수 없다.
//   (agy로 갈 수도, claude CLI로 갈 수도 있다.)
//   따라서 모델→프로바이더는 추론이 아니라 이 표에 등록된 사실이다.
//
// 2026-08-07 `agy models` / `codex --help` / `claude --help` 실측 기준.

export type ProviderId = 'codex' | 'agy' | 'claude';
export type ModelFamily = 'gpt' | 'gemini' | 'claude' | 'oss';
export type BillingProvider = 'openai' | 'anthropic' | 'google';

export interface ModelSpec {
  /** --model 에 그대로 넘기는 슬러그. */
  id: string;
  provider: ProviderId;
  family: ModelFamily;
  label: string;
  timeoutMs: number;
  /** 이 모델 단위 동시 실행 상한. */
  concurrency: number;
  /**
   * true면 폴백 체인 꼬리로는 절대 선택되지 않는다.
   * 명시적으로 요청된 체인의 0번 스텝일 때만 사용 가능.
   * 한도가 작고 비싼 모델(Claude 계열)을 실수로 태우지 않기 위한 장치.
   */
  scarce?: boolean;
  /** quota 소진 시 차단 기간. 미지정 시 DEFAULT_QUOTA_BLOCK_MS. */
  quotaBlockMs?: number;
}

export const DEFAULT_QUOTA_BLOCK_MS = 90 * 60 * 1000; // 90분 — agy quota reset 관찰값

const MINUTE = 60 * 1000;

function spec(s: ModelSpec): ModelSpec {
  return s;
}

/**
 * 등록된 모든 모델.
 *
 * 타임아웃 근거(실측): agy는 단순 파일 읽기 1건에 147초가 걸린다. 이전 substring
 * 사다리는 gpt-oss-120b-medium을 60초, claude-opus-4-6-thinking을 3분으로 떨궈
 * 사실상 항상 타임아웃이었다.
 */
export const MODELS: Record<string, ModelSpec> = {
  // ── codex (OpenAI Codex CLI) ─────────────────────────────────────────────
  'gpt-5.5': spec({
    id: 'gpt-5.5',
    provider: 'codex',
    family: 'gpt',
    label: 'GPT-5.5 (Codex)',
    timeoutMs: 20 * MINUTE,
    concurrency: 3,
  }),

  // ── agy (Antigravity CLI) — Gemini ───────────────────────────────────────
  'gemini-3.1-pro-high': spec({
    id: 'gemini-3.1-pro-high',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.1 Pro (High)',
    timeoutMs: 15 * MINUTE,
    concurrency: 6,
  }),
  'gemini-3.1-pro-low': spec({
    id: 'gemini-3.1-pro-low',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.1 Pro (Low)',
    timeoutMs: 10 * MINUTE,
    concurrency: 6,
  }),
  'gemini-3.6-flash-high': spec({
    id: 'gemini-3.6-flash-high',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.6 Flash (High)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),
  'gemini-3.6-flash-medium': spec({
    id: 'gemini-3.6-flash-medium',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.6 Flash (Medium)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),
  'gemini-3.6-flash-low': spec({
    id: 'gemini-3.6-flash-low',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.6 Flash (Low)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),
  'gemini-3.5-flash-high': spec({
    id: 'gemini-3.5-flash-high',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.5 Flash (High)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),
  'gemini-3.5-flash-medium': spec({
    id: 'gemini-3.5-flash-medium',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.5 Flash (Medium)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),
  'gemini-3.5-flash-low': spec({
    id: 'gemini-3.5-flash-low',
    provider: 'agy',
    family: 'gemini',
    label: 'Gemini 3.5 Flash (Low)',
    timeoutMs: 5 * MINUTE,
    concurrency: 10,
  }),

  // ── agy — Claude (별도 Antigravity 쿼터. 한도가 작아 scarce) ─────────────
  'claude-opus-4-6-thinking': spec({
    id: 'claude-opus-4-6-thinking',
    provider: 'agy',
    family: 'claude',
    label: 'Claude Opus 4.6 (Thinking) via agy',
    timeoutMs: 15 * MINUTE,
    concurrency: 1,
    scarce: true,
  }),
  'claude-sonnet-4-6': spec({
    id: 'claude-sonnet-4-6',
    provider: 'agy',
    family: 'claude',
    label: 'Claude Sonnet 4.6 (Thinking) via agy',
    timeoutMs: 10 * MINUTE,
    concurrency: 2,
    scarce: true,
  }),

  // ── agy — OSS ────────────────────────────────────────────────────────────
  'gpt-oss-120b-medium': spec({
    id: 'gpt-oss-120b-medium',
    provider: 'agy',
    family: 'oss',
    label: 'GPT-OSS 120B (Medium)',
    timeoutMs: 10 * MINUTE,
    concurrency: 4,
  }),

  // ── claude (Claude Code CLI, `claude -p`) ────────────────────────────────
  // 사용자 본인의 Claude 구독 한도를 소모한다. 이 MCP의 존재 이유(타 벤더 오프로드)와
  // 상충하므로 반드시 scarce — 명시 요청 시에만 도달 가능.
  opus: spec({
    id: 'opus',
    provider: 'claude',
    family: 'claude',
    label: 'Claude Opus (claude -p)',
    timeoutMs: 5 * MINUTE,
    concurrency: 2,
    scarce: true,
  }),
  sonnet: spec({
    id: 'sonnet',
    provider: 'claude',
    family: 'claude',
    label: 'Claude Sonnet (claude -p)',
    timeoutMs: 5 * MINUTE,
    concurrency: 3,
    scarce: true,
  }),
};

/**
 * family → 과금/집계용 프로바이더 라벨.
 * cost-tracking / HUD / 대시보드가 쓰는 기존 스키마('openai'|'anthropic'|'google')를
 * 유지하기 위해 경계에서만 매핑한다. 저장된 JSON 형식은 건드리지 않는다.
 */
export const FAMILY_TO_BILLING_PROVIDER: Record<ModelFamily, BillingProvider> = {
  gpt: 'openai',
  oss: 'openai',
  claude: 'anthropic',
  gemini: 'google',
};

export function isKnownModel(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODELS, id);
}

/** 미등록 모델이면 유효 목록과 함께 throw — 조용한 오작동보다 낫다. */
export function getModel(id: string): ModelSpec {
  const found = MODELS[id];
  if (!found) {
    throw new Error(
      `Unknown model "${id}". Registered models: ${Object.keys(MODELS).join(', ')}`
    );
  }
  return found;
}

export function timeoutFor(id: string): number {
  return getModel(id).timeoutMs;
}

export function familyOf(id: string): ModelFamily {
  return getModel(id).family;
}

export function providerOf(id: string): ProviderId {
  return getModel(id).provider;
}

export function concurrencyFor(id: string): number {
  return getModel(id).concurrency;
}

export function quotaBlockMsFor(id: string): number {
  return MODELS[id]?.quotaBlockMs ?? DEFAULT_QUOTA_BLOCK_MS;
}

export function isScarce(id: string): boolean {
  return MODELS[id]?.scarce === true;
}

export function listModels(provider?: ProviderId): ModelSpec[] {
  const all = Object.values(MODELS);
  return provider ? all.filter(m => m.provider === provider) : all;
}

/**
 * 미등록 모델에도 안전한 과금 프로바이더 추정.
 * 대시보드/HUD처럼 "모르면 그냥 뭔가 찍어야 하는" 경계에서만 쓴다.
 */
export function billingProviderOf(id: string): BillingProvider {
  const known = MODELS[id];
  if (known) return FAMILY_TO_BILLING_PROVIDER[known.family];
  // 레지스트리 밖의 이름(과거 로그, 사용자 지정 등)에 대한 최선 추정
  const lower = id.toLowerCase();
  if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
    return 'anthropic';
  }
  if (lower.includes('gemini')) return 'google';
  return 'openai';
}
