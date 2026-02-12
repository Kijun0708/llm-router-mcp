// src/utils/response-saver.ts
// 하이브리드 응답 반환: 짧은 응답은 인라인, 긴 응답/워크플로우는 파일 저장 + 요약 반환

import { config } from '../config.js';
import { logger } from './logger.js';
import crypto from 'crypto';
import { existsSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Constants
// ============================================================================

const RESPONSES_DIR = join(process.cwd(), '.llm-router-data', 'responses');

// ============================================================================
// Types
// ============================================================================

interface SavedResponseMeta {
  filePath: string;
  relativePath: string;
  fileName: string;
  responseLength: number;
  savedAt: string;
}

interface ExpertInfo {
  name?: string;
  model?: string;
  fellBack?: boolean;
  cached?: boolean;
  actualExpert?: string;
}

interface WrapOptions {
  expertId?: string;
  toolName: string;
  isWorkflow?: boolean;
  expertInfo?: ExpertInfo;
}

// ============================================================================
// File Operations
// ============================================================================

function ensureResponsesDir(): void {
  if (!existsSync(RESPONSES_DIR)) {
    mkdirSync(RESPONSES_DIR, { recursive: true });
    logger.debug({ path: RESPONSES_DIR }, 'Created responses directory');
  }
}

function generateFileName(expertId?: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-mm-ss
  const id = crypto.randomBytes(3).toString('hex');
  const expert = expertId || 'unknown';
  return `${date}_${time}_${expert}_${id}.md`;
}

function saveResponseToFile(
  response: string,
  expertId?: string,
  toolName?: string
): SavedResponseMeta {
  ensureResponsesDir();

  const fileName = generateFileName(expertId);
  const filePath = join(RESPONSES_DIR, fileName);
  const savedAt = new Date().toISOString();

  const content = [
    '---',
    `expert: ${expertId || 'unknown'}`,
    `tool: ${toolName || 'unknown'}`,
    `timestamp: ${savedAt}`,
    `length: ${response.length}`,
    '---',
    '',
    response,
  ].join('\n');

  writeFileSync(filePath, content, 'utf-8');
  logger.debug({ fileName, length: response.length }, 'Saved response to file');

  const relativePath = `.llm-router-data/responses/${fileName}`;

  return {
    filePath,
    relativePath,
    fileName,
    responseLength: response.length,
    savedAt,
  };
}

// ============================================================================
// Summary Generation
// ============================================================================

function generateSummary(
  response: string,
  meta: SavedResponseMeta,
  expertInfo?: ExpertInfo
): string {
  const hybridConfig = config.hybrid;
  const lines = response.split('\n').filter(l => l.trim().length > 0);
  const previewLines = lines.slice(0, hybridConfig.previewLines).join('\n> ');

  const expertLabel = expertInfo?.name || meta.fileName;
  const modelLabel = expertInfo?.model ? ` (${expertInfo.model})` : '';

  let statusParts: string[] = [];
  if (expertInfo?.fellBack && expertInfo?.actualExpert) {
    statusParts.push(`폴백: ${expertInfo.actualExpert}`);
  }
  if (expertInfo?.cached) {
    statusParts.push('캐시');
  }
  const statusStr = statusParts.length > 0 ? ` | ${statusParts.join(' | ')}` : '';

  const lengthFormatted = meta.responseLength.toLocaleString();

  const summary = [
    `## ${expertLabel} 응답 (파일 저장됨)`,
    '',
    `- **전문가**: ${expertLabel}${modelLabel}${statusStr}`,
    `- **응답 길이**: ${lengthFormatted}자`,
    `- **파일**: \`${meta.relativePath}\``,
    '',
    '### 미리보기',
    `> ${previewLines}`,
    '',
    '전체 내용은 위 파일을 Read 도구로 확인하세요.',
  ].join('\n');

  return summary;
}

// ============================================================================
// Hybrid Decision Logic
// ============================================================================

/**
 * MCP 응답을 하이브리드 방식으로 래핑.
 * 짧은 응답은 인라인, 긴 응답/워크플로우는 파일 저장 + 요약 반환.
 */
export function wrapMcpResponse(
  text: string,
  options: WrapOptions
): { content: Array<{ type: 'text'; text: string }> } {
  const hybridConfig = config.hybrid;

  // 비활성화 시 기존 방식 유지
  if (!hybridConfig.enabled) {
    return { content: [{ type: 'text' as const, text }] };
  }

  // 판단: 파일 저장 여부
  const shouldSaveToFile =
    (options.isWorkflow && hybridConfig.alwaysSaveWorkflows) ||
    text.length > hybridConfig.inlineThresholdChars;

  if (!shouldSaveToFile) {
    return { content: [{ type: 'text' as const, text }] };
  }

  // 파일 저장 + 요약 반환
  try {
    const meta = saveResponseToFile(text, options.expertId, options.toolName);
    const summary = generateSummary(text, meta, options.expertInfo);
    return { content: [{ type: 'text' as const, text: summary }] };
  } catch (error) {
    // 파일 저장 실패 시 기존 인라인 방식으로 폴백
    logger.warn({ error, toolName: options.toolName }, 'Failed to save response to file, falling back to inline');
    return { content: [{ type: 'text' as const, text }] };
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * 오래된 응답 파일 정리. Health check에서 호출.
 */
export function cleanupOldResponses(): number {
  if (!existsSync(RESPONSES_DIR)) {
    return 0;
  }

  const maxAge = config.hybrid.cleanupMaxAgeMs;
  const now = Date.now();
  let deletedCount = 0;

  try {
    const files = readdirSync(RESPONSES_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = join(RESPONSES_DIR, file);
      try {
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          unlinkSync(filePath);
          deletedCount++;
        }
      } catch {
        // 개별 파일 처리 실패는 무시
      }
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Cleaned up old response files');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup old responses');
  }

  return deletedCount;
}
