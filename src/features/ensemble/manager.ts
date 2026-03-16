// src/features/ensemble/manager.ts

/**
 * Multi-Model Ensemble Manager
 *
 * 여러 LLM을 조합하여 더 나은 결과를 얻는 앙상블 시스템
 */

import { logger } from '../../utils/logger.js';
import { callExpertWithFallback, WorkflowCallOptions } from '../../services/expert-router.js';
import { experts } from '../../experts/index.js';
import {
  EnsembleConfig,
  EnsembleResult,
  ParticipantResponse,
  DebateRound,
  VoteResult,
  EnsembleParticipant,
  EXPERT_PROVIDERS
} from './types.js';

/**
 * 고유 ID 생성
 */
function generateEnsembleId(): string {
  return `ens_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 병렬 실행 전략
 */
async function executeParallel(
  query: string,
  participants: EnsembleParticipant[],
  context?: string,
  useCache: boolean = true,
  workflowOptions?: WorkflowCallOptions
): Promise<ParticipantResponse[]> {
  const startTime = Date.now();

  const promises = participants.map(async (participant) => {
    const expertStartTime = Date.now();

    try {
      const result = await callExpertWithFallback(
        participant.expertId,
        participant.customPrompt || query,
        context,
        !useCache,
        undefined,
        false,
        workflowOptions
      );

      return {
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: result.response,
        latencyMs: Date.now() - expertStartTime,
        cached: result.cached,
        fellBack: result.fellBack,
        weight: participant.weight || 1.0
      };
    } catch (error) {
      return {
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: '',
        latencyMs: Date.now() - expertStartTime,
        cached: false,
        fellBack: false,
        weight: participant.weight || 1.0,
        error: (error as Error).message
      };
    }
  });

  return Promise.all(promises);
}

/**
 * 결과 연결 (concatenate)
 */
function concatenateResponses(responses: ParticipantResponse[]): string {
  const successfulResponses = responses.filter(r => !r.error && r.response);

  if (successfulResponses.length === 0) {
    return '모든 전문가 호출이 실패했습니다.';
  }

  return successfulResponses
    .map(r => {
      const provider = EXPERT_PROVIDERS[r.expertId] || r.expertId;
      const cacheTag = r.cached ? ' (캐시)' : '';
      const fallbackTag = r.fellBack ? ' (대체)' : '';
      return `### ${r.expertId} (${provider})${cacheTag}${fallbackTag}\n\n${r.response}`;
    })
    .join('\n\n---\n\n');
}

/**
 * 합성 전략 실행
 */
async function executeSynthesize(
  query: string,
  participants: EnsembleParticipant[],
  synthesizer: string,
  context?: string,
  useCache: boolean = true,
  workflowOptions?: WorkflowCallOptions
): Promise<{ responses: ParticipantResponse[]; synthesis: ParticipantResponse }> {
  // 1. 병렬로 모든 전문가 응답 수집
  const parallelOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: 'parallel' }
    : undefined;
  const responses = await executeParallel(query, participants, context, useCache, parallelOptions);

  // 2. 성공한 응답들을 합성
  const successfulResponses = responses.filter(r => !r.error && r.response);

  if (successfulResponses.length === 0) {
    throw new Error('합성할 응답이 없습니다.');
  }

  const synthesisPrompt = `
다음은 여러 전문가의 의견입니다. 이들을 종합하여 최종 결론을 도출해주세요.

## 원본 질문
${query}

## 전문가 의견들
${successfulResponses.map(r => `### ${r.expertId}\n${r.response}`).join('\n\n')}

## 요청
위 의견들을 분석하고 종합하여:
1. 공통된 핵심 포인트
2. 상충되는 의견이 있다면 해결 방안
3. 최종 통합 결론

을 제시해주세요.
`.trim();

  const synthStartTime = Date.now();
  const synthesisOptions: WorkflowCallOptions | undefined = workflowOptions
    ? { ...workflowOptions, callPhase: 'synthesis' }
    : undefined;

  try {
    const result = await callExpertWithFallback(synthesizer, synthesisPrompt, undefined, !useCache, undefined, false, synthesisOptions);

    return {
      responses,
      synthesis: {
        expertId: synthesizer,
        model: experts[synthesizer]?.model || 'unknown',
        response: result.response,
        latencyMs: Date.now() - synthStartTime,
        cached: result.cached,
        fellBack: result.fellBack,
        weight: 1.0
      }
    };
  } catch (error) {
    return {
      responses,
      synthesis: {
        expertId: synthesizer,
        model: experts[synthesizer]?.model || 'unknown',
        response: '',
        latencyMs: Date.now() - synthStartTime,
        cached: false,
        fellBack: false,
        weight: 1.0,
        error: (error as Error).message
      }
    };
  }
}

/**
 * 토론 전략 실행
 */
async function executeDebate(
  query: string,
  participants: EnsembleParticipant[],
  maxRounds: number = 2,
  context?: string,
  useCache: boolean = true,
  workflowOptions?: WorkflowCallOptions
): Promise<{ responses: ParticipantResponse[]; debateHistory: DebateRound[] }> {
  const allResponses: ParticipantResponse[] = [];
  const debateHistory: DebateRound[] = [];

  if (participants.length < 2) {
    throw new Error('토론에는 최소 2명의 참여자가 필요합니다.');
  }

  // Round 0: 첫 번째 발언자가 초기 의견 제시
  const firstParticipant = participants[0];
  const initialPrompt = `
