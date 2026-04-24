// src/features/cost-tracking/types.ts

/**
 * Cost Tracking Types
 *
 * API 호출 비용 추적 및 통계 시스템
 */

/**
 * LLM 프로바이더
 */
export type Provider = 'openai' | 'anthropic' | 'google';

/**
 * 토큰 가격 정보 (USD per 1M tokens)
 */
export interface ModelPricing {
  modelId: string;
  provider: Provider;
  displayName: string;
  inputPricePerMillion: number;   // 입력 토큰 가격 ($/1M)
  outputPricePerMillion: number;  // 출력 토큰 가격 ($/1M)
  cachedInputPricePerMillion?: number; // 캐시된 입력 가격
  updatedAt: string;
}

/**
 * 토큰 사용량
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
}

/**
 * 단일 API 호출 기록
 */
export interface ApiCallRecord {
  id: string;
  timestamp: string;
  expertId: string;
  modelId: string;
  provider: Provider;
  usage: TokenUsage;
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: 'USD';
  };
  cached: boolean;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * 비용 통계
 */
export interface CostStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  cachedCalls: number;
  averageCostPerCall: number;
  byProvider: Record<Provider, ProviderStats>;
  byExpert: Record<string, ExpertStats>;
  byModel: Record<string, ModelStats>;
}

/**
 * 프로바이더별 통계
 */
export interface ProviderStats {
  totalCost: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Expert별 통계
 */
export interface ExpertStats {
  totalCost: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  primaryModel: string;
}

/**
 * 모델별 통계
 */
export interface ModelStats {
  totalCost: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  averageInputTokens: number;
  averageOutputTokens: number;
}

/**
 * 일별 비용 요약
 */
export interface DailySummary {
  date: string;  // YYYY-MM-DD
  totalCost: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  byProvider: Record<Provider, number>;
}

/**
 * 예산 설정
 */
export interface BudgetConfig {
  enabled: boolean;
  dailyLimit?: number;     // USD
  monthlyLimit?: number;   // USD
  alertThreshold: number;  // 0-1 (예: 0.8 = 80%)
  hardLimit: boolean;      // true면 한도 초과 시 차단
}

/**
 * Cost Tracking 설정
 */
export interface CostTrackingConfig {
  version: string;
  enabled: boolean;
  currency: 'USD' | 'KRW';
  exchangeRate: number;     // USD to KRW
  budget: BudgetConfig;
  pricing: ModelPricing[];
  retentionDays: number;    // 기록 보관 일수
}

/**
 * 비용 알림
 */
export interface CostAlert {
  type: 'threshold' | 'limit_reached' | 'anomaly';
  message: string;
  currentCost: number;
  limit: number;
  percentage: number;
  timestamp: string;
}

/**
 * 기본 모델 가격 정보 (2025년 기준)
 */
export const DEFAULT_MODEL_PRICING: ModelPricing[] = [
  // OpenAI
  {
    modelId: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    cachedInputPricePerMillion: 0.075,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gpt-4-turbo',
    provider: 'openai',
    displayName: 'GPT-4 Turbo',
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gpt-5.5',
    provider: 'openai',
    displayName: 'GPT-5.5',
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 2.50,
    updatedAt: '2026-03-01'
  },
  {
    modelId: 'o1',
    provider: 'openai',
    displayName: 'O1',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 60.00,
    cachedInputPricePerMillion: 7.50,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'o1-mini',
    provider: 'openai',
    displayName: 'O1 Mini',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 12.00,
    cachedInputPricePerMillion: 1.50,
    updatedAt: '2025-01-01'
  },

  // Anthropic
  {
    modelId: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'claude-3-opus-20240229',
    provider: 'anthropic',
    displayName: 'Claude 3 Opus',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachedInputPricePerMillion: 1.50,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    displayName: 'Claude 3 Haiku',
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cachedInputPricePerMillion: 0.03,
    updatedAt: '2025-01-01'
  },

  // Google
  {
    modelId: 'gemini-2.5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
    cachedInputPricePerMillion: 0.31,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gemini-2.5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30,
    cachedInputPricePerMillion: 0.01875,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gemini-2.0-flash',
    provider: 'google',
    displayName: 'Gemini 2.0 Flash',
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
    cachedInputPricePerMillion: 0.025,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gemini-1.5-pro',
    provider: 'google',
    displayName: 'Gemini 1.5 Pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
    cachedInputPricePerMillion: 0.31,
    updatedAt: '2025-01-01'
  },
  {
    modelId: 'gemini-3.1-pro-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Pro',
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 12.00,
    cachedInputPricePerMillion: 0.50,
    updatedAt: '2026-02-28'
  },
  {
    modelId: 'gemini-3-flash-preview',
    provider: 'google',
    displayName: 'Gemini 3 Flash',
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 3.00,
    cachedInputPricePerMillion: 0.125,
    updatedAt: '2026-02-28'
  },
  {
    modelId: 'gemini-3.1-flash-lite-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Flash Lite',
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.50,
    cachedInputPricePerMillion: 0.0625,
    updatedAt: '2026-04-24'
  }
];

/**
 * 기본 예산 설정
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  enabled: false,
  dailyLimit: 10.00,     // $10/day
  monthlyLimit: 100.00,  // $100/month
  alertThreshold: 0.8,   // 80%
  hardLimit: false
};

/**
 * 프로바이더 표시 정보
 */
export const PROVIDER_INFO: Record<Provider, { emoji: string; name: string; color: string }> = {
  openai: { emoji: '🟢', name: 'OpenAI', color: 'green' },
  anthropic: { emoji: '🟠', name: 'Anthropic', color: 'orange' },
  google: { emoji: '🔵', name: 'Google', color: 'blue' }
};
