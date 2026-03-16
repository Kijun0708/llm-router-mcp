// src/dashboard-server/index.ts

import { createServer as createNetServer } from 'net';
import { createHttpServer } from './http-server.js';
import { initWebSocket, shutdownWebSocket } from './ws-broadcaster.js';
import {
  startEventCollector,
  startEventCollectorSenderMode,
  stopEventCollector,
  setEmitFunction,
} from './event-collector.js';
import { sendEvent, setTargetPort } from './event-sender.js';
import { logger } from '../utils/logger.js';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Server } from 'http';

let httpServer: Server | null = null;
let dashboardInfo: DashboardInfo | null = null;
let isPrimary = false;

export interface DashboardInfo {
  port: number;
  url: string;
  role: 'primary' | 'sender';
}

/** 포트 파일 경로 */
function getPortFilePath(): string {
  const dir = join(homedir(), '.custommcp');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'dashboard-port');
}

/** 포트가 사용 가능한지 확인 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

/**
 * Primary 모드: HTTP + WS + Event Collector 서버 시작
 */
async function startAsPrimary(port: number): Promise<DashboardInfo> {
  httpServer = createHttpServer();
  initWebSocket(httpServer);
  startEventCollector();
  isPrimary = true;

  return new Promise((resolve, reject) => {
    httpServer!.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      dashboardInfo = { port, url, role: 'primary' };

      // 포트 파일에 저장
      try {
        writeFileSync(getPortFilePath(), `${port}\n${url}`, 'utf-8');
      } catch {}

      logger.info({ port, url, role: 'primary' }, 'Dashboard server started (primary)');
      resolve({ port, url, role: 'primary' });
    });

    httpServer!.on('error', (err) => {
      logger.error({ error: err.message }, 'Dashboard server failed to start');
      reject(err);
    });
  });
}

/**
 * Sender 모드: HTTP POST로 이벤트를 기존 Primary 대시보드에 전송
 */
function startAsSender(port: number): DashboardInfo {
  setTargetPort(port);
  setEmitFunction(sendEvent);
  startEventCollectorSenderMode();
  isPrimary = false;

  const url = `http://127.0.0.1:${port}`;
  dashboardInfo = { port, url, role: 'sender' };

  logger.info({ port, url, role: 'sender' }, 'Dashboard event sender started (forwarding to primary)');
  return { port, url, role: 'sender' };
}

/**
 * 대시보드 서버 시작 (싱글턴 패턴)
 * - 포트 9100이 비어있으면 Primary로 시작
 * - 포트가 사용 중이면 Sender로 시작
 */
export async function startDashboardServer(): Promise<DashboardInfo> {
  const fixedPort = parseInt(process.env.DASHBOARD_PORT || '0') || 9100;

  const available = await isPortAvailable(fixedPort);

  if (available) {
    return startAsPrimary(fixedPort);
  } else {
    return startAsSender(fixedPort);
  }
}

/**
 * 대시보드 서버 종료
 */
export function shutdownDashboardServer(): void {
  stopEventCollector();

  if (isPrimary) {
    shutdownWebSocket();
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }

    // 포트 파일 정리 (Primary만)
    try {
      unlinkSync(getPortFilePath());
    } catch {}
  }

  dashboardInfo = null;
  logger.info({ role: isPrimary ? 'primary' : 'sender' }, 'Dashboard server stopped');
}

/**
 * 현재 대시보드 정보 반환 (health check 등에서 사용)
 */
export function getDashboardInfo(): DashboardInfo | null {
  return dashboardInfo;
}
