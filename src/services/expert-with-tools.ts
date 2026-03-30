// src/services/expert-with-tools.ts

import { Expert, ExpertResponse, ChatMessage, ToolCall } from '../types.js';
import { callExpert, CallExpertOptions } from './cliproxy-client.js';
import { executeToolCalls, expertToolDefinitions } from './tool-executor.js';
import { logger } from '../utils/logger.js';

const MAX_TOOL_CALLS = 3;  // 최대 도구 호출 횟수

export interface CallExpertWithToolsOptions {
  context?: string;
  skipCache?: boolean;
  maxToolCalls?: number;
  enableTools?: boolean;  // 도구 사용 활성화 여부
  imagePath?: string;     // 이미지 경로 (multimodal용)
}

/**
 * 전문가를 호출하고 도구 요청이 있으면 실행 후 재호출 (Tool Loop)
 */
export async function callExpertWithTools(
  expert: Expert,
  prompt: string,
  options: CallExpertWithToolsOptions = {}
): Promise<ExpertResponse> {
  const {
    context,
    skipCache = false,
    maxToolCalls = MAX_TOOL_CALLS,
    enableTools = true,
    imagePath
  } = options;

  const startTime = Date.now();
  let toolCallCount = 0;
  const toolsUsed: string[] = [];

  // 도구 비활성화 또는 전문가에 도구가 없으면 일반 호출
  if (!enableTools) {
    return callExpert(expert, prompt, { context, skipCache, imagePath });
  }

  // 사용할 도구 결정 (전문가별 도구 또는 기본 도구)
  const tools = expert.tools || expertToolDefinitions;
  const toolChoice = expert.toolChoice || "auto";

  // 초기 메시지 구성
  const systemPromptWithTools = `${expert.systemPrompt}

## 사용 가능한 도구
다음 도구들을 사용할 수 있습니다:
- web_search: 웹에서 최신 정보 검색 (2024년 이후 정보, 트렌드, 뉴스)
- get_library_docs: 라이브러리/프레임워크 공식 문서 조회 (API, 예제 코드)
- search_libraries: 라이브러리 검색 (ID 확인, 지원 여부)

## 도구 사용 가이드
- 최신 정보가 필요하면 web_search 사용
- 특정 라이브러리 API 문서가 필요하면 get_library_docs 사용
- 일반 지식으로 충분하면 도구 없이 바로 응답`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPromptWithTools },
    { role: "user", content: context ? `${prompt}\n\n[컨텍스트]\n${context}` : prompt }
  ];

  logger.info({
    expert: expert.id,
    toolsEnabled: true,
    toolCount: tools.length
  }, 'Starting expert call with tools');

  // Tool Loop
  while (toolCallCount < maxToolCalls) {
    const response = await callExpert(expert, prompt, {
      skipCache,
      tools,
      toolChoice,
      messages
    });

    // 도구 호출이 없으면 최종 응답 (toolCalls 유무로 판단)
    if (!response.toolCalls || response.toolCalls.length === 0) {
      const totalLatencyMs = Date.now() - startTime;

      logger.info({
        expert: expert.id,
        toolCallCount,
        toolsUsed,
        totalLatencyMs
      }, 'Expert with tools completed');

      return {
        ...response,
        latencyMs: totalLatencyMs,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
      };
    }

    // 도구 호출 실행
    logger.info({
      expert: expert.id,
      toolCalls: response.toolCalls.map(tc => tc.function.name)
    }, 'Executing tool calls');

    // assistant 메시지 추가 (tool_calls 포함)
    messages.push({
      role: "assistant",
      content: response.response || null,
      tool_calls: response.toolCalls
    });

    // 도구 실행
    const toolResults = await executeToolCalls(response.toolCalls);

    // 도구 결과를 메시지에 추가
    for (const result of toolResults) {
      messages.push({
        role: "tool",
        content: result.content,
        tool_call_id: result.tool_call_id
      });
    }

    // 사용된 도구 기록
    for (const tc of response.toolCalls) {
      if (!toolsUsed.includes(tc.function.name)) {
        toolsUsed.push(tc.function.name);
      }
    }

    toolCallCount++;
  }

  // 최대 호출 횟수 초과 - 현재 상태로 응답 요청
  logger.warn({
    expert: expert.id,
    maxToolCalls
  }, 'Max tool calls reached, requesting final response');

  // 도구 없이 마지막 호출
  const finalResponse = await callExpert(expert, prompt, {
    skipCache,
    messages,
    // 도구 없이 호출하여 최종 응답 유도
  });

  return {
    ...finalResponse,
    latencyMs: Date.now() - startTime,
    toolsUsed
  };
}

/**
 * 전문가가 도구를 사용할 수 있는지 확인
 */
export function canExpertUseTools(expert: Expert): boolean {
  // 모든 전문가가 기본 도구 사용 가능
  return true;
}

/**
 * 전문가별 추천 도구 반환
 */
export function getRecommendedTools(expertId: string): string[] {
  const toolRecommendations: Record<string, string[]> = {
    strategist: ["web_search", "get_library_docs"],  // 설계 시 최신 트렌드 + 문서 필요
    codereview: ["get_library_docs"],  // 코드 리뷰 시 문서 참조
    frontend: ["get_library_docs", "web_search"],  // UI 라이브러리 문서 + 트렌드
  };

  return toolRecommendations[expertId] || [];
}
