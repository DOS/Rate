/**
 * Price floor for a main device listing. Below it, a listing that claims to be
 * a phone, tablet, watch or laptop is almost always an accessory or a spare
 * part. Earbuds sell for less, so they have their own floor.
 */

/** Below this, a main device listing is treated as an accessory or part. */
export const MINIMUM_DEVICE_PRICE_FLOOR_VND = 1_200_000;
/** Below this, an earbuds listing is treated as an accessory or part. */
export const MINIMUM_EARBUDS_PRICE_FLOOR_VND = 400_000;
/** Titles or URLs of earbuds listings. */
export const EARBUDS_TITLE_REGEX =
  /\b(?:airpods|earpods|buds|freebuds|soundpeats|wf-|wh-|tws|tai[\s_-]*nghe|earbuds|in[\s_-]*ear)\b/i;

/**
 * The floor for a listing: the earbuds floor when any of the texts (title,
 * URL) names earbuds, else the device floor.
 */
export function minimumListingPriceVnd(texts: readonly string[]): number {
  return texts.some((text) => EARBUDS_TITLE_REGEX.test(text))
    ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;
}
