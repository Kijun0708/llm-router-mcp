// src/services/providers/gemini-provider.ts

import { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

// Gemini CLI는 시스템 프롬프트를 지원하지 않으므로 프롬프트에 합침
function buildPrompt(params: CliCallParams): string {
  let prompt = '';

  if (params.systemPrompt) {
    prompt += `[System Instructions]\n${params.systemPrompt}\n\n`;
  }

  prompt += params.prompt;

  return prompt;
}

// JSON 응답에서 텍스트 추출
function parseResponse(stdout: string): string {
  // 1차: JSON 파싱 시도
  try {
    const parsed = JSON.parse(stdout);
    // gemini CLI JSON 출력: { response: "..." }
    if (parsed.response) return parsed.response;
    if (parsed.result) return parsed.result;
    if (typeof parsed === 'string') return parsed;
  } catch {
    // JSON이 아닌 경우 raw text로 처리
  }

  // 2차: JSON 블록 추출 시도 (앞뒤에 비-JSON 텍스트가 있을 수 있음)
  const jsonMatch = stdout.match(/\{[\s\S]*"response"\s*:\s*"[\s\S]*"\s*[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.response) return parsed.response;
    } catch { /* ignore */ }
  }

  // 3차: 그냥 stdout 전체를 응답으로 사용
  return stdout.trim();
}

export class GeminiCliProvider implements CliProvider {
  name = 'gemini';

  async call(params: CliCallParams): Promise<CliCallResult> {
    const cliPath = config.cli.geminiPath;
    const prompt = buildPrompt(params);

    const args: string[] = ['--output-format', 'json'];

    // 모델 지정
    if (params.model) {
      args.push('--model', params.model);
    }

    logger.debug({
      provider: 'gemini',
      model: params.model,
      promptLength: prompt.length,
    }, 'Calling Gemini CLI');

    const result = await spawnCli(cliPath, args, {
      timeoutMs: params.timeoutMs,
      stdin: prompt,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Gemini CLI error (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
    }

    const content = parseResponse(result.stdout);

    return {
      content,
      rawOutput: result.stdout,
    };
  }
}