[토론 시작]
주제: ${query}
${context ? `\n컨텍스트: ${context}` : ''}

당신의 역할: ${firstParticipant.role || firstParticipant.expertId}

이 주제에 대한 의견을 제시해주세요.
`.trim();

  const firstStartTime = Date.now();
  try {
    const firstResult = await callExpertWithFallback(firstParticipant.expertId, initialPrompt, undefined, !useCache, undefined, false, workflowOptions);

    allResponses.push({
      expertId: firstParticipant.expertId,
      model: experts[firstParticipant.expertId]?.model || 'unknown',
      response: firstResult.response,
      latencyMs: Date.now() - firstStartTime,
      cached: firstResult.cached,
      fellBack: firstResult.fellBack,
      weight: firstParticipant.weight || 1.0
    });

    debateHistory.push({
      round: 0,
      speaker: firstParticipant.expertId,
      content: firstResult.response
    });
  } catch (error) {
    throw new Error(`첫 번째 발언자 호출 실패: ${(error as Error).message}`);
  }

  // 토론 라운드
  for (let round = 1; round <= maxRounds; round++) {
    for (let i = 1; i < participants.length; i++) {
      const participant = participants[i];
      const previousSpeaker = debateHistory[debateHistory.length - 1];

      const debatePrompt = `
[토론 라운드 ${round}]
주제: ${query}

당신의 역할: ${participant.role || participant.expertId}

이전 발언 (${previousSpeaker.speaker}):
${previousSpeaker.content}

위 의견에 대해 비평하고, 당신의 관점을 추가해주세요.
동의하는 점과 보완/반박할 점을 명확히 구분해서 작성하세요.
`.trim();

      const startTime = Date.now();
      try {
        const result = await callExpertWithFallback(participant.expertId, debatePrompt, undefined, !useCache, undefined, false, workflowOptions);

        allResponses.push({
          expertId: participant.expertId,
          model: experts[participant.expertId]?.model || 'unknown',
          response: result.response,
          latencyMs: Date.now() - startTime,
          cached: result.cached,
          fellBack: result.fellBack,
          weight: participant.weight || 1.0
        });

        debateHistory.push({
          round,
          speaker: participant.expertId,
          content: result.response,
          responseTo: previousSpeaker.speaker
        });
      } catch (error) {
        logger.warn({ error, participant: participant.expertId }, 'Debate participant failed');
      }
    }

    // 첫 번째 참여자가 반론 (마지막 라운드가 아닌 경우)
    if (round < maxRounds && debateHistory.length > 1) {
      const lastResponse = debateHistory[debateHistory.length - 1];

      const rebuttalPrompt = `
[토론 라운드 ${round} - 반론]
주제: ${query}

당신의 역할: ${firstParticipant.role || firstParticipant.expertId}

다른 참여자의 의견:
${lastResponse.content}

이에 대한 반론 또는 수정된 의견을 제시해주세요.
`.trim();

      const startTime = Date.now();
      try {
        const result = await callExpertWithFallback(firstParticipant.expertId, rebuttalPrompt, undefined, !useCache, undefined, false, workflowOptions);

        allResponses.push({
          expertId: firstParticipant.expertId,
          model: experts[firstParticipant.expertId]?.model || 'unknown',
          response: result.response,
          latencyMs: Date.now() - startTime,
          cached: result.cached,
          fellBack: result.fellBack,
          weight: firstParticipant.weight || 1.0
        });

        debateHistory.push({
          round,
          speaker: firstParticipant.expertId,
          content: result.response,
          responseTo: lastResponse.speaker
        });
      } catch (error) {
        logger.warn({ error }, 'Rebuttal failed');
      }
    }
  }

  return { responses: allResponses, debateHistory };
}

/**
 * 투표 전략 실행
 */
async function executeVote(
  query: string,
  options: string[],
  participants: EnsembleParticipant[],
  context?: string,
  useCache: boolean = true,
  workflowOptions?: WorkflowCallOptions
): Promise<{ responses: ParticipantResponse[]; voteResults: VoteResult[] }> {
  const votePrompt = `
