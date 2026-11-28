import 'server-only';
import { revalidateTag } from 'next/cache';
import { BoundedSlidingWindowRateLimiter } from './api-handler';
import { masterReviewsCacheTag, productCacheTag } from './cache-tags';
import type { AuthenticatedRateRequest } from './request-auth';

// Cache flushes per reviewer (DOS/Rate#1962): an accepted review revalidates
// its product's review caches and page, at most this often per account on one
// instance (the same limit as a vote, DOS/Rate#1306). Reviews past it still
// count; the caches catch up at their own revalidate interval.
const reviewSubmissionRevalidationLimiter = new BoundedSlidingWindowRateLimiter(
  {
    windowMs: 60_000,
    maxRequests: 6,
    maxBuckets: 5_000,
  }
);

/**
 * The cache tags of one product (variant master) a new review changes: its
 * reviews and review summary, and its page. The page tag needs the master's
 * slug; when it cannot be read only the reviews tag is returned and the page
 * catches up on its own interval.
 */
export async function masterReviewCacheTags(
  rateClient: AuthenticatedRateRequest['rateClient'],
  masterProductId: string
): Promise<string[]> {
  const tags = [masterReviewsCacheTag(masterProductId)];
  try {
    const { data: master } = await rateClient
      .from('master_products')
      .select('slug')
      .eq('id', masterProductId)
      .maybeSingle();
    if (master?.slug) tags.push(productCacheTag(master.slug));
  } catch {
    // Keep the reviews tag; the product page revalidates on its own.
  }
  return tags;
}

/**
 * Flushes this product's review caches and page after an accepted review
 * (DOS/Rate#1962), not the site-wide REVIEWS / PRODUCTS / STATS tags: any
 * signed-in account could otherwise keep the whole catalogue's cache cold.
 * Global lists and stats catch up on their own interval, as after a vote.
 * Returns the tags flushed (none when the reviewer is past the flush limit).
 */
export async function revalidateSubmittedReview(
  rateClient: AuthenticatedRateRequest['rateClient'],
  userId: string,
  masterProductId: string,
  revalidate: (tag: string, profile: 'max') => void = revalidateTag
): Promise<string[]> {
  if (!reviewSubmissionRevalidationLimiter.allow(userId)) return [];
  const tags = await masterReviewCacheTags(rateClient, masterProductId);
  for (const tag of tags) {
    try {
      revalidate(tag, 'max');
    } catch {
      // Ignore revalidateTag errors outside Next.js request context
    }
  }
  return tags;
}
