/**
 * Bait-price detection (DOS/Rate#797). A listing far below what every other
 * store asks for the same model is almost never a real deal: it is a
 * counterfeit, an accessory or a bait listing. Such offers must not set a
 * product's "from" price or the deal radar's market floor.
 *
 * The database applies the same rule to rate.master_products.min_price in
 * rate.refresh_master_market_stats (DOS-Me migration
 * 20261024060000_rate_master_min_price_plausible.sql): change both together.
 */
import { MAX_VALID_VND_PRICE } from './price-limits.js';

/** An offer below this share of the other offers' median is implausible. */
export const IMPLAUSIBLY_LOW_RATIO = 0.4;
/** Fewer offers than this are too few to call one an outlier. */
export const MIN_OFFERS_FOR_OUTLIER = 3;
/** Maximum plausible VND listing price: the shared 1B VND ceiling. */
export const MAX_PLAUSIBLE_VND_PRICE = MAX_VALID_VND_PRICE;

function toSafePlausiblePrice(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return NaN;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return NaN;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_VND_PRICE
      ? n
      : NaN;
  }
  return Number.isFinite(raw) && raw > 0 && raw <= MAX_PLAUSIBLE_VND_PRICE
    ? raw
    : NaN;
}

function isValidPlausiblePrice(price: unknown): price is number {
  return (
    typeof price === 'number' &&
    Number.isFinite(price) &&
    price > 0 &&
    price <= MAX_PLAUSIBLE_VND_PRICE
  );
}

/**
 * Indexes of the prices that are implausibly low against the lower median of
 * the other prices: the lower median, so one overpriced listing cannot pull
 * the reference up and hide a real deal. Non-positive or non-finite prices
 * are ignored, never flagged. Sorts once: O(n log n).
 */
export function implausiblyLowIndexes(prices: readonly number[]): Set<number> {
  if (!Array.isArray(prices)) return new Set<number>();
  const sorted = prices
    .map((price, index) => ({ price: toSafePlausiblePrice(price), index }))
    .filter(({ price }) => isValidPlausiblePrice(price))
    .sort((a, b) => a.price - b.price);
  const flagged = new Set<number>();
  const m = sorted.length;
  if (m < MIN_OFFERS_FOR_OUTLIER) return flagged;
  // Lower median of the m - 1 others: position L of the others, which is
  // position L of the sorted list before k and L + 1 from k on.
  const L = Math.floor((m - 2) / 2);
  for (let k = 0; k < m; k++) {
    const reference = sorted[L < k ? L : L + 1]!.price;
    if (sorted[k]!.price < reference * IMPLAUSIBLY_LOW_RATIO) {
      flagged.add(sorted[k]!.index);
    }
  }
  return flagged;
}

/**
 * Whether a price seen outside the offer list (a shopper's page, an inspect
 * query) is implausibly low against the lower median of the given offers.
 * Needs at least two priced offers to compare with.
 */
export function isImplausiblyLowPrice(
  price: number,
  offers: readonly { price_current: number }[]
): boolean {
  const numPrice = toSafePlausiblePrice(price);
  if (!isValidPlausiblePrice(numPrice) || !Array.isArray(offers)) return false;
  const sorted = offers
    .map((o) => toSafePlausiblePrice(o?.price_current))
    .filter((p) => isValidPlausiblePrice(p))
    .sort((a, b) => a - b);
  if (sorted.length < MIN_OFFERS_FOR_OUTLIER - 1) return false;
  const lowerMedian = sorted[Math.floor((sorted.length - 1) / 2)]!;
  return numPrice < lowerMedian * IMPLAUSIBLY_LOW_RATIO;
}

/** The offers minus the implausibly low ones, in their original order. */
export function plausibleOffers<T extends { price_current: number }>(
  offers: readonly T[]
): T[] {
  if (!Array.isArray(offers)) return [];
  const flagged = implausiblyLowIndexes(offers.map((o) => o?.price_current));
  return offers.filter(
    (o, index): o is T =>
      Boolean(o && typeof o === 'object' && !Array.isArray(o)) &&
      !flagged.has(index)
  );
}

function trimOfferString(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\p{Cc}+/gu, '').trim() : '';
}

