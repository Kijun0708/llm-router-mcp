// src/services/providers/agy-parse.test.ts
//
// 픽스처는 전부 2026-08-07 agy 1.1.11 실측 출력 그대로다. 손으로 만들지 말 것.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgyStdout, classifyAgy } from './agy-parse.js';

// ── 실측 픽스처 ────────────────────────────────────────────────────────────

/** agy -p "Reply with exactly ...: PROBE_OK" --model gemini-3.1-pro-high --output-format json */
const SUCCESS = `{"conversation_id":"a7a7e2be-4168-4f5c-9c77-8fe2decb4232","status":"SUCCESS","response":"PROBE_OK\\n","duration_seconds":5.6838718,"num_turns":1,"usage":{"input_tokens":16530,"output_tokens":308,"thinking_tokens":300,"cache_read_tokens":0,"total_tokens":16838}}`;

/** agy --model no-such-model-xyz → exit 1 */
const BAD_MODEL = `{"conversation_id":"","status":"ERROR","response":"","error":"invalid model selection (--model \\"no-such-model-xyz\\" --effort \\"\\"): model no-such-model-xyz is not recognized as a known model or custom model in settings\\nAvailable models:\\n  Gemini 3.6 Flash (High)\\n  Claude Opus 4.6 (Thinking)","duration_seconds":0,"num_turns":0,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0}}`;

/** agy --model claude-opus-4-6-thinking --effort high → exit 1 */
const EFFORT_REJECTED = `{"conversation_id":"","status":"ERROR","response":"","error":"invalid model selection (--model \\"claude-opus-4-6-thinking\\" --effort \\"high\\"): --effort is not supported for model \\"claude-opus-4-6-thinking\\"","duration_seconds":0,"num_turns":0,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0}}`;

/**
 * --dangerously-skip-permissions 없이 파일 읽기를 시켰을 때. **exit 0**이고
 * status는 SUCCESS인데 response가 비어 있다. JSON 앞에 평문 경고가 먼저 나온다.
 */
const AUTO_DENIED =
  `jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. command(<target>)). Alternatively, re-run with --dangerously-skip-permissions to auto-approve all tools.\n` +
  `{"conversation_id":"7f244f16-7777-4564-ac34-0f60a8209b90","status":"SUCCESS","response":"","duration_seconds":24.376071,"num_turns":1,"usage":{"input_tokens":13825,"output_tokens":2306,"thinking_tokens":2142,"cache_read_tokens":20270,"total_tokens":16131}}`;

// ── parseAgyStdout ─────────────────────────────────────────────────────────

describe('parseAgyStdout', () => {
  test('단일 JSON 라인을 봉투로 인식한다', () => {
    const { envelope, preamble } = parseAgyStdout(SUCCESS);
    assert.ok(envelope);
    assert.equal(envelope.status, 'SUCCESS');
    assert.equal(envelope.response, 'PROBE_OK\n');
    assert.equal(preamble, '');
  });

  test('JSON 앞의 평문 경고를 preamble로 분리한다 (전체 JSON.parse는 실패한다)', () => {
    assert.throws(() => JSON.parse(AUTO_DENIED), 'AUTO_DENIED는 통째로 파싱되면 안 된다');

    const { envelope, preamble } = parseAgyStdout(AUTO_DENIED);
    assert.ok(envelope);
    assert.equal(envelope.status, 'SUCCESS');
    assert.equal(envelope.response, '');
    assert.match(preamble, /jetski: no output produced/);
    assert.doesNotMatch(preamble, /conversation_id/);
  });

  test('JSON이 여러 줄이면 마지막 봉투가 이긴다', () => {
    const first = SUCCESS.replace('PROBE_OK', 'STALE');
    const { envelope } = parseAgyStdout(`${first}\n${SUCCESS}`);
    assert.equal(envelope?.response, 'PROBE_OK\n');
  });

  test('모델이 답변 안에서 JSON을 출력해도 봉투로 오인하지 않는다', () => {
    // status는 있지만 usage가 없는 JSON → 봉투 아님
    const decoy = `{"status":"SUCCESS","response":"내가 만든 가짜"}`;
    const { envelope } = parseAgyStdout(`${decoy}\n${SUCCESS}`);
    assert.equal(envelope?.conversation_id, 'a7a7e2be-4168-4f5c-9c77-8fe2decb4232');
  });

  test('잘린 stdout은 envelope null', () => {
    const truncated = SUCCESS.slice(0, 80);
    const { envelope, preamble } = parseAgyStdout(truncated);
    assert.equal(envelope, null);
    assert.equal(preamble, truncated.trim());
  });

  test('빈 입력도 안전하다', () => {
    assert.deepEqual(parseAgyStdout(''), { envelope: null, preamble: '' });
  });
});

