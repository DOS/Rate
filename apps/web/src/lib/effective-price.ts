/**
 * Pure Effective Price, Trade-In Reality Check, and 0% Installment Calculator.
 *
 * All VND arithmetic operates on strict finite integers clamped to
 * [0, MAX_VALID_VND_PRICE], rejecting NaN, Infinity, and negative inputs.
 * Results are reference estimates from user-supplied inputs and catalog
 * offers, never binding retailer quotes.
 */

import {
  classifySellerChannel,
  detectProductOrigin,
  implausiblyLowOfferIds,
  isOfferImplausiblyLowAgainstInStock,
  MAX_VALID_VND_PRICE,
  type ProductOrigin,
  type SellerChannel,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from './product-market-stats';

export type VoucherDiscountMode = 'fixed' | 'percent';

export type TradeInConditionTier =
  'grade_1_mint' | 'grade_2_light_wear' | 'grade_3_battery_under_85';

export type InstallmentTerm = 'cash' | 3 | 6 | 9 | 12;

export const MAX_VOUCHER_PERCENT = 80;
export const MAX_INSTALLMENT_FEE_PERCENT = 15;
export const INSTALLMENT_TERMS: readonly InstallmentTerm[] = [
  'cash',
  3,
  6,
  9,
  12,
];

export const TRADE_IN_CONDITION_FACTORS: Record<TradeInConditionTier, number> =
  {
    grade_1_mint: 1,
    grade_2_light_wear: 0.85,
    grade_3_battery_under_85: 0.7,
  };

export interface EffectivePriceInput {
  readonly basePriceVnd: number;
  readonly discountMode?: VoucherDiscountMode;
  readonly discountAmountVnd?: number;
  readonly discountPercent?: number;
  /** Optional VND cap when discountMode is 'percent'. 0 or null/undefined means uncapped. */
  readonly discountMaxCapVnd?: number | null;
  readonly tradeInEnabled?: boolean;
  readonly oldDeviceResaleBenchmarkVnd?: number;
  readonly tradeInConditionTier?: TradeInConditionTier;
  readonly tradeInBonusVnd?: number;
  readonly installmentTerm?: InstallmentTerm;
  /** Conversion fee % (0..15, default 0). Applied only when installmentTerm !== 'cash'. */
  readonly installmentFeePercent?: number;
}

export interface EffectivePriceResult {
  readonly basePriceVnd: number;
  readonly discountMode: VoucherDiscountMode;
  readonly discountPercentApplied: number;
  readonly discountCapAppliedVnd: number | null;
  readonly voucherSavingsVnd: number;
  readonly priceAfterVoucherVnd: number;
  readonly tradeInEnabled: boolean;
  readonly tradeInConditionTier: TradeInConditionTier;
  readonly tradeInConditionPct: number;
  readonly oldDeviceBenchmarkVnd: number;
  readonly conditionAdjustedTradeInVnd: number;
  readonly tradeInBonusVnd: number;
  readonly storeTradeInCreditVnd: number;
  /** Positive: store trade-in returns more than self-resale; negative: self-resale wins. */
  readonly selfResaleComparisonDeltaVnd: number;
  readonly netCashPayableVnd: number;
  readonly selfResaleNetPayableVnd: number;
  readonly installmentTerm: InstallmentTerm;
  readonly installmentMonths: 0 | 3 | 6 | 9 | 12;
  readonly installmentFeePercent: number;
  readonly conversionFeeVnd: number;
  readonly totalPaidVnd: number;
  readonly monthlyPaymentVnd: number;
  readonly totalDiffVsCashVnd: number;
}

export interface EffectivePriceOfferCandidate {
  readonly id: string;
  readonly platform: string;
  readonly title: string;
  readonly price_current: number;
  readonly availability?: OfferAvailability | null;
  readonly merchant?: {
    readonly name?: string | null;
    readonly is_official?: boolean | null;
    readonly risk_score?: number | null;
  } | null;
}

export interface SelectedOfferCandidate<
  T extends EffectivePriceOfferCandidate = EffectivePriceOfferCandidate,
> {
  readonly offer: T;
  readonly priceVnd: number;
  readonly origin: ProductOrigin;
  readonly sellerChannel: SellerChannel;
  readonly trustScore: number | null;
}

export interface EffectivePriceBaseSelection<
  T extends EffectivePriceOfferCandidate = EffectivePriceOfferCandidate,
> {
  readonly bestPlausibleOffer: SelectedOfferCandidate<T> | null;
  readonly bestOfficialVnaOffer: SelectedOfferCandidate<T> | null;
  readonly bestPlausiblePriceVnd: number;
  readonly bestOfficialVnaPriceVnd: number | null;
}

function parseFiniteNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return Number.NaN;
    }
    return Number(trimmed);
  }
  return Number.NaN;
}

