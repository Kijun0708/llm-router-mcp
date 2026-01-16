// src/tools/keyword-detector.ts

/**
 * Keyword Detector MCP Tools
 *
 * 키워드 기반 expert 자동 라우팅 관리 도구
 */

import { z } from 'zod';
import {
  getKeywordDetector,
  ExpertId,
  MatchType
} from '../features/keyword-detector/index.js';

// ============================================================================
// Tool Schemas
// ============================================================================

const expertIdEnum = z.enum(['strategist', 'researcher', 'reviewer', 'frontend', 'writer', 'explorer']);
const matchTypeEnum = z.enum(['exact', 'contains', 'startsWith', 'endsWith', 'regex']);

export const keywordAddSchema = z.object({
  name: z.string()
    .min(1)
    .max(50)
    .describe('규칙 이름'),
  keywords: z.array(z.string().min(1))
    .min(1)
    .max(20)
    .describe('감지할 키워드 목록'),
  target_expert: expertIdEnum
    .describe('라우팅 대상 expert'),
  match_type: matchTypeEnum
    .default('contains')
    .optional()
    .describe('매칭 방식: exact(정확히 일치), contains(포함), startsWith, endsWith, regex'),
  case_sensitive: z.boolean()
    .default(false)
    .optional()
    .describe('대소문자 구분 여부'),
  priority: z.number()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .describe('우선순위 (1-100, 높을수록 우선)'),
  description: z.string()
    .max(200)
    .optional()
    .describe('규칙 설명')
}).strict();

export const keywordRemoveSchema = z.object({
  rule_id: z.string()
    .describe('삭제할 규칙 ID')
}).strict();

export const keywordListSchema = z.object({
  include_disabled: z.boolean()
    .default(false)
    .optional()
    .describe('비활성화된 규칙도 표시'),
  include_stats: z.boolean()
    .default(false)
    .optional()
    .describe('사용 통계 포함')
}).strict();

export const keywordDetectSchema = z.object({
  text: z.string()
    .min(1)
    .describe('키워드를 감지할 텍스트')
}).strict();

export const keywordToggleSchema = z.object({
  rule_id: z.string()
    .describe('토글할 규칙 ID'),
  enabled: z.boolean()
    .describe('활성화 여부')
}).strict();

export const keywordSystemToggleSchema = z.object({
  enabled: z.boolean()
    .describe('시스템 활성화 여부')
}).strict();

// ============================================================================
// Tool Definitions
// ============================================================================

export const keywordAddTool = {
  name: 'keyword_add',

  title: '키워드 규칙 추가',

  description: `키워드 감지 규칙을 추가합니다.

## 사용법
특정 키워드가 포함된 요청을 자동으로 적절한 expert로 라우팅합니다.

## 매칭 타입
- **exact**: 단어 경계로 정확히 일치
- **contains**: 텍스트에 포함 (기본값)
- **startsWith**: 텍스트 시작 부분 일치
- **endsWith**: 텍스트 끝 부분 일치
- **regex**: 정규식 패턴

## 예시
\`\`\`
keyword_add name="Security Check" keywords=["보안", "security", "XSS"] target_expert="reviewer" priority=90
\`\`\``,

  inputSchema: keywordAddSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
};

