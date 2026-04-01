// src/tools/health-check.ts

import { z } from "zod";
import { config } from "../config.js";
import { getRateLimitStatus } from "../utils/rate-limit.js";
import { getCacheStats, clearCache } from "../utils/cache.js";
import { getStats as getBackgroundStats, cleanupOldTasks } from "../services/background-manager.js";
import { experts } from "../experts/index.js";
import { cleanupOldResponses } from "../utils/response-saver.js";
import { getDashboardInfo } from "../dashboard-server/index.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
const VERSION = pkg.version as string;

export const healthCheckSchema = z.object({
  include_details: z.boolean()
    .default(false)
    .describe("상세 정보 포함"),

  clear_cache: z.boolean()
    .default(false)
    .describe("캐시 초기화"),

  cleanup_tasks: z.boolean()
    .default(false)
    .describe("오래된 백그라운드 작업 정리"),

}).strict();

export const healthCheckTool = {
  name: "llm_router_health",

  title: "LLM Router 상태 확인",

  description: `LLM Router MCP 서버의 상태를 확인합니다.

## 확인 항목
- CLI 도구 상태 (gemini, claude, codex)
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
  let cleanedResponses = 0;
  if (params.cleanup_tasks) {
    cleanedTasks = cleanupOldTasks();
    cleanedResponses = cleanupOldResponses();
  }

  // 통계 수집
  const rateLimitStatus = getRateLimitStatus();
  const cacheStats = getCacheStats();
  const backgroundStats = getBackgroundStats();

  let output = `## 🏥 LLM Router v${VERSION}\n\n`;

  // 대시보드 정보
  const dashboardInfo = getDashboardInfo();
  if (dashboardInfo) {
    output += `### 📊 대시보드\n`;
    output += `- URL: ${dashboardInfo.url}\n\n`;
  }

  output += `### CLI 도구\n`;
  output += `- Gemini: \`${config.cli.geminiPath}\`\n`;
  output += `- Claude: \`${config.cli.claudePath}\`\n`;
  output += `- Codex: \`${config.cli.codexPath}\`\n\n`;

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
  if (params.cleanup_tasks && cleanedResponses > 0) {
    output += `- ✅ ${cleanedResponses}개 응답 파일 정리됨\n`;
  }

  if (params.include_details) {
    // 민감 정보 마스킹
    const safeConfig = {
      ...config,
      exaApiKey: config.exaApiKey ? '***' : undefined,
      context7ApiKey: config.context7ApiKey ? '***' : undefined,
    };
    output += `\n### 상세 설정\n`;
    output += `\`\`\`json\n${JSON.stringify(safeConfig, null, 2)}\n\`\`\``;
  }

  return {
    content: [{ type: "text" as const, text: output }]
  };
}
