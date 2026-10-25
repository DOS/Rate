import 'server-only';
import { unstable_cache } from 'next/cache';

/**
 * Canonical Next.js Data Cache tags for Rate.vn (Audit C3 & Phase 7.3).
 * Enables surgical on-demand invalidation via `POST /api/v1/rate/revalidate`
 * whenever crawler workers or review triggers update master products, offers, or reviews.
 */
export const RATE_CACHE_TAGS = {
  PRODUCTS: 'rate:products',
  CATEGORIES: 'rate:categories',
  OFFERS: 'rate:offers',
  REVIEWS: 'rate:reviews',
  PRICE_HISTORY: 'rate:price-history',
  MERCHANTS: 'rate:merchants',
  STATS: 'rate:stats',
  DEALS: 'rate:deals',
} as const;

export type RateCanonicalCacheTag =
  (typeof RATE_CACHE_TAGS)[keyof typeof RATE_CACHE_TAGS];

export function productCacheTag(slug: string): string {
  return `rate:product:${String(slug ?? '')
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 120)}`;
}

export function categoryCacheTag(categorySlug: string): string {
  return `rate:category:${String(categorySlug ?? '')
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 60)}`;
}

export function merchantCacheTag(merchantId: string): string {
  return `rate:merchant:${String(merchantId ?? '')
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 120)}`;
}

export interface RevalidationTargetsInput {
  tags?: readonly string[];
  slugs?: readonly string[];
  categories?: readonly string[];
  merchants?: readonly string[];
  paths?: readonly string[];
}

const SAFE_CACHE_TAG_REGEX = /^rate:[a-z0-9:._-]{1,150}$/i;
const SAFE_ENTITY_TOKEN_REGEX = /^[a-z0-9._-]+$/i;
const SAFE_MERCHANT_IDENTIFIER_REGEX = /^[a-z0-9:._-]+$/i;
const UNSAFE_CACHE_PARAM_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export function canonicalizeCacheParams(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>()
): string {
  if (value === null || value === undefined) {
    return depth === 0 ? '{}' : 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value.replace(/\p{Cc}+/gu, '').slice(0, 500));
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (seen.has(value)) {
    return '"[Circular]"';
  }
  if (depth > 6) {
    return '"[MaxDepth]"';
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .slice(0, 100)
        .map((item) => canonicalizeCacheParams(item, depth + 1, seen))
        .join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(
        ([key, val]) =>
          val !== undefined &&
          !UNSAFE_CACHE_PARAM_KEYS.has(key) &&
          key.length <= 128
      )
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .slice(0, 60);
    return `{${entries
      .map(
        ([key, val]) =>
          `${JSON.stringify(key)}:${canonicalizeCacheParams(val, depth + 1, seen)}`
      )
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function isSafeRevalidationPath(rawPath: string): boolean {
  if (typeof rawPath !== 'string') return false;
  const clean = rawPath.trim();
  if (!clean || clean.length > 200) return false;
  if (!clean.startsWith('/') || clean.startsWith('//')) return false;
  if (clean.includes('\\') || /\p{Cc}/u.test(clean) || /[\s?#]/.test(clean)) {
    return false;
  }
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(clean)) return false;
  if (/%(?:2e|2f|5c|00)/i.test(clean)) return false;
  return true;
}

export function resolveRevalidationTargets(input: RevalidationTargetsInput): {
  tags: string[];
  paths: string[];
} {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const tagSet = new Set<string>();
  const pathSet = new Set<string>();

  const rawTags = Array.isArray(safeInput.tags) ? safeInput.tags : [];
  for (const tag of rawTags.slice(0, 50)) {
    if (typeof tag !== 'string') continue;
    const clean = tag.trim().toLowerCase();
    if (
      clean &&
      SAFE_CACHE_TAG_REGEX.test(clean) &&
      !/(?:^|:)\.\.?$|(?:^|:)[.:]+$/.test(clean)
    ) {
      tagSet.add(clean);
    }
  }
  const rawSlugs = Array.isArray(safeInput.slugs) ? safeInput.slugs : [];
  for (const slug of rawSlugs.slice(0, 50)) {
    if (typeof slug !== 'string') continue;
    const clean = slug.trim();
    if (
      !clean ||
      clean.length > 120 ||
      !SAFE_ENTITY_TOKEN_REGEX.test(clean) ||
      clean.startsWith('.') ||
      clean.endsWith('.') ||
      clean.includes('..')
    ) {
      continue;
    }
    tagSet.add(productCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.OFFERS);
    tagSet.add(RATE_CACHE_TAGS.PRICE_HISTORY);
    tagSet.add(RATE_CACHE_TAGS.REVIEWS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  const rawCategories = Array.isArray(safeInput.categories)
    ? safeInput.categories
    : [];
  for (const cat of rawCategories.slice(0, 20)) {
    if (typeof cat !== 'string') continue;
    const clean = cat.trim();
    if (
      !clean ||
      clean.length > 60 ||
      !SAFE_ENTITY_TOKEN_REGEX.test(clean) ||
      clean.startsWith('.') ||
      clean.endsWith('.') ||
      clean.includes('..')
    ) {
      continue;
    }
    tagSet.add(categoryCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.CATEGORIES);
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  const rawMerchants = Array.isArray(safeInput.merchants)
    ? safeInput.merchants
    : [];
  for (const merchantId of rawMerchants.slice(0, 50)) {
    if (typeof merchantId !== 'string') continue;
    const clean = merchantId.trim();
    if (
      !clean ||
      clean.length > 120 ||
      !SAFE_MERCHANT_IDENTIFIER_REGEX.test(clean) ||
      clean.startsWith('.') ||
      clean.endsWith('.') ||
      clean.startsWith(':') ||
      clean.endsWith(':') ||
      clean.includes('..')
    ) {
      continue;
    }
    tagSet.add(merchantCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.MERCHANTS);
    tagSet.add(RATE_CACHE_TAGS.OFFERS);
    tagSet.add(RATE_CACHE_TAGS.PRICE_HISTORY);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  const rawPaths = Array.isArray(safeInput.paths) ? safeInput.paths : [];
  for (const p of rawPaths.slice(0, 50)) {
    if (typeof p !== 'string') continue;
    const clean = p.trim();
    if (isSafeRevalidationPath(clean)) {
      pathSet.add(clean);
    }
  }

  return {
    tags: [...tagSet],
    paths: [...pathSet],
  };
}

export interface RateDataCacheOptions {
  readonly revalidate: number;
  readonly tags: readonly string[];
}

/**
 * Cross-request Next.js Data Cache wrapper (`unstable_cache`) with graceful fallback
 * when invoked outside the Next.js incrementalCache runtime (e.g., standalone `tsx` tests).
 */
export function withRateDataCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: readonly string[],
  options: RateDataCacheOptions
): (...args: TArgs) => Promise<TResult> {
  const cachedFn = unstable_cache(fn, [...keyParts], {
    revalidate: options.revalidate,
    tags: [...options.tags],
  });

  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await cachedFn(...args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('incrementalCache') ||
        msg.includes('Invariant: incrementalCache missing') ||
        msg.includes('static generation store')
      ) {
        return fn(...args);
      }
      throw err;
    }
  };
}
