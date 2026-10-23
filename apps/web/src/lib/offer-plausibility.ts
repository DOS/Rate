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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Indexes of the prices that are implausibly low against the median of the
 * other prices. Non-positive or non-finite prices are ignored, never flagged.
 */
export function implausiblyLowIndexes(prices: readonly number[]): Set<number> {
  const valid = prices
    .map((price, index) => ({ price, index }))
    .filter(({ price }) => Number.isFinite(price) && price > 0);
  const flagged = new Set<number>();
  if (valid.length < MIN_OFFERS_FOR_OUTLIER) return flagged;
  for (const { price, index } of valid) {
    const others = valid.filter((v) => v.index !== index).map((v) => v.price);
    const othersMedian = median(others);
    if (othersMedian > 0 && price < othersMedian * IMPLAUSIBLY_LOW_RATIO) {
      flagged.add(index);
    }
  }
  return flagged;
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
