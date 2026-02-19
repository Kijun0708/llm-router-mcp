// src/services/providers/claude-provider.ts

import { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

// 전체 모델명을 Claude CLI 모델 플래그로 매핑
function mapModelFlag(model: string): string {
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  // sonnet이 기본
  return 'sonnet';
}

// JSON 응답에서 텍스트 추출
function parseResponse(stdout: string): string {
  // 1차: JSON 파싱 시도
  try {
    const parsed = JSON.parse(stdout);
    // claude -p --output-format json 출력: { result: "..." }
    if (parsed.result) return parsed.result;
    if (parsed.response) return parsed.response;
    if (typeof parsed === 'string') return parsed;
  } catch {
    // JSON이 아닌 경우
  }

  // 2차: JSON 블록 추출 시도
  const jsonMatch = stdout.match(/\{[\s\S]*"result"\s*:\s*"[\s\S]*"\s*[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.result) return parsed.result;
    } catch { /* ignore */ }
  }

  // 3차: raw text
  return stdout.trim();
}

export class ClaudeCliProvider implements CliProvider {
  name = 'claude';

  async call(params: CliCallParams): Promise<CliCallResult> {
    const cliPath = config.cli.claudePath;

    // 긴 프롬프트는 stdin으로 전달
    const useStdin = params.prompt.length > 8000;

    const args: string[] = [];

    if (useStdin) {
      args.push('-p', 'Process the input provided via stdin.');
    } else {
      args.push('-p', params.prompt);
    }

    args.push('--output-format', 'json');

    // 모델 지정
    const modelFlag = mapModelFlag(params.model);
    args.push('--model', modelFlag);

    // 시스템 프롬프트 (Claude CLI 네이티브 지원)
    if (params.systemPrompt) {
      args.push('--system-prompt', params.systemPrompt);
    }

    // 단일 응답만 (Tool Loop 방지)
    args.push('--max-turns', '1');

    logger.debug({
      provider: 'claude',
      model: params.model,
      modelFlag,
      promptLength: params.prompt.length,
      useStdin,
    }, 'Calling Claude CLI');

    const result = await spawnCli(cliPath, args, {
      timeoutMs: params.timeoutMs,
      stdin: useStdin ? params.prompt : undefined,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Claude CLI error (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
    }

    const content = parseResponse(result.stdout);

    return {
      content,
      rawOutput: result.stdout,
    };
  }
}
