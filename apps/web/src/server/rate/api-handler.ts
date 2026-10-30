import 'server-only';
import { NextResponse } from 'next/server';
import { reviewRiskScoreOrNull } from '@/lib/merchant-risk-tone';
import {
  getCategorySpecTemplate,
  plausibleMinPrice,
  plausibleOffers,
  specFieldApplies,
} from '@repo/shared-data/rules';
import {
  MAX_VALID_VND_PRICE,
  normalizeOfferOriginalPrice,
  type MasterProductFilterParams,
} from '@/lib/rate-api';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from '@/lib/product-market-stats';

/**
 * A merchant as public payloads carry it: `review_risk_score` is null when
 * the store has no analysed review, so no client reads a platform baseline
 * as a measurement (DOS/Rate#1258).
 */
export function withPublicReviewRisk<
  T extends {
    review_risk_score?: number | string | null;
    review_risk_breakdown?: { total_reviews?: unknown } | null;
    dosafe_risk_score?: number | null;
    dosafe_risk_known?: boolean;
  },
>(
  merchant: T
): Omit<T, 'review_risk_score' | 'dosafe_risk_score' | 'dosafe_risk_known'> & {
  review_risk_score: number | null;
  dosafe_risk_score: T['dosafe_risk_score'] | null;
} {
  // A seller with no known DOSafe score answers null, never the column's default 0,
  // the lowest risk (DOS/Rate#1465). The flag itself stays internal.
  const { dosafe_risk_known: dosafeKnown, ...rest } = merchant;
  return {
    ...rest,
    review_risk_score: reviewRiskScoreOrNull(merchant),
    dosafe_risk_score:
      dosafeKnown === false ? null : merchant.dosafe_risk_score,
  } as Omit<
    T,
    'review_risk_score' | 'dosafe_risk_score' | 'dosafe_risk_known'
  > & {
    review_risk_score: number | null;
    dosafe_risk_score: T['dosafe_risk_score'] | null;
  };
}

/**
 * An offer as public payloads carry it: its seller's review risk follows
 * `withPublicReviewRisk` (null without an analysed review), as every merchant
 * surface answers for the same seller (DOS/Rate#1376). An offer with no
 * seller is returned as it is.
 */
export function withPublicOfferReviewRisk<
  T extends {
    merchant?: {
      review_risk_score?: number | string | null;
      review_risk_breakdown?: { total_reviews?: unknown } | null;
    } | null;
  },
>(offer: T): T {
  return offer?.merchant
    ? ({ ...offer, merchant: withPublicReviewRisk(offer.merchant) } as T)
    : offer;
}

export const PUBLIC_API_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

const DB_INTERNAL_ERROR_REGEX =
  /PGRST\d+|relation\s+"[^"]+"|column\s+"[^"]+"|permission denied|syntax error at|duplicate key value|violates foreign key|violates check constraint|schema\s+"rate"|rate-api:\s*failed to/i;

/**
 * An error whose message is written for API clients (a validation message). Only
 * these reach a response body; any other error answers with the route's fixed
 * message (DOS/Rate#1310).
 */
export class PublicApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicApiError';
  }
}

/**
 * Audit T9: Prevent leaking internal PostgreSQL / PostgREST / Supabase schema or query errors
 * to public API consumers. Allow-list: only a `PublicApiError` message passes, and even
 * then not one that looks internal or is too long (DOS/Rate#1310).
 */