function cleanOfferId(raw: unknown): string {
  const id = trimOfferString(raw);
  if (
    !id ||
    !/^[a-zA-Z0-9:._-]{1,256}$/.test(id) ||
    !/[a-zA-Z0-9]/.test(id) ||
    /^[.:]|[.:]$/.test(id) ||
    id.includes('..') ||
    id.includes('::') ||
    /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(id)
  ) {
    return '';
  }
  return id;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSetLookup(
  flaggedIds: ReadonlySet<string> | null | undefined
): flaggedIds is ReadonlySet<string> {
  return Boolean(flaggedIds) && typeof flaggedIds?.has === 'function';
}

function isUnavailableStatus(availability: unknown): boolean {
  return availability === 'out_of_stock' || availability === 'discontinued';
}

/**
 * Canonicalizes an offer identifier so Set lookups match implausiblyLowOfferIds
 * even when raw IDs carry whitespace, control characters, or composite colons.
 * Returns '' for empty, path-traversal, or sentinel tokens.
 */
export function normalizeOfferId(raw: unknown): string {
  return cleanOfferId(raw);
}

/** Canonicalized membership check against a set from implausiblyLowOfferIds. */
export function hasImplausiblyLowOfferId(
  flaggedIds: ReadonlySet<string> | null | undefined,
  rawId: unknown
): boolean {
  if (!hasSetLookup(flaggedIds)) return false;
  const id = cleanOfferId(rawId);
  return Boolean(id) && flaggedIds.has(id);
}

/** Ids of the implausibly low offers. */
export function implausiblyLowOfferIds<
  T extends { id: string; price_current: number },
>(offers: readonly T[]): Set<string> {
  if (!Array.isArray(offers)) return new Set<string>();
  const flagged = implausiblyLowIndexes(offers.map((o) => o?.price_current));
  return new Set(
    offers
      .filter((o, index) => isNonArrayObject(o) && flagged.has(index))
      .map((o) => cleanOfferId(o.id))
      .filter(Boolean)
  );
}

/**
 * Whether an offer (in-stock or out_of_stock/discontinued) has a bait price
 * judged against the in-stock market offers. Falls back to price comparison
 * when offer.id cannot be canonicalized, preventing fail-open mismatches
 * between plausibleOffers and implausiblyLowOfferIds.
 */
export function isOfferImplausiblyLowAgainstInStock(
  offer:
    | {
        id?: string | null;
        price_current: number;
        availability?: string | null;
      }
    | null
    | undefined,
  inStockOffers: readonly {
    id?: string | null;
    price_current: number;
  }[],
  inStockBaitIds?: ReadonlySet<string> | null
): boolean {
  if (!isNonArrayObject(offer)) return false;
  if (hasImplausiblyLowOfferId(inStockBaitIds, offer.id)) {
    return true;
  }
  const safeInStock = Array.isArray(inStockOffers) ? inStockOffers : [];
  if (isUnavailableStatus(offer.availability)) {
    return isImplausiblyLowPrice(
      offer.price_current,
      plausibleOffers(safeInStock)
    );
  }
  const canonicalId = cleanOfferId(offer.id);
  if (
    Boolean(canonicalId) &&
    hasSetLookup(inStockBaitIds) &&
    safeInStock.some((c) => c === offer || cleanOfferId(c?.id) === canonicalId)
  ) {
    return false;
  }
  const rawCleaned = trimOfferString(offer.id);
  let excludedSelf = false;
  const others = safeInStock.filter((candidate) => {
    if (!excludedSelf) {
      if (candidate === offer) {
        excludedSelf = true;
        return false;
      }
      if (
        Boolean(rawCleaned) &&
        isNonArrayObject(candidate) &&
        (trimOfferString(candidate.id) === rawCleaned ||
          (Boolean(canonicalId) && cleanOfferId(candidate.id) === canonicalId))
      ) {
        excludedSelf = true;
        return false;
      }
    }
    return true;
  });
  return isImplausiblyLowPrice(offer.price_current, others);
}

/**
 * The lowest plausible offer price, or the stored minimum when there are no
 * priced offers to judge.
 */
export function plausibleMinPrice(
  storedMinPrice: number,
  offers: readonly { price_current: number }[]
): number {
  const prices = plausibleOffers(offers)
    .map((o) => toSafePlausiblePrice(o?.price_current))
    .filter((p) => isValidPlausiblePrice(p));
  if (prices.length > 0) {
    let min = prices[0]!;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i]! < min) min = prices[i]!;
    }
    return min;
  }
  const safeStored = toSafePlausiblePrice(storedMinPrice);
  return isValidPlausiblePrice(safeStored) ? safeStored : 0;
}
