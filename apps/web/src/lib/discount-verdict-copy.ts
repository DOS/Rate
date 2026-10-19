import type { OfferDiscountAnalysis } from '@/lib/rate-api';

// rate-api builds `badge_label` / `explanation` in Vietnamese only. The UI
// rebuilds both from the structured fields so they follow the active locale
// (DOS/Rate#559). The branches mirror the verdict rules in rate-api.ts.

type VerdictCopyKey =
  | 'labelFake'
  | 'labelSuspicious'
  | 'labelGenuine'
  | 'labelHistoricLow'
  | 'labelNormal'
  | 'explainFake'
  | 'explainSuspicious'
  | 'explainGenuine'
  | 'explainHistoricLow'
  | 'explainNormal';

export type VerdictTranslator = (
  key: VerdictCopyKey,
  values?: Record<string, string | number>
) => string;

export interface DiscountVerdictCopy {
  label: string;
  explanation: string;
}

const vnd = (price: number | null | undefined) =>
  `${Number(price || 0).toLocaleString('vi-VN')} ₫`;

export function discountVerdictCopy(
  t: VerdictTranslator,
  a: OfferDiscountAnalysis
): DiscountVerdictCopy {
  const median = vnd(a.historical_median_price);
  // rate-api only judges a claimed discount when the store shows a
  // strikethrough price at least 5% above the current one.
  const claimsDiscount =
    a.price_original != null && a.claimed_discount_pct >= 5;

  switch (a.verdict) {
    case 'fake_discount':
      return {
        label: t('labelFake'),
        explanation: t('explainFake', {
          original: vnd(a.price_original),
          claimed: a.claimed_discount_pct,
          max: vnd(a.historical_max_price),
          median,
        }),
      };
    case 'suspicious_discount':
      return {
        label: t('labelSuspicious'),
        explanation: t('explainSuspicious', {
          claimed: a.claimed_discount_pct,
          real: Math.max(0, a.real_discount_vs_median_pct),
          median,
        }),
      };
    case 'genuine_deal':
      return claimsDiscount
        ? {
            label: t('labelGenuine'),
            explanation: t('explainGenuine', {
              pct: Math.max(
                a.real_discount_vs_median_pct,
                a.claimed_discount_pct
              ),
              median,
            }),
          }
        : {
            label: t('labelHistoricLow'),
            explanation: t('explainHistoricLow', {
              current: vnd(a.price_current),
              max: vnd(a.historical_max_price),
            }),
          };
    default:
      return {
        label: t('labelNormal'),
        explanation: t('explainNormal', {
          current: vnd(a.price_current),
          median,
        }),
      };
  }
}
