// src/utils/logger.ts

import { pino } from 'pino';

// MCP stdio 트랜스포트는 stdout을 JSON-RPC 전용으로 사용
// 로그는 반드시 stderr로 출력해야 프로토콜 충돌 방지
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
}, pino.destination(2));  // fd 2 = stderr

export function createExpertLogger(expertId: string) {
  return logger.child({ expert: expertId });
}
