import { z } from 'zod';
import { experts } from '../experts/index.js';
import { startBackgroundWorkflow } from '../services/background-manager.js';
import { callExpertWithFallback, WorkflowCallOptions } from '../services/expert-router.js';
import { SESSION_ID } from '../session.js';
import { logger } from '../utils/logger.js';

const BLANK_EXPERT_IDS = [
  'gpt_blank_1',
  'gpt_blank_2',
  'gemini_blank_1',
  'gemini_blank_2'
] as const;

const blankExpertIds = new Set<string>(BLANK_EXPERT_IDS);

const participantSchema = z.object({
  expert: z.string().min(1).describe('참여 전문가 ID'),
  persona: z.string().min(3).optional().describe('선택적 페르소나 설명')
});

const autoPersonaSchema = z.object({
  expert_id: z.enum(BLANK_EXPERT_IDS),
  persona: z.string().min(3),
  focus: z.string().min(3)
});

export const moderatedDebateSchema = z.object({
  agenda: z.string().min(5, '안건은 최소 5자 이상').describe('토론 안건'),
  participants: z.array(participantSchema)
    .min(2, '최소 2명의 참여자가 필요합니다')
    .max(4, '최대 4명까지 참여 가능합니다')
    .optional()
    .describe('수동 참가자 목록'),
  participant_count: z.number().min(2).max(4).optional().describe('자동 페르소나 모드일 때 사용할 AI 수'),
  context: z.string().optional().describe('추가 컨텍스트'),
  repeat_count: z.number().min(1).max(3).default(1).optional().describe('종합 후 다시 묻는 반복 횟수'),
  skip_cache: z.boolean().default(false).optional().describe('캐시 사용 안 함'),
  include_transcript: z.boolean().default(true).optional().describe('라운드별 응답 포함')
});

type ModeratedDebateParams = z.infer<typeof moderatedDebateSchema>;

interface DebateParticipant {
  expertId: string;
  persona?: string;
  focus?: string;
}

interface RoundResponse {
  expertId: string;
  personaLabel: string;
  response?: string;
  error?: string;
  latencyMs: number;
}

interface ResolvedParticipants {
  participants: DebateParticipant[];
  autoAssigned: boolean;
}

function validateModeratedDebateParams(data: ModeratedDebateParams): void {
  const hasParticipants = Array.isArray(data.participants) && data.participants.length > 0;
  const hasParticipantCount = typeof data.participant_count === 'number';

  if (hasParticipants === hasParticipantCount) {
    throw new Error('participants 또는 participant_count 중 정확히 하나만 지정해야 합니다.');
  }

  if (!hasParticipants) {
    return;
  }

  const seen = new Set<string>();
  for (const participant of data.participants || []) {
    if (!experts[participant.expert]) {
      throw new Error(`알 수 없는 전문가입니다: ${participant.expert}`);
    }
    if (participant.expert === 'debate_moderator') {
      throw new Error('debate_moderator는 참여자가 아니라 내부 중재자로만 사용됩니다.');
    }
    if (seen.has(participant.expert)) {
      throw new Error(`중복된 전문가입니다: ${participant.expert}`);
    }
    seen.add(participant.expert);
    if (blankExpertIds.has(participant.expert) && !participant.persona) {
      throw new Error(`${participant.expert}에는 persona가 필요합니다.`);
    }
  }
}

