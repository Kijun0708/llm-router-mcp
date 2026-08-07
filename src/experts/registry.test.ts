// src/experts/registry.test.ts
//
// 손으로 관리되는 6개 목록이 서로 어긋나는 것을 막는다.
// 실제로 어긋나 있었다: 죽은 Expert.fallbacks 필드가 FALLBACK_CHAIN과 반대 순서였고,
// marketplace.json은 "전문가 23명"이라고 적혀 있었으며(실제 18),
// index.ts는 "79 tools"를 로그에 찍었다(실제 76).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { experts, FALLBACK_CHAIN, EXPERT_METADATA_REGISTRY, validateExpertRegistry } from './index.js';
import { EXPERT_IDS, EXPERT_RUNTIME_DEFAULTS, DEFAULT_MODEL_FAMILIES } from '../model-defaults.js';
import { config } from '../config.js';
import { isKnownModel, providerOf, isScarce, MODELS } from '../services/providers/model-registry.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (rel: string) => JSON.parse(readFileSync(join(repoRoot, rel), 'utf-8'));

describe('validateExpertRegistry', () => {
  test('부팅 검증이 통과한다', () => {
    assert.doesNotThrow(() => validateExpertRegistry());
  });
});

describe('6개 목록의 키가 전부 일치한다', () => {
  const sorted = (xs: string[]) => [...xs].sort();
  const expertKeys = sorted(Object.keys(experts));

  const lists: Array<[string, string[]]> = [
    ['EXPERT_RUNTIME_DEFAULTS', sorted(Object.keys(EXPERT_RUNTIME_DEFAULTS))],
    ['EXPERT_IDS', sorted([...EXPERT_IDS])],
    ['config.models', sorted(Object.keys(config.models))],
    ['FALLBACK_CHAIN', sorted(Object.keys(FALLBACK_CHAIN))],
    ['EXPERT_METADATA_REGISTRY', sorted(Object.keys(EXPERT_METADATA_REGISTRY))],
    ['DEFAULT_MODEL_FAMILIES', sorted(Object.keys(DEFAULT_MODEL_FAMILIES))],
  ];

  for (const [name, keys] of lists) {
    test(`experts === ${name}`, () => {
      assert.deepEqual(keys, expertKeys);
    });
  }

  test('전문가는 18명이다', () => {
    assert.equal(expertKeys.length, 18);
  });
});

describe('전문가 런타임 설정', () => {
  test('모든 전문가의 모델이 레지스트리에 등록되어 있다', () => {
    for (const [id, expert] of Object.entries(experts)) {
      assert.ok(isKnownModel(expert.model), `${id}의 모델 "${expert.model}"이 미등록`);
    }
  });

  test('선언된 provider가 모델의 실제 소속과 일치한다', () => {
    for (const [id, expert] of Object.entries(experts)) {
      assert.equal(providerOf(expert.model), expert.provider, `${id} provider 불일치`);
    }
  });

  test('implementer만 쓰기 권한을 갖는다', () => {
    const writers = Object.entries(experts)
      .filter(([, e]) => e.sandbox === 'workspace-write')
      .map(([id]) => id);
    assert.deepEqual(writers, ['implementer']);
  });

  test('어떤 전문가도 scarce 모델을 기본값으로 쓰지 않는다', () => {
    // Claude 계열이 기본값이 되면 opt-in 가드 전체가 무의미해진다.
    for (const [id, expert] of Object.entries(experts)) {
      assert.equal(isScarce(expert.model), false, `${id}가 scarce 모델 "${expert.model}"을 기본값으로 쓴다`);
    }
  });

  test('기본 프로바이더는 codex와 agy뿐이다', () => {
    const providers = new Set(Object.values(experts).map(e => e.provider));
    assert.deepEqual([...providers].sort(), ['agy', 'codex']);
  });

  test('죽은 fallbacks 필드가 제거됐다', () => {
    for (const [id, expert] of Object.entries(experts)) {
      assert.equal(
        (expert as unknown as Record<string, unknown>).fallbacks,
        undefined,
        `${id}에 죽은 fallbacks 필드가 남아 있다 (FALLBACK_CHAIN만 읽힌다)`
      );
    }
  });

  test('expert.id가 레지스트리 키와 같다', () => {
    for (const [key, expert] of Object.entries(experts)) {
      assert.equal(expert.id, key);
    }
  });
});

describe('FALLBACK_CHAIN', () => {
  test('모든 타깃이 실존하는 전문가다', () => {
    for (const [id, chain] of Object.entries(FALLBACK_CHAIN)) {
      for (const target of chain) {
        assert.ok(experts[target], `FALLBACK_CHAIN["${id}"] → 존재하지 않는 "${target}"`);
      }
    }
  });

  test('자기 자신을 폴백으로 두지 않는다', () => {
    for (const [id, chain] of Object.entries(FALLBACK_CHAIN)) {
      assert.equal(chain.includes(id), false, `${id}가 자기 자신을 폴백으로 둔다`);
    }
  });
});

describe('매니페스트 버전 일치', () => {
  const pkg = readJson('package.json');

  test('package.json / plugin.json / marketplace.json 버전이 같다', () => {
    const plugin = readJson('plugin/.claude-plugin/plugin.json');
    const marketplace = readJson('.claude-plugin/marketplace.json');

    assert.equal(plugin.version, pkg.version, 'plugin.json 버전 불일치');
    for (const entry of marketplace.plugins ?? []) {
      assert.equal(entry.version, pkg.version, `marketplace plugins[${entry.name}] 버전 불일치`);
    }
  });

  test('marketplace 설명의 전문가 수가 실제와 같다', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    const blob = JSON.stringify(marketplace);
    const matches = [...blob.matchAll(/전문가\s*(\d+)\s*명/g)];
    for (const m of matches) {
      assert.equal(Number(m[1]), Object.keys(experts).length, `"전문가 ${m[1]}명"이 실제와 다르다`);
    }
  });
});

describe('config.models', () => {
  test('모든 값이 레지스트리 슬러그다', () => {
    for (const [id, model] of Object.entries(config.models)) {
      assert.ok(isKnownModel(model), `config.models.${id} = "${model}"이 미등록`);
    }
  });

  test('죽은 -preview 슬러그가 없다', () => {
    for (const model of Object.values(config.models)) {
      assert.doesNotMatch(model, /-preview$/, `죽은 슬러그: ${model}`);
    }
    assert.equal(isKnownModel('gemini-3.1-pro-preview'), false);
    assert.equal(isKnownModel('gemini-3-flash-preview'), false);
  });

  test('MODELS는 비어 있지 않다', () => {
    assert.ok(Object.keys(MODELS).length >= 13);
  });
});
