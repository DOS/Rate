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
  switch (summary.confidenceTier) {
    case 'high':
      return 'bayesianTierHigh';
    case 'medium':
      return 'bayesianTierMedium';
    case 'low':
      return 'bayesianTierLow';
    default:
      return summary.effectiveWeightSum > 0
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

const vnd = (value: number) => value.toLocaleString('vi-VN');

/**
 * Message key and values for the radar note under the product header. Values
 * are preformatted strings, matching the Vietnamese text `deals.ts` builds.
 */
export function radarExplanation(
  signal: Pick<RadarSignal, 'verdict' | 'genuineDeal' | 'fakeSaleTrap'>
): RadarExplanation | null {
  if (signal.verdict === 'genuine_deal' && signal.genuineDeal) {
    const deal = signal.genuineDeal;
    return {
      key: 'radarExplanationGenuineDeal',
      values: {
        savings: vnd(deal.savingsVsMedianVnd),
        pct: String(deal.savingsVsMedianPct),
        merchant: deal.merchantName,
        platform: deal.platform.toUpperCase(),
      },
    };
  }
  const trap = signal.fakeSaleTrap;
  if (
    signal.verdict === 'fake_sale_trap' &&
    trap &&
    trap.priceOriginal != null
  ) {
    return {
      key: 'radarExplanationFakeSale',
      values: {
        original: vnd(trap.priceOriginal),
        markupPct: String(trap.fakeMarkupPct),
        claimedPct: String(trap.claimedDiscountPct),
        aboveFloor: vnd(trap.priceCurrent - trap.marketMinPrice),
      },
    };
  }
  return null;
}
