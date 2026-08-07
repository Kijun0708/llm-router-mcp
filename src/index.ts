// src/index.ts

import 'dotenv/config';  // 환경변수 로드 (fallback, config.ts에서 이미 절대경로로 로드됨)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { logger } from "./utils/logger.js";
import { validateExpertRegistry } from "./experts/index.js";

import { setupHookSystem } from "./hooks/index.js";
import { initializeHud, shutdownHud } from "./hud/index.js";
import { shutdownPersistence } from "./services/background-manager.js";
import { startDashboardServer, shutdownDashboardServer } from "./dashboard-server/index.js";

// New tool registrations
import { registerInteractiveBashTools } from "./tools/interactive-bash.js";
import { registerSkillTools } from "./tools/skill.js";
import { registerMcpManagerTools } from "./tools/mcp-manager.js";

// 도구 임포트
import {
  consultExpertTool, consultExpertSchema, handleConsultExpert,
  consultExpertsParallelTool, consultExpertsParallelSchema, handleConsultExpertsParallel,
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
  setExpertModelTool, setExpertModelSchema, handleSetExpertModel,
  memoryAddTool, memoryAddSchema, handleMemoryAdd,
  memoryListTool, memoryListSchema, handleMemoryList,
  memoryClearTool, memoryClearSchema, handleMemoryClear,
  orchestrateTaskTool, orchestrateTaskSchema, handleOrchestrateTask,
  ralphLoopStartTool, ralphLoopStartSchema, handleRalphLoopStart,
  ralphLoopCancelTool, ralphLoopCancelSchema, handleRalphLoopCancel,
  ralphLoopStatusTool, ralphLoopStatusSchema, handleRalphLoopStatus,
  ensembleQueryTool, ensembleQuerySchema, handleEnsembleQuery,
  ensemblePresetTool, ensemblePresetSchema, handleEnsemblePreset,
  ensemblePresetsListTool, ensemblePresetsListSchema, handleEnsemblePresetsList,
  contextStatusTool, contextStatusSchema, handleContextStatus,
  contextConfigTool, contextConfigSchema, handleContextConfig,
  truncatorConfigTool, truncatorConfigSchema, handleTruncatorConfig,
  enforcerActionTool, enforcerActionSchema, handleEnforcerAction,
  sessionRecoveryTool, sessionRecoverySchema, handleSessionRecovery,
  editRecoveryTool, editRecoverySchema, handleEditRecovery,
  commentCheckerTool, commentCheckerSchema, handleCommentChecker,
  directoryInjectorTool, directoryInjectorSchema, handleDirectoryInjector,
  magicKeywordsTool, magicKeywordsSchema, handleMagicKeywords,
  grepAppSearchTool, grepAppSearchSchema, handleGrepAppSearch,
  grepAppLanguagesTool, grepAppLanguagesSchema, handleGrepAppLanguages,
  gitAtomicCommitTool, gitAtomicCommitSchema, handleGitAtomicCommit,
  gitHistorySearchTool, gitHistorySearchSchema, handleGitHistorySearch,
  gitRebasePlannerTool, gitRebasePlannerSchema, handleGitRebasePlanner,
  gitSquashHelperTool, gitSquashHelperSchema, handleGitSquashHelper,
  gitBranchAnalysisTool, gitBranchAnalysisSchema, handleGitBranchAnalysis,
  commandListTool, commandListSchema, handleCommandList,
  commandGetTool, commandGetSchema, handleCommandGet,
  commandExecuteTool, commandExecuteSchema, handleCommandExecute,
  commandRescanTool, commandRescanSchema, handleCommandRescan,
  commandConfigTool, commandConfigSchema, handleCommandConfig,
  // Agent & Command tools
  listAgentsTool, listAgentsSchema, handleListAgents,
  runAgentTool, runAgentSchema, handleRunAgent,
  listCommandsTool, listCommandsSchema, handleListCommands,
  runCommandTool, runCommandSchema, handleRunCommand,
  searchCommandsTool, searchCommandsSchema, handleSearchCommands,
  moderatedDebateTool, moderatedDebateSchema, handleModeratedDebate,
  delegateTaskTool, delegateTaskSchema, handleDelegateTask
} from "./tools/index.js";

// 버전은 package.json 단일 소스. 이전에는 여기 "2.0.0"이 하드코딩돼 있어
// package.json(2.4.5)과 계속 어긋났다.
const __pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
) as { version: string };
const VERSION: string = __pkg.version;

// 서버 초기화
const server = new McpServer({
  name: "llm-router-mcp",
  version: VERSION
});

// 등록된 도구 수를 직접 센다. 손으로 세던 로그가 실제(76)와 3개 어긋나 있었다.
let registeredToolCount = 0;
const originalTool = server.tool.bind(server);
server.tool = ((...args: Parameters<typeof originalTool>) => {
  registeredToolCount++;
  return originalTool(...args);
}) as typeof server.tool;

