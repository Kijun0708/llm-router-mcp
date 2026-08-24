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

  /**
   * 상한을 조정한다. 올리면 대기 중인 요청을 그만큼 깨운다.
   * 내리는 경우 이미 실행 중인 것은 건드리지 않고 다음 acquire부터 적용된다.
   */
  setLimit(next: number): void {
    if (next === this.maxConcurrent || next <= 0) return;
    const grew = next > this.maxConcurrent;
    this.maxConcurrent = next;
    if (!grew) return;
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.queue.shift()!();
    }
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
  } else if (limit !== undefined) {
    // 최초 생성 시점의 limit에 영구 고정되면 안 된다.
    // 예전에는 세마포어가 이미 있으면 limit 인자를 통째로 무시해서,
    // 어떤 경로가 먼저 기본값 5로 만들어 두면 config의 CONCURRENCY_AGY=10이
    // 영영 반영되지 않았다.
    sem.setLimit(limit);
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
