// src/services/session-memory.ts

import { logger } from '../utils/logger.js';

export interface MemoryEntry {
  id: string;
  type: 'goal' | 'decision' | 'context' | 'expert_response';
  content: string;
  source?: string;  // 누가 추가했는지 (user, strategist, researcher 등)
  timestamp: Date;
}

class SessionMemory {
  private entries: MemoryEntry[] = [];
  private maxEntries = 50;  // 최대 저장 개수

  /**
   * 메모리에 새 항목 추가
   */
  add(type: MemoryEntry['type'], content: string, source?: string): MemoryEntry {
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      type,
      content,
      source,
      timestamp: new Date()
    };

    this.entries.push(entry);

    // 최대 개수 초과 시 오래된 항목 제거
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    logger.debug({ type, source }, 'Memory entry added');
    return entry;
  }

  /**
   * 전문가 응답 저장
   */
  addExpertResponse(expertId: string, question: string, response: string): MemoryEntry {
    const summary = response.length > 500
      ? response.substring(0, 500) + '...'
      : response;

    return this.add(
      'expert_response',
      `[질문] ${question}\n[응답] ${summary}`,
      expertId
    );
  }

  /**
   * 모든 메모리 조회
   */
  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * 타입별 메모리 조회
   */
  getByType(type: MemoryEntry['type']): MemoryEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  /**
   * 특정 항목 삭제
   */
  remove(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index !== -1) {
      this.entries.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 전체 메모리 초기화
   */
  clear(): number {
    const count = this.entries.length;
    this.entries = [];
    logger.info('Session memory cleared');
    return count;
  }

  /**
   * 전문가에게 전달할 컨텍스트 문자열 생성
   */
  getContextForExpert(): string {
    if (this.entries.length === 0) {
      return '';
    }

    const sections: string[] = [];

    // 목표/요구사항
    const goals = this.getByType('goal');
    if (goals.length > 0) {
      sections.push('## 프로젝트 목표\n' + goals.map(g => `- ${g.content}`).join('\n'));
    }

    // 주요 결정사항
    const decisions = this.getByType('decision');
    if (decisions.length > 0) {
      sections.push('## 결정사항\n' + decisions.map(d => `- ${d.content}`).join('\n'));
    }

    // 일반 컨텍스트
    const contexts = this.getByType('context');
    if (contexts.length > 0) {
      sections.push('## 추가 컨텍스트\n' + contexts.map(c => `- ${c.content}`).join('\n'));
    }

    // 이전 전문가 응답 (최근 5개만)
    const expertResponses = this.getByType('expert_response').slice(-5);
    if (expertResponses.length > 0) {
      sections.push('## 이전 전문가 응답\n' + expertResponses.map(e =>
        `### ${e.source}\n${e.content}`
      ).join('\n\n'));
    }

    return sections.join('\n\n');
  }

  /**
   * 메모리 통계
   */
  getStats() {
    return {
      total: this.entries.length,
      byType: {
        goal: this.getByType('goal').length,
        decision: this.getByType('decision').length,
        context: this.getByType('context').length,
        expert_response: this.getByType('expert_response').length
      },
      maxEntries: this.maxEntries
    };
  }
}

// 싱글톤 인스턴스
export const sessionMemory = new SessionMemory();
