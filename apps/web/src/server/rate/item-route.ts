import 'server-only';
import { cache } from 'react';
import {
  getItemVariants as _getItemVariants,
  resolveCatalogSlug as _resolveCatalogSlug,
  type RateItem,
} from '../../lib/rate-api';
import {
  RATE_CACHE_TAGS,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';
import {
  isItemModelOn,
  planItemRoute,
  sanitizeVariantParam,
  type ItemRoutePlan,
} from './item-model';

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
 * The Item route for a product URL, or null while `RATE_ITEM_MODEL` is off:
 * then nothing here reads the database or the query string, so the page
 * renders exactly as before (and stays statically cached). `searchParams`
 * is read only for an Item slug, where `?v=` picks the variant.
 */
export async function resolveItemRoute(input: {
  slug: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  categoryBasePath: string;
}): Promise<ItemRoutePlan | null> {
  if (!isItemModelOn()) return null;
  const resolution = await _getCachedCatalogSlug(input.slug);
  let requestedVariant: string | null = null;
  let variants: Awaited<ReturnType<typeof getCachedItemVariants>> = [];
  if (resolution?.kind === 'item') {
    const [params, itemVariants] = await Promise.all([
      input.searchParams ?? Promise.resolve({}),
      getCachedItemVariants(resolution.item),
    ]);
    requestedVariant = sanitizeVariantParam(
      (params as Record<string, unknown>).v
    );
    variants = itemVariants;
  }
  return planItemRoute({
    resolution,
    requestedSlug: input.slug,
    requestedVariant,
    categoryBasePath: input.categoryBasePath,
    variants,
  });
}
