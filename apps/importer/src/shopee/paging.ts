import type { RateSupabaseClient } from './types.js';

export const DEFAULT_FETCH_ALL_MAX_PAGES = 500;
export const MAX_FETCH_ALL_PAGE_SIZE = 1000;
export const PAGE_ROWS = MAX_FETCH_ALL_PAGE_SIZE;
export const MAX_FETCH_ALL_PAGES_CEILING = 10_000;
export const MAX_SHOPEE_ENQUEUE_URL_LENGTH = 2048;
export const STRICT_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KeysetFilter = (
  query: ReturnType<ReturnType<RateSupabaseClient['from']>['select']>
) => unknown;

/**
 * Validates a strict canonical UUID (8-4-4-4-12 hex, no surrounding whitespace
 * or extra characters) for `--master` scoping and returns it lowercased.
 */
export function parseStrictMasterUuid(raw: unknown, flagName = '--master'): string {
  if (typeof raw !== 'string' || !STRICT_UUID_REGEX.test(raw)) {
    throw new Error(`${flagName} must be a valid UUID.`);
  }
  return raw.toLowerCase();
}

function parsePositivePagingInt(raw: unknown, fallback: number, max: number): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1) return fallback;
    return Math.min(max, Math.floor(raw));
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || /^0[xob]/i.test(cleaned)) return fallback;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(max, Math.floor(parsed));
  }
  return fallback;
}

/**
 * Reads every row of a query in pages. One PostgREST response stops at the
 * project's max-rows (1000 on Supabase) without an error, so full-table reads
 * in jobs must page. Pages advance by the rows actually returned, which also
 * works if max-rows is lowered; the query must have a deterministic order.
 *
 * Enforces a `maxPages` ceiling on non-empty pages so a server or mock that
 * ignores `.range(from, to)` cannot loop indefinitely.
 */
export async function fetchAllPages<T>(
  label: string,
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = MAX_FETCH_ALL_PAGE_SIZE,
  maxPages = DEFAULT_FETCH_ALL_MAX_PAGES
): Promise<T[]> {
  const safeLabel =
    typeof label === 'string'
      ? label
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, 160) || 'fetchAllPages'
      : 'fetchAllPages';
  const safePageSize = parsePositivePagingInt(
    pageSize,
    MAX_FETCH_ALL_PAGE_SIZE,
    MAX_FETCH_ALL_PAGE_SIZE
  );
  const safeMaxPages = parsePositivePagingInt(
    maxPages,
    DEFAULT_FETCH_ALL_MAX_PAGES,
    MAX_FETCH_ALL_PAGES_CEILING
  );
  if (typeof buildPage !== 'function') {
    throw new Error(`${safeLabel}: buildPage must be a function`);
  }
  const rows: T[] = [];
  let nonEmptyPages = 0;
  for (let from = 0; ;) {
    const pageRes = await buildPage(from, from + safePageSize - 1);
    const error = pageRes?.error ?? null;
    if (error) {
      const safeMsg =
        typeof error.message === 'string'
          ? error.message
              .replace(/\p{Cc}+/gu, ' ')
              .trim()
              .slice(0, 500) || 'unknown error'
          : 'unknown error';
      throw new Error(`${safeLabel}: ${safeMsg}`);
    }
    const data = pageRes?.data ?? null;
    const page = Array.isArray(data) ? data : [];
    if (page.length === 0) return rows;
    nonEmptyPages += 1;
    if (nonEmptyPages > safeMaxPages) {
      throw new Error(`${safeLabel}: exceeded maxPages (${safeMaxPages}) at offset ${from}`);
    }
    rows.push(...page);
    from += page.length;
  }
}

/**
 * Reads every row of a table, or of a filter on it, in pages of `pageSize`
 * (default `PAGE_ROWS = 1000`) keyed on `key` (keyset `.gt(key, last)`, not
 * `OFFSET`): each page costs the same however deep it is, concurrent writes
 * never shift boundary rows, and there is no 500-page OFFSET ceiling.
 * `columns` must include `key`.
 */
