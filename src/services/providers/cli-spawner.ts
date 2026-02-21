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

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...cleanEnv, ...env },
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let killed = false;

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdoutSize += chunk.length;
      if (stdoutSize <= maxBuffer) {
        stdout += chunk;
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
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
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      logger.error({ command, error: err.message }, 'CLI spawn error');
      reject(new Error(`CLI spawn failed: ${command} - ${err.message}`));
    });
  });
}
