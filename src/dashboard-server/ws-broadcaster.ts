// src/dashboard-server/ws-broadcaster.ts

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { DashboardEvent, DashboardState } from './types.js';
import { logger } from '../utils/logger.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

const PING_INTERVAL_MS = 30000;
let pingTimer: ReturnType<typeof setInterval> | null = null;

export function initWebSocket(httpServer: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.debug({ clientCount: clients.size }, 'Dashboard WS client connected');

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug({ clientCount: clients.size }, 'Dashboard WS client disconnected');
    });

    ws.on('error', (err) => {
      logger.warn({ error: err.message }, 'Dashboard WS client error');
      clients.delete(ws);
    });
  });

  // Keepalive ping
  pingTimer = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clients.delete(ws);
      }
    }
  }, PING_INTERVAL_MS);

  return wss;
}

/**
 * 모든 연결된 클라이언트에 이벤트 브로드캐스트
 */
export function broadcast(event: DashboardEvent): void {
  if (clients.size === 0) return;

  const data = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * 특정 클라이언트에 전체 상태 스냅샷 전송
 */
export function sendSnapshot(ws: WebSocket, state: DashboardState): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const event: DashboardEvent = {
    type: 'state_snapshot',
    timestamp: new Date().toISOString(),
    data: state as unknown as Record<string, unknown>,
  };
  ws.send(JSON.stringify(event));
}

/**
 * 새 클라이언트 연결 시 스냅샷 전송하도록 콜백 등록
 */
export function onNewClient(callback: (ws: WebSocket) => void): void {
  if (!wss) return;
  const originalHandler = wss.listeners('connection')[0] as (ws: WebSocket) => void;
  wss.removeAllListeners('connection');
  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.debug({ clientCount: clients.size }, 'Dashboard WS client connected');

    ws.on('close', () => {
      clients.delete(ws);
    });
    ws.on('error', () => {
      clients.delete(ws);
    });

    callback(ws);
  });
}

export function shutdownWebSocket(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  for (const ws of clients) {
    ws.close();
  }
  clients.clear();
  if (wss) {
    wss.close();
    wss = null;
  }
}
