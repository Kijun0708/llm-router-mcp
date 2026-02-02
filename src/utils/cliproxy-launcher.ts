// src/utils/cliproxy-launcher.ts

import { spawn, ChildProcess } from 'child_process';
import { config, reloadConfig } from '../config.js';
import { logger } from './logger.js';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const vendorDir = path.join(projectRoot, 'vendor', 'cliproxy');

let cliproxyProcess: ChildProcess | null = null;
let activePort: number | null = null;

/**
 * 특정 포트가 사용 가능한지 확인
 */
async function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

/**
 * 사용 가능한 포트 찾기
 */
async function findAvailablePort(startPort: number, maxAttempts: number = 20): Promise<number | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

/**
 * CLIProxyAPI가 실행 중인지 확인 (포트 연결 테스트)
 */
async function isCliproxyRunning(port?: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(config.cliproxyUrl);
    const targetPort = port || parseInt(url.port);
    if (!targetPort) {
      resolve(false);
      return;
    }
    const host = url.hostname || '127.0.0.1';

    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(targetPort, host);
  });
}

/**
 * CLIProxyAPI 실행 파일 경로 찾기 (vendor 폴더 우선)
 */
function findCliproxyPath(): string | null {
  // 1. 번들된 vendor/cliproxy 폴더 우선 확인
  const bundledPath = path.join(vendorDir, 'cli-proxy-api.exe');
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // 2. 환경변수에서 경로 확인
  if (config.cliproxyPath && fs.existsSync(config.cliproxyPath)) {
    return config.cliproxyPath;
  }

  // 3. 기타 경로들 확인
  const possiblePaths = [
    path.resolve(process.cwd(), '../CLIProxyAPI_6.6.102_windows_amd64/cli-proxy-api.exe'),
    path.resolve(process.env.USERPROFILE || '', 'CLIProxyAPI/cli-proxy-api.exe'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * config.yaml 자동 생성 (없을 경우)
 */
function ensureConfigYaml(cliproxyDir: string): void {
  const configPath = path.join(cliproxyDir, 'config.yaml');
  const examplePath = path.join(cliproxyDir, 'config.example.yaml');

  if (!fs.existsSync(configPath) && fs.existsSync(examplePath)) {
    logger.info('Creating config.yaml from example...');
    fs.copyFileSync(examplePath, configPath);
  }
}

/**
 * config.yaml의 포트 업데이트
 */
function updateConfigPort(cliproxyDir: string, port: number): void {
  const configPath = path.join(cliproxyDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, 'utf-8');
    content = content.replace(/^port:\s*\d+/m, `port: ${port}`);
    fs.writeFileSync(configPath, content);
    logger.info({ port }, 'Updated config.yaml port');
  }
}

/**
 * 현재 활성 포트 가져오기
 */
export function getActivePort(): number | null {
  return activePort;
}

/**
 * 현재 활성 URL 가져오기
 */
export function getActiveUrl(): string {
  if (activePort) {
    return `http://127.0.0.1:${activePort}`;
  }
  return config.cliproxyUrl;
}

/**
 * CLIProxyAPI가 준비될 때까지 대기
 */
async function waitForCliproxy(port: number, maxAttempts: number = 10, delayMs: number = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isCliproxyRunning(port)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * config.yaml에서 현재 설정된 포트 읽기
 */
function getConfigPort(cliproxyDir: string): number | null {
  const configPath = path.join(cliproxyDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/^port:\s*(\d+)/m);
    if (match) {
      return parseInt(match[1]);
    }
  }
  // CLIPROXY_URL 환경변수에서 포트 추출 시도
  if (config.cliproxyUrl) {
    try {
      const url = new URL(config.cliproxyUrl);
      if (url.port) {
        return parseInt(url.port);
      }
    } catch {
      // URL 파싱 실패 시 null 반환
    }
  }
  return null;
}

/**
 * CLIProxyAPI 자동 시작 (포트 자동 탐색 포함)
 * @returns 성공 여부
 */
export async function ensureCliproxyRunning(): Promise<boolean> {
  // 1. 실행 파일 경로 찾기
  const cliproxyPath = findCliproxyPath();
  if (!cliproxyPath) {
    logger.warn('CLIProxyAPI executable not found. Please set CLIPROXY_PATH environment variable or start CLIProxyAPI manually.');
    return false;
  }

  const cliproxyDir = path.dirname(cliproxyPath);

  // 2. config.yaml 자동 생성
  ensureConfigYaml(cliproxyDir);

  // 3. 현재 설정된 포트 확인
  let targetPort = getConfigPort(cliproxyDir);
  if (!targetPort) {
    logger.error('포트가 설정되지 않았습니다. CLIPROXY_URL 환경변수 또는 config.yaml을 확인하세요.');
    return false;
  }
  logger.info({ port: targetPort }, 'Checking configured port...');

  // 4. 이미 실행 중인지 확인
  if (await isCliproxyRunning(targetPort)) {
    logger.info({ port: targetPort }, 'CLIProxyAPI is already running');
    activePort = targetPort;
    return true;
  }

  // 5. 포트가 다른 프로세스에 의해 사용 중인지 확인
  const portAvailable = await isPortAvailable(targetPort);
  if (!portAvailable) {
    logger.warn({ port: targetPort }, 'Port is in use by another process, finding available port...');
    const newPort = await findAvailablePort(targetPort + 1);

    if (!newPort) {
      logger.error('No available port found');
      return false;
    }

    logger.info({ oldPort: targetPort, newPort }, 'Switching to available port');
    updateConfigPort(cliproxyDir, newPort);
    targetPort = newPort;
  }

  // 6. CLIProxyAPI 시작
  logger.info({ path: cliproxyPath, port: targetPort }, 'Starting CLIProxyAPI...');

  try {
    cliproxyProcess = spawn(cliproxyPath, [], {
      cwd: cliproxyDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    // 부모 프로세스와 분리
    cliproxyProcess.unref();

    // 7. 시작 대기
    const started = await waitForCliproxy(targetPort, 15, 500);

    if (started) {
      activePort = targetPort;
      logger.info({ port: targetPort }, 'CLIProxyAPI started successfully');

      // config 재로드하여 새 포트 반영
      reloadConfig(targetPort);

      return true;
    } else {
      logger.error({ port: targetPort }, 'CLIProxyAPI failed to start within timeout');
      return false;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to start CLIProxyAPI');
    return false;
  }
}

/**
 * CLIProxyAPI 프로세스 정리 (필요시)
 */
export function cleanupCliproxy(): void {
  if (cliproxyProcess && !cliproxyProcess.killed) {
    cliproxyProcess.kill();
    cliproxyProcess = null;
  }
}