export function sanitizePublicApiError(
  err: unknown,
  fallbackMessage = 'Internal server error'
): string {
  if (!(err instanceof PublicApiError) || typeof err.message !== 'string') {
    return fallbackMessage;
  }
  const msg = err.message
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  // A 5xx always answers with the fixed message: its cause is never the client's.
  const safeError =
    err && status < 500
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

/**
 * The spec filters of `GET /api/v1/rate/products` that the category's spec
 * template does not have, by their documented query names (DOS/Rate#1184).
 * The body carries the category's spec view, so such a filter would match
 * stored values the body no longer shows (`has5g` on a watch, `ramGb` on
 * earbuds); the route answers 400 for them instead, and on `all` keeps
 * only products whose category has every requested filter.
 */
export function specFiltersOutsideCategory(
  categorySlug: string,
  filters: MasterProductFilterParams
): string[] {
  const template = getCategorySpecTemplate(categorySlug);
  const used: [boolean, boolean, string][] = [
    [Boolean(filters.ramGb?.length), template.ram, 'ramGb'],
    [Boolean(filters.storageGb?.length), template.storage, 'storageGb'],
    [filters.has5g === true, template.has5g, 'has5g'],
    [
      typeof filters.maxScreenSizeInch === 'number',
      template.screen,
      'compactScreen',
    ],
    [
      typeof filters.minRefreshRateHz === 'number',
      specFieldApplies(template, 'display', 'refresh_rate_hz'),
      'minRefreshHz',
    ],
    [
      filters.hasNfc === true,
      specFieldApplies(template, 'connectivity', 'nfc'),
      'hasNfc',
    ],
    [
      typeof filters.minBatteryMah === 'number',
      specFieldApplies(template, 'battery', 'capacity_mah'),
      'minBatteryMah',
    ],
    [
      typeof filters.minFastChargingW === 'number',
      specFieldApplies(template, 'battery', 'fast_charging_w'),
      'minFastChargeW',
    ],
  ];
  return used
    .filter(([requested, applies]) => requested && !applies)
    .map(([, , name]) => name);
}

/** Whether some category lacks one of the requested spec filters. */
export function hasCategoryScopedSpecFilter(
  filters: MasterProductFilterParams
): boolean {
  for (const slug of VALID_PRODUCT_CATEGORY_SLUGS) {
    if (slug === 'all') continue;
    if (specFiltersOutsideCategory(slug, filters).length > 0) return true;
  }
  return false;
}

function parseFiniteDecimalInput(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.NaN;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

export function parseBoundedIntParam(
  raw: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  const safeDefault = Number.isFinite(defaultValue)
    ? Math.trunc(defaultValue)
    : 0;
  const safeMin = Number.isFinite(min) ? Math.trunc(min) : 0;
  const safeMax =
    Number.isFinite(max) && max >= safeMin ? Math.trunc(max) : safeMin;
  if (typeof raw !== 'string') return safeDefault;
  const parsed = parseFiniteDecimalInput(raw);
  if (!Number.isSafeInteger(parsed)) {
    return safeDefault;
  }
  return Math.min(Math.max(parsed, safeMin), safeMax);
}

export function parseBoundedNumberParam(
  raw: string | null | undefined,
  min: number,
  max: number
): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin;
  const parsed = parseFiniteDecimalInput(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  if (parsed < safeMin || parsed > safeMax) {
    return Math.min(Math.max(parsed, safeMin), safeMax);
  }
  return parsed;
}

export function parseBoundedStringParam(
  raw: string | null | undefined,
  maxLength: number
): string | null {
  if (typeof raw !== 'string') return null;
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
  if (typeof raw !== 'string') return null;
  const n = parseFiniteDecimalInput(raw);
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
  const safeMaxValue =
    typeof maxValue === 'number' && Number.isFinite(maxValue) && maxValue > 0
      ? Math.floor(maxValue)
      : 0;
  if (safeMaxValue <= 0) return undefined;
  const safeMaxItems =
    typeof maxItems === 'number' && Number.isFinite(maxItems) && maxItems >= 1
      ? Math.min(100, Math.floor(maxItems))
      : 12;
  const result: number[] = [];
  const seen = new Set<number>();
  for (const part of boundedRaw.split(',')) {
    const n = parseFiniteDecimalInput(part);
    if (!Number.isSafeInteger(n) || n <= 0 || n > safeMaxValue || seen.has(n)) {
      continue;
    }
    seen.add(n);
    result.push(n);
    if (result.length >= safeMaxItems) break;
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
    !master || typeof master !== 'object'
      ? Number.NaN
      : parseFiniteDecimalInput(master.min_price);
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
    !master || typeof master !== 'object'
      ? Number.NaN
      : parseFiniteDecimalInput(master.max_price);
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
  availability?: OfferAvailability | null;
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
    !master || typeof master !== 'object'
      ? 0
      : parseFiniteDecimalInput(master.min_price);
  return {
    ...master,
    min_price: plausibleMinPrice(
      Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0,
      Array.isArray(offers) ? offers : []
    ),
  };
}

export function selectBestOfferFromListings(
  offers: readonly WatchlistCandidateOffer[]
): { bestOffer: WatchlistBestOffer | null; offerPlatforms: string[] } {
  // A sold-out or discontinued listing is never the best offer. stock is no
  // signal: the crawlers report 0 when they read no count (DOS/Rate#1171).
  const safeOffers = (Array.isArray(offers) ? offers : []).filter(
    (o) => !isOfferUnavailable(o)
  );
  // A bait-price listing is never the best offer (DOS/Rate#797).
  const valid = plausibleOffers(safeOffers).filter((o) => {
    if (!o || typeof o !== 'object') return false;
    const price = parseFiniteDecimalInput(o.price_current);
    return Number.isFinite(price) && price > 0 && price <= MAX_VALID_VND_PRICE;
  });
  const normalizeOfferPlatform = (o: WatchlistCandidateOffer): string =>
    String(o.merchant?.platform || o.platform || 'shopee')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase()
      .slice(0, 32) || 'shopee';
  const platforms = Array.from(new Set(valid.map(normalizeOfferPlatform)));
  if (valid.length === 0) {
    return { bestOffer: null, offerPlatforms: platforms };
  }

  const sorted = [...valid].sort((a, b) => {
    const diff =
      parseFiniteDecimalInput(a.price_current) -
      parseFiniteDecimalInput(b.price_current);
    if (diff !== 0) return diff;
    const mallA = a.merchant?.is_official ? 1 : 0;
    const mallB = b.merchant?.is_official ? 1 : 0;
    return mallB - mallA;
  });

  const best = sorted[0]!;
  const bestPrice = parseFiniteDecimalInput(best.price_current);
  const rawOrig = parseFiniteDecimalInput(best.price_original);
  const validOrig = normalizeOfferOriginalPrice(
    bestPrice,
    Number.isFinite(rawOrig) ? rawOrig : 0
  );
  const cleanTitle = String(best.title || '')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, 320);
  const cleanMerchantName = String(best.merchant?.name || 'Official Store')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, 120);
  const rawBestUrl =
    typeof best.url === 'string'
      ? best.url
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .slice(0, 2048)
      : '';
  const safeBestUrl = isSafeHttpOfferUrl(rawBestUrl, 2048) ? rawBestUrl : '';
  return {
    bestOffer: {
      id: String(best.id || '')
        .replace(/\p{Cc}+/gu, '')
        .trim()
        .slice(0, 128),
      title: cleanTitle,
      price: bestPrice,
      original_price: validOrig ?? bestPrice,
      url: safeBestUrl,
      platform: normalizeOfferPlatform(best),
      merchant_name: cleanMerchantName || 'Official Store',
      is_official_mall: Boolean(best.merchant?.is_official),
    },
    offerPlatforms: platforms,
  };
}

function isSafeHttpOfferUrl(rawUrl: string, maxLength = 1024): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > maxLength ||
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
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^\d+(?:\.\d+){3}$/.test(host)
    ) {
      return false;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isSafeCrowdIngestHttpUrl(rawUrl: string): boolean {
  return isSafeHttpOfferUrl(rawUrl, 1024);
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
    const n = parseFiniteDecimalInput(val);
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
const DISALLOWED_SLUG_AND_BRAND_TOKENS = new Set([
  'null',
  'undefined',
  'nan',
  'none',
  'true',
  'false',
  '__proto__',
  'constructor',
  'prototype',
]);

function isValidProductSlugToken(slug: string, maxLength = 120): boolean {
  if (typeof slug !== 'string') return false;
  const safeMaxLength =
    typeof maxLength === 'number' &&
    Number.isFinite(maxLength) &&
    maxLength >= 1
      ? Math.floor(maxLength)
      : 120;
  const lower = slug.toLowerCase();
  return (
    Boolean(slug) &&
    slug.length <= safeMaxLength &&
    CANONICAL_PRODUCT_SLUG_REGEX.test(slug) &&
    /[a-zA-Z0-9]/.test(slug) &&
    !/^0+$/.test(slug) &&
    !DISALLOWED_SLUG_AND_BRAND_TOKENS.has(lower) &&
    !slug.startsWith('.') &&
    !slug.endsWith('.') &&
    !slug.includes('..')
  );
}

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
    if (!isValidProductSlugToken(slug, 120)) {
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
    if (!isValidProductSlugToken(slug, 120)) {
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
    const safeOpts =
      options && typeof options === 'object'
        ? options
        : ({} as SlidingWindowRateLimiterOptions);
    const rawWindowMs = parseFiniteDecimalInput(safeOpts.windowMs);
    this.windowMs =
      Number.isFinite(rawWindowMs) && rawWindowMs >= 1_000
        ? Math.min(86_400_000, Math.floor(rawWindowMs))
        : 60_000;
    const rawMaxRequests = parseFiniteDecimalInput(safeOpts.maxRequests);
    this.maxRequests =
      Number.isFinite(rawMaxRequests) && rawMaxRequests >= 1
        ? Math.min(100_000, Math.floor(rawMaxRequests))
        : 30;
    const rawMaxBuckets = parseFiniteDecimalInput(safeOpts.maxBuckets ?? 2_000);
    this.maxBuckets =
      Number.isFinite(rawMaxBuckets) && rawMaxBuckets >= 1
        ? Math.min(50_000, Math.floor(rawMaxBuckets))
        : 2_000;
  }

  public get size(): number {
    return this.buckets.size;
  }

  public pruneExpired(now = Date.now()): void {
    const safeNow =
      typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (safeNow >= bucket.windowResetAt) {
        this.buckets.delete(key);
      }
    }
  }

  public allow(clientKey: string, now = Date.now()): boolean {
    const safeNow =
      typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    const normalizedKey =
      (typeof clientKey === 'string'
        ? clientKey
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 128)
        : '') || 'anon';
    const existing = this.buckets.get(normalizedKey);
    if (existing && safeNow < existing.windowResetAt) {
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
      this.pruneExpired(safeNow);
      while (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey === undefined) break;
        this.buckets.delete(oldestKey);
      }
    }

    this.buckets.set(normalizedKey, {
      count: 1,
      windowResetAt: safeNow + this.windowMs,
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
  // On Vercel, the platform-set client IP first (a client cannot set it
  // there); anywhere else that header is ordinary client input and ignored
  // (DOS/Rate#1307).
  if (process.env.VERCEL === '1') {
    const platformIp = sanitizeIpCandidate(
      headers.get('x-vercel-forwarded-for')?.split(',')[0]
    );
    if (platformIp) return platformIp;
  }
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = sanitizeIpCandidate(forwardedFor.split(',')[0]);
    if (firstIp) return firstIp;
  }
  const realIp = sanitizeIpCandidate(headers.get('x-real-ip'));
  if (realIp) return realIp;
  return 'anon';
}

/** The 10 marketplaces and retailers Rate tracks (DOS/Rate#1308). */
export const SUPPORTED_PLATFORM_SLUGS: ReadonlySet<string> = new Set([
  'shopee',
  'lazada',
  'tiki',
  'tiktok',
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
]);

/**
 * JSON write bodies are small: a review is the largest. Its 3,000-character
 * comment is about 18 KB when a client escapes every non-ASCII character as
 * a \u escape (Python's json.dumps does), so the cap leaves room for that.
 */
export const MAX_JSON_BODY_BYTES = 32_768;

/**
 * A request's JSON body, read up to `maxBytes` (DOS/Rate#1308): a larger body
 * (by Content-Length, or by what is actually sent) is `tooLarge` and is not
 * read further; a body that is no JSON is `value: null`.
 */
export async function readBoundedJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<{ tooLarge: true } | { tooLarge: false; value: unknown }> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { tooLarge: true };
  }
  if (!request.body) return { tooLarge: false, value: null };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    return {
      tooLarge: false,
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    };
  } catch {
    return { tooLarge: false, value: null };
  }
}

