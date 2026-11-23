'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  hasReviewRiskEvidence,
  merchantRiskTone,
  type MerchantRiskTone,
} from '@/lib/merchant-risk-tone';
import ExportMenu from '@/components/elementary/ExportMenu';
import {
  BsBarChart,
  BsCheckCircle,
  BsExclamationOctagon,
  BsExclamationTriangle,
} from 'react-icons/bs';
import {
  discountVerdictCopy,
  type VerdictTranslator,
} from '@/lib/discount-verdict-copy';
import { Link } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
} from '@/lib/rate-domain';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  classifySellerChannel,
  detectProductOrigin,
  implausiblyLowOfferIds,
  isOfferImplausiblyLowAgainstInStock,
  normalizeOfferId,
  type ProductOrigin,
  type SellerChannel,
} from '@repo/shared-data/rules';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import { contentLang } from '@/lib/content-lang';
import ContentText from '@/components/elementary/ContentText';
import {
  collapseWhitespace,
  formatNumber,
  formatPercent,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';

interface ProductOffersExplorerProps {
  readonly productName: string;
  readonly productSlug: string;
  readonly offers: readonly MerchantOffer[];
  readonly byOffer: MasterProductPriceHistorySummary['byOffer'];
  readonly radarSignal?: RadarSignal | null;
  readonly initialHighTrustOnly?: boolean;
  readonly initialOfficialVnaOnly?: boolean;
}

export type OfferSortKey = 'price_asc' | 'trust_desc' | 'discount_desc';

export function computeMerchantTrustScore(riskScore: unknown): number {
  const num = Number(riskScore);
  const clampedRisk = Number.isFinite(num)
    ? Math.max(0, Math.min(100, Math.round(num)))
    : 0;
  return 100 - clampedRisk;
}

/**
 * An offer seller's trust, or null when the seller has no score at all: no
 * DOSafe score and no stored review score (DOS/Rate#1484). Never 100 from no data.
 */
export function offerTrustScore(riskScore: unknown): number | null {
  if (
    typeof riskScore === 'string'
      ? !riskScore.trim()
      : typeof riskScore !== 'number'
  ) {
    return null;
  }
  const num = typeof riskScore === 'number' ? riskScore : Number(riskScore);
  if (!Number.isFinite(num)) return null;
  return computeMerchantTrustScore(num);
}

export function offerRiskTone(riskScore: unknown): MerchantRiskTone | null {
  const trust = offerTrustScore(riskScore);
  if (trust == null) return null;
  return merchantRiskTone(100 - trust);
}

export function offerTrustBadgeClass(riskScore: unknown): string {
  const tone = offerRiskTone(riskScore);
  if (tone == null) return 'bg-light text-muted border';
  if (tone === 'good') return 'bg-success-subtle text-success';
  if (tone === 'warn') return 'bg-warning-subtle text-warning-emphasis';
  return 'bg-danger-subtle text-danger';
}

export function hasPositiveOfferPrice(price: unknown): boolean {
  const num = typeof price === 'number' ? price : Number(price);
  return Number.isFinite(num) && num > 0 && num <= MAX_VALID_VND_PRICE;
}

export function buildExplorerInspectHref(
  safeOfferUrl: string,
  priceCurrent: unknown
): string {
  const base = `/inspect?q=${encodeURIComponent(safeOfferUrl)}`;
  if (!hasPositiveOfferPrice(priceCurrent)) {
    return base;
  }
  return `${base}&price=${Math.round(Number(priceCurrent))}`;
}

export function sanitizeOfferRiskScore100(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(100, Math.round(num));
}

// Defensive: a score that is not a usable number renders as "-" rather than
// "0", so malformed data never reads as "no risk".
export function formatOfferRiskScore100(value: unknown): string {
  if (typeof value === 'string' ? !value.trim() : typeof value !== 'number') {
    return '-';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '-';
  return String(sanitizeOfferRiskScore100(num));
}

// The CSV leaves a missing score empty where the UI shows "-" (#1099).
export function offerRiskScoreCsvCell(value: unknown): string {
  const formatted = formatOfferRiskScore100(value);
  return formatted === '-' ? '' : formatted;
}

export function isSafeExternalOfferUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (/\p{Cc}/u.test(trimmed)) return false;
  if (!trimmed || trimmed.length > 2048 || !/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeOffersMarkdownCell(
  value: unknown,
  locale?: string | null
): string {
  if (typeof value !== 'string') return '-';
  const cleaned = collapseWhitespace(
    value.replace(/\p{Cc}+/gu, ' ').replace(/\|/g, '-'),
    locale
  )
    .trim()
    .slice(0, 180);
  return cleaned || '-';
}

export function sanitizeOffersFileToken(value: unknown): string {
  if (typeof value !== 'string') return 'audit';
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 120)
    .replace(/-+$/, '');
  return cleaned || 'audit';
}

export function isExplorerOfferImplausiblyLow(
  offer: Pick<MerchantOffer, 'id' | 'price_current' | 'availability'>,
  inStockOffers: readonly Pick<MerchantOffer, 'id' | 'price_current'>[],
  implausibleOfferIds: ReadonlySet<string>
): boolean {
  return isOfferImplausiblyLowAgainstInStock(
    offer,
    inStockOffers,
    implausibleOfferIds
  );
}

export function resolveExplorerOfferDiscountAnalysis(
  offer: Pick<MerchantOffer, 'id' | 'price_current' | 'availability'>,
  byOffer: MasterProductPriceHistorySummary['byOffer'] | null | undefined,
  inStockOffers: readonly Pick<MerchantOffer, 'id' | 'price_current'>[],
  implausibleOfferIds: ReadonlySet<string>
): MasterProductPriceHistorySummary['byOffer'][string] | null {
  if (!hasPositiveOfferPrice(offer.price_current)) {
    return null;
  }
  if (
    isExplorerOfferImplausiblyLow(offer, inStockOffers, implausibleOfferIds)
  ) {
    return null;
  }
  const canonicalId = normalizeOfferId(offer.id);
  const raw =
    byOffer && typeof byOffer === 'object'
      ? Object.hasOwn(byOffer, offer.id)
        ? (byOffer[offer.id] ?? null)
        : canonicalId && Object.hasOwn(byOffer, canonicalId)
          ? (byOffer[canonicalId] ?? null)
          : null
      : null;
  if (!raw) return null;
  if (
    isOfferUnavailable(offer) &&
    raw.verdict !== 'fake_discount' &&
    raw.verdict !== 'suspicious_discount'
  ) {
    return null;
  }
  return raw;
}

export function resolveExplorerMarkdownVerdictCell(params: {
  offer: Pick<MerchantOffer, 'price_current' | 'availability'>;
  isBait: boolean;
  analysis: MasterProductPriceHistorySummary['byOffer'][string] | null;
  t: (
    key:
      | 'offersImplausiblyLowBadge'
      | 'offersDiscontinuedBadge'
      | 'offersUnavailableBadge'
  ) => string;
  tVerdict: VerdictTranslator;
  locale: string;
}): string {
  const { offer, isBait, analysis, t, tVerdict, locale } = params;
  if (isBait) return t('offersImplausiblyLowBadge');
  if (analysis) return discountVerdictCopy(tVerdict, analysis, locale).label;
  if (isOfferUnavailable(offer)) {
    return offer.availability === 'discontinued'
      ? t('offersDiscontinuedBadge')
      : t('offersUnavailableBadge');
  }
  return hasPositiveOfferPrice(offer.price_current)
    ? tVerdict('labelNormal')
    : '-';
}

export function resolveExplorerExportVerdictCode(
  offer: Pick<MerchantOffer, 'price_current' | 'availability'>,
  isBait: boolean,
  analysis: MasterProductPriceHistorySummary['byOffer'][string] | null
): string {
  if (isBait) return 'implausibly_low';
  if (analysis) return analysis.verdict;
  if (isOfferUnavailable(offer)) {
    return offer.availability === 'discontinued'
      ? 'discontinued'
      : 'out_of_stock';
  }
  return hasPositiveOfferPrice(offer.price_current)
    ? 'normal'
    : 'insufficient_data';
}

export function computeOffersPriceSpreadAudit(
  offers: readonly MerchantOffer[],
  implausibleOfferIds?: ReadonlySet<string>
) {
  if (!Array.isArray(offers)) return null;
  const inStockOffers = offers.filter((o) => !isOfferUnavailable(o));
  const effectiveBaitIds =
    implausibleOfferIds ?? implausiblyLowOfferIds(inStockOffers);
  const valid = inStockOffers.filter((o) => {
    const p = Number(o?.price_current);
    return (
      Number.isFinite(p) &&
      p > 0 &&
      p <= MAX_VALID_VND_PRICE &&
      !isOfferImplausiblyLowAgainstInStock(o, inStockOffers, effectiveBaitIds)
    );
  });
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.price_current - b.price_current);
  const cheapest = sorted[0]!;
  const priciest = sorted[sorted.length - 1]!;
  const spreadVnd = Math.max(
    0,
    priciest.price_current - cheapest.price_current
  );
  if (spreadVnd <= 0) return null;
  const spreadPct = Number(
    ((spreadVnd / cheapest.price_current) * 100).toFixed(1)
  );
  return {
    cheapest,
    priciest,
    spreadVnd,
    spreadPct,
    platformCount: new Set(
      valid.map((o) =>
        typeof o.platform === 'string' ? o.platform.toLowerCase() : ''
      )
    ).size,
  };
}

export type OffersMarkdownTranslatorKey =
  | 'offersImplausiblyLowBadge'
  | 'offersDiscontinuedBadge'
  | 'offersUnavailableBadge'
  | 'offersTrustBadgeNoData'
  | 'offersMdRadarPrefix'
  | 'offersMdSpreadLine';

export function buildOffersMarkdown(params: {
  readonly productName: string;
  readonly offers: readonly MerchantOffer[];
  readonly inStockOffers?: readonly Pick<
    MerchantOffer,
    'id' | 'price_current'
  >[];
  readonly implausibleOfferIds?: ReadonlySet<string>;
  readonly byOffer?: MasterProductPriceHistorySummary['byOffer'] | null;
  readonly radarSignal?: RadarSignal | null;
  readonly priceSpreadAudit?: ReturnType<typeof computeOffersPriceSpreadAudit>;
  readonly locale?: string | null;
  readonly t: (
    key: OffersMarkdownTranslatorKey,
    values?: Record<string, string | number>
  ) => string;
  readonly tVerdict: VerdictTranslator;
}): string {
  const locale =
    typeof params.locale === 'string' && params.locale.trim()
      ? params.locale
      : 'vi';
  const safeOffers = Array.isArray(params.offers) ? params.offers : [];
  const resolvedInStock =
    params.inStockOffers ??
    (() => {
      const s = safeOffers.filter((o) => !isOfferUnavailable(o));
      return s.length > 0 ? s : safeOffers;
    })();
  const resolvedImplausibleIds =
    params.implausibleOfferIds ?? implausiblyLowOfferIds(resolvedInStock);
  const resolvedSpreadAudit =
    params.priceSpreadAudit === undefined
      ? computeOffersPriceSpreadAudit(safeOffers, resolvedImplausibleIds)
      : params.priceSpreadAudit;

  const headers = [
    'Platform',
    'Merchant',
    'Official Mall',
    'Trust Score',
    'Current Price (VND)',
    'Original Price (VND)',
    'Price Verdict',
  ];
  const sep = headers.map(() => '---');
  const rows = safeOffers.map((o) => {
    const trust = offerTrustScore(o.merchant.risk_score);
    const isBait = isExplorerOfferImplausiblyLow(
      o,
      resolvedInStock,
      resolvedImplausibleIds
    );
    const analysis = resolveExplorerOfferDiscountAnalysis(
      o,
      params.byOffer,
      resolvedInStock,
      resolvedImplausibleIds
    );
    const hasValidCurrentPrice = hasPositiveOfferPrice(o.price_current);
    const hasValidOrig =
      hasValidCurrentPrice &&
      o.price_original != null &&
      Number.isFinite(Number(o.price_original)) &&
      Number(o.price_original) > Number(o.price_current) &&
      Number(o.price_original) <= MAX_VALID_VND_PRICE;
    const verdictCell = resolveExplorerMarkdownVerdictCell({
      offer: o,
      isBait,
      analysis,
      t: params.t,
      tVerdict: params.tVerdict,
      locale,
    });
    return [
      sanitizeOffersMarkdownCell(o.platform.toUpperCase(), locale),
      sanitizeOffersMarkdownCell(o.merchant.name, locale),
      o.merchant.is_official ? 'Yes' : 'No',
      trust == null
        ? params.t('offersTrustBadgeNoData')
        : formatPercent(trust, locale),
      hasValidCurrentPrice
        ? formatPriceVnd(Math.round(Number(o.price_current)), locale)
        : '-',
      hasValidOrig
        ? formatPriceVnd(Math.round(Number(o.price_original)), locale)
        : '-',
      sanitizeOffersMarkdownCell(verdictCell, locale),
    ];
  });

  const radarLine = params.radarSignal
    ? params.t('offersMdRadarPrefix', {
        signal: radarMarkdownCell(params.radarSignal, locale),
      })
    : '';
  const spreadLine = resolvedSpreadAudit
    ? params.t('offersMdSpreadLine', {
        count: resolvedSpreadAudit.platformCount,
        spreadVnd: formatNumber(resolvedSpreadAudit.spreadVnd, locale),
        spreadPct: formatPlainNumber(resolvedSpreadAudit.spreadPct, locale),
        cheapestPlatform: sanitizeOffersMarkdownCell(
          resolvedSpreadAudit.cheapest.platform.toUpperCase(),
          locale
        ),
        cheapestMerchant: sanitizeOffersMarkdownCell(
          resolvedSpreadAudit.cheapest.merchant.name,
          locale
        ),
        priciestPlatform: sanitizeOffersMarkdownCell(
          resolvedSpreadAudit.priciest.platform.toUpperCase(),
          locale
        ),
      })
    : '';

  return [
    `### 🛡️ Rate.vn cross-store price check: ${sanitizeOffersMarkdownCell(params.productName, locale)}`,
    radarLine + spreadLine,
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

export function resolveOfferOriginBadgeClass(origin: ProductOrigin): string {
  if (origin === 'official_vna') return 'bg-info-subtle text-info-emphasis';
  if (origin === 'imported') return 'bg-warning-subtle text-warning-emphasis';
  return 'bg-light text-muted border';
}

export function resolveSellerChannelBadgeClass(channel: SellerChannel): string {
  if (channel === 'authorized_vat') return 'bg-success-subtle text-success';
  if (channel === 'official_mall') return 'bg-success-subtle text-success';
  return 'bg-secondary-subtle text-secondary';
}

export default function ProductOffersExplorer({
  productName,
  productSlug,
  offers,
  byOffer,
  radarSignal,
  initialHighTrustOnly = false,
  initialOfficialVnaOnly = false,
}: ProductOffersExplorerProps) {
  const t = useTranslations('productDetail');
  const tVerdict = useTranslations('priceVerdict');
  const locale = useLocale();
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [officialOnly, setOfficialOnly] = useState(false);
  const [officialVnaOnly, setOfficialVnaOnly] = useState(
    initialOfficialVnaOnly
  );
  const [highTrustOnly, setHighTrustOnly] = useState(initialHighTrustOnly);
  const [sortBy, setSortBy] = useState<OfferSortKey>('price_asc');
  const [copiedOffersMd, setCopiedOffersMd] = useState(false);

  const safeOffers = useMemo(
    () => (Array.isArray(offers) ? offers : []),
    [offers]
  );

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of safeOffers) {
      const p = typeof o.platform === 'string' ? o.platform.toLowerCase() : '';
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [safeOffers]);

  // Bait-price listings far below every other store (DOS/Rate#797): labelled,
  // listed after the plausible offers and left out of the price spread. Judged
  // among the in-stock listings, as the stored min_price is (DOS/Rate#1141).
  const inStockOffers = useMemo(() => {
    const inStock = safeOffers.filter((o) => !isOfferUnavailable(o));
    return inStock.length > 0 ? inStock : safeOffers;
  }, [safeOffers]);
  const implausibleOfferIds = useMemo(
    () => implausiblyLowOfferIds(inStockOffers),
    [inStockOffers]
  );

  const priceSpreadAudit = useMemo(
    () => computeOffersPriceSpreadAudit(safeOffers, implausibleOfferIds),
    [safeOffers, implausibleOfferIds]
  );

  const filteredOffers = useMemo(() => {
    const base = safeOffers.filter((o) => {
      const plat =
        typeof o.platform === 'string' ? o.platform.toLowerCase() : '';
      if (selectedPlatform !== 'all' && plat !== selectedPlatform) {
        return false;
      }
      if (officialOnly && !o.merchant.is_official) {
        return false;
      }
      if (officialVnaOnly && detectProductOrigin(o.title) !== 'official_vna') {
        return false;
      }
      if (highTrustOnly && offerRiskTone(o.merchant.risk_score) !== 'good') {
        return false;
      }
      return true;
    });

    return [...base].sort((a, b) => {
      // Sold-out listings keep their last price: listed last (DOS/Rate#1141).
      const unavailableA = isOfferUnavailable(a) ? 1 : 0;
      const unavailableB = isOfferUnavailable(b) ? 1 : 0;
      if (unavailableA !== unavailableB) return unavailableA - unavailableB;
      const implausibleA = isExplorerOfferImplausiblyLow(
        a,
        inStockOffers,
        implausibleOfferIds
      )
        ? 1
        : 0;
      const implausibleB = isExplorerOfferImplausiblyLow(
        b,
        inStockOffers,
        implausibleOfferIds
      )
        ? 1
        : 0;
      if (implausibleA !== implausibleB) return implausibleA - implausibleB;
      const hasPriceA = hasPositiveOfferPrice(a.price_current);
      const hasPriceB = hasPositiveOfferPrice(b.price_current);
      if (hasPriceA !== hasPriceB) return hasPriceA ? -1 : 1;
      const priceDiff = hasPriceA
        ? Number(a.price_current) - Number(b.price_current)
        : 0;
      // A seller with no score sorts after every scored one (DOS/Rate#1484).
      const trustA = offerTrustScore(a.merchant.risk_score) ?? -1;
      const trustB = offerTrustScore(b.merchant.risk_score) ?? -1;
      const discA =
        hasPriceA &&
        a.price_original &&
        a.price_original <= MAX_VALID_VND_PRICE &&
        a.price_original > a.price_current
          ? (a.price_original - a.price_current) / a.price_original
          : 0;
      const discB =
        hasPriceB &&
        b.price_original &&
        b.price_original <= MAX_VALID_VND_PRICE &&
        b.price_original > b.price_current
          ? (b.price_original - b.price_current) / b.price_original
          : 0;

      if (sortBy === 'trust_desc') {
        return trustB - trustA || priceDiff;
      }
      if (sortBy === 'discount_desc') {
        return discB - discA || priceDiff;
      }
      return priceDiff || trustB - trustA;
    });
  }, [
    safeOffers,
    inStockOffers,
    selectedPlatform,
    officialOnly,
    officialVnaOnly,
    highTrustOnly,
    sortBy,
    implausibleOfferIds,
  ]);

  const safeSlugFileToken = sanitizeOffersFileToken(productSlug);

  const handleCopyOffersMarkdown = async () => {
    if (typeof navigator === 'undefined' || filteredOffers.length === 0) return;
    const md = buildOffersMarkdown({
      productName,
      offers: filteredOffers,
      inStockOffers,
      implausibleOfferIds,
      byOffer,
      radarSignal,
      priceSpreadAudit,
      locale,
      t,
      tVerdict,
    });

    try {
      await navigator.clipboard.writeText(md);
      setCopiedOffersMd(true);
      setTimeout(() => setCopiedOffersMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadOffersCsv = () => {
    if (typeof document === 'undefined' || filteredOffers.length === 0) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      'OfferID',
      'Platform',
      'MerchantName',
      'IsOfficialMall',
      'TrustScorePercent',
      'DosafeRiskScore',
      'CombinedRiskScore',
      'ReviewRiskScore',
      'PriceCurrentVND',
      'PriceOriginalVND',
      'PriceVerdict',
      'OfferURL',
      ...(radarSignal ? RADAR_CSV_HEADERS : []),
    ];
    const rows = filteredOffers.map((o) => {
      const trust = offerTrustScore(o.merchant.risk_score);
      const isBait = isExplorerOfferImplausiblyLow(
        o,
        inStockOffers,
        implausibleOfferIds
      );
      const analysis = resolveExplorerOfferDiscountAnalysis(
        o,
        byOffer,
        inStockOffers,
        implausibleOfferIds
      );
      const hasValidCurrentPrice = hasPositiveOfferPrice(o.price_current);
      const hasValidOrig =
        hasValidCurrentPrice &&
        o.price_original != null &&
        Number.isFinite(Number(o.price_original)) &&
        Number(o.price_original) > Number(o.price_current) &&
        Number(o.price_original) <= MAX_VALID_VND_PRICE;
      return [
        o.id,
        o.platform,
        o.merchant.name,
        o.merchant.is_official ? 'true' : 'false',
        trust == null ? '' : String(trust),
        offerRiskScoreCsvCell(o.merchant.dosafe_risk_score),
        offerRiskScoreCsvCell(o.merchant.risk_score),
        hasReviewRiskEvidence(o.merchant.review_risk_breakdown)
          ? offerRiskScoreCsvCell(o.merchant.review_risk_score)
          : '',
        hasValidCurrentPrice ? String(Math.round(Number(o.price_current))) : '',
        hasValidOrig ? String(Math.round(Number(o.price_original))) : '',
        resolveExplorerExportVerdictCode(o, isBait, analysis),
        isSafeExternalOfferUrl(o.url) ? o.url.trim() : '',
        ...(radarSignal ? radarCsvCells(radarSignal) : []),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-offers-${safeSlugFileToken}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadOffersJson = () => {
    if (typeof document === 'undefined' || filteredOffers.length === 0) return;
    const payload = {
      source: 'Rate.vn Cross-Platform Offers Explorer',
      productSlug,
      productName,
      exportedAt: new Date().toISOString(),
      offerCount: filteredOffers.length,
      dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      priceSpreadAudit: priceSpreadAudit
        ? {
            spreadVnd: priceSpreadAudit.spreadVnd,
            spreadPct: priceSpreadAudit.spreadPct,
            cheapestPlatform: priceSpreadAudit.cheapest.platform,
            cheapestMerchantName: priceSpreadAudit.cheapest.merchant.name,
            minPriceVnd: priceSpreadAudit.cheapest.price_current,
            priciestPlatform: priceSpreadAudit.priciest.platform,
            priciestMerchantName: priceSpreadAudit.priciest.merchant.name,
            maxPriceVnd: priceSpreadAudit.priciest.price_current,
          }
        : null,
      offers: filteredOffers.map((o) => {
        const isBait = isExplorerOfferImplausiblyLow(
          o,
          inStockOffers,
          implausibleOfferIds
        );
        const analysis = resolveExplorerOfferDiscountAnalysis(
          o,
          byOffer,
          inStockOffers,
          implausibleOfferIds
        );
        const hasValidCurrentPrice = hasPositiveOfferPrice(o.price_current);
        const hasValidOrig =
          hasValidCurrentPrice &&
          o.price_original != null &&
          Number.isFinite(Number(o.price_original)) &&
          Number(o.price_original) > Number(o.price_current) &&
          Number(o.price_original) <= MAX_VALID_VND_PRICE;
        return {
          id: o.id,
          platform: o.platform,
          merchantName: o.merchant.name,
          isOfficialMall: o.merchant.is_official,
          trustScorePercent: offerTrustScore(o.merchant.risk_score),
          priceCurrentVnd: hasValidCurrentPrice
            ? Math.round(Number(o.price_current))
            : null,
          priceOriginalVnd: hasValidOrig
            ? Math.round(Number(o.price_original))
            : null,
          verdict: resolveExplorerExportVerdictCode(o, isBait, analysis),
          implausiblyLow: isBait,
          url: isSafeExternalOfferUrl(o.url) ? o.url.trim() : '',
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-offers-${safeSlugFileToken}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {priceSpreadAudit && (
        <div
          data-testid="price-spread-audit-banner"
          className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 border p-3"
        >
          <div>
            <span className="badge bg-success rounded-pill me-2 text-white">
              {t('offersSpreadBadge', {
                count: priceSpreadAudit.platformCount,
              })}
            </span>
            <strong className="text-dark small">
              {t('offersSpreadSavePrefix')}{' '}
              <span className="text-success rate-tabular">
                {formatPriceVnd(priceSpreadAudit.spreadVnd, locale)} (
                {formatPercent(priceSpreadAudit.spreadPct, locale)})
              </span>{' '}
              {t('offersSpreadBuyAt')}{' '}
              <span className="text-uppercase">
                {priceSpreadAudit.cheapest.platform}
              </span>{' '}
              (
              <ContentText
                text={priceSpreadAudit.cheapest.merchant.name}
                locale={locale}
              />
              ) {t('offersSpreadInsteadOf')}{' '}
              <span className="text-uppercase">
                {priceSpreadAudit.priciest.platform}
              </span>
            </strong>
          </div>
          <div className="small rate-tabular text-secondary">
            {t('offersSpreadLowLabel')}{' '}
            <strong className="text-success">
              {formatPriceVnd(priceSpreadAudit.cheapest.price_current, locale)}
            </strong>{' '}
            • {t('offersSpreadHighLabel')}{' '}
            <strong className="text-danger">
              {formatPriceVnd(priceSpreadAudit.priciest.price_current, locale)}
            </strong>
          </div>
        </div>
      )}

      {/* Interactive Filter, Sort & Export Toolbar */}
      <div className="rounded-3 bg-light mb-3 border p-3">
        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <div
            className="d-flex align-items-center flex-wrap gap-1"
            role="group"
            aria-label={t('offersColPlatformMerchant')}
          >
            <button
              type="button"
              aria-pressed={selectedPlatform === 'all'}
              onClick={() => setSelectedPlatform('all')}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                selectedPlatform === 'all'
                  ? 'btn-dark fw-semibold text-white'
                  : 'btn-outline-dark bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersFilterAll', { count: safeOffers.length })}
            </button>
            {platforms.map(([plat, count]) => (
              <button
                key={plat}
                type="button"
                aria-pressed={selectedPlatform === plat}
                onClick={() => setSelectedPlatform(plat)}
                className={`btn btn-sm rounded-pill text-uppercase px-2 py-1 ${
                  selectedPlatform === plat
                    ? 'btn-danger fw-semibold text-white'
                    : 'btn-outline-secondary bg-white'
                }`}
                style={{ fontSize: '0.8125rem' }}
              >
                {plat} ({count})
              </button>
            ))}
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2">
            <ExportMenu label={t('exportMenu')}>
              {(close) => (
                <>
                  <button
                    type="button"
                    onClick={handleCopyOffersMarkdown}
                    data-testid="copy-offers-md-btn"
                  >
                    {copiedOffersMd ? t('offersCopiedMd') : t('offersCopyMd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadOffersCsv();
                      close();
                    }}
                    data-testid="download-offers-csv-btn"
                  >
                    {t('offersExportCsv')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadOffersJson();
                      close();
                    }}
                    data-testid="download-offers-json-btn"
                  >
                    {t('offersExportJson')}
                  </button>
                </>
              )}
            </ExportMenu>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center border-top flex-wrap gap-2 pt-2">
          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={officialOnly}
              onClick={() => setOfficialOnly((v) => !v)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                officialOnly
                  ? 'btn-success fw-semibold text-white'
                  : 'btn-outline-success bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersOfficialOnlyBtn')}
            </button>
            <button
              type="button"
              aria-pressed={officialVnaOnly}
              onClick={() => setOfficialVnaOnly((v) => !v)}
              data-testid="offers-official-vna-filter-btn"
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                officialVnaOnly
                  ? 'btn-dark fw-semibold'
                  : 'btn-outline-dark bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersOfficialVnaOnlyBtn')}
            </button>
            <button
              type="button"
              aria-pressed={highTrustOnly}
              onClick={() => setHighTrustOnly((v) => !v)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                highTrustOnly
                  ? 'btn-primary fw-semibold text-white'
                  : 'btn-outline-primary bg-white'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              {t('offersHighTrustOnlyBtn')}
            </button>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">{t('offersSortLabel')}</span>
            <select
              className="form-select form-select-sm w-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as OfferSortKey)}
              aria-label={t('offersSortAria')}
            >
              <option value="price_asc">{t('offersSortPriceAsc')}</option>
              <option value="trust_desc">{t('offersSortTrustDesc')}</option>
              <option value="discount_desc">
                {t('offersSortDiscountDesc')}
              </option>
            </select>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <div className="rounded-3 border bg-white p-4 text-center">
          <p className="text-muted small mb-2">{t('offersEmptyFilterText')}</p>
          <button
            type="button"
            onClick={() => {
              setSelectedPlatform('all');
              setOfficialOnly(false);
              setOfficialVnaOnly(false);
              setHighTrustOnly(false);
            }}
            className="btn btn-sm btn-outline-danger rounded-pill px-3"
          >
            {t('offersResetFiltersBtn')}
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table-hover mb-0 table align-middle">
            <thead className="table-light small">
              <tr>
                <th scope="col" style={{ width: '25%' }}>
                  {t('offersColPlatformMerchant')}
                </th>
                <th scope="col">{t('offersColListingTitle')}</th>
                <th scope="col">{t('offersColTrustScore')}</th>
                <th scope="col">{t('offersColRecordedPrice')}</th>
                <th scope="col" className="text-end">
                  {t('offersColAuditSource')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOffers.map((offer) => {
                const hasValidCurrentPrice = hasPositiveOfferPrice(
                  offer.price_current
                );
                const price = hasValidCurrentPrice
                  ? formatPriceVnd(
                      Math.round(Number(offer.price_current)),
                      locale
                    )
                  : '-';
                const origPrice =
                  hasValidCurrentPrice &&
                  offer.price_original != null &&
                  Number.isFinite(Number(offer.price_original)) &&
                  Number(offer.price_original) > Number(offer.price_current) &&
                  Number(offer.price_original) <= MAX_VALID_VND_PRICE
                    ? formatPriceVnd(
                        Math.round(Number(offer.price_original)),
                        locale
                      )
                    : null;
                const trustScore = offerTrustScore(offer.merchant.risk_score);
                const safeOfferUrl = isSafeExternalOfferUrl(offer.url)
                  ? offer.url.trim()
                  : null;
                const trustBadgeClass = offerTrustBadgeClass(
                  offer.merchant.risk_score
                );
                const trustBadgeText =
                  trustScore == null
                    ? t('offersTrustBadgeNoData')
                    : t('offersTrustBadge', { score: trustScore });

                const origin = detectProductOrigin(offer.title);
                const sellerChannel = classifySellerChannel({
                  platform: offer.platform,
                  isOfficial: offer.merchant.is_official,
                  merchantName: offer.merchant.name,
                  title: offer.title,
                });
                const originBadgeLabel =
                  origin === 'official_vna'
                    ? t('offersOriginVnaBadge')
                    : origin === 'imported'
                      ? t('offersOriginImportedBadge')
                      : t('offersOriginUnknownBadge');
                const channelBadgeLabel =
                  sellerChannel === 'authorized_vat'
                    ? t('offersChannelAuthorizedVat')
                    : sellerChannel === 'official_mall'
                      ? t('offersOfficialMallBadge')
                      : t('offersChannelIndependentShop');

                const isBait = isExplorerOfferImplausiblyLow(
                  offer,
                  inStockOffers,
                  implausibleOfferIds
                );
                const discountAnalysis = resolveExplorerOfferDiscountAnalysis(
                  offer,
                  byOffer,
                  inStockOffers,
                  implausibleOfferIds
                );
                const discountBadgeClass =
                  discountAnalysis?.verdict === 'fake_discount'
                    ? 'bg-danger text-white'
                    : discountAnalysis?.verdict === 'suspicious_discount'
                      ? 'bg-warning text-dark'
                      : discountAnalysis?.verdict === 'genuine_deal'
                        ? 'bg-success text-white'
                        : 'bg-light text-secondary border';
                const DiscountIcon =
                  discountAnalysis?.verdict === 'fake_discount'
                    ? BsExclamationOctagon
                    : discountAnalysis?.verdict === 'suspicious_discount'
                      ? BsExclamationTriangle
                      : discountAnalysis?.verdict === 'genuine_deal'
                        ? BsCheckCircle
                        : BsBarChart;

                return (
                  <tr key={offer.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-dark text-uppercase small">
                          {offer.platform}
                        </span>
                        <div>
                          <div className="fw-semibold small">
                            {offer.merchant.id ? (
                              <Link
                                href={`/merchants/${offer.merchant.id}`}
                                className="text-dark text-decoration-none"
                              >
                                <ContentText
                                  text={offer.merchant.name}
                                  locale={locale}
                                />
                              </Link>
                            ) : (
                              <ContentText
                                text={offer.merchant.name}
                                locale={locale}
                              />
                            )}
                          </div>
                          <div className="mt-1">
                            <span
                              className={`badge me-1 ${resolveOfferOriginBadgeClass(origin)}`}
                              data-testid="offer-origin-badge"
                              data-origin={origin}
                            >
                              {originBadgeLabel}
                            </span>
                            <span
                              className={`badge ${resolveSellerChannelBadgeClass(sellerChannel)}`}
                              data-testid="offer-channel-pill"
                              data-channel={sellerChannel}
                            >
                              {channelBadgeLabel}
                            </span>
                            {isBait && (
                              <span
                                className="badge bg-danger-subtle text-danger small"
                                data-testid="offer-implausibly-low"
                                title={t('offersImplausiblyLowTitle')}
                              >
                                {t('offersImplausiblyLowBadge')}
                              </span>
                            )}
                            {isOfferUnavailable(offer) && (
                              <span
                                className="badge bg-secondary-subtle text-secondary small"
                                data-testid="offer-unavailable"
                                title={t('offersUnavailableTitle')}
                              >
                                {offer.availability === 'discontinued'
                                  ? t('offersDiscontinuedBadge')
                                  : t('offersUnavailableBadge')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className="small text-truncate"
                      style={{ maxWidth: '280px' }}
                      lang={contentLang(offer.title, locale)}
                    >
                      {offer.title}
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1">
                        <div>
                          {offer.merchant.id ? (
                            <Link
                              href={`/merchants/${offer.merchant.id}`}
                              className={`badge ${trustBadgeClass} text-decoration-none small`}
                              title={t('offersMerchantTrustTitle')}
                            >
                              {trustBadgeText} ↗
                            </Link>
                          ) : (
                            <span className={`badge ${trustBadgeClass} small`}>
                              {trustBadgeText}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {/* Every label from the catalogue (DOS/Rate#1269). */}
                          {t('offersScamRiskLabel')}:{' '}
                          {formatOfferRiskScore100(
                            offer.merchant.dosafe_risk_score
                          )}
                          /100 | {t('offersCombinedRiskLabel')}:{' '}
                          {formatOfferRiskScore100(offer.merchant.risk_score)}
                          /100 | {t('offersReviewRiskLabel')}:{' '}
                          {/* No analysed reviews: no number (#1258). */}
                          {hasReviewRiskEvidence(
                            offer.merchant.review_risk_breakdown
                          )
                            ? `${formatOfferRiskScore100(
                                offer.merchant.review_risk_score
                              )}/100`
                            : t('offersReviewRiskNoData')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold text-dark rate-tabular">
                        {price}
                      </div>
                      {origPrice && (
                        <div className="text-muted small text-decoration-line-through rate-tabular">
                          {origPrice}
                        </div>
                      )}
                      {discountAnalysis && (
                        <div className="mt-1">
                          <a
                            href="#price-history-section"
                            title={
                              discountVerdictCopy(
                                tVerdict,
                                discountAnalysis,
                                locale
                              ).explanation
                            }
                            className={`badge ${discountBadgeClass} text-decoration-none rounded-pill small`}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            <DiscountIcon aria-hidden="true" className="me-1" />
                            {
                              discountVerdictCopy(
                                tVerdict,
                                discountAnalysis,
                                locale
                              ).label
                            }
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="text-end">
                      {safeOfferUrl && (
                        <div className="d-inline-flex align-items-center justify-content-end flex-wrap gap-1">
                          <Link
                            href={buildExplorerInspectHref(
                              safeOfferUrl,
                              offer.price_current
                            )}
                            className="btn btn-sm btn-outline-primary rounded-pill px-2"
                            title={t('offersInspectBtnTitle')}
                          >
                            {t('offersInspectBtn')}
                          </Link>
                          <a
                            href={safeOfferUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                          >
                            {t('offersSourceLinkBtn')}
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
