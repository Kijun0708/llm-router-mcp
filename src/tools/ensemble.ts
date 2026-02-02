// src/tools/ensemble.ts

/**
 * Multi-Model Ensemble MCP Tools
 *
 * 여러 LLM을 조합하여 앙상블 쿼리 실행
 */

import { z } from 'zod';
import {
  runEnsemble,
  runPresetEnsemble,
  DEFAULT_PRESETS,
  EXPERT_PROVIDERS,
  EnsembleStrategy,
  AggregationMethod
} from '../features/ensemble/index.js';

// ============================================================================
// Tool Schemas
// ============================================================================

const allExpertIds = [
  // Core experts
  'strategist', 'researcher', 'reviewer', 'frontend', 'writer', 'explorer', 'multimodal',
  // Planning experts
  'prometheus', 'metis', 'momus', 'librarian',
  // Specialized experts
  'security', 'tester', 'data', 'codex_reviewer',
  // Blank experts
  'gpt_blank_1', 'gpt_blank_2', 'claude_blank_1', 'claude_blank_2', 'gemini_blank_1', 'gemini_blank_2',
  // Debate moderator
  'debate_moderator'
] as const;

const participantSchema = z.object({
  expert: z.enum(allExpertIds)
    .describe('참여 전문가 ID'),
  weight: z.number().min(0).max(2).optional()
    .describe('가중치 (0-2, 기본: 1.0)'),
  role: z.string().optional()
    .describe('역할 설명 (토론 모드용)')
});

export const ensembleQuerySchema = z.object({
  query: z.string()
    .min(5, '쿼리는 최소 5자 이상')
    .describe('앙상블로 실행할 쿼리'),

  strategy: z.enum(['parallel', 'synthesize', 'debate', 'vote', 'best_of_n', 'chain'])
    .default('parallel')
    .describe('앙상블 전략'),

  experts: z.array(z.enum(allExpertIds))
    .min(1)
    .max(10)
    .default(['strategist', 'researcher', 'reviewer'])
    .describe('참여할 전문가 목록'),

  synthesizer: z.enum(allExpertIds)
    .optional()
    .describe('합성 담당 전문가 (synthesize 전략용)'),

  context: z.string()
    .optional()
    .describe('추가 컨텍스트'),

  vote_options: z.array(z.string())
    .optional()
    .describe('투표 선택지 (vote 전략용)'),

  max_rounds: z.number()
    .min(1)
    .max(5)
    .default(2)
    .optional()
    .describe('최대 토론 라운드 (debate 전략용)'),

  n: z.number()
    .min(2)
    .max(5)
    .default(3)
    .optional()
    .describe('실행 횟수 (best_of_n 전략용)'),

  skip_cache: z.boolean()
    .default(false)
    .optional()
    .describe('캐시 사용 안 함')
}).strict();

export const ensemblePresetSchema = z.object({
  preset: z.string()
    .describe('프리셋 ID'),

  query: z.string()
    .min(5, '쿼리는 최소 5자 이상')
    .describe('앙상블로 실행할 쿼리'),

  context: z.string()
    .optional()
    .describe('추가 컨텍스트'),

  vote_options: z.array(z.string())
    .optional()
    .describe('투표 선택지 (vote 프리셋용)')
}).strict();

export const ensemblePresetsListSchema = z.object({}).strict();

// ============================================================================
// Tool Definitions
// ============================================================================

