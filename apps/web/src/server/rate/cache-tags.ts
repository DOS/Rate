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
