/**
 * Price floor for a main device listing. Below it, a listing that claims to be
 * a phone, tablet, watch or laptop is almost always an accessory or a spare
 * part. Earbuds sell for less, so they have their own floor.
 */

/** Below this, a main device listing is treated as an accessory or part. */
export const MINIMUM_DEVICE_PRICE_FLOOR_VND = 1_200_000;
/** Below this, an earbuds listing is treated as an accessory or part. */
export const MINIMUM_EARBUDS_PRICE_FLOOR_VND = 400_000;
/**
 * Titles or URLs of earbuds listings. A model number or tier may follow the
 * name with no space ("Buds3", "Buds2Pro", "BudsPro3", "FreeBudsPro4",
 * "AirPodsPro", "WF1000XM5") (DOS/Rate#1092), and "GalaxyBuds" may be glued to
 * the brand ("SamsungGalaxyBuds3"). Over-ear headphones ("WH-1000XM5") are not
 * earbuds and keep the device floor (DOS/Rate#1116). Digits after a tier sit
 * inside the optional tier group, so two digit runs never compete (no ReDoS).
 */
export const EARBUDS_TITLE_REGEX =
  /(?:\b(?:airpods(?:\d+|pro|max)?|earpods|buds\d*(?:(?:pro|fe|live|core|plus)\d*)?|freebuds\d*(?:(?:pro|se)\d*)?i?|soundpeats|wf-|wf1000xm\d+|tws|tai[\s_-]*nghe|earbuds|in[\s_-]*ear)|galaxybuds\d*(?:(?:pro|fe|live|core|plus)\d*)?)\b/i;

/**
 * The floor for a listing: the earbuds floor when any of the texts (title,
 * URL) names earbuds, else the device floor.
 */
export function minimumListingPriceVnd(texts: readonly string[]): number {
  return texts.some((text) => EARBUDS_TITLE_REGEX.test(text))
    ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;
}
