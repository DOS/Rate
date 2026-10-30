/**
 * The lookup's rate-limit cooldown (DOS/Rate#1466). The API answers a lookup over its limit
 * with 429, `code: RATE_LIMIT_EXCEEDED` and `Retry-After` (seconds); the extension sends no
 * lookup until that time has passed, and tells the shopper how long to wait.
 */

/** A 429 that names no wait still holds lookups this long. */
export const DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 60;
/** A server can ask for no longer than this. */
export const MAX_RATE_LIMIT_COOLDOWN_SECONDS = 600;

/**
 * The seconds a `Retry-After` header asks to wait: delta-seconds ("60") or an HTTP date,
 * capped at MAX_RATE_LIMIT_COOLDOWN_SECONDS. Null when it is missing or unreadable.
 */
export function parseRetryAfterSeconds(
  header: string | null | undefined,
  nowMs: number
): number | null {
  if (typeof header !== 'string') return null;
  const value = header.trim();
  if (!value) return null;
  if (/^\d{1,6}$/.test(value)) {
    return Math.min(Number(value), MAX_RATE_LIMIT_COOLDOWN_SECONDS);
  }
  // An HTTP date names its weekday and month; a bare "-5" or "1.5" is no date.
  if (!/[a-z]/i.test(value)) return null;
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  const seconds = Math.ceil((dateMs - nowMs) / 1000);
  return Math.min(Math.max(seconds, 0), MAX_RATE_LIMIT_COOLDOWN_SECONDS);
}

/** When lookups may resume after a 429: now plus the asked (or default) wait. */
export function rateLimitedUntilMs(
  retryAfterHeader: string | null | undefined,
  nowMs: number
): number {
  const seconds =
    parseRetryAfterSeconds(retryAfterHeader, nowMs) ??
    DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  return nowMs + seconds * 1000;
}

/** Whole seconds left before `untilMs`, or 0 once it has passed. */
export function cooldownSecondsLeft(untilMs: unknown, nowMs: number): number {
  if (typeof untilMs !== 'number' || !Number.isFinite(untilMs)) return 0;
  const left = Math.ceil((untilMs - nowMs) / 1000);
  return left > 0 ? Math.min(left, MAX_RATE_LIMIT_COOLDOWN_SECONDS) : 0;
}
