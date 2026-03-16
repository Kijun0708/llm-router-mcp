// src/dashboard-server/event-sender.ts
// 다른 MCP 인스턴스의 대시보드 서버로 이벤트를 HTTP POST로 전송

import http from 'http';
import type { DashboardEvent } from './types.js';
import { logger } from '../utils/logger.js';

let targetPort = 9100;
let enabled = true;

export function setTargetPort(port: number): void {
  targetPort = port;
}

export function disableSending(): void {
  enabled = false;
}

export function sendEvent(event: DashboardEvent): void {
  if (!enabled) return;

  const data = JSON.stringify(event);
  const req = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    path: '/api/events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 2000,
  }, (res) => {
    res.resume(); // drain response
  });

  req.on('error', () => {
    // 대시보드 서버 미가동 시 무시 (non-fatal)
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.write(data);
  req.end();
}
