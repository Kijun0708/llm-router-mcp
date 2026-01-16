// src/index.ts

import 'dotenv/config';  // 환경변수 로드
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { logger } from "./utils/logger.js";

import { ensureCliproxyRunning } from "./utils/cliproxy-launcher.js";
import { setupHookSystem } from "./hooks/index.js";

// 도구 임포트
import {
  consultExpertTool, consultExpertSchema, handleConsultExpert,
  categoryTaskTool, categoryTaskSchema, handleCategoryTask,
  backgroundStartTool, backgroundStartSchema, handleBackgroundStart,
  backgroundResultTool, backgroundResultSchema, handleBackgroundResult,
  backgroundCancelTool, backgroundCancelSchema, handleBackgroundCancel,
  backgroundListTool, backgroundListSchema, handleBackgroundList,
  designWorkflowTool, designWorkflowSchema, handleDesignWorkflow,
  reviewCodeTool, reviewCodeSchema, handleReviewCode,
  researchTopicTool, researchTopicSchema, handleResearchTopic,
  healthCheckTool, healthCheckSchema, handleHealthCheck,
  webSearchTool, webSearchSchema, handleWebSearch,
  libraryDocsTool, libraryDocsSchema, handleLibraryDocs,
  searchLibrariesTool, searchLibrariesSchema, handleSearchLibraries,
  authStatusTool, authStatusSchema, handleAuthStatus,
  authGptTool, authClaudeTool, authGeminiTool, authProviderSchema,
  handleAuthGpt, handleAuthClaude, handleAuthGemini,
  setExpertModelTool, setExpertModelSchema, handleSetExpertModel,
  memoryAddTool, memoryAddSchema, handleMemoryAdd,
  memoryListTool, memoryListSchema, handleMemoryList,
  memoryClearTool, memoryClearSchema, handleMemoryClear,
  orchestrateTaskTool, orchestrateTaskSchema, handleOrchestrateTask,
  ralphLoopStartTool, ralphLoopStartSchema, handleRalphLoopStart,
  ralphLoopCancelTool, ralphLoopCancelSchema, handleRalphLoopCancel,
  ralphLoopStatusTool, ralphLoopStatusSchema, handleRalphLoopStatus,
  hookStatusTool, hookStatusSchema, handleHookStatus,
  hookToggleTool, hookToggleSchema, handleHookToggle,
  hookSystemToggleTool, hookSystemToggleSchema, handleHookSystemToggle,
  externalHookAddTool, externalHookAddSchema, handleExternalHookAdd,
  externalHookRemoveTool, externalHookRemoveSchema, handleExternalHookRemove,
  externalHookListTool, externalHookListSchema, handleExternalHookList,
  boulderStatusTool, boulderStatusSchema, handleBoulderStatus,
  boulderRecoverTool, boulderRecoverSchema, handleBoulderRecover,
  boulderDetailTool, boulderDetailSchema, handleBoulderDetail,
  keywordAddTool, keywordAddSchema, handleKeywordAdd,
  keywordRemoveTool, keywordRemoveSchema, handleKeywordRemove,
  keywordListTool, keywordListSchema, handleKeywordList,
  keywordDetectTool, keywordDetectSchema, handleKeywordDetect,
  keywordToggleTool, keywordToggleSchema, handleKeywordToggle,
  keywordSystemToggleTool, keywordSystemToggleSchema, handleKeywordSystemToggle,
  permissionCheckTool, permissionCheckSchema, handlePermissionCheck,
  permissionGrantTool, permissionGrantSchema, handlePermissionGrant,
  permissionDenyTool, permissionDenySchema, handlePermissionDeny,
  permissionListTool, permissionListSchema, handlePermissionList,
  permissionPatternToggleTool, permissionPatternToggleSchema, handlePermissionPatternToggle,
  permissionSystemToggleTool, permissionSystemToggleSchema, handlePermissionSystemToggle,
  permissionClearSessionTool, permissionClearSessionSchema, handlePermissionClearSession
} from "./tools/index.js";

// 서버 초기화
const server = new McpServer({
  name: "llm-router-mcp",
  version: "2.0.0"
});

