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
 * name with no space ("Buds3", "Buds2Pro", "BudsPro3", "Buds3ProFE",
 * "FreeBudsPro4", "AirPodsPro2", "WF1000XM5") (DOS/Rate#1092), and a brand may
 * be glued to the name ("SamsungGalaxyBuds3", "PixelBudsPro2", "RedmiBuds5",
 * "HuaweiFreeBudsPro4", "SonyWF1000XM5"), so those names need no word start.
 * Over-ear headphones ("WH-1000XM5", "WH CH720N") are not earbuds and keep the
 * device floor, even when the text also says "tai nghe" (DOS/Rate#1116,
 * DOS/Rate#1125). Any over-ear model in the text wins, so a title naming both
 * a WF- and a WH- model gets the device floor.
 *
 * No ReDoS: the pattern is anchored, so the over-ear lookahead scans the text
 * once. Every repeat ends where the next part starts with a letter, a word
 * boundary or the end, so no two repeats compete for the same characters.
 */
export const EARBUDS_TITLE_REGEX =
  /^(?![\s\S]*(?:\b|_|sony)wh[\s_-]?(?:1000xm|ch\d|xb\d|ult\d|h\d))[\s\S]*?(?:\b(?:buds\d*(?:(?:pro|fe|live|core|plus)\d*){0,2}|earpods|soundpeats|wf-|tws|tai[\s_-]*nghe|earbuds|in[\s_-]*ear)|airpods(?:\d+|(?:pro|max)\d*)?|freebuds\d*(?:(?:pro|se)\d*)?i?|(?:galaxy|pixel|redmi|samsung|enco|tune)buds\d*(?:(?:pro|fe|live|core|plus)\d*){0,2}|wf-?1000xm\d+)\b/i;

/**
 * The floor for a listing: the earbuds floor when any of the texts (title,
 * URL) names earbuds, else the device floor.
 */
export function minimumListingPriceVnd(texts: readonly string[]): number {
  return texts.some((text) => EARBUDS_TITLE_REGEX.test(text))
    ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;
}
