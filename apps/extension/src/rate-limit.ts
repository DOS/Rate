/**
 * The lookup's rate-limit cooldown (DOS/Rate#1466). The API answers a lookup over its limit
 * with 429, `code: RATE_LIMIT_EXCEEDED` and `Retry-After` (seconds); the extension sends no
 * lookup until that time has passed, and tells the shopper how long to wait. Any 429 holds
 * lookups, with or without the code (a CDN's too), for its Retry-After or the default.
 */

/** A 429 that names no wait still holds lookups this long. */
export const DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 60;
/** A server can ask for no longer than this. */
export const MAX_RATE_LIMIT_COOLDOWN_SECONDS = 600;

/**
 * The seconds a `Retry-After` header asks to wait: delta-seconds ("60", any number of
 * digits) or an HTTP date, capped at MAX_RATE_LIMIT_COOLDOWN_SECONDS. Null when it is
 * missing or unreadable.
 */
export function parseRetryAfterSeconds(
  header: string | null | undefined,
  nowMs: number
): number | null {
  if (typeof header !== 'string') return null;
  const value = header.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
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

/** Where the cooldown deadline survives a restarted service worker. */
export interface CooldownStore {
  get(): Promise<unknown>;
  set(untilMs: number): Promise<void>;
}

/**
 * One cooldown deadline shared by every lookup. Deadlines only ever extend (the latest of
 * a stored one, an in-memory one and a new 429's), so a stale read or a later, shorter
 * Retry-After never shortens a wait; a deadline further away than the cap (a clock moved
 * back, a corrupt value) is dropped, so nothing waits longer than the cap.
 */
export class LookupCooldown {
  private untilMs = 0;

  constructor(
    private readonly store: CooldownStore,
    private readonly now: () => number = Date.now
  ) {}

  private sane(untilMs: number, nowMs: number): number {
    return Number.isFinite(untilMs) &&
      untilMs - nowMs <= MAX_RATE_LIMIT_COOLDOWN_SECONDS * 1000
      ? untilMs
      : 0;
  }

  /** Seconds before lookups may resume; 0 when they may go now. */
  async secondsLeft(): Promise<number> {
    let stored: unknown;
    try {
      stored = await this.store.get();
    } catch {
      stored = undefined;
    }
    const nowMs = this.now();
    this.untilMs = Math.max(
      this.sane(this.untilMs, nowMs),
      typeof stored === 'number' ? this.sane(stored, nowMs) : 0
    );
    return cooldownSecondsLeft(this.untilMs, nowMs);
  }

  /** Holds lookups after a 429, per its Retry-After; returns the seconds to wait. */
  async hold(retryAfterHeader: string | null | undefined): Promise<number> {
    const nowMs = this.now();
    this.untilMs = Math.max(
      this.sane(this.untilMs, nowMs),
      rateLimitedUntilMs(retryAfterHeader, nowMs)
    );
    try {
      await this.store.set(this.untilMs);
    } catch {
      // The in-memory deadline still holds this worker.
    }
    return cooldownSecondsLeft(this.untilMs, nowMs);
  }

  /** Lets lookups go at once (another server was chosen). */
  async clear(): Promise<void> {
    this.untilMs = 0;
    try {
      await this.store.set(0);
    } catch {
      // Nothing stored to clear.
    }
  }
}