export const moderatedDebateTool = {
  name: 'moderated_debate',
  title: '중재형 패널 토론',
  description: '중재자가 필요하면 페르소나를 먼저 설계한 뒤 병렬 토론과 재질의를 거쳐 최종 요약을 반환합니다.',
  inputSchema: moderatedDebateSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

function generateDebateId(): string {
  return `moderated_debate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getPersonaLabel(participant: DebateParticipant): string {
  if (participant.persona) return participant.persona;
  return experts[participant.expertId]?.name || participant.expertId;
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  throw new Error('JSON 배열을 찾지 못했습니다.');
}

function getDefaultAutoParticipants(count: number): DebateParticipant[] {
  const defaults: DebateParticipant[] = [
    { expertId: 'gpt_blank_1', persona: '실용주의 아키텍트', focus: '구현 가능성과 구조적 단순성' },
    { expertId: 'gpt_blank_2', persona: '비용/속도 중심 의사결정자', focus: '비용 대비 효과와 일정' },
    { expertId: 'gemini_blank_1', persona: '리스크 중심 검토자', focus: '실패 가능성과 운영 리스크' },
    { expertId: 'gemini_blank_2', persona: '사용자/운영 경험 관찰자', focus: '현장 사용성과 유지보수성' }
  ];
  return defaults.slice(0, count);
}

async function resolveParticipants(params: ModeratedDebateParams, workflowOptions?: WorkflowCallOptions): Promise<ResolvedParticipants> {
  if (params.participants?.length) {
    return {
      participants: params.participants.map((participant) => ({
        expertId: participant.expert,
        persona: participant.persona
      })),
      autoAssigned: false
    };
  }

  const count = params.participant_count as number;
  const candidateExperts = BLANK_EXPERT_IDS.slice(0, count);
  const prompt = [
    '[중재자 역할: 토론 참가자 페르소나 설계]',
    `안건: ${params.agenda}`,
    params.context ? `추가 컨텍스트:\n${params.context}` : '',
    `참여자 수: ${count}`,
    `사용 가능한 expert_id: ${candidateExperts.join(', ')}`,
    '요청:',
    '1. 각 expert_id에 대해 서로 다른 관점을 대표하는 페르소나를 배정하세요.',
    '2. persona는 역할 이름, focus는 그 역할의 핵심 판단 기준입니다.',
    '3. 반드시 아래 JSON 배열만 반환하세요.',
    '[{"expert_id":"gpt_blank_1","persona":"...","focus":"..."}]'
  ].filter(Boolean).join('\n\n');

  const personaDesignOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: 'persona_design' }
    : undefined;

  try {
    const result = await callExpertWithFallback('debate_moderator', prompt, undefined, params.skip_cache ?? false, undefined, false, personaDesignOptions);
    const parsed = JSON.parse(extractJsonBlock(result.response));
    const personas = z.array(autoPersonaSchema).length(count).parse(parsed);
    return {
      participants: personas.map((item) => ({
        expertId: item.expert_id,
        persona: item.persona,
        focus: item.focus
      })),
      autoAssigned: true
    };
  } catch (error) {
    logger.warn({ error: (error as Error).message, participantCount: count }, 'Auto persona assignment failed, using defaults');
    return {
      participants: getDefaultAutoParticipants(count),
      autoAssigned: true
    };
  }
}

function buildParticipantPrompt(
  agenda: string,
  participant: DebateParticipant,
  round: number,
  context?: string,
  roundBrief?: string,
  priorResponse?: string
): string {
  const personaSection = participant.persona
    ? `당신의 이번 토론 페르소나: ${participant.persona}`
    : `당신은 자신의 전문성(${experts[participant.expertId]?.role || participant.expertId})에 기반해 답변하세요.`;
  const focusSection = participant.focus ? `이번 역할의 핵심 초점: ${participant.focus}` : '';
  const contextSection = context ? `\n추가 컨텍스트:\n${context}\n` : '';

  if (round === 1) {
    return [
      '[중재자 안건 배포 - 1차 의견]',
      `안건: ${agenda}`,
      personaSection,
      focusSection,
      contextSection,
      '요청:',
      '1. 당신의 핵심 입장을 3~5문장으로 제시하세요.',
      '2. 중요 근거와 우려를 짚어주세요.',
      '3. 최종 판단 또는 권고를 간단히 적어주세요.'
    ].filter(Boolean).join('\n');
  }

  return [
    `[중재자 재질의 - ${round}차 의견]`,
    `안건: ${agenda}`,
    personaSection,
    focusSection,
    contextSection,
    '아래는 직전 라운드 응답들을 종합한 중립 브리프입니다.',
    roundBrief || '',
    priorResponse ? `\n당신의 직전 응답:\n${priorResponse}\n` : '',
    '요청:',
    '1. 종합 브리프를 반영해 입장을 유지/수정/보완하세요.',
    '2. 다른 참여자 관점에서 수용할 점과 반박할 점을 구분하세요.',
    '3. 최종적으로 지금 시점의 권고를 간단히 적어주세요.'
  ].filter(Boolean).join('\n');
}

async function runRound(
  agenda: string,
  participants: DebateParticipant[],
  round: number,
  options: {
    context?: string;
    skipCache: boolean;
    roundBrief?: string;
    priorResponses?: Map<string, string>;
  },
  workflowOptions?: WorkflowCallOptions
): Promise<RoundResponse[]> {
  const roundOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: `round_${round}` }
    : undefined;

  const settled = await Promise.allSettled(
    participants.map(async (participant) => {
      const startedAt = Date.now();
      const result = await callExpertWithFallback(
        participant.expertId,
        buildParticipantPrompt(
          agenda,
          participant,
          round,
          options.context,
          options.roundBrief,
          options.priorResponses?.get(participant.expertId)
        ),
        undefined,
        options.skipCache,
        undefined,
        false,
        roundOptions
      );

      return {
        expertId: participant.expertId,
        personaLabel: getPersonaLabel(participant),
        response: result.response,
        latencyMs: Date.now() - startedAt
      } satisfies RoundResponse;
    })
  );

  return settled.map((item, index) => {
    if (item.status === 'fulfilled') {
      return item.value;
    }
    const participant = participants[index];
    return {
      expertId: participant.expertId,
      personaLabel: getPersonaLabel(participant),
      error: (item.reason as Error).message,
      latencyMs: 0
    } satisfies RoundResponse;
  });
}

async function buildRoundBrief(
  agenda: string,
  responses: RoundResponse[],
  iteration: number,
  context?: string,
  skipCache: boolean = false,
  workflowOptions?: WorkflowCallOptions
): Promise<string> {
  const prompt = [
    `[중재자 역할: ${iteration}차 종합 브리프 작성]`,
    `안건: ${agenda}`,
    context ? `추가 컨텍스트:\n${context}\n` : '',
    '다음은 참여자 응답입니다.',
    responses.map((response) => `### ${response.personaLabel}\n${response.response}`).join('\n\n'),
    '요청:',
    '1. 공통 의견, 핵심 쟁점, 남은 불확실성을 중립적으로 정리하세요.',
    '2. 다음 라운드에서 답해야 할 핵심 질문 2~4개를 제시하세요.',
    '3. 특정 참여자 편을 들지 말고, 전체 토론 브리프로 작성하세요.'
  ].filter(Boolean).join('\n\n');

  const briefOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: `brief_${iteration}` }
    : undefined;

  const result = await callExpertWithFallback('debate_moderator', prompt, undefined, skipCache, undefined, false, briefOptions);
  return result.response;
}

