// src/services/providers/cli-spawner.ts

import { spawn } from 'child_process';
import { logger } from '../../utils/logger.js';

export interface SpawnOptions {
  timeoutMs: number;
  stdin?: string;
  env?: Record<string, string>;
  maxBuffer?: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const MAX_STDERR_SIZE = 1 * 1024 * 1024; // 1MB - stderr 제한
const NODE_HEAP_SIZE = 8192; // 8GB - 자식 프로세스 힙 크기

export async function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<SpawnResult> {
  const { timeoutMs, stdin, env, maxBuffer = DEFAULT_MAX_BUFFER } = options;

  return new Promise((resolve, reject) => {
    // Claude Code 중첩 세션 방지 환경 변수 제거
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { CLAUDECODE, ...cleanEnv } = process.env;

    // 자식 프로세스 힙 크기 증가 (Gemini CLI OOM 방지)
    const existingNodeOptions = cleanEnv.NODE_OPTIONS || '';
    const heapOption = `--max-old-space-size=${NODE_HEAP_SIZE}`;
    const nodeOptions = existingNodeOptions.includes('--max-old-space-size')
      ? existingNodeOptions
      : `${existingNodeOptions} ${heapOption}`.trim();

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...cleanEnv, ...env, NODE_OPTIONS: nodeOptions },
      shell: true,
      windowsHide: true,
    });

    // Buffer 배열 방식으로 변경 - O(n) 메모리 사용 (문자열 연결은 O(n²))
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let killed = false;

    proc.stdout.on('data', (data: Buffer) => {
      if (stdoutSize < maxBuffer) {
        stdoutChunks.push(data);
        stdoutSize += data.length;
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      if (stderrSize < MAX_STDERR_SIZE) {
        stderrChunks.push(data);
        stderrSize += data.length;
      }
    });

    // stdin으로 프롬프트 전달 (긴 프롬프트용)
    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      // Windows에서 SIGTERM이 안 먹을 수 있으므로 SIGKILL 예비
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (killed) {
        reject(new Error(`CLI timeout: ${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      // 마지막에 한 번만 Buffer 연결 (메모리 효율적)
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      logger.error({ command, error: err.message }, 'CLI spawn error');
      reject(new Error(`CLI spawn failed: ${command} - ${err.message}`));
    });
  });
}
