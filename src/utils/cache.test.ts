// src/utils/cache.test.ts
//
// 파일 지문 회귀 테스트.
//
// 배경: 전문가 프롬프트는 파일 "경로"만 담고 내용은 CLI가 직접 읽는다.
// 그래서 캐시 키가 파일 변경을 못 봤고, 리뷰 → 수정 → 재리뷰 시 TTL(30분) 동안
// 고치기 전 코드의 리뷰가 그대로 재생됐다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { extractReferencedFiles, fingerprintFiles, fingerprintReferencedFiles } from './cache.js';

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cachetest-'));
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'b.ts'), 'export const b = 2;\n');
  return dir;
}

describe('extractReferencedFiles', () => {
  test('실제 존재하는 파일만 골라낸다', () => {
    const ws = makeWorkspace();
    try {
      const text = '다음 파일들을 리뷰해줘:\n- ./a.ts\n- ./b.ts\n- ./does-not-exist.ts';
      const found = extractReferencedFiles(text, ws).map((p) => p.replace(resolve(ws), ''));
      assert.equal(found.length, 2);
      assert.ok(found.some((f) => f.endsWith('a.ts')));
      assert.ok(found.some((f) => f.endsWith('b.ts')));
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('URL은 무시한다', () => {
    const ws = makeWorkspace();
    try {
      const found = extractReferencedFiles('https://example.com/path/thing.ts 참고', ws);
      assert.deepEqual(found, []);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('워크스페이스 밖(절대경로/상위 탈출)은 제외한다', () => {
    const ws = makeWorkspace();
    try {
      assert.deepEqual(extractReferencedFiles('C:/Windows/system32/drivers/etc/hosts', ws), []);
      assert.deepEqual(extractReferencedFiles('../../../etc/passwd', ws), []);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('빈 입력도 안전하다', () => {
    assert.deepEqual(extractReferencedFiles('', process.cwd()), []);
  });
});

describe('fingerprintReferencedFiles — 캐시 무효화의 핵심', () => {
  test('파일 내용이 바뀌면 지문이 바뀐다', () => {
    const ws = makeWorkspace();
    try {
      const prompt = '다음 파일들을 리뷰해줘:\n- ./a.ts';

      const before = fingerprintReferencedFiles(prompt, ws);
      assert.notEqual(before, '', '지문이 비었다 — 파일을 못 찾았다');

      // 리뷰에서 지적된 버그를 고친 상황
      writeFileSync(join(ws, 'a.ts'), 'export const a = 42; // 수정됨\n');
      const after = fingerprintReferencedFiles(prompt, ws);

      assert.notEqual(
        before, after,
        '파일을 고쳤는데 지문이 같다 → 옛 리뷰가 캐시에서 재생된다'
      );
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('파일이 그대로면 지문도 그대로다 (캐시가 살아 있어야 한다)', () => {
    const ws = makeWorkspace();
    try {
      const prompt = '리뷰: ./a.ts';
      assert.equal(fingerprintReferencedFiles(prompt, ws), fingerprintReferencedFiles(prompt, ws));
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('크기가 같아도 mtime이 다르면 지문이 바뀐다', () => {
    const ws = makeWorkspace();
    try {
      const prompt = '리뷰: ./a.ts';
      const before = fingerprintReferencedFiles(prompt, ws);
      // 같은 길이로 내용만 교체 + mtime 이동
      writeFileSync(join(ws, 'a.ts'), 'export const a = 9;\n');
      const t = new Date(Date.now() + 60_000);
      utimesSync(join(ws, 'a.ts'), t, t);
      assert.notEqual(before, fingerprintReferencedFiles(prompt, ws));
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test('참조 파일이 없으면 빈 지문 (캐시 동작이 예전과 동일)', () => {
    assert.equal(fingerprintReferencedFiles('일반적인 질문입니다. 파일 없음.', process.cwd()), '');
  });

  test('파일 순서가 달라도 지문은 같다', () => {
    const ws = makeWorkspace();
    try {
      const f1 = fingerprintReferencedFiles('- ./a.ts\n- ./b.ts', ws);
      const f2 = fingerprintReferencedFiles('- ./b.ts\n- ./a.ts', ws);
      assert.equal(f1, f2);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});

describe('fingerprintFiles', () => {
  test('빈 목록은 빈 문자열', () => {
    assert.equal(fingerprintFiles([]), '');
  });

  test('없는 파일도 throw하지 않는다', () => {
    assert.notEqual(fingerprintFiles([join(tmpdir(), 'nope-does-not-exist.ts')]), '');
  });
});
