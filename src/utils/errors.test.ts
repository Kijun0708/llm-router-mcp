// src/utils/errors.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyErrorText,
  kindOf,
  ClassifiedError,
  ERROR_POLICY,
  policyOf,
  type ErrorKind,
} from './errors.js';

describe('classifyErrorText — 판정 순서', () => {
  test('quota가 auth보다 먼저 이긴다 (이전 5벌 표의 최대 오분류)', () => {
    // "auth"를 포함하지만 실체는 quota인 메시지
    assert.equal(
      classifyErrorText('oauth token ok but quota exceeded for this model'),
      'quota'
    );
    assert.equal(
      classifyErrorText('RESOURCE_EXHAUSTED: authenticated user quota reached'),
      'quota'
    );
  });

  test('bad_model이 bad_request보다 먼저 이긴다', () => {
    // agy 실측 메시지
    assert.equal(
      classifyErrorText(
        'invalid model selection (--model "no-such-model-xyz" --effort ""): model no-such-model-xyz is not recognized as a known model or custom model in settings'
      ),
      'bad_model'
    );
    assert.equal(
      classifyErrorText('--effort is not supported for model "claude-opus-4-6-thinking"'),
      'bad_model'
    );
  });

  test('context_overflow가 bad_request보다 먼저 이긴다', () => {
    assert.equal(classifyErrorText('prompt is too long for this model'), 'context_overflow');
    assert.equal(classifyErrorText('maximum context length exceeded'), 'context_overflow');
  });

  test('숫자 상태코드는 단어 경계로만 매칭 (14002ms가 400이 되면 안 됨)', () => {
    assert.notEqual(classifyErrorText('request finished in 14002ms'), 'bad_request');
    assert.notEqual(classifyErrorText('used 5001 tokens'), 'server');
    assert.notEqual(classifyErrorText('processed 4290 items'), 'quota');

    assert.equal(classifyErrorText('HTTP 400 bad request'), 'bad_request');
    assert.equal(classifyErrorText('status 503'), 'server');
    assert.equal(classifyErrorText('got 429 from upstream'), 'quota');
    assert.equal(classifyErrorText('403'), 'auth');
  });

  test('permission_denied는 텍스트로 절대 유도되지 않는다', () => {
    // 모델이 답변 본문에서 이 말을 해도 실패로 잡으면 안 된다
    const text = 'The script failed with permission denied on /etc/hosts';
    assert.notEqual(classifyErrorText(text), 'permission_denied');
  });
});

describe('classifyErrorText — 각 kind 대표 케이스', () => {
  const cases: Array<[string, ErrorKind]> = [
    ['Error: RESOURCE_EXHAUSTED', 'quota'],
    ['Individual quota reached', 'quota'],
    ['rate limit exceeded, try again later', 'quota'],
    ['Too Many Requests', 'quota'],
    ['CLI timeout: agy timed out after 900s', 'timeout'],
    ['ETIMEDOUT', 'timeout'],
    ['You are not logged in. Run codex login.', 'auth'],
    ['unauthorized', 'auth'],
    ['invalid api key', 'auth'],
    ['ECONNREFUSED 127.0.0.1:443', 'network'],
    ['CLI spawn failed: agy - ENOENT', 'network'],
    ['socket hang up', 'network'],
    ['model is overloaded', 'server'],
    ['502 Bad Gateway', 'server'],
    ['invalid json in request body', 'bad_request'],
    ['something completely unexpected happened', 'unknown'],
    ['', 'unknown'],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input.slice(0, 45))} → ${expected}`, () => {
      assert.equal(classifyErrorText(input), expected);
    });
  }

  test('null/undefined는 unknown', () => {
    assert.equal(classifyErrorText(null), 'unknown');
    assert.equal(classifyErrorText(undefined), 'unknown');
  });
});

describe('kindOf — 구조적 신호 우선', () => {
  test('ClassifiedError의 kind가 메시지 텍스트를 이긴다', () => {
    // 메시지는 quota처럼 보이지만 구조적으로 permission_denied로 선언됨
    const err = new ClassifiedError('permission_denied', 'quota exceeded blah');
    assert.equal(kindOf(err), 'permission_denied');
  });

  test('.kind를 가진 평범한 객체도 인정', () => {
    assert.equal(kindOf({ kind: 'bad_model', message: 'x' }), 'bad_model');
  });

  test('.kind가 유효하지 않으면 텍스트로 폴백', () => {
    assert.equal(kindOf({ kind: 'nonsense', message: 'timed out' }), 'unknown');
  });

  test('HTTP status 필드 인식', () => {
    assert.equal(kindOf({ status: 429 }), 'quota');
    assert.equal(kindOf({ status: 401 }), 'auth');
    assert.equal(kindOf({ status: 400 }), 'bad_request');
    assert.equal(kindOf({ status: 503 }), 'server');
  });

  test('평범한 Error는 메시지로 분류', () => {
    assert.equal(kindOf(new Error('CLI timeout: codex timed out after 1200s')), 'timeout');
  });

  test('문자열/undefined도 안전하게 처리', () => {
    assert.equal(kindOf('overloaded'), 'server');
    assert.equal(kindOf(undefined), 'unknown');
  });
});

describe('ERROR_POLICY — 정책 불변식', () => {
  test('timeout은 같은 모델 재시도 금지 (15분 타임아웃 재시도 = 30분)', () => {
    assert.equal(ERROR_POLICY.timeout.retrySameModel, false);
    assert.equal(ERROR_POLICY.timeout.tryNextModel, false);
    assert.equal(ERROR_POLICY.timeout.tryFallbackExpert, true);
  });

  test('auth는 모든 우회를 막는다', () => {
    const p = ERROR_POLICY.auth;
    assert.equal(p.retrySameModel, false);
    assert.equal(p.tryNextModel, false);
    assert.equal(p.tryFallbackExpert, false);
  });

  test('permission_denied는 조용히 폴백하지 않는다 (우리 argv 버그이므로)', () => {
    const p = ERROR_POLICY.permission_denied;
    assert.equal(p.retrySameModel, false);
    assert.equal(p.tryNextModel, false);
    assert.equal(p.tryFallbackExpert, false);
  });

  test('quota는 다음 모델로 넘어가고 모델을 차단한다', () => {
    assert.equal(ERROR_POLICY.quota.tryNextModel, true);
    assert.equal(ERROR_POLICY.quota.blockModelMs, 90 * 60 * 1000);
  });

  test('bad_model은 다음 모델로 강등되지만 폴백 전문가로는 안 간다', () => {
    assert.equal(ERROR_POLICY.bad_model.tryNextModel, true);
    assert.equal(ERROR_POLICY.bad_model.tryFallbackExpert, false);
  });

  test('모든 ErrorKind에 정책이 존재한다', () => {
    const kinds: ErrorKind[] = [
      'quota', 'timeout', 'auth', 'bad_request', 'bad_model',
      'permission_denied', 'network', 'server', 'context_overflow', 'unknown',
    ];
    for (const k of kinds) {
      assert.ok(ERROR_POLICY[k], `정책 누락: ${k}`);
    }
    assert.equal(Object.keys(ERROR_POLICY).length, kinds.length);
  });

  test('policyOf는 kindOf와 일관된다', () => {
    assert.deepEqual(policyOf(new Error('429')), ERROR_POLICY.quota);
  });
});
