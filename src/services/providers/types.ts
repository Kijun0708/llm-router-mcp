// src/services/providers/types.ts

export interface CliCallParams {
  prompt: string;
  systemPrompt?: string;
  model: string;
  timeoutMs: number;
  imagePath?: string;
}

export interface CliCallResult {
  content: string;
  rawOutput: string;
}

export interface CliProvider {
  call(params: CliCallParams): Promise<CliCallResult>;
  name: string;
}
