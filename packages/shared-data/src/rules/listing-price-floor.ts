/**
 * Price floor for a main device listing. Below it, a listing that claims to be
 * a phone, tablet, watch or laptop is almost always an accessory or a spare
 * part. Earbuds sell for less, so they have their own floor.
 */

/** Below this, a main device listing is treated as an accessory or part. */
export const MINIMUM_DEVICE_PRICE_FLOOR_VND = 1_200_000;
/** Below this, an earbuds listing is treated as an accessory or part. */
export const MINIMUM_EARBUDS_PRICE_FLOOR_VND = 400_000;
/** Below this, a small home-appliance listing (e.g. air purifier) is treated as a filter/part. */
export const MINIMUM_APPLIANCE_PRICE_FLOOR_VND = 400_000;
/** Below this, a Wave E3 consumable retail listing (supplements, cosmetics, mother-baby) is flagged as invalid/sample. */
export const MINIMUM_RETAIL_CONSUMABLE_PRICE_FLOOR_VND = 20_000;
/**
 * Titles or URLs of earbuds listings. A model number or tier may follow the
 * name with no space ("Buds3", "Buds2Pro", "BudsPro3", "Buds3ProFE",
 * "FreeBudsPro4", "AirPodsPro2", "WF1000XM5") (DOS/Rate#1092), and a brand may
 * be glued to the name ("SamsungGalaxyBuds3", "PixelBudsPro2", "RedmiBuds5",
 * "AppleAirPodsPro2", "HuaweiFreeBudsPro4", "SonyWF1000XM5"). AirPods,
 * FreeBuds and WF1000XM need a word start or their own brand just before them
 * ("repairpods" is not AirPods). Over-ear headphones ("WH-1000XM5",
 * "WH CH720N", "WH-L600") are not earbuds and keep the device floor, even when
 * the text also says "tai nghe" (DOS/Rate#1116, DOS/Rate#1125). Any over-ear
 * model in the text wins, so a title naming both a WF- and a WH- model gets
 * the device floor.
 *
 * No ReDoS: the pattern is anchored, so the over-ear lookahead scans the text
 * once. Every repeat ends where the next part starts with a letter, a word
 * boundary or the end, so no two repeats compete for the same characters.
 */
export const EARBUDS_TITLE_REGEX =
  /^(?![\s\S]*(?:\b|_|sony)wh(?:[\s_-]?1000xm|[\s_-][a-z]{1,3}\d))[\s\S]*?(?:\b(?:buds\d*(?:(?:pro|fe|live|core|plus)\d*){0,2}|earpods|soundpeats|wf-|tws|tai[\s_-]*nghe|earbuds|in[\s_-]*ear)|(?:\b|apple)airpods(?:\d+|(?:pro|max)\d*)?|(?:\b|huawei)freebuds\d*(?:(?:pro|se)\d*)?i?|(?:galaxy|pixel|redmi|samsung|enco|tune)buds\d*(?:(?:pro|fe|live|core|plus)\d*){0,2}|(?:\b|sony)wf-?1000xm\d+)\b/i;

/** Keeps a word boundary between the joined title and URL. */
const TEXT_SEPARATOR = ' ';

const SERVICE_CATEGORY_SLUGS = new Set([
  'bank-savings',
  'internet-telecom',
  'services',
]);
const PLACE_CATEGORY_SLUGS = new Set([
  'restaurants',
  'cafes',
  'hotels',
  'homestays',
  'dental-clinics',
  'gyms-fitness',
]);
const SMALL_APPLIANCE_CATEGORY_SLUGS = new Set(['air-purifiers']);
const RETAIL_CONSUMABLE_CATEGORY_SLUGS = new Set([
  'supplements',
  'cosmetics',
  'mother-baby',
]);

export interface MinimumListingPriceOptions {
  categorySlug?: string | null;
  entityType?: 'product' | 'service' | 'place' | null;
  currency?: string | null;
}

/**
 * The floor for a listing: 0 for Wave E2 services, Wave E4/E5 places, or PCT-denominated rates,
 * the small-appliance floor for air purifiers, the consumable retail floor (20,000 VND) for
 * Wave E3 categories, the earbuds floor when the category is `earbuds` or the texts (title, URL)
 * name earbuds (without a conflicting non-earbuds category), else the device floor.
 */
export function minimumListingPriceVnd(
  texts: readonly string[],
  options?: MinimumListingPriceOptions | null
): number {
  const entityType = options?.entityType ?? null;
  const currency = options?.currency?.trim().toUpperCase() ?? null;
  const categorySlug = options?.categorySlug?.trim().toLowerCase() || null;

  if (
    entityType === 'service' ||
    entityType === 'place' ||
    currency === 'PCT' ||
    (categorySlug !== null &&
      (SERVICE_CATEGORY_SLUGS.has(categorySlug) ||
        PLACE_CATEGORY_SLUGS.has(categorySlug)))
  ) {
    return 0;
  }

  if (categorySlug === 'earbuds') {
    return MINIMUM_EARBUDS_PRICE_FLOOR_VND;
  }

  if (
    categorySlug !== null &&
    SMALL_APPLIANCE_CATEGORY_SLUGS.has(categorySlug)
  ) {
    return MINIMUM_APPLIANCE_PRICE_FLOOR_VND;
  }

  if (
    categorySlug !== null &&
    RETAIL_CONSUMABLE_CATEGORY_SLUGS.has(categorySlug)
  ) {
    return MINIMUM_RETAIL_CONSUMABLE_PRICE_FLOOR_VND;
  }

  if (categorySlug !== null) {
    return MINIMUM_DEVICE_PRICE_FLOOR_VND;
  }

  return EARBUDS_TITLE_REGEX.test(texts.join(TEXT_SEPARATOR))
    ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;
}
