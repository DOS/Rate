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

export function canonicalizeCacheParams(value: unknown): string {
  if (value === null || value === undefined) {
    return '{}';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeCacheParams(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    return `{${entries
      .map(
        ([key, val]) => `${JSON.stringify(key)}:${canonicalizeCacheParams(val)}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
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

  for (const tag of input.tags ?? []) {
    const clean = tag.trim();
    if (clean) tagSet.add(clean);
  }
  for (const slug of input.slugs ?? []) {
    const clean = slug.trim();
    if (!clean) continue;
    tagSet.add(productCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.OFFERS);
    tagSet.add(RATE_CACHE_TAGS.PRICE_HISTORY);
    tagSet.add(RATE_CACHE_TAGS.REVIEWS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  for (const cat of input.categories ?? []) {
    const clean = cat.trim();
    if (!clean) continue;
    tagSet.add(categoryCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.CATEGORIES);
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  for (const merchantId of input.merchants ?? []) {
    const clean = merchantId.trim();
    if (!clean) continue;
    tagSet.add(merchantCacheTag(clean));
    tagSet.add(RATE_CACHE_TAGS.MERCHANTS);
    tagSet.add(RATE_CACHE_TAGS.OFFERS);
    tagSet.add(RATE_CACHE_TAGS.PRICE_HISTORY);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
    tagSet.add(RATE_CACHE_TAGS.STATS);
  }
  for (const p of input.paths ?? []) {
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
