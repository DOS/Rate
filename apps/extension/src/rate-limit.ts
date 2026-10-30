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

/** A product's pill retries on its own this many times in a row after a 429. */
export const MAX_RATE_LIMIT_AUTO_RETRIES = 3;

export interface RetryTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/**
 * Looks the page's product up again once a 429's wait is over, so its pill comes back
 * without a navigation. The retry belongs to one product: a new product drops it, and
 * after MAX_RATE_LIMIT_AUTO_RETRIES 429s in a row the shopper retries by hand.
 */
export class RateLimitRetry {
  private handle: unknown = null;
  private signature = '';
  private attempts = 0;

  constructor(
    private readonly timers: RetryTimers = {
      set: (run, ms) => setTimeout(run, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }
  ) {}

  /** The page now shows this product; a retry planned for another one is dropped. */
  track(signature: string): void {
    if (signature === this.signature) return;
    this.cancel();
    this.signature = signature;
    this.attempts = 0;
  }

  cancel(): void {
    if (this.handle != null) this.timers.clear(this.handle);
    this.handle = null;
  }

  /**
   * After this product's lookup answered: plans a retry for a 429 and returns its delay
   * in ms, or null when none is planned.
   */
  after(
    signature: string,
    response: {
      ok?: boolean;
      status?: number | null;
      retryAfterSeconds?: number;
    },
    retry: () => void
  ): number | null {
    this.cancel();
    if (signature !== this.signature) return null;
    if (response?.ok !== false || response.status !== 429) {
      this.attempts = 0;
      return null;
    }
    if (this.attempts >= MAX_RATE_LIMIT_AUTO_RETRIES) return null;
    this.attempts += 1;
    const wait = response.retryAfterSeconds;
    const seconds =
      typeof wait === 'number' && Number.isFinite(wait) && wait >= 0
        ? Math.min(wait, MAX_RATE_LIMIT_COOLDOWN_SECONDS)
        : DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
    // One second past the wait, so a wait of 0 still retries.
    const delayMs = (seconds + 1) * 1000;
    this.handle = this.timers.set(() => {
      this.handle = null;
      if (this.signature === signature) retry();
    }, delayMs);
    return delayMs;
  }
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
  // Bumped by clear(), so a store read that began before it is ignored.
  private generation = 0;

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
    const generation = this.generation;
    let stored: unknown;
    try {
      stored = await this.store.get();
    } catch {
      stored = undefined;
    }
    if (generation !== this.generation) stored = undefined;
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
    this.generation += 1;
    this.untilMs = 0;
    try {
      await this.store.set(0);
    } catch {
      // Nothing stored to clear.
    }
  }
}
