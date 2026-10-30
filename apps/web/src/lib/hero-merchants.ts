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
> & {
  /** Null when the store has no DOSafe score, never 0 (DOS/Rate#1479). */
  dosafe_risk_score: number | null;
};

/** A summary as pages pass it, with the server-side flag for an unknown DOSafe score. */
type HeroMerchantInput = Omit<HeroMerchantSuggestion, 'dosafe_risk_score'> & {
  dosafe_risk_score?: number | null;
  dosafe_risk_known?: boolean;
};

/** Pages pass only the first few: the dropdown fetches matches as the user types. */
export const HERO_MERCHANT_PRELOAD = 2;
export const MAX_HERO_MERCHANTS = 50;

const DISALLOWED_HERO_MERCHANT_ID_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

export function sanitizeMerchantText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeMerchantIdentifier(
  value: unknown,
  maxLen: number
): string {
  const cleaned = sanitizeMerchantText(value, maxLen);
  if (
    !cleaned ||
    !/[a-zA-Z0-9]/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    DISALLOWED_HERO_MERCHANT_ID_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

export function clampScore100(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return 0;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }
  return 0;
}

export function toHeroMerchantSuggestions(
  merchants: readonly HeroMerchantInput[]
): HeroMerchantSuggestion[] {
  if (!Array.isArray(merchants)) return [];
  return merchants
    .filter(
      (m): m is HeroMerchantInput =>
        Boolean(m) && typeof m === 'object' && !Array.isArray(m)
    )
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
        dosafe_risk_known,
      }) => ({
        id: sanitizeMerchantIdentifier(id, 128),
        name: sanitizeMerchantText(name, 200),
        platform: sanitizeMerchantText(platform, 40),
        platform_shop_id: sanitizeMerchantIdentifier(platform_shop_id, 128),
        is_official: Boolean(is_official),
        trust_score: clampScore100(trust_score),
        // The flag is dropped here, so read it first (DOS/Rate#1479).
        dosafe_risk_score:
          dosafe_risk_known === false || dosafe_risk_score == null
            ? null
            : clampScore100(dosafe_risk_score),
      })
    );
}
