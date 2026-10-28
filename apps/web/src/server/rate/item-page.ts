import 'server-only';
import { createHash } from 'node:crypto';
import { cache } from 'react';
import {
  getItemUnknownVariantOffers as _getItemUnknownVariantOffers,
  getMasterProductPriceHistory as _getPriceHistoryForOffers,
  type MasterProduct,
  type MerchantOffer,
  type MasterProductPriceHistorySummary,
  type RateItem,
  type RateItemVariant,
} from '../../lib/rate-api';
import {
  computeProductRadarSignal,
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
} from '@/server/rate';
import type { RadarSignal } from '@/lib/deal-radar';
import {
  isOfferUnavailable,
  productMarketStats,
} from '@/lib/product-market-stats';
import type { ProductSpecifications } from '@repo/shared-data';
import type { ItemSizePanelData } from '@/lib/item-size-panel';
import {
  listingCountForSaleState,
  masterSaleState,
  saleStateLabelKey,
} from '@/lib/sale-state';
import { productImageUrl } from '@/lib/rate-domain-core';
import { isItemModelOn } from './item-model';
import { getCachedCatalogSlugResolution } from './item-route';
import { ItemModelUnavailableError } from '../../lib/rate-api';
import { createLogger } from '@/lib/logger';
import {
  RATE_CACHE_TAGS,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';

const log = createLogger('server.item-page');

/** One size of an Item with the data its offers and history panels need. */
export interface ItemPageVariant {
  variant: RateItemVariant;
  product: MasterProduct;
  offers: MerchantOffer[];
  priceHistory: MasterProductPriceHistorySummary;
  radarSignal: RadarSignal;
}

export interface ItemPageContext {
  item: RateItem;
  /** Sizes with a published master, in display order. */
  variants: ItemPageVariant[];
  /** Listings of the Item whose size is not stated (Q2): never a "from". */
  unknownOffers: MerchantOffer[];
  /** The price-history verdict of each of those listings (DOS/Rate#1281). */
  unknownByOffer: MasterProductPriceHistorySummary['byOffer'];
}

/**
 * The size an Item URL renders: the planned one while its read succeeded,
 * else the first loaded size with a price, else the first loaded size. Null
 * when no size loaded, and the page reads the planned size as before.
 */
export function pickRenderedSize(
  loaded: readonly ItemPageVariant[],
  plannedSlug: string
): ItemPageVariant | null {
  return (
    loaded.find((v) => v.variant.slug === plannedSlug) ??
    loaded.find((v) => Number(v.product.min_price) > 0) ??
    loaded[0] ??
    null
  );
}

const _getCachedUnknownOffers = cache((itemId: string, itemSlug: string) =>
  withRateDataCache(
    _getItemUnknownVariantOffers,
    ['rate-item-unknown', itemId],
    {
      revalidate: 300,
      tags: [
        RATE_CACHE_TAGS.PRODUCTS,
        RATE_CACHE_TAGS.OFFERS,
        productCacheTag(itemSlug),
      ],
    }
  )(itemId)
);

// The history verdicts of the unknown-size listings, keyed by Item and by the
// listings' current prices, like a variant's history (DOS/Rate#1281). Only
// `byOffer` is used, so the all-time low/high reads are skipped.
const _getCachedUnknownByOffer = cache(
  (itemId: string, itemSlug: string, offers: MerchantOffer[]) =>
    withRateDataCache(
      async (id: string) =>
        (await _getPriceHistoryForOffers(id, offers, { allTime: false }))
          .byOffer,
      [
        'rate-item-unknown-history',
        itemId,
        // A hash, so the key stays short however many listings there are.
        createHash('sha256')
          .update(
            offers
              .map(
                (o) => `${o.id}:${o.price_current}:${o.price_original ?? ''}`
              )
              .join('|')
          )
          .digest('hex'),
      ],
      {
        revalidate: 600,
        tags: [
          RATE_CACHE_TAGS.PRICE_HISTORY,
          RATE_CACHE_TAGS.OFFERS,
          productCacheTag(itemSlug),
        ],
      }
    )(itemId)
);

/**
 * Everything the Item page shows per size, read through the same cached
 * per-master readers as the variant pages (DOS/Rate#1154). A size whose
 * master is gone, or whose read fails, is left out rather than shown with no
 * offers; so is the "storage not stated" group when its read fails. The size
 * the page renders is read again by the page itself, which fails as before.
 */
export async function loadItemPageContext(
  item: RateItem,
  variants: readonly RateItemVariant[]
): Promise<ItemPageContext> {
  const [loaded, unknownOffers] = await Promise.all([
    Promise.all(
      variants.map(async (variant): Promise<ItemPageVariant | null> => {
        try {
          const product = await getCachedMasterProductBySlug(variant.slug);
          if (!product) return null;
          const offers = await getCachedMasterProductOffers(product.id);
          const priceHistory = await getCachedMasterProductPriceHistory(
            product.id,
            offers
          );
          const inStock = offers.filter((o) => !isOfferUnavailable(o));
          return {
            variant,
            product,
            offers,
            priceHistory,
            radarSignal: computeProductRadarSignal(product, inStock),
          };
        } catch (err) {
          log.error('item size read failed; size left out', {
            item: item.slug,
            variant: variant.slug,
            message: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      })
    ),
    _getCachedUnknownOffers(item.id, item.slug).catch((err: unknown) => {
      log.error('unknown-size offers read failed; group left out', {
        item: item.slug,
        message: err instanceof Error ? err.message : String(err),
      });
      return [] as MerchantOffer[];
    }),
  ]);
  const unknownByOffer =
    unknownOffers.length === 0
      ? {}
      : await _getCachedUnknownByOffer(item.id, item.slug, unknownOffers).catch(
          (err: unknown) => {
            log.error('unknown-size history read failed; no verdicts', {
              item: item.slug,
              message: err instanceof Error ? err.message : String(err),
            });
            return {};
          }
        );
  return {
    item,
    variants: loaded.filter((v): v is ItemPageVariant => v !== null),
    unknownOffers,
    unknownByOffer,
  };
}

/**
 * One size's panels as plain data (DOS/Rate#1285): what the price strip, the
 * history chart and the offer table need, with the same stats and sale state
 * the server-rendered panels use.
 */
export function toItemSizePanelData(v: {
  product: MasterProduct;
  offers: MerchantOffer[];
  priceHistory: MasterProductPriceHistorySummary;
  radarSignal: RadarSignal;
}): ItemSizePanelData {
  const inStock = v.offers.filter((o) => !isOfferUnavailable(o));
  const stats = productMarketStats(v.product);
  const saleState = masterSaleState({
    minPrice: stats.minPrice,
    listingCount: listingCountForSaleState(v.offers.length, inStock.length),
    metadata: v.product.metadata,
    availabilityStatus: (v.product.specifications as ProductSpecifications)
      ?.availability?.status,
  });
  return {
    product: {
      id: v.product.id,
      slug: v.product.slug,
      name: v.product.name,
      brand: v.product.brand,
      model_key: v.product.model_key,
      image: productImageUrl(v.product),
    },
    offers: v.offers,
    priceHistory: v.priceHistory,
    radarSignal: v.radarSignal,
    stats: {
      minPrice: stats.minPrice,
      maxPrice: stats.maxPrice,
      sellerCount: stats.sellerCount,
    },
    saleState,
    saleStateKey: saleState === 'on_sale' ? null : saleStateLabelKey(saleState),
  };
}

/** About how many bytes the given sizes' panel data adds to a page. */
export function itemSizePanelBytes(
  variants: readonly ItemPageVariant[]
): number {
  return variants.reduce(
    (sum, v) =>
      sum +
      // UTF-8 bytes, as sent: Vietnamese titles take more than one each.
      Buffer.byteLength(JSON.stringify(v.offers), 'utf8') +
      Buffer.byteLength(JSON.stringify(v.priceHistory), 'utf8'),
    0
  );
}

/**
 * One size's panel data for `/api/v1/rate/item-size/{slug}`, through the same
 * cached readers as the page. Null while `RATE_ITEM_MODEL` is off or the
 * Item tables are missing, and for a slug that is no published size of a
 * published Item (a draft Item, a retired size, a master with no Item).
 */
export async function loadItemSizePanel(
  variantSlug: string
): Promise<ItemSizePanelData | null> {
  if (!isItemModelOn()) return null;
  let resolution;
  try {
    resolution = await getCachedCatalogSlugResolution(variantSlug);
  } catch (err) {
    if (err instanceof ItemModelUnavailableError) return null;
    throw err;
  }
  if (resolution?.kind !== 'variant' || resolution.retired) return null;
  const product = await getCachedMasterProductBySlug(variantSlug);
  if (!product) return null;
  const offers = await getCachedMasterProductOffers(product.id);
  const priceHistory = await getCachedMasterProductPriceHistory(
    product.id,
    offers
  );
  const inStock = offers.filter((o) => !isOfferUnavailable(o));
  return toItemSizePanelData({
    product,
    offers,
    priceHistory,
    radarSignal: computeProductRadarSignal(product, inStock),
  });
}
