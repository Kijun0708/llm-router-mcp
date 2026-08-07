// src/services/providers/model-chain.test.ts

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { runModelChain, composeChain, type ChainStep } from './model-chain.js';
import { CliProviderError, type CliProvider, type CliCallParams, type CliCallResult } from './types.js';
import { resetAll as resetQuota, isBlocked, block } from './quota-registry.js';
import { resetSemaphores } from './concurrency.js';
import type { ErrorKind } from '../../utils/errors.js';

// ── 테스트 더블 ────────────────────────────────────────────────────────────

interface Recorded { provider: string; model: string }

/** 각 모델별 동작을 지정하는 가짜 프로바이더 집합. */
function fakeProviders(behavior: Record<string, 'ok' | ErrorKind>) {
  const calls: Recorded[] = [];

  const make = (id: 'codex' | 'agy' | 'claude'): CliProvider => ({
    id,
    async call(params: CliCallParams): Promise<CliCallResult> {
      calls.push({ provider: id, model: params.model });
      const action = behavior[params.model] ?? 'ok';
      if (action !== 'ok') {
        throw new CliProviderError(action, id, params.model, `가짜 ${action} 실패`);
      }
      return {
        content: `${params.model} 응답`,
        rawOutput: '',
        provider: id,
        model: params.model,
        durationMs: 1,
      };
    },
  });

  const registry = { codex: make('codex'), agy: make('agy'), claude: make('claude') };
  return { calls, resolveProvider: (id: 'codex' | 'agy' | 'claude') => registry[id] };
}

const params = (step: ChainStep): CliCallParams => ({
  prompt: 'q',
  model: step.model,
  timeoutMs: 1000,
  sandbox: 'read-only',
});

beforeEach(() => {
  resetQuota();
  resetSemaphores();
});

// ── scarce 가드 ────────────────────────────────────────────────────────────

describe('scarce 가드 — Claude opt-in의 유일한 방어선', () => {
  test('scarce 모델이 0번 스텝이면 사용된다 (명시 요청)', async () => {
    const f = fakeProviders({});
    const chain: ChainStep[] = [
      { provider: 'claude', model: 'opus' },
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'momus', ...f });
    assert.equal(r.model, 'opus');
    assert.deepEqual(f.calls, [{ provider: 'claude', model: 'opus' }]);
  });

  test('scarce 모델이 폴백 꼬리에 있으면 절대 호출되지 않는다', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'quota' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'claude', model: 'opus' },        // scarce — 건너뛰어야 함
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'momus', ...f });

    assert.equal(r.model, 'gemini-3.6-flash-high');
    assert.equal(
      f.calls.some(c => c.model === 'opus'),
      false,
      'scarce 모델이 폴백으로 호출됐다 — 사용자 한도가 샌다'
    );
  });

  test('agy의 Claude도 폴백 꼬리에서 차단된다', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'quota' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'claude-opus-4-6-thinking' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    await runModelChain(chain, params, { expertId: 'x', ...f });
    assert.equal(f.calls.some(c => c.model === 'claude-opus-4-6-thinking'), false);
  });
});

// ── quota 강등 ─────────────────────────────────────────────────────────────

describe('quota → 차단 후 다음 모델', () => {
  test('한도 소진 시 모델을 차단하고 다음으로 넘어간다', async () => {
    const f = fakeProviders({ opus: 'quota' });
    const chain: ChainStep[] = [
      { provider: 'claude', model: 'opus' },
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'momus', ...f });

    assert.equal(r.model, 'gemini-3.1-pro-high', '사용자가 요구한 "한도 떨어지면 gemini로"');
    assert.equal(isBlocked('claude', 'opus'), true, '소진된 모델이 차단되지 않았다');
  });

  test('이미 차단된 모델은 호출조차 하지 않는다', async () => {
    block('claude', 'opus');
    const f = fakeProviders({});
    const chain: ChainStep[] = [
      { provider: 'claude', model: 'opus' },
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'momus', ...f });

    assert.equal(r.model, 'gemini-3.1-pro-high');
    assert.deepEqual(f.calls, [{ provider: 'agy', model: 'gemini-3.1-pro-high' }]);
  });

  test('전부 차단이면 quota 에러 + 해제 시각 안내', async () => {
    block('claude', 'opus');
    block('agy', 'gemini-3.1-pro-high');
    const f = fakeProviders({});
    const chain: ChainStep[] = [
      { provider: 'claude', model: 'opus' },
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
    ];

    await assert.rejects(
      () => runModelChain(chain, params, { expertId: 'momus', ...f }),
      (err: unknown) => {
        assert.ok(err instanceof CliProviderError);
        assert.equal(err.kind, 'quota');
        assert.match(err.message, /가장 이른 해제/);
        return true;
      }
    );
    assert.equal(f.calls.length, 0);
  });
});

