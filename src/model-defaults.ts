// src/model-defaults.ts
//
// 전문가 18명의 런타임 기본값 (프로바이더 / 모델 / 권한).
//
// 정책:
//  - 기본 작업은 codex(GPT) + agy(Gemini)만 쓴다. Claude는 어떤 전문가의 기본값도 아니다.
//    consult_expert 등의 model 파라미터로 명시 요청할 때만 도달한다.
//  - implementer만 workspace-write. 나머지 17명은 read-only.
//    (이전에는 전원 workspace-write라 READ-ONLY 전문가도 파일을 고칠 수 있었다)

import type { ProviderId, SandboxMode } from './services/providers/index.js';

export interface ExpertRuntimeDefault {
  provider: ProviderId;
  model: string;
  sandbox: SandboxMode;
}

const CODEX_READ: Omit<ExpertRuntimeDefault, 'model'> & { model: string } = {
  provider: 'codex',
  model: 'gpt-5.5',
  sandbox: 'read-only',
};

const GEMINI_PRO_READ: ExpertRuntimeDefault = {
  provider: 'agy',
  model: 'gemini-3.1-pro-high',
  sandbox: 'read-only',
};

export const EXPERT_RUNTIME_DEFAULTS = {
  // ── GPT (codex) ──────────────────────────────────────────────────────────
  strategist: { ...CODEX_READ },
  metis: { ...CODEX_READ },
  security: { ...CODEX_READ },
  tester: { ...CODEX_READ },
  data: { ...CODEX_READ },
  devops: { ...CODEX_READ },
  lsp_index_engineer: { ...CODEX_READ },
  codereview_gpt: { ...CODEX_READ },
  gpt_blank_1: { ...CODEX_READ },
  gpt_blank_2: { ...CODEX_READ },

  // 유일한 쓰기 권한 전문가
  implementer: { provider: 'codex', model: 'gpt-5.5', sandbox: 'workspace-write' },

  // ── Gemini (agy) ─────────────────────────────────────────────────────────
  codereview: { ...GEMINI_PRO_READ },
  frontend: { ...GEMINI_PRO_READ },
  momus: { ...GEMINI_PRO_READ },
  reality_checker: { ...GEMINI_PRO_READ },
  gemini_blank_1: { ...GEMINI_PRO_READ },
  debate_moderator: { ...GEMINI_PRO_READ },

  // 빠른 응답용
  gemini_blank_2: { provider: 'agy', model: 'gemini-3.6-flash-high', sandbox: 'read-only' },
} as const satisfies Record<string, ExpertRuntimeDefault>;

export type ExpertId = keyof typeof EXPERT_RUNTIME_DEFAULTS;

export const EXPERT_IDS = Object.keys(EXPERT_RUNTIME_DEFAULTS) as ExpertId[];

/** 모델 문자열만 뽑은 맵. config.models 기본값으로 쓴다. */
export const DEFAULT_MODEL_IDS = Object.fromEntries(
  Object.entries(EXPERT_RUNTIME_DEFAULTS).map(([id, d]) => [id, d.model])
) as Record<ExpertId, string>;

/** 표시용 모델 계열 라벨. 스킬 문서/health 출력에서 쓴다. */
export const DEFAULT_MODEL_FAMILIES: Record<ExpertId, string> = {
  strategist: 'GPT',
  metis: 'GPT',
  security: 'GPT',
  tester: 'GPT',
  data: 'GPT',
  devops: 'GPT',
  lsp_index_engineer: 'GPT',
  codereview_gpt: 'GPT',
  gpt_blank_1: 'GPT',
  gpt_blank_2: 'GPT',
  implementer: 'GPT',
  codereview: 'Gemini Pro',
  frontend: 'Gemini Pro',
  momus: 'Gemini Pro',
  reality_checker: 'Gemini Pro',
  gemini_blank_1: 'Gemini Pro',
  debate_moderator: 'Gemini Pro',
  gemini_blank_2: 'Gemini Flash',
};
