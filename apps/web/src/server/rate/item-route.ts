import 'server-only';
import { cache } from 'react';
import {
  ItemModelUnavailableError,
  getItemVariants as _getItemVariants,
  resolveCatalogSlug as _resolveCatalogSlug,
  type RateItem,
} from '../../lib/rate-api';
import { createLogger } from '@/lib/logger';
import {
  RATE_CACHE_TAGS,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';
import { isItemModelOn, planItemRoute, type ItemRoutePlan } from './item-model';

const log = createLogger('server.item-route');

// Cached like the variant pages: refreshed every 5 minutes, or when the slug's
// (or its Item's) product tag is revalidated (DOS/Rate#1153).
const _getCachedCatalogSlug = cache((slug: string) =>
  withRateDataCache(_resolveCatalogSlug, ['rate-catalog-slug', slug], {
    revalidate: 300,
    tags: [RATE_CACHE_TAGS.PRODUCTS, productCacheTag(slug)],
  })(slug)
);

const _getCachedItemVariants = cache((itemId: string, itemSlug: string) =>
  withRateDataCache(_getItemVariants, ['rate-item-variants', itemId], {
    revalidate: 300,
    tags: [RATE_CACHE_TAGS.PRODUCTS, productCacheTag(itemSlug)],
  })(itemId)
);

export function getCachedItemVariants(item: RateItem) {
  return _getCachedItemVariants(item.id, item.slug);
}

/**
 * The Item route for a product URL, or null while `RATE_ITEM_MODEL` is off,
 * or while the Item tables are missing (M1+M2 not applied): then the page is
 * exactly as before. The query string is never read, so product pages keep
 * their ISR cache: an Item URL renders its default variant, and `?v=` (which
 * the redirects carry) is applied on the client by the Item page (#1154).
 */
export async function resolveItemRoute(input: {
  slug: string;
  categoryBasePath: string;
}): Promise<ItemRoutePlan | null> {
  if (!isItemModelOn()) return null;
  try {
    const resolution = await _getCachedCatalogSlug(input.slug);
    // Variants are read only for a URL that renders: an Item URL, or a
    // single-variant Item sharing its variant's slug.
    const renders =
      resolution?.kind === 'item' ||
      (resolution?.kind === 'variant' && resolution.item.slug === input.slug);
    const variants =
      renders && resolution.item
        ? await getCachedItemVariants(resolution.item)
        : [];
    const plan = planItemRoute({
      resolution,
      requestedSlug: input.slug,
      requestedVariant: null,
      categoryBasePath: input.categoryBasePath,
      variants,
    });
    return plan.kind === 'legacy' ? null : plan;
  } catch (err) {
    if (err instanceof ItemModelUnavailableError) {
      log.warn(
        'item model on but its tables are missing; serving variant pages',
        {
          slug: input.slug,
          message: err.message,
        }
      );
      return null;
    }
    throw err;
  }
}
