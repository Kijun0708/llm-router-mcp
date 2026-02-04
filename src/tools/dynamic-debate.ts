// src/tools/dynamic-debate.ts

/**
 * Dynamic Persona Debate Tool
 *
 * 사용자가 직접 각 AI에게 페르소나를 부여하여 토론하는 도구
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { callExpertWithFallback } from '../services/expert-router.js';
import { experts } from '../experts/index.js';
import { buildDebatePrompt, buildBlankPromptWithPersona } from '../prompts/experts/index.js';
import { EXPERT_PROVIDERS } from '../features/ensemble/types.js';
import { startBackgroundWorkflow } from '../services/background-manager.js';

// ============================================================================
// Types
// ============================================================================

interface DynamicDebateParticipant {
  expertId: string;
  persona: string;
  stance?: string;
}

interface DebateRound {
  round: number;
  speaker: string;
  persona: string;
  content: string;
  responseTo?: string;
}

interface DynamicDebateResult {
  id: string;
  topic: string;
  participants: DynamicDebateParticipant[];
  debateHistory: DebateRound[];
  totalLatencyMs: number;
  successCount: number;
  failureCount: number;
  timestamp: string;
}

// ============================================================================
// Schema
// ============================================================================

const blankExperts = [
  'gpt_blank_1', 'gpt_blank_2',
  'claude_blank_1', 'claude_blank_2',
  'gemini_blank_1', 'gemini_blank_2'
] as const;

export const dynamicDebateSchema = z.object({
  topic: z.string()
    .min(5, '토론 주제는 최소 5자 이상')
    .describe('토론 주제'),

  participants: z.array(z.object({
    expert: z.enum(blankExperts)
      .describe('Blank 전문가 ID'),
    persona: z.string()
      .min(3, '페르소나는 최소 3자 이상')
      .describe('부여할 역할/페르소나'),
    stance: z.string()
      .optional()
      .describe('토론 입장 (선택사항)')
  }))
    .min(2, '최소 2명의 참여자가 필요합니다')
    .max(6, '최대 6명까지 참여 가능합니다')
    .describe('토론 참여자 목록'),

  max_rounds: z.number()
    .min(1)
    .max(5)
    .default(2)
    .describe('최대 토론 라운드 수'),

  context: z.string()
    .optional()
    .describe('추가 컨텍스트'),

  skip_cache: z.boolean()
    .default(false)
    .optional()
    .describe('캐시 사용 안 함')
}).strict();

// ============================================================================
// Tool Definition
// ============================================================================

export const dynamicDebateTool = {
  name: 'dynamic_debate',

  title: '동적 페르소나 토론',

  description: `Blank 전문가들에게 사용자 정의 페르소나를 부여하여 토론합니다.

## 사용 가능한 Blank 전문가
- **gpt_blank_1** (GPT 5.2): OpenAI 범용 모델
- **gpt_blank_2** (GPT Codex): OpenAI 코드 특화 모델
- **claude_blank_1** (Claude Opus): Anthropic 최고 성능
- **claude_blank_2** (Claude Sonnet): Anthropic 빠른 모델
- **gemini_blank_1** (Gemini Pro): Google 고성능 모델
- **gemini_blank_2** (Gemini Flash): Google 빠른 모델

## 사용 예시
\`\`\`
dynamic_debate({
  topic: "주식 손절 타이밍 전략",
  participants: [
    { expert: "gpt_blank_1", persona: "기술적 분석가 (차트, 이동평균선 전문)" },
    { expert: "claude_blank_1", persona: "펀더멘털 분석가 (재무제표 전문)" },
    { expert: "gemini_blank_1", persona: "리스크 관리자 (손실 최소화 관점)" }
  ],
  max_rounds: 2
})
\`\`\``,

  inputSchema: dynamicDebateSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

// ============================================================================
// Handler
// ============================================================================

function generateDebateId(): string {
  return `dyn_debate_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 실제 동적 토론 실행 로직 (백그라운드에서 실행됨)
 */
