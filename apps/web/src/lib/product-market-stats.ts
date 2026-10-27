/**
 * One source of truth for a product's "from" price, price range and seller
 * count (DOS/Rate#1141): the stored master stats. The database writes them in
 * rate.refresh_master_market_stats from crawled, in-stock listings, without
 * bait prices (DOS/Rate#802), and the catalogue cards, compare, versus, the
 * catalogue search and sort and the public API all read them. The product
 * page, its metadata and its JSON-LD read them through this helper too.
 *
 * The product page's offer list is not that source: it also holds sold-out
 * and discontinued listings at their last price, so computing from it showed
 * a lower price and more sellers than every other page.
 */
import { MAX_VALID_VND_PRICE } from './rate-domain-core';

export interface ProductMarketStats {
  /** Lowest price of an in-stock listing, 0 when none is known. */
  minPrice: number;
  /** Highest price of an in-stock listing, never below minPrice. */
  maxPrice: number;
  /** Distinct merchants with a priced in-stock listing. */
  sellerCount: number;
}

/** Listing states rate.products.availability can hold. */
export type OfferAvailability = 'in_stock' | 'out_of_stock' | 'discontinued';

function toStoredPrice(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim())
        : NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_VALID_VND_PRICE ? n : 0;
}

export function productMarketStats(
  product: {
    min_price?: unknown;
    max_price?: unknown;
    merchant_count?: unknown;
  } | null
): ProductMarketStats {
  const minPrice = toStoredPrice(product?.min_price);
  const storedMax = toStoredPrice(product?.max_price);
  const rawCount = Number(product?.merchant_count);
  const sellerCount =
    minPrice > 0 && Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(Math.floor(rawCount), 100_000)
      : 0;
  return {
    minPrice,
    maxPrice: minPrice > 0 ? Math.max(minPrice, storedMax) : 0,
    sellerCount,
  };
}

/**
 * Whether the retailer last reported the listing as not buyable. Such a
 * listing keeps its last price but is not counted in the stored stats. An
 * unknown availability (not read) counts as in stock, as the database's
 * default does.
 */
export function isOfferUnavailable(offer: {
  availability?: OfferAvailability | null;
}): boolean {
  return (
    offer?.availability === 'out_of_stock' ||
    offer?.availability === 'discontinued'
  );
}

export function toOfferAvailability(raw: unknown): OfferAvailability | null {
  return raw === 'in_stock' || raw === 'out_of_stock' || raw === 'discontinued'
    ? raw
    : null;
}
