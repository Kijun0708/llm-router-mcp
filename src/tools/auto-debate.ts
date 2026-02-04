// src/tools/auto-debate.ts

/**
 * Auto Persona Debate Tool
 *
 * debate_moderator가 토론 주제를 분석하고 자동으로 페르소나를 할당하여 토론
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { callExpertWithFallback } from '../services/expert-router.js';
import { experts } from '../experts/index.js';
import { buildBlankPromptWithPersona } from '../prompts/experts/index.js';
import { EXPERT_PROVIDERS } from '../features/ensemble/types.js';
import { startBackgroundWorkflow } from '../services/background-manager.js';

// ============================================================================
// Types
// ============================================================================

interface PersonaAssignment {
  expertId: string;
  personaName: string;
  personaDescription: string;
  debateStance: string;
  keyArguments: string[];
}

interface DebateRound {
  round: number;
  speaker: string;
  persona: string;
  content: string;
  responseTo?: string;
}

// ============================================================================
// Schema
// ============================================================================

export const autoDebateSchema = z.object({
  topic: z.string()
    .min(5, '토론 주제는 최소 5자 이상')
    .describe('토론 주제'),

  participant_count: z.union([z.literal(3), z.literal(6)])
    .default(3)
    .describe('참여자 수 (3명 또는 6명)'),

  context: z.string()
    .optional()
    .describe('추가 컨텍스트 (선택)'),

  max_rounds: z.number()
    .min(1)
    .max(5)
    .default(2)
    .describe('최대 토론 라운드 수'),

  skip_cache: z.boolean()
    .default(false)
    .optional()
    .describe('캐시 사용 안 함')
}).strict();

// ============================================================================
// Tool Definition
// ============================================================================

export const autoDebateTool = {
  name: 'auto_debate',

  title: '자동 페르소나 토론',

  description: `AI가 토론 주제를 분석하고 자동으로 최적의 페르소나를 할당하여 토론합니다.

## 동작 방식
1. **debate_moderator**가 토론 주제를 분석
2. 주제에 적합한 관점/역할 자동 설계
3. 각 AI에 페르소나 할당 후 토론 시작

## 참여자 수
- **3명**: GPT, Claude, Gemini 각 1명 (기본)
- **6명**: 각 프로바이더 2명씩 (심층 토론)

## 사용 예시
\`\`\`
auto_debate({
  topic: "주식 손절 타이밍 전략",
  participant_count: 3,
  max_rounds: 2
})
\`\`\`

→ AI가 자동으로 "기술적 분석가", "펀더멘털 분석가", "리스크 관리자" 등의 역할을 설계하고 토론 진행`,

  inputSchema: autoDebateSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

// ============================================================================
// Constants
// ============================================================================

const BLANK_EXPERTS_3 = ['gpt_blank_1', 'claude_blank_1', 'gemini_blank_1'];
const BLANK_EXPERTS_6 = [
  'gpt_blank_1', 'gpt_blank_2',
  'claude_blank_1', 'claude_blank_2',
  'gemini_blank_1', 'gemini_blank_2'
];

// ============================================================================
// Handler
// ============================================================================

function generateDebateId(): string {
  return `auto_debate_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

async function generatePersonaAssignments(
  topic: string,
  participantCount: 3 | 6,
  context?: string
): Promise<PersonaAssignment[]> {
  const blankExperts = participantCount === 3 ? BLANK_EXPERTS_3 : BLANK_EXPERTS_6;

  const prompt = `
토론 주제를 분석하고, 각 AI 참여자에게 최적의 페르소나를 할당해주세요.

## 토론 주제
${topic}

${context ? `## 추가 컨텍스트\n${context}\n` : ''}

## 참여할 AI (${participantCount}명)
${blankExperts.map((id, i) => `${i + 1}. ${id} (${getProviderName(id)})`).join('\n')}

## 요청사항
각 AI에게 다음을 할당해주세요:
1. **페르소나명**: 역할/전문 분야 (예: "기술적 분석가", "리스크 관리 전문가")
2. **페르소나 설명**: 상세한 역할 설명 (2-3문장)
3. **토론 입장**: 이 주제에 대한 기본 입장/관점
4. **핵심 논점**: 주장할 핵심 포인트 3개

## 페르소나 설계 원칙
- 각 페르소나는 서로 다른 관점을 대표해야 함
- 일부는 주류 의견, 일부는 대안적 관점
- 기술/비즈니스/사용자/리스크 등 다양한 각도
- 서로 건설적인 비평이 가능하도록 설계

## 출력 형식 (JSON)
\`\`\`json
{
  "assignments": [
    {
      "expert_id": "${blankExperts[0]}",
      "persona_name": "페르소나명",
      "persona_description": "상세 설명",
      "debate_stance": "토론 입장",
      "key_arguments": ["논점1", "논점2", "논점3"]
    }
  ]
}
\`\`\`

정확히 ${participantCount}명의 페르소나를 JSON 형식으로 출력해주세요.
`.trim();

  try {
    const result = await callExpertWithFallback('debate_moderator', prompt, undefined, true);

    // JSON 추출 및 파싱 (여러 방법 시도)
    let parsed: any = null;
    let lastError: Error | null = null;

    // 방법 1: ```json ... ``` 코드 블록 (greedy하게 마지막 ```까지)
    const codeBlockMatch = result.response.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const jsonStr = codeBlockMatch[1].trim();
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        lastError = e as Error;
        logger.debug({ error: (e as Error).message }, 'Code block JSON parse failed, trying next method');
      }
    }

    // 방법 2: { "assignments": [...] } 또는 { "personas": [...] } 패턴 찾기
    if (!parsed) {
      // assignments나 personas 배열의 시작을 찾고, 균형 잡힌 괄호로 끝 찾기
      const arrayStartMatch = result.response.match(/\{\s*"(?:assignments|personas)"\s*:\s*\[/);
      if (arrayStartMatch && arrayStartMatch.index !== undefined) {
        const startIdx = arrayStartMatch.index;
        let depth = 0;
        let endIdx = startIdx;

        for (let i = startIdx; i < result.response.length; i++) {
          const char = result.response[i];
          if (char === '{' || char === '[') depth++;
          else if (char === '}' || char === ']') {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        if (endIdx > startIdx) {
          try {
            const jsonStr = result.response.substring(startIdx, endIdx);
            parsed = JSON.parse(jsonStr);
          } catch (e) {
            lastError = e as Error;
            logger.debug({ error: (e as Error).message }, 'Bracket-balanced JSON parse failed, trying next method');
          }
        }
      }
    }

    // 방법 3: 전체 응답에서 JSON 객체 추출 시도 (첫 번째 { 부터 마지막 } 까지)
    if (!parsed) {
      const firstBrace = result.response.indexOf('{');
      const lastBrace = result.response.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          const jsonStr = result.response.substring(firstBrace, lastBrace + 1);
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          lastError = e as Error;
          logger.debug({ error: (e as Error).message }, 'Full range JSON parse failed');
        }
      }
    }

    if (!parsed) {
      logger.error({
        response: result.response.substring(0, 1000),
        lastError: lastError?.message
      }, 'Failed to extract JSON from response');
      throw new Error(`페르소나 할당 결과에서 JSON을 파싱할 수 없습니다: ${lastError?.message || 'JSON not found'}`);
    }

    // assignments 또는 personas 키 모두 지원
    const personaArray = parsed.assignments || parsed.personas;
    if (!personaArray || !Array.isArray(personaArray)) {
      logger.error({ parsedKeys: Object.keys(parsed) }, 'Invalid persona assignment format');
      throw new Error('유효하지 않은 페르소나 할당 형식입니다. (assignments 또는 personas 키 필요)');
    }

    return personaArray.map((a: any) => ({
      expertId: a.expert_id,
      personaName: a.persona_name,
      personaDescription: a.persona_description,
      debateStance: a.debate_stance,
      keyArguments: a.key_arguments || []
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to generate persona assignments');
    throw new Error(`페르소나 자동 할당 실패: ${(error as Error).message}`);
  }
}

/**
 * 실제 토론 실행 로직 (백그라운드에서 실행됨)
 */
