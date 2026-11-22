'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  merchantRiskTone,
  type MerchantRiskTone,
} from '@/lib/merchant-risk-tone';
import {
  discountVerdictCopy,
  type VerdictTranslator,
} from '@/lib/discount-verdict-copy';
import {
  evaluateOmnibusPriceAudit,
  formatOmnibusAuditCopy,
  type OmnibusPriceAuditResult,
  type OmnibusVerdictTranslator,
} from '@/lib/omnibus-price-audit';
import { formatScoreFixed, roundScore } from '@/lib/rating-display';
import AnalyzerText from '@/components/reviews/AnalyzerText';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';
import { Link, useRouter } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveCompareBatteryMah,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
  resolveCompareRamGb,
  resolveCompareStorageGb,
  resolveProductImageUrl,
  type OfferDiscountAnalysis,
  type UrlInspectionResult,
} from '@/lib/rate-domain';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import RadarBadge from '@/components/radar/RadarBadge';
import {
  EMPTY_RADAR_SIGNAL,
  getRadarSignal,
  isMultiPlatformFloor,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import type { KeySpecs } from '@repo/shared-data';
import {
  BsArrowRight,
  BsBarChart,
  BsCheckCircle,
  BsCheckCircleFill,
  BsCoin,
  BsCpu,
  BsDownload,
  BsExclamationTriangleFill,
  BsGraphDownArrow,
  BsLink45Deg,
  BsRobot,
  BsSearch,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
} from 'react-icons/bs';
import ContentText from '@/components/elementary/ContentText';
import { contentLang } from '@/lib/content-lang';
import { SAMPLE_AUDIT_URLS } from '@/lib/inspect-samples';
import {
  IMPLAUSIBLY_LOW_RATIO,
  MINIMUM_EARBUDS_PRICE_FLOOR_VND,
  hasImplausiblyLowOfferId,
  implausiblyLowIndexes,
  isImplausiblyLowPrice,
  isOfferImplausiblyLowAgainstInStock,
  minimumListingPriceVnd,
  normalizeOfferId,
  plausibleMinPrice,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from '@/lib/product-market-stats';
import { productImageUrl } from '@/lib/rate-domain-core';
import {
  collapseWhitespace,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';
import StarRating from '@/components/elementary/StarRating';

const INSPECT_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeInspectQuery(rawQuery: unknown, maxLen = 512): string {
  if (typeof rawQuery !== 'string') return '';
  const cleaned = rawQuery
    .replace(INSPECT_CONTROL_CHARS_RE, ' ')
    .replace(/`+/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function parseInspectFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(INSPECT_CONTROL_CHARS_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function sanitizeInspectPriceVnd(value: unknown): number {
  const num = parseInspectFiniteNumber(value);
  if (num == null || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  const rounded = Math.round(num);
  return rounded > 0 && rounded <= MAX_VALID_VND_PRICE ? rounded : 0;
}

export function formatInspectPriceVndOrDash(
  value: unknown,
  locale?: string | null
): string {
  const safePrice = sanitizeInspectPriceVnd(value);
  return safePrice > 0 ? formatPriceVnd(safePrice, locale) : '-';
}

export function formatInspectSuggestionLabel(
  name: string,
  minPrice: unknown,
  locale?: string | null
): string {
  const safePrice = sanitizeInspectPriceVnd(minPrice);
  return safePrice > 0
    ? `${name} (${formatPriceVnd(safePrice, locale)})`
    : name;
}

export function sanitizeInspectDownloadSlug(
  value: unknown,
  fallback = 'audit'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(INSPECT_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function inspectRiskToneClasses(tone: MerchantRiskTone): {
  textClass: string;
  barClass: string;
} {
  return {
    textClass:
      tone === 'good'
        ? 'text-success'
        : tone === 'warn'
          ? 'text-warning-emphasis'
          : 'text-danger',
    barClass:
      tone === 'good'
        ? 'bg-success'
        : tone === 'warn'
          ? 'bg-warning'
          : 'bg-danger',
  };
}

export function inspectDosafeDisplay(
  merchant: Parameters<typeof knownDosafeRiskScore>[0] | null | undefined
): {
  score: number;
  tone: MerchantRiskTone;
  textClass: string;
  barClass: string;
  widthPct: number;
} | null {
  if (!merchant) return null;
  const rawDosafeScore = knownDosafeRiskScore(merchant);
  if (rawDosafeScore == null) return null;
  const dosafeScore = Math.min(100, Math.max(0, Math.round(rawDosafeScore)));
  const tone = merchantRiskTone(dosafeScore);
  return {
    score: dosafeScore,
    tone,
    ...inspectRiskToneClasses(tone),
    widthPct: Math.min(100, Math.max(4, dosafeScore)),
  };
}

export function inspectReviewRiskDisplay(
  merchant:
    | {
        review_risk_score?: number | string | null;
        review_risk_breakdown?: { total_reviews?: unknown } | null;
      }
    | null
    | undefined
): {
  score: number;
  tone: MerchantRiskTone;
  textClass: string;
  barClass: string;
  widthPct: number;
} | null {
  if (!merchant || !hasReviewRiskEvidence(merchant.review_risk_breakdown)) {
    return null;
  }
  const rawReviewScore = parseInspectFiniteNumber(merchant.review_risk_score);
  if (rawReviewScore == null) return null;
  const reviewScore = Math.min(100, Math.max(0, Math.round(rawReviewScore)));
  const tone = merchantRiskTone(reviewScore);
  return {
    score: reviewScore,
    tone,
    ...inspectRiskToneClasses(tone),
    widthPct: Math.min(100, Math.max(4, reviewScore)),
  };
}

export function orderInspectOffers<
  T extends {
    id: string;
    price_current: number;
    availability?: OfferAvailability | null;
  },
>(
  offers: readonly T[] | null | undefined
): {
  inStockOffers: T[];
  plausibilityOffers: T[];
  implausibleOfferIds: Set<string>;
  listedOffers: T[];
} {
  const safeOffers = Array.isArray(offers) ? offers : [];
  const inStockOffers = safeOffers.filter((o) => !isOfferUnavailable(o));
  const hasInStock = inStockOffers.length > 0;
  const plausibilityOffers = hasInStock ? inStockOffers : safeOffers;
  const flaggedIndexes = implausiblyLowIndexes(
    plausibilityOffers.map((o) => o?.price_current)
  );
  const implausibleOfferIds = new Set<string>();
  for (const idx of flaggedIndexes) {
    const cleanId = normalizeOfferId(plausibilityOffers[idx]?.id);
    if (cleanId) implausibleOfferIds.add(cleanId);
  }

  let plausibleCutoff = 0;
  if (hasInStock && flaggedIndexes.size === 0 && inStockOffers.length >= 2) {
    const validPrices: number[] = [];
    for (let i = 0; i < inStockOffers.length; i++) {
      const p = inStockOffers[i]!.price_current;
      if (
        typeof p === 'number' &&
        Number.isFinite(p) &&
        p > 0 &&
        p <= MAX_VALID_VND_PRICE
      ) {
        validPrices.push(p);
      } else {
        const sp = sanitizeInspectPriceVnd(p);
        if (sp > 0) validPrices.push(sp);
      }
    }
    if (validPrices.length >= 2) {
      validPrices.sort((a, b) => a - b);
      plausibleCutoff =
        validPrices[Math.floor((validPrices.length - 1) / 2)]! *
        IMPLAUSIBLY_LOW_RATIO;
    }
  }

  const inStockPlausible: T[] = [];
  const inStockBait: T[] = [];
  const unavailablePlausible: T[] = [];
  const unavailableBait: T[] = [];
  let inStockCursor = 0;
  for (let i = 0; i < safeOffers.length; i++) {
    const offer = safeOffers[i]!;
    const unavailable = isOfferUnavailable(offer);
    const rawPrice = offer.price_current;
    const safePrice =
      typeof rawPrice === 'number'
        ? Number.isFinite(rawPrice) &&
          rawPrice > 0 &&
          rawPrice <= MAX_VALID_VND_PRICE
          ? Math.round(rawPrice)
          : 0
        : sanitizeInspectPriceVnd(rawPrice);
    const subFloorOrExplicit =
      (offer as { implausiblyLow?: boolean | null }).implausiblyLow === true ||
      (safePrice > 0 && safePrice < MINIMUM_EARBUDS_PRICE_FLOOR_VND);

    if (!unavailable) {
      const idx = inStockCursor++;
      if (subFloorOrExplicit || flaggedIndexes.has(idx)) {
        inStockBait.push(offer);
      } else {
        inStockPlausible.push(offer);
      }
    } else if (!hasInStock) {
      if (subFloorOrExplicit || flaggedIndexes.has(i)) {
        unavailableBait.push(offer);
      } else {
        unavailablePlausible.push(offer);
      }
    } else if (subFloorOrExplicit) {
      unavailableBait.push(offer);
    } else if (
      flaggedIndexes.size === 0 &&
      !(plausibleCutoff > 0 && safePrice > 0 && safePrice < plausibleCutoff)
    ) {
      unavailablePlausible.push(offer);
    } else if (
      isInspectOfferBait(offer, implausibleOfferIds, plausibilityOffers)
    ) {
      unavailableBait.push(offer);
    } else {
      unavailablePlausible.push(offer);
    }
  }
  const listedOffers = [
    ...inStockPlausible,
    ...inStockBait,
    ...unavailablePlausible,
    ...unavailableBait,
  ];
  return {
    inStockOffers,
    plausibilityOffers,
    implausibleOfferIds,
    listedOffers,
  };
}

export function filterInspectOfferDiscount<
  T extends { verdict?: string | null },
>(analysis: T | null | undefined, unavailable: boolean): T | null {
  if (!analysis) return null;
  if (
    unavailable &&
    analysis.verdict !== 'fake_discount' &&
    analysis.verdict !== 'suspicious_discount'
  ) {
    return null;
  }
  return analysis;
}

/**
 * The copied Markdown's price verdict, `**label** (explanation)`, in the UI
 * locale so prices and percentages match the page badges (DOS/Rate#1711).
 */
export function inspectMarkdownPriceVerdict(
  tVerdict: VerdictTranslator,
  discount: OfferDiscountAnalysis,
  locale: string
): string {
  const copy = discountVerdictCopy(tVerdict, discount, locale);
  return `**${copy.label}** (${copy.explanation})`;
}

export function sanitizeInspectOriginalPriceVnd(
  priceOriginal: unknown,
  priceCurrent: unknown
): number {
  const safeCurrent = sanitizeInspectPriceVnd(priceCurrent);
  const safeOrig = sanitizeInspectPriceVnd(priceOriginal);
  return safeCurrent > 0 && safeOrig > safeCurrent ? safeOrig : 0;
}

export function resolveInspectMasterMinPriceVnd(params: {
  matchedOffer?: {
    id?: string | null;
    price_current?: unknown;
    availability?: OfferAvailability | null;
    implausiblyLow?: boolean | null;
  } | null;
  allOffers?:
    | readonly {
        id: string;
        price_current: number;
        availability?: OfferAvailability | null;
        implausiblyLow?: boolean | null;
      }[]
    | null;
  inStockOffers?:
    | readonly {
        id?: string | null;
        price_current: number;
        availability?: OfferAvailability | null;
        implausiblyLow?: boolean | null;
      }[]
    | null;
  offerImplausiblyLow?: boolean;
  master?: {
    min_price?: unknown;
  } | null;
}): number {
  const { matchedOffer, allOffers, master } = params;
  const rawMasterMin = sanitizeInspectPriceVnd(master?.min_price);
  const safeOfferCurrent = sanitizeInspectPriceVnd(matchedOffer?.price_current);
  const hasAllOffers = Array.isArray(allOffers) && allOffers.length > 0;
  const hasExplicitInStock =
    Array.isArray(params.inStockOffers) && params.inStockOffers.length > 0;

  if (!hasAllOffers && !hasExplicitInStock) {
    if (rawMasterMin > 0 && rawMasterMin < MINIMUM_EARBUDS_PRICE_FLOOR_VND) {
      return 0;
    }
    const explicitBait =
      params.offerImplausiblyLow === true ||
      matchedOffer?.implausiblyLow === true ||
      (safeOfferCurrent > 0 &&
        safeOfferCurrent < MINIMUM_EARBUDS_PRICE_FLOOR_VND);
    if (
      explicitBait &&
      safeOfferCurrent > 0 &&
      rawMasterMin === safeOfferCurrent
    ) {
      return 0;
    }
    return rawMasterMin;
  }

  const candidateOffers = hasExplicitInStock
    ? params.inStockOffers!
    : allOffers!;
  const matchedCanonicalId = normalizeOfferId(matchedOffer?.id);
  const excludeMatchedBait =
    params.offerImplausiblyLow === true ||
    matchedOffer?.implausiblyLow === true ||
    (safeOfferCurrent > 0 &&
      safeOfferCurrent < MINIMUM_EARBUDS_PRICE_FLOOR_VND);

  const pricedNonBaitInStock = candidateOffers.filter((o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (isOfferUnavailable(o)) return false;
    if (o.implausiblyLow === true) return false;
    const price = sanitizeInspectPriceVnd(o.price_current);
    if (price < MINIMUM_EARBUDS_PRICE_FLOOR_VND) return false;
    if (excludeMatchedBait && matchedOffer) {
      if (o === matchedOffer) return false;
      if (
        price === safeOfferCurrent &&
        ((typeof o.id === 'string' && o.id === matchedOffer.id) ||
          (matchedCanonicalId !== '' &&
            normalizeOfferId(o.id) === matchedCanonicalId))
      ) {
        return false;
      }
    }
    return true;
  });

  if (pricedNonBaitInStock.length === 0) {
    return 0;
  }
  return plausibleMinPrice(0, pricedNonBaitInStock);
}

export function resolveInspectPriceVerdictPrices(params: {
  matchedOffer?: {
    id?: string | null;
    price_current?: unknown;
    price_original?: unknown;
    availability?: OfferAvailability | null;
    implausiblyLow?: boolean | null;
  } | null;
  allOffers?:
    | readonly {
        id: string;
        price_current: number;
        availability?: OfferAvailability | null;
        implausiblyLow?: boolean | null;
      }[]
    | null;
  inStockOffers?:
    | readonly {
        id?: string | null;
        price_current: number;
        availability?: OfferAvailability | null;
        implausiblyLow?: boolean | null;
      }[]
    | null;
  offerUnavailable?: boolean;
  offerImplausiblyLow?: boolean;
  master?: {
    min_price?: unknown;
    max_price?: unknown;
  } | null;
  priceHistory?: {
    lowestEverPrice?: unknown;
    highestEverPrice?: unknown;
  } | null;
}): {
  currentPriceVnd: number;
  claimedOriginalVnd: number;
  historicalLowVnd: number;
  historicalHighVnd: number;
} {
  const { matchedOffer, allOffers, master, priceHistory } = params;
  const safeOfferCurrent = sanitizeInspectPriceVnd(matchedOffer?.price_current);
  const rawMasterMin = sanitizeInspectPriceVnd(master?.min_price);
  const hasAllOffers = Array.isArray(allOffers) && allOffers.length > 0;
  let cachedOrdered: ReturnType<typeof orderInspectOffers> | null = null;
  const getOrdered = () => {
    if (!hasAllOffers) return null;
    if (!cachedOrdered) {
      cachedOrdered = orderInspectOffers(allOffers);
    }
    return cachedOrdered;
  };

  const unavailable = Boolean(
    params.offerUnavailable ||
    (matchedOffer && isOfferUnavailable(matchedOffer))
  );
  const bait = (() => {
    if (
      params.offerImplausiblyLow === true ||
      matchedOffer?.implausiblyLow === true
    ) {
      return true;
    }
    if (
      safeOfferCurrent > 0 &&
      safeOfferCurrent < MINIMUM_EARBUDS_PRICE_FLOOR_VND
    ) {
      return true;
    }
    if (
      rawMasterMin >= MINIMUM_EARBUDS_PRICE_FLOOR_VND &&
      safeOfferCurrent > 0 &&
      safeOfferCurrent < rawMasterMin * IMPLAUSIBLY_LOW_RATIO
    ) {
      return true;
    }
    if (params.offerImplausiblyLow === false) {
      return false;
    }
    if (!matchedOffer || safeOfferCurrent <= 0) {
      return false;
    }
    const candidate =
      typeof matchedOffer.id === 'string' &&
      typeof matchedOffer.price_current === 'number'
        ? (matchedOffer as {
            id: string;
            price_current: number;
            availability?: OfferAvailability | null;
          })
        : {
            id: typeof matchedOffer.id === 'string' ? matchedOffer.id : '',
            price_current: safeOfferCurrent,
            availability: matchedOffer.availability ?? null,
          };
    const matchedCanonicalId = normalizeOfferId(matchedOffer.id);
    const isPeerOffer = (o: { id?: string | null; price_current: number }) => {
      if (o === matchedOffer) return false;
      if (
        ((typeof o.id === 'string' && o.id === matchedOffer.id) ||
          (matchedCanonicalId !== '' &&
            normalizeOfferId(o.id) === matchedCanonicalId)) &&
        sanitizeInspectPriceVnd(o.price_current) === safeOfferCurrent
      ) {
        return false;
      }
      return true;
    };

    const ordered = getOrdered();
    if (ordered) {
      if (
        isInspectOfferBait(
          candidate,
          ordered.implausibleOfferIds,
          ordered.plausibilityOffers
        )
      ) {
        return true;
      }
      return isImplausiblyLowPrice(
        safeOfferCurrent,
        plausibleOffers(ordered.plausibilityOffers.filter(isPeerOffer))
      );
    }
    if (
      Array.isArray(params.inStockOffers) &&
      params.inStockOffers.length > 0
    ) {
      if (
        isOfferImplausiblyLowAgainstInStock(candidate, params.inStockOffers)
      ) {
        return true;
      }
      return isImplausiblyLowPrice(
        safeOfferCurrent,
        plausibleOffers(params.inStockOffers.filter(isPeerOffer))
      );
    }
    return false;
  })();

  const safeFallbackMin = resolveInspectMasterMinPriceVnd({
    matchedOffer,
    allOffers,
    inStockOffers:
      params.inStockOffers ??
      (hasAllOffers ? (getOrdered()?.inStockOffers ?? null) : null),
    offerImplausiblyLow: bait,
    master,
  });

  const suppressOfferPrices = unavailable || bait;
  const currentPriceVnd =
    (suppressOfferPrices ? 0 : safeOfferCurrent) || safeFallbackMin;
  const claimedOriginalVnd = suppressOfferPrices
    ? 0
    : sanitizeInspectOriginalPriceVnd(
        matchedOffer?.price_original,
        currentPriceVnd
      );

  return {
    currentPriceVnd,
    claimedOriginalVnd,
    historicalLowVnd:
      sanitizeInspectPriceVnd(priceHistory?.lowestEverPrice) || safeFallbackMin,
    historicalHighVnd:
      sanitizeInspectPriceVnd(priceHistory?.highestEverPrice) ||
      sanitizeInspectPriceVnd(master?.max_price),
  };
}

export const resolveInspectVerdictPrices = resolveInspectPriceVerdictPrices;

export function buildInspectMarkdownPriceLines(params: {
  currentListedPrice: unknown;
  claimedOrigPrice: unknown;
  histLow: unknown;
  histHigh: unknown;
  labels: {
    currentPriceLabel: string;
    claimedOriginalLabel: string;
    historicalLowLabel: string;
    historicalHighLabel: string;
  };
  locale?: string | null;
}): string[] {
  const current = sanitizeInspectPriceVnd(params.currentListedPrice);
  const orig = sanitizeInspectPriceVnd(params.claimedOrigPrice);
  const low = sanitizeInspectPriceVnd(params.histLow);
  const high = sanitizeInspectPriceVnd(params.histHigh);
  const out: string[] = [];
  if (current > 0) {
    const origSuffix =
      orig > current
        ? ` | ${params.labels.claimedOriginalLabel}: ${formatPriceVnd(orig, params.locale)}`
        : '';
    out.push(
      `- **${params.labels.currentPriceLabel}:** ${formatPriceVnd(current, params.locale)}${origSuffix}`
    );
  }
  if (low > 0 || high > 0) {
    const lowStr = low > 0 ? formatPriceVnd(low, params.locale) : '-';
    const highStr = high > 0 ? formatPriceVnd(high, params.locale) : '-';
    out.push(
      `- **${params.labels.historicalLowLabel} / ${params.labels.historicalHighLabel}:** ${lowStr} - ${highStr}`
    );
  }
  return out;
}

function formatInspectNonNegativePlainNumber(
  value: unknown,
  locale?: string | null
): string {
  const num = parseInspectFiniteNumber(value);
  const safe = num != null && num > 0 ? num : 0;
  return formatPlainNumber(safe, locale);
}

function sanitizeInspectMarkdownInline(
  value: unknown,
  fallback: string,
  locale?: string | null,
  maxLen = 160
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = collapseWhitespace(
    value.replace(INSPECT_CONTROL_CHARS_RE, ' ').replace(/\|/g, '-'),
    locale
  )
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

function sanitizeInspectMarkdownCodeSpan(
  value: unknown,
  fallback = '-',
  maxLen = 120
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(INSPECT_CONTROL_CHARS_RE, ' ')
    .replace(/`+/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

function sanitizeInspectNullableScore100(value: unknown): number | null {
  const num = parseInspectFiniteNumber(value);
  if (num == null) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(num)));
  return clamped === 0 ? 0 : clamped;
}

export type InspectMarkdownKey =
  | 'title'
  | 'mdQuery'
  | 'mdProduct'
  | 'mdBuyerScore'
  | 'userNoScore'
  | 'mdExpertScore'
  | 'verifiedReviewsCount'
  | 'mdPriceSignal'
  | 'mdPriceVerdict'
  | 'implausiblyLowBadge'
  | 'currentPriceLabel'
  | 'claimedOriginalLabel'
  | 'historicalLowLabel'
  | 'historicalHighLabel'
  | 'radarGenuinePill'
  | 'radarBelowMedianPill'
  | 'radarFakePill'
  | 'radarSpreadPill'
  | 'mdSeller'
  | 'unknownShop'
  | 'mdTrustScore'
  | 'trustNoData'
  | 'dosafeRiskLabel'
  | 'reviewRiskNoData'
  | 'reviewRiskLabel'
  | 'mdLink';

export type InspectMarkdownTranslator = (
  key: InspectMarkdownKey,
  values?: Record<string, string | number>
) => string;

export function buildInspectAuditMarkdown(params: {
  queryInput: string;
  origin: string;
  locale: string;
  t: InspectMarkdownTranslator;
  tVerdict: VerdictTranslator;
  tOffers: (
    key: 'offersDiscontinuedBadge' | 'offersUnavailableBadge'
  ) => string;
  master: UrlInspectionResult['masterProduct'] | null;
  masterUserRating: number;
  masterExpertRating10: number | null;
  radarSignal: ReturnType<typeof getRadarSignal>;
  offerImplausiblyLow: boolean;
  matchedOfferUnavailable: boolean;
  matchedOfferAvailability?: OfferAvailability | null;
  discount: OfferDiscountAnalysis | null;
  verdictPrices: ReturnType<typeof resolveInspectPriceVerdictPrices>;
  merchant: UrlInspectionResult['merchantProfile'] | null;
  safeMerchantTrust: number | null;
  dosafeDisplay: ReturnType<typeof inspectDosafeDisplay>;
  reviewRiskDisplay: ReturnType<typeof inspectReviewRiskDisplay>;
}): string {
  const {
    queryInput,
    origin,
    locale,
    t,
    tVerdict,
    tOffers,
    master,
    masterUserRating,
    masterExpertRating10,
    radarSignal,
    offerImplausiblyLow,
    matchedOfferUnavailable,
    matchedOfferAvailability,
    discount,
    verdictPrices,
    merchant,
    safeMerchantTrust,
    dosafeDisplay,
    reviewRiskDisplay,
  } = params;
  const cleanQuery = sanitizeInspectQuery(queryInput);
  const cleanOrigin =
    (typeof origin === 'string'
      ? origin.replace(INSPECT_CONTROL_CHARS_RE, '').trim().replace(/\/+$/, '')
      : '') || 'https://rate.vn';
  const shareUrl = `${cleanOrigin}/inspect?q=${encodeURIComponent(cleanQuery)}`;
  const {
    currentPriceVnd: currentListedPrice,
    claimedOriginalVnd: rawClaimedOrig,
    historicalLowVnd: histLow,
    historicalHighVnd: histHigh,
  } = verdictPrices;
  const matchedGenuineDeal = radarSignal.genuineDeal ?? null;
  const genuinePillKey = isMultiPlatformFloor(matchedGenuineDeal)
    ? 'radarGenuinePill'
    : 'radarBelowMedianPill';
  const matchedFakeTrap = radarSignal.fakeSaleTrap ?? null;
  const matchedPriceSpread = radarSignal.priceSpread ?? null;
  const genuineDealPriceVnd = sanitizeInspectPriceVnd(
    matchedGenuineDeal?.priceCurrent
  );
  const spreadVnd = sanitizeInspectPriceVnd(matchedPriceSpread?.spreadVnd);
  const parsedUserRating = parseInspectFiniteNumber(masterUserRating);
  const clampedUserRating =
    parsedUserRating != null && parsedUserRating > 0
      ? Math.min(5, parsedUserRating)
      : 0;
  const hasShownUserRating = roundScore(clampedUserRating, 2) > 0;
  const parsedExpertRating10 = parseInspectFiniteNumber(masterExpertRating10);
  const clampedExpertRating10 =
    parsedExpertRating10 != null && parsedExpertRating10 > 0
      ? Math.min(10, parsedExpertRating10)
      : 0;
  const hasShownExpertRating10 = roundScore(clampedExpertRating10, 1) > 0;
  const safeReviewCount = master
    ? Math.max(
        0,
        Math.floor(
          parseInspectFiniteNumber(master.authentic_review_count) ||
            parseInspectFiniteNumber(master.total_reviews) ||
            0
        )
      )
    : 0;
  const normalizedTrust = sanitizeInspectNullableScore100(safeMerchantTrust);
  const normalizedDosafe = sanitizeInspectNullableScore100(
    dosafeDisplay?.score
  );
  const normalizedReviewRisk = sanitizeInspectNullableScore100(
    reviewRiskDisplay?.score
  );
  const lines = [
    `### 🔬 ${t('title')} · Rate.vn`,
    `- **${t('mdQuery')}:** \`${cleanQuery}\``,
    ...(master
      ? [
          `- **${t('mdProduct')}:** ${sanitizeInspectMarkdownInline(master.name, '-', locale)} (\`${sanitizeInspectMarkdownCodeSpan(master.model_key)}\`)`,
          `- **${t('mdBuyerScore')}:** ${
            hasShownUserRating
              ? `★ ${formatPlainNumber(formatScoreFixed(clampedUserRating, 2), locale)}/${formatDecimal(5, locale, 1)}`
              : t('userNoScore')
          }${
            hasShownExpertRating10
              ? ` | ${t('mdExpertScore')}: ${formatPlainNumber(formatScoreFixed(clampedExpertRating10, 1), locale)}/10`
              : ''
          } ${t('verifiedReviewsCount', { count: safeReviewCount })}`,
          `- **${t('mdPriceSignal')}:** ${radarMarkdownCell(radarSignal, locale)}`,
        ]
      : []),
    ...(offerImplausiblyLow
      ? [`- **${t('mdPriceVerdict')}:** **${t('implausiblyLowBadge')}**`]
      : matchedOfferUnavailable && !discount
        ? [
            `- **${t('mdPriceVerdict')}:** **${
              matchedOfferAvailability === 'discontinued'
                ? tOffers('offersDiscontinuedBadge')
                : tOffers('offersUnavailableBadge')
            }**`,
          ]
        : discount
          ? [
              `- **${t('mdPriceVerdict')}:** ${inspectMarkdownPriceVerdict(tVerdict, discount, locale)}`,
            ]
          : []),
    ...buildInspectMarkdownPriceLines({
      currentListedPrice,
      claimedOrigPrice: rawClaimedOrig,
      histLow,
      histHigh,
      locale,
      labels: {
        currentPriceLabel: t('currentPriceLabel'),
        claimedOriginalLabel: t('claimedOriginalLabel'),
        historicalLowLabel: t('historicalLowLabel'),
        historicalHighLabel: t('historicalHighLabel'),
      },
    }),
    ...(matchedGenuineDeal && genuineDealPriceVnd > 0
      ? [
          `- ${t(genuinePillKey, {
            pct: formatInspectNonNegativePlainNumber(
              matchedGenuineDeal.savingsVsMedianPct,
              locale
            ),
            platform: sanitizeInspectMarkdownInline(
              matchedGenuineDeal.platform,
              'shopee',
              locale,
              32
            ).toUpperCase(),
            price: formatNumber(genuineDealPriceVnd, locale),
          })}`,
        ]
      : []),
    ...(matchedFakeTrap
      ? [
          `- ${t('radarFakePill', {
            pct: formatInspectNonNegativePlainNumber(
              matchedFakeTrap.fakeMarkupPct,
              locale
            ),
            platform: sanitizeInspectMarkdownInline(
              matchedFakeTrap.platform,
              'shopee',
              locale,
              32
            ).toUpperCase(),
          })}`,
        ]
      : []),
    ...(matchedPriceSpread && spreadVnd > 0
      ? [
          `- ${t('radarSpreadPill', {
            pct: formatInspectNonNegativePlainNumber(
              matchedPriceSpread.spreadPct,
              locale
            ),
            vnd: formatNumber(spreadVnd, locale),
            cheapest: sanitizeInspectMarkdownInline(
              matchedPriceSpread.cheapestPlatform,
              'shopee',
              locale,
              32
            ).toUpperCase(),
            priciest: sanitizeInspectMarkdownInline(
              matchedPriceSpread.priciestPlatform,
              'lazada',
              locale,
              32
            ).toUpperCase(),
          })}`,
        ]
      : []),
    ...(merchant
      ? [
          `- **${t('mdSeller')}:** ${sanitizeInspectMarkdownInline(merchant.name, t('unknownShop'), locale)} (${sanitizeInspectMarkdownInline(merchant.platform, 'shopee', locale, 32).toUpperCase()}) | ${t('mdTrustScore')}: ${normalizedTrust == null ? t('trustNoData') : `**${formatNumber(normalizedTrust, locale)}/100**`} (${t('dosafeRiskLabel')}: ${normalizedDosafe == null ? t('reviewRiskNoData') : `${formatNumber(normalizedDosafe, locale)}/100`}, ${t('reviewRiskLabel')}: ${normalizedReviewRisk == null ? t('reviewRiskNoData') : `${formatNumber(normalizedReviewRisk, locale)}/100`})`,
        ]
      : []),
    `- **${t('mdLink')}:** ${shareUrl}`,
  ];
  return lines.join('\n');
}

export function resolveInspectOfferPlatform(offer: {
  platform?: string | null;
  merchant?: { platform?: string | null } | null;
}): string {
  return offer.platform || offer.merchant?.platform || 'shopee';
}

export function isInspectOfferBait(
  offer:
    | {
        id: string;
        price_current: number;
        availability?: OfferAvailability | null;
        implausiblyLow?: boolean | null;
      }
    | null
    | undefined,
  implausibleOfferIds: ReadonlySet<string>,
  inStockOffers: readonly { id?: string | null; price_current: number }[]
): boolean {
  if (!offer) return false;
  if (offer.implausiblyLow === true) return true;
  const rawPrice = offer.price_current;
  const safePrice =
    typeof rawPrice === 'number'
      ? Number.isFinite(rawPrice) &&
        rawPrice > 0 &&
        rawPrice <= MAX_VALID_VND_PRICE
        ? Math.round(rawPrice)
        : 0
      : sanitizeInspectPriceVnd(rawPrice);
  if (safePrice > 0 && safePrice < MINIMUM_EARBUDS_PRICE_FLOOR_VND) {
    return true;
  }
  return isOfferImplausiblyLowAgainstInStock(
    offer,
    inStockOffers,
    implausibleOfferIds
  );
}

function clampInspectPercent(value: unknown): number {
  const num = parseInspectFiniteNumber(value);
  if (num == null) return 0;
  return Math.min(100, Math.max(0, num));
}

export function hasAnalyzedInspectReviews(
  reviewSummary: { total_analyzed?: unknown } | null | undefined
): boolean {
  const total = parseInspectFiniteNumber(reviewSummary?.total_analyzed);
  return total != null && Math.floor(total) > 0;
}

export function resolveInspectReviewTaxonomyDisplay(
  reviewSummary:
    | {
        total_analyzed?: unknown;
        authentic_pct?: unknown;
        suspicious_pct?: unknown;
        fake_pct?: unknown;
        ai_summary?: string | null;
      }
    | null
    | undefined,
  locale: string
):
  | {
      hasAnalyzedReviews: true;
      totalAnalyzed: number;
      authenticPctText: string;
      suspiciousPctText: string;
      fakePctText: string;
      aiSummary: string | null;
    }
  | {
      hasAnalyzedReviews: false;
      totalAnalyzed: 0;
      aiSummary: null;
    }
  | null {
  if (!reviewSummary) return null;
  const rawTotal = parseInspectFiniteNumber(reviewSummary.total_analyzed);
  const totalAnalyzed =
    rawTotal != null && rawTotal > 0 ? Math.floor(rawTotal) : 0;
  if (totalAnalyzed <= 0) {
    return {
      hasAnalyzedReviews: false,
      totalAnalyzed: 0,
      aiSummary: null,
    };
  }
  const cleanSummary =
    typeof reviewSummary.ai_summary === 'string' &&
    reviewSummary.ai_summary.trim()
      ? reviewSummary.ai_summary
      : null;
  return {
    hasAnalyzedReviews: true,
    totalAnalyzed,
    authenticPctText: formatPercent(
      clampInspectPercent(reviewSummary.authentic_pct),
      locale
    ),
    suspiciousPctText: formatPercent(
      clampInspectPercent(reviewSummary.suspicious_pct),
      locale
    ),
    fakePctText: formatPercent(
      clampInspectPercent(reviewSummary.fake_pct),
      locale
    ),
    aiSummary: cleanSummary,
  };
}

interface DeepInspectWorkspaceProps {
  initialQuery?: string;
  initialInspection?: UrlInspectionResult | null;
  locale?: string;
}

export default function DeepInspectWorkspace({
  initialQuery = '',
  initialInspection = null,
}: DeepInspectWorkspaceProps) {
  const t = useTranslations('inspect');
  const tVerdict = useTranslations('priceVerdict');
  const tOffers = useTranslations('productDetail');
  const locale = useLocale();
  const router = useRouter();

  const [queryInput, setQueryInput] = useState(
    initialQuery || SAMPLE_AUDIT_URLS[0]!.query
  );
  const [result, setResult] = useState<UrlInspectionResult | null>(
    initialInspection
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const radarIndex = useDealRadarIndex();

  const runInspection = async (targetQuery: string) => {
    const clean = sanitizeInspectQuery(targetQuery);
    if (!clean) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/v1/rate/inspect?q=${encodeURIComponent(clean)}`
      );
      const payload = (await res.json()) as {
        ok?: boolean;
        data?: UrlInspectionResult;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.data) {
        setErrorMsg(t('errInspectFailed'));
      } else {
        setResult(payload.data);
      }
    } catch {
      setErrorMsg(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialInspection && queryInput) {
      void runInspection(queryInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizeInspectQuery(queryInput);
    if (!clean) return;
    router.replace(`/inspect?q=${encodeURIComponent(clean)}`);
    await runInspection(clean);
  };

  const handleSelectSample = async (sampleQuery: string) => {
    const clean = sanitizeInspectQuery(sampleQuery);
    if (!clean) return;
    setQueryInput(clean);
    router.replace(`/inspect?q=${encodeURIComponent(clean)}`);
    await runInspection(clean);
  };

  const handleCopyReportLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
      sanitizeInspectQuery(queryInput)
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const master = result?.masterProduct ?? null;
  const {
    inStockOffers,
    plausibilityOffers,
    implausibleOfferIds,
    listedOffers,
  } = useMemo(() => orderInspectOffers(result?.allOffers), [result?.allOffers]);
  // A sold-out, unpriced, or bait listing is never the fallback match (DOS/Rate#1177, #1810).
  const matchedOffer =
    result?.matchedOffer ??
    plausibleOffers(
      inStockOffers.filter(
        (o) =>
          sanitizeInspectPriceVnd(o.price_current) >=
            MINIMUM_EARBUDS_PRICE_FLOOR_VND &&
          !isInspectOfferBait(o, implausibleOfferIds, plausibilityOffers)
      )
    )[0] ??
    null;
  const apiVerdictImplausiblyLow = Boolean(
    (
      result as {
        priceVerdict?: { implausiblyLow?: boolean | null } | null;
      } | null
    )?.priceVerdict?.implausiblyLow === true
  );
  const rawMasterMinForBait = sanitizeInspectPriceVnd(master?.min_price);
  const safeMatchedOfferPrice = sanitizeInspectPriceVnd(
    matchedOffer?.price_current
  );
  // Judged among in-stock listings, as the product page's offers table does (#797, #1141).
  const offerImplausiblyLow = Boolean(
    matchedOffer &&
    (apiVerdictImplausiblyLow ||
      isInspectOfferBait(
        matchedOffer,
        implausibleOfferIds,
        plausibilityOffers
      ) ||
      (rawMasterMinForBait >= MINIMUM_EARBUDS_PRICE_FLOOR_VND &&
        safeMatchedOfferPrice > 0 &&
        safeMatchedOfferPrice < rawMasterMinForBait * IMPLAUSIBLY_LOW_RATIO))
  );
  const hasAllOffersList = Boolean(
    Array.isArray(result?.allOffers) && result.allOffers.length > 0
  );
  const allOffersUnavailable = Boolean(
    hasAllOffersList &&
    !inStockOffers.some((o) => sanitizeInspectPriceVnd(o.price_current) > 0)
  );
  const matchedOfferUnavailable = Boolean(
    (matchedOffer && isOfferUnavailable(matchedOffer)) ||
    (!matchedOffer && allOffersUnavailable)
  );
  const discount = (() => {
    const rawDiscount = result?.discountAnalysis ?? null;
    if (!rawDiscount || offerImplausiblyLow || matchedOfferUnavailable) {
      return null;
    }
    if (
      matchedOffer &&
      safeMatchedOfferPrice < MINIMUM_EARBUDS_PRICE_FLOOR_VND
    ) {
      return null;
    }
    const safeDiscountPrice = sanitizeInspectPriceVnd(
      rawDiscount.price_current
    );
    if (safeDiscountPrice < MINIMUM_EARBUDS_PRICE_FLOOR_VND) {
      return null;
    }
    if (
      isInspectOfferBait(
        {
          id:
            typeof rawDiscount.product_id === 'string'
              ? rawDiscount.product_id
              : '',
          price_current: safeDiscountPrice,
        },
        implausibleOfferIds,
        plausibilityOffers
      )
    ) {
      return null;
    }
    return filterInspectOfferDiscount(rawDiscount, matchedOfferUnavailable);
  })();
  const priceHistory = result?.priceHistory ?? null;
  const reviewSummary = result?.reviewSummary ?? null;
  const merchant = result?.merchantProfile ?? null;
  const dosafeDisplay = inspectDosafeDisplay(merchant);
  const reviewRiskDisplay = inspectReviewRiskDisplay(merchant);
  const reviewTaxonomyDisplay = resolveInspectReviewTaxonomyDisplay(
    reviewSummary,
    locale
  );
  const verdictPrices = resolveInspectPriceVerdictPrices({
    matchedOffer,
    allOffers: result?.allOffers,
    inStockOffers,
    offerUnavailable: matchedOfferUnavailable,
    offerImplausiblyLow,
    master,
    priceHistory,
  });
  const safeMasterMinPriceVnd = resolveInspectMasterMinPriceVnd({
    matchedOffer,
    allOffers: result?.allOffers,
    inStockOffers,
    offerImplausiblyLow,
    master,
  });
  const watchableMinPriceVnd =
    safeMasterMinPriceVnd || verdictPrices.currentPriceVnd;
  const rawMerchantTrust = parseInspectFiniteNumber(merchant?.trust_score);
  const safeMerchantTrust =
    rawMerchantTrust == null
      ? null
      : Math.min(100, Math.max(0, Math.round(rawMerchantTrust)));

  const radarSignal =
    result?.radarSignal ??
    (master ? getRadarSignal(radarIndex, master.slug) : EMPTY_RADAR_SIGNAL);
  const matchedGenuineDeal = radarSignal.genuineDeal ?? null;
  // Only a multi-platform floor is the lowest price across stores; any other
  // genuine deal is just below the median (DOS/Rate#1661).
  const genuinePillKey = isMultiPlatformFloor(matchedGenuineDeal)
    ? 'radarGenuinePill'
    : 'radarBelowMedianPill';
  const matchedFakeTrap = radarSignal.fakeSaleTrap ?? null;
  const matchedPriceSpread = radarSignal.priceSpread ?? null;

  const masterUserRating = master
    ? resolveCompareEffectiveUserRating(master)
    : 0;
  const masterExpertRating10 = master
    ? resolveCompareExpertRating10(master)
    : null;

  const inspectOmnibusState = useMemo<{
    audit: OmnibusPriceAuditResult;
    listingScoped: boolean;
  } | null>(() => {
    if (
      offerImplausiblyLow ||
      matchedOfferUnavailable ||
      verdictPrices.currentPriceVnd <= 0 ||
      !priceHistory ||
      !Array.isArray(priceHistory.points) ||
      priceHistory.points.length === 0
    ) {
      return null;
    }

    const minValidPriceVnd =
      master && getMasterProductCategorySlug(master) === 'earbuds'
        ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
        : minimumListingPriceVnd([
            master?.name ?? '',
            matchedOffer?.title ?? '',
            queryInput,
          ]);

    const unavailableAnchorIds = new Set<string>();
    if (Array.isArray(result?.allOffers)) {
      for (const off of result.allOffers) {
        if (off && isOfferUnavailable(off)) {
          unavailableAnchorIds.add(off.id);
          const cId = normalizeOfferId(off.id);
          if (cId) unavailableAnchorIds.add(cId);
        }
      }
    }

    let latestMs = 0;
    for (const pt of priceHistory.points) {
      if (pt.source === 'live_listing') continue;
      if (hasImplausiblyLowOfferId(implausibleOfferIds, pt.product_id)) {
        continue;
      }
      if (
        unavailableAnchorIds.has(pt.product_id) ||
        unavailableAnchorIds.has(normalizeOfferId(pt.product_id))
      ) {
        continue;
      }
      const ms = new Date(pt.recorded_at).getTime();
      if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
    }
    const anchorMs = latestMs > 0 ? latestMs : null;

    if (matchedOffer?.id) {
      const targetCanon = normalizeOfferId(matchedOffer.id);
      const offerPts = priceHistory.points.filter((pt) => {
        if (pt.source === 'live_listing') return false;
        if (pt.product_id === matchedOffer.id) return true;
        return Boolean(
          targetCanon && normalizeOfferId(pt.product_id) === targetCanon
        );
      });
      // Evaluate the 90-day market cycle AT the matched listing's own selling
      // price (`verdictPrices.currentPriceVnd`) so an overpriced seller never
      // receives a green "Buy now" badge from a cheaper competitor's floor.
      const marketCycleForListing = evaluateOmnibusPriceAudit({
        points: priceHistory.points,
        currentPriceVnd: verdictPrices.currentPriceVnd,
        claimedOriginalPriceVnd:
          verdictPrices.claimedOriginalVnd > 0
            ? verdictPrices.claimedOriginalVnd
            : null,
        currentInStockPriceVnd: verdictPrices.currentPriceVnd,
        mode: 'market',
        referenceOffers: result?.allOffers,
        implausibleOfferIds,
        minValidPriceVnd,
        referenceTimestampMs: anchorMs,
      });
      // Always evaluate the 30-day EU prior floor strictly on `matchedOffer`'s
      // own history (`offerPts`, even if < 2 points -> `insufficient_history`),
      // never accusing a newly tracked shop using another shop's 30-day floor.
      const offerAudit = evaluateOmnibusPriceAudit({
        points: offerPts,
        currentPriceVnd: verdictPrices.currentPriceVnd,
        claimedOriginalPriceVnd:
          verdictPrices.claimedOriginalVnd > 0
            ? verdictPrices.claimedOriginalVnd
            : null,
        currentInStockPriceVnd: verdictPrices.currentPriceVnd,
        mode: 'offer',
        referenceOffers: result?.allOffers,
        implausibleOfferIds,
        minValidPriceVnd,
        referenceTimestampMs: anchorMs,
      });
      return {
        audit: {
          ...offerAudit,
          cycle90d:
            marketCycleForListing.cycle90d.signal !== 'insufficient_data'
              ? marketCycleForListing.cycle90d
              : offerAudit.cycle90d,
        },
        listingScoped: true,
      };
    }

    const inStockFloorVnd =
      safeMasterMinPriceVnd > 0
        ? safeMasterMinPriceVnd
        : verdictPrices.currentPriceVnd;
    let bestInStockOrig: number | null = null;
    for (const off of inStockOffers) {
      if (isInspectOfferBait(off, implausibleOfferIds, plausibilityOffers)) {
        continue;
      }
      if (sanitizeInspectPriceVnd(off.price_current) !== inStockFloorVnd) {
        continue;
      }
      const orig = sanitizeInspectOriginalPriceVnd(
        off.price_original,
        inStockFloorVnd
      );
      if (orig > 0 && (bestInStockOrig == null || orig > bestInStockOrig)) {
        bestInStockOrig = orig;
      }
    }

    const marketAudit = evaluateOmnibusPriceAudit({
      points: priceHistory.points,
      currentPriceVnd: inStockFloorVnd,
      claimedOriginalPriceVnd: bestInStockOrig,
      currentInStockPriceVnd:
        safeMasterMinPriceVnd > 0 ? safeMasterMinPriceVnd : null,
      mode: 'market',
      referenceOffers: result?.allOffers,
      implausibleOfferIds,
      minValidPriceVnd,
      referenceTimestampMs: anchorMs,
    });

    return {
      audit: marketAudit,
      listingScoped: false,
    };
  }, [
    implausibleOfferIds,
    inStockOffers,
    master,
    matchedOffer,
    matchedOfferUnavailable,
    offerImplausiblyLow,
    plausibilityOffers,
    priceHistory,
    queryInput,
    result?.allOffers,
    safeMasterMinPriceVnd,
    verdictPrices.claimedOriginalVnd,
    verdictPrices.currentPriceVnd,
  ]);

  const tOmnibus: OmnibusVerdictTranslator = (key, values) =>
    tVerdict(key, values);
  const inspectOmnibusCopy =
    inspectOmnibusState && inspectOmnibusState.audit.currentPriceVnd != null
      ? formatOmnibusAuditCopy(inspectOmnibusState.audit, tOmnibus, locale)
      : null;

  const handleCopyAuditMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const md = buildInspectAuditMarkdown({
        queryInput,
        origin: window.location.origin,
        locale,
        t: (key, values) => t(key, values),
        tVerdict,
        tOffers: (key) => tOffers(key),
        master,
        masterUserRating,
        masterExpertRating10,
        radarSignal,
        offerImplausiblyLow,
        matchedOfferUnavailable,
        matchedOfferAvailability: matchedOffer?.availability,
        discount,
        verdictPrices,
        merchant,
        safeMerchantTrust,
        dosafeDisplay,
        reviewRiskDisplay,
      });
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadInspectCsv = () => {
    if (typeof window === 'undefined' || !result) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      t('colMerchant'),
      'Platform',
      t('colListingTitle'),
      `${t('colCurrentPrice')} (VND)`,
      `${t('colOriginalPrice')} (VND)`,
      `${t('historicalLowLabel')} (VND)`,
      `${t('historicalHighLabel')} (VND)`,
      '10-Platform Price Spread (%)',
      t('colAuditStatus'),
      ...RADAR_CSV_HEADERS,
    ];
    const offers =
      listedOffers.length > 0
        ? listedOffers
        : matchedOffer
          ? [matchedOffer]
          : [];
    const { historicalLowVnd: histLow, historicalHighVnd: histHigh } =
      verdictPrices;
    const cleanQuery = sanitizeInspectQuery(queryInput);
    const rows = offers.map((o) => [
      o.merchant?.name || merchant?.name || t('unknownShop'),
      (
        o.platform ||
        o.merchant?.platform ||
        merchant?.platform ||
        'shopee'
      ).toUpperCase(),
      o.title || master?.name || cleanQuery,
      sanitizeInspectPriceVnd(o.price_current),
      sanitizeInspectOriginalPriceVnd(o.price_original, o.price_current),
      histLow,
      histHigh,
      matchedPriceSpread?.spreadPct ?? 0,
      (() => {
        if (isInspectOfferBait(o, implausibleOfferIds, plausibilityOffers)) {
          return t('implausiblyLowBadge');
        }
        const canonicalOfferId = normalizeOfferId(o.id);
        const byOfferMap = priceHistory?.byOffer;
        const directByOffer =
          byOfferMap && Object.hasOwn(byOfferMap, o.id)
            ? priceHistory?.byOffer?.[o.id]
            : undefined;
        const canonicalByOffer =
          canonicalOfferId &&
          byOfferMap &&
          Object.hasOwn(byOfferMap, canonicalOfferId)
            ? byOfferMap[canonicalOfferId]
            : undefined;
        const rawAnalysis =
          sanitizeInspectPriceVnd(o.price_current) >=
          MINIMUM_EARBUDS_PRICE_FLOOR_VND
            ? (directByOffer ??
              canonicalByOffer ??
              (o.id === matchedOffer?.id ? result?.discountAnalysis : null))
            : null;
        const a = filterInspectOfferDiscount(
          rawAnalysis,
          isOfferUnavailable(o)
        );
        if (a) return discountVerdictCopy(tVerdict, a, locale).label;
        if (isOfferUnavailable(o)) {
          return o.availability === 'discontinued'
            ? tOffers('offersDiscontinuedBadge')
            : tOffers('offersUnavailableBadge');
        }
        return t('checkedStatus');
      })(),
      ...radarCsvCells(radarSignal),
    ]);
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-inspect-${sanitizeInspectDownloadSlug(master?.slug, 'audit')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInspectJson = () => {
    if (typeof window === 'undefined' || !result) return;
    const payload = {
      source: 'Rate.vn Deep URL & Fake Discount Inspector',
      query: sanitizeInspectQuery(queryInput),
      exportedAt: new Date().toISOString(),
      dealRadar: radarExportFields(radarSignal),
      dealRadarContext: {
        genuineDeal: matchedGenuineDeal,
        fakeSaleTrap: matchedFakeTrap,
        priceSpread: matchedPriceSpread,
      },
      implausiblyLowOfferIds: Array.from(
        new Set([
          ...implausibleOfferIds,
          ...listedOffers
            .filter((o) =>
              isInspectOfferBait(o, implausibleOfferIds, plausibilityOffers)
            )
            .map((o) => normalizeOfferId(o.id))
            .filter(Boolean),
        ])
      ),
      inspection: result,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-inspect-${sanitizeInspectDownloadSlug(master?.slug, 'audit')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const keySpecs = (master?.key_specs || {}) as KeySpecs;
  const chipSpec =
    keySpecs.chip || master?.specifications?.hardware?.chipset || null;
  const resolvedRamGb = master ? resolveCompareRamGb(master) : null;
  const resolvedStorageGb = master ? resolveCompareStorageGb(master) : null;
  const ramSpec = keySpecs.ram || (resolvedRamGb ? `${resolvedRamGb}GB` : null);
  const storageSpec =
    keySpecs.storage ||
    (resolvedStorageGb
      ? resolvedStorageGb >= 1024
        ? `${Number((resolvedStorageGb / 1024).toFixed(1))}TB`
        : `${resolvedStorageGb}GB`
      : null);
  const resolvedBatteryMah = master ? resolveCompareBatteryMah(master) : null;
  const batterySpec =
    keySpecs.battery ||
    (resolvedBatteryMah ? `${resolvedBatteryMah} mAh` : null);
  const productHref = master ? getMasterProductHref(master) : '/smartphones';
  const productCategoryPath =
    productHref.replace(`/${master?.slug || ''}`, '') || '/smartphones';

  const { ref: exportMenuRef, close: closeExportMenu } = useDetailsDismiss();

  return (
    <div className="bg-light py-5">
      <div className="container">
        {/* Top Hero Inspector Card */}
        <div className="rate-scoreboard-dark rate-surface-dark p-lg-5 mb-4 p-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <span className="rate-eyebrow">{t('badge')}</span>
            <details ref={exportMenuRef} className="rate-export-menu ms-auto">
              <summary>
                <BsDownload aria-hidden="true" />
                {t('exportMenu')}
              </summary>
              <div className="rate-export-menu-list">
                <button
                  type="button"
                  onClick={handleCopyAuditMarkdown}
                  data-testid="inspect-copy-md-btn"
                >
                  {copiedMd ? t('copiedAuditMdBtn') : t('copyAuditMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadInspectCsv();
                    closeExportMenu();
                  }}
                  data-testid="inspect-export-csv-btn"
                >
                  {t('exportCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadInspectJson();
                    closeExportMenu();
                  }}
                  data-testid="inspect-export-json-btn"
                >
                  {t('exportJsonBtn')}
                </button>
                <button type="button" onClick={handleCopyReportLink}>
                  {copied ? t('copiedLinkBtn') : t('copyLinkBtn')}
                </button>
              </div>
            </details>
          </div>

          <h1 className="h2 fw-bold mb-2 text-white">{t('title')}</h1>
          <p className="text-white-50 mb-4">{t('subtitle')}</p>

          <form onSubmit={handleFormSubmit} className="row g-2 mb-3">
            <div className="col-lg-9">
              <div className="input-group input-group-lg">
                <span className="input-group-text text-danger border-0 bg-white">
                  <BsLink45Deg className="fs-4" />
                </span>
                <input
                  type="text"
                  className="form-control text-dark border-0"
                  placeholder={t('inputPlaceholder')}
                  // The sample URL pre-fills it, so the placeholder is never a
                  // visible label (DOS/Rate#1088).
                  aria-label={t('inputAria')}
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                />
              </div>
            </div>
            <div className="col-lg-3 d-grid">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary fw-semibold d-flex align-items-center justify-content-center gap-2 px-3 lh-sm"
              >
                <BsSearch />
                <span>{loading ? t('inspectingBtn') : t('inspectBtn')}</span>
              </button>
            </div>
          </form>

          {/* Sample quick-test pills */}
          <div className="d-flex align-items-center flex-wrap gap-2 pt-2">
            <span className="small text-white-50">{t('sampleLabel')}</span>
            {SAMPLE_AUDIT_URLS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => handleSelectSample(s.query)}
                className="btn btn-sm btn-outline-light rounded-pill small px-3 py-1"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="alert alert-danger rounded-4 mb-4 p-4">
            <BsExclamationTriangleFill className="me-2" />
            {errorMsg}
          </div>
        )}

        {result && (master || merchant) ? (
          <div className="row g-4">
            {/* Left 8 Columns: Price Verdict, Master Product & Cross-Merchant Offers */}
            <div className="col-lg-8 d-flex flex-column gap-4">
              {/* 1. Price & Fake Discount Verdict Card */}
              {(matchedOffer || priceHistory) && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h2 className="h5 fw-bold text-dark d-flex align-items-center mb-0 gap-2">
                      <BsGraphDownArrow className="text-danger" />
                      <span>{t('verdictTitle')}</span>
                    </h2>
                    {offerImplausiblyLow ? (
                      <span
                        className="badge bg-warning text-dark rounded-pill px-3 py-2"
                        data-testid="inspect-implausibly-low"
                        title={t('implausiblyLowTitle')}
                      >
                        <BsExclamationTriangleFill className="me-1" />
                        {t('implausiblyLowBadge')}
                      </span>
                    ) : discount?.verdict === 'fake_discount' ? (
                      <span className="badge bg-danger rounded-pill px-3 py-2 text-white">
                        <BsExclamationTriangleFill className="me-1" />
                        {t('fakeSaleWarning')}
                      </span>
                    ) : discount?.verdict === 'suspicious_discount' ? (
                      <span className="badge bg-warning text-dark rounded-pill px-3 py-2">
                        <BsExclamationTriangleFill className="me-1" />
                        {discountVerdictCopy(tVerdict, discount, locale).label}
                      </span>
                    ) : discount ? (
                      <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-3 py-2">
                        <BsCheckCircleFill className="me-1" />
                        {t('genuineDiscountBadge')}
                      </span>
                    ) : matchedOfferUnavailable ? (
                      <span
                        className="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-2"
                        data-testid="inspect-unavailable"
                        title={tOffers('offersUnavailableTitle')}
                      >
                        {matchedOffer?.availability === 'discontinued'
                          ? tOffers('offersDiscontinuedBadge')
                          : tOffers('offersUnavailableBadge')}
                      </span>
                    ) : null}
                  </div>

                  <div className="row g-3">
                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {t('currentPriceLabel')}
                        </div>
                        <div
                          className={`h5 fw-bold rate-tabular mb-0 ${
                            verdictPrices.currentPriceVnd > 0
                              ? 'text-danger'
                              : 'text-muted'
                          }`}
                        >
                          {formatInspectPriceVndOrDash(
                            verdictPrices.currentPriceVnd,
                            locale
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {t('claimedOriginalLabel')}
                        </div>
                        <div
                          className={`h6 fw-semibold rate-tabular mb-0 ${
                            verdictPrices.claimedOriginalVnd > 0
                              ? 'text-secondary text-decoration-line-through'
                              : 'text-muted'
                          }`}
                        >
                          {formatInspectPriceVndOrDash(
                            verdictPrices.claimedOriginalVnd,
                            locale
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {t('historicalLowLabel')}
                        </div>
                        <div
                          className={`h6 fw-bold rate-tabular mb-0 ${
                            verdictPrices.historicalLowVnd > 0
                              ? 'text-success'
                              : 'text-muted'
                          }`}
                        >
                          {formatInspectPriceVndOrDash(
                            verdictPrices.historicalLowVnd,
                            locale
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-sm-6 col-md-3">
                      <div className="rounded-3 bg-light h-100 p-3">
                        <div className="small text-muted mb-1">
                          {t('historicalHighLabel')}
                        </div>
                        <div
                          className={`h6 fw-bold rate-tabular mb-0 ${
                            verdictPrices.historicalHighVnd > 0
                              ? 'text-dark'
                              : 'text-muted'
                          }`}
                        >
                          {formatInspectPriceVndOrDash(
                            verdictPrices.historicalHighVnd,
                            locale
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {discount?.explanation && (
                    <div
                      className={`rounded-3 small fw-medium mt-3 p-3 ${
                        discount.verdict === 'fake_discount'
                          ? 'bg-danger bg-opacity-10 text-danger'
                          : discount.verdict === 'suspicious_discount'
                            ? 'bg-warning-subtle text-warning-emphasis'
                            : 'bg-success bg-opacity-10 text-success'
                      }`}
                    >
                      <strong>
                        {discountVerdictCopy(tVerdict, discount, locale).label}:
                      </strong>{' '}
                      {
                        discountVerdictCopy(tVerdict, discount, locale)
                          .explanation
                      }
                    </div>
                  )}

                  {/* 3-Column EU Omnibus 30-Day Floor Audit & 90-Day Cycle (#1863) */}
                  {inspectOmnibusCopy && inspectOmnibusState && (
                    <div
                      className="rounded-3 bg-light mt-3 border p-3"
                      data-testid="inspect-omnibus-audit-card"
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <div>
                          <h3 className="h6 fw-bold text-dark d-flex align-items-center mb-1 gap-2">
                            <BsShieldCheck
                              aria-hidden="true"
                              className="text-danger"
                            />
                            <span>{inspectOmnibusCopy.cardTitle}</span>
                          </h3>
                          <div className="text-muted small">
                            {inspectOmnibusState.listingScoped && matchedOffer
                              ? (() => {
                                  const resolvedMerchantName =
                                    matchedOffer.merchant?.name ||
                                    merchant?.name ||
                                    t('unknownShop');
                                  const scopeParts = t('omnibusScopeListing', {
                                    merchant: '\u0000',
                                    platform:
                                      resolveInspectOfferPlatform(
                                        matchedOffer
                                      ).toUpperCase(),
                                  }).split('\u0000');
                                  return (
                                    <>
                                      {scopeParts[0]}
                                      <ContentText
                                        text={resolvedMerchantName}
                                        locale={locale}
                                      />
                                      {scopeParts[1] ?? ''}
                                    </>
                                  );
                                })()
                              : t('omnibusScopeProduct')}
                          </div>
                        </div>
                        <span
                          data-testid="inspect-omnibus-window-badge"
                          className={`badge rounded-pill small px-3 py-2 ${
                            inspectOmnibusCopy.statusBadgeTone === 'good'
                              ? 'bg-success-subtle text-success border-success-subtle border'
                              : inspectOmnibusCopy.statusBadgeTone === 'bad'
                                ? 'bg-danger-subtle text-danger border-danger-subtle border'
                                : inspectOmnibusCopy.statusBadgeTone === 'warn'
                                  ? 'bg-warning text-dark'
                                  : 'bg-secondary-subtle text-secondary border'
                          }`}
                        >
                          {inspectOmnibusCopy.statusBadgeText}
                        </span>
                      </div>

                      <div className="row g-3 mt-1">
                        <div className="col-md-4 col-12">
                          <div className="rounded-3 bg-white h-100 border p-3">
                            <div className="small text-muted mb-1">
                              {inspectOmnibusCopy.colCurrentTitle}
                            </div>
                            <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                              <span className="h6 fw-bold text-danger rate-tabular mb-0">
                                {inspectOmnibusCopy.currentPriceText}
                              </span>
                              {inspectOmnibusCopy.claimedBadgeText && (
                                <span className="badge bg-warning text-dark rounded-pill small">
                                  {inspectOmnibusCopy.claimedBadgeText}
                                </span>
                              )}
                            </div>
                            <div
                              className={
                                inspectOmnibusCopy.currentSubTone === 'bad'
                                  ? 'text-danger fw-semibold'
                                  : inspectOmnibusCopy.currentSubTone === 'good'
                                    ? 'text-success'
                                    : 'text-muted'
                              }
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {inspectOmnibusCopy.currentSubText}
                            </div>
                          </div>
                        </div>

                        <div className="col-md-4 col-12">
                          <div className="rounded-3 bg-white h-100 border p-3">
                            <div className="small text-muted mb-1">
                              {inspectOmnibusCopy.colFloorTitle}
                            </div>
                            <div className="h6 fw-bold text-dark rate-tabular mb-1">
                              {inspectOmnibusCopy.floorPriceText}
                            </div>
                            <div
                              className={
                                inspectOmnibusCopy.floorDeltaTone === 'good'
                                  ? 'text-success fw-semibold'
                                  : inspectOmnibusCopy.floorDeltaTone === 'bad'
                                    ? 'text-danger fw-semibold'
                                    : 'text-secondary'
                              }
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {inspectOmnibusCopy.floorDeltaText}
                            </div>
                            {inspectOmnibusCopy.floorDisclaimerText && (
                              <div
                                className="text-muted mt-1"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                {inspectOmnibusCopy.floorDisclaimerText}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="col-md-4 col-12">
                          <div className="rounded-3 bg-white h-100 border p-3">
                            <div className="small text-muted mb-1">
                              {inspectOmnibusCopy.colCycleTitle}
                            </div>
                            <div
                              data-testid="inspect-omnibus-cycle-signal"
                              className={`fw-bold mb-1 ${
                                inspectOmnibusCopy.cycleValueTone === 'good'
                                  ? 'text-success'
                                  : inspectOmnibusCopy.cycleValueTone === 'bad'
                                    ? 'text-danger'
                                    : 'text-dark'
                              }`}
                            >
                              {inspectOmnibusCopy.cycleValueText}
                            </div>
                            <div
                              className="text-muted"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {inspectOmnibusCopy.cycleSubText}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {((matchedGenuineDeal &&
                    sanitizeInspectPriceVnd(matchedGenuineDeal.priceCurrent) >
                      0) ||
                    matchedFakeTrap ||
                    (matchedPriceSpread &&
                      sanitizeInspectPriceVnd(matchedPriceSpread.spreadVnd) >
                        0)) && (
                    <div
                      className="rounded-3 bg-light mt-3 border p-3"
                      data-testid="inspect-deal-radar-verdict"
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <span className="badge bg-dark rounded-pill text-warning">
                          {t('radarSectionBadge')}
                        </span>
                        <Link
                          href="/deals"
                          className="small fw-semibold text-danger text-decoration-none"
                        >
                          {t('openDealRadarLink')}
                        </Link>
                      </div>
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        {matchedGenuineDeal &&
                          sanitizeInspectPriceVnd(
                            matchedGenuineDeal.priceCurrent
                          ) > 0 && (
                            <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-3 py-2">
                              {t(genuinePillKey, {
                                pct: formatPlainNumber(
                                  matchedGenuineDeal.savingsVsMedianPct,
                                  locale
                                ),
                                platform:
                                  matchedGenuineDeal.platform.toUpperCase(),
                                price: formatNumber(
                                  sanitizeInspectPriceVnd(
                                    matchedGenuineDeal.priceCurrent
                                  ),
                                  locale
                                ),
                              })}
                            </span>
                          )}
                        {matchedFakeTrap && (
                          <span className="badge bg-danger-subtle text-danger border-danger-subtle rounded-pill border px-3 py-2">
                            {t('radarFakePill', {
                              pct: formatPlainNumber(
                                matchedFakeTrap.fakeMarkupPct,
                                locale
                              ),
                              platform: matchedFakeTrap.platform.toUpperCase(),
                            })}
                          </span>
                        )}
                        {matchedPriceSpread &&
                          sanitizeInspectPriceVnd(
                            matchedPriceSpread.spreadVnd
                          ) > 0 && (
                            <span className="badge bg-warning-subtle text-dark border-warning-subtle rounded-pill border px-3 py-2">
                              {t('radarSpreadPill', {
                                pct: formatPlainNumber(
                                  matchedPriceSpread.spreadPct,
                                  locale
                                ),
                                vnd: formatNumber(
                                  sanitizeInspectPriceVnd(
                                    matchedPriceSpread.spreadVnd
                                  ),
                                  locale
                                ),
                                cheapest:
                                  matchedPriceSpread.cheapestPlatform.toUpperCase(),
                                priciest:
                                  matchedPriceSpread.priciestPlatform.toUpperCase(),
                              })}
                            </span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Canonical Master Product Card */}
              {master && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
                    <div>
                      <span className="badge bg-dark rounded-pill mb-2 px-3 py-1 text-white">
                        {t('masterProductSection')}
                      </span>
                      <h3 className="h4 fw-bold text-dark mb-1">
                        {master.name}
                      </h3>
                      <div className="small text-muted">
                        {t('specModelKey')}: <code>{master.model_key}</code> |{' '}
                        {t('specBrand')}: <strong>{master.brand}</strong>
                      </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                      <CompareQuickToggle
                        item={{
                          slug: master.slug,
                          name: master.name,
                          brand: master.brand,
                          categoryPath: productCategoryPath,
                          thumbnail: resolveProductImageUrl(
                            master.slug,
                            productImageUrl(master)
                          ),
                          min_price: watchableMinPriceVnd,
                        }}
                      />
                      {watchableMinPriceVnd > 0 && (
                        <PriceWatchButton
                          slug={master.slug}
                          name={master.name}
                          brand={master.brand}
                          categoryPath={productCategoryPath}
                          thumbnail={resolveProductImageUrl(
                            master.slug,
                            productImageUrl(master)
                          )}
                          currentMinPrice={watchableMinPriceVnd}
                        />
                      )}
                    </div>
                  </div>

                  {/* Quick Key Specs Strip */}
                  <div className="row g-2 mb-3">
                    {chipSpec && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <BsCpu className="text-danger me-1" />
                          <strong>{t('specChip')}:</strong>{' '}
                          <ContentText text={chipSpec} locale={locale} />
                        </div>
                      </div>
                    )}
                    {(ramSpec || storageSpec) && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>RAM/ROM:</strong>{' '}
                          {[ramSpec, storageSpec].filter(Boolean).join(' / ')}
                        </div>
                      </div>
                    )}
                    {batterySpec && (
                      <div className="col-sm-6 col-md-4">
                        <div className="rounded-3 bg-light small p-2">
                          <strong>{t('specBattery')}:</strong>{' '}
                          <ContentText text={batterySpec} locale={locale} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top flex-wrap gap-2 pt-3">
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <StarRating
                        value={masterUserRating}
                        count={
                          masterUserRating > 0
                            ? master.authentic_review_count ||
                              master.total_reviews ||
                              0
                            : null
                        }
                        size="sm"
                        emptyLabel={t('userNoScore')}
                      />
                      <span className="rate-score-badge-expert">
                        <span>
                          {t('expertLabel')}{' '}
                          {masterExpertRating10 != null &&
                          masterExpertRating10 > 0
                            ? `${formatDecimal(masterExpertRating10, locale, 1)}/10`
                            : t('expertNoScore')}
                        </span>
                      </span>
                      <RadarBadge signal={radarSignal} />
                    </div>
                    <Link
                      href={productHref}
                      className="btn btn-danger rounded-pill btn-sm fw-semibold d-inline-flex align-items-center gap-2 px-4"
                    >
                      <span>{t('viewFullSpecsBtn')}</span>
                      <BsArrowRight />
                    </Link>
                  </div>
                </div>
              )}

              {/* 3. Cross-Merchant Offers Table */}
              {result.allOffers && result.allOffers.length > 0 && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <h3 className="h5 fw-bold text-dark mb-3">
                    {t('offersTableTitle')} ({result.allOffers.length})
                  </h3>
                  <div className="table-responsive">
                    <table className="mb-0 table align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>{t('colMerchant')}</th>
                          <th>{t('colListingTitle')}</th>
                          <th>{t('colCurrentPrice')}</th>
                          <th>{t('colOriginalPrice')}</th>
                          <th>{t('colAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listedOffers.map((offer) => (
                          <tr key={offer.id}>
                            <td>
                              <div className="fw-semibold text-dark">
                                {offer.merchant?.name ? (
                                  <ContentText
                                    text={offer.merchant.name}
                                    locale={locale}
                                  />
                                ) : (
                                  t('unknownShop')
                                )}
                              </div>
                              <span className="badge bg-secondary bg-opacity-10 text-secondary text-uppercase small">
                                {resolveInspectOfferPlatform(offer)}
                              </span>
                            </td>
                            <td
                              className="small text-muted"
                              lang={contentLang(offer.title, locale)}
                            >
                              {offer.title}
                            </td>
                            <td
                              className={`fw-bold ${
                                sanitizeInspectPriceVnd(offer.price_current) > 0
                                  ? 'text-danger'
                                  : 'text-muted'
                              }`}
                            >
                              {formatInspectPriceVndOrDash(
                                offer.price_current,
                                locale
                              )}
                              {isInspectOfferBait(
                                offer,
                                implausibleOfferIds,
                                plausibilityOffers
                              ) && (
                                <span
                                  className="badge bg-warning text-dark d-block mt-1"
                                  data-testid="inspect-offer-implausibly-low"
                                  title={t('implausiblyLowTitle')}
                                >
                                  {t('implausiblyLowBadge')}
                                </span>
                              )}
                              {isOfferUnavailable(offer) && (
                                <span
                                  className="badge bg-secondary-subtle text-secondary d-block mt-1"
                                  data-testid="inspect-offer-unavailable"
                                  title={tOffers('offersUnavailableTitle')}
                                >
                                  {offer.availability === 'discontinued'
                                    ? tOffers('offersDiscontinuedBadge')
                                    : tOffers('offersUnavailableBadge')}
                                </span>
                              )}
                            </td>
                            <td
                              className={`small text-muted ${
                                sanitizeInspectOriginalPriceVnd(
                                  offer.price_original,
                                  offer.price_current
                                ) > 0
                                  ? 'text-decoration-line-through'
                                  : ''
                              }`}
                            >
                              {formatInspectPriceVndOrDash(
                                sanitizeInspectOriginalPriceVnd(
                                  offer.price_original,
                                  offer.price_current
                                ),
                                locale
                              )}
                            </td>
                            <td>
                              {offer.merchant?.id && (
                                <Link
                                  href={`/merchants/${offer.merchant.id}`}
                                  className="btn btn-sm btn-outline-dark rounded-pill px-3"
                                >
                                  {t('auditShopBtn')}
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right 4 Columns: Merchant Dual Risk Profile & AI Review Taxonomy */}
            <div className="col-lg-4 d-flex flex-column gap-4">
              {merchant && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex align-items-center mb-3 gap-2">
                    <BsShop className="text-danger fs-4" />
                    <h3 className="h5 fw-bold text-dark mb-0">
                      {t('merchantAuditSection')}
                    </h3>
                  </div>

                  <div className="rounded-3 bg-light mb-3 p-3">
                    <div className="fw-bold text-dark fs-5 mb-1">
                      <ContentText text={merchant.name} locale={locale} />
                    </div>
                    <div className="d-flex align-items-center small text-muted flex-wrap gap-2">
                      <span className="badge bg-dark text-uppercase">
                        {merchant.platform}
                      </span>
                      {merchant.is_official && (
                        <span className="badge bg-danger">
                          {t('officialStore')}
                        </span>
                      )}
                      <span>ID: {merchant.platform_shop_id}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{t('dosafeRiskLabel')}</span>
                      {/* No DOSafe score: no number, not 0 (DOS/Rate#1465). */}
                      {dosafeDisplay == null ? (
                        <span className="text-muted">
                          {t('reviewRiskNoData')}
                        </span>
                      ) : (
                        <strong className={dosafeDisplay.textClass}>
                          {Number(dosafeDisplay.score).toFixed(0)}
                          /100
                        </strong>
                      )}
                    </div>
                    {dosafeDisplay != null && (
                      <div className="progress" style={{ height: 8 }}>
                        <div
                          className={`progress-bar ${dosafeDisplay.barClass}`}
                          style={{
                            width: `${dosafeDisplay.widthPct}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-muted">{t('reviewRiskLabel')}</span>
                      {/* No analysed reviews: no number (DOS/Rate#1258). */}
                      {reviewRiskDisplay == null ? (
                        <span className="text-muted">
                          {t('reviewRiskNoData')}
                        </span>
                      ) : (
                        <strong className={reviewRiskDisplay.textClass}>
                          {reviewRiskDisplay.score}/100
                        </strong>
                      )}
                    </div>
                    {reviewRiskDisplay != null && (
                      <div className="progress" style={{ height: 8 }}>
                        <div
                          className={`progress-bar ${reviewRiskDisplay.barClass}`}
                          style={{
                            width: `${reviewRiskDisplay.widthPct}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/merchants/${merchant.id}`}
                    className="btn btn-outline-danger rounded-pill fw-semibold w-100"
                  >
                    <BsShieldCheck className="me-2" />
                    {t('viewMerchantProfileBtn')}
                  </Link>
                </div>
              )}

              {reviewTaxonomyDisplay && (
                <div className="card rounded-4 border-0 bg-white p-4 shadow-sm">
                  <div className="d-flex align-items-center mb-3 gap-2">
                    <BsShieldExclamation className="text-danger fs-4" />
                    <h3 className="h5 fw-bold text-dark mb-0">
                      {t('reviewTaxonomySection')}
                    </h3>
                  </div>

                  {reviewTaxonomyDisplay.hasAnalyzedReviews ? (
                    <div className="d-flex flex-column small gap-2">
                      <div className="d-flex justify-content-between rounded-3 bg-success bg-opacity-10 text-success fw-semibold p-2">
                        <span>
                          <BsCheckCircle aria-hidden="true" className="me-1" />
                          {t('authenticLabel')}
                        </span>
                        <span>{reviewTaxonomyDisplay.authenticPctText}</span>
                      </div>
                      <div className="d-flex justify-content-between rounded-3 bg-warning-subtle text-warning-emphasis p-2">
                        <span>
                          <BsCoin aria-hidden="true" className="me-1" />
                          {t('coinSpamLabel')}
                        </span>
                        <strong>
                          {reviewTaxonomyDisplay.suspiciousPctText}
                        </strong>
                      </div>
                      <div className="d-flex justify-content-between rounded-3 bg-danger bg-opacity-10 text-danger p-2">
                        <span>
                          <BsRobot aria-hidden="true" className="me-1" />
                          {t('seedingFakeLabel')}
                        </span>
                        <strong>{reviewTaxonomyDisplay.fakePctText}</strong>
                      </div>
                      <div className="d-flex justify-content-between rounded-3 bg-secondary bg-opacity-10 text-secondary p-2">
                        <span>
                          <BsBarChart aria-hidden="true" className="me-1" />
                          {t('totalAuditedLabel')}
                        </span>
                        <strong>
                          {formatNumber(
                            reviewTaxonomyDisplay.totalAnalyzed,
                            locale
                          )}
                        </strong>
                      </div>
                      {reviewTaxonomyDisplay.aiSummary && (
                        <div className="rounded-3 bg-light text-muted mt-1 p-2">
                          <AnalyzerText
                            text={reviewTaxonomyDisplay.aiSummary}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="d-flex flex-column small gap-2">
                      <div className="rounded-3 bg-light text-muted p-3">
                        {t('reviewRiskNoData')}
                      </div>
                      <div className="d-flex justify-content-between rounded-3 bg-secondary bg-opacity-10 text-secondary p-2">
                        <span>
                          <BsBarChart aria-hidden="true" className="me-1" />
                          {t('totalAuditedLabel')}
                        </span>
                        <strong>0</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          !loading && (
            <div className="card rounded-4 border-0 bg-white p-5 text-center shadow-sm">
              <h2 className="h4 fw-bold text-dark mb-2">
                {t('notFoundTitle')}
              </h2>
              <p className="text-muted mb-4">{t('notFoundDesc')}</p>
              {result?.suggestions && result.suggestions.length > 0 && (
                <div className="d-flex justify-content-center flex-wrap gap-2">
                  {result.suggestions.map((item) => (
                    <Link
                      key={item.id}
                      href={getMasterProductHref(item)}
                      className="btn btn-outline-danger rounded-pill btn-sm px-3"
                    >
                      {formatInspectSuggestionLabel(
                        item.name,
                        item.min_price,
                        locale
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
