// src/utils/cache.ts

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { statSync } from 'fs';
import { isAbsolute, resolve, sep } from 'path';
import { config } from '../config.js';
import { logger } from './logger.js';

interface CacheEntry {
  response: string;
  expertId: string;
  timestamp: Date;
}

const cache = new LRUCache<string, CacheEntry>({
  max: config.cache.maxSize,
  ttl: config.cache.ttlMs
});


// ─────────────────────────────────────────────────────────────────────────────
// 파일 지문
//
// 전문가 프롬프트는 파일 "경로"만 담고 내용은 담지 않는다 (CLI가 직접 읽는 설계).
// 그래서 캐시 키가 파일 변경을 전혀 못 봤다: 리뷰 받고 → 지적된 버그 고치고 →
// 다시 리뷰하면 프롬프트가 동일하므로 TTL 동안 고치기 전 코드의 리뷰가 재생됐다.
// 코드 리뷰 도구로서 명백한 오동작이라, 참조된 파일의 mtime+size를 키에 섞는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 경로처럼 보이는 토큰. 확장자가 있어야 하고 URL은 제외한다. */
const PATH_TOKEN = /[A-Za-z0-9_.\-]+(?:[\\/][A-Za-z0-9_.\-]+)+\.[A-Za-z0-9]{1,10}/g;

/** 한 번에 stat 할 최대 후보 수. 프롬프트가 수십 KB여도 비용을 묶어둔다. */
const MAX_FINGERPRINT_FILES = 40;

/**
 * 텍스트에서 실제로 존재하는 파일 경로만 골라낸다.
 *
 * 존재하지 않는 토큰은 조용히 버린다 — 잘못 잡아도 손해가 없고,
 * 실제 파일을 잡으면 그 파일의 변경이 캐시에 반영되어야 하는 게 맞다.
 * 워크스페이스 밖(절대경로, 상위 탈출)은 제외해 무관한 파일을 건드리지 않는다.
 */
export function extractReferencedFiles(text: string, cwd: string): string[] {
  if (!text) return [];
  const root = resolve(cwd);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of text.match(PATH_TOKEN) ?? []) {
    if (out.length >= MAX_FINGERPRINT_FILES) break;
    if (raw.includes('://')) continue;          // URL
    if (isAbsolute(raw)) continue;              // 워크스페이스 밖
    const abs = resolve(root, raw);
    if (abs !== root && !abs.startsWith(root + sep)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      const st = statSync(abs);
      if (st.isFile()) out.push(abs);
    } catch {
      // 존재하지 않으면 그냥 무시
    }
  }
  return out;
}

/** 파일 목록 → 안정적인 짧은 지문. 파일이 없으면 빈 문자열. */
export function fingerprintFiles(paths: string[]): string {
  if (paths.length === 0) return '';
  const parts: string[] = [];
  for (const abs of [...paths].sort()) {
    try {
      const st = statSync(abs);
      parts.push(`${abs}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${abs}:missing`);
    }
  }
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 16);
}

/** 프롬프트/컨텍스트에서 참조된 파일들의 지문. 캐시 키 보강용. */
export function fingerprintReferencedFiles(text: string, cwd: string): string {
  return fingerprintFiles(extractReferencedFiles(text, cwd));
}

function generateCacheKey(expertId: string, prompt: string, context?: string): string {
  const content = `${expertId}:${prompt}:${context || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function getCached(expertId: string, prompt: string, context?: string): CacheEntry | null {
  if (!config.cache.enabled) return null;

  const key = generateCacheKey(expertId, prompt, context);
  const entry = cache.get(key);

  if (entry) {
    logger.debug({ expertId, cacheKey: key }, 'Cache hit');
  }

  return entry || null;
}

export function setCache(expertId: string, prompt: string, response: string, context?: string): void {
  if (!config.cache.enabled) return;

  const key = generateCacheKey(expertId, prompt, context);
  cache.set(key, {
    response,
    expertId,
    timestamp: new Date()
  });

  logger.debug({ expertId, cacheKey: key }, 'Cache set');
}

export function clearCache(): void {
  cache.clear();
  logger.info('Cache cleared');
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxSize: config.cache.maxSize,
    ttlMs: config.cache.ttlMs
  };
}