/** The 413 a write route answers for a body over `MAX_JSON_BODY_BYTES`. */
export function payloadTooLargeResponse(
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
    { status: 413, headers }
  );
}

/**
 * Per-IP limit of the uncached inspection routes (`/inspect`, `/lookup`),
 * per server instance (DOS/Rate#1307). A durable shared limit is #1247.
 */
export const inspectRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  maxBuckets: 5_000,
});

/**
 * The 429 a rate-limited public route answers: `code: RATE_LIMIT_EXCEEDED`
 * and `Retry-After` (seconds; the limit's window, one minute by default),
 * exposed to cross-origin callers such as the extension (DOS/Rate#1322,
 * #1377, #1400).
 */
export function rateLimitExceededResponse(
  message: string,
  headers: Record<string, string>,
  /** The limit's window: the longest wait before a retry can pass. */
  retryAfterSeconds = 60
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message, code: 'RATE_LIMIT_EXCEEDED' },
    {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(retryAfterSeconds),
        'Access-Control-Expose-Headers': 'Retry-After',
      },
    }
  );
}

/** The 429 the inspection routes answer past `inspectRateLimiter`. */
export function inspectRateLimitResponse(
  headers: Record<string, string>
): NextResponse {
  return rateLimitExceededResponse(
    'Rate limit exceeded. Maximum 30 inspections per minute.',
    headers
  );
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
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return null;
  }
  const body = rawBody as Record<string, unknown>;
  let voteType: ReviewVoteAction | null = null;
  const rawAction =
    typeof body.voteType === 'string'
      ? body.voteType
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : typeof body.vote === 'string'
        ? body.vote
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
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
      ? body.reportReason
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : typeof body.reason === 'string'
        ? body.reason
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
        : null;
  const reportReason: ReviewReportReason =
    rawReason &&
    VALID_REVIEW_REPORT_REASONS.has(rawReason as ReviewReportReason)
      ? (rawReason as ReviewReportReason)
      : 'spam';

  return { voteType, reportReason };
}

