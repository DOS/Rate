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
export const MAX_HERO_MERCHANTS = 50;

function sanitizeMerchantText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, maxLen);
}

function clampScore100(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function toHeroMerchantSuggestions(
  merchants: readonly HeroMerchantSuggestion[]
): HeroMerchantSuggestion[] {
  if (!Array.isArray(merchants)) return [];
  return merchants
    .slice(0, MAX_HERO_MERCHANTS)
    .map(
      ({
        id,
        name,
        platform,
        platform_shop_id,
        is_official,
        trust_score,
        dosafe_risk_score,
      }) => ({
        id: sanitizeMerchantText(id, 128),
        name: sanitizeMerchantText(name, 200),
        platform: sanitizeMerchantText(platform, 40),
        platform_shop_id: sanitizeMerchantText(platform_shop_id, 128),
        is_official: Boolean(is_official),
        trust_score: clampScore100(trust_score),
        dosafe_risk_score: clampScore100(dosafe_risk_score),
      })
    );
}
