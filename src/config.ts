// src/config.ts

import { config as dotenvConfig } from 'dotenv';
import { Config } from './types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 프로젝트 루트 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 프로젝트 루트의 .env 파일에서 환경변수 로드 (어떤 cwd에서 실행해도 동작)
dotenvConfig({ path: join(projectRoot, '.env') });

export function loadConfig(): Config {
  return {
    cli: {
      geminiPath: process.env.CLI_GEMINI_PATH || 'gemini',
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
      byModel: {
        'gpt-5.4': 3,
        'gemini-3-flash-preview': 10
      }
    },

    models: {
      strategist: process.env.MODEL_STRATEGIST || 'gpt-5.4',
      researcher: process.env.MODEL_RESEARCHER || 'gemini-3.1-pro-preview',
      reviewer: process.env.MODEL_REVIEWER || 'gemini-3.1-pro-preview',
      frontend: process.env.MODEL_FRONTEND || 'gemini-3.1-pro-preview',
      writer: process.env.MODEL_WRITER || 'gemini-3-flash-preview',
      explorer: process.env.MODEL_EXPLORER || 'gemini-3-flash-preview',
      multimodal: process.env.MODEL_MULTIMODAL || 'gemini-3.1-pro-preview',
      // Planning Agents
      prometheus: process.env.MODEL_PROMETHEUS || 'gpt-5.4',
      metis: process.env.MODEL_METIS || 'gpt-5.4',
      momus: process.env.MODEL_MOMUS || 'gemini-3.1-pro-preview',
      librarian: process.env.MODEL_LIBRARIAN || 'gemini-3-flash-preview',
      // 특화 전문가
      security: process.env.MODEL_SECURITY || 'gpt-5.4',
      tester: process.env.MODEL_TESTER || 'gpt-5.4',
      data: process.env.MODEL_DATA || 'gpt-5.4',
      codex_reviewer: process.env.MODEL_CODEX_REVIEWER || 'gpt-5.4',
      devops: process.env.MODEL_DEVOPS || 'gpt-5.4',
      // Blank 전문가 (동적 페르소나 토론용 - GPT/Gemini만 사용)
      gpt_blank_1: process.env.MODEL_GPT_BLANK_1 || 'gpt-5.4',
      gpt_blank_2: process.env.MODEL_GPT_BLANK_2 || 'gpt-5.4',
      gemini_blank_1: process.env.MODEL_GEMINI_BLANK_1 || 'gemini-3.1-pro-preview',
      gemini_blank_2: process.env.MODEL_GEMINI_BLANK_2 || 'gemini-3-flash-preview',
      // 페르소나 할당 전문가
      debate_moderator: process.env.MODEL_DEBATE_MODERATOR || 'gemini-3.1-pro-preview'
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
