// src/tools/index.ts

export { consultExpertTool, consultExpertSchema, handleConsultExpert } from './consult-expert.js';
export { consultExpertsParallelTool, consultExpertsParallelSchema, handleConsultExpertsParallel } from './consult-experts-parallel.js';
export { categoryTaskTool, categoryTaskSchema, handleCategoryTask } from './category-task.js';
export {
  backgroundStartTool, backgroundStartSchema, handleBackgroundStart,
  backgroundResultTool, backgroundResultSchema, handleBackgroundResult,
  backgroundCancelTool, backgroundCancelSchema, handleBackgroundCancel,
  backgroundListTool, backgroundListSchema, handleBackgroundList
} from './background-task.js';
export { designWorkflowTool, designWorkflowSchema, handleDesignWorkflow } from './design-workflow.js';
export { reviewCodeTool, reviewCodeSchema, handleReviewCode } from './review-workflow.js';
export { researchTopicTool, researchTopicSchema, handleResearchTopic } from './research-workflow.js';
export { healthCheckTool, healthCheckSchema, handleHealthCheck } from './health-check.js';
export { webSearchTool, webSearchSchema, handleWebSearch } from './web-search.js';
export {
  libraryDocsTool, libraryDocsSchema, handleLibraryDocs,
  searchLibrariesTool, searchLibrariesSchema, handleSearchLibraries
} from './library-docs.js';
export { setExpertModelTool, setExpertModelSchema, handleSetExpertModel } from './set-expert-model.js';
export {
  memoryAddTool, memoryAddSchema, handleMemoryAdd,
  memoryListTool, memoryListSchema, handleMemoryList,
  memoryClearTool, memoryClearSchema, handleMemoryClear
} from './session-memory.js';
export { orchestrateTaskTool, orchestrateTaskSchema, handleOrchestrateTask } from './orchestrate-task.js';
export {
  ralphLoopStartTool, ralphLoopStartSchema, handleRalphLoopStart,
  ralphLoopCancelTool, ralphLoopCancelSchema, handleRalphLoopCancel,
  ralphLoopStatusTool, ralphLoopStatusSchema, handleRalphLoopStatus
} from './ralph-loop.js';
export {
  ensembleQueryTool, ensembleQuerySchema, handleEnsembleQuery,
  ensemblePresetTool, ensemblePresetSchema, handleEnsemblePreset,
  ensemblePresetsListTool, ensemblePresetsListSchema, handleEnsemblePresetsList
} from './ensemble.js';
export {
  astGrepSearchTool, astGrepSearchSchema, handleAstGrepSearch,
  astGrepReplaceTool, astGrepReplaceSchema, handleAstGrepReplace,
  astGrepLanguagesTool, astGrepLanguagesSchema, handleAstGrepLanguages
} from './ast-grep.js';
export {
  lspGetDefinitionTool, lspGetDefinitionSchema, handleLspGetDefinition,
  lspGetReferencesTool, lspGetReferencesSchema, handleLspGetReferences,
  lspGetHoverTool, lspGetHoverSchema, handleLspGetHover,
  lspWorkspaceSymbolsTool, lspWorkspaceSymbolsSchema, handleLspWorkspaceSymbols,
  lspCheckServerTool, lspCheckServerSchema, handleLspCheckServer,
  lspPrepareRenameTool, lspPrepareRenameSchema, handleLspPrepareRename,
  lspRenameTool, lspRenameSchema, handleLspRename
} from './lsp.js';
export {
  contextStatusTool, contextStatusSchema, handleContextStatus,
  contextConfigTool, contextConfigSchema, handleContextConfig,
  truncatorConfigTool, truncatorConfigSchema, handleTruncatorConfig,
  enforcerActionTool, enforcerActionSchema, handleEnforcerAction
} from './context-management.js';
export {
  sessionRecoveryTool, sessionRecoverySchema, handleSessionRecovery,
  editRecoveryTool, editRecoverySchema, handleEditRecovery,
  commentCheckerTool, commentCheckerSchema, handleCommentChecker
} from './stability-management.js';
export {
  directoryInjectorTool, directoryInjectorSchema, handleDirectoryInjector
} from './directory-injector.js';
export {
  magicKeywordsTool, magicKeywordsSchema, handleMagicKeywords
} from './magic-keywords.js';
export {
  grepAppSearchTool, grepAppSearchSchema, handleGrepAppSearch,
  grepAppLanguagesTool, grepAppLanguagesSchema, handleGrepAppLanguages
} from './grep-app.js';
export {
  gitAtomicCommitTool, gitAtomicCommitSchema, handleGitAtomicCommit,
  gitHistorySearchTool, gitHistorySearchSchema, handleGitHistorySearch,
  gitRebasePlannerTool, gitRebasePlannerSchema, handleGitRebasePlanner,
  gitSquashHelperTool, gitSquashHelperSchema, handleGitSquashHelper,
  gitBranchAnalysisTool, gitBranchAnalysisSchema, handleGitBranchAnalysis
} from './git-master.js';
export {
  commandListTool, commandListSchema, handleCommandList,
  commandGetTool, commandGetSchema, handleCommandGet,
  commandExecuteTool, commandExecuteSchema, handleCommandExecute,
  commandRescanTool, commandRescanSchema, handleCommandRescan,
  commandConfigTool, commandConfigSchema, handleCommandConfig
} from './command-discovery.js';
// Agent & Command Tools
export {
  listAgentsTool, listAgentsSchema, handleListAgents,
  runAgentTool, runAgentSchema, handleRunAgent,
  listCommandsTool, listCommandsSchema, handleListCommands,
  runCommandTool, runCommandSchema, handleRunCommand,
  searchCommandsTool, searchCommandsSchema, handleSearchCommands
} from './agent-command.js';
export {
  moderatedDebateTool, moderatedDebateSchema, handleModeratedDebate
} from './moderated-debate.js';

export {
  delegateTaskTool, delegateTaskSchema, handleDelegateTask
} from './delegate-task.js';