/**
 * Sanitizes any VND input into a finite integer clamped to [0, MAX_VALID_VND_PRICE].
 * Rejects NaN, Infinity, negative numbers, and non-numeric values to 0.
 */
export function sanitizeVndAmount(raw: unknown): number {
  const num = parseFiniteNumber(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(MAX_VALID_VND_PRICE, Math.round(num));
}

function sanitizePositiveCatalogPrice(raw: unknown): number {
  const num = parseFiniteNumber(raw);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) return 0;
  return Math.round(num);
}

/**
 * Sanitizes a percentage input into [0, maxPercent] rounded to 2 decimal places.
 */
export function sanitizeClampedPercent(
  raw: unknown,
  maxPercent: number
): number {
  const num = parseFiniteNumber(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const clamped = Math.min(maxPercent, num);
  return Math.round(clamped * 100) / 100;
}

function normalizeConditionTier(raw: unknown): TradeInConditionTier {
  if (
    typeof raw === 'string' &&
    Object.hasOwn(TRADE_IN_CONDITION_FACTORS, raw)
  ) {
    return raw as TradeInConditionTier;
  }
  return 'grade_1_mint';
}

function normalizeInstallmentTerm(raw: unknown): InstallmentTerm {
  if (raw === 3 || raw === 6 || raw === 9 || raw === 12) return raw;
  return 'cash';
}

export function computeEffectivePrice(
  input: EffectivePriceInput | null | undefined
): EffectivePriceResult {
  const safeInput =
    input && typeof input === 'object' ? input : ({} as EffectivePriceInput);
  const basePriceVnd = sanitizeVndAmount(safeInput.basePriceVnd);
  const discountMode: VoucherDiscountMode =
    safeInput.discountMode === 'percent' ? 'percent' : 'fixed';
  const tradeInConditionTier = normalizeConditionTier(
    safeInput.tradeInConditionTier
  );
  const tradeInConditionFactor =
    TRADE_IN_CONDITION_FACTORS[tradeInConditionTier];
  const tradeInConditionPct = Math.round(tradeInConditionFactor * 100);
  const tradeInEnabled = safeInput.tradeInEnabled === true;
  const installmentTerm = normalizeInstallmentTerm(safeInput.installmentTerm);
  const installmentMonths: 0 | 3 | 6 | 9 | 12 =
    installmentTerm === 'cash' ? 0 : installmentTerm;
  const rawInstallmentFeePct =
    installmentTerm === 'cash'
      ? 0
      : sanitizeClampedPercent(
          safeInput.installmentFeePercent,
          MAX_INSTALLMENT_FEE_PERCENT
        );

  if (basePriceVnd <= 0) {
    return {
      basePriceVnd: 0,
      discountMode,
      discountPercentApplied: 0,
      discountCapAppliedVnd: null,
      voucherSavingsVnd: 0,
      priceAfterVoucherVnd: 0,
      tradeInEnabled,
      tradeInConditionTier,
      tradeInConditionPct,
      oldDeviceBenchmarkVnd: 0,
      conditionAdjustedTradeInVnd: 0,
      tradeInBonusVnd: 0,
      storeTradeInCreditVnd: 0,
      selfResaleComparisonDeltaVnd: 0,
      netCashPayableVnd: 0,
      selfResaleNetPayableVnd: 0,
      installmentTerm,
      installmentMonths,
      installmentFeePercent: rawInstallmentFeePct,
      conversionFeeVnd: 0,
      totalPaidVnd: 0,
      monthlyPaymentVnd: 0,
      totalDiffVsCashVnd: 0,
    };
  }

  let voucherSavingsVnd = 0;
  let discountPercentApplied = 0;
  let discountCapAppliedVnd: number | null = null;

  if (discountMode === 'percent') {
    discountPercentApplied = sanitizeClampedPercent(
      safeInput.discountPercent,
      MAX_VOUCHER_PERCENT
    );
    const rawPctSavings = Math.round(
      (basePriceVnd * discountPercentApplied) / 100
    );
    const capVnd = sanitizeVndAmount(safeInput.discountMaxCapVnd);
    if (capVnd > 0) {
      discountCapAppliedVnd = capVnd;
      voucherSavingsVnd = Math.min(basePriceVnd, rawPctSavings, capVnd);
    } else {
      voucherSavingsVnd = Math.min(basePriceVnd, rawPctSavings);
    }
  } else {
    voucherSavingsVnd = Math.min(
      basePriceVnd,
      sanitizeVndAmount(safeInput.discountAmountVnd)
    );
  }

  const priceAfterVoucherVnd = Math.max(0, basePriceVnd - voucherSavingsVnd);

  let oldDeviceBenchmarkVnd = 0;
  let conditionAdjustedTradeInVnd = 0;
  let tradeInBonusVnd = 0;
  let storeTradeInCreditVnd = 0;
  let selfResaleComparisonDeltaVnd = 0;

  if (tradeInEnabled) {
    oldDeviceBenchmarkVnd = sanitizeVndAmount(
      safeInput.oldDeviceResaleBenchmarkVnd
    );
    if (oldDeviceBenchmarkVnd > 0) {
      conditionAdjustedTradeInVnd = Math.min(
        MAX_VALID_VND_PRICE,
        Math.round(oldDeviceBenchmarkVnd * tradeInConditionFactor)
      );
      tradeInBonusVnd = sanitizeVndAmount(safeInput.tradeInBonusVnd);
      storeTradeInCreditVnd = Math.min(
        MAX_VALID_VND_PRICE,
        conditionAdjustedTradeInVnd + tradeInBonusVnd
      );
      selfResaleComparisonDeltaVnd =
        storeTradeInCreditVnd - oldDeviceBenchmarkVnd;
    }
  }

  const netCashPayableVnd = Math.max(
    0,
    priceAfterVoucherVnd - storeTradeInCreditVnd
  );
  const selfResaleNetPayableVnd = Math.max(
    0,
    priceAfterVoucherVnd - oldDeviceBenchmarkVnd
  );

  if (installmentTerm === 'cash') {
    return {
      basePriceVnd,
      discountMode,
      discountPercentApplied,
      discountCapAppliedVnd,
      voucherSavingsVnd,
      priceAfterVoucherVnd,
      tradeInEnabled,
      tradeInConditionTier,
      tradeInConditionPct,
      oldDeviceBenchmarkVnd,
      conditionAdjustedTradeInVnd,
      tradeInBonusVnd,
      storeTradeInCreditVnd,
      selfResaleComparisonDeltaVnd,
      netCashPayableVnd,
      selfResaleNetPayableVnd,
      installmentTerm: 'cash',
      installmentMonths: 0,
      installmentFeePercent: 0,
      conversionFeeVnd: 0,
      totalPaidVnd: netCashPayableVnd,
      monthlyPaymentVnd: 0,
      totalDiffVsCashVnd: 0,
    };
  }

  const conversionFeeVnd = Math.min(
    MAX_VALID_VND_PRICE,
    Math.round((netCashPayableVnd * rawInstallmentFeePct) / 100)
  );
  const totalPaidVnd = Math.min(
    MAX_VALID_VND_PRICE,
    netCashPayableVnd + conversionFeeVnd
  );
  const monthlyPaymentVnd = Math.round(totalPaidVnd / installmentTerm);
  const totalDiffVsCashVnd = Math.max(0, totalPaidVnd - netCashPayableVnd);

  return {
    basePriceVnd,
    discountMode,
    discountPercentApplied,
    discountCapAppliedVnd,
    voucherSavingsVnd,
    priceAfterVoucherVnd,
    tradeInEnabled,
    tradeInConditionTier,
    tradeInConditionPct,
    oldDeviceBenchmarkVnd,
    conditionAdjustedTradeInVnd,
    tradeInBonusVnd,
    storeTradeInCreditVnd,
    selfResaleComparisonDeltaVnd,
    netCashPayableVnd,
    selfResaleNetPayableVnd,
    installmentTerm,
    installmentMonths,
    installmentFeePercent: rawInstallmentFeePct,
    conversionFeeVnd,
    totalPaidVnd,
    monthlyPaymentVnd,
    totalDiffVsCashVnd,
  };
}

function channelSortRank(channel: SellerChannel): number {
  if (channel === 'authorized_vat') return 0;
  if (channel === 'official_mall') return 1;
  return 2;
}

function safeOfferTrustScore(riskScore: unknown): number | null {
  if (
    typeof riskScore === 'string'
      ? !riskScore.trim()
      : typeof riskScore !== 'number'
  ) {
    return null;
  }
  const num = typeof riskScore === 'number' ? riskScore : Number(riskScore);
  if (!Number.isFinite(num)) return null;
  const clampedRisk = Math.max(0, Math.min(100, Math.round(num)));
  return 100 - clampedRisk;
}

/**
 * Picks the best plausible in-stock offer overall and best plausible in-stock
 * Official VN/A offer, ignoring unavailable and bait-price listings.
 */
export function selectEffectivePriceBaseOffers<
  T extends EffectivePriceOfferCandidate,
>(
  offers: readonly T[] | null | undefined,
  fallbackMinPriceVnd: number
): EffectivePriceBaseSelection<T> {
  const safeFallback = sanitizePositiveCatalogPrice(fallbackMinPriceVnd);
  if (!Array.isArray(offers) || offers.length === 0) {
    return {
      bestPlausibleOffer: null,
      bestOfficialVnaOffer: null,
      bestPlausiblePriceVnd: safeFallback,
      bestOfficialVnaPriceVnd: null,
    };
  }

  const inStockOffers = offers.filter(
    (o): o is T =>
      Boolean(o && typeof o === 'object' && !Array.isArray(o)) &&
      !isOfferUnavailable(o)
  );
  const implausibleIds = implausiblyLowOfferIds(inStockOffers);

  const plausibleCandidates: SelectedOfferCandidate<T>[] = [];
  for (const offer of inStockOffers) {
    if (
      isOfferImplausiblyLowAgainstInStock(offer, inStockOffers, implausibleIds)
    ) {
      continue;
    }
    const priceVnd = sanitizePositiveCatalogPrice(offer.price_current);
    if (priceVnd <= 0) continue;

    const origin = detectProductOrigin(offer.title);
    const sellerChannel = classifySellerChannel({
      platform: offer.platform,
      isOfficial: offer.merchant?.is_official ?? null,
      merchantName: offer.merchant?.name ?? null,
      title: offer.title,
    });
    const trustScore = safeOfferTrustScore(offer.merchant?.risk_score);

    plausibleCandidates.push({
      offer,
      priceVnd,
      origin,
      sellerChannel,
      trustScore,
    });
  }

  plausibleCandidates.sort((a, b) => {
    if (a.priceVnd !== b.priceVnd) return a.priceVnd - b.priceVnd;
    const rankDiff =
      channelSortRank(a.sellerChannel) - channelSortRank(b.sellerChannel);
    if (rankDiff !== 0) return rankDiff;
    return (b.trustScore ?? -1) - (a.trustScore ?? -1);
  });

  const bestPlausibleOffer = plausibleCandidates[0] ?? null;
  const bestOfficialVnaOffer =
    plausibleCandidates.find((c) => c.origin === 'official_vna') ?? null;

  return {
    bestPlausibleOffer,
    bestOfficialVnaOffer,
    bestPlausiblePriceVnd: bestPlausibleOffer?.priceVnd ?? safeFallback,
    bestOfficialVnaPriceVnd: bestOfficialVnaOffer?.priceVnd ?? null,
  };
}

/**
 * Extracts up to two lightweight candidate offers (best overall + best Official
 * VN/A) for client serialization on product detail pages without duplicating
 * full offer telemetry and merchant breakdown payloads into RSC HTML.
 */
export function pickEffectivePriceCandidates<
  T extends EffectivePriceOfferCandidate,
>(
  offers: readonly T[] | null | undefined,
  fallbackMinPriceVnd: number
): EffectivePriceOfferCandidate[] {
  const { bestPlausibleOffer, bestOfficialVnaOffer } =
    selectEffectivePriceBaseOffers(offers, fallbackMinPriceVnd);
  const picked: EffectivePriceOfferCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [bestPlausibleOffer, bestOfficialVnaOffer]) {
    if (!candidate) continue;
    const raw = candidate.offer;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    picked.push({
      id: raw.id,
      platform: raw.platform,
      title: raw.title,
      price_current: raw.price_current,
      availability: raw.availability ?? null,
      merchant: raw.merchant
        ? {
            name: raw.merchant.name ?? null,
            is_official: raw.merchant.is_official ?? null,
            risk_score: raw.merchant.risk_score ?? null,
          }
        : null,
    });
  }
  return picked;
}