// 도구 등록
function registerTools() {
  // 1. consult_expert
  server.tool(
    consultExpertTool.name,
    consultExpertSchema.shape,
    (args) => handleConsultExpert(consultExpertSchema.parse(args))
  );

  // 1.5. consult_experts_parallel
  server.tool(
    consultExpertsParallelTool.name,
    consultExpertsParallelSchema.shape,
    (args) => handleConsultExpertsParallel(consultExpertsParallelSchema.parse(args))
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
    (reviewCodeSchema as any)._def.schema.shape,
    (args: any) => handleReviewCode(reviewCodeSchema.parse(args))
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

  // 14. set_expert_model
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

  // ensemble_query
  server.tool(
    ensembleQueryTool.name,
    ensembleQuerySchema.shape,
    (args) => handleEnsembleQuery(ensembleQuerySchema.parse(args))
  );

  // 55. ensemble_preset
  server.tool(
    ensemblePresetTool.name,
    ensemblePresetSchema.shape,
    (args) => handleEnsemblePreset(ensemblePresetSchema.parse(args))
  );

  // 56. ensemble_presets_list
  server.tool(
    ensemblePresetsListTool.name,
    ensemblePresetsListSchema.shape,
    () => handleEnsemblePresetsList()
  );

  // context_status
  server.tool(
    contextStatusTool.name,
    contextStatusSchema.shape,
    (args) => handleContextStatus(contextStatusSchema.parse(args))
  );

  // 68. context_config
  server.tool(
    contextConfigTool.name,
    contextConfigSchema.shape,
    (args) => handleContextConfig(contextConfigSchema.parse(args))
  );

  // 69. truncator_config
  server.tool(
    truncatorConfigTool.name,
    truncatorConfigSchema.shape,
    (args) => handleTruncatorConfig(truncatorConfigSchema.parse(args))
  );

  // 70. todo_enforcer
  server.tool(
    enforcerActionTool.name,
    enforcerActionSchema.shape,
    (args) => handleEnforcerAction(enforcerActionSchema.parse(args))
  );

  // 71. session_recovery
  server.tool(
    sessionRecoveryTool.name,
    sessionRecoverySchema.shape,
    (args) => handleSessionRecovery(sessionRecoverySchema.parse(args))
  );

  // 72. edit_recovery
  server.tool(
    editRecoveryTool.name,
    editRecoverySchema.shape,
    (args) => handleEditRecovery(editRecoverySchema.parse(args))
  );

  // 73. comment_checker
  server.tool(
    commentCheckerTool.name,
    commentCheckerSchema.shape,
    (args) => handleCommentChecker(commentCheckerSchema.parse(args))
  );

  // 74. directory_injector
  server.tool(
    directoryInjectorTool.name,
    directoryInjectorSchema.shape,
    (args) => handleDirectoryInjector(directoryInjectorSchema.parse(args))
  );

  // 75. magic_keywords
  server.tool(
    magicKeywordsTool.name,
    magicKeywordsSchema.shape,
    (args) => handleMagicKeywords(magicKeywordsSchema.parse(args))
  );

  // 76. grep_app
  server.tool(
    grepAppSearchTool.name,
    grepAppSearchSchema.shape,
    (args) => handleGrepAppSearch(grepAppSearchSchema.parse(args))
  );

  // 77. grep_app_languages
  server.tool(
    grepAppLanguagesTool.name,
    grepAppLanguagesSchema.shape,
    (args) => handleGrepAppLanguages(grepAppLanguagesSchema.parse(args))
  );

  // git_atomic_commit
  server.tool(
    gitAtomicCommitTool.name,
    gitAtomicCommitSchema.shape,
    (args) => handleGitAtomicCommit(gitAtomicCommitSchema.parse(args))
  );

  // 83. git_history_search
  server.tool(
    gitHistorySearchTool.name,
    gitHistorySearchSchema.shape,
    (args) => handleGitHistorySearch(gitHistorySearchSchema.parse(args))
  );

  // 84. git_rebase_planner
  server.tool(
    gitRebasePlannerTool.name,
    gitRebasePlannerSchema.shape,
    (args) => handleGitRebasePlanner(gitRebasePlannerSchema.parse(args))
  );

  // 85. git_squash_helper
  server.tool(
    gitSquashHelperTool.name,
    gitSquashHelperSchema.shape,
    (args) => handleGitSquashHelper(gitSquashHelperSchema.parse(args))
  );

  // 86. git_branch_analysis
  server.tool(
    gitBranchAnalysisTool.name,
    gitBranchAnalysisSchema.shape,
    (args) => handleGitBranchAnalysis(gitBranchAnalysisSchema.parse(args))
  );

  // 87. command_list
  server.tool(
    commandListTool.name,
    commandListSchema.shape,
    (args) => handleCommandList(commandListSchema.parse(args))
  );

  // 88. command_get
  server.tool(
    commandGetTool.name,
    commandGetSchema.shape,
    (args) => handleCommandGet(commandGetSchema.parse(args))
  );

  // 89. command_execute
  server.tool(
    commandExecuteTool.name,
    commandExecuteSchema.shape,
    (args) => handleCommandExecute(commandExecuteSchema.parse(args))
  );

  // 90. command_rescan
  server.tool(
    commandRescanTool.name,
    commandRescanSchema.shape,
    (args) => handleCommandRescan(commandRescanSchema.parse(args))
  );

  // 91. command_config
  server.tool(
    commandConfigTool.name,
    commandConfigSchema.shape,
    (args) => handleCommandConfig(commandConfigSchema.parse(args))
  );

  // list_agents
  server.tool(
    listAgentsTool.name,
    listAgentsSchema.shape,
    (args) => handleListAgents(listAgentsSchema.parse(args))
  );

  // 97. run_agent
  server.tool(
    runAgentTool.name,
    runAgentSchema.shape,
    (args) => handleRunAgent(runAgentSchema.parse(args))
  );

  // 98. list_commands
  server.tool(
    listCommandsTool.name,
    listCommandsSchema.shape,
    (args) => handleListCommands(listCommandsSchema.parse(args))
  );

  // 99. run_command
  server.tool(
    runCommandTool.name,
    runCommandSchema.shape,
    (args) => handleRunCommand(runCommandSchema.parse(args))
  );

  // 100. search_commands
  server.tool(
    searchCommandsTool.name,
    searchCommandsSchema.shape,
    (args) => handleSearchCommands(searchCommandsSchema.parse(args))
  );

  // moderated_debate
  server.tool(
    moderatedDebateTool.name,
    moderatedDebateSchema.shape,
    (args) => handleModeratedDebate(moderatedDebateSchema.parse(args))
  );

  // delegate_task
  server.tool(
    delegateTaskTool.name,
    (delegateTaskSchema as any)._def.schema.shape,
    (args: any) => handleDelegateTask(delegateTaskSchema.parse(args))
  );

  // 109-113. Interactive Bash Tools (5 tools)
  registerInteractiveBashTools(server);

  // 114-122. Skill Tools (9 tools)
  registerSkillTools(server);

  // 123-131. MCP Manager Tools (9 tools)
  registerMcpManagerTools(server);

  logger.info(`All tools registered (${registeredToolCount} tools)`);
}

// 메인 함수
async function main() {
  logger.info(`Starting LLM Router MCP Server v${VERSION}`);

  // 전문가 레지스트리 정합성 검증.
  // 잘못된 모델 슬러그나 프로바이더 불일치는 새벽 3시 CLI 실패가 아니라 여기서 터뜨린다.
  validateExpertRegistry();

  // Hook 시스템 초기화
  setupHookSystem();

  // HUD 상태 표시 시스템 초기화
  initializeHud();

  // 도구 등록
  registerTools();

  // stdio 트랜스포트 연결
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected via stdio');

  // 대시보드 서버 시작 (기본 활성화)
  if (process.env.DASHBOARD_ENABLED !== 'false') {
    try {
      const dashboard = await startDashboardServer();
      logger.info({ url: dashboard.url, port: dashboard.port }, 'Dashboard available');
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Dashboard server failed to start (non-fatal)');
    }
  }

  // 프로세스 종료 시 정리
  const gracefulShutdown = () => {
    shutdownDashboardServer(); // 대시보드 정리
    shutdownPersistence();     // 백그라운드 작업 상태 저장
    shutdownHud();             // HUD 정리
  };
  process.on('exit', gracefulShutdown);
  process.on('SIGINT', () => { gracefulShutdown(); process.exit(0); });
  process.on('SIGTERM', () => { gracefulShutdown(); process.exit(0); });

  // unhandled error 핸들러 — 이전엔 missing이라 우연한 throw가 silent crash로 이어져
  // MCP 서버가 죽고 9100 dashboard도 같이 사라지는 현상이 있었음.
  // 로그만 남기고 프로세스는 계속 살려둬서 dashboard 가용성 유지.
  process.on('uncaughtException', (err, origin) => {
    logger.error({ err: err.message, stack: err.stack, origin }, 'Uncaught exception (process kept alive)');
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error({ reason: msg, stack }, 'Unhandled promise rejection (process kept alive)');
  });
}

// 실행
main().catch((error) => {
  logger.error({ error: error.message }, 'Server failed to start');
  process.exit(1);
});
