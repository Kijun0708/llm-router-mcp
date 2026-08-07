// src/services/providers/codex-parse.test.ts
//
// 픽스처는 2026-08-07 codex 0.146.1 실측 NDJSON 그대로다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scanCodexNdjson } from './codex-parse.js';

/**
 * 실측: codex exec - --json --sandbox read-only --skip-git-repo-check --ephemeral -o file
 *
 * 주목: item_0는 사용자 ~/.codex/config.toml의 deprecated features.codex_hooks 때문에
 * **매 실행마다** 나오는 error item이다. 이걸 실패 신호로 쓰면 모든 호출이 실패한다.
 */
const REAL_RUN = [
  `{"type":"thread.started","thread_id":"019fda76-51e7-7b80-9b01-ce202462ae14"}`,
  `{"type":"item.completed","item":{"id":"item_0","type":"error","message":"\`[features].codex_hooks\` is deprecated. Use \`[features].hooks\` instead."}}`,
  `{"type":"turn.started"}`,
  `{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"PROBE_OK"}}`,
  `{"type":"turn.completed","usage":{"input_tokens":21255,"cached_input_tokens":1408,"cache_write_input_tokens":0,"output_tokens":18,"reasoning_output_tokens":9}}`,
].join('\n');

describe('scanCodexNdjson', () => {
  test('agent_message를 추출한다', () => {
    const scan = scanCodexNdjson(REAL_RUN);
    assert.equal(scan.lastAgentMessage, 'PROBE_OK');
  });

  test('turn.completed의 토큰 사용량을 매핑한다', () => {
    const scan = scanCodexNdjson(REAL_RUN);
    assert.deepEqual(scan.usage, {
      inputTokens: 21255,
      outputTokens: 18,
      reasoningTokens: 9,
      cachedInputTokens: 1408,
      totalTokens: 21273,
    });
  });

  test('error item을 수집하되 agent_message는 그대로 살아 있다', () => {
    // 이 조합(deprecation error + 정상 응답)이 이 사용자의 매 실행 실제 모습이다.
    const scan = scanCodexNdjson(REAL_RUN);
    assert.equal(scan.errors.length, 1);
    assert.match(scan.errors[0], /codex_hooks.*deprecated/);
    assert.equal(scan.lastAgentMessage, 'PROBE_OK', 'error item이 응답을 죽이면 안 된다');
  });

  test('command_execution 등 다른 item 타입은 답변으로 오염되지 않는다', () => {
    const withExec = [
      `{"type":"item.completed","item":{"id":"i0","type":"command_execution","command":"ls -la","output":"file1\\nfile2"}}`,
      `{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"진짜 답변"}}`,
    ].join('\n');
    const scan = scanCodexNdjson(withExec);
    assert.equal(scan.lastAgentMessage, '진짜 답변');
  });

  test('agent_message가 여러 개면 마지막이 이긴다', () => {
    const multi = [
      `{"type":"item.completed","item":{"type":"agent_message","text":"중간 생각"}}`,
      `{"type":"item.completed","item":{"type":"agent_message","text":"최종 답변"}}`,
    ].join('\n');
    assert.equal(scanCodexNdjson(multi).lastAgentMessage, '최종 답변');
  });

  test('빈 텍스트 agent_message는 무시한다', () => {
    const withEmpty = [
      `{"type":"item.completed","item":{"type":"agent_message","text":"실제 답변"}}`,
      `{"type":"item.completed","item":{"type":"agent_message","text":"   "}}`,
    ].join('\n');
    assert.equal(scanCodexNdjson(withEmpty).lastAgentMessage, '실제 답변');
  });

  test('비 JSON 줄은 조용히 건너뛴다 (codex는 상태 줄을 섞어 낸다)', () => {
    const mixed = `Reading prompt from stdin...\n${REAL_RUN}\nDone.`;
    const scan = scanCodexNdjson(mixed);
    assert.equal(scan.lastAgentMessage, 'PROBE_OK');
    assert.equal(scan.errors.length, 1);
  });

  test('빈 입력도 안전하다', () => {
    const scan = scanCodexNdjson('');
    assert.equal(scan.lastAgentMessage, undefined);
    assert.deepEqual(scan.errors, []);
    assert.equal(scan.usage, undefined);
  });

  test('예전 5단 폴백처럼 raw stdout을 답변으로 뱉지 않는다', () => {
    // 구조를 못 알아보면 lastAgentMessage는 undefined여야 한다.
    // 이전 parseResponse는 여기서 NDJSON 원문을 "답변"으로 반환했다.
    const unrecognized = `{"type":"some.new.event","payload":{"text":"이건 답변이 아니다"}}`;
    const scan = scanCodexNdjson(unrecognized);
    assert.equal(scan.lastAgentMessage, undefined);
  });
});