export const keywordRemoveTool = {
  name: 'keyword_remove',

  title: '키워드 규칙 삭제',

  description: `키워드 규칙을 삭제합니다.

사용자 정의 규칙은 완전히 삭제되고, 기본 내장 규칙은 비활성화됩니다.`,

  inputSchema: keywordRemoveSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const keywordListTool = {
  name: 'keyword_list',

  title: '키워드 규칙 목록',

  description: `등록된 키워드 규칙 목록을 조회합니다.

사용자 정의 규칙과 기본 내장 규칙을 모두 표시합니다.`,

  inputSchema: keywordListSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const keywordDetectTool = {
  name: 'keyword_detect',

  title: '키워드 감지',

  description: `텍스트에서 키워드를 감지하고 권장 expert를 반환합니다.

## 반환 정보
- 매칭된 규칙 목록
- 권장 expert
- 신뢰도 (0-1)`,

  inputSchema: keywordDetectSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const keywordToggleTool = {
  name: 'keyword_toggle',

  title: '키워드 규칙 토글',

  description: `특정 키워드 규칙을 활성화/비활성화합니다.`,

  inputSchema: keywordToggleSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const keywordSystemToggleTool = {
  name: 'keyword_system_toggle',

  title: '키워드 시스템 토글',

  description: `키워드 감지 시스템 전체를 활성화/비활성화합니다.`,

  inputSchema: keywordSystemToggleSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleKeywordAdd(
  params: z.infer<typeof keywordAddSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();

  const rule = detector.createRule({
    name: params.name,
    keywords: params.keywords,
    matchType: params.match_type as MatchType,
    caseSensitive: params.case_sensitive,
    targetExpert: params.target_expert as ExpertId,
    priority: params.priority,
    description: params.description
  });

  let response = `## ✅ 키워드 규칙 추가됨\n\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| ID | \`${rule.id}\` |\n`;
  response += `| 이름 | ${rule.name} |\n`;
  response += `| 키워드 | ${rule.keywords.join(', ')} |\n`;
  response += `| 대상 Expert | ${rule.targetExpert} |\n`;
  response += `| 매칭 타입 | ${rule.matchType} |\n`;
  response += `| 우선순위 | ${rule.priority} |\n`;
  response += `| 대소문자 구분 | ${rule.caseSensitive ? '예' : '아니오'} |\n`;

  if (rule.description) {
    response += `| 설명 | ${rule.description} |\n`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleKeywordRemove(
  params: z.infer<typeof keywordRemoveSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();

  const rule = detector.getRule(params.rule_id);
  if (!rule) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 규칙을 찾을 수 없음\n\nID \`${params.rule_id}\`에 해당하는 규칙이 없습니다.`
      }]
    };
  }

  const isDefault = params.rule_id.startsWith('default_');
  const success = detector.deleteRule(params.rule_id);

  if (!success) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 삭제 실패\n\n규칙 \`${params.rule_id}\`를 삭제할 수 없습니다.`
      }]
    };
  }

  const action = isDefault ? '비활성화' : '삭제';
  return {
    content: [{
      type: 'text',
      text: `## ✅ 키워드 규칙 ${action}됨\n\n` +
            `**규칙 ID**: \`${params.rule_id}\`\n` +
            `**이름**: ${rule.name}\n` +
            (isDefault ? '\n*기본 규칙은 삭제 대신 비활성화됩니다.*' : '')
    }]
  };
}