async function executeAutoDebate(
  params: z.infer<typeof autoDebateSchema>
): Promise<string> {
  const debateId = generateDebateId();
  const startTime = Date.now();

  // 1. 페르소나 자동 할당
  const assignments = await generatePersonaAssignments(
    params.topic,
    params.participant_count,
    params.context
  );

  logger.info({
    debateId,
    assignedPersonas: assignments.map(a => a.personaName)
  }, 'Persona assignments generated');

  // 2. 토론 실행
  const debateHistory: DebateRound[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Round 0: 첫 번째 발언자
  const firstAssignment = assignments[0];
  const initialPrompt = `
[토론 시작]
주제: ${params.topic}
${params.context ? `\n컨텍스트: ${params.context}` : ''}

당신의 역할: ${firstAssignment.personaName}
역할 설명: ${firstAssignment.personaDescription}
당신의 입장: ${firstAssignment.debateStance}

핵심 논점:
${firstAssignment.keyArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}

이 주제에 대한 당신의 의견을 ${firstAssignment.personaName}의 관점에서 제시해주세요.
`.trim();

  const initialSystemPrompt = buildBlankPromptWithPersona(
    `${firstAssignment.personaName}: ${firstAssignment.personaDescription}`,
    params.context
  );

  const firstResult = await callExpertWithFallback(
    firstAssignment.expertId,
    initialPrompt,
    initialSystemPrompt,
    !params.skip_cache
  );

  debateHistory.push({
    round: 0,
    speaker: firstAssignment.expertId,
    persona: firstAssignment.personaName,
    content: firstResult.response
  });
  successCount++;

  // 토론 라운드
  for (let round = 1; round <= params.max_rounds; round++) {
    for (let i = 1; i < assignments.length; i++) {
      const assignment = assignments[i];
      const previousRound = debateHistory[debateHistory.length - 1];

      const debatePrompt = `
[토론 라운드 ${round}]
주제: ${params.topic}

당신의 역할: ${assignment.personaName}
역할 설명: ${assignment.personaDescription}
당신의 입장: ${assignment.debateStance}

핵심 논점:
${assignment.keyArguments.map((arg, i) => `${i + 1}. ${arg}`).join('\n')}

이전 발언 (${previousRound.persona}):
${previousRound.content}

위 의견에 대해 ${assignment.personaName}의 관점에서 비평하고, 당신의 관점을 추가해주세요.
동의하는 점과 보완/반박할 점을 명확히 구분해서 작성하세요.
`.trim();

      const systemPrompt = buildBlankPromptWithPersona(
        `${assignment.personaName}: ${assignment.personaDescription}`,
        params.context
      );

      try {
        const result = await callExpertWithFallback(
          assignment.expertId,
          debatePrompt,
          systemPrompt,
          !params.skip_cache
        );

        debateHistory.push({
          round,
          speaker: assignment.expertId,
          persona: assignment.personaName,
          content: result.response,
          responseTo: previousRound.speaker
        });
        successCount++;
      } catch (error) {
        logger.warn({ error, participant: assignment.expertId }, 'Debate participant failed');
        failureCount++;
      }
    }

    // 첫 번째 참여자가 반론 (마지막 라운드가 아닌 경우)
    if (round < params.max_rounds && debateHistory.length > 1) {
      const lastResponse = debateHistory[debateHistory.length - 1];

      const rebuttalPrompt = `
[토론 라운드 ${round} - 반론]
주제: ${params.topic}

당신의 역할: ${firstAssignment.personaName}
역할 설명: ${firstAssignment.personaDescription}
당신의 입장: ${firstAssignment.debateStance}

다른 참여자(${lastResponse.persona})의 의견:
${lastResponse.content}

이에 대한 반론 또는 수정된 의견을 ${firstAssignment.personaName}의 관점에서 제시해주세요.
`.trim();

      const rebuttalSystemPrompt = buildBlankPromptWithPersona(
        `${firstAssignment.personaName}: ${firstAssignment.personaDescription}`,
        params.context
      );

      try {
        const result = await callExpertWithFallback(
          firstAssignment.expertId,
          rebuttalPrompt,
          rebuttalSystemPrompt,
          !params.skip_cache
        );

        debateHistory.push({
          round,
          speaker: firstAssignment.expertId,
          persona: firstAssignment.personaName,
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

  let response = `## 🤖 자동 페르소나 토론 결과\n\n`;
  response += `**주제**: ${params.topic}\n`;
  response += `**참여자 수**: ${params.participant_count}명\n`;
  response += `**라운드 수**: ${params.max_rounds}\n`;
  response += `**소요 시간**: ${totalLatencyMs}ms\n`;
  response += `**성공/실패**: ${successCount}/${failureCount}\n\n`;

  // AI가 할당한 페르소나 정보
  response += `### 🎭 AI가 설계한 페르소나\n\n`;
  response += `| 전문가 | 모델 | 페르소나 | 입장 |\n`;
  response += `|--------|------|----------|------|\n`;
  for (const a of assignments) {
    const model = experts[a.expertId]?.model || 'unknown';
    response += `| ${a.expertId} | ${model} | **${a.personaName}** | ${a.debateStance.substring(0, 50)}... |\n`;
  }

  response += `\n#### 페르소나 상세\n\n`;
  for (const a of assignments) {
    response += `**${a.personaName}** (${getProviderName(a.expertId)})\n`;
    response += `- 설명: ${a.personaDescription}\n`;
    response += `- 입장: ${a.debateStance}\n`;
    response += `- 핵심 논점: ${a.keyArguments.join(' / ')}\n\n`;
  }

  response += `---\n\n`;
  response += `### 💬 토론 내용\n\n`;

  // 토론 내용
  for (const round of debateHistory) {
    const providerName = getProviderName(round.speaker);
    const responseTag = round.responseTo ? ` → 응답 대상: ${getPersonaByExpert(assignments, round.responseTo)}` : '';
    response += `#### 라운드 ${round.round} - ${round.persona} (${providerName})${responseTag}\n\n`;
    response += `${round.content}\n\n`;
    response += `---\n\n`;
  }

  return response;
}

/**
 * 자동 토론 핸들러 (백그라운드 실행)
 */
export function handleAutoDebate(
  params: z.infer<typeof autoDebateSchema>
): { content: Array<{ type: 'text'; text: string }> } {
  const debateId = generateDebateId();

  logger.info({
    debateId,
    topic: params.topic,
    participantCount: params.participant_count,
    maxRounds: params.max_rounds
  }, 'Starting auto persona debate in background');

  // 백그라운드에서 실행
  const task = startBackgroundWorkflow(
    `auto_debate:${params.topic.substring(0, 30)}`,
    () => executeAutoDebate(params),
    debateId
  );

  return {
    content: [{
      type: 'text',
      text: `## 🚀 자동 토론 백그라운드 시작\n\n` +
            `**주제**: ${params.topic}\n` +
            `**참여자 수**: ${params.participant_count}명\n` +
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
    gemini_blank_2: 'Google Gemini Flash',
    debate_moderator: 'Anthropic Claude Sonnet'
  };
  return providerMap[expertId] || EXPERT_PROVIDERS[expertId] || expertId;
}

function getPersonaByExpert(assignments: PersonaAssignment[], expertId: string): string {
  const found = assignments.find(a => a.expertId === expertId);
  return found ? found.personaName : expertId;
}