async function buildFinalSummary(
  agenda: string,
  roundOneResponses: RoundResponse[],
  roundBriefs: string[],
  followUpRounds: Array<{ round: number; responses: RoundResponse[] }>,
  context?: string,
  skipCache: boolean = false,
  workflowOptions?: WorkflowCallOptions
): Promise<string> {
  const prompt = [
    '[중재자 역할: 최종 토론 정리]',
    `안건: ${agenda}`,
    context ? `추가 컨텍스트:\n${context}\n` : '',
    '1차 응답:',
    roundOneResponses.map((response) => `### ${response.personaLabel}\n${response.response}`).join('\n\n'),
    '중간 종합 브리프:',
    roundBriefs.map((brief, index) => `### ${index + 1}차 브리프\n${brief}`).join('\n\n'),
    '후속 라운드 응답:',
    followUpRounds.map((round) => `## ${round.round}차 응답\n\n${round.responses.map((response) => `### ${response.personaLabel}\n${response.response}`).join('\n\n')}`).join('\n\n'),
    '요청:',
    '1. 최종 결론을 먼저 제시하세요.',
    '2. 어떤 관점이 가장 설득력 있었는지 이유와 함께 설명하세요.',
    '3. 남은 쟁점과 조건부 판단을 정리하세요.',
    '4. 결과는 실행 가능한 권고 중심으로 작성하세요.'
  ].filter(Boolean).join('\n\n');

  const summaryOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: 'final_summary' }
    : undefined;

  const result = await callExpertWithFallback('debate_moderator', prompt, undefined, skipCache, undefined, false, summaryOptions);
  return result.response;
}

