import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request step timings for a `Server-Timing` header (DOS/Rate#1353), so a
 * slow API answer shows which database round trip took the time without
 * database access. Step names are fixed tokens chosen in code, never request
 * data, so the header carries no personal data. Outside
 * `collectServerTiming`, `timeStep` is a plain await.
 */
const requestSteps = new AsyncLocalStorage<Map<string, number>>();

const STEP_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Runs `work` and adds its duration to the step `name` of the request being
 * timed. A step run more than once (paged or chunked reads) sums; steps that
 * overlap each count their own wall time.
 */
export async function timeStep<T>(
  name: string,
  work: () => PromiseLike<T>
): Promise<T> {
  const steps = requestSteps.getStore();
  if (!steps) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    steps.set(name, (steps.get(name) ?? 0) + performance.now() - started);
  }
}

/** Runs `work` with step timing on; `header` adds a `total` step. */
export async function collectServerTiming<T>(
  work: () => Promise<T>
): Promise<{ result: T; header: string }> {
  const steps = new Map<string, number>();
  const started = performance.now();
  const result = await requestSteps.run(steps, work);
  steps.set('total', performance.now() - started);
  return { result, header: formatServerTiming(steps) };
}

/** `name;dur=12.3, …` in insertion order; a malformed entry is left out. */
export function formatServerTiming(steps: ReadonlyMap<string, number>): string {
  return [...steps]
    .filter(
      ([name, ms]) => STEP_NAME.test(name) && Number.isFinite(ms) && ms >= 0
    )
    .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
    .join(', ');
}