[투표 요청]
질문: ${query}
${context ? `\n컨텍스트: ${context}` : ''}

다음 중 하나를 선택하세요:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

반드시 숫자로만 답하세요 (예: "1" 또는 "2").
선택 이유도 간단히 설명해주세요.
`.trim();

  const responses = await executeParallel(
    votePrompt,
    participants,
    undefined,
    useCache,
    workflowOptions
  );

  // 투표 집계
  const voteCounts: Record<string, { count: number; voters: string[] }> = {};
  options.forEach(opt => {
    voteCounts[opt] = { count: 0, voters: [] };
  });

  for (const response of responses) {
    if (response.error || !response.response) continue;

    // 응답에서 숫자 추출
    const match = response.response.match(/^(\d+)/);
    if (match) {
      const optionIndex = parseInt(match[1], 10) - 1;
      if (optionIndex >= 0 && optionIndex < options.length) {
        const option = options[optionIndex];
        voteCounts[option].count++;
        voteCounts[option].voters.push(response.expertId);
      }
    }
  }

  const totalVotes = Object.values(voteCounts).reduce((sum, v) => sum + v.count, 0);

  const voteResults: VoteResult[] = Object.entries(voteCounts)
    .map(([option, data]) => ({
      option,
      votes: data.count,
      percentage: totalVotes > 0 ? Math.round((data.count / totalVotes) * 100) : 0,
      voters: data.voters
    }))
    .sort((a, b) => b.votes - a.votes);

  return { responses, voteResults };
}

/**
 * Best-of-N 전략 실행
 */
async function executeBestOfN(
  query: string,
  participant: EnsembleParticipant,
  n: number = 3,
  context?: string,
  workflowOptions?: WorkflowCallOptions
): Promise<{ responses: ParticipantResponse[]; bestResponse: ParticipantResponse }> {
  // N번 실행 (캐시 사용 안 함)
  const responses: ParticipantResponse[] = [];

  for (let i = 0; i < n; i++) {
    const startTime = Date.now();

    try {
      const result = await callExpertWithFallback(
        participant.expertId,
        query,
        context,
        true,  // skipCache
        undefined,
        false,
        workflowOptions
      );

      responses.push({
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: result.response,
        latencyMs: Date.now() - startTime,
        cached: false,
        fellBack: result.fellBack,
        weight: participant.weight || 1.0
      });
    } catch (error) {
      responses.push({
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: '',
        latencyMs: Date.now() - startTime,
        cached: false,
        fellBack: false,
        weight: participant.weight || 1.0,
        error: (error as Error).message
      });
    }
  }

  // 가장 긴 응답을 최고로 선택 (간단한 휴리스틱)
  // 더 정교한 선택을 위해서는 별도의 평가 모델이 필요
  const successfulResponses = responses.filter(r => !r.error && r.response);

  if (successfulResponses.length === 0) {
    throw new Error('모든 시도가 실패했습니다.');
  }

  const bestResponse = successfulResponses.reduce((best, current) =>
    current.response.length > best.response.length ? current : best
  );

  return { responses, bestResponse };
}

/**
 * 체인 전략 실행
 */
async function executeChain(
  query: string,
  participants: EnsembleParticipant[],
  context?: string,
  useCache: boolean = true,
  workflowOptions?: WorkflowCallOptions
): Promise<ParticipantResponse[]> {
  const responses: ParticipantResponse[] = [];
  let previousOutput = '';

  for (const participant of participants) {
    const chainPrompt = previousOutput
      ? `
[이전 단계 결과]
${previousOutput}

[다음 단계]
${participant.customPrompt || query}

