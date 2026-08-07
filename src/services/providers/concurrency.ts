// src/services/providers/concurrency.ts

export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get inFlight(): number {
    return this.running;
  }

  get waiting(): number {
    return this.queue.length;
  }

  get limit(): number {
    return this.maxConcurrent;
  }
}

const DEFAULT_LIMIT = 5;

/**
 * 키별 세마포어 (lazy init).
 * 키는 프로바이더 id('agy') 또는 프로바이더:모델('agy:gemini-3.1-pro-high') 둘 다 쓴다.
 * model-chain이 두 단계를 겹쳐 잡아 "프로바이더 총량"과 "모델별 상한"을 동시에 건다.
 */
const semaphores = new Map<string, Semaphore>();

export function getSemaphore(key: string, limit?: number): Semaphore {
  let sem = semaphores.get(key);
  if (!sem) {
    sem = new Semaphore(limit ?? DEFAULT_LIMIT);
    semaphores.set(key, sem);
  }
  return sem;
}

/** 대시보드/health용 스냅샷. */
export function semaphoreSnapshot(): Array<{ key: string; inFlight: number; waiting: number; limit: number }> {
  return [...semaphores].map(([key, s]) => ({
    key,
    inFlight: s.inFlight,
    waiting: s.waiting,
    limit: s.limit,
  }));
}

/** 테스트 전용. */
export function resetSemaphores(): void {
  semaphores.clear();
}
