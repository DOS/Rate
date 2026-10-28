import 'server-only';
import { createHash } from 'node:crypto';
import type { MasterProduct } from '@repo/shared-data';
import {
  ItemModelUnavailableError,
  countPublishedItems as _countPublishedItems,
  getCategoryItemBrandFacets as _getCategoryItemBrandFacets,
  getItemLinksForMasters as _getItemLinksForMasters,
  getItemSlugByVariantSlug as _getItemSlugByVariantSlug,
  type MasterItemLink,
} from '../../lib/rate-api';
import {
  groupRowsByItem,
  sortItemRows,
  type ItemCatalogRow,
} from '@/lib/item-directory';
import { createLogger } from '@/lib/logger';
import { RATE_CACHE_TAGS, withRateDataCache } from './cache-tags';
import { isItemModelOn } from './item-model';

// Directory, leaderboard, facets, stats and sitemap per Item while
// `RATE_ITEM_MODEL` is on (DOS/Rate#1155). With the flag off, or with the
// Item tables missing (M1+M2 not applied), every helper here gives back what
// the caller already had, so pages render exactly as before.

const log = createLogger('server.item-directory');

/** Runs `read` under the Item model; null when it is off or unavailable. */
export async function whenItemModel<T>(
  what: string,
  read: () => Promise<T>
): Promise<T | null> {
  if (!isItemModelOn()) return null;
  try {
    return await read();
  } catch (err) {
    // Any failed Item read shows the variant pages, which still work: a
    // listing, facet or stats outage must not follow from the Item layer.
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ItemModelUnavailableError) {
      log.warn('item model unavailable, showing variants', { what, message });
    } else {
      log.error('item read failed, showing variants', { what, message });
    }
    return null;
  }
}

// Keyed by the master ids (hashed: a page holds up to 500), refreshed with
// the product data the rows came from.
const getCachedItemLinks = async (
  masterIds: readonly string[]
): Promise<Map<string, MasterItemLink>> => {
  const ids = Array.from(new Set(masterIds)).sort();
  const key = createHash('sha256').update(ids.join(',')).digest('hex');
  const entries = await withRateDataCache(
    async (list: string[]) => [...(await _getItemLinksForMasters(list))],
    ['rate-item-links', key],
    { revalidate: 300, tags: [RATE_CACHE_TAGS.PRODUCTS] }
  )(ids);
  return new Map(entries);
};

/**
 * Catalogue rows grouped into one row per Item (one card, one leaderboard
 * slot); the rows unchanged while the Item model is off.
 */
export async function groupCatalogRowsByItem<T extends MasterProduct>(
  rows: readonly T[]
): Promise<Array<T & ItemCatalogRow>> {
  const grouped = await whenItemModel('catalogue rows', async () =>
    groupRowsByItem(
      rows,
      await getCachedItemLinks(rows.map((r) => r.id).filter(Boolean))
    )
  );
  return grouped ?? (rows as Array<T & ItemCatalogRow>);
}

// The catalogue read returns at most 500 variants; a category is read in
// batches until one comes back short. 20 batches (10,000 variants) is far
// above the catalogue; past it the page is cut and logged.
const CATALOG_BATCH_SIZE = 500;
const MAX_CATALOG_BATCHES = 20;

/**
 * One page of Item cards, or null while the Item model is off. Every
 * matching variant is read (`readBatch(offset, limit)`, in batches), grouped
 * into Items, ordered by the Item's price for price sorts, and only then
 * cut, so a page holds `limit` Items and no Item falls between pages.
 */
export async function getItemCatalogPage<T extends MasterProduct>(
  readBatch: (offset: number, limit: number) => Promise<T[]>,
  offset: number,
  limit: number,
  sort?: string
): Promise<Array<T & ItemCatalogRow> | null> {
  return whenItemModel('catalogue page', async () => {
    const rows: T[] = [];
    for (let batch = 0; ; batch++) {
      if (batch === MAX_CATALOG_BATCHES) {
        log.warn('item catalogue read cut', { variants: rows.length });
        break;
      }
      const page = await readBatch(
        batch * CATALOG_BATCH_SIZE,
        CATALOG_BATCH_SIZE
      );
      rows.push(...page);
      if (page.length < CATALOG_BATCH_SIZE) break;
    }
    // The variants are read already: if the Item links fail, this page is
    // the variant page the caller would read again (same filters, sort and
    // window), so it is cut from them instead (#1275).
    const links = await getCachedItemLinks(
      rows.map((r) => r.id).filter(Boolean)
    ).catch((err: unknown) => {
      log.warn('item links unavailable, showing variants', {
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (!links) {
      return rows.slice(offset, offset + limit) as Array<T & ItemCatalogRow>;
    }
    return sortItemRows(groupRowsByItem(rows, links), sort).slice(
      offset,
      offset + limit
    );
  });
}

/** Brand facets counted in Items for a category, or null when off. */
export function getItemBrandFacets(categoryId: string, categorySlug: string) {
  return whenItemModel('brand facets', () =>
    withRateDataCache(
      _getCategoryItemBrandFacets,
      ['rate-item-brand-facets', categoryId],
      {
        revalidate: 600,
        tags: [RATE_CACHE_TAGS.PRODUCTS, RATE_CACHE_TAGS.CATEGORIES],
      }
    )(categoryId).then((brands) => ({ brands, categorySlug }))
  );
}

/** Published Items ("products tracked"), or null when off. */
export function getItemCount() {
  return whenItemModel('item count', () =>
    withRateDataCache(_countPublishedItems, ['rate-item-count'], {
      revalidate: 600,
      tags: [RATE_CACHE_TAGS.STATS, RATE_CACHE_TAGS.PRODUCTS],
    })()
  );
}

/** Variant slug to Item slug for the sitemap, or null when off. */
export function getItemSlugByVariantSlug() {
  return whenItemModel('sitemap item slugs', async () => {
    const entries = await withRateDataCache(
      async () => [...(await _getItemSlugByVariantSlug())],
      ['rate-item-slug-by-variant'],
      { revalidate: 3600, tags: [RATE_CACHE_TAGS.PRODUCTS] }
    )();
    return new Map(entries);
  });
}
