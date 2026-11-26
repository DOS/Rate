/**
 * Keyset pagination cursor utilities for `rate.reviews` (`created_at DESC, id DESC`).
 */

export interface ReviewKeysetCursor {
  createdAt: string;
  id: string;
}

const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_TOKEN_RE = /^[A-Za-z0-9_-]{1,512}$/;
const CTRL_OR_WS_RE = /[\s\p{Cc}]/u;

function trimEdgeControlAndWhitespaceLocal(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && CTRL_OR_WS_RE.test(raw[start]!)) {
    start += 1;
  }
  while (end > start && CTRL_OR_WS_RE.test(raw[end - 1]!)) {
    end -= 1;
  }
  return start === 0 && end === raw.length ? raw : raw.slice(start, end);
}

/**
 * Validates and normalizes an ISO-8601 / RFC-3339 timestamp without losing
 * sub-millisecond precision, rejecting impossible calendar dates like Feb 31.
 */
export function normalizeReviewTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = trimEdgeControlAndWhitespaceLocal(raw);
  if (
    !cleaned ||
    cleaned.length > 64 ||
    CTRL_OR_WS_RE.test(cleaned) ||
    !ISO_TIMESTAMP_RE.test(cleaned)
  ) {
    return null;
  }
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(5, 7));
  const day = Number(cleaned.slice(8, 10));
  const hour = Number(cleaned.slice(11, 13));
  const minute = Number(cleaned.slice(14, 16));
  const second = Number(cleaned.slice(17, 19));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  if (!cleaned.endsWith('Z')) {
    const tzHour = Number(cleaned.slice(-5, -3));
    const tzMin = Number(cleaned.slice(-2));
    if (tzHour > 23 || tzMin > 59) return null;
  }
  const ms = Date.parse(cleaned);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (cleaned.endsWith('+00:00') || cleaned.endsWith('-00:00')) {
    return `${cleaned.slice(0, -6)}Z`;
  }
  return cleaned;
}

function subMillisecondNanos(ts: string): number {
  const dotIdx = ts.indexOf('.');
  if (dotIdx === -1) return 0;
  let endIdx = dotIdx + 1;
  while (
    endIdx < ts.length &&
    ts.charCodeAt(endIdx) >= 48 &&
    ts.charCodeAt(endIdx) <= 57
  ) {
    endIdx += 1;
  }
  const frac = ts.slice(dotIdx + 1, endIdx);
  if (frac.length <= 3) return 0;
  const subMs = frac.slice(3, 9).padEnd(6, '0');
  const parsed = Number(subMs);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTimestampDesc(aRaw: unknown, bRaw: unknown): number {
  const aTs = normalizeReviewTimestamp(aRaw);
  const bTs = normalizeReviewTimestamp(bRaw);
  const aMs = aTs ? Date.parse(aTs) : Date.parse(String(aRaw ?? '')) || 0;
  const bMs = bTs ? Date.parse(bTs) : Date.parse(String(bRaw ?? '')) || 0;
  if (aMs !== bMs) return bMs - aMs;
  const aSub = aTs ? subMillisecondNanos(aTs) : 0;
  const bSub = bTs ? subMillisecondNanos(bTs) : 0;
  return bSub - aSub;
}

/**
 * Total descending order on `(created_at DESC, id DESC)`, matching the
 * PostgREST query order used for keyset pagination.
 */
export function compareReviewOrderDesc(
  a: { created_at?: unknown; id?: unknown },
  b: { created_at?: unknown; id?: unknown }
): number {
  const tsCmp = compareTimestampDesc(a?.created_at, b?.created_at);
  if (tsCmp !== 0) return tsCmp;
  const aId = typeof a?.id === 'string' ? a.id.trim().toLowerCase() : '';
  const bId = typeof b?.id === 'string' ? b.id.trim().toLowerCase() : '';
  if (aId === bId) return 0;
  return bId > aId ? 1 : -1;
}

/**
 * Returns true when `row` falls strictly after `cursor` in `(created_at DESC, id DESC)` order.
 */
export function isAfterReviewCursor(
  row: { created_at?: unknown; id?: unknown },
  cursor: ReviewKeysetCursor | null | undefined
): boolean {
  if (!cursor) return true;
  return (
    compareReviewOrderDesc(row, {
      created_at: cursor.createdAt,
      id: cursor.id,
    }) > 0
  );
}

/**
 * Encodes a review's `(created_at, id)` pair as an opaque base64url cursor.
 * Returns null if the row lacks a valid timestamp or UUID id.
 */
export function encodeReviewCursor(
  row: { created_at?: unknown; id?: unknown } | null | undefined
): string | null {
  if (!row || typeof row !== 'object') return null;
  const createdAt = normalizeReviewTimestamp(row.created_at);
  const rawId = typeof row.id === 'string' ? row.id.trim() : '';
  if (!createdAt || !UUID_RE.test(rawId)) return null;
  const payload = JSON.stringify({
    v: 1,
    c: createdAt,
    i: rawId.toLowerCase(),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes and strictly validates an incoming `?cursor=` token.
 * Returns null on malformed, oversized, non-base64url, or invalid payloads.
 */
export function parseReviewCursor(raw: unknown): ReviewKeysetCursor | null {
  if (typeof raw !== 'string') return null;
  const cleaned = trimEdgeControlAndWhitespaceLocal(raw);
  if (
    !cleaned ||
    cleaned.length > 512 ||
    CTRL_OR_WS_RE.test(cleaned) ||
    !BASE64URL_TOKEN_RE.test(cleaned)
  ) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cleaned, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!decoded || decoded.length > 512) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (
    keys.length !== 3 ||
    !Object.hasOwn(obj, 'v') ||
    !Object.hasOwn(obj, 'c') ||
    !Object.hasOwn(obj, 'i')
  ) {
    return null;
  }
  if (obj.v !== 1) return null;
  const createdAt = normalizeReviewTimestamp(obj.c);
  if (!createdAt) return null;
  if (typeof obj.i !== 'string' || !UUID_RE.test(obj.i)) return null;
  return {
    createdAt,
    id: obj.i.toLowerCase(),
  };
}
