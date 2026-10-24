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
  return `rate:product:${slug.trim().toLowerCase()}`;
}

export function categoryCacheTag(categorySlug: string): string {
  return `rate:category:${categorySlug.trim().toLowerCase()}`;
}

export function merchantCacheTag(merchantId: string): string {
  return `rate:merchant:${merchantId.trim().toLowerCase()}`;
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

export function canonicalizeCacheParams(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>()
): string {
  if (value === null || value === undefined) {
    return depth === 0 ? '{}' : 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
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
      .filter(([, val]) => val !== undefined)
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
  // eslint-disable-next-line no-control-regex -- rejecting control characters in revalidation paths
  if (clean.includes('\\') || /[\u0000-\u001F\u007F?#]/.test(clean)) {
    return false;
  }
  if (/(?:^|\/)\.\.(?:\/|$)/.test(clean)) return false;
  return true;
}

export function resolveRevalidationTargets(input: RevalidationTargetsInput): {
  tags: string[];
  paths: string[];
} {
  const tagSet = new Set<string>();
  const pathSet = new Set<string>();

  for (const tag of (input.tags ?? []).slice(0, 50)) {
    if (typeof tag !== 'string') continue;
    const clean = tag.trim().toLowerCase();
    if (clean && SAFE_CACHE_TAG_REGEX.test(clean)) {
      tagSet.add(clean);
    }
  }
  for (const slug of (input.slugs ?? []).slice(0, 50)) {
    if (typeof slug !== 'string') continue;
    const clean = slug.trim();
    if (!clean || clean.length > 120 || !SAFE_ENTITY_TOKEN_REGEX.test(clean)) {
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
  for (const cat of (input.categories ?? []).slice(0, 20)) {
    if (typeof cat !== 'string') continue;
    const clean = cat.trim();
    if (!clean || clean.length > 60 || !SAFE_ENTITY_TOKEN_REGEX.test(clean)) {
      continue;
    }
    tagSet.add(categoryCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.CATEGORIES);
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  for (const merchantId of (input.merchants ?? []).slice(0, 50)) {
    if (typeof merchantId !== 'string') continue;
    const clean = merchantId.trim();
    if (
      !clean ||
      clean.length > 120 ||
      !SAFE_MERCHANT_IDENTIFIER_REGEX.test(clean)
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
  for (const p of (input.paths ?? []).slice(0, 50)) {
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
