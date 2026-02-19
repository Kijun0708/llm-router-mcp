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
}

// 프로바이더별 세마포어 (lazy init)
const semaphores = new Map<string, Semaphore>();

export function getProviderSemaphore(
  provider: string,
  concurrencyConfig: Record<string, number>
): Semaphore {
  if (!semaphores.has(provider)) {
    const limit = concurrencyConfig[provider] || 5;
    semaphores.set(provider, new Semaphore(limit));
  }
  return semaphores.get(provider)!;
}
