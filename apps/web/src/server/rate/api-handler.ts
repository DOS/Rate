import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const PUBLIC_API_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

const DB_INTERNAL_ERROR_REGEX =
  /PGRST\d+|relation\s+"[^"]+"|column\s+"[^"]+"|permission denied|syntax error at|duplicate key value|violates foreign key|violates check constraint|schema\s+"rate"|rate-api:\s*failed to/i;

/**
 * Audit T9: Prevent leaking internal PostgreSQL / PostgREST / Supabase schema or query errors
 * to public API consumers while preserving safe validation messages.
 */
export function sanitizePublicApiError(
  err: unknown,
  fallbackMessage = 'Internal server error'
): string {
  if (!(err instanceof Error)) {
    return fallbackMessage;
  }
  const msg = err.message.trim();
  if (!msg || msg.length > 240 || DB_INTERNAL_ERROR_REGEX.test(msg)) {
    return fallbackMessage;
  }
  return msg;
}

export function jsonApiError(
  status: number,
  fallbackMessage: string,
  err?: unknown,
  extraHeaders?: Record<string, string>
) {
  const safeError = err
    ? sanitizePublicApiError(err, fallbackMessage)
    : fallbackMessage;
  return NextResponse.json(
    {
      ok: false,
      error: safeError,
    },
    {
      status,
      headers: {
        ...PUBLIC_API_CORS_HEADERS,
        ...extraHeaders,
      },
    }
  );
}

export function parseBoundedIntParam(
  raw: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (raw == null || raw.trim() === '') return defaultValue;
  const schema = z.coerce.number().int();
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(parsed.data)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed.data, min), max);
}

export function parseBoundedNumberParam(
  raw: string | null | undefined,
  min: number,
  max: number
): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const schema = z.coerce.number();
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(parsed.data)) {
    return undefined;
  }
  if (parsed.data < min || parsed.data > max) {
    return Math.min(Math.max(parsed.data, min), max);
  }
  return parsed.data;
}

export function parseBoundedStringParam(
  raw: string | null | undefined,
  maxLength: number
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Parses an optional VND price query parameter (`?price=` or `?originalPrice=`),
 * returning a positive integer capped at `maxVnd` (default 500,000,000 VND) or `null` if invalid/missing.
 */
export function parseOptionalVndPriceParam(
  raw: string | null | undefined,
  maxVnd = 500_000_000
): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), maxVnd);
}

const CANONICAL_PRODUCT_SLUG_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Parses and validates comma-separated master product slugs for `GET /api/v1/rate/compare`.
 * Bounds raw input length, trims/deduplicates up to `maxSlugs` (default 4), and rejects invalid characters.
 */
export function parseCompareSlugsParam(
  raw: string | null | undefined,
  maxSlugs = 4
): string[] {
  const boundedRaw = parseBoundedStringParam(raw, 600);
  if (!boundedRaw) return [];
  const uniqueSlugs: string[] = [];
  const seen = new Set<string>();
  for (const part of boundedRaw.split(',')) {
    const slug = part.trim();
    if (!slug) continue;
    if (slug.length > 120 || !CANONICAL_PRODUCT_SLUG_REGEX.test(slug)) {
      continue;
    }
    const lower = slug.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    uniqueSlugs.push(slug);
    if (uniqueSlugs.length >= maxSlugs) break;
  }
  return uniqueSlugs;
}

/**
 * Parses and validates comma-separated master product slugs for `GET /api/v1/rate/watchlist`.
 * Bounds raw input length, normalizes to lowercase, deduplicates up to `maxSlugs` (default 20),
 * and rejects overlong (`> 120` chars) or malformed slugs.
 */
export function parseWatchlistSlugsParam(
  raw: string | null | undefined,
  maxSlugs = 20
): string[] {
  const boundedRaw = parseBoundedStringParam(raw, 2600);
  if (!boundedRaw) return [];
  const uniqueSlugs: string[] = [];
  const seen = new Set<string>();
  for (const part of boundedRaw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!slug) continue;
    if (slug.length > 120 || !CANONICAL_PRODUCT_SLUG_REGEX.test(slug)) {
      continue;
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    uniqueSlugs.push(slug);
    if (uniqueSlugs.length >= maxSlugs) break;
  }
  return uniqueSlugs;
}

export interface SlidingWindowRateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxBuckets?: number;
}

export class BoundedSlidingWindowRateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; windowResetAt: number }
  >();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxBuckets: number;

  constructor(options: SlidingWindowRateLimiterOptions) {
    this.windowMs = Math.max(1_000, options.windowMs);
    this.maxRequests = Math.max(1, options.maxRequests);
    this.maxBuckets = Math.max(1, options.maxBuckets ?? 2_000);
  }

  public get size(): number {
    return this.buckets.size;
  }

  public pruneExpired(now = Date.now()): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (now >= bucket.windowResetAt) {
        this.buckets.delete(key);
      }
    }
  }

  public allow(clientKey: string, now = Date.now()): boolean {
    const normalizedKey = clientKey.trim().slice(0, 128) || 'anon';
    const existing = this.buckets.get(normalizedKey);
    if (existing && now < existing.windowResetAt) {
      if (existing.count >= this.maxRequests) {
        return false;
      }
      existing.count += 1;
      this.buckets.delete(normalizedKey);
      this.buckets.set(normalizedKey, existing);
      return true;
    }

    if (existing) {
      this.buckets.delete(normalizedKey);
    }

    if (this.buckets.size >= this.maxBuckets) {
      this.pruneExpired(now);
      while (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey === undefined) break;
        this.buckets.delete(oldestKey);
      }
    }

    this.buckets.set(normalizedKey, {
      count: 1,
      windowResetAt: now + this.windowMs,
    });
    return true;
  }
}

export function extractClientRateLimitKey(
  headers: Pick<Headers, 'get'>
): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp.slice(0, 128);
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 128);
  return 'anon';
}

export type ReviewVoteAction = 'up' | 'down' | 'report' | 'clear';
export type ReviewReportReason =
  'spam' | 'fake' | 'offensive' | 'off_topic' | 'other';

const VALID_REVIEW_VOTE_ACTIONS = new Set<ReviewVoteAction>([
  'up',
  'down',
  'report',
  'clear',
]);

const VALID_REVIEW_REPORT_REASONS = new Set<ReviewReportReason>([
  'spam',
  'fake',
  'offensive',
  'off_topic',
  'other',
]);

/**
 * Validates and normalizes the request body for `POST /api/reviews/[id]/vote`.
 * Rejects empty or unrecognized vote actions (`null`) instead of silently defaulting to `'up'`.
 */
export function resolveReviewVoteInput(rawBody: unknown): {
  voteType: ReviewVoteAction;
  reportReason: ReviewReportReason;
} | null {
  if (!rawBody || typeof rawBody !== 'object') {
    return null;
  }
  const body = rawBody as Record<string, unknown>;
  let voteType: ReviewVoteAction | null = null;
  const rawAction =
    typeof body.voteType === 'string'
      ? body.voteType.trim().toLowerCase()
      : typeof body.vote === 'string'
        ? body.vote.trim().toLowerCase()
        : null;

  if (
    rawAction &&
    VALID_REVIEW_VOTE_ACTIONS.has(rawAction as ReviewVoteAction)
  ) {
    voteType = rawAction as ReviewVoteAction;
  } else if (rawAction === null && typeof body.helpful === 'boolean') {
    voteType = body.helpful ? 'up' : 'down';
  }

  if (!voteType) {
    return null;
  }

  const rawReason =
    typeof body.reportReason === 'string'
      ? body.reportReason.trim().toLowerCase()
      : typeof body.reason === 'string'
        ? body.reason.trim().toLowerCase()
        : null;
  const reportReason: ReviewReportReason =
    rawReason &&
    VALID_REVIEW_REPORT_REASONS.has(rawReason as ReviewReportReason)
      ? (rawReason as ReviewReportReason)
      : 'spam';

  return { voteType, reportReason };
}

const VALID_VERSUS_SLUG_REGEX = /^[a-z0-9._-]+$/i;

/**
 * Parses and validates a 1v1 versus pair (`?pair=<slugA>-vs-<slugB>` or `?slugA=...&slugB=...`).
 * Rejects missing, identical, overlong (`> 120` chars), or malformed product slugs (`null`).
 */