// ── 에러 정책 라우팅 ───────────────────────────────────────────────────────

describe('ERROR_POLICY에 따른 체인 진행', () => {
  test('bad_model은 다음 모델로 강등된다 (슬러그 오타가 요청을 죽이면 안 된다)', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'bad_model' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'x', ...f });
    assert.equal(r.model, 'gemini-3.6-flash-high');
  });

  test('auth는 즉시 전파된다 (다음 모델도 같은 인증을 쓴다)', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'auth' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    await assert.rejects(() => runModelChain(chain, params, { expertId: 'x', ...f }), /가짜 auth/);
    assert.equal(f.calls.length, 1, 'auth인데 다음 모델을 시도했다');
  });

  test('timeout은 즉시 전파된다 (재시도하면 시간이 배가 된다)', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'timeout' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    await assert.rejects(() => runModelChain(chain, params, { expertId: 'x', ...f }));
    assert.equal(f.calls.length, 1);
  });

  test('permission_denied는 조용히 폴백하지 않는다 (우리 argv 버그이므로)', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'permission_denied' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    await assert.rejects(() => runModelChain(chain, params, { expertId: 'x', ...f }));
    assert.equal(f.calls.length, 1);
  });

  test('server 오류는 다음 모델로 넘어간다', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'server' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    const r = await runModelChain(chain, params, { expertId: 'x', ...f });
    assert.equal(r.model, 'gemini-3.6-flash-high');
  });

  test('체인 소진 시 모든 시도를 요약한 에러', async () => {
    const f = fakeProviders({ 'gemini-3.1-pro-high': 'quota', 'gemini-3.6-flash-high': 'quota' });
    const chain: ChainStep[] = [
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
      { provider: 'agy', model: 'gemini-3.6-flash-high' },
    ];
    await assert.rejects(
      () => runModelChain(chain, params, { expertId: 'momus', ...f }),
      (err: unknown) => {
        const m = (err as Error).message;
        assert.match(m, /gemini-3\.1-pro-high/);
        assert.match(m, /gemini-3\.6-flash-high/);
        assert.match(m, /momus/);
        return true;
      }
    );
  });

  test('빈 체인은 즉시 에러', async () => {
    const f = fakeProviders({});
    await assert.rejects(() => runModelChain([], params, { expertId: 'x', ...f }), /empty chain/);
  });
});

// ── composeChain ───────────────────────────────────────────────────────────

describe('composeChain', () => {
  const base: ChainStep[] = [{ provider: 'agy', model: 'gemini-3.1-pro-high' }];

  test('요청 모델이 없으면 기본 체인 그대로', () => {
    assert.deepEqual(composeChain(base), base);
  });

  test('요청 모델이 0번, 기본이 뒤에 붙는다', () => {
    const out = composeChain(base, { provider: 'claude', model: 'opus' });
    assert.deepEqual(out, [
      { provider: 'claude', model: 'opus' },
      { provider: 'agy', model: 'gemini-3.1-pro-high' },
    ]);
  });

  test('요청 모델이 기본과 같으면 중복되지 않는다', () => {
    const out = composeChain(base, { provider: 'agy', model: 'gemini-3.1-pro-high' });
    assert.equal(out.length, 1);
  });
});
