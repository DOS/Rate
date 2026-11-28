import { createHash } from 'node:crypto';
import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
} from './api-handler';

/**
 * Limits for `GET /api/v1/rate/reviews` (DOS/Rate#1961).
 *
 * First pages are served from the Next.js Data Cache and the CDN, so the
 * general 60/min per client only guards the cheap path. A request with
 * `?cursor=` skips the Data Cache (its key space would be unbounded), so it
 * reaches the database every time and gets its own, stricter limits.
 *
 * All three limiters are per server instance: Rate has no shared store yet
 * (a durable one needs JOY's choice of DB function or KV, see #1247). Until
 * then the global cursor ceiling bounds what one instance can be driven to
 * do, whatever keys a caller rotates through.
 */
export const REVIEWS_GET_LIMIT_PER_MINUTE = 60;
export const REVIEWS_CURSOR_LIMIT_PER_MINUTE = 20;
export const REVIEWS_CURSOR_GLOBAL_LIMIT_PER_MINUTE = 300;

export const reviewsGetRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: REVIEWS_GET_LIMIT_PER_MINUTE,
  maxBuckets: 5_000,
});

export const reviewsCursorRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: REVIEWS_CURSOR_LIMIT_PER_MINUTE,
  maxBuckets: 5_000,
});

export const reviewsCursorGlobalRateLimiter =
  new BoundedSlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: REVIEWS_CURSOR_GLOBAL_LIMIT_PER_MINUTE,
    maxBuckets: 1,
  });

/**
 * The rate-limit key of a review read. When no client IP header exists
 * (`anon`), callers are told apart by a hash of their `User-Agent` and
 * `Accept-Language` instead of all sharing one `anon` bucket, so one caller
 * cannot lock out the others. The hash is best-effort (a client sets its own
 * headers); the global cursor ceiling is the hard bound.
 */
export function reviewsRateLimitKey(
  headers: Pick<Headers, 'get'> | null | undefined
): string {
  const key = extractClientRateLimitKey(headers);
  if (key !== 'anon' || !headers || typeof headers.get !== 'function') {
    return key;
  }
  const fingerprint = `${headers.get('user-agent') ?? ''}|${headers.get('accept-language') ?? ''}`;
  return `anon:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`;
}

export type ReviewsReadLimitVerdict =
  { allowed: true } | { allowed: false; message: string };

/**
 * Checks the limits for one review read. `cursor` is true for the uncached
 * keyset pages, which also count against the stricter per-client limit and
 * the instance-wide ceiling.
 */
export function checkReviewsReadLimit(
  clientKey: string,
  cursor: boolean
): ReviewsReadLimitVerdict {
  if (!reviewsGetRateLimiter.allow(clientKey)) {
    return {
      allowed: false,
      message: `Rate limit exceeded. Maximum ${REVIEWS_GET_LIMIT_PER_MINUTE} review reads per minute.`,
    };
  }
  if (!cursor) return { allowed: true };
  if (!reviewsCursorRateLimiter.allow(clientKey)) {
    return {
      allowed: false,
      message: `Rate limit exceeded. Maximum ${REVIEWS_CURSOR_LIMIT_PER_MINUTE} paginated review reads per minute.`,
    };
  }
  if (!reviewsCursorGlobalRateLimiter.allow('global')) {
    return {
      allowed: false,
      message: 'Paginated review reads are busy. Retry in a minute.',
    };
  }
  return { allowed: true };
}