export function parseVersusQueryParams(
  searchParams: Pick<URLSearchParams, 'get'>,
  maxSlugLength = 120
): [string, string] | null {
  const isValidSlug = (s: string): boolean =>
    Boolean(s && s.length <= maxSlugLength && VALID_VERSUS_SLUG_REGEX.test(s));

  const rawPair = (searchParams.get('pair') || '').toLowerCase().trim();
  if (
    rawPair &&
    rawPair.length <= maxSlugLength * 2 + 4 &&
    rawPair.includes('-vs-')
  ) {
    const parts = rawPair.split('-vs-');
    if (parts.length === 2) {
      const a = parts[0]?.trim() || '';
      const b = parts[1]?.trim() || '';
      if (isValidSlug(a) && isValidSlug(b) && a !== b) {
        return [a, b];
      }
    }
  }

  const slugA = (searchParams.get('slugA') || searchParams.get('a') || '')
    .toLowerCase()
    .trim();
  const slugB = (searchParams.get('slugB') || searchParams.get('b') || '')
    .toLowerCase()
    .trim();

  if (isValidSlug(slugA) && isValidSlug(slugB) && slugA !== slugB) {
    return [slugA, slugB];
  }

  return null;
}

const UUID_PARAM_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses and validates query parameters for `GET /api/v1/rate/reviews`.
 * Rejects missing parameters, malformed `masterProductId` UUIDs (even when `slug` is also present),
 * and overlong or non-canonical `slug` strings (`null`).
 */
export function parseReviewsQueryParams(
  searchParams: Pick<URLSearchParams, 'get'>
): {
  masterProductId: string | null;
  slug: string | null;
  hideFake: boolean;
  limit: number;
} | null {
  const hideFakeRaw = searchParams.get('hideFake');
  const hideFake =
    hideFakeRaw === '1' || hideFakeRaw?.trim().toLowerCase() === 'true';

  const rawLimit = searchParams.get('limit');
  let limit = 50;
  if (rawLimit != null && rawLimit.trim() !== '') {
    const parsedLimit = Number(rawLimit.trim());
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 200
    ) {
      return null;
    }
    limit = parsedLimit;
  }

  const rawMasterId =
    searchParams.get('masterProductId') ?? searchParams.get('productId');
  if (rawMasterId != null && rawMasterId.trim() !== '') {
    const trimmedId = rawMasterId.trim();
    if (!UUID_PARAM_REGEX.test(trimmedId)) {
      return null;
    }
    return { masterProductId: trimmedId, slug: null, hideFake, limit };
  }

  const rawSlug = searchParams.get('slug');
  if (rawSlug != null && rawSlug.trim() !== '') {
    const trimmedSlug = rawSlug.trim();
    if (
      trimmedSlug.length > 120 ||
      !CANONICAL_PRODUCT_SLUG_REGEX.test(trimmedSlug)
    ) {
      return null;
    }
    return { masterProductId: null, slug: trimmedSlug, hideFake, limit };
  }

  return null;
}

const VALID_PRODUCT_CATEGORY_SLUGS = new Set([
  'all',
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const VALID_BRAND_TOKEN_REGEX = /^[\p{L}\p{N}\s.+-]+$/u;

/**
 * Validates and normalizes `category`, `brands`/`brand`, and `minPrice`/`maxPrice` bounds
 * for `GET /api/v1/rate/products`. Returns `null` when `category` is unknown or `minPrice > maxPrice`.
 */
export function parseProductsFilterBounds(
  searchParams: Pick<URLSearchParams, 'get'>,
  maxBrands = 15
): {
  categorySlug: string;
  brands: string[] | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
} | null {
  const rawCategory = searchParams.get('category');
  const categorySlug =
    rawCategory == null || rawCategory.trim() === ''
      ? 'smartphones'
      : rawCategory.trim().toLowerCase();
  if (!VALID_PRODUCT_CATEGORY_SLUGS.has(categorySlug)) {
    return null;
  }

  const rawBrands = parseBoundedStringParam(
    searchParams.get('brands') || searchParams.get('brand'),
    400
  );
  let brands: string[] | undefined;
  if (rawBrands) {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const part of rawBrands.split(',')) {
      const b = part.trim();
      if (!b || b.length > 40 || !VALID_BRAND_TOKEN_REGEX.test(b)) continue;
      const lower = b.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      list.push(b);
      if (list.length >= maxBrands) break;
    }
    if (list.length > 0) {
      brands = list;
    }
  }

  const minPrice =
    parseOptionalVndPriceParam(searchParams.get('minPrice')) ?? undefined;
  const maxPrice =
    parseOptionalVndPriceParam(searchParams.get('maxPrice')) ?? undefined;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return null;
  }

  return { categorySlug, brands, minPrice, maxPrice };
}