/**
 * Parses and validates a 1v1 versus pair (`?pair=<slugA>-vs-<slugB>` or `?slugA=...&slugB=...`).
 * Rejects missing, identical, overlong (`> 120` chars), or malformed product slugs (`null`).
 */
export function parseVersusQueryParams(
  searchParams: Pick<URLSearchParams, 'get'>,
  maxSlugLength = 120
): [string, string] | null {
  const isValidSlug = (s: string): boolean =>
    isValidProductSlugToken(s, maxSlugLength);

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
  if (rawLimit != null && rawLimit.replace(/\p{Cc}+/gu, '').trim() !== '') {
    const parsedLimit = parseFiniteDecimalInput(rawLimit);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 200
    ) {
      return null;
    }
    limit = parsedLimit;
  }

  const rawMasterId =
    searchParams.get('masterProductId') ?? searchParams.get('productId');
  if (
    rawMasterId != null &&
    rawMasterId.replace(/\p{Cc}+/gu, '').trim() !== ''
  ) {
    const trimmedId = rawMasterId.replace(/\p{Cc}+/gu, '').trim();
    if (!UUID_PARAM_REGEX.test(trimmedId)) {
      return null;
    }
    return { masterProductId: trimmedId, slug: null, hideFake, limit };
  }

  const rawSlug = searchParams.get('slug');
  if (rawSlug != null && rawSlug.replace(/\p{Cc}+/gu, '').trim() !== '') {
    const trimmedSlug = rawSlug.replace(/\p{Cc}+/gu, '').trim();
    if (!isValidProductSlugToken(trimmedSlug, 120)) {
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
  const safeMaxBrands =
    typeof maxBrands === 'number' &&
    Number.isFinite(maxBrands) &&
    maxBrands >= 1
      ? Math.min(50, Math.floor(maxBrands))
      : 15;
  const rawCategory = searchParams.get('category');
  const cleanedCategory =
    typeof rawCategory === 'string'
      ? rawCategory.replace(/\p{Cc}+/gu, '').trim()
      : '';
  const categorySlug =
    cleanedCategory === '' ? 'smartphones' : cleanedCategory.toLowerCase();
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
      const lower = b.toLowerCase();
      if (
        !b ||
        b.length > 40 ||
        !VALID_BRAND_TOKEN_REGEX.test(b) ||
        !/[\p{L}\p{N}]/u.test(b) ||
        /^0+$/.test(b) ||
        DISALLOWED_SLUG_AND_BRAND_TOKENS.has(lower) ||
        b.includes('..')
      ) {
        continue;
      }
      if (seen.has(lower)) continue;
      seen.add(lower);
      list.push(b);
      if (list.length >= safeMaxBrands) break;
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