// 도구 등록
function registerTools() {
  // 1. consult_expert
  server.tool(
    consultExpertTool.name,
    consultExpertSchema.shape,
    (args) => handleConsultExpert(consultExpertSchema.parse(args))
  );

  // 2. route_by_category
  server.tool(
    categoryTaskTool.name,
    categoryTaskSchema.shape,
    (args) => handleCategoryTask(categoryTaskSchema.parse(args))
  );

  // 3. background_expert_start
  server.tool(
    backgroundStartTool.name,
    backgroundStartSchema.shape,
    (args) => handleBackgroundStart(backgroundStartSchema.parse(args))
  );

  // 4. background_expert_result
  server.tool(
    backgroundResultTool.name,
    backgroundResultSchema.shape,
    (args) => handleBackgroundResult(backgroundResultSchema.parse(args))
  );

  // 5. background_expert_cancel
  server.tool(
    backgroundCancelTool.name,
    backgroundCancelSchema.shape,
    (args) => handleBackgroundCancel(backgroundCancelSchema.parse(args))
  );

  // 6. background_expert_list
  server.tool(
    backgroundListTool.name,
    backgroundListSchema.shape,
    (args) => handleBackgroundList(backgroundListSchema.parse(args))
  );

  // 7. design_with_experts
  server.tool(
    designWorkflowTool.name,
    designWorkflowSchema.shape,
    (args) => handleDesignWorkflow(designWorkflowSchema.parse(args))
  );

  // 8. review_code
  server.tool(
    reviewCodeTool.name,
    reviewCodeSchema.shape,
    (args) => handleReviewCode(reviewCodeSchema.parse(args))
  );

  // 9. research_topic
  server.tool(
    researchTopicTool.name,
    researchTopicSchema.shape,
    (args) => handleResearchTopic(researchTopicSchema.parse(args))
  );

  // 10. llm_router_health
  server.tool(
    healthCheckTool.name,
    healthCheckSchema.shape,
    (args) => handleHealthCheck(healthCheckSchema.parse(args))
  );

  // 11. web_search (Exa)
  server.tool(
    webSearchTool.name,
    webSearchSchema.shape,
    (args) => handleWebSearch(webSearchSchema.parse(args))
  );

  // 12. get_library_docs (Context7)
  server.tool(
    libraryDocsTool.name,
    libraryDocsSchema.shape,
    (args) => handleLibraryDocs(libraryDocsSchema.parse(args))
  );

  // 13. search_libraries (Context7)
  server.tool(
    searchLibrariesTool.name,
    searchLibrariesSchema.shape,
    (args) => handleSearchLibraries(searchLibrariesSchema.parse(args))
  );

  // 14. auth_status
  server.tool(
    authStatusTool.name,
    authStatusSchema.shape,
    () => handleAuthStatus()
  );

  // 15. auth_gpt
  server.tool(
    authGptTool.name,
    authProviderSchema.shape,
    () => handleAuthGpt()
  );

  // 16. auth_claude
  server.tool(
    authClaudeTool.name,
    authProviderSchema.shape,
    () => handleAuthClaude()
  );

  // 17. auth_gemini
  server.tool(
    authGeminiTool.name,
    authProviderSchema.shape,
    () => handleAuthGemini()
  );

  // 18. set_expert_model
  server.tool(
    setExpertModelTool.name,
    setExpertModelSchema.shape,
    (args) => handleSetExpertModel(setExpertModelSchema.parse(args))
  );

  // 19. memory_add
  server.tool(
    memoryAddTool.name,
    memoryAddSchema.shape,
    (args) => handleMemoryAdd(memoryAddSchema.parse(args))
  );

  // 20. memory_list
  server.tool(
    memoryListTool.name,
    memoryListSchema.shape,
    (args) => handleMemoryList(memoryListSchema.parse(args))
  );

  // 21. memory_clear
  server.tool(
    memoryClearTool.name,
    memoryClearSchema.shape,
    (args) => handleMemoryClear(memoryClearSchema.parse(args))
  );

  // 22. orchestrate_task
  server.tool(
    orchestrateTaskTool.name,
    orchestrateTaskSchema.shape,
    (args) => handleOrchestrateTask(orchestrateTaskSchema.parse(args))
  );

  // 23. ralph_loop_start
  server.tool(
    ralphLoopStartTool.name,
    ralphLoopStartSchema.shape,
    (args) => handleRalphLoopStart(ralphLoopStartSchema.parse(args))
  );

  // 24. ralph_loop_cancel
  server.tool(
    ralphLoopCancelTool.name,
    ralphLoopCancelSchema.shape,
    () => handleRalphLoopCancel()
  );

  // 25. ralph_loop_status
  server.tool(
    ralphLoopStatusTool.name,
    ralphLoopStatusSchema.shape,
    () => handleRalphLoopStatus()
  );

  // 26. hook_status
  server.tool(
    hookStatusTool.name,
    hookStatusSchema.shape,
    (args) => handleHookStatus(hookStatusSchema.parse(args))
  );

  // 27. hook_toggle
  server.tool(
    hookToggleTool.name,
    hookToggleSchema.shape,
    (args) => handleHookToggle(hookToggleSchema.parse(args))
  );

  // 28. hook_system_toggle
  server.tool(
    hookSystemToggleTool.name,
    hookSystemToggleSchema.shape,
    (args) => handleHookSystemToggle(hookSystemToggleSchema.parse(args))
  );

  // 29. boulder_status
  server.tool(
    boulderStatusTool.name,
    boulderStatusSchema.shape,
    (args) => handleBoulderStatus(boulderStatusSchema.parse(args))
  );

  // 30. boulder_recover
  server.tool(
    boulderRecoverTool.name,
    boulderRecoverSchema.shape,
    (args) => handleBoulderRecover(boulderRecoverSchema.parse(args))
  );

  // 31. boulder_detail
  server.tool(
    boulderDetailTool.name,
    boulderDetailSchema.shape,
    (args) => handleBoulderDetail(boulderDetailSchema.parse(args))
  );

  // 32. external_hook_add
  server.tool(
    externalHookAddTool.name,
    externalHookAddSchema.shape,
    (args) => handleExternalHookAdd(externalHookAddSchema.parse(args))
  );

  // 33. external_hook_remove
  server.tool(
    externalHookRemoveTool.name,
    externalHookRemoveSchema.shape,
    (args) => handleExternalHookRemove(externalHookRemoveSchema.parse(args))
  );

  // 34. external_hook_list
  server.tool(
    externalHookListTool.name,
    externalHookListSchema.shape,
    (args) => handleExternalHookList(externalHookListSchema.parse(args))
  );

  // 35. keyword_add
  server.tool(
    keywordAddTool.name,
    keywordAddSchema.shape,
    (args) => handleKeywordAdd(keywordAddSchema.parse(args))
  );

  // 36. keyword_remove
  server.tool(
    keywordRemoveTool.name,
    keywordRemoveSchema.shape,
    (args) => handleKeywordRemove(keywordRemoveSchema.parse(args))
  );

  // 37. keyword_list
  server.tool(
    keywordListTool.name,
    keywordListSchema.shape,
    (args) => handleKeywordList(keywordListSchema.parse(args))
  );

  // 38. keyword_detect
  server.tool(
    keywordDetectTool.name,
    keywordDetectSchema.shape,
    (args) => handleKeywordDetect(keywordDetectSchema.parse(args))
  );

  // 39. keyword_toggle
  server.tool(
    keywordToggleTool.name,
    keywordToggleSchema.shape,
    (args) => handleKeywordToggle(keywordToggleSchema.parse(args))
  );

  // 40. keyword_system_toggle
  server.tool(
    keywordSystemToggleTool.name,
    keywordSystemToggleSchema.shape,
    (args) => handleKeywordSystemToggle(keywordSystemToggleSchema.parse(args))
  );

  // 41. permission_check
  server.tool(
    permissionCheckTool.name,
    permissionCheckSchema.shape,
    (args) => handlePermissionCheck(permissionCheckSchema.parse(args))
  );

  // 42. permission_grant
  server.tool(
    permissionGrantTool.name,
    permissionGrantSchema.shape,
    (args) => handlePermissionGrant(permissionGrantSchema.parse(args))
  );

  // 43. permission_deny
  server.tool(
    permissionDenyTool.name,
    permissionDenySchema.shape,
    (args) => handlePermissionDeny(permissionDenySchema.parse(args))
  );

  // 44. permission_list
  server.tool(
    permissionListTool.name,
    permissionListSchema.shape,
    (args) => handlePermissionList(permissionListSchema.parse(args))
  );

  // 45. permission_pattern_toggle
  server.tool(
    permissionPatternToggleTool.name,
    permissionPatternToggleSchema.shape,
    (args) => handlePermissionPatternToggle(permissionPatternToggleSchema.parse(args))
  );

  // 46. permission_system_toggle
  server.tool(
    permissionSystemToggleTool.name,
    permissionSystemToggleSchema.shape,
    (args) => handlePermissionSystemToggle(permissionSystemToggleSchema.parse(args))
  );

  // 47. permission_clear_session
  server.tool(
    permissionClearSessionTool.name,
    permissionClearSessionSchema.shape,
    (args) => handlePermissionClearSession(permissionClearSessionSchema.parse(args))
  );

  logger.info('All tools registered (47 tools)');
}

// 메인 함수
async function main() {
  logger.info('Starting LLM Router MCP Server v2.0.0');

  // Hook 시스템 초기화
  setupHookSystem();

  // CLIProxyAPI 자동 시작
  await ensureCliproxyRunning();

  // 도구 등록
  registerTools();

  // stdio 트랜스포트 연결
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected via stdio');
}

// 실행
main().catch((error) => {
  logger.error({ error: error.message }, 'Server failed to start');
  process.exit(1);
});
