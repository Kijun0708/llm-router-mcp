// src/config.ts

import { Config } from './types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 프로젝트 루트 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 기본 CLIProxyAPI 경로 (번들된 실행파일)
const defaultCliproxyPath = join(projectRoot, 'vendor', 'cliproxy', 'cli-proxy-api.exe');

export function loadConfig(): Config {
  return {
    cliproxyUrl: process.env.CLIPROXY_URL || 'http://localhost:8787',
    cliproxyPath: process.env.CLIPROXY_PATH || defaultCliproxyPath,  // CLIProxyAPI 실행 파일 경로
    exaApiKey: process.env.EXA_API_KEY,       // Exa AI 검색 API 키
    context7ApiKey: process.env.CONTEXT7_API_KEY, // Context7 문서 API 키

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
        anthropic: parseInt(process.env.CONCURRENCY_ANTHROPIC || '3'),
        openai: parseInt(process.env.CONCURRENCY_OPENAI || '5'),
        google: parseInt(process.env.CONCURRENCY_GOOGLE || '10')
      },
      byModel: {
        'claude-opus-4-5': 2,
        'gpt-5.2': 3,
        'gemini-3.0-flash': 10
      }
    },

    models: {
      strategist: process.env.MODEL_STRATEGIST || 'gpt-5.2',  // GPT 5.2 사용
      researcher: process.env.MODEL_RESEARCHER || 'claude-sonnet-4-5-20250929',
      reviewer: process.env.MODEL_REVIEWER || 'gemini-2.5-pro',
      frontend: process.env.MODEL_FRONTEND || 'gemini-2.5-pro',
      writer: process.env.MODEL_WRITER || 'gemini-2.5-flash',
      explorer: process.env.MODEL_EXPLORER || 'gemini-2.5-flash'
    }
  };
}

export const config = loadConfig();
