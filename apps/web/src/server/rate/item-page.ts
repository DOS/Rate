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
import {
  RATE_CACHE_TAGS,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';

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
 * master is gone is left out rather than shown empty.
 */
export async function loadItemPageContext(
  item: RateItem,
  variants: readonly RateItemVariant[]
): Promise<ItemPageContext> {
  const [loaded, unknownOffers] = await Promise.all([
    Promise.all(
      variants.map(async (variant): Promise<ItemPageVariant | null> => {
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
      })
    ),
    _getCachedUnknownOffers(item.id, item.slug),
  ]);
  return {
    item,
    variants: loaded.filter((v): v is ItemPageVariant => v !== null),
    unknownOffers,
  };
}
