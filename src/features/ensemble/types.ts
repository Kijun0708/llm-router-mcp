// src/features/ensemble/types.ts

/**
 * Multi-Model Ensemble Types
 *
 * 여러 LLM을 조합하여 더 나은 결과를 얻는 앙상블 시스템
 */

/**
 * 앙상블 전략
 */
export type EnsembleStrategy =
  | 'parallel'      // 병렬 실행 후 결과 병합
  | 'synthesize'    // 병렬 실행 후 합성
  | 'vote'          // 투표 (이산적 선택)
  | 'best_of_n'     // N번 실행 후 최고 선택
  | 'chain';        // 체인 (이전 결과를 다음에 전달)

/**
 * 결과 집계 방식
 */
export type AggregationMethod =
  | 'concatenate'   // 단순 연결 (출처 표기)
  | 'synthesize'    // 합성 모델이 통합
  | 'vote'          // 다수결
  | 'weighted'      // 가중 평균
  | 'best';         // 최고 선택

/**
 * 앙상블 참여 전문가 설정
 */
export interface EnsembleParticipant {
  expertId: string;
  weight?: number;        // 가중치 (기본 1.0)
  role?: string;          // 역할 설명 (debate 모드용)
  customPrompt?: string;  // 커스텀 프롬프트 (선택)
}

/**
 * 앙상블 설정
 */
export interface EnsembleConfig {
  /** 앙상블 전략 */
  strategy: EnsembleStrategy;

  /** 참여 전문가 목록 */
  participants: EnsembleParticipant[];

  /** 결과 집계 방식 */
  aggregation: AggregationMethod;

  /** 합성 담당 전문가 (synthesize 전략용) */
  synthesizer?: string;

  /** 실행 횟수 (best_of_n 전략용) */
  n?: number;

  /** 타임아웃 (ms) */
  timeout?: number;

  /** 캐시 사용 여부 */
  useCache?: boolean;
}

/**
 * 개별 전문가 응답
 */
export interface ParticipantResponse {
  expertId: string;
  model: string;
  response: string;
  latencyMs: number;
  cached: boolean;
  fellBack: boolean;
  weight: number;
  error?: string;
}

/**
 * 투표 결과
 */
export interface VoteResult {
  option: string;
  votes: number;
  percentage: number;
  voters: string[];
}

/**
 * 토론 라운드
 */
export interface DebateRound {
  round: number;
  speaker: string;
  content: string;
  responseTo?: string;
}

/**
 * 앙상블 실행 결과
 */
export interface EnsembleResult {
  /** 앙상블 ID */
  id: string;

  /** 사용된 전략 */
  strategy: EnsembleStrategy;

  /** 원본 쿼리 */
  query: string;

  /** 개별 응답들 */
  responses: ParticipantResponse[];

  /** 최종 결과 */
  finalResult: string;

  /** 집계 방식 */
  aggregation: AggregationMethod;

  /** 합성자 (있는 경우) */
  synthesizedBy?: string;

  /** 투표 결과 (vote 전략용) */
  voteResults?: VoteResult[];

  /** 토론 기록 (debate 전략용) */
  debateHistory?: DebateRound[];

  /** 총 소요 시간 (ms) */
  totalLatencyMs: number;

  /** 성공한 응답 수 */
  successCount: number;

  /** 실패한 응답 수 */
  failureCount: number;

  /** 타임스탬프 */
  timestamp: string;
}

/**
 * 프리셋 앙상블 설정
 */
export interface EnsemblePreset {
  id: string;
  name: string;
  description: string;
  config: EnsembleConfig;
  useCases: string[];
}

/**
 * 기본 프리셋들
 */
