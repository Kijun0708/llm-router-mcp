import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { REALITY_CHECKER_SYSTEM_PROMPT, REALITY_CHECKER_METADATA } from '../prompts/experts/index.js';

export const realityChecker: Expert = {
  id: 'reality_checker',
  name: 'Reality Checker',
  model: config.models.reality_checker,
  provider: EXPERT_RUNTIME_DEFAULTS.reality_checker.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.reality_checker.sandbox,
  role: '증거 기반 현실 검증 및 refactor 잔재 탐지 전문가',
  systemPrompt: REALITY_CHECKER_SYSTEM_PROMPT,
  temperature: 0.1,
  maxTokens: 4000,
  useCases: REALITY_CHECKER_METADATA.useWhen,
  toolChoice: 'auto'
};

export { REALITY_CHECKER_METADATA };
