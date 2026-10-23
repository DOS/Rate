/**
 * Bait-price detection (DOS/Rate#797). A listing far below what every other
 * store asks for the same model is almost never a real deal: it is a
 * counterfeit, an accessory or a bait listing. Such offers must not set a
 * product's "from" price or the deal radar's market floor.
 */

/** An offer below this share of the other offers' median is implausible. */
export const IMPLAUSIBLY_LOW_RATIO = 0.4;
/** Fewer offers than this are too few to call one an outlier. */
export const MIN_OFFERS_FOR_OUTLIER = 3;

/**
 * Indexes of the prices that are implausibly low against the lower median of
 * the other prices: the lower median, so one overpriced listing cannot pull
 * the reference up and hide a real deal. Non-positive or non-finite prices
 * are ignored, never flagged. Sorts once: O(n log n).
 */
export function implausiblyLowIndexes(prices: readonly number[]): Set<number> {
  const sorted = prices
    .map((price, index) => ({ price, index }))
    .filter(({ price }) => Number.isFinite(price) && price > 0)
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
  if (!Number.isFinite(price) || price <= 0) return false;
  const sorted = offers
    .map((o) => o.price_current)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (sorted.length < MIN_OFFERS_FOR_OUTLIER - 1) return false;
  const lowerMedian = sorted[Math.floor((sorted.length - 1) / 2)]!;
  return price < lowerMedian * IMPLAUSIBLY_LOW_RATIO;
}

/** The offers minus the implausibly low ones, in their original order. */
export function plausibleOffers<T extends { price_current: number }>(
  offers: readonly T[]
): T[] {
  const flagged = implausiblyLowIndexes(offers.map((o) => o.price_current));
  return offers.filter((_, index) => !flagged.has(index));
}

/** Ids of the implausibly low offers. */
export function implausiblyLowOfferIds<
  T extends { id: string; price_current: number },
>(offers: readonly T[]): Set<string> {
  const flagged = implausiblyLowIndexes(offers.map((o) => o.price_current));
  return new Set(
    offers.filter((_, index) => flagged.has(index)).map((o) => o.id)
  );
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
    .map((o) => o.price_current)
    .filter((p) => Number.isFinite(p) && p > 0);
  return prices.length > 0 ? Math.min(...prices) : storedMinPrice;
}
