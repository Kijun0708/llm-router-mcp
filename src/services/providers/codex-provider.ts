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

// JSON Lines 응답에서 agent_message 텍스트만 추출
function parseResponse(stdout: string): string {
  const lines = stdout.trim().split('\n');
  const agentMessages: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);

      // Primary: Codex exec --json NDJSON 형식
      // item.completed 이벤트 중 agent_message만 추출 (command_execution 무시)
      if (
        event.type === 'item.completed' &&
        event.item?.type === 'agent_message' &&
        typeof event.item.text === 'string' &&
        event.item.text.trim()
      ) {
        agentMessages.push(event.item.text);
        continue;
      }

      // Legacy fallback: 이전 Codex 버전 호환
      if (event.type === 'message' && event.content) {
        agentMessages.push(event.content);
        continue;
      }
      if (event.message && typeof event.message === 'string') {
        agentMessages.push(event.message);
        continue;
      }
      if (event.response && typeof event.response === 'string') {
        agentMessages.push(event.response);
        continue;
      }
      if (event.result && typeof event.result === 'string') {
        agentMessages.push(event.result);
        continue;
      }
    } catch {
      // JSON이 아닌 줄은 스킵
    }
  }

  // agent message를 찾았으면 모두 연결하여 반환
  if (agentMessages.length > 0) {
    return agentMessages.join('\n\n');
  }

  // 단일 JSON 객체 시도
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.response) return parsed.response;
    if (parsed.result) return parsed.result;
    if (parsed.content) return parsed.content;
  } catch { /* ignore */ }

  // 최종 폴백: raw stdout (경고 로그)
  logger.warn(
    { stdoutLength: stdout.length, lineCount: lines.length },
    'Codex parseResponse: no structured content found, falling back to raw stdout'
  );
  return stdout.trim();
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
