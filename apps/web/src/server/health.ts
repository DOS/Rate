import { getRateClient } from '@/lib/rate-api';
import { createLogger } from '@/lib/logger';

const log = createLogger('health');

/** A probe that takes longer than this counts as a failure. */
export const DATABASE_CHECK_TIMEOUT_MS = 3_000;
/**
 * /api/health is public: one probe result is reused for this long per
 * instance, so the endpoint cannot be used to load the database.
 */
export const DATABASE_CHECK_TTL_MS = 15_000;

export type CheckStatus = 'ok' | 'error';

let cached: { status: CheckStatus; at: number } | null = null;
let inFlight: Promise<CheckStatus> | null = null;

async function probeDatabase(): Promise<CheckStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATABASE_CHECK_TIMEOUT_MS);
  try {
    // The pages' own client and key: a disabled or rotated key fails here
    // exactly as it fails for every uncached page (DOS/Rate#814).
    const { error } = await getRateClient()
      .from('categories')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);
    if (error) {
      log.error('database check failed', {
        message: controller.signal.aborted
          ? `timed out after ${DATABASE_CHECK_TIMEOUT_MS} ms`
          : error.message,
      });
      return 'error';
    }
    return 'ok';
  } catch (err) {
    log.error('database check failed', {
      message: controller.signal.aborted
        ? `timed out after ${DATABASE_CHECK_TIMEOUT_MS} ms`
        : err instanceof Error
          ? err.message
          : String(err),
    });
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the app can read the database with its own client. Concurrent
 * callers share one probe, and a result is reused for DATABASE_CHECK_TTL_MS.
 */
export async function checkDatabase(now = Date.now()): Promise<CheckStatus> {
  if (cached && now - cached.at < DATABASE_CHECK_TTL_MS) return cached.status;
  inFlight ??= probeDatabase().then((status) => {
    cached = { status, at: Date.now() };
    inFlight = null;
    return status;
  });
  return inFlight;
}

/** Tests only: forget the cached probe result. */
export function resetHealthCacheForTests(): void {
  cached = null;
  inFlight = null;
}
