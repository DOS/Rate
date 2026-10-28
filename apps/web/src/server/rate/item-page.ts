import 'server-only';
import { cache } from 'react';
import {
  getItemUnknownVariantOffers as _getItemUnknownVariantOffers,
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
  return {
    item,
    variants: loaded.filter((v): v is ItemPageVariant => v !== null),
    unknownOffers,
  };
}
