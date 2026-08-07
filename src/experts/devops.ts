// src/experts/devops.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPERT_RUNTIME_DEFAULTS } from '../model-defaults.js';
import { DEVOPS_SYSTEM_PROMPT, DEVOPS_METADATA } from '../prompts/experts/index.js';

export const devops: Expert = {
  id: "devops",
  name: "GPT DevOps Engineer",
  model: config.models.devops,

  provider: EXPERT_RUNTIME_DEFAULTS.devops.provider,
  sandbox: EXPERT_RUNTIME_DEFAULTS.devops.sandbox,
  role: "CI/CD, Docker, Kubernetes, 인프라 자동화 전문가 (READ-ONLY)",

  systemPrompt: DEVOPS_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 4000,  useCases: DEVOPS_METADATA.useWhen,

  toolChoice: "auto"
};

export { DEVOPS_METADATA };
