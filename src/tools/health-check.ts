// src/tools/health-check.ts

import { z } from "zod";
import { config } from "../config.js";
import { getRateLimitStatus } from "../utils/rate-limit.js";
import { getCacheStats, clearCache } from "../utils/cache.js";
import { getStats as getBackgroundStats, cleanupOldTasks } from "../services/background-manager.js";
import { experts } from "../experts/index.js";

export const healthCheckSchema = z.object({
  include_details: z.boolean()
    .default(false)
    .describe("상세 정보 포함"),

  clear_cache: z.boolean()
    .default(false)
    .describe("캐시 초기화"),

  cleanup_tasks: z.boolean()
    .default(false)
    .describe("오래된 백그라운드 작업 정리")
}).strict();

export const healthCheckTool = {
  name: "llm_router_health",

  title: "LLM Router 상태 확인",

  description: `LLM Router MCP 서버의 상태를 확인합니다.

## 확인 항목
- CLIProxyAPI 연결 상태
- Rate Limit 현황
- 캐시 통계
- 백그라운드 작업 현황
- 등록된 전문가 목록

## 관리 기능
- clear_cache: 응답 캐시 초기화
- cleanup_tasks: 완료된 백그라운드 작업 정리`,

  inputSchema: healthCheckSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
};

export async function handleHealthCheck(params: z.infer<typeof healthCheckSchema>) {
  // 캐시 정리
  if (params.clear_cache) {
    clearCache();
  }

  // 오래된 작업 정리
  let cleanedTasks = 0;
  if (params.cleanup_tasks) {
    cleanedTasks = cleanupOldTasks();
  }

  // CLIProxyAPI 연결 테스트
  let apiStatus = 'unknown';
  try {
    const res = await fetch(`${config.cliproxyUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const body = await res.json() as { data?: unknown[] };
      if (body.data && body.data.length > 0) {
        apiStatus = '✅ 연결됨';
      } else {
        apiStatus = '⚠️ 연결됨 (인증 필요)';
      }
    } else if (res.status === 401) {
      apiStatus = '⚠️ 연결됨 (인증 필요)';
    } else {
      apiStatus = `❌ 응답 오류 (${res.status})`;
    }
  } catch {
    apiStatus = '❌ 연결 실패';
  }

  // 통계 수집
  const rateLimitStatus = getRateLimitStatus();
  const cacheStats = getCacheStats();
  const backgroundStats = getBackgroundStats();

  let output = `## 🏥 LLM Router 상태\n\n`;

  output += `### CLIProxyAPI\n`;
  output += `- URL: \`${config.cliproxyUrl}\`\n`;
  output += `- 상태: ${apiStatus}\n\n`;

  output += `### 전문가 (${Object.keys(experts).length}명)\n`;
  for (const [id, expert] of Object.entries(experts)) {
    const limited = rateLimitStatus[expert.model]?.limited;
    output += `- **${id}**: ${expert.model} ${limited ? '🔴 한도초과' : '🟢'}\n`;
  }
  output += '\n';

  output += `### 캐시\n`;
  output += `- 항목 수: ${cacheStats.size}/${cacheStats.maxSize}\n`;
  output += `- TTL: ${cacheStats.ttlMs / 1000 / 60}분\n`;
  if (params.clear_cache) {
    output += `- ✅ 캐시 초기화됨\n`;
  }
  output += '\n';

  output += `### 백그라운드 작업\n`;
  output += `- 실행 중: ${backgroundStats.running}\n`;
  output += `- 대기 중: ${backgroundStats.pending} (큐: ${backgroundStats.queueLength})\n`;
  output += `- 완료: ${backgroundStats.completed}\n`;
  output += `- 실패: ${backgroundStats.failed}\n`;
  if (params.cleanup_tasks && cleanedTasks > 0) {
    output += `- ✅ ${cleanedTasks}개 작업 정리됨\n`;
  }

  if (params.include_details) {
    output += `\n### 상세 설정\n`;
    output += `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  }

  return {
    content: [{ type: "text" as const, text: output }]
  };
}