export async function handleKeywordList(
  params: z.infer<typeof keywordListSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();
  const { userRules, defaultRules } = detector.listRules(params.include_disabled);
  const isEnabled = detector.isEnabled();

  let response = `## 📋 키워드 규칙 목록\n\n`;
  response += `**시스템 상태**: ${isEnabled ? '✅ 활성' : '❌ 비활성'}\n\n`;

  // 사용자 정의 규칙
  response += `### 사용자 정의 규칙 (${userRules.length}개)\n\n`;

  if (userRules.length === 0) {
    response += `등록된 사용자 규칙이 없습니다.\n\n`;
  } else {
    response += `| 이름 | 키워드 | Expert | 우선순위 | 상태 |\n`;
    response += `|------|--------|--------|----------|------|\n`;

    for (const rule of userRules) {
      const keywords = rule.keywords.slice(0, 3).join(', ') + (rule.keywords.length > 3 ? '...' : '');
      const status = rule.enabled ? '✅' : '❌';
      response += `| ${rule.name} | ${keywords} | ${rule.targetExpert} | ${rule.priority} | ${status} |\n`;
    }
    response += '\n';
  }

  // 기본 내장 규칙
  response += `### 기본 내장 규칙 (${defaultRules.length}개)\n\n`;

  if (defaultRules.length === 0) {
    response += `활성화된 기본 규칙이 없습니다.\n\n`;
  } else {
    response += `| 이름 | 키워드 | Expert | 우선순위 | 상태 |\n`;
    response += `|------|--------|--------|----------|------|\n`;

    for (const rule of defaultRules) {
      const keywords = rule.keywords.slice(0, 3).join(', ') + (rule.keywords.length > 3 ? '...' : '');
      const status = rule.enabled ? '✅' : '❌';
      response += `| ${rule.name} | ${keywords} | ${rule.targetExpert} | ${rule.priority} | ${status} |\n`;
    }
    response += '\n';
  }

  // 통계
  if (params.include_stats) {
    const stats = detector.getStats();
    if (stats.length > 0) {
      response += `### 사용 통계\n\n`;
      response += `| 규칙 | 히트 수 | 마지막 히트 |\n`;
      response += `|------|---------|-------------|\n`;

      for (const stat of stats.slice(0, 10)) {
        const lastHit = new Date(stat.lastHit).toLocaleString('ko-KR');
        response += `| ${stat.name} | ${stat.hits} | ${lastHit} |\n`;
      }
      response += '\n';
    }
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleKeywordDetect(
  params: z.infer<typeof keywordDetectSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();
  const result = detector.detect(params.text);

  if (!result.detected) {
    return {
      content: [{
        type: 'text',
        text: `## 🔍 키워드 감지 결과\n\n` +
              `**감지된 키워드**: 없음\n\n` +
              `입력 텍스트에서 등록된 키워드가 감지되지 않았습니다.`
      }]
    };
  }

  let response = `## 🔍 키워드 감지 결과\n\n`;
  response += `**권장 Expert**: \`${result.suggestedExpert}\`\n`;
  response += `**신뢰도**: ${(result.confidence * 100).toFixed(1)}%\n\n`;

  response += `### 매칭된 규칙 (${result.matchedRules.length}개)\n\n`;
  response += `| 규칙 | 매칭된 키워드 | Expert | 우선순위 |\n`;
  response += `|------|--------------|--------|----------|\n`;

  for (const match of result.matchedRules) {
    const keywords = match.matchedKeywords.join(', ');
    response += `| ${match.ruleName} | ${keywords} | ${match.targetExpert} | ${match.priority} |\n`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleKeywordToggle(
  params: z.infer<typeof keywordToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();

  const rule = detector.getRule(params.rule_id);
  if (!rule) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 규칙을 찾을 수 없음\n\nID \`${params.rule_id}\`에 해당하는 규칙이 없습니다.`
      }]
    };
  }

  const success = detector.toggleRule(params.rule_id, params.enabled);
  const action = params.enabled ? '활성화' : '비활성화';

  if (!success) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ 토글 실패\n\n규칙 \`${params.rule_id}\`를 ${action}할 수 없습니다.`
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: `## ✅ 규칙 ${action}됨\n\n` +
            `**규칙 ID**: \`${params.rule_id}\`\n` +
            `**이름**: ${rule.name}\n` +
            `**상태**: ${params.enabled ? '✅ 활성' : '❌ 비활성'}`
    }]
  };
}

export async function handleKeywordSystemToggle(
  params: z.infer<typeof keywordSystemToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const detector = getKeywordDetector();
  detector.setEnabled(params.enabled);

  const action = params.enabled ? '활성화' : '비활성화';

  return {
    content: [{
      type: 'text',
      text: `## ✅ 키워드 감지 시스템 ${action}됨\n\n` +
            `키워드 감지 시스템이 ${action}되었습니다.\n\n` +
            (params.enabled
              ? '이제 요청 텍스트에서 키워드가 감지되면 자동으로 적절한 expert로 라우팅됩니다.'
              : '키워드 기반 자동 라우팅이 중지되었습니다.')
    }]
  };
}
