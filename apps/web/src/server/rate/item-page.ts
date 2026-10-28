import 'server-only';
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
import { isOfferUnavailable } from '@/lib/product-market-stats';
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
        offers
          .map((o) => `${o.id}:${o.price_current}:${o.price_original ?? ''}`)
          .join('|'),
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
