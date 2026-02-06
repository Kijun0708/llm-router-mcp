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

export function loadConfig(overridePort?: number): Config {
  // CLIPROXY_URL은 환경변수로 반드시 설정해야 함
  const baseUrl = process.env.CLIPROXY_URL;
  if (!baseUrl && !overridePort) {
    throw new Error(
      'CLIPROXY_URL 환경변수가 설정되지 않았습니다. ' +
      '.env 파일 또는 환경변수에 CLIPROXY_URL=http://127.0.0.1:<PORT>를 설정하세요.'
    );
  }
  const cliproxyUrl = overridePort
    ? `http://127.0.0.1:${overridePort}`
    : baseUrl!;

  return {
    cliproxyUrl,
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
        'claude-opus-4-5-20251101': 2,
        'gpt-5.2': 3,
        'gemini-3-flash-preview': 10
      }
    },

    models: {
      strategist: process.env.MODEL_STRATEGIST || 'gpt-5.2',  // GPT 5.2 사용
      researcher: process.env.MODEL_RESEARCHER || 'claude-sonnet-4-5-20250929',
      reviewer: process.env.MODEL_REVIEWER || 'gemini-3-pro-preview',
      frontend: process.env.MODEL_FRONTEND || 'gemini-3-pro-preview',
      writer: process.env.MODEL_WRITER || 'gemini-3-flash-preview',
      explorer: process.env.MODEL_EXPLORER || 'gemini-3-flash-preview',
      multimodal: process.env.MODEL_MULTIMODAL || 'gemini-3-pro-preview',  // Multimodal analysis
      // Planning Agents
      prometheus: process.env.MODEL_PROMETHEUS || 'claude-sonnet-4-5-20250929',  // Strategic planning
      metis: process.env.MODEL_METIS || 'gpt-5.2',  // Pre-planning analysis
      momus: process.env.MODEL_MOMUS || 'gemini-3-pro-preview',  // Plan validation
      librarian: process.env.MODEL_LIBRARIAN || 'claude-sonnet-4-5-20250929',  // Multi-repo analysis
      // 특화 전문가
      security: process.env.MODEL_SECURITY || 'claude-sonnet-4-5-20250929',  // 보안 취약점 분석
      tester: process.env.MODEL_TESTER || 'claude-sonnet-4-5-20250929',  // TDD/테스트 전략
      data: process.env.MODEL_DATA || 'gpt-5.2',  // DB 설계/쿼리 최적화
      codex_reviewer: process.env.MODEL_CODEX_REVIEWER || 'gpt-5.3-codex',  // GPT 코드리뷰
      // Blank 전문가 (동적 페르소나 토론용 - 다양한 모델)
      gpt_blank_1: process.env.MODEL_GPT_BLANK_1 || 'gpt-5.2',
      gpt_blank_2: process.env.MODEL_GPT_BLANK_2 || 'gpt-5.3-codex',
      claude_blank_1: process.env.MODEL_CLAUDE_BLANK_1 || 'claude-opus-4-6',
      claude_blank_2: process.env.MODEL_CLAUDE_BLANK_2 || 'claude-sonnet-4-5-20250929',
      gemini_blank_1: process.env.MODEL_GEMINI_BLANK_1 || 'gemini-3-pro-preview',
      gemini_blank_2: process.env.MODEL_GEMINI_BLANK_2 || 'gemini-3-flash-preview',
      // 페르소나 할당 전문가
      debate_moderator: process.env.MODEL_DEBATE_MODERATOR || 'claude-sonnet-4-5-20250929'
    }
  };
}

export let config = loadConfig();

/**
 * 런타임에 config 재로드 (포트 변경 시 사용)
 */
export function reloadConfig(overridePort?: number): void {
  config = loadConfig(overridePort);
}
