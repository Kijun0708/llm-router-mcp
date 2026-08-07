// src/services/providers/claude-parse.test.ts
//
// 픽스처는 2026-08-07 Claude Code 2.1.132 `claude -p --output-format json` 실측 출력.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeStdout, classifyClaude, primaryModelOf } from './claude-parse.js';

const SUCCESS = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  api_error_status: null,
  duration_ms: 4514,
  duration_api_ms: 4525,
  num_turns: 2,
  result: '2.4.5',
  stop_reason: 'end_turn',
  session_id: 'f62a6694-e03c-42c0-8bfe-fb40a856e1a1',
  total_cost_usd: 0.06517925,
  usage: {
    input_tokens: 6,
    cache_creation_input_tokens: 32757,
    cache_read_input_tokens: 1024,
    output_tokens: 14,
  },
  modelUsage: {
    'claude-haiku-4-5-20251001': { outputTokens: 18 },
    'claude-opus-4-7': { outputTokens: 240 },
  },
  permission_denials: [],
});

function classify(stdout: string, exitCode = 0, stderr = '') {
  const { envelope, preamble } = parseClaudeStdout(stdout);
  return classifyClaude(envelope, preamble, exitCode, stderr);
}

describe('parseClaudeStdout', () => {
  test('단일 JSON을 봉투로 인식', () => {
    const { envelope } = parseClaudeStdout(SUCCESS);
    assert.equal(envelope?.type, 'result');
    assert.equal(envelope?.result, '2.4.5');
  });

  test('앞에 붙은 경고 평문을 preamble로 분리', () => {
    const { envelope, preamble } = parseClaudeStdout(`Warning: something\n${SUCCESS}`);
    assert.ok(envelope);
    assert.equal(preamble, 'Warning: something');
  });

  test('봉투가 없으면 null', () => {
    const { envelope } = parseClaudeStdout('command not found: claude');
    assert.equal(envelope, null);
  });
});

describe('classifyClaude', () => {
  test('정상 응답 — 내용/토큰/비용 매핑', () => {
    const out = classify(SUCCESS);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.content, '2.4.5');
    assert.equal(out.usage?.inputTokens, 6);
    assert.equal(out.usage?.outputTokens, 14);
    assert.equal(out.usage?.cachedInputTokens, 1024);
    assert.equal(out.usage?.costUsd, 0.06517925);
  });

  test('is_error → 실패', () => {
    const errored = JSON.stringify({
      type: 'result', subtype: 'error_during_execution', is_error: true,
      result: '', api_error_status: null,
    });
    const out = classify(errored, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'server');
  });

  test('error_max_budget → quota (예산 상한에 걸림)', () => {
    const overBudget = JSON.stringify({
      type: 'result', subtype: 'error_max_budget', is_error: true, result: '',
    });
    const out = classify(overBudget, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'quota');
  });

  test('error_max_turns → bad_request', () => {
    const maxTurns = JSON.stringify({
      type: 'result', subtype: 'error_max_turns', is_error: true, result: '',
    });
    const out = classify(maxTurns, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'bad_request');
  });

  test('api_error_status의 429는 quota로 잡힌다', () => {
    const rateLimited = JSON.stringify({
      type: 'result', subtype: 'error_during_execution', is_error: true,
      api_error_status: 'rate limit exceeded (429)', result: '',
    });
    const out = classify(rateLimited, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'quota');
  });

  test('빈 result + permission_denials → permission_denied', () => {
    const denied = JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: '',
      permission_denials: [{ tool: 'Bash', reason: 'not allowed' }],
    });
    const out = classify(denied, 0);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'permission_denied');
    assert.match(out.message, /--tools/);
  });

  test('빈 result에 거부 기록이 없으면 unknown', () => {
    const empty = JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: '', permission_denials: [],
    });
    const out = classify(empty, 0);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'unknown');
  });

  test('봉투 없음 → unknown', () => {
    const out = classify('claude: command not found', 127);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'unknown');
    assert.match(out.message, /command not found/);
  });
});

describe('primaryModelOf', () => {
  test('비용이 가장 큰 모델을 고른다 (내부 haiku가 아니라 실제 응답 모델)', () => {
    const { envelope } = parseClaudeStdout(SUCCESS);
    assert.equal(primaryModelOf(envelope), 'claude-opus-4-7');
  });

  test('실측: 한 단어 답변에서는 내부 haiku가 output 토큰이 더 많다', () => {
    // 2026-08-07 실측. output 기준으로 고르면 haiku(9)가 sonnet(4)을 이겨 틀린다.
    // 비용 기준이면 sonnet($0.0615) > haiku($0.0004)로 올바르게 갈린다.
    const envelope = {
      type: 'result',
      modelUsage: {
        'claude-haiku-4-5-20251001': { inputTokens: 362, outputTokens: 9, costUSD: 0.000407 },
        'claude-sonnet-4-6': { inputTokens: 3, outputTokens: 4, costUSD: 0.06152025 },
      },
    };
    assert.equal(primaryModelOf(envelope), 'claude-sonnet-4-6');
  });

  test('비용 정보가 없으면 output 토큰으로 갈린다', () => {
    const envelope = {
      type: 'result',
      modelUsage: {
        'claude-haiku-4-5': { outputTokens: 9 },
        'claude-opus-4-7': { outputTokens: 500 },
      },
    };
    assert.equal(primaryModelOf(envelope), 'claude-opus-4-7');
  });

  test('항목이 하나뿐이면 필드명과 무관하게 그것을 쓴다', () => {
    assert.equal(
      primaryModelOf({ type: 'result', modelUsage: { 'claude-opus-4-7': {} } }),
      'claude-opus-4-7'
    );
  });

  test('snake_case 필드명도 인식', () => {
    assert.equal(
      primaryModelOf({
        type: 'result',
        modelUsage: {
          'claude-haiku-4-5': { output_tokens: 10 },
          'claude-opus-4-7': { output_tokens: 500 },
        },
      }),
      'claude-opus-4-7'
    );
  });

  test('modelUsage가 없거나 비면 undefined', () => {
    assert.equal(primaryModelOf({ type: 'result' }), undefined);
    assert.equal(primaryModelOf({ type: 'result', modelUsage: {} }), undefined);
    assert.equal(primaryModelOf(null), undefined);
  });
});
