import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { plausibleMinPrice, plausibleOffers } from '@/lib/offer-plausibility';
import {
  MAX_VALID_VND_PRICE,
  normalizeOfferOriginalPrice,
} from '@/lib/rate-api';

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
  const safeMaxLength =
    Number.isFinite(maxLength) && maxLength >= 1 ? Math.floor(maxLength) : 256;
  const cleaned = raw.replace(/\p{Cc}+/gu, ' ').trim();
  if (!cleaned) return null;
  const sliced =
    cleaned.length > safeMaxLength
      ? cleaned.slice(0, safeMaxLength).trim()
      : cleaned;
  return sliced || null;
}

/**
 * Parses an optional VND price query parameter (`?price=` or `?originalPrice=`),
 * returning a positive integer capped at `maxVnd` (default 500,000,000 VND) or `null` if invalid/missing.
 */
export function parseOptionalVndPriceParam(
  raw: string | null | undefined,
  maxVnd = 500_000_000
): number | null {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const safeMaxVnd =
    typeof maxVnd === 'number' && Number.isFinite(maxVnd) && maxVnd > 0
      ? Math.round(maxVnd)
      : 500_000_000;
  return Math.min(Math.round(n), safeMaxVnd);
}

/**
 * Parses a comma-separated list of positive integers (e.g. `?ramGb=8,12` or `?storageGb=128,256`),
 * bounding raw length, filtering out non-integers, `<= 0`, or `> maxValue`, deduplicating,
 * and capping the list at `maxItems` (default 12).
 */
export function parseBoundedPositiveIntArrayParam(
  raw: string | null | undefined,
  maxValue: number,
  maxItems = 12
): number[] | undefined {
  const boundedRaw = parseBoundedStringParam(raw, 240);
  if (!boundedRaw) return undefined;
  const result: number[] = [];
  const seen = new Set<number>();
  for (const part of boundedRaw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0 || n > maxValue || seen.has(n)) {
      continue;
    }
    seen.add(n);
    result.push(n);
    if (result.length >= maxItems) break;
  }
  return result.length > 0 ? result : undefined;
}

/**
 * Resolves bounded `currentMinPrice` and `currentMaxPrice` (`(0, maxVnd]`, `currentMaxPrice >= currentMinPrice`)
 * for Watchlist API responses and Target Price Alert evaluations, falling back to `bestOfferPrice`
 * when `master.min_price` is missing, non-positive, or exceeds `maxVnd` (1B VND).
 */
export function resolveWatchlistMasterPriceBounds(
  master: { min_price?: unknown; max_price?: unknown } | null | undefined,
  bestOfferPrice?: number | null,
  maxVnd = 1_000_000_000
): { currentMinPrice: number; currentMaxPrice: number } {
  const safeMaxVnd =
    typeof maxVnd === 'number' && Number.isFinite(maxVnd) && maxVnd > 0
      ? Math.round(maxVnd)
      : 1_000_000_000;
  const rawMin =
    !master ||
    typeof master !== 'object' ||
    typeof master.min_price === 'boolean' ||
    master.min_price === null ||
    master.min_price === undefined
      ? Number.NaN
      : Number(master.min_price);
  const safeBestOffer =
    typeof bestOfferPrice === 'number' &&
    Number.isFinite(bestOfferPrice) &&
    bestOfferPrice > 0 &&
    bestOfferPrice <= safeMaxVnd
      ? bestOfferPrice
      : 0;
  const currentMinPrice =
    Number.isFinite(rawMin) && rawMin > 0 && rawMin <= safeMaxVnd
      ? rawMin
      : safeBestOffer;
  const rawMax =
    !master ||
    typeof master !== 'object' ||
    typeof master.max_price === 'boolean' ||
    master.max_price === null ||
    master.max_price === undefined
      ? Number.NaN
      : Number(master.max_price);
  const currentMaxPrice =
    currentMinPrice > 0 &&
    Number.isFinite(rawMax) &&
    rawMax >= currentMinPrice &&
    rawMax <= safeMaxVnd
      ? rawMax
      : currentMinPrice;
  return { currentMinPrice, currentMaxPrice };
}

export interface WatchlistBestOffer {
  id: string;
  title: string;
  price: number;
  original_price: number;
  url: string;
  platform: string;
  merchant_name: string;
  is_official_mall: boolean;
}

export interface WatchlistCandidateOffer {
  id?: unknown;
  title?: unknown;
  price_current: number;
  price_original?: unknown;
  stock?: unknown;
  url?: unknown;
  platform?: unknown;
  merchant?: {
    name?: unknown;
    platform?: unknown;
    is_official?: unknown;
  } | null;
}

// The stored min_price can be a bait-price listing; target checks use the
// lowest plausible offer instead (DOS/Rate#797).
export function withPlausibleMinPrice<T extends { min_price?: unknown }>(
  master: T,
  offers: readonly { price_current: number }[]
): T {
  const rawMin =
    !master ||
    typeof master !== 'object' ||
    typeof master.min_price === 'boolean' ||
    master.min_price === null ||
    master.min_price === undefined
      ? 0
      : Number(master.min_price || 0);
  return {
    ...master,
    min_price: plausibleMinPrice(
      Number.isFinite(rawMin) ? rawMin : 0,
      Array.isArray(offers) ? offers : []
    ),
  };
}