export const DEFAULT_PRESETS: EnsemblePreset[] = [
  {
    id: 'diverse_perspectives',
    name: '다양한 관점',
    description: 'GPT, Claude, Gemini의 다양한 관점을 수집',
    config: {
      strategy: 'parallel',
      participants: [
        { expertId: 'strategist', weight: 1.0 },   // GPT
        { expertId: 'researcher', weight: 1.0 },   // Claude
        { expertId: 'reviewer', weight: 1.0 }      // Gemini
      ],
      aggregation: 'concatenate'
    },
    useCases: ['복잡한 문제 분석', '다각적 검토', '의사결정']
  },
  {
    id: 'synthesized_analysis',
    name: '통합 분석',
    description: '여러 전문가 의견을 하나로 합성',
    config: {
      strategy: 'synthesize',
      participants: [
        { expertId: 'strategist', weight: 1.0 },
        { expertId: 'researcher', weight: 1.0 },
        { expertId: 'reviewer', weight: 0.8 }
      ],
      aggregation: 'synthesize',
      synthesizer: 'strategist'
    },
    useCases: ['종합 보고서', '최종 결론 도출', '의견 통합']
  },
  {
    id: 'code_review_ensemble',
    name: '코드 리뷰 앙상블',
    description: '여러 관점에서 코드 리뷰',
    config: {
      strategy: 'parallel',
      participants: [
        { expertId: 'reviewer', role: '버그/보안 검토' },
        { expertId: 'strategist', role: '아키텍처 검토' },
        { expertId: 'frontend', role: 'UX/접근성 검토' }
      ],
      aggregation: 'concatenate'
    },
    useCases: ['코드 리뷰', '품질 검사', 'PR 검토']
  },
  {
    id: 'quick_consensus',
    name: '빠른 합의',
    description: '빠른 모델들로 신속한 합의 도출',
    config: {
      strategy: 'parallel',
      participants: [
        { expertId: 'explorer', weight: 1.0 },
        { expertId: 'writer', weight: 1.0 }
      ],
      aggregation: 'concatenate'
    },
    useCases: ['빠른 확인', '간단한 질문', '사실 확인']
  },

  // === New Presets ===

  {
    id: 'multi_review',
    name: '다중 관점 코드리뷰',
    description: 'Gemini + GPT Codex 코드리뷰',
    config: {
      strategy: 'parallel',
      participants: [
        { expertId: 'reviewer', role: 'Gemini 관점' },
        { expertId: 'codex_reviewer', role: 'GPT Codex 관점' }
      ],
      aggregation: 'concatenate'
    },
    useCases: ['다각적 코드리뷰', '리팩토링 제안', 'PR 검토']
  },
  {
    id: 'tdd_review',
    name: 'TDD 검토 앙상블',
    description: '테스트 전문가 + 리뷰어 협력',
    config: {
      strategy: 'parallel',
      participants: [
        { expertId: 'tester', role: '테스트 전략가' },
        { expertId: 'reviewer', role: '코드 품질' }
      ],
      aggregation: 'synthesize',
      synthesizer: 'tester'
    },
    useCases: ['테스트 커버리지 분석', 'TDD 전략 수립', '테스트 케이스 설계']
  }
];

/**
 * 전문가별 프로바이더 정보
 */
export const EXPERT_PROVIDERS: Record<string, string> = {
  strategist: 'OpenAI (GPT)',
  researcher: 'Google (Gemini Pro)',
  reviewer: 'Google (Gemini Pro)',
  frontend: 'Google (Gemini Pro)',
  writer: 'Google (Gemini Flash)',
  explorer: 'Google (Gemini Flash)',
  multimodal: 'Google (Gemini Pro)',
  // Planning agents
  prometheus: 'OpenAI (GPT)',
  metis: 'OpenAI (GPT)',
  momus: 'Google (Gemini Pro)',
  librarian: 'Google (Gemini Flash)',
  // Specialized experts
  security: 'OpenAI (GPT 5.4)',
  tester: 'OpenAI (GPT 5.4)',
  data: 'OpenAI (GPT 5.4)',
  codex_reviewer: 'OpenAI (GPT 5.4)',
  devops: 'OpenAI (GPT 5.4)',
  // Blank experts (GPT/Gemini only)
  gpt_blank_1: 'OpenAI (GPT 5.4)',
  gpt_blank_2: 'OpenAI (GPT 5.4)',
  gemini_blank_1: 'Google (Gemini Pro)',
  gemini_blank_2: 'Google (Gemini Flash)',
  // Debate moderator
  debate_moderator: 'Google (Gemini Pro)'
};