export const ensembleQueryTool = {
  name: 'ensemble_query',

  title: '앙상블 쿼리',

  description: `여러 LLM 전문가를 조합하여 쿼리를 실행합니다.

## 전략
- **parallel**: 병렬 실행 후 결과 병합
- **synthesize**: 병렬 실행 후 합성 모델이 통합
- **debate**: 전문가들이 서로 비평하며 토론
- **vote**: 선택지에 대해 투표
- **best_of_n**: N번 실행 후 최고 선택
- **chain**: 이전 결과를 다음 전문가에게 전달

## 전문가
**Core:**
- strategist (GPT): 설계, 아키텍처, 전략
- researcher (Claude): 조사, 분석, 문서화
- reviewer (Gemini): 코드 리뷰, 버그/보안
- frontend (Gemini): UI/UX, 컴포넌트
- writer (Gemini): 문서 작성
- explorer (Gemini): 빠른 탐색
- multimodal (Gemini): 이미지/시각 분석

**Specialized:**
- security (Claude): 보안 취약점, OWASP
- tester (Claude): TDD, 테스트 전략
- data (GPT): DB 설계, 쿼리 최적화
- codex_reviewer (GPT Codex): 코드 리뷰

**Blank (동적 페르소나):**
- gpt_blank_1, gpt_blank_2 (GPT)
- claude_blank_1, claude_blank_2 (Claude)
- gemini_blank_1, gemini_blank_2 (Gemini)

💡 페르소나 토론은 \`dynamic_debate\` 또는 \`auto_debate\` 도구 사용 권장`,

  inputSchema: ensembleQuerySchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export const ensemblePresetTool = {
  name: 'ensemble_preset',

  title: '프리셋 앙상블',

  description: `미리 정의된 프리셋으로 앙상블을 실행합니다.

## 기본 프리셋
- diverse_perspectives: 다양한 관점 수집
- synthesized_analysis: 통합 분석
- expert_debate: 전문가 토론
- code_review_ensemble: 코드 리뷰
- quick_consensus: 빠른 합의

## 신규 프리셋
- dynamic_debate_3: 동적 페르소나 토론 (3명)
- dynamic_debate_6: 동적 페르소나 토론 (6명)
- security_debate: 보안 검토 토론
- multi_review: 다중 관점 코드리뷰
- tdd_review: TDD 검토 앙상블
- data_architecture: 데이터 아키텍처 검토

💡 커스텀 페르소나 토론은 \`dynamic_debate\` 또는 \`auto_debate\` 도구 사용 권장
프리셋 목록은 ensemble_presets_list로 확인하세요.`,

  inputSchema: ensemblePresetSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export const ensemblePresetsListTool = {
  name: 'ensemble_presets_list',

  title: '프리셋 목록',

  description: '사용 가능한 앙상블 프리셋 목록을 조회합니다.',

  inputSchema: ensemblePresetsListSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleEnsembleQuery(
  params: z.infer<typeof ensembleQuerySchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const participants = params.experts.map(expertId => ({
      expertId,
      weight: 1.0
    }));

    const result = await runEnsemble(
      params.query,
      {
        strategy: params.strategy as EnsembleStrategy,
        participants,
        aggregation: params.strategy === 'synthesize' ? 'synthesize' : 'concatenate',
        synthesizer: params.synthesizer,
        maxRounds: params.max_rounds,
        n: params.n,
        useCache: !params.skip_cache
      },
      params.context,
      params.vote_options
    );

    let response = `## 🎭 앙상블 결과\n\n`;
    response += `**전략**: ${getStrategyLabel(result.strategy)}\n`;
    response += `**참여자**: ${result.responses.map(r => r.expertId).filter((v, i, a) => a.indexOf(v) === i).join(', ')}\n`;
    response += `**소요 시간**: ${result.totalLatencyMs}ms\n`;
    response += `**성공/실패**: ${result.successCount}/${result.failureCount}\n\n`;

    if (result.synthesizedBy) {
      response += `**합성 by**: ${result.synthesizedBy}\n\n`;
    }

    response += `---\n\n`;
    response += result.finalResult;

    // 개별 응답 요약
    if (result.strategy !== 'debate' && result.strategy !== 'vote') {
      response += `\n\n---\n\n### 📊 개별 응답 요약\n\n`;
      response += `| 전문가 | 프로바이더 | 응답 길이 | 지연 시간 | 상태 |\n`;
      response += `|--------|-----------|----------|----------|------|\n`;

      const seen = new Set<string>();
      for (const r of result.responses) {
        if (seen.has(r.expertId)) continue;
        seen.add(r.expertId);

        const provider = EXPERT_PROVIDERS[r.expertId] || '-';
        const status = r.error ? '❌ 실패' : (r.cached ? '💾 캐시' : '✅ 성공');
        response += `| ${r.expertId} | ${provider} | ${r.response?.length || 0}자 | ${r.latencyMs}ms | ${status} |\n`;
      }
    }

    return {
      content: [{ type: 'text', text: response }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `## ⚠️ 앙상블 실행 실패\n\n**오류**: ${(error as Error).message}`
      }]
    };
  }
}

export async function handleEnsemblePreset(
  params: z.infer<typeof ensemblePresetSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const preset = DEFAULT_PRESETS.find(p => p.id === params.preset);

    if (!preset) {
      const availablePresets = DEFAULT_PRESETS.map(p => `- \`${p.id}\`: ${p.name}`).join('\n');
      return {
        content: [{
          type: 'text',
          text: `## ⚠️ 프리셋을 찾을 수 없습니다\n\n**입력**: ${params.preset}\n\n**사용 가능한 프리셋**:\n${availablePresets}`
        }]
      };
    }

    const result = await runPresetEnsemble(
      params.preset,
      params.query,
      params.context,
      params.vote_options
    );

    let response = `## 🎭 프리셋 앙상블: ${preset.name}\n\n`;
    response += `**설명**: ${preset.description}\n`;
    response += `**전략**: ${getStrategyLabel(result.strategy)}\n`;
    response += `**소요 시간**: ${result.totalLatencyMs}ms\n\n`;

    response += `---\n\n`;
    response += result.finalResult;

    return {
      content: [{ type: 'text', text: response }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `## ⚠️ 프리셋 앙상블 실행 실패\n\n**오류**: ${(error as Error).message}`
      }]
    };
  }
}

export async function handleEnsemblePresetsList(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let response = `## 📋 앙상블 프리셋 목록\n\n`;

  for (const preset of DEFAULT_PRESETS) {
    response += `### ${preset.name} (\`${preset.id}\`)\n\n`;
    response += `${preset.description}\n\n`;
    response += `**전략**: ${getStrategyLabel(preset.config.strategy)}\n`;
    response += `**참여자**: ${preset.config.participants.map(p => p.expertId).join(', ')}\n`;

    if (preset.config.synthesizer) {
      response += `**합성자**: ${preset.config.synthesizer}\n`;
    }

    if (preset.config.maxRounds) {
      response += `**최대 라운드**: ${preset.config.maxRounds}\n`;
    }

    response += `**용도**: ${preset.useCases.join(', ')}\n\n`;
  }

  response += `---\n\n`;
  response += `💡 사용법: \`ensemble_preset(preset="프리셋ID", query="질문")\``;

  return {
    content: [{ type: 'text', text: response }]
  };
}

// Helper: 전략 레이블
function getStrategyLabel(strategy: string): string {
  const labels: Record<string, string> = {
    parallel: '병렬 실행',
    synthesize: '합성 통합',
    debate: '전문가 토론',
    vote: '투표',
    best_of_n: 'Best-of-N',
    chain: '체인 실행'
  };
  return labels[strategy] || strategy;
}
