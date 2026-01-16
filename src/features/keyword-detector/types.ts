// src/features/keyword-detector/types.ts

/**
 * Keyword Detector Types
 *
 * 특정 키워드/패턴 감지 시 자동으로 적절한 expert로 라우팅하는 시스템
 */

export type ExpertId = 'strategist' | 'researcher' | 'reviewer' | 'frontend' | 'writer' | 'explorer';

/**
 * 키워드 매칭 타입
 */
export type MatchType =
  | 'exact'      // 정확히 일치
  | 'contains'   // 포함
  | 'startsWith' // 시작
  | 'endsWith'   // 끝
  | 'regex';     // 정규식

/**
 * 키워드 규칙 정의
 */
export interface KeywordRule {
  id: string;
  name: string;
  keywords: string[];           // 감지할 키워드 목록
  matchType: MatchType;         // 매칭 방식
  caseSensitive: boolean;       // 대소문자 구분
  targetExpert: ExpertId;       // 라우팅 대상 expert
  priority: number;             // 우선순위 (높을수록 우선)
  enabled: boolean;             // 활성화 여부
  description?: string;         // 규칙 설명
  createdAt: string;
  updatedAt: string;
}

/**
 * 키워드 감지 결과
 */
export interface DetectionResult {
  detected: boolean;
  matchedRules: MatchedRule[];
  suggestedExpert?: ExpertId;
  confidence: number;           // 0-1 사이의 신뢰도
}

/**
 * 매칭된 규칙 정보
 */
export interface MatchedRule {
  ruleId: string;
  ruleName: string;
  matchedKeywords: string[];
  targetExpert: ExpertId;
  priority: number;
}

/**
 * 키워드 설정 파일 구조
 */
export interface KeywordConfig {
  version: string;
  enabled: boolean;
  rules: KeywordRule[];
  defaultRules: KeywordRule[];  // 기본 내장 규칙
}

/**
 * 키워드 규칙 생성 파라미터
 */
export interface CreateRuleParams {
  name: string;
  keywords: string[];
  matchType?: MatchType;
  caseSensitive?: boolean;
  targetExpert: ExpertId;
  priority?: number;
  description?: string;
}

/**
 * 키워드 규칙 업데이트 파라미터
 */
export interface UpdateRuleParams {
  id: string;
  name?: string;
  keywords?: string[];
  matchType?: MatchType;
  caseSensitive?: boolean;
  targetExpert?: ExpertId;
  priority?: number;
  enabled?: boolean;
  description?: string;
}

/**
 * 기본 내장 규칙 정의
 */
export const DEFAULT_KEYWORD_RULES: Omit<KeywordRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Strategist 관련 키워드
  {
    name: 'Architecture Keywords',
    keywords: ['아키텍처', 'architecture', '설계', 'design pattern', '디자인 패턴', 'scalability', '확장성'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'strategist',
    priority: 80,
    enabled: true,
    description: '아키텍처 및 설계 관련 질문을 strategist로 라우팅'
  },
  {
    name: 'Strategy Keywords',
    keywords: ['전략', 'strategy', '방향', 'approach', '접근법', 'best practice', '모범 사례'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'strategist',
    priority: 75,
    enabled: true,
    description: '전략적 조언 요청을 strategist로 라우팅'
  },

  // Researcher 관련 키워드
  {
    name: 'Documentation Keywords',
    keywords: ['문서', 'documentation', 'docs', 'API 문서', '공식 문서', 'official'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'researcher',
    priority: 80,
    enabled: true,
    description: '문서 조회 요청을 researcher로 라우팅'
  },
  {
    name: 'Research Keywords',
    keywords: ['조사', 'research', '찾아봐', 'look up', '검색', 'search for'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'researcher',
    priority: 70,
    enabled: true,
    description: '리서치 요청을 researcher로 라우팅'
  },

  // Reviewer 관련 키워드
  {
    name: 'Code Review Keywords',
    keywords: ['리뷰', 'review', '코드 리뷰', 'code review', '검토', '점검'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'reviewer',
    priority: 85,
    enabled: true,
    description: '코드 리뷰 요청을 reviewer로 라우팅'
  },
  {
    name: 'Security Keywords',
    keywords: ['보안', 'security', '취약점', 'vulnerability', 'XSS', 'SQL injection', 'OWASP'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'reviewer',
    priority: 90,
    enabled: true,
    description: '보안 관련 질문을 reviewer로 라우팅'
  },
  {
    name: 'Bug Keywords',
    keywords: ['버그', 'bug', '오류', 'error', '문제', 'issue', '안됨', 'not working'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'reviewer',
    priority: 70,
    enabled: true,
    description: '버그/오류 관련 질문을 reviewer로 라우팅'
  },

  // Frontend 관련 키워드
  {
    name: 'UI/UX Keywords',
    keywords: ['UI', 'UX', '디자인', 'design', '스타일', 'style', 'CSS', 'tailwind'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'frontend',
    priority: 80,
    enabled: true,
    description: 'UI/UX 관련 질문을 frontend로 라우팅'
  },
  {
    name: 'Component Keywords',
    keywords: ['컴포넌트', 'component', 'React', 'Vue', 'Angular', 'Svelte', '프론트엔드', 'frontend'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'frontend',
    priority: 75,
    enabled: true,
    description: '프론트엔드 컴포넌트 관련 질문을 frontend로 라우팅'
  },

  // Writer 관련 키워드
  {
    name: 'Documentation Writing Keywords',
    keywords: ['README', '문서 작성', 'write docs', '주석', 'comment', 'JSDoc', '설명 추가'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'writer',
    priority: 80,
    enabled: true,
    description: '문서 작성 요청을 writer로 라우팅'
  },

  // Explorer 관련 키워드
  {
    name: 'Quick Search Keywords',
    keywords: ['찾아줘', 'find', '어디', 'where', '파일', 'file', '위치', 'location'],
    matchType: 'contains',
    caseSensitive: false,
    targetExpert: 'explorer',
    priority: 60,
    enabled: true,
    description: '파일/코드 검색 요청을 explorer로 라우팅'
  }
];
