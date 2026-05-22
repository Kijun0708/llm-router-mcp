// src/config.ts

import { config as dotenvConfig } from 'dotenv';
import { Config } from './types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MODEL_CONCURRENCY, DEFAULT_MODEL_IDS } from './model-defaults.js';

// 프로젝트 루트 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 프로젝트 루트의 .env 파일에서 환경변수 로드 (어떤 cwd에서 실행해도 동작)
dotenvConfig({ path: join(projectRoot, '.env') });

export function loadConfig(): Config {
  return {
    cli: {
      // Gemini CLI — 현재 active provider
      geminiPath: process.env.CLI_GEMINI_PATH || 'gemini',
      // Antigravity CLI(agy) — Gemini CLI 후속작. USE_ANTIGRAVITY=true 일 때만 활성.
      // Windows 기본 설치 경로: %LOCALAPPDATA%\agy\bin\agy.exe
      // agy 1.0.0의 print mode가 spawn 환경에서 응답 미반환 이슈가 있어 기본 비활성.
      antigravityPath: process.env.CLI_ANTIGRAVITY_PATH || 'agy',
      claudePath: '',  // unused - Claude Code handles Claude natively
      codexPath: process.env.CLI_CODEX_PATH || 'codex',
    },
    exaApiKey: process.env.EXA_API_KEY,
    context7ApiKey: process.env.CONTEXT7_API_KEY,

    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttlMs: parseInt(process.env.CACHE_TTL_MS || '1800000'), // 30분
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100')
    },

    retry: {
      maxRetries: parseInt(process.env.RETRY_MAX || '3'),
      baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000'),
      maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000')
    },

    concurrency: {
      default: parseInt(process.env.CONCURRENCY_DEFAULT || '5'),
      byProvider: {
        openai: parseInt(process.env.CONCURRENCY_OPENAI || '5'),
        google: parseInt(process.env.CONCURRENCY_GOOGLE || '10')
      },
      byModel: { ...DEFAULT_MODEL_CONCURRENCY }
    },

    models: {
      strategist: process.env.MODEL_STRATEGIST || DEFAULT_MODEL_IDS.strategist,
      codereview: process.env.MODEL_CODEREVIEW || DEFAULT_MODEL_IDS.codereview,
      frontend: process.env.MODEL_FRONTEND || DEFAULT_MODEL_IDS.frontend,
      metis: process.env.MODEL_METIS || DEFAULT_MODEL_IDS.metis,
      momus: process.env.MODEL_MOMUS || DEFAULT_MODEL_IDS.momus,
      // 특화 전문가
      security: process.env.MODEL_SECURITY || DEFAULT_MODEL_IDS.security,
      tester: process.env.MODEL_TESTER || DEFAULT_MODEL_IDS.tester,
      data: process.env.MODEL_DATA || DEFAULT_MODEL_IDS.data,
      devops: process.env.MODEL_DEVOPS || DEFAULT_MODEL_IDS.devops,
      reality_checker: process.env.MODEL_REALITY_CHECKER || DEFAULT_MODEL_IDS.reality_checker,
      lsp_index_engineer: process.env.MODEL_LSP_INDEX_ENGINEER || DEFAULT_MODEL_IDS.lsp_index_engineer,
      codereview_gpt: process.env.MODEL_CODEREVIEW_GPT || DEFAULT_MODEL_IDS.codereview_gpt,
      implementer: process.env.MODEL_IMPLEMENTER || DEFAULT_MODEL_IDS.implementer,
      // Blank 전문가 (동적 페르소나 토론용 - GPT/Gemini만 사용)
      gpt_blank_1: process.env.MODEL_GPT_BLANK_1 || DEFAULT_MODEL_IDS.gpt_blank_1,
      gpt_blank_2: process.env.MODEL_GPT_BLANK_2 || DEFAULT_MODEL_IDS.gpt_blank_2,
      gemini_blank_1: process.env.MODEL_GEMINI_BLANK_1 || DEFAULT_MODEL_IDS.gemini_blank_1,
      gemini_blank_2: process.env.MODEL_GEMINI_BLANK_2 || DEFAULT_MODEL_IDS.gemini_blank_2,
      // 페르소나 할당 전문가
      debate_moderator: process.env.MODEL_DEBATE_MODERATOR || DEFAULT_MODEL_IDS.debate_moderator
    },

    hybrid: {
      enabled: process.env.HYBRID_RESPONSE_ENABLED !== 'false',
      inlineThresholdChars: parseInt(process.env.HYBRID_THRESHOLD_CHARS || '2000'),
      alwaysSaveWorkflows: process.env.HYBRID_ALWAYS_SAVE_WORKFLOWS !== 'false',
      cleanupMaxAgeMs: parseInt(process.env.HYBRID_CLEANUP_MAX_AGE_MS || '86400000'),
      previewLines: parseInt(process.env.HYBRID_PREVIEW_LINES || '5'),
    }
  };
}

export let config = loadConfig();

/**
 * 런타임에 config 재로드
 */
export function reloadConfig(): void {
  config = loadConfig();
}
