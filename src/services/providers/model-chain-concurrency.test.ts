// src/services/providers/model-chain-concurrency.test.ts
//
// 세마포어 획득 순서 회귀 테스트.
//
// 이 버그들은 리팩토링된 model-chain.ts를 이 MCP 자신의 codereview 전문가
// (agy / gemini-3.1-pro-high)에게 리뷰시켜 발견했다. 2026-08-24.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { runModelChain, type ChainStep } from './model-chain.js';
import type { CliProvider, CliCallParams, CliCallResult } from './types.js';
import { resetAll as resetQuota } from './quota-registry.js';
import { resetSemaphores, getSemaphore } from './concurrency.js';

const params = (step: ChainStep): CliCallParams => ({
  prompt: 'q',
  model: step.model,
  timeoutMs: 1000,
  sandbox: 'read-only',
});

/** 호출을 수동으로 붙잡아두는 프로바이더. */
function gatedProvider() {
  const inFlight: string[] = [];
  const releases: Array<() => void> = [];

  const make = (id: 'codex' | 'agy' | 'claude'): CliProvider => ({
    id,
    async call(p: CliCallParams): Promise<CliCallResult> {
      inFlight.push(p.model);
      await new Promise<void>((resolve) => releases.push(resolve));
      return {
        content: 'ok', rawOutput: '', provider: id, model: p.model, durationMs: 1,
      };
    },
  });

  const reg = { codex: make('codex'), agy: make('agy'), claude: make('claude') };
  return {
    inFlight,
    releaseAll: () => { releases.splice(0).forEach((r) => r()); },
    resolveProvider: (id: 'codex' | 'agy' | 'claude') => reg[id],
  };
}

const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  resetQuota();
  resetSemaphores();
});

describe('세마포어 획득 순서 — head-of-line blocking 방지', () => {
  test('동시성 1짜리 모델이 대기해도 다른 모델을 굶기지 않는다', async () => {
    const g = gatedProvider();
    const ctx = { expertId: 'x', providerConcurrency: { agy: 2 }, resolveProvider: g.resolveProvider };

    // claude-opus-4-6-thinking 은 모델 동시성 1.
    // 2개를 띄우면 하나는 모델 큐에서 대기한다.
    const opus: ChainStep[] = [{ provider: 'agy', model: 'claude-opus-4-6-thinking' }];
    const p1 = runModelChain(opus, params, ctx);
    const p2 = runModelChain(opus, params, ctx);
    await tick(); await tick();

    // 모델 슬롯이 1이므로 실행 중인 opus 는 1개뿐이어야 한다.
    assert.equal(
      g.inFlight.filter((m) => m === 'claude-opus-4-6-thinking').length, 1,
      'opus 모델 동시성 1이 지켜지지 않았다'
    );

    // 프로바이더 슬롯(2) 중 소비된 것은 1개여야 한다.
    // 예전처럼 provider→model 순으로 잡으면 대기 중인 2번째가 슬롯을 붙들어
    // 여기서 2가 되고, 아래 gemini 호출이 굶는다.
    assert.equal(getSemaphore('agy').inFlight, 1, '대기 중인 호출이 프로바이더 슬롯을 점유했다');

    // 슬롯이 남아 있으므로 gemini 는 즉시 실행되어야 한다.
    const gem: ChainStep[] = [{ provider: 'agy', model: 'gemini-3.1-pro-high' }];
    const p3 = runModelChain(gem, params, ctx);
    await tick(); await tick();

    assert.ok(
      g.inFlight.includes('gemini-3.1-pro-high'),
      'opus 대기 때문에 gemini 가 굶었다 (head-of-line blocking)'
    );

    // 대기 중이던 p2가 슬롯을 받아 실행에 들어갈 때까지 반복 드레인
    for (let i = 0; i < 8; i++) { g.releaseAll(); await tick(); }
    await Promise.all([p1, p2, p3]);
  });

  test('호출이 끝나면 두 세마포어 모두 반납된다', async () => {
    const g = gatedProvider();
    const ctx = { expertId: 'x', providerConcurrency: { agy: 5 }, resolveProvider: g.resolveProvider };
    const chain: ChainStep[] = [{ provider: 'agy', model: 'gemini-3.1-pro-high' }];

    const p = runModelChain(chain, params, ctx);
    await tick(); await tick();
    assert.equal(getSemaphore('agy').inFlight, 1);
    assert.equal(getSemaphore('agy:gemini-3.1-pro-high').inFlight, 1);

    g.releaseAll();
    await p;

    assert.equal(getSemaphore('agy').inFlight, 0, '프로바이더 세마포어 누수');
    assert.equal(getSemaphore('agy:gemini-3.1-pro-high').inFlight, 0, '모델 세마포어 누수');
  });

  test('실패한 호출도 세마포어를 반납한다', async () => {
    const failing: CliProvider = {
      id: 'agy',
      async call() { throw new Error('boom'); },
    };
    const chain: ChainStep[] = [{ provider: 'agy', model: 'gemini-3.1-pro-high' }];

    await assert.rejects(() =>
      runModelChain(chain, params, {
        expertId: 'x',
        providerConcurrency: { agy: 5 },
        resolveProvider: () => failing,
      })
    );

    assert.equal(getSemaphore('agy').inFlight, 0);
    assert.equal(getSemaphore('agy:gemini-3.1-pro-high').inFlight, 0);
  });
});
