import type { MerchantSummary } from './rate-domain';

/**
 * The merchant fields the hero search dropdown shows and filters on. Pages
 * pass these instead of whole MerchantSummary objects: the dropdown shows at
 * most three stores, yet every store's risk breakdown and stats were being
 * serialized into the page payload.
 */
export type HeroMerchantSuggestion = Pick<
  MerchantSummary,
  | 'id'
  | 'name'
  | 'platform'
  | 'platform_shop_id'
  | 'is_official'
  | 'trust_score'
  | 'dosafe_risk_score'
>;

/** Pages pass only the first few: the dropdown fetches matches as the user types. */
export const HERO_MERCHANT_PRELOAD = 2;

export function toHeroMerchantSuggestions(
  merchants: readonly HeroMerchantSuggestion[]
): HeroMerchantSuggestion[] {
  return merchants.map(
    ({
      id,
      name,
      platform,
      platform_shop_id,
      is_official,
      trust_score,
      dosafe_risk_score,
    }) => ({
      id,
      name,
      platform,
      platform_shop_id,
      is_official,
      trust_score,
      dosafe_risk_score,
    })
  );
}
