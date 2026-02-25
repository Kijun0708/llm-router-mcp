// src/categories.ts

import { Category } from './types.js';

export const categories: Record<string, Category> = {
  visual: {
    id: 'visual',
    defaultExpert: 'frontend',
    model: 'gemini-3.0-pro',
    temperature: 0.7,
    description: 'UI/UX, 디자인, 프론트엔드 작업',
    promptAppend: '사용자 경험과 시각적 아름다움을 최우선으로 고려하세요.'
  },

  'business-logic': {
    id: 'business-logic',
    defaultExpert: 'strategist',
    model: 'gpt-5.2',
    temperature: 0.1,
    description: '백엔드 로직, 아키텍처, 전략적 결정',
    promptAppend: '확장성, 유지보수성, 성능을 고려한 설계를 제시하세요.'
  },

  research: {
    id: 'research',
    defaultExpert: 'researcher',
    model: 'gemini-3-pro-preview',
    temperature: 0.1,
    description: '조사, 분석, 문서 탐색',
    promptAppend: '근거를 명확히 제시하고 출처를 밝히세요.'
  },

  quick: {
    id: 'quick',
    defaultExpert: 'explorer',
    model: 'gemini-3.0-flash',
    temperature: 0.1,
    description: '빠른 탐색, 간단한 질문, 파일 찾기',
    promptAppend: '최대한 빠르고 간결하게 답변하세요.'
  },

  review: {
    id: 'review',
    defaultExpert: 'reviewer',
    model: 'gemini-3.0-pro',
    temperature: 0.1,
    description: '코드 리뷰, 버그 탐지, 품질 검사',
    promptAppend: '심각도 순으로 문제를 정리하고 구체적 개선안을 제시하세요.'
  },

  documentation: {
    id: 'documentation',
    defaultExpert: 'writer',
    model: 'gemini-3.0-flash',
    temperature: 0.2,
    description: '문서 작성, README, API 문서화',
    promptAppend: '명확하고 구조화된 문서를 작성하세요.'
  }
};

export type CategoryId = keyof typeof categories;
