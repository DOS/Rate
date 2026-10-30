import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain-core';
import type { OfferDiscountAnalysis } from '@/lib/rate-api';
import {
  formatPlainNumber,
  formatPriceVnd,
  toFormatLocale,
} from '@/lib/locale-format';

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

function parseDecimalVerdictNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    return Number(cleaned);
  }
  return Number.NaN;
}

const vnd = (price: number | null | undefined, locale?: string | null) => {
  const num = parseDecimalVerdictNumber(price);
  const safe =
    Number.isFinite(num) && num > 0 && num <= MAX_VALID_VND_PRICE
      ? Math.round(num)
      : 0;
  return formatPriceVnd(safe, locale);
};

const toSafePct = (pct: number | null | undefined) => {
  const num = parseDecimalVerdictNumber(pct);
  return Number.isFinite(num) && num > 0
    ? Math.min(100, Math.round(num * 10) / 10)
    : 0;
};

// Percent arguments stay numbers on vi/en (the message prints them with
// `String`), and get a decimal comma on cs (DOS/Rate#1369).
const pctArg = (pct: number, locale?: string | null): number | string =>
  toFormatLocale(locale) === 'cs' ? formatPlainNumber(pct, locale) : pct;

export function discountVerdictCopy(
  t: VerdictTranslator,
  a: OfferDiscountAnalysis,
  locale?: string | null
): DiscountVerdictCopy {
  const safeAnalysis =
    a && typeof a === 'object' ? a : ({} as Partial<OfferDiscountAnalysis>);
  const median = vnd(safeAnalysis.historical_median_price, locale);
  const safeClaimedPct = toSafePct(safeAnalysis.claimed_discount_pct);
  const safeRealPct = toSafePct(safeAnalysis.real_discount_vs_median_pct);
  // rate-api only judges a claimed discount when the store shows a
  // strikethrough price at least 5% above the current one.
  const claimsDiscount =
    safeAnalysis.price_original != null && safeClaimedPct >= 5;

  switch (safeAnalysis.verdict) {
    case 'fake_discount':
      return {
        label: t('labelFake'),
        explanation: t('explainFake', {
          original: vnd(safeAnalysis.price_original, locale),
          claimed: pctArg(safeClaimedPct, locale),
          max: vnd(safeAnalysis.historical_max_price, locale),
          median,
        }),
      };
    case 'suspicious_discount':
      return {
        label: t('labelSuspicious'),
        explanation: t('explainSuspicious', {
          claimed: pctArg(safeClaimedPct, locale),
          real: pctArg(safeRealPct, locale),
          median,
        }),
      };
    case 'genuine_deal':
      return claimsDiscount
        ? {
            label: t('labelGenuine'),
            explanation: t('explainGenuine', {
              pct: pctArg(Math.max(safeRealPct, safeClaimedPct), locale),
              median,
            }),
          }
        : {
            label: t('labelHistoricLow'),
            explanation: t('explainHistoricLow', {
              current: vnd(safeAnalysis.price_current, locale),
              max: vnd(safeAnalysis.historical_max_price, locale),
            }),
          };
    default:
      return {
        label: t('labelNormal'),
        explanation: t('explainNormal', {
          current: vnd(safeAnalysis.price_current, locale),
          median,
        }),
      };
  }
}
