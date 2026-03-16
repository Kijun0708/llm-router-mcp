// src/dashboard-server/port-finder.ts

import { createServer } from 'net';

/**
 * 사용 가능한 포트를 자동으로 찾습니다.
 */
export async function findAvailablePort(startPort = 9100, maxAttempts = 20): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  // 모든 포트 실패 시 OS에게 랜덤 포트 요청
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to find available port')));
      }
    });
    server.on('error', reject);
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}
