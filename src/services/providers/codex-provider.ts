// src/services/providers/codex-provider.ts

import { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { spawnCli } from './cli-spawner.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

// Codex CLI는 시스템 프롬프트를 지원하지 않으므로 프롬프트에 합침
function buildPrompt(params: CliCallParams): string {
  let prompt = '';

  if (params.systemPrompt) {
    prompt += `[System Instructions]\n${params.systemPrompt}\n\n[Task]\n`;
  }

  prompt += params.prompt;

  return prompt;
}

// JSON Lines 응답에서 최종 텍스트 추출
function parseResponse(stdout: string): string {
  const lines = stdout.trim().split('\n');

  // JSON Lines 형식: 각 줄이 개별 JSON 이벤트
  let lastContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);

      // Codex exec --json 출력에서 message 타입의 content 추출
      if (event.type === 'message' && event.content) {
        lastContent = event.content;
      }
      // 일부 버전에서는 다른 형태
      if (event.message && typeof event.message === 'string') {
        lastContent = event.message;
      }
      if (event.response && typeof event.response === 'string') {
        lastContent = event.response;
      }
      if (event.result && typeof event.result === 'string') {
        lastContent = event.result;
      }
    } catch {
      // JSON이 아닌 줄은 스킵
    }
  }

  // JSON Lines 파싱 실패 시 전체 stdout을 응답으로 사용
  if (!lastContent) {
    // 단일 JSON 객체 시도
    try {
      const parsed = JSON.parse(stdout);
      if (parsed.response) return parsed.response;
      if (parsed.result) return parsed.result;
      if (parsed.content) return parsed.content;
    } catch { /* ignore */ }

    return stdout.trim();
  }

  return lastContent;
}

export class CodexCliProvider implements CliProvider {
  name = 'codex';

  async call(params: CliCallParams): Promise<CliCallResult> {
    const cliPath = config.cli.codexPath;
    const prompt = buildPrompt(params);

    // stdin으로 프롬프트 전달 (특수문자/긴 프롬프트 안전 처리)
    const args: string[] = ['exec', '-', '--json', '--full-auto'];

    logger.debug({
      provider: 'codex',
      model: params.model,
      promptLength: prompt.length,
    }, 'Calling Codex CLI');

    const result = await spawnCli(cliPath, args, {
      timeoutMs: params.timeoutMs,
      stdin: prompt,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Codex CLI error (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
    }

    const content = parseResponse(result.stdout);

    return {
      content,
      rawOutput: result.stdout,
    };
  }
}
