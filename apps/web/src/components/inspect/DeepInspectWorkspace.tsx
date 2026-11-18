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
import { formatScoreFixed } from '@/lib/rating-display';
import AnalyzerText from '@/components/reviews/AnalyzerText';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';
import { Link, useRouter } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
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
  implausiblyLowOfferIds,
  isOfferImplausiblyLowAgainstInStock,
  normalizeOfferId,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from '@/lib/product-market-stats';
import { productImageUrl } from '@/lib/rate-domain-core';
import {
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
  const plausibilityOffers =
    inStockOffers.length > 0 ? inStockOffers : safeOffers;
  const implausibleOfferIds = implausiblyLowOfferIds(plausibilityOffers);
  const listedOffers = [...safeOffers].sort((a, b) => {
    const unavailableA = isOfferUnavailable(a) ? 1 : 0;
    const unavailableB = isOfferUnavailable(b) ? 1 : 0;
    if (unavailableA !== unavailableB) return unavailableA - unavailableB;
    const implausibleA = isInspectOfferBait(
      a,
      implausibleOfferIds,
      plausibilityOffers
    )
      ? 1
      : 0;
    const implausibleB = isInspectOfferBait(
      b,
      implausibleOfferIds,
      plausibilityOffers
    )
      ? 1
      : 0;
    return implausibleA - implausibleB;
  });
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

export function resolveInspectPriceVerdictPrices(params: {
  matchedOffer?: {
    price_current?: unknown;
    price_original?: unknown;
  } | null;
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
  const { matchedOffer, master, priceHistory } = params;
  return {
    currentPriceVnd:
      sanitizeInspectPriceVnd(matchedOffer?.price_current) ||
      sanitizeInspectPriceVnd(master?.min_price),
    claimedOriginalVnd: sanitizeInspectPriceVnd(matchedOffer?.price_original),
    historicalLowVnd:
      sanitizeInspectPriceVnd(priceHistory?.lowestEverPrice) ||
      sanitizeInspectPriceVnd(master?.min_price),
    historicalHighVnd:
      sanitizeInspectPriceVnd(priceHistory?.highestEverPrice) ||
      sanitizeInspectPriceVnd(master?.max_price),
  };
}

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
}): string[] {
  const current = sanitizeInspectPriceVnd(params.currentListedPrice);
  const orig = sanitizeInspectPriceVnd(params.claimedOrigPrice);
  const low = sanitizeInspectPriceVnd(params.histLow);
  const high = sanitizeInspectPriceVnd(params.histHigh);
  const out: string[] = [];
  if (current > 0) {
    const origSuffix =
      orig > 0
        ? ` | ${params.labels.claimedOriginalLabel}: ${orig.toLocaleString('vi-VN')} ₫`
        : '';
    out.push(
      `- **${params.labels.currentPriceLabel}:** ${current.toLocaleString('vi-VN')} ₫${origSuffix}`
    );
  }
  if (low > 0 || high > 0) {
    const lowStr = low > 0 ? `${low.toLocaleString('vi-VN')} ₫` : '-';
    const highStr = high > 0 ? `${high.toLocaleString('vi-VN')} ₫` : '-';
    out.push(
      `- **${params.labels.historicalLowLabel} / ${params.labels.historicalHighLabel}:** ${lowStr} - ${highStr}`
    );
  }
  return out;
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
      }
    | null
    | undefined,
  implausibleOfferIds: ReadonlySet<string>,
  inStockOffers: readonly { id?: string | null; price_current: number }[]
): boolean {
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
  // A sold-out listing is never the fallback match (DOS/Rate#1177).
  const matchedOffer =
    result?.matchedOffer ?? plausibleOffers(inStockOffers)[0] ?? null;
  // Judged among in-stock listings, as the product page's offers table does (#797, #1141).
  const offerImplausiblyLow = isInspectOfferBait(
    matchedOffer,
    implausibleOfferIds,
    plausibilityOffers
  );
  const matchedOfferUnavailable = Boolean(
    matchedOffer && isOfferUnavailable(matchedOffer)
  );
  const discount = offerImplausiblyLow
    ? null
    : filterInspectOfferDiscount(
        result?.discountAnalysis,
        matchedOfferUnavailable
      );
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
    master,
    priceHistory,
  });
  const watchableMinPriceVnd =
    sanitizeInspectPriceVnd(master?.min_price) ||
    (!offerImplausiblyLow && !matchedOfferUnavailable
      ? sanitizeInspectPriceVnd(matchedOffer?.price_current)
      : 0);
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

  const handleCopyAuditMarkdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const cleanQuery = sanitizeInspectQuery(queryInput);
      const shareUrl = `${window.location.origin}/inspect?q=${encodeURIComponent(
        cleanQuery
      )}`;
      const {
        currentPriceVnd: currentListedPrice,
        claimedOriginalVnd: rawClaimedOrig,
        historicalLowVnd: histLow,
        historicalHighVnd: histHigh,
      } = verdictPrices;
      const genuineDealPriceVnd = sanitizeInspectPriceVnd(
        matchedGenuineDeal?.priceCurrent
      );
      const spreadVnd = sanitizeInspectPriceVnd(matchedPriceSpread?.spreadVnd);
      const lines = [
        `### 🔬 ${t('title')} · Rate.vn`,
        `- **${t('mdQuery')}:** \`${cleanQuery}\``,
        ...(master
          ? [
              `- **${t('mdProduct')}:** ${master.name} (\`${master.model_key}\`)`,
              `- **${t('mdBuyerScore')}:** ${masterUserRating > 0 ? `★ ${formatScoreFixed(masterUserRating, 2)}/5.0` : t('userNoScore')}${masterExpertRating10 != null ? ` | ${t('mdExpertScore')}: ${formatScoreFixed(masterExpertRating10, 1)}/10` : ''} ${t('verifiedReviewsCount', { count: master.authentic_review_count || master.total_reviews || 0 })}`,
              `- **${t('mdPriceSignal')}:** ${radarMarkdownCell(radarSignal, locale)}`,
            ]
          : []),
        ...(offerImplausiblyLow
          ? [`- **${t('mdPriceVerdict')}:** **${t('implausiblyLowBadge')}**`]
          : matchedOfferUnavailable && !discount
            ? [
                `- **${t('mdPriceVerdict')}:** **${
                  matchedOffer?.availability === 'discontinued'
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
          labels: {
            currentPriceLabel: t('currentPriceLabel'),
            claimedOriginalLabel: t('claimedOriginalLabel'),
            historicalLowLabel: t('historicalLowLabel'),
            historicalHighLabel: t('historicalHighLabel'),
          },
        }),
        ...(matchedGenuineDeal && genuineDealPriceVnd > 0
          ? [
              `- ${t(genuinePillKey, { pct: matchedGenuineDeal.savingsVsMedianPct, platform: matchedGenuineDeal.platform.toUpperCase(), price: genuineDealPriceVnd.toLocaleString('vi-VN') })}`,
            ]
          : []),
        ...(matchedFakeTrap
          ? [
              `- ${t('radarFakePill', { pct: matchedFakeTrap.fakeMarkupPct, platform: matchedFakeTrap.platform.toUpperCase() })}`,
            ]
          : []),
        ...(matchedPriceSpread && spreadVnd > 0
          ? [
              `- ${t('radarSpreadPill', { pct: matchedPriceSpread.spreadPct, vnd: spreadVnd.toLocaleString('vi-VN'), cheapest: matchedPriceSpread.cheapestPlatform.toUpperCase(), priciest: matchedPriceSpread.priciestPlatform.toUpperCase() })}`,
            ]
          : []),
        ...(merchant
          ? [
              `- **${t('mdSeller')}:** ${merchant.name} (${merchant.platform.toUpperCase()}) | ${t('mdTrustScore')}: ${safeMerchantTrust == null ? t('trustNoData') : `**${safeMerchantTrust}/100**`} (${t('dosafeRiskLabel')}: ${dosafeDisplay == null ? t('reviewRiskNoData') : `${dosafeDisplay.score}/100`}, ${t('reviewRiskLabel')}: ${reviewRiskDisplay == null ? t('reviewRiskNoData') : `${reviewRiskDisplay.score}/100`})`,
            ]
          : []),
        `- **${t('mdLink')}:** ${shareUrl}`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
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
      sanitizeInspectPriceVnd(o.price_original),
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
          directByOffer ??
          canonicalByOffer ??
          (o.id === matchedOffer?.id ? discount : null);
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
                                sanitizeInspectPriceVnd(offer.price_original) >
                                0
                                  ? 'text-decoration-line-through'
                                  : ''
                              }`}
                            >
                              {formatInspectPriceVndOrDash(
                                offer.price_original,
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
