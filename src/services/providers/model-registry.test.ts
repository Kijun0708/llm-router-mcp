// src/services/providers/model-registry.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELS,
  getModel,
  timeoutFor,
  familyOf,
  providerOf,
  isScarce,
  isKnownModel,
  listModels,
  billingProviderOf,
  quotaBlockMsFor,
  FAMILY_TO_BILLING_PROVIDER,
  DEFAULT_QUOTA_BLOCK_MS,
} from './model-registry.js';

describe('MODELS — agy models 실측 목록과 일치', () => {
  // 2026-08-07 `agy models` 출력에 실제로 존재하는 슬러그
  const AGY_LIVE_SLUGS = [
    'gemini-3.7-flash-high',
    'gemini-3.7-flash-medium',
    'gemini-3.7-flash-low',
    'gemini-3.6-flash-high',
    'gemini-3.6-flash-medium',
    'gemini-3.6-flash-low',
    'gemini-3.5-flash-high',
    'gemini-3.5-flash-medium',
    'gemini-3.5-flash-low',
    'gemini-3.1-pro-high',
    'gemini-3.1-pro-low',
    'claude-sonnet-4-6',
    'claude-opus-4-6-thinking',
    'gpt-oss-120b-medium',
  ];

  test('등록된 agy 모델이 실측 목록의 부분집합이다', () => {
    for (const m of listModels('agy')) {
      assert.ok(
        AGY_LIVE_SLUGS.includes(m.id),
        `${m.id}는 agy가 제공하지 않는 슬러그다`
      );
    }
  });

  test('실측 목록의 모든 슬러그가 등록되어 있다', () => {
    for (const slug of AGY_LIVE_SLUGS) {
      assert.ok(isKnownModel(slug), `미등록 슬러그: ${slug}`);
    }
  });

  test('존재하지 않는 gemini-3.1-pro-medium은 등록되지 않았다', () => {
    assert.equal(isKnownModel('gemini-3.1-pro-medium'), false);
  });

  test('죽은 슬러그(-preview)는 전부 제거됐다', () => {
    assert.equal(isKnownModel('gemini-3.1-pro-preview'), false);
    assert.equal(isKnownModel('gemini-3-flash-preview'), false);
  });
});

describe('타임아웃 — 이전 substring 사다리가 틀렸던 케이스', () => {
  test('gpt-oss-120b-medium이 60초 기본값으로 떨어지지 않는다', () => {
    // 이전: model.includes('gpt-5') 실패 → 60초 → 항상 타임아웃
    assert.ok(timeoutFor('gpt-oss-120b-medium') >= 10 * 60 * 1000);
  });

  test('claude-opus-4-6-thinking이 3분으로 떨어지지 않는다', () => {
    // 이전: claude+opus → 180000ms. agy는 단순 작업도 147초가 걸린다.
    assert.ok(timeoutFor('claude-opus-4-6-thinking') >= 10 * 60 * 1000);
  });

  test('agy 모델의 최소 타임아웃이 실측 지연(147초)보다 충분히 크다', () => {
    for (const m of listModels('agy')) {
      assert.ok(
        m.timeoutMs >= 5 * 60 * 1000,
        `${m.id} 타임아웃 ${m.timeoutMs}ms는 실측 지연 대비 너무 짧다`
      );
    }
  });

  test('codex는 20분', () => {
    assert.equal(timeoutFor('gpt-5.5'), 20 * 60 * 1000);
  });
});

describe('scarce — Claude opt-in 가드', () => {
  test('claude 프로바이더의 모든 모델이 scarce다', () => {
    for (const m of listModels('claude')) {
      assert.equal(m.scarce, true, `${m.id}가 scarce가 아니다 — 사용자 한도가 샌다`);
    }
  });

  test('agy의 Claude 계열도 scarce다', () => {
    assert.equal(isScarce('claude-opus-4-6-thinking'), true);
    assert.equal(isScarce('claude-sonnet-4-6'), true);
  });

  test('기본 작업용 모델은 scarce가 아니다', () => {
    assert.equal(isScarce('gpt-5.5'), false);
    assert.equal(isScarce('gemini-3.1-pro-high'), false);
    assert.equal(isScarce('gemini-3.6-flash-high'), false);
  });
});

