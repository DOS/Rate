import { MAX_VALID_VND_PRICE } from './rate-domain-core';
import type { BayesianRatingSummary } from './rate-api';
import type { RadarSignal } from './deal-radar';

// rate-api and the deal radar build `tierLabelVi` / `explanationVi` in
// Vietnamese only. The product page rebuilds them from the structured fields
// next to those strings, so each locale gets its own copy (DOS/Rate#574).

export type BayesianTierKey =
  | 'bayesianTierHigh'
  | 'bayesianTierMedium'
  | 'bayesianTierLow'
  | 'bayesianTierSmoothed'
  | 'bayesianTierPrior';

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
    default:
      return Number.isFinite(summary?.effectiveWeightSum) &&
        summary.effectiveWeightSum > 0
        ? 'bayesianTierSmoothed'
        : 'bayesianTierPrior';
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

const COPY_CONTROL_CHAR_RE = /\p{Cc}/gu;

const vnd = (value: unknown) => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  const safe =
    Number.isFinite(num) && num > 0
      ? Math.min(Math.round(num), MAX_VALID_VND_PRICE)
      : 0;
  return safe.toLocaleString('vi-VN');
};

const safePctString = (value: unknown, max = 10_000): string => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  if (!Number.isFinite(num) || num <= 0) return '0';
  return String(Math.min(num, max));
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
  signal: Pick<RadarSignal, 'verdict' | 'genuineDeal' | 'fakeSaleTrap'>
): RadarExplanation | null {
  if (!signal || typeof signal !== 'object') return null;
  if (signal.verdict === 'genuine_deal' && signal.genuineDeal) {
    const deal = signal.genuineDeal;
    return {
      key: 'radarExplanationGenuineDeal',
      values: {
        savings: vnd(deal.savingsVsMedianVnd),
        pct: safePctString(deal.savingsVsMedianPct),
        merchant: safeLabelText(deal.merchantName, 200),
        platform: safeLabelText(deal.platform, 64).toUpperCase(),
      },
    };
  }
  const trap = signal.fakeSaleTrap;
  if (
    signal.verdict === 'fake_sale_trap' &&
    trap &&
    trap.priceOriginal != null
  ) {
    const current =
      typeof trap.priceCurrent === 'number'
        ? trap.priceCurrent
        : typeof trap.priceCurrent === 'string' &&
            String(trap.priceCurrent).trim()
          ? Number(trap.priceCurrent)
          : NaN;
    const floor =
      typeof trap.marketMinPrice === 'number'
        ? trap.marketMinPrice
        : typeof trap.marketMinPrice === 'string' &&
            String(trap.marketMinPrice).trim()
          ? Number(trap.marketMinPrice)
          : NaN;
    const rawDiff = current - floor;
    return {
      key: 'radarExplanationFakeSale',
      values: {
        original: vnd(trap.priceOriginal),
        markupPct: safePctString(trap.fakeMarkupPct),
        claimedPct: safePctString(trap.claimedDiscountPct),
        aboveFloor: vnd(Number.isFinite(rawDiff) && rawDiff > 0 ? rawDiff : 0),
      },
    };
  }
  return null;
}
