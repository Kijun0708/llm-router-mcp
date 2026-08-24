// src/services/providers/cli-spawner.ts

import { spawn, spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { logger } from '../../utils/logger.js';
import { ClassifiedError } from '../../utils/errors.js';

export interface SpawnOptions {
  timeoutMs: number;
  stdin?: string;
  env?: Record<string, string>;
  maxBuffer?: number;
  /**
   * false면 실행 파일을 직접 실행 (cmd.exe 경유 없음).
   * agy는 prompt argv에 백슬래시 경로/줄바꿈이 들어가 cmd quoting이 깨지므로 false 필요.
   */
  shell?: boolean;
  /**
   * NODE_OPTIONS로 자식 힙을 키운다. Gemini CLI(Node) 시절 OOM 대책이었고,
   * agy.exe(Go) / codex(네이티브)에는 무의미하다. 기본 false.
   */
  injectNodeOptions?: boolean;
  /** 로그 식별용. */
  label?: string;
  /** 자식 프로세스 작업 디렉터리. 미지정 시 부모 cwd 상속. */
  cwd?: string;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** 버퍼 상한에 걸려 출력이 잘렸는가. 잘리면 JSON 봉투 파싱이 파괴된다. */
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const MAX_STDERR_SIZE = 1 * 1024 * 1024; // 1MB
const NODE_HEAP_SIZE = 8192;
const SIGKILL_GRACE_MS = 5000;

/**
 * Windows에서 프로세스 트리를 강제 종료한다.
 * proc.kill('SIGTERM')은 win32에서 자손을 죽이지 못한다. agy도 codex도 자식을 낳으므로,
 * 이게 없으면 타임아웃된 15분짜리 호출이 고아로 남아 계속 한도를 태운다.
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } catch (err) {
    logger.debug({ pid, err: (err as Error).message }, 'taskkill failed');
  }
}

export async function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<SpawnResult> {
  const {
    timeoutMs,
    stdin,
    env,
    maxBuffer = DEFAULT_MAX_BUFFER,
    shell = true,
    injectNodeOptions = false,
    label = command,
    cwd,
  } = options;

  const startedAt = Date.now();

  // 존재하지 않는 cwd를 넘기면 Node가 **명령어**에 대한 ENOENT로 보고한다.
  // ("spawn C:\...\agy.exe ENOENT" — 실제로는 작업 디렉터리가 없는 것)
  // 원인을 정반대로 가리키므로 여기서 걸러내고 부모 cwd를 상속시킨다.
  let effectiveCwd: string | undefined;
  if (cwd) {
    try {
      if (existsSync(cwd) && statSync(cwd).isDirectory()) {
        effectiveCwd = cwd;
      } else {
        logger.warn({ label, cwd }, 'Requested cwd does not exist, inheriting parent cwd');
      }
    } catch (err) {
      logger.warn({ label, cwd, err: (err as Error).message }, 'Failed to stat requested cwd, inheriting parent cwd');
    }
  }

  return new Promise((resolve, reject) => {
    // Claude Code 중첩 세션 감지 회피
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { CLAUDECODE, ...cleanEnv } = process.env;

    const childEnv: Record<string, string | undefined> = { ...cleanEnv, ...env };

    if (injectNodeOptions) {
      const existing = cleanEnv.NODE_OPTIONS || '';
      const heapOption = `--max-old-space-size=${NODE_HEAP_SIZE}`;
      childEnv.NODE_OPTIONS = existing.includes('--max-old-space-size')
        ? existing
        : `${existing} ${heapOption}`.trim();
    }

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
      shell,
      windowsHide: true,
      ...(effectiveCwd ? { cwd: effectiveCwd } : {}),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let killed = false;
    let settled = false;

    proc.stdout.on('data', (data: Buffer) => {
      if (stdoutSize < maxBuffer) {
        stdoutChunks.push(data);
        stdoutSize += data.length;
      } else {
        stdoutTruncated = true;
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      if (stderrSize < MAX_STDERR_SIZE) {
        stderrChunks.push(data);
        stderrSize += data.length;
      } else {
        stderrTruncated = true;
      }
    });

    // 자식이 stdin을 다 읽기 전에 죽으면 EPIPE가 미처리 'error' 이벤트가 되어
    // 부모 프로세스까지 죽는다. argv를 거부한 codex exec - 에서 실제로 발생 가능.
    proc.stdin.on('error', (err) => {
      logger.debug({ label, err: (err as Error).message }, 'CLI stdin closed early');
    });

    if (stdin) {
      proc.stdin.write(stdin);
    }
    // stdin이 없어도 반드시 end() — 안 그러면 CLI가 대화형으로 빠진다.
    proc.stdin.end();

    let killTimer: NodeJS.Timeout | undefined;

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch { /* ignore */ }
        if (process.platform === 'win32') killTree(proc.pid);
      }, SIGKILL_GRACE_MS);
      // resolve 이후 이벤트 루프를 붙들지 않도록
      killTimer.unref?.();
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (killTimer) clearTimeout(killTimer);
    };

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (killed) {
        if (process.platform === 'win32') killTree(proc.pid);
        reject(
          new ClassifiedError(
            'timeout',
            `CLI timeout: ${label} timed out after ${Math.round(timeoutMs / 1000)}s`
          )
        );
        return;
      }

      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        exitCode: code ?? 1,
        stdoutTruncated,
        stderrTruncated,
        durationMs: Date.now() - startedAt,
      });
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      logger.error({ label, command, error: err.message }, 'CLI spawn error');
      reject(new ClassifiedError('network', `CLI spawn failed: ${label} - ${err.message}`));
    });
  });
}