// ── classifyAgy ────────────────────────────────────────────────────────────

function classify(stdout: string, exitCode = 0, stderr = '') {
  const { envelope, preamble } = parseAgyStdout(stdout);
  return classifyAgy(envelope, preamble, exitCode, stderr);
}

describe('classifyAgy', () => {
  test('정상 응답 — 내용과 토큰 사용량 매핑', () => {
    const out = classify(SUCCESS);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.content, 'PROBE_OK'); // 후행 개행 제거
    assert.deepEqual(out.usage, {
      inputTokens: 16530,
      outputTokens: 308,
      reasoningTokens: 300,
      cachedInputTokens: 0,
      totalTokens: 16838,
    });
  });

  test('알 수 없는 모델 → bad_model (다음 모델로 강등 가능)', () => {
    const out = classify(BAD_MODEL, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'bad_model');
  });

  test('--effort 거부 → bad_model', () => {
    const out = classify(EFFORT_REJECTED, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'bad_model');
  });

  test('권한 자동 거부 트랩 — SUCCESS + 빈 응답을 성공으로 오인하지 않는다', () => {
    const out = classify(AUTO_DENIED, 0);
    assert.equal(out.ok, false, 'exit 0 + status SUCCESS지만 실패로 잡아야 한다');
    if (out.ok) return;
    assert.equal(out.kind, 'permission_denied');
    assert.match(out.message, /--dangerously-skip-permissions/);
  });

  test('exit code는 1차 신호가 아니다 — exit 1 + 정상 봉투는 봉투를 따른다', () => {
    // 실측상 에러 케이스는 exit 1이면서 유효한 ERROR 봉투를 낸다.
    // 반대로 정상 봉투가 exit 1과 함께 오더라도 내용이 있으면 성공이다.
    const out = classify(SUCCESS, 1);
    assert.equal(out.ok, true);
  });

  test('quota는 status ERROR보다 먼저 판정된다', () => {
    const quotaErr = BAD_MODEL.replace(
      'invalid model selection',
      'RESOURCE_EXHAUSTED: Individual quota reached'
    );
    const out = classify(quotaErr, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'quota');
  });

  test('quota가 SUCCESS-empty로 위장해도 잡는다', () => {
    const sneaky = `Warning: code 429 RESOURCE_EXHAUSTED\n${AUTO_DENIED.split('\n')[1]}`;
    const out = classify(sneaky, 0);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'quota', 'permission_denied보다 quota가 먼저여야 한다');
  });

  test('로그인 필요 → auth', () => {
    const authErr = BAD_MODEL.replace(
      'invalid model selection (--model \\"no-such-model-xyz\\" --effort \\"\\"): model no-such-model-xyz is not recognized as a known model or custom model in settings',
      'You are not logged in'
    );
    const out = classify(authErr, 1);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'auth');
  });

  test('봉투 없음 → unknown, 진단 출력 포함', () => {
    const out = classify('agy: fatal error, core dumped', 134, 'stack trace here');
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'unknown');
    assert.match(out.message, /core dumped/);
  });

  test('설명 없는 SUCCESS-empty는 permission_denied가 아니라 unknown', () => {
    const emptyNoWarning = AUTO_DENIED.split('\n')[1];
    const out = classify(emptyNoWarning, 0);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.kind, 'unknown');
  });
});
