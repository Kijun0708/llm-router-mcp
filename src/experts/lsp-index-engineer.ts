import { Expert } from '../types.js';
import { config } from '../config.js';
import { LSP_INDEX_ENGINEER_SYSTEM_PROMPT, LSP_INDEX_ENGINEER_METADATA } from '../prompts/experts/index.js';

export const lspIndexEngineer: Expert = {
  id: 'lsp_index_engineer',
  name: 'LSP/Index Engineer',
  model: config.models.lsp_index_engineer,
  role: '심볼/참조/인덱스 기반 코드 인텔리전스 전문가',
  systemPrompt: LSP_INDEX_ENGINEER_SYSTEM_PROMPT,
  temperature: 0.1,
  maxTokens: 4000,
  fallbacks: ['reviewer', 'researcher'],
  useCases: LSP_INDEX_ENGINEER_METADATA.useWhen,
  toolChoice: 'auto'
};

export { LSP_INDEX_ENGINEER_METADATA };