describe('프로바이더 매핑', () => {
  test('agy 하나가 세 family를 서빙한다 — 문자열 추론이 불가능한 이유', () => {
    const families = new Set(listModels('agy').map(m => m.family));
    assert.ok(families.has('gemini'));
    assert.ok(families.has('claude'));
    assert.ok(families.has('oss'));
  });

  test('같은 family가 서로 다른 프로바이더로 갈라진다', () => {
    // claude family가 agy에도 claude CLI에도 있다 → 이름으로는 결정 불가
    assert.equal(providerOf('claude-opus-4-6-thinking'), 'agy');
    assert.equal(providerOf('opus'), 'claude');
    assert.equal(familyOf('claude-opus-4-6-thinking'), familyOf('opus'));
  });

  test('billingProviderOf가 기존 스키마 라벨을 유지한다', () => {
    assert.equal(billingProviderOf('gpt-5.5'), 'openai');
    assert.equal(billingProviderOf('gemini-3.1-pro-high'), 'google');
    assert.equal(billingProviderOf('opus'), 'anthropic');
    assert.equal(billingProviderOf('gpt-oss-120b-medium'), 'openai');
  });

  test('billingProviderOf는 미등록 이름에도 throw하지 않는다', () => {
    // 과거 로그/저장된 비용 JSON에 남은 이름들
    assert.equal(billingProviderOf('claude-3-opus-20240229'), 'anthropic');
    assert.equal(billingProviderOf('gemini-2.5-pro'), 'google');
    assert.equal(billingProviderOf('gpt-4o'), 'openai');
    assert.equal(billingProviderOf('totally-unknown'), 'openai');
  });

  test('FAMILY_TO_BILLING_PROVIDER가 모든 family를 덮는다', () => {
    for (const m of Object.values(MODELS)) {
      assert.ok(FAMILY_TO_BILLING_PROVIDER[m.family], `family 매핑 누락: ${m.family}`);
    }
  });
});

describe('getModel — 미등록은 조용히 넘어가지 않는다', () => {
  test('미등록 모델은 유효 목록과 함께 throw', () => {
    assert.throws(
      () => getModel('gemini-3.1-pro-preview'),
      /Unknown model .*Registered models:/s
    );
  });

  test('등록 모델은 스펙 반환', () => {
    const m = getModel('gemini-3.1-pro-high');
    assert.equal(m.provider, 'agy');
    assert.equal(m.family, 'gemini');
  });
});

describe('레지스트리 정합성', () => {
  test('모든 항목의 키와 id가 일치한다', () => {
    for (const [key, spec] of Object.entries(MODELS)) {
      assert.equal(key, spec.id, `키 "${key}"와 id "${spec.id}"가 다르다`);
    }
  });

  test('모든 항목이 양수 타임아웃과 동시성을 갖는다', () => {
    for (const m of Object.values(MODELS)) {
      assert.ok(m.timeoutMs > 0, `${m.id} timeoutMs`);
      assert.ok(m.concurrency > 0, `${m.id} concurrency`);
      assert.ok(m.label.length > 0, `${m.id} label`);
    }
  });

  test('quotaBlockMs 미지정 시 기본값', () => {
    assert.equal(quotaBlockMsFor('gpt-5.5'), DEFAULT_QUOTA_BLOCK_MS);
    assert.equal(quotaBlockMsFor('not-a-model'), DEFAULT_QUOTA_BLOCK_MS);
  });

  test('listModels가 프로바이더별로 필터한다', () => {
    assert.equal(listModels('codex').length, 1);
    assert.ok(listModels('agy').length >= 11);
    assert.equal(listModels('claude').length, 2);
    assert.equal(listModels().length, Object.keys(MODELS).length);
  });
});
