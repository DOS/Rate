import { createLogger } from '@/lib/logger';

const log = createLogger('render-timing');

export interface RenderTiming {
  /** Records how long `read` takes under `name`, and returns it unchanged. */
  time<T>(name: string, read: Promise<T>): Promise<T>;
  /**
   * Writes the one log line of the render: the total, every read settled so
   * far, the reads that failed and those still running. Only the first call
   * writes.
   */
  done(): void;
}

/**
 * Per-read timings of one server render, logged as a single line. A cached
 * page is served without running its render, so only a cache miss or a
 * revalidation writes one (DOS/Rate#1344). `key` must be a public identifier
 * such as a product slug: nothing about the visitor is logged.
 */
export function startRenderTiming(route: string, key: string): RenderTiming {
  const start = performance.now();
  const reads: Record<string, number> = {};
  const failed: string[] = [];
  const pending = new Set<string>();
  let logged = false;
  return {
    time(name, read) {
      const begun = performance.now();
      pending.add(name);
      const settle = (ok: boolean) => () => {
        pending.delete(name);
        if (logged) return;
        reads[name] = Math.round(performance.now() - begun);
        if (!ok) failed.push(name);
      };
      read.then(settle(true), settle(false));
      return read;
    },
    done() {
      if (logged) return;
      logged = true;
      log.info('render reads', {
        route,
        key,
        totalMs: Math.round(performance.now() - start),
        reads,
        failed,
        pending: [...pending],
      });
    },
  };
}
