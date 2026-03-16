// src/session.ts
// 각 MCP 프로세스의 고유 세션 ID
export const SESSION_ID = `s_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
