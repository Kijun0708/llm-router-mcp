// src/tools/session-memory.ts

import { z } from "zod";
import { sessionMemory, MemoryEntry } from "../services/session-memory.js";

// ============================================
// 1. memory_add - 메모리에 내용 추가
// ============================================

export const memoryAddSchema = z.object({
  type: z.enum(['goal', 'decision', 'context'])
    .describe("메모리 타입: goal(목표), decision(결정사항), context(일반 컨텍스트)"),

  content: z.string()
    .min(1)
    .describe("저장할 내용")
}).strict();

export const memoryAddTool = {
  name: "memory_add",
  title: "세션 메모리 추가",
  description: `세션 공유 메모리에 내용을 추가합니다.

## 타입 설명
- **goal**: 프로젝트 목표, 요구사항
- **decision**: 주요 결정사항, 합의된 내용
- **context**: 기타 참고할 컨텍스트

## 용도
저장된 내용은 모든 전문가 호출 시 자동으로 컨텍스트로 전달됩니다.
전문가들이 프로젝트 상황을 이해하고 일관된 답변을 하도록 돕습니다.`,

  inputSchema: memoryAddSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
};

export async function handleMemoryAdd(params: z.infer<typeof memoryAddSchema>) {
  const entry = sessionMemory.add(params.type, params.content, 'user');

  const typeLabels = {
    goal: '목표',
    decision: '결정사항',
    context: '컨텍스트'
  };

  return {
    content: [{
      type: "text" as const,
      text: `## ✅ 메모리 추가됨

| 항목 | 값 |
|------|-----|
| ID | \`${entry.id.substring(0, 8)}...\` |
| 타입 | ${typeLabels[params.type]} |
| 내용 | ${params.content} |

> 이 내용은 모든 전문가 호출 시 자동으로 전달됩니다.`
    }]
  };
}

// ============================================
// 2. memory_list - 메모리 조회
// ============================================

export const memoryListSchema = z.object({
  type: z.enum(['goal', 'decision', 'context', 'expert_response', 'all'])
    .default('all')
    .describe("조회할 타입 (기본: all)")
}).strict();

export const memoryListTool = {
  name: "memory_list",
  title: "세션 메모리 조회",
  description: `현재 세션 메모리의 내용을 조회합니다.

## 타입
- **all**: 전체 조회
- **goal**: 목표만
- **decision**: 결정사항만
- **context**: 컨텍스트만
- **expert_response**: 전문가 응답만`,

  inputSchema: memoryListSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export async function handleMemoryList(params: z.infer<typeof memoryListSchema>) {
  const stats = sessionMemory.getStats();
  const entries = params.type === 'all'
    ? sessionMemory.getAll()
    : sessionMemory.getByType(params.type as MemoryEntry['type']);

  let output = `## 📋 세션 메모리\n\n`;
  output += `**총 ${stats.total}개 항목** (목표: ${stats.byType.goal}, 결정: ${stats.byType.decision}, 컨텍스트: ${stats.byType.context}, 전문가응답: ${stats.byType.expert_response})\n\n`;

  if (entries.length === 0) {
    output += `_메모리가 비어있습니다._`;
  } else {
    const typeLabels: Record<string, string> = {
      goal: '🎯 목표',
      decision: '✅ 결정',
      context: '📝 컨텍스트',
      expert_response: '🤖 전문가응답'
    };

    for (const entry of entries) {
      const time = entry.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      output += `### ${typeLabels[entry.type]} ${entry.source ? `(${entry.source})` : ''}\n`;
      output += `_${time}_ | ID: \`${entry.id.substring(0, 8)}\`\n\n`;
      output += `${entry.content}\n\n---\n\n`;
    }
  }

  return {
    content: [{ type: "text" as const, text: output }]
  };
}

// ============================================
// 3. memory_clear - 메모리 초기화
// ============================================

export const memoryClearSchema = z.object({
  confirm: z.boolean()
    .default(false)
    .describe("초기화 확인 (true로 설정해야 실행)")
}).strict();

export const memoryClearTool = {
  name: "memory_clear",
  title: "세션 메모리 초기화",
  description: `세션 메모리를 완전히 초기화합니다.

**주의**: 모든 저장된 목표, 결정사항, 컨텍스트, 전문가 응답이 삭제됩니다.
confirm: true로 설정해야 실행됩니다.`,

  inputSchema: memoryClearSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export async function handleMemoryClear(params: z.infer<typeof memoryClearSchema>) {
  if (!params.confirm) {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 확인 필요

메모리를 초기화하려면 \`confirm: true\`로 다시 호출하세요.

현재 메모리: ${sessionMemory.getStats().total}개 항목`
      }]
    };
  }

  const count = sessionMemory.clear();

  return {
    content: [{
      type: "text" as const,
      text: `## 🗑️ 메모리 초기화 완료

**${count}개** 항목이 삭제되었습니다.`
    }]
  };
}
