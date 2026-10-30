import { MAX_VALID_VND_PRICE } from './rate-domain-core';
import type { BayesianRatingSummary } from './rate-api';
import type { RadarSignal } from './deal-radar';
import { formatNumber, formatPlainNumber } from './locale-format';

// rate-api and the deal radar build `tierLabelVi` / `explanationVi` in
// Vietnamese only. The product page rebuilds them from the structured fields
// next to those strings, so each locale gets its own copy (DOS/Rate#574).

export type BayesianTierKey =
  | 'bayesianTierHigh'
  | 'bayesianTierMedium'
  | 'bayesianTierLow'
  | 'bayesianTierSmoothed'
  | 'bayesianTierPrior';

const COPY_CONTROL_CHAR_RE = /\p{Cc}/gu;

function parseDecimalDetailNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(COPY_CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    return Number(cleaned);
  }
  return Number.NaN;
}

/** Mirrors the tiers `computeBayesianRatingSummary` labels. */
export function bayesianTierKey(
  summary: Pick<BayesianRatingSummary, 'confidenceTier' | 'effectiveWeightSum'>
): BayesianTierKey {
  switch (summary?.confidenceTier) {
    case 'high':
      return 'bayesianTierHigh';
    case 'medium':
      return 'bayesianTierMedium';
    case 'low':
      return 'bayesianTierLow';
    default: {
      const weightSum = parseDecimalDetailNumber(summary?.effectiveWeightSum);
      return Number.isFinite(weightSum) && weightSum > 0
        ? 'bayesianTierSmoothed'
        : 'bayesianTierPrior';
    }
  }
}

export type RadarExplanation =
  | {
      key: 'radarExplanationGenuineDeal';
      values: {
        savings: string;
        pct: string;
        merchant: string;
        platform: string;
        /** Offers behind the median, never a fixed "10 platforms" (#1145). */
        count: string;
      };
    }
  | {
      key: 'radarExplanationFakeSale';
      values: {
        original: string;
        markupPct: string;
        claimedPct: string;
        aboveFloor: string;
      };
    };

const vnd = (value: unknown, locale?: string | null) => {
  const num = parseDecimalDetailNumber(value);
  const safe =
    Number.isFinite(num) && num > 0
      ? Math.min(Math.round(num), MAX_VALID_VND_PRICE)
      : 0;
  return formatNumber(safe, locale);
};

const safePctString = (
  value: unknown,
  locale?: string | null,
  max = 10_000
): string => {
  const num = parseDecimalDetailNumber(value);
  if (!Number.isFinite(num) || num <= 0) return '0';
  return formatPlainNumber(Math.min(num, max), locale);
};

const offerCountString = (value: unknown): string | null => {
  const num = parseDecimalDetailNumber(value);
  // A median needs at least two offers; deals.ts never makes one from fewer.
  return Number.isFinite(num) && num >= 2
    ? String(Math.min(Math.floor(num), 10_000))
    : null;
};

const safeLabelText = (value: unknown, maxLen: number): string => {
  if (typeof value !== 'string') return '';
  return value.replace(COPY_CONTROL_CHAR_RE, '').trim().slice(0, maxLen);
};

/**
 * Message key and values for the radar note under the product header. Values
 * are preformatted strings, matching the Vietnamese text `deals.ts` builds.
 */
export function radarExplanation(
  signal: Pick<RadarSignal, 'verdict' | 'genuineDeal' | 'fakeSaleTrap'>,
  locale?: string | null
): RadarExplanation | null {
  if (!signal || typeof signal !== 'object') return null;
  if (signal.verdict === 'genuine_deal' && signal.genuineDeal) {
    const deal = signal.genuineDeal;
    // No offer count, no sentence: never print a number we do not know.
    const count = offerCountString(deal.marketOfferCount);
    if (count == null) return null;
    return {
      key: 'radarExplanationGenuineDeal',
      values: {
        savings: vnd(deal.savingsVsMedianVnd, locale),
        pct: safePctString(deal.savingsVsMedianPct, locale),
        merchant: safeLabelText(deal.merchantName, 200),
        platform: safeLabelText(deal.platform, 64).toUpperCase(),
        count,
      },
    };
  }
  const trap = signal.fakeSaleTrap;
  if (
    signal.verdict === 'fake_sale_trap' &&
    trap &&
    trap.priceOriginal != null
  ) {
    const current = parseDecimalDetailNumber(trap.priceCurrent);
    const floor = parseDecimalDetailNumber(trap.marketMinPrice);
    const rawDiff = current - floor;
    return {
      key: 'radarExplanationFakeSale',
      values: {
        original: vnd(trap.priceOriginal, locale),
        markupPct: safePctString(trap.fakeMarkupPct, locale),
        claimedPct: safePctString(trap.claimedDiscountPct, locale),
        aboveFloor: vnd(
          Number.isFinite(rawDiff) && rawDiff > 0 ? rawDiff : 0,
          locale
        ),
      },
    };
  }
  return null;
}
