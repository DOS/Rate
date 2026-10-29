import { createLogger } from '@/lib/logger';

const log = createLogger('render-timing');

export interface RenderTiming {
  /** Records how long `read` takes under `name`, and returns it unchanged. */
  time<T>(name: string, read: Promise<T>): Promise<T>;
  /**
   * Writes one log line with the total, every read settled so far and the
   * names of those still running. Only the first call writes.
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
  const pending = new Set<string>();
  let logged = false;
  return {
    time(name, read) {
      const begun = performance.now();
      pending.add(name);
      const record = () => {
        const ms = Math.round(performance.now() - begun);
        pending.delete(name);
        // A read still running at done() (a streamed section) gets a line
        // of its own when it settles.
        if (logged) log.info('render read', { route, key, read: name, ms });
        else reads[name] = ms;
      };
      read.then(record, record);
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
        pending: [...pending],
      });
    },
  };
}