export function selectBestOfferFromListings(
  offers: readonly WatchlistCandidateOffer[]
): { bestOffer: WatchlistBestOffer | null; offerPlatforms: string[] } {
  const safeOffers = Array.isArray(offers) ? offers : [];
  // A bait-price listing is never the best offer (DOS/Rate#797).
  const valid = plausibleOffers(safeOffers).filter((o) => {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.price_current === 'boolean' || typeof o.stock === 'boolean') {
      return false;
    }
    const price = Number(o.price_current);
    const stock = o.stock == null ? 1 : Number(o.stock);
    return (
      Number.isFinite(stock) &&
      stock > 0 &&
      Number.isFinite(price) &&
      price > 0 &&
      price <= MAX_VALID_VND_PRICE
    );
  });
  const platforms = Array.from(
    new Set(
      valid
        .map((o) =>
          String(o.merchant?.platform || o.platform || 'shopee')
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  );
  if (valid.length === 0) {
    return { bestOffer: null, offerPlatforms: platforms };
  }

  const sorted = [...valid].sort((a, b) => {
    const diff = Number(a.price_current) - Number(b.price_current);
    if (diff !== 0) return diff;
    const mallA = a.merchant?.is_official ? 1 : 0;
    const mallB = b.merchant?.is_official ? 1 : 0;
    return mallB - mallA;
  });

  const best = sorted[0]!;
  const bestPrice = Number(best.price_current);
  const validOrig = normalizeOfferOriginalPrice(
    bestPrice,
    typeof best.price_original === 'boolean'
      ? 0
      : Number(best.price_original ?? 0)
  );
  const cleanTitle = String(best.title || '')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, 320);
  const cleanMerchantName = String(best.merchant?.name || 'Official Store')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, 120);
  return {
    bestOffer: {
      id: String(best.id || '').trim(),
      title: cleanTitle,
      price: bestPrice,
      original_price: validOrig ?? bestPrice,
      url: typeof best.url === 'string' ? best.url.trim().slice(0, 2048) : '',
      platform: String(best.merchant?.platform || best.platform || 'shopee')
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .toLowerCase(),
      merchant_name: cleanMerchantName || 'Official Store',
      is_official_mall: Boolean(best.merchant?.is_official),
    },
    offerPlatforms: platforms,
  };
}

export function isSafeCrowdIngestHttpUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > 1024 ||
    /\s/.test(trimmed) ||
    /\p{Cc}/u.test(trimmed)
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) return false;
    if (!parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export function resolveInspectObservedPrices(input: {
  queryPrice?: number | null;
  queryOriginalPrice?: number | null;
  matchedOfferPriceCurrent?: unknown;
  matchedOfferPriceOriginal?: unknown;
  masterMinPrice?: unknown;
  maxVnd?: number;
}): { observedPrice: number; observedOriginalPrice: number } {
  const safeMaxVnd =
    typeof input.maxVnd === 'number' &&
    Number.isFinite(input.maxVnd) &&
    input.maxVnd > 0
      ? Math.round(input.maxVnd)
      : MAX_VALID_VND_PRICE;
  const toPositiveBoundedPrice = (val: unknown): number => {
    if (
      val === null ||
      val === undefined ||
      typeof val === 'boolean' ||
      (typeof val === 'string' && !val.trim())
    ) {
      return 0;
    }
    const n = Number(val);
    return Number.isFinite(n) && n > 0 && n <= safeMaxVnd ? Math.round(n) : 0;
  };

  const observedPrice =
    toPositiveBoundedPrice(input.queryPrice) ||
    toPositiveBoundedPrice(input.matchedOfferPriceCurrent) ||
    toPositiveBoundedPrice(input.masterMinPrice) ||
    0;

  const rawOrigCandidate =
    input.queryOriginalPrice ??
    (input.queryPrice === null || input.queryPrice === undefined
      ? input.matchedOfferPriceOriginal
      : null);
  const candidateOrig = toPositiveBoundedPrice(rawOrigCandidate);
  const observedOriginalPrice =
    observedPrice > 0 && candidateOrig >= observedPrice ? candidateOrig : 0;

  return { observedPrice, observedOriginalPrice };
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
    this.windowMs =
      Number.isFinite(options.windowMs) && options.windowMs >= 1_000
        ? Math.min(86_400_000, Math.floor(options.windowMs))
        : 60_000;
    this.maxRequests =
      Number.isFinite(options.maxRequests) && options.maxRequests >= 1
        ? Math.min(100_000, Math.floor(options.maxRequests))
        : 30;
    const rawMaxBuckets = options.maxBuckets ?? 2_000;
    this.maxBuckets =
      Number.isFinite(rawMaxBuckets) && rawMaxBuckets >= 1
        ? Math.min(50_000, Math.floor(rawMaxBuckets))
        : 2_000;
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
  headers: Pick<Headers, 'get'> | null | undefined
): string {
  if (!headers || typeof headers.get !== 'function') return 'anon';
  const sanitizeIpCandidate = (raw: string | null | undefined): string => {
    if (typeof raw !== 'string') return '';
    return raw
      .replace(/\p{Cc}+/gu, '')
      .replace(/\s+/g, '')
      .slice(0, 128);
  };
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = sanitizeIpCandidate(forwardedFor.split(',')[0]);
    if (firstIp) return firstIp;
  }
  const realIp = sanitizeIpCandidate(headers.get('x-real-ip'));
  if (realIp) return realIp;
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