export async function fetchByKey<T>(
  supabase: RateSupabaseClient,
  table: string,
  columns: string,
  key: string,
  filter: KeysetFilter = query => query,
  pageSize = PAGE_ROWS
): Promise<T[]> {
  const safeTable =
    typeof table === 'string'
      ? table
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .slice(0, 160) || 'fetchByKey'
      : 'fetchByKey';
  const safeKey = typeof key === 'string' ? key.trim() : '';
  if (!safeKey || /[\s\p{Cc}]/u.test(safeKey)) {
    throw new Error(`${safeTable}: key must be a non-empty column name`);
  }
  if (typeof columns !== 'string' || !columns.trim()) {
    throw new Error(`${safeTable}: columns must be a non-empty string`);
  }
  if (typeof filter !== 'function') {
    throw new Error(`${safeTable}: filter must be a function`);
  }
  const safePageSize = parsePositivePagingInt(pageSize, PAGE_ROWS, PAGE_ROWS);
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let last: string | null = null;
  for (;;) {
    let query = filter(supabase.from(table).select(columns)) as ReturnType<
      ReturnType<RateSupabaseClient['from']>['select']
    >;
    if (last !== null) query = query.gt(safeKey, last);
    const pageRes = await query.order(safeKey).limit(safePageSize);
    const error = pageRes?.error ?? null;
    if (error) {
      const safeMsg =
        typeof error.message === 'string'
          ? error.message
              .replace(/\p{Cc}+/gu, ' ')
              .trim()
              .slice(0, 500) || 'unknown error'
          : 'unknown error';
      throw new Error(`${safeTable}: ${safeMsg}`);
    }
    const page = Array.isArray(pageRes?.data) ? (pageRes.data as unknown as T[]) : [];
    if (page.length === 0) return rows;
    rows.push(...page);
    const tail = page[page.length - 1];
    const rawCursor =
      tail && typeof tail === 'object' && !Array.isArray(tail)
        ? (tail as Record<string, unknown>)[safeKey]
        : undefined;
    const nextCursor =
      typeof rawCursor === 'string'
        ? rawCursor
        : typeof rawCursor === 'number' && Number.isFinite(rawCursor)
          ? String(rawCursor)
          : '';
    if (!nextCursor || !nextCursor.trim()) {
      throw new Error(`${safeTable}: missing key "${safeKey}" on page tail row`);
    }
    if (seenCursors.has(nextCursor)) {
      throw new Error(
        `${safeTable}: keyset cursor "${safeKey}" did not advance past "${nextCursor}"`
      );
    }
    seenCursors.add(nextCursor);
    last = nextCursor;
  }
}

/**
 * Validates and extracts `{ shopId, itemId, normalizedUrl }` from a Shopee Vietnam
 * product URL (`https://shopee.vn/...-i.<shopId>.<itemId>`, `/product/<shopId>/<itemId>`,
 * or `/opaanlp/<shopId>/<itemId>`). Rejects non-HTTP(S) schemes, credentials, control
 * characters, and non-Shopee hosts.
 */
export function parseShopeeEnqueueUrl(
  rawUrl: string
): { shopId: string; itemId: string; normalizedUrl: string } | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_SHOPEE_ENQUEUE_URL_LENGTH ||
    /\s/.test(trimmed) ||
    /\p{Cc}/u.test(trimmed)
  ) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (parsed.port !== '' && parsed.port !== '443' && parsed.port !== '80') {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..') ||
    (host !== 'shopee.vn' && !host.endsWith('.shopee.vn'))
  ) {
    return null;
  }
  if (/^\/(?:verify|buyer\/login|search)(?:\/|$)/i.test(parsed.pathname)) {
    return null;
  }
  const match =
    parsed.pathname.match(/(?:a-)?i\.([1-9]\d{0,19})\.([1-9]\d{0,19})(?!\d)/i) ||
    parsed.pathname.match(/\/(?:product|opaanlp)\/([1-9]\d{0,19})\/([1-9]\d{0,19})(?!\d)/i);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    shopId: match[1],
    itemId: match[2],
    normalizedUrl: parsed.toString(),
  };
}

/**
 * Validates and normalizes the target Supabase project URL for backfill/audit jobs.
 * Rejects non-HTTP(S) schemes, embedded credentials, control characters, and whitespace.
 */
export function resolveBackfillSupabaseTarget(rawUrl: string | undefined | null): {
  url: string;
  host: string;
} {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed) || /\p{Cc}/u.test(trimmed)) {
    throw new Error('Missing or malformed SUPABASE_URL in environment.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Missing or malformed SUPABASE_URL in environment.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('SUPABASE_URL must use http:// or https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('SUPABASE_URL must not contain embedded credentials.');
  }
  const hostLower = parsed.hostname.toLowerCase();
  if (
    !hostLower ||
    hostLower.startsWith('.') ||
    hostLower.endsWith('.') ||
    hostLower.includes('..') ||
    hostLower === '0.0.0.0' ||
    (!hostLower.includes('.') && hostLower !== 'localhost' && hostLower !== '[::1]')
  ) {
    throw new Error('SUPABASE_URL is missing or has an invalid hostname.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must not contain query parameters or fragments.');
  }
  return {
    url: parsed.origin,
    host: parsed.host,
  };
}
