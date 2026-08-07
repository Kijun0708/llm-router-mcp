// src/config.ts

import { config as dotenvConfig } from 'dotenv';
import { Config } from './types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MODEL_IDS, EXPERT_IDS, type ExpertId } from './model-defaults.js';
import { MODELS, isKnownModel } from './services/providers/model-registry.js';

// 프로젝트 루트 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 프로젝트 루트의 .env 파일에서 환경변수 로드 (어떤 cwd에서 실행해도 동작)
dotenvConfig({ path: join(projectRoot, '.env') });

/** MODEL_<EXPERT_ID> 환경변수 이름. */
function modelEnvName(id: ExpertId): string {
  return `MODEL_${id.toUpperCase()}`;
}

/**
 * 전문가별 모델 결정 + 검증.
 * 미등록 슬러그는 로드 시점에 터뜨린다 — 새벽 3시에 CLI가 "invalid model selection"을
 * 뱉는 것보다 부팅 실패가 낫다.
 */
function resolveModels(): Record<ExpertId, string> {
  const out = {} as Record<ExpertId, string>;
  const invalid: string[] = [];

  for (const id of EXPERT_IDS) {
    const override = process.env[modelEnvName(id)];
    const model = override || DEFAULT_MODEL_IDS[id];
    if (!isKnownModel(model)) {
      invalid.push(`${id}="${model}"${override ? ` (${modelEnvName(id)})` : ''}`);
    }
    out[id] = model;
  }

  if (invalid.length > 0) {
    throw new Error(
      `Unknown model(s) in expert configuration: ${invalid.join(', ')}. ` +
      `Registered models: ${Object.keys(MODELS).join(', ')}`
    );
  }

  return out;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): Config {
  return {
    cli: {
      // Antigravity CLI(agy) — Google 계열 유일 프로바이더.
      // Gemini CLI는 2026-06-18 공식 종료되어 제거됐다.
      // Windows 기본 설치 경로: %LOCALAPPDATA%\agy\bin\agy.exe
      // CLI_ANTIGRAVITY_PATH는 구버전 .env 호환용 별칭.
      agyPath: process.env.CLI_AGY_PATH || process.env.CLI_ANTIGRAVITY_PATH || 'agy',
      codexPath: process.env.CLI_CODEX_PATH || 'codex',
      // opt-in 전용. 사용자 본인 Claude 구독 한도를 소모한다.
      claudePath: process.env.CLI_CLAUDE_PATH || 'claude',
    },

    // claude -p 호출당 비용 상한(USD). 0이면 상한 없음.
    claudeMaxBudgetUsd: floatEnv('CLAUDE_MAX_BUDGET_USD', 1.0),

    exaApiKey: process.env.EXA_API_KEY,
    context7ApiKey: process.env.CONTEXT7_API_KEY,

    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttlMs: intEnv('CACHE_TTL_MS', 1800000), // 30분
      maxSize: intEnv('CACHE_MAX_SIZE', 100),
    },

    retry: {
      maxRetries: intEnv('RETRY_MAX', 3),
      baseDelayMs: intEnv('RETRY_BASE_DELAY_MS', 1000),
      maxDelayMs: intEnv('RETRY_MAX_DELAY_MS', 30000),
    },

    concurrency: {
      default: intEnv('CONCURRENCY_DEFAULT', 5),
      byProvider: {
        // CONCURRENCY_OPENAI/GOOGLE은 구버전 .env 호환 별칭.
        // 별칭이 없으면 기존 설정이 조용히 기본값으로 떨어진다.
        codex: intEnv('CONCURRENCY_CODEX', intEnv('CONCURRENCY_OPENAI', 5)),
        agy: intEnv('CONCURRENCY_AGY', intEnv('CONCURRENCY_GOOGLE', 10)),
        // 사용자 본인 한도를 쓰므로 보수적으로.
        claude: intEnv('CONCURRENCY_CLAUDE', 2),
      },
      // 모델별 상한은 model-registry의 concurrency가 담당한다.
      byModel: {},
    },

    models: resolveModels(),

    hybrid: {
      enabled: process.env.HYBRID_RESPONSE_ENABLED !== 'false',
      inlineThresholdChars: intEnv('HYBRID_THRESHOLD_CHARS', 2000),
      alwaysSaveWorkflows: process.env.HYBRID_ALWAYS_SAVE_WORKFLOWS !== 'false',
      cleanupMaxAgeMs: intEnv('HYBRID_CLEANUP_MAX_AGE_MS', 86400000),
      previewLines: intEnv('HYBRID_PREVIEW_LINES', 5),
    },
  };
}

export let config = loadConfig();

/**
 * 런타임에 config 재로드.
 * NOTE: 프로바이더 인스턴스는 registry.ts의 싱글톤이라 재로드해도 교체되지 않는다.
 * CLI 경로 변경은 프로세스 재시작이 필요하다.
 */
export function reloadConfig(): void {
  config = loadConfig();
}