async function executeDynamicDebate(
  params: z.infer<typeof dynamicDebateSchema>
): Promise<string> {
  const startTime = Date.now();

  const debateHistory: DebateRound[] = [];
  let successCount = 0;
  let failureCount = 0;

  const participants = params.participants.map(p => ({
    expertId: p.expert,
    persona: p.persona,
    stance: p.stance
  }));

  // Round 0: 첫 번째 발언자가 초기 의견 제시
  const firstParticipant = participants[0];
  const initialPrompt = buildDebatePrompt(
    firstParticipant.persona,
    firstParticipant.stance || `${params.topic}에 대한 ${firstParticipant.persona}의 관점`,
    params.topic
  );

  const initialSystemPrompt = buildBlankPromptWithPersona(
    firstParticipant.persona,
    params.context
  );

  const firstResult = await callExpertWithFallback(
    firstParticipant.expertId,
    initialPrompt,
    initialSystemPrompt,
    !params.skip_cache
  );

  debateHistory.push({
    round: 0,
    speaker: firstParticipant.expertId,
    persona: firstParticipant.persona,
    content: firstResult.response
  });
  successCount++;

  // 토론 라운드
  for (let round = 1; round <= params.max_rounds; round++) {
    for (let i = 1; i < participants.length; i++) {
      const participant = participants[i];
      const previousRound = debateHistory[debateHistory.length - 1];

      const debatePrompt = `
[토론 라운드 ${round}]
주제: ${params.topic}

당신의 역할: ${participant.persona}
${participant.stance ? `당신의 입장: ${participant.stance}` : ''}

이전 발언 (${previousRound.persona}):
${previousRound.content}

위 의견에 대해 ${participant.persona}의 관점에서 비평하고, 당신의 관점을 추가해주세요.
동의하는 점과 보완/반박할 점을 명확히 구분해서 작성하세요.
`.trim();

      const systemPrompt = buildBlankPromptWithPersona(participant.persona, params.context);

      try {
        const result = await callExpertWithFallback(
          participant.expertId,
          debatePrompt,
          systemPrompt,
          !params.skip_cache
        );

        debateHistory.push({
          round,
          speaker: participant.expertId,
          persona: participant.persona,
          content: result.response,
          responseTo: previousRound.speaker
        });
        successCount++;
      } catch (error) {
        logger.warn({ error, participant: participant.expertId }, 'Debate participant failed');
        failureCount++;
      }
    }

    // 첫 번째 참여자가 반론 (마지막 라운드가 아닌 경우)
    if (round < params.max_rounds && debateHistory.length > 1) {
      const lastResponse = debateHistory[debateHistory.length - 1];

      const rebuttalPrompt = `
[토론 라운드 ${round} - 반론]
주제: ${params.topic}

당신의 역할: ${firstParticipant.persona}
${firstParticipant.stance ? `당신의 입장: ${firstParticipant.stance}` : ''}

다른 참여자(${lastResponse.persona})의 의견:
${lastResponse.content}

이에 대한 반론 또는 수정된 의견을 ${firstParticipant.persona}의 관점에서 제시해주세요.
`.trim();

      const rebuttalSystemPrompt = buildBlankPromptWithPersona(
        firstParticipant.persona,
        params.context
      );

      try {
        const result = await callExpertWithFallback(
          firstParticipant.expertId,
          rebuttalPrompt,
          rebuttalSystemPrompt,
          !params.skip_cache
        );

        debateHistory.push({
          round,
          speaker: firstParticipant.expertId,
          persona: firstParticipant.persona,
          content: result.response,
          responseTo: lastResponse.speaker
        });
        successCount++;
      } catch (error) {
        logger.warn({ error }, 'Rebuttal failed');
        failureCount++;
      }
    }
  }

  // 결과 포맷팅
  const totalLatencyMs = Date.now() - startTime;

  let response = `## 🎭 동적 페르소나 토론 결과\n\n`;
  response += `**주제**: ${params.topic}\n`;
  response += `**참여자**: ${participants.map(p => `${p.persona} (${getProviderName(p.expertId)})`).join(', ')}\n`;
  response += `**라운드 수**: ${params.max_rounds}\n`;
  response += `**소요 시간**: ${totalLatencyMs}ms\n`;
  response += `**성공/실패**: ${successCount}/${failureCount}\n\n`;
  response += `---\n\n`;

  // 토론 내용
  for (const round of debateHistory) {
    const providerName = getProviderName(round.speaker);
    const responseTag = round.responseTo ? ` → 응답 대상: ${round.responseTo}` : '';
    response += `### 라운드 ${round.round} - ${round.persona} (${providerName})${responseTag}\n\n`;
    response += `${round.content}\n\n`;
    response += `---\n\n`;
  }

  // 참여자 정보 요약
  response += `### 📊 참여자 정보\n\n`;
  response += `| 전문가 ID | 모델 | 페르소나 | 입장 |\n`;
  response += `|-----------|------|----------|------|\n`;
  for (const p of participants) {
    const model = experts[p.expertId]?.model || 'unknown';
    response += `| ${p.expertId} | ${model} | ${p.persona} | ${p.stance || '-'} |\n`;
  }

  return response;
}

/**
 * 동적 토론 핸들러 (백그라운드 실행)
 */
export function handleDynamicDebate(
  params: z.infer<typeof dynamicDebateSchema>
): { content: Array<{ type: 'text'; text: string }> } {
  const debateId = generateDebateId();

  logger.info({
    debateId,
    topic: params.topic,
    participantCount: params.participants.length,
    maxRounds: params.max_rounds
  }, 'Starting dynamic persona debate in background');

  const participantSummary = params.participants
    .map(p => p.persona)
    .join(', ');

  // 백그라운드에서 실행
  const task = startBackgroundWorkflow(
    `dynamic_debate:${params.topic.substring(0, 30)}`,
    () => executeDynamicDebate(params),
    debateId
  );

  return {
    content: [{
      type: 'text',
      text: `## 🚀 동적 토론 백그라운드 시작\n\n` +
            `**주제**: ${params.topic}\n` +
            `**참여자**: ${participantSummary}\n` +
            `**라운드 수**: ${params.max_rounds}\n` +
            `**작업 ID**: \`${task.id}\`\n\n` +
            `### 결과 조회 방법\n` +
            `\`\`\`\n` +
            `background_expert_result(task_id="${task.id}")\n` +
            `\`\`\`\n\n` +
            `💡 토론이 완료되면 위 명령으로 결과를 확인하세요. (예상 소요 시간: 5-15분)`
    }]
  };
}

function getProviderName(expertId: string): string {
  const providerMap: Record<string, string> = {
    gpt_blank_1: 'OpenAI GPT 5.2',
    gpt_blank_2: 'OpenAI GPT Codex',
    claude_blank_1: 'Anthropic Claude Opus',
    claude_blank_2: 'Anthropic Claude Sonnet',
    gemini_blank_1: 'Google Gemini Pro',
    gemini_blank_2: 'Google Gemini Flash'
  };
  return providerMap[expertId] || EXPERT_PROVIDERS[expertId] || expertId;
}
