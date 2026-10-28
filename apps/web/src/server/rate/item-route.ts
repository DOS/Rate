import 'server-only';
import { cache } from 'react';
import {
  ItemModelUnavailableError,
  RateDataUnavailableError,
  getItemVariants as _getItemVariants,
  getRateClient,
  resolveCatalogSlug as _resolveCatalogSlug,
  type RateItem,
} from '../../lib/rate-api';
import { createLogger } from '@/lib/logger';
import { isCanonicalCategorySlug } from '@/lib/rate-domain-core';
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

// Category id to slug, as pairs (the Data Cache stores JSON).
const _getCachedCategorySlugs = cache(() =>
  withRateDataCache(
    async (): Promise<Array<[string, string]>> => {
      const { data, error } = await getRateClient()
        .from('categories')
        .select('id, slug');
      if (error) throw new RateDataUnavailableError('categories', error);
      return ((data ?? []) as Array<{ id: string; slug: string }>).map((c) => [
        c.id,
        c.slug,
      ]);
    },
    ['rate-category-slugs'],
    { revalidate: 3600, tags: [RATE_CACHE_TAGS.CATEGORIES] }
  )()
);

/**
 * The Item's category path (`/tablets`): null when it has no category, false
 * when its category is no catalogue category (DOS/Rate#1281).
 */
async function itemCategoryPath(
  item: RateItem
): Promise<string | null | false> {
  if (!item.category_id) return null;
  let slug = new Map(await _getCachedCategorySlugs()).get(item.category_id);
  if (slug === undefined) {
    // A category newer than the cached map: read it before calling the Item
    // lost; a read error is thrown, never a 404.
    const { data, error } = await getRateClient()
      .from('categories')
      .select('slug')
      .eq('id', item.category_id)
      .maybeSingle();
    if (error) throw new RateDataUnavailableError('categories', error);
    slug = (data as { slug?: string } | null)?.slug;
  }
  return slug && isCanonicalCategorySlug(slug) ? `/${slug}` : false;
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
      itemCategoryPath: resolution?.item
        ? await itemCategoryPath(resolution.item)
        : null,
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