async function executeModeratedDebate(params: ModeratedDebateParams, debateId: string): Promise<string> {
  const startedAt = Date.now();
  const workflowOptions: WorkflowCallOptions = { workflowId: debateId, workflowType: 'moderated_debate', sessionId: SESSION_ID };
  const resolved = await resolveParticipants(params, workflowOptions);
  const participants = resolved.participants;

  const roundOne = await runRound(params.agenda, participants, 1, {
    context: params.context,
    skipCache: params.skip_cache ?? false
  }, workflowOptions);
  const roundOneSuccesses = roundOne.filter((response) => response.response);
  if (roundOneSuccesses.length < 2) {
    throw new Error('1차 라운드에서 최소 2명 이상의 응답이 필요합니다.');
  }

  const roundBriefs: string[] = [];
  const followUpRounds: Array<{ round: number; responses: RoundResponse[] }> = [];
  let currentSuccesses = roundOneSuccesses;
  let priorResponses = new Map<string, string>();

  for (const response of roundOneSuccesses) {
    priorResponses.set(response.expertId, response.response as string);
  }

  for (let iteration = 1; iteration <= (params.repeat_count ?? 1); iteration++) {
    const roundBrief = await buildRoundBrief(
      params.agenda,
      currentSuccesses,
      iteration,
      params.context,
      params.skip_cache ?? false,
      workflowOptions
    );
    roundBriefs.push(roundBrief);

    const followUp = await runRound(
      params.agenda,
      participants.filter((participant) => priorResponses.has(participant.expertId)),
      iteration + 1,
      {
        context: params.context,
        skipCache: params.skip_cache ?? false,
        roundBrief,
        priorResponses
      },
      workflowOptions
    );

    followUpRounds.push({ round: iteration + 1, responses: followUp });
    currentSuccesses = followUp.filter((response) => response.response);
    priorResponses = new Map<string, string>();

    for (const response of currentSuccesses) {
      priorResponses.set(response.expertId, response.response as string);
    }

    if (currentSuccesses.length < 2) {
      break;
    }
  }

  const finalSummary = await buildFinalSummary(
    params.agenda,
    roundOneSuccesses,
    roundBriefs,
    followUpRounds.map((round) => ({
      round: round.round,
      responses: round.responses.filter((response) => response.response)
    })),
    params.context,
    params.skip_cache ?? false,
    workflowOptions
  );

  const totalLatencyMs = Date.now() - startedAt;
  const failedCount = roundOne.filter((item) => item.error).length +
    followUpRounds.reduce((sum, round) => sum + round.responses.filter((item) => item.error).length, 0);

  let response = '## moderated_debate 결과\n\n';
  response += `**안건**: ${params.agenda}\n`;
  response += `**참여자**: ${participants.map((participant) => getPersonaLabel(participant)).join(', ')}\n`;
  response += `**페르소나 부여**: ${resolved.autoAssigned ? '자동' : '수동'}\n`;
  response += `**재질의 횟수**: ${params.repeat_count ?? 1}\n`;
  response += `**1차 성공**: ${roundOneSuccesses.length}\n`;
  response += `**마지막 라운드 성공**: ${currentSuccesses.length}\n`;
  response += `**실패 수**: ${failedCount}\n`;
  response += `**소요 시간**: ${totalLatencyMs}ms\n\n`;
  response += '### 최종 정리\n\n';
  response += `${finalSummary}\n\n`;

  if (params.include_transcript ?? true) {
    if (resolved.autoAssigned) {
      response += '### 자동 페르소나 배정\n\n';
      for (const participant of participants) {
        response += `- ${participant.expertId}: ${participant.persona} (${participant.focus || 'focus 없음'})\n`;
      }
      response += '\n';
    }

    response += '### 1차 응답\n\n';
    for (const item of roundOne) {
      response += `#### ${item.personaLabel} (${item.expertId})\n\n`;
      response += `${item.response || `실패: ${item.error}`}\n\n`;
    }

    for (const [index, roundBrief] of roundBriefs.entries()) {
      response += '---\n\n';
      response += `### ${index + 1}차 종합 브리프\n\n`;
      response += `${roundBrief}\n\n`;

      const followUp = followUpRounds[index];
      if (!followUp) continue;

      response += `### ${followUp.round}차 응답\n\n`;
      for (const item of followUp.responses) {
        response += `#### ${item.personaLabel} (${item.expertId})\n\n`;
        response += `${item.response || `실패: ${item.error}`}\n\n`;
      }
    }
  }

  return response;
}

export function handleModeratedDebate(params: ModeratedDebateParams): { content: Array<{ type: 'text'; text: string }> } {
  validateModeratedDebateParams(params);

  const debateId = generateDebateId();
  logger.info({
    debateId,
    agenda: params.agenda,
    participantCount: params.participants?.length ?? params.participant_count,
    repeatCount: params.repeat_count ?? 1
  }, 'Starting moderated debate in background');

  const task = startBackgroundWorkflow(
    `moderated_debate:${params.agenda.substring(0, 30)}`,
    () => executeModeratedDebate(params, debateId),
    debateId
  );

  return {
    content: [{
      type: 'text',
      text: `## 중재형 토론 백그라운드 시작\n\n` +
        `**안건**: ${params.agenda}\n` +
        `**참여자 수**: ${params.participants?.length ?? params.participant_count}\n` +
        `**페르소나 부여**: ${params.participants ? '수동' : '자동'}\n` +
        `**재질의 횟수**: ${params.repeat_count ?? 1}\n` +
        `**작업 ID**: \`${task.id}\`\n\n` +
        `### 결과 조회 방법\n` +
        `\`\`\`\n` +
        `background_expert_result(task_id="${task.id}")\n` +
        `\`\`\`\n\n` +
        `중재자가 페르소나 설계(필요 시) 후 패널 토론을 실행하고 최종 요약을 반환합니다.`
    }]
  };
}