위 결과를 바탕으로 작업을 계속하세요.
`.trim()
      : participant.customPrompt || query;

    const startTime = Date.now();

    try {
      const result = await callExpertWithFallback(
        participant.expertId,
        chainPrompt,
        context,
        !useCache,
        undefined,
        false,
        workflowOptions
      );

      responses.push({
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: result.response,
        latencyMs: Date.now() - startTime,
        cached: result.cached,
        fellBack: result.fellBack,
        weight: participant.weight || 1.0
      });

      previousOutput = result.response;
    } catch (error) {
      responses.push({
        expertId: participant.expertId,
        model: experts[participant.expertId]?.model || 'unknown',
        response: '',
        latencyMs: Date.now() - startTime,
        cached: false,
        fellBack: false,
        weight: participant.weight || 1.0,
        error: (error as Error).message
      });

      // 체인 중단
      break;
    }
  }

  return responses;
}

/**
 * 앙상블 실행
 */
export async function runEnsemble(
  query: string,
  config: EnsembleConfig,
  context?: string,
  voteOptions?: string[],
  workflowOptions?: WorkflowCallOptions
): Promise<EnsembleResult> {
  const ensembleId = generateEnsembleId();
  const startTime = Date.now();

  logger.info({
    ensembleId,
    strategy: config.strategy,
    participantCount: config.participants.length
  }, 'Starting ensemble execution');

  let responses: ParticipantResponse[] = [];
  let finalResult = '';
  let synthesizedBy: string | undefined;
  let voteResults: VoteResult[] | undefined;
  let debateHistory: DebateRound[] | undefined;

  try {
    switch (config.strategy) {
      case 'parallel': {
        responses = await executeParallel(query, config.participants, context, config.useCache, workflowOptions);
        finalResult = concatenateResponses(responses);
        break;
      }

      case 'synthesize': {
        if (!config.synthesizer) {
          throw new Error('synthesize 전략에는 synthesizer가 필요합니다.');
        }
        const synthResult = await executeSynthesize(
          query,
          config.participants,
          config.synthesizer,
          context,
          config.useCache,
          workflowOptions
        );
        responses = [...synthResult.responses, synthResult.synthesis];
        synthesizedBy = config.synthesizer;
        finalResult = synthResult.synthesis.error
          ? concatenateResponses(synthResult.responses)
          : synthResult.synthesis.response;
        break;
      }

      case 'vote': {
        if (!voteOptions || voteOptions.length < 2) {
          throw new Error('vote 전략에는 최소 2개의 선택지가 필요합니다.');
        }
        const voteResult = await executeVote(
          query,
          voteOptions,
          config.participants,
          context,
          config.useCache,
          workflowOptions
        );
        responses = voteResult.responses;
        voteResults = voteResult.voteResults;

        // 투표 결과 포맷팅
        const winner = voteResults[0];
        finalResult = `## 투표 결과\n\n`;
        finalResult += `**승자**: ${winner.option} (${winner.votes}표, ${winner.percentage}%)\n\n`;
        finalResult += `| 선택지 | 득표 | 비율 | 투표자 |\n`;
        finalResult += `|--------|------|------|--------|\n`;
        for (const result of voteResults) {
          finalResult += `| ${result.option} | ${result.votes} | ${result.percentage}% | ${result.voters.join(', ') || '-'} |\n`;
        }
        break;
      }

      case 'best_of_n': {
        if (config.participants.length !== 1) {
          throw new Error('best_of_n 전략에는 정확히 1명의 참여자가 필요합니다.');
        }
        const bestResult = await executeBestOfN(
          query,
          config.participants[0],
          config.n || 3,
          context,
          workflowOptions
        );
        responses = bestResult.responses;
        finalResult = bestResult.bestResponse.response;
        break;
      }

      case 'chain': {
        responses = await executeChain(query, config.participants, context, config.useCache, workflowOptions);
        // 마지막 성공한 응답을 결과로
        const lastSuccess = [...responses].reverse().find(r => !r.error && r.response);
        finalResult = lastSuccess?.response || '체인 실행 실패';
        break;
      }

      default:
        throw new Error(`알 수 없는 전략: ${config.strategy}`);
    }
  } catch (error) {
    logger.error({ error, ensembleId }, 'Ensemble execution failed');
    finalResult = `앙상블 실행 실패: ${(error as Error).message}`;
  }

  const totalLatencyMs = Date.now() - startTime;
  const successCount = responses.filter(r => !r.error && r.response).length;
  const failureCount = responses.filter(r => r.error || !r.response).length;

  const result: EnsembleResult = {
    id: ensembleId,
    strategy: config.strategy,
    query,
    responses,
    finalResult,
    aggregation: config.aggregation,
    synthesizedBy,
    voteResults,
    debateHistory,
    totalLatencyMs,
    successCount,
    failureCount,
    timestamp: new Date().toISOString()
  };

  logger.info({
    ensembleId,
    totalLatencyMs,
    successCount,
    failureCount
  }, 'Ensemble execution completed');

  return result;
}

/**
 * 프리셋으로 앙상블 실행
 */
export async function runPresetEnsemble(
  presetId: string,
  query: string,
  context?: string,
  voteOptions?: string[],
  workflowOptions?: WorkflowCallOptions
): Promise<EnsembleResult> {
  const { DEFAULT_PRESETS } = await import('./types.js');
  const preset = DEFAULT_PRESETS.find(p => p.id === presetId);

  if (!preset) {
    throw new Error(`프리셋을 찾을 수 없습니다: ${presetId}`);
  }

  return runEnsemble(query, preset.config, context, voteOptions, workflowOptions);
}
