export const DEFAULT_MODEL_IDS = {
  strategist: 'gpt-5.4',
  codereview: 'gemini-3.1-pro-preview',
  frontend: 'gemini-3.1-pro-preview',
  metis: 'gpt-5.4',
  momus: 'gemini-3.1-pro-preview',
  security: 'gpt-5.4',
  tester: 'gpt-5.4',
  data: 'gpt-5.4',
  devops: 'gpt-5.4',
  reality_checker: 'gemini-3.1-pro-preview',
  lsp_index_engineer: 'gpt-5.4',
  gpt_blank_1: 'gpt-5.4',
  gpt_blank_2: 'gpt-5.4',
  gemini_blank_1: 'gemini-3.1-pro-preview',
  gemini_blank_2: 'gemini-3-flash-preview',
  debate_moderator: 'gemini-3.1-pro-preview'
} as const;

export const DEFAULT_MODEL_FAMILIES = {
  strategist: 'GPT',
  codereview: 'Gemini Pro',
  frontend: 'Gemini Pro',
  metis: 'GPT',
  momus: 'Gemini Pro',
  security: 'GPT',
  tester: 'GPT',
  data: 'GPT',
  devops: 'GPT',
  reality_checker: 'Gemini Pro',
  lsp_index_engineer: 'GPT',
  gpt_blank_1: 'GPT',
  gpt_blank_2: 'GPT',
  gemini_blank_1: 'Gemini Pro',
  gemini_blank_2: 'Gemini Flash',
  debate_moderator: 'Gemini Pro'
} as const;

export const DEFAULT_MODEL_CONCURRENCY = {
  [DEFAULT_MODEL_IDS.strategist]: 3,
  [DEFAULT_MODEL_IDS.codereview]: 10
} as const;
