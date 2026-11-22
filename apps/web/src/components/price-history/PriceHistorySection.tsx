'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import ContentText from '@/components/elementary/ContentText';
import { contentLang } from '@/lib/content-lang';
import type { IconType } from 'react-icons';
import {
  BsBarChart,
  BsCalendar3,
  BsCheckCircle,
  BsExclamationOctagon,
  BsExclamationTriangle,
  BsGraphUp,
  BsSearch,
} from 'react-icons/bs';
import {
  evaluateOmnibusPriceAudit,
  formatOmnibusAuditCopy,
  resolveOmnibusReferenceAnchorMs,
  sanitizeOmnibusPriceVnd,
  type OmnibusPriceAuditResult,
  type OmnibusReferenceOfferInput,
  type OmnibusVerdictTranslator,
} from '@/lib/omnibus-price-audit';
import {
  minimumListingPriceVnd,
  normalizeOfferId,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  toOfferAvailability,
} from '@/lib/product-market-stats';
import {
  MAX_VALID_VND_PRICE,
  type DiscountVerdictType,
  type MasterProductPriceHistorySummary,
  type OfferAvailability,
  type OfferDiscountAnalysis,
  type PriceHistoryPoint,
} from '@/lib/rate-domain';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import {
  discountVerdictCopy,
  type VerdictTranslator,
} from '@/lib/discount-verdict-copy';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  collapseWhitespace,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
  toFormatLocale,
} from '@/lib/locale-format';

interface PriceHistorySectionProps {
  productName: string;
  history: MasterProductPriceHistorySummary;
  radarSignal?: RadarSignal | null;
  offers?: readonly OmnibusReferenceOfferInput[] | null;
}

type TimeRangeKey = '30d' | '90d' | 'all';

const SERIES_COLORS = [
  '#dc2626',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
];

function getVerdictBadgeStyle(verdict: DiscountVerdictType): {
  badgeClass: string;
  icon: IconType;
} {
  switch (verdict) {
    case 'fake_discount':
      return {
        badgeClass: 'bg-danger text-white',
        icon: BsExclamationOctagon,
      };
    case 'suspicious_discount':
      return {
        badgeClass: 'bg-warning text-dark',
        icon: BsExclamationTriangle,
      };
    case 'genuine_deal':
      return {
        badgeClass: 'bg-success text-white',
        icon: BsCheckCircle,
      };
    default:
      return {
        badgeClass: 'bg-secondary-subtle text-secondary-emphasis',
        icon: BsBarChart,
      };
  }
}

const PRICE_HISTORY_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function formatPriceHistoryVnd(
  price: unknown,
  locale?: string | null
): string {
  const num = Number(price);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return '-';
  }
  return formatPriceVnd(Math.round(num), locale);
}

export function formatCompactPriceHistoryVnd(
  price: unknown,
  locale?: string | null
): string {
  const num = Number(price);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return '0';
  }
  const rounded = Math.round(num);
  if (rounded >= 1_000_000) {
    const tr = rounded / 1_000_000;
    return `${formatDecimal(tr, locale, tr % 1 === 0 ? 0 : 1)}tr`;
  }
  if (rounded >= 1_000) {
    return `${Math.round(rounded / 1_000)}k`;
  }
  return `${rounded}`;
}

export function sanitizePriceHistoryCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

export function sanitizePriceHistoryMarkdownCell(
  value: unknown,
  fallback = '-',
  locale?: string | null
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = collapseWhitespace(
    value.replace(PRICE_HISTORY_CONTROL_CHARS_RE, ' ').replace(/\|/g, '-'),
    locale
  )
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

const formatVnd = formatPriceHistoryVnd;
const formatCompactVnd = formatCompactPriceHistoryVnd;

export type PriceHistoryMarkdownKey =
  | 'priceHistoryMdHeading'
  | 'priceHistoryMdCurrentLowest'
  | 'priceHistoryMdAllTimeLowest'
  | 'priceHistoryMdFakeAlerts'
  | 'priceHistoryMdGenuineDeals'
  | 'priceHistoryMdPriceSignal'
  | 'priceHistoryMdColMerchant'
  | 'priceHistoryMdColPlatform'
  | 'priceHistoryMdColCurrentPrice'
  | 'priceHistoryMdColOriginalPrice'
  | 'priceHistoryMdColMedian90d'
  | 'priceHistoryMdColLow90d'
  | 'priceHistoryMdColVerdict';

export type PriceHistoryMarkdownTranslator = (
  key: PriceHistoryMarkdownKey,
  values?: Record<string, string | number>
) => string;

const FALLBACK_PRICE_HISTORY_MD_COPY: Record<
  'vi' | 'en' | 'cs',
  Record<PriceHistoryMarkdownKey, string>
> = {
  vi: {
    priceHistoryMdHeading:
      '### 📈 Lịch sử giá và kiểm tra giảm giá ảo trên Rate.vn: {name}',
    priceHistoryMdCurrentLowest: 'Giá thấp nhất hiện tại',
    priceHistoryMdAllTimeLowest: 'Giá thấp nhất từng ghi nhận',
    priceHistoryMdFakeAlerts: 'Cảnh báo giảm giá ảo',
    priceHistoryMdGenuineDeals: 'Giá tốt thật',
    priceHistoryMdPriceSignal: 'Tín hiệu giá',
    priceHistoryMdColMerchant: 'Gian hàng',
    priceHistoryMdColPlatform: 'Sàn',
    priceHistoryMdColCurrentPrice: 'Giá hiện tại (VND)',
    priceHistoryMdColOriginalPrice: 'Giá gốc (VND)',
    priceHistoryMdColMedian90d: 'Trung vị 90 ngày (VND)',
    priceHistoryMdColLow90d: 'Thấp nhất 90 ngày (VND)',
    priceHistoryMdColVerdict: 'Kết luận giá',
  },
  en: {
    priceHistoryMdHeading:
      '### 📈 Rate.vn price history and fake-sale check: {name}',
    priceHistoryMdCurrentLowest: 'Current lowest price',
    priceHistoryMdAllTimeLowest: 'Lowest price recorded',
    priceHistoryMdFakeAlerts: 'Fake-sale warnings',
    priceHistoryMdGenuineDeals: 'Genuine deals',
    priceHistoryMdPriceSignal: 'Price signal',
    priceHistoryMdColMerchant: 'Merchant',
    priceHistoryMdColPlatform: 'Platform',
    priceHistoryMdColCurrentPrice: 'Current price (VND)',
    priceHistoryMdColOriginalPrice: 'Original price (VND)',
    priceHistoryMdColMedian90d: '90d median (VND)',
    priceHistoryMdColLow90d: '90d low (VND)',
    priceHistoryMdColVerdict: 'Price verdict',
  },
  cs: {
    priceHistoryMdHeading:
      '### 📈 Historie cen a kontrola falešných slev na Rate.vn: {name}',
    priceHistoryMdCurrentLowest: 'Aktuální nejnižší cena',
    priceHistoryMdAllTimeLowest: 'Nejnižší zaznamenaná cena',
    priceHistoryMdFakeAlerts: 'Upozornění na falešné slevy',
    priceHistoryMdGenuineDeals: 'Skutečné slevy',
    priceHistoryMdPriceSignal: 'Cenový signál',
    priceHistoryMdColMerchant: 'Obchod',
    priceHistoryMdColPlatform: 'Platforma',
    priceHistoryMdColCurrentPrice: 'Aktuální cena (VND)',
    priceHistoryMdColOriginalPrice: 'Původní cena (VND)',
    priceHistoryMdColMedian90d: '90d medián (VND)',
    priceHistoryMdColLow90d: '90d minimum (VND)',
    priceHistoryMdColVerdict: 'Verdikt ceny',
  },
};

function defaultPriceHistoryMarkdownTranslator(
  locale?: string | null
): PriceHistoryMarkdownTranslator {
  const dict = FALLBACK_PRICE_HISTORY_MD_COPY[toFormatLocale(locale)];
  return (key, values) => {
    const template = dict[key];
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in values ? String(values[name]) : ''
    );
  };
}

export function buildPriceHistoryMarkdown(params: {
  productName: string;
  history: MasterProductPriceHistorySummary;
  offerAnalyses: readonly OfferDiscountAnalysis[];
  radarSignal?: RadarSignal | null;
  t?: PriceHistoryMarkdownTranslator;
  tVerdict: VerdictTranslator;
  locale: string;
}): string {
  const { productName, history, offerAnalyses, radarSignal, tVerdict, locale } =
    params;
  const tr = params.t ?? defaultPriceHistoryMarkdownTranslator(locale);
  const headers = [
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColMerchant'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColPlatform'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColCurrentPrice'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColOriginalPrice'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColMedian90d'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColLow90d'),
      '-',
      locale
    ),
    sanitizePriceHistoryMarkdownCell(
      tr('priceHistoryMdColVerdict'),
      '-',
      locale
    ),
  ];
  const sep = headers.map(() => '---');
  const safeFakeCount = sanitizePriceHistoryCount(history.fakeDiscountCount);
  const safeGenuineCount = sanitizePriceHistoryCount(history.genuineDealCount);
  const rows = offerAnalyses.map((oa) => [
    sanitizePriceHistoryMarkdownCell(oa.merchant_name, '-', locale),
    sanitizePriceHistoryMarkdownCell(oa.platform, '-', locale).toUpperCase(),
    formatVnd(oa.price_current, locale),
    formatVnd(oa.price_original, locale),
    formatVnd(oa.historical_median_price, locale),
    formatVnd(oa.historical_min_price, locale),
    sanitizePriceHistoryMarkdownCell(
      discountVerdictCopy(tVerdict, oa, locale).label,
      '-',
      locale
    ),
  ]);
  return [
    tr('priceHistoryMdHeading', {
      name: sanitizePriceHistoryMarkdownCell(productName, '-', locale),
    }),
    `- **${tr('priceHistoryMdCurrentLowest')}**: ${formatVnd(history.currentMinPrice, locale)}`,
    `- **${tr('priceHistoryMdAllTimeLowest')}**: ${formatVnd(history.lowestEverPrice, locale)}`,
    `- **${tr('priceHistoryMdFakeAlerts')}**: ${formatNumber(safeFakeCount, locale)} | **${tr('priceHistoryMdGenuineDeals')}**: ${formatNumber(safeGenuineCount, locale)}`,
    ...(radarSignal
      ? [
          `- **${tr('priceHistoryMdPriceSignal')}**: ${radarMarkdownCell(radarSignal, locale)}`,
        ]
      : []),
    '',
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function formatDateShort(locale: string, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d, locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export default function PriceHistorySection({
  productName,
  history,
  radarSignal,
  offers,
}: PriceHistorySectionProps) {
  const t = useTranslations('productDetail');
  const tVerdict = useTranslations('priceVerdict');
  const locale = useLocale();
  const storeFilterLabelId = useId();
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all');
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const offerAnalyses = useMemo<OfferDiscountAnalysis[]>(
    () => Object.values(history.byOffer),
    [history.byOffer]
  );

  // Filter history.points once to valid positive prices and parseable timestamps
  const validPoints = useMemo<PriceHistoryPoint[]>(() => {
    return history.points.filter((pt) => {
      const price = Number(pt.price);
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        price > MAX_VALID_VND_PRICE
      ) {
        return false;
      }
      const ms = new Date(pt.recorded_at).getTime();
      return Number.isFinite(ms) && ms > 0;
    });
  }, [history.points]);

  // Reference anchor timestamp = latest observation in dataset (deterministic for SSR/Client)
  const latestTimestampMs = useMemo(() => {
    if (validPoints.length === 0) return 0;
    let maxMs = 0;
    for (const pt of validPoints) {
      const ms = new Date(pt.recorded_at).getTime();
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs;
  }, [validPoints]);

  const filteredPoints = useMemo<PriceHistoryPoint[]>(() => {
    let pts = validPoints;
    if (selectedProductId !== 'ALL') {
      pts = pts.filter((p) => p.product_id === selectedProductId);
    }
    if (timeRange !== 'all' && latestTimestampMs > 0) {
      const days = timeRange === '30d' ? 30 : 90;
      const cutoff = latestTimestampMs - days * 24 * 60 * 60 * 1000;
      const withinRange = pts.filter(
        (p) => new Date(p.recorded_at).getTime() >= cutoff
      );
      if (withinRange.length > 0) {
        pts = withinRange;
      }
    }
    return pts;
  }, [validPoints, selectedProductId, timeRange, latestTimestampMs]);

  // Axis labels are sized in viewBox units; scale them so they render at 13px
  // (the text floor) whatever width the chart is drawn at.
  // A callback ref re-attaches the observer whenever the SVG remounts (it is
  // unmounted while the selected offer has no points).
  const [labelUnits, setLabelUnits] = useState(13);
  const chartObserver = useRef<ResizeObserver | null>(null);
  const chartRef = useCallback((el: SVGSVGElement | null) => {
    chartObserver.current?.disconnect();
    chartObserver.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.min(rect.width / 820, rect.height / 280);
      setLabelUnits(Math.round((13 / scale) * 10) / 10);
    };
    update();
    chartObserver.current = new ResizeObserver(update);
    chartObserver.current.observe(el);
  }, []);

  // SVG Chart dimensions & coordinate mapping
  const chartGeometry = useMemo(() => {
    const width = 820;
    const height = 280;
    // Room for the y labels and x labels grows with their size
    const padLeft = Math.round(30 + 3.3 * labelUnits);
    const padRight = 28;
    const padTop = 26;
    const padBottom = Math.round(16 + 2 * labelUnits);
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (filteredPoints.length === 0) {
      return null;
    }

    const allValues: number[] = [];
    for (const pt of filteredPoints) {
      if (pt.price > 0 && pt.price <= MAX_VALID_VND_PRICE) {
        allValues.push(pt.price);
      }
      if (
        pt.price_original &&
        pt.price_original > pt.price &&
        pt.price_original <= MAX_VALID_VND_PRICE
      ) {
        allValues.push(pt.price_original);
      }
    }

    if (allValues.length === 0) {
      return null;
    }

    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const span = Math.max(rawMax - rawMin, rawMin * 0.08, 500_000);
    const minY = Math.max(
      0,
      Math.floor((rawMin - span * 0.15) / 100_000) * 100_000
    );
    const maxY = Math.ceil((rawMax + span * 0.15) / 100_000) * 100_000;
    const yRange = Math.max(maxY - minY, 1);

    const times = filteredPoints.map((p) => new Date(p.recorded_at).getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const tRange = maxT - minT;
    const isSingleMoment = tRange < 60_000;

    const getX = (index: number, total: number, tMs: number) => {
      if (total <= 1) return padLeft + plotW / 2;
      if (isSingleMoment) {
        const bandW = Math.min(plotW * 0.6, total * 90);
        const startX = padLeft + (plotW - bandW) / 2;
        return startX + (index / (total - 1)) * bandW;
      }
      return padLeft + ((tMs - minT) / tRange) * plotW;
    };

    const getY = (val: number) => {
      return padTop + plotH - ((val - minY) / yRange) * plotH;
    };

    const mapped = filteredPoints.map((pt, idx) => {
      const tMs = new Date(pt.recorded_at).getTime();
      const x = getX(idx, filteredPoints.length, tMs);
      const yPrice = getY(pt.price);
      const yOriginal =
        pt.price_original &&
        pt.price_original > pt.price &&
        pt.price_original <= MAX_VALID_VND_PRICE
          ? getY(pt.price_original)
          : null;
      return {
        pt,
        idx,
        x,
        yPrice,
        yOriginal,
      };
    });

    // Group by product_id to draw separate lines per merchant offer
    const seriesMap = new Map<
      string,
      {
        productId: string;
        merchantName: string;
        color: string;
        nodes: typeof mapped;
      }
    >();

    offerAnalyses.forEach((oa, i) => {
      seriesMap.set(oa.product_id, {
        productId: oa.product_id,
        merchantName: oa.merchant_name,
        color: SERIES_COLORS[i % SERIES_COLORS.length] || '#dc2626',
        nodes: [],
      });
    });

    for (const node of mapped) {
      const existing = seriesMap.get(node.pt.product_id);
      if (existing) {
        existing.nodes.push(node);
      } else {
        seriesMap.set(node.pt.product_id, {
          productId: node.pt.product_id,
          merchantName: node.pt.merchant_name,
          color: '#dc2626',
          nodes: [node],
        });
      }
    }

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = minY + ratio * yRange;
      return {
        value,
        y: getY(value),
      };
    });

    const lowestEverY =
      history.lowestEverPrice &&
      history.lowestEverPrice >= minY &&
      history.lowestEverPrice <= maxY
        ? getY(history.lowestEverPrice)
        : null;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      isSingleMoment,
      mapped,
      series: Array.from(seriesMap.values()).filter((s) => s.nodes.length > 0),
      yTicks,
      lowestEverY,
    };
  }, [filteredPoints, offerAnalyses, history.lowestEverPrice, labelUnits]);

  const [copiedHistoryMd, setCopiedHistoryMd] = useState(false);

  const handleCopyPriceHistoryMarkdown = async () => {
    if (typeof navigator === 'undefined') return;
    const md = buildPriceHistoryMarkdown({
      productName,
      history,
      offerAnalyses,
      radarSignal,
      t: (key, values) => t(key, values),
      tVerdict,
      locale,
    });

    try {
      await navigator.clipboard.writeText(md);
      setCopiedHistoryMd(true);
      setTimeout(() => setCopiedHistoryMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadPriceHistoryCsv = () => {
    if (typeof document === 'undefined' || filteredPoints.length === 0) return;
    const headers = [
      'RecordedAt',
      'ProductID',
      'Platform',
      'MerchantName',
      'PriceVND',
      'OriginalPriceVND',
      ...(radarSignal ? RADAR_CSV_HEADERS : []),
    ];
    const rows = filteredPoints.map((pt) => [
      pt.recorded_at,
      pt.product_id,
      pt.platform,
      pt.merchant_name,
      String(pt.price),
      String(pt.price_original || ''),
      ...(radarSignal ? radarCsvCells(radarSignal) : []),
    ]);
    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsvCell).join(','),
        ...rows.map((r) => r.map(escapeCsvCell).join(',')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-price-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPriceHistoryJson = () => {
    if (typeof document === 'undefined' || filteredPoints.length === 0) return;
    const payload = {
      source: 'Rate.vn price history and fake sale check',
      productName,
      exportedAt: new Date().toISOString(),
      currentMinPriceVnd: history.currentMinPrice,
      lowestEverPriceVnd: history.lowestEverPrice,
      fakeDiscountCount: sanitizePriceHistoryCount(history.fakeDiscountCount),
      genuineDealCount: sanitizePriceHistoryCount(history.genuineDealCount),
      dealRadar: radarSignal ? radarExportFields(radarSignal) : null,
      offerAnalyses,
      points: filteredPoints,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-price-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasAuditEvidence = validPoints.length > 0 || offerAnalyses.length > 0;

  const minValidPriceVnd = useMemo(
    () => minimumListingPriceVnd([productName]),
    [productName]
  );

  const safeCurrentMinPrice = useMemo<number | null>(() => {
    const raw = Number(history.currentMinPrice);
    if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_VALID_VND_PRICE) {
      return null;
    }
    return Math.round(raw);
  }, [history.currentMinPrice]);

  const safeOffersInput = useMemo<OmnibusReferenceOfferInput[]>(
    () =>
      Array.isArray(offers)
        ? offers.filter((off): off is OmnibusReferenceOfferInput =>
            Boolean(off && typeof off === 'object' && !Array.isArray(off))
          )
        : [],
    [offers]
  );

  // Identify unavailable (sold-out / discontinued) offers from explicit `offers`,
  // explicit `availability` on `offerAnalyses`, or fallback heuristics when
  // availability is unknown (prices strictly below the verified in-stock minimum,
  // DOS/Rate#1141, or `rate-api`'s unavailable `normal_price` suppression).
  const unavailableOfferIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    const addId = (rawId: string | null | undefined) => {
      if (typeof rawId !== 'string') return;
      const trimmed = rawId.trim();
      if (!trimmed) return;
      ids.add(rawId);
      ids.add(trimmed);
      const canon = normalizeOfferId(trimmed);
      if (canon) ids.add(canon);
    };

    const setAvailInMap = (
      map: Map<string, OfferAvailability>,
      rawId: string | null | undefined,
      avail: OfferAvailability
    ) => {
      if (typeof rawId !== 'string') return;
      const trimmed = rawId.trim();
      if (!trimmed) return;
      const canon = normalizeOfferId(trimmed);
      for (const key of [rawId, trimmed, canon]) {
        if (!key) continue;
        const prev = map.get(key);
        if (!prev || isOfferUnavailable({ availability: avail })) {
          map.set(key, avail);
        }
      }
    };

    const explicitAvailFromAnalyses = new Map<string, OfferAvailability>();
    for (const oa of offerAnalyses) {
      const avail = toOfferAvailability(oa.availability);
      if (avail) {
        setAvailInMap(explicitAvailFromAnalyses, oa.product_id, avail);
      }
    }

    const explicitAvailFromOffers = new Map<string, OfferAvailability>();
    for (const off of safeOffersInput) {
      const rawId =
        typeof off.id === 'string' && off.id.trim()
          ? off.id
          : typeof off.product_id === 'string' && off.product_id.trim()
            ? off.product_id
            : null;
      const avail = toOfferAvailability(off.availability);
      if (avail) {
        setAvailInMap(explicitAvailFromOffers, rawId, avail);
        if (isOfferUnavailable({ availability: avail })) {
          addId(rawId);
        }
        continue;
      }
      if (!rawId) continue;
      const trimmed = rawId.trim();
      const canon = normalizeOfferId(trimmed);
      const oaAvail =
        explicitAvailFromAnalyses.get(rawId) ??
        explicitAvailFromAnalyses.get(trimmed) ??
        (canon ? explicitAvailFromAnalyses.get(canon) : undefined);
      if (oaAvail) {
        if (isOfferUnavailable({ availability: oaAvail })) {
          addId(rawId);
        }
        continue;
      }
      const p = Number(off.price_current);
      if (
        safeCurrentMinPrice != null &&
        Number.isFinite(p) &&
        p > 0 &&
        Math.round(p) < safeCurrentMinPrice
      ) {
        addId(rawId);
      }
    }

    for (const oa of offerAnalyses) {
      const canonOaId = normalizeOfferId(oa.product_id);
      const explicitAvail =
        explicitAvailFromOffers.get(oa.product_id) ??
        explicitAvailFromOffers.get(oa.product_id.trim()) ??
        (canonOaId ? explicitAvailFromOffers.get(canonOaId) : undefined) ??
        toOfferAvailability(oa.availability);
      if (explicitAvail) {
        if (isOfferUnavailable({ availability: explicitAvail })) {
          addId(oa.product_id);
        }
        continue;
      }

      const p = Number(oa.price_current);
      if (
        safeCurrentMinPrice != null &&
        Number.isFinite(p) &&
        p > 0 &&
        Math.round(p) < safeCurrentMinPrice
      ) {
        addId(oa.product_id);
        continue;
      }
      // In rate-api.ts, an offer with real_discount_vs_median_pct >= 3 (or at
      // multi-point historical min below max) that is neither fake nor
      // suspicious is assigned `normal_price` ONLY when `offerUnavailable` is true.
      const claimsDiscount =
        oa.price_original != null && oa.claimed_discount_pct >= 5;
      const wouldBeFakeOrSuspicious =
        claimsDiscount &&
        oa.claimed_discount_pct - oa.real_discount_vs_median_pct >= 6;
      const qualifiesForGenuine =
        oa.real_discount_vs_median_pct >= 3 ||
        (!claimsDiscount &&
          oa.observation_count >= 2 &&
          oa.price_current <= oa.historical_min_price &&
          oa.historical_min_price < oa.historical_max_price) ||
        (claimsDiscount && oa.price_current <= oa.historical_min_price);
      if (
        oa.verdict === 'normal_price' &&
        !wouldBeFakeOrSuspicious &&
        qualifiesForGenuine
      ) {
        addId(oa.product_id);
      }
    }
    return ids;
  }, [offerAnalyses, safeCurrentMinPrice, safeOffersInput]);

  const isUnavailId = useCallback(
    (id: string) =>
      unavailableOfferIds.has(id) ||
      unavailableOfferIds.has(id.trim()) ||
      unavailableOfferIds.has(normalizeOfferId(id)),
    [unavailableOfferIds]
  );

  const effectiveReferenceOffers = useMemo<OmnibusReferenceOfferInput[]>(() => {
    if (safeOffersInput.length > 0) {
      return safeOffersInput.map((off) => {
        const rawId =
          typeof off.id === 'string' && off.id.trim()
            ? off.id
            : typeof off.product_id === 'string' && off.product_id.trim()
              ? off.product_id
              : undefined;
        const explicit = toOfferAvailability(off.availability);
        const explicitUnavailable =
          explicit != null && isOfferUnavailable({ availability: explicit });
        const unavailable =
          explicitUnavailable || Boolean(rawId && isUnavailId(rawId));
        return {
          id: rawId,
          price_current: off.price_current,
          availability: unavailable
            ? explicitUnavailable
              ? explicit
              : ('out_of_stock' as const)
            : ('in_stock' as const),
          implausiblyLow: off.implausiblyLow,
        };
      });
    }
    return offerAnalyses.map((oa) => {
      const explicit = toOfferAvailability(oa.availability);
      const explicitUnavailable =
        explicit != null && isOfferUnavailable({ availability: explicit });
      const unavailable = explicitUnavailable || isUnavailId(oa.product_id);
      return {
        id: oa.product_id,
        price_current: oa.price_current,
        availability: unavailable
          ? explicitUnavailable
            ? explicit
            : ('out_of_stock' as const)
          : ('in_stock' as const),
      };
    });
  }, [isUnavailId, offerAnalyses, safeOffersInput]);

  const allKnownOffersUnavailable = useMemo<boolean>(() => {
    if (effectiveReferenceOffers.length === 0) return false;
    const inStockSized: { id: string; price_current: number }[] = [];
    effectiveReferenceOffers.forEach((off, idx) => {
      if (isOfferUnavailable(off) || off.implausiblyLow === true) return;
      const price = sanitizeOmnibusPriceVnd(
        off.price_current,
        minValidPriceVnd
      );
      if (price == null) return;
      inStockSized.push({
        id:
          typeof off.id === 'string' && off.id.trim()
            ? off.id.trim()
            : `__idx_${idx}`,
        price_current: price,
      });
    });
    return plausibleOffers(inStockSized).length === 0;
  }, [effectiveReferenceOffers, minValidPriceVnd]);

  // Historical anchor uses the exact same evidence-eligibility rules as the
  // Omnibus evaluator so rows below `minValidPriceVnd`, `live_listing` rows,
  // bait listings, and unavailable offers never advance the anchor (#1863).
  const omnibusAnchorMs = useMemo<number | null>(
    () =>
      resolveOmnibusReferenceAnchorMs({
        points: validPoints,
        referenceOffers: effectiveReferenceOffers,
        unavailableOfferIds,
        minValidPriceVnd,
      }),
    [
      effectiveReferenceOffers,
      minValidPriceVnd,
      unavailableOfferIds,
      validPoints,
    ]
  );

  const omnibusSharedOpts = useMemo(
    () => ({
      referenceOffers: effectiveReferenceOffers,
      unavailableOfferIds,
      minValidPriceVnd,
      referenceTimestampMs: omnibusAnchorMs,
    }),
    [
      effectiveReferenceOffers,
      minValidPriceVnd,
      omnibusAnchorMs,
      unavailableOfferIds,
    ]
  );

  const omnibusByOffer = useMemo<Map<string, OmnibusPriceAuditResult>>(() => {
    const map = new Map<string, OmnibusPriceAuditResult>();
    if (
      validPoints.length === 0 ||
      offerAnalyses.length === 0 ||
      safeCurrentMinPrice == null
    ) {
      return map;
    }
    const pointsByOfferId = new Map<string, PriceHistoryPoint[]>();
    for (const pt of validPoints) {
      if (pt.source === 'live_listing') continue;
      const list = pointsByOfferId.get(pt.product_id);
      if (list) list.push(pt);
      else pointsByOfferId.set(pt.product_id, [pt]);
    }
    for (const oa of offerAnalyses) {
      if (isUnavailId(oa.product_id)) continue;
      const pts = pointsByOfferId.get(oa.product_id);
      if (!pts) continue;
      map.set(
        oa.product_id,
        evaluateOmnibusPriceAudit({
          ...omnibusSharedOpts,
          points: pts,
          currentPriceVnd: oa.price_current,
          claimedOriginalPriceVnd: oa.price_original,
          currentInStockPriceVnd: oa.price_current,
          mode: 'offer',
        })
      );
    }
    return map;
  }, [
    isUnavailId,
    offerAnalyses,
    omnibusSharedOpts,
    safeCurrentMinPrice,
    validPoints,
  ]);

  const omnibusAudit = useMemo<OmnibusPriceAuditResult>(() => {
    if (selectedProductId !== 'ALL') {
      const cached = omnibusByOffer.get(selectedProductId);
      if (cached) return cached;
      const selectedOa = offerAnalyses.find(
        (oa) => oa.product_id === selectedProductId
      );
      return evaluateOmnibusPriceAudit({
        ...omnibusSharedOpts,
        points: validPoints.filter((pt) => pt.product_id === selectedProductId),
        currentPriceVnd: selectedOa?.price_current ?? null,
        claimedOriginalPriceVnd: selectedOa?.price_original ?? null,
        currentInStockPriceVnd: null,
        currentOfferUnavailable: true,
        mode: 'offer',
      });
    }

    let bestClaimedOrig: number | null = null;
    if (safeCurrentMinPrice != null) {
      const atMin = offerAnalyses.filter(
        (oa) =>
          Math.round(Number(oa.price_current)) === safeCurrentMinPrice &&
          !isUnavailId(oa.product_id)
      );
      const genuines = atMin.filter((oa) => oa.verdict === 'genuine_deal');
      for (const oa of genuines.length > 0 ? genuines : atMin) {
        const orig = Number(oa.price_original);
        if (
          Number.isFinite(orig) &&
          orig > safeCurrentMinPrice &&
          orig <= MAX_VALID_VND_PRICE &&
          (bestClaimedOrig == null || orig > bestClaimedOrig)
        ) {
          bestClaimedOrig = Math.round(orig);
        }
      }
    }

    return evaluateOmnibusPriceAudit({
      ...omnibusSharedOpts,
      points: validPoints,
      currentPriceVnd: allKnownOffersUnavailable ? null : safeCurrentMinPrice,
      claimedOriginalPriceVnd: allKnownOffersUnavailable
        ? null
        : bestClaimedOrig,
      currentInStockPriceVnd: allKnownOffersUnavailable
        ? null
        : safeCurrentMinPrice,
      currentOfferUnavailable: allKnownOffersUnavailable,
      mode: 'market',
    });
  }, [
    allKnownOffersUnavailable,
    isUnavailId,
    offerAnalyses,
    omnibusByOffer,
    omnibusSharedOpts,
    safeCurrentMinPrice,
    selectedProductId,
    validPoints,
  ]);

  const tOmnibus: OmnibusVerdictTranslator = (key, values) =>
    tVerdict(key, values);
  const omnibusCopy =
    validPoints.length > 0 && omnibusAudit.currentPriceVnd != null
      ? formatOmnibusAuditCopy(omnibusAudit, tOmnibus, locale)
      : null;

  const activeNode =
    chartGeometry && activePointIndex != null
      ? chartGeometry.mapped[activePointIndex] ||
        chartGeometry.mapped[chartGeometry.mapped.length - 1]
      : chartGeometry?.mapped[chartGeometry.mapped.length - 1] || null;

  return (
    <div
      id="price-history-section"
      className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm"
    >
      {/* Header & Summary Badges */}
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-4 gap-3">
        <div>
          <h2 className="h4 fw-bold d-flex align-items-center mb-1 gap-2">
            <BsGraphUp aria-hidden="true" /> {t('priceHistoryHeading')}
          </h2>
          <p className="text-muted small mb-0">
            {t('priceHistorySubtitlePrefix')} <strong>{productName}</strong>{' '}
            {t('priceHistorySubtitleSuffix')}
          </p>
        </div>

        <div className="d-flex align-items-center flex-wrap gap-2">
          <ExportMenu label={t('exportMenu')}>
            {(close) => (
              <>
                <button
                  type="button"
                  onClick={handleCopyPriceHistoryMarkdown}
                  data-testid="copy-price-history-md-btn"
                >
                  {copiedHistoryMd
                    ? t('priceHistoryCopiedMdBtn')
                    : t('priceHistoryCopyMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadPriceHistoryCsv();
                    close();
                  }}
                  data-testid="download-price-history-csv-btn"
                >
                  {t('priceHistoryExportCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadPriceHistoryJson();
                    close();
                  }}
                  data-testid="download-price-history-json-btn"
                >
                  {t('priceHistoryExportJsonBtn')}
                </button>
              </>
            )}
          </ExportMenu>
          {history.fakeDiscountCount > 0 ? (
            <span className="badge bg-danger rounded-pill small px-3 py-2 text-white">
              {t('priceHistoryFakeAlertBadge', {
                count: history.fakeDiscountCount,
              })}
            </span>
          ) : hasAuditEvidence ? (
            <span className="badge bg-success-subtle text-success rounded-pill small px-3 py-2">
              {t('priceHistoryCleanBadge')}
            </span>
          ) : null}
          {history.genuineDealCount > 0 && (
            <span className="badge bg-success rounded-pill small px-3 py-2 text-white">
              {t('priceHistoryGenuineDealBadge', {
                count: history.genuineDealCount,
              })}
            </span>
          )}
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-lg-3 col-6">
          <div className="rounded-4 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('priceHistoryKpiCurrentMinTitle')}
            </div>
            <div className="h5 fw-bold text-danger mb-1">
              {formatVnd(history.currentMinPrice, locale)}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              {t('priceHistoryKpiCurrentMinSub', {
                count: offerAnalyses.length,
              })}
            </div>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="rounded-4 bg-success-subtle border-success-subtle h-100 border p-3">
            <div className="text-success-emphasis small mb-1">
              {t('priceHistoryKpiLowestEverTitle')}
            </div>
            <div className="h5 fw-bold text-success mb-1">
              {formatVnd(history.lowestEverPrice, locale)}
            </div>
            <div
              className="text-success-emphasis"
              style={{ fontSize: '0.8125rem' }}
            >
              {history.lowestEverMerchant ? (
                <>
                  <ContentText
                    text={history.lowestEverMerchant}
                    locale={locale}
                  />
                  {` (${history.lowestEverDate ? formatDateShort(locale, history.lowestEverDate) : ''})`}
                </>
              ) : (
                t('priceHistoryKpiLowestEverDefaultSub')
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div className="rounded-4 bg-light h-100 border p-3">
            <div className="text-muted small mb-1">
              {t('priceHistoryKpiHighestEverTitle')}
            </div>
            <div className="h5 fw-bold text-dark mb-1">
              {formatVnd(history.highestEverPrice, locale)}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              {t('priceHistoryKpiHighestEverSub', {
                count: history.points.length,
              })}
            </div>
          </div>
        </div>

        <div className="col-lg-3 col-6">
          <div
            className={`rounded-4 h-100 border p-3 ${
              history.fakeDiscountCount > 0
                ? 'bg-danger-subtle border-danger-subtle'
                : 'bg-light'
            }`}
          >
            <div className="text-muted small mb-1">
              {t('priceHistoryKpiAiAuditTitle')}
            </div>
            <div
              className={`h5 fw-bold mb-1 ${
                history.fakeDiscountCount > 0
                  ? 'text-danger'
                  : hasAuditEvidence
                    ? 'text-success'
                    : 'text-muted'
              }`}
            >
              {history.fakeDiscountCount > 0
                ? t('priceHistoryKpiAiAuditFakeCount', {
                    count: history.fakeDiscountCount,
                  })
                : hasAuditEvidence
                  ? t('priceHistoryKpiAiAuditTransparent')
                  : t('valueCalcNotAvailable')}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              {t('priceHistoryKpiAiAuditSub')}
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column EU Omnibus 30-Day Floor Audit & 90-Day Cycle Signal (#1863) */}
      {omnibusCopy && (
        <div
          className="rounded-4 bg-light p-md-4 mb-4 border p-3"
          data-testid="omnibus-price-audit-card"
        >
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h3 className="h6 fw-bold text-dark d-flex align-items-center mb-0 gap-2">
              <BsCheckCircle aria-hidden="true" className="text-danger" />
              <span>{omnibusCopy.cardTitle}</span>
            </h3>
            <span
              data-testid="omnibus-window-badge"
              className={`badge rounded-pill small px-3 py-2 ${
                omnibusCopy.statusBadgeTone === 'good'
                  ? 'bg-success-subtle text-success border-success-subtle border'
                  : omnibusCopy.statusBadgeTone === 'bad'
                    ? 'bg-danger-subtle text-danger border-danger-subtle border'
                    : omnibusCopy.statusBadgeTone === 'warn'
                      ? 'bg-warning text-dark'
                      : 'bg-secondary-subtle text-secondary border'
              }`}
            >
              {omnibusCopy.statusBadgeText}
            </span>
          </div>

          <div className="row g-3">
            {[
              {
                k: 'cur',
                title: omnibusCopy.colCurrentTitle,
                val: omnibusCopy.currentPriceText,
                valCls: 'h5 fw-bold text-danger rate-tabular mb-0',
                badge: omnibusCopy.claimedBadgeText,
                sub: omnibusCopy.currentSubText,
                subCls:
                  omnibusCopy.currentSubTone === 'bad'
                    ? 'text-danger fw-semibold'
                    : omnibusCopy.currentSubTone === 'good'
                      ? 'text-success'
                      : 'text-muted',
                note: null,
                testId: undefined,
              },
              {
                k: 'flr',
                title: omnibusCopy.colFloorTitle,
                val: omnibusCopy.floorPriceText,
                valCls: 'h5 fw-bold text-dark rate-tabular mb-1',
                badge: null,
                sub: omnibusCopy.floorDeltaText,
                subCls:
                  omnibusCopy.floorDeltaTone === 'good'
                    ? 'text-success fw-semibold'
                    : omnibusCopy.floorDeltaTone === 'bad'
                      ? 'text-danger fw-semibold'
                      : 'text-secondary',
                note: omnibusCopy.floorDisclaimerText,
                testId: undefined,
              },
              {
                k: 'cyc',
                title: omnibusCopy.colCycleTitle,
                val: omnibusCopy.cycleValueText,
                valCls: `fw-bold mb-1 ${
                  omnibusCopy.cycleValueTone === 'good'
                    ? 'text-success'
                    : omnibusCopy.cycleValueTone === 'bad'
                      ? 'text-danger'
                      : 'text-dark'
                }`,
                badge: null,
                sub: omnibusCopy.cycleSubText,
                subCls: 'text-muted',
                note: null,
                testId: 'omnibus-cycle-signal',
              },
            ].map((col) => (
              <div key={col.k} className="col-lg-4 col-12">
                <div className="rounded-4 bg-white h-100 border p-3">
                  <div className="text-muted small mb-1">{col.title}</div>
                  {col.badge ? (
                    <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                      <span className={col.valCls}>{col.val}</span>
                      <span className="badge bg-warning text-dark rounded-pill small">
                        {col.badge}
                      </span>
                    </div>
                  ) : (
                    <div data-testid={col.testId} className={col.valCls}>
                      {col.val}
                    </div>
                  )}
                  <div className={`small ${col.subCls}`}>{col.sub}</div>
                  {col.note && (
                    <div className="small text-muted mt-1">{col.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls: Merchant Filter & Time Range. Single-select groups that
          expose the pressed choice, not only its colour (DOS/Rate#1069). */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 gap-3">
        <div
          className="d-flex align-items-center flex-wrap gap-2"
          role="group"
          aria-labelledby={storeFilterLabelId}
        >
          <span
            id={storeFilterLabelId}
            className="small text-muted fw-medium me-1"
          >
            {t('priceHistoryMerchantFilterLabel')}
          </span>
          <button
            type="button"
            aria-pressed={selectedProductId === 'ALL'}
            onClick={() => {
              setSelectedProductId('ALL');
              setActivePointIndex(null);
            }}
            className={`btn btn-sm rounded-pill px-3 ${
              selectedProductId === 'ALL'
                ? 'btn-dark fw-semibold'
                : 'btn-outline-secondary'
            }`}
          >
            {t('priceHistoryMerchantFilterAll', {
              count: offerAnalyses.length,
            })}
          </button>
          {offerAnalyses.map((oa, idx) => {
            const color =
              SERIES_COLORS[idx % SERIES_COLORS.length] || '#dc2626';
            const isSelected = selectedProductId === oa.product_id;
            return (
              <button
                key={oa.product_id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedProductId(oa.product_id);
                  setActivePointIndex(null);
                }}
                className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-2 px-3 ${
                  isSelected ? 'btn-dark fw-semibold' : 'btn-outline-secondary'
                }`}
              >
                <span
                  className="rounded-circle d-inline-block"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: color,
                  }}
                />
                <span lang={contentLang(oa.merchant_name, locale)}>
                  {oa.merchant_name}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="btn-group btn-group-sm"
          role="group"
          aria-label={t('priceHistoryRangeAria')}
        >
          {(
            [
              { key: '30d', label: t('priceHistoryRange30d') },
              { key: '90d', label: t('priceHistoryRange90d') },
              { key: 'all', label: t('priceHistoryRangeAll') },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={timeRange === item.key}
              onClick={() => {
                setTimeRange(item.key);
                setActivePointIndex(null);
              }}
              className={`btn ${
                timeRange === item.key ? 'btn-danger' : 'btn-outline-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Time-Series Chart */}
      {chartGeometry ? (
        <div className="rounded-4 mb-4 border bg-white p-3">
          <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2 px-2">
            <div className="d-flex align-items-center small flex-wrap gap-3">
              <span className="d-inline-flex align-items-center text-dark fw-medium gap-1">
                <span
                  style={{
                    width: '18px',
                    height: '3px',
                    backgroundColor: '#dc2626',
                    display: 'inline-block',
                  }}
                />
                {t('priceHistoryLegendActual')}
              </span>
              <span className="d-inline-flex align-items-center text-muted gap-1">
                <span
                  style={{
                    width: '18px',
                    height: '0px',
                    borderTop: '2px dashed #9ca3af',
                    display: 'inline-block',
                  }}
                />
                {t('priceHistoryLegendOriginal')}
              </span>
              <span className="d-inline-flex align-items-center text-success gap-1">
                <span
                  style={{
                    width: '18px',
                    height: '0px',
                    borderTop: '2px dotted #16a34a',
                    display: 'inline-block',
                  }}
                />
                {t('priceHistoryLegendLowest', {
                  price: formatVnd(history.lowestEverPrice, locale),
                })}
              </span>
            </div>

            {activeNode && (
              <div className="badge bg-light text-dark rounded-pill small border px-3 py-2">
                <BsCalendar3 aria-hidden="true" className="me-1" />
                {formatDateShort(locale, activeNode.pt.recorded_at)} -{' '}
                <strong>
                  <ContentText
                    text={activeNode.pt.merchant_name}
                    locale={locale}
                  />
                </strong>
                :{' '}
                <span className="text-danger fw-bold">
                  {formatVnd(activeNode.pt.price, locale)}
                </span>
                {activeNode.pt.price_original &&
                  activeNode.pt.price_original > activeNode.pt.price && (
                    <span className="text-muted text-decoration-line-through ms-2">
                      {formatVnd(activeNode.pt.price_original, locale)}
                    </span>
                  )}
              </div>
            )}
          </div>

          {/* Scrolls sideways on phones; focusable so keyboard users can scroll it
              (WCAG 2.1.1, axe scrollable-region-focusable). */}
          <div
            className="table-responsive"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable
            tabIndex={0}
            role="region"
            aria-label={t('priceHistoryChartAria', { name: productName })}
          >
            <svg
              ref={chartRef}
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="w-100"
              style={{ minWidth: '580px', maxHeight: '300px' }}
              role="img"
              aria-label={t('priceHistoryChartAria', { name: productName })}
            >
              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {chartGeometry.yTicks.map((tk, i) => (
                <g key={i}>
                  <line
                    x1={chartGeometry.padLeft}
                    y1={tk.y}
                    x2={chartGeometry.width - chartGeometry.padRight}
                    y2={tk.y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                  <text
                    x={chartGeometry.padLeft - 8}
                    y={tk.y + 4}
                    textAnchor="end"
                    fontSize={labelUnits}
                    fill="#64748b"
                  >
                    {formatCompactVnd(tk.value, locale)}
                  </text>
                </g>
              ))}

              {/* Historical Lowest Price Reference Line */}
              {chartGeometry.lowestEverY != null && (
                <line
                  x1={chartGeometry.padLeft}
                  y1={chartGeometry.lowestEverY}
                  x2={chartGeometry.width - chartGeometry.padRight}
                  y2={chartGeometry.lowestEverY}
                  stroke="#16a34a"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              )}

              {/* Merchant Series Lines */}
              {chartGeometry.series.map((s) => {
                const actualPointsAttr = s.nodes
                  .map((n) => `${n.x.toFixed(1)},${n.yPrice.toFixed(1)}`)
                  .join(' ');
                const origNodes = s.nodes.filter((n) => n.yOriginal != null);
                const origPointsAttr = origNodes
                  .map(
                    (n) =>
                      `${n.x.toFixed(1)},${(n.yOriginal ?? n.yPrice).toFixed(1)}`
                  )
                  .join(' ');

                return (
                  <g key={s.productId}>
                    {origNodes.length >= 2 && (
                      <polyline
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.75"
                        strokeDasharray="5 4"
                        points={origPointsAttr}
                      />
                    )}
                    {s.nodes.length >= 2 && (
                      <polyline
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={actualPointsAttr}
                      />
                    )}

                    {/* Data Points */}
                    {s.nodes.map((n) => {
                      const isHovered = activeNode?.idx === n.idx;
                      return (
                        <g
                          key={`${s.productId}-${n.idx}`}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setActivePointIndex(n.idx)}
                          onClick={() => setActivePointIndex(n.idx)}
                        >
                          {n.yOriginal != null && (
                            <>
                              <line
                                x1={n.x}
                                y1={n.yOriginal}
                                x2={n.x}
                                y2={n.yPrice}
                                stroke="#cbd5e1"
                                strokeWidth="1"
                                strokeDasharray="2 2"
                              />
                              <circle
                                cx={n.x}
                                cy={n.yOriginal}
                                r={isHovered ? 5 : 3.5}
                                fill="#ffffff"
                                stroke="#94a3b8"
                                strokeWidth="2"
                              />
                            </>
                          )}
                          <circle
                            cx={n.x}
                            cy={n.yPrice}
                            r={isHovered ? 6.5 : 4.5}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* X-Axis Date Labels */}
              {chartGeometry.mapped.length > 0 &&
                (chartGeometry.isSingleMoment ? (
                  <text
                    x={chartGeometry.padLeft + chartGeometry.plotW / 2}
                    y={chartGeometry.height - 12}
                    textAnchor="middle"
                    fontSize={labelUnits}
                    fill="#64748b"
                  >
                    {formatDateShort(
                      locale,
                      chartGeometry.mapped[0]?.pt.recorded_at || ''
                    )}
                  </text>
                ) : (
                  <>
                    <text
                      x={chartGeometry.mapped[0]?.x ?? chartGeometry.padLeft}
                      y={chartGeometry.height - 12}
                      textAnchor="start"
                      fontSize={labelUnits}
                      fill="#64748b"
                    >
                      {formatDateShort(
                        locale,
                        chartGeometry.mapped[0]?.pt.recorded_at || ''
                      )}
                    </text>
                    {chartGeometry.mapped.length >= 3 && (
                      <text
                        x={
                          chartGeometry.mapped[
                            Math.floor(chartGeometry.mapped.length / 2)
                          ]?.x ?? chartGeometry.width / 2
                        }
                        y={chartGeometry.height - 12}
                        textAnchor="middle"
                        fontSize={labelUnits}
                        fill="#64748b"
                      >
                        {formatDateShort(
                          locale,
                          chartGeometry.mapped[
                            Math.floor(chartGeometry.mapped.length / 2)
                          ]?.pt.recorded_at || ''
                        )}
                      </text>
                    )}
                    {chartGeometry.mapped.length >= 2 && (
                      <text
                        x={
                          chartGeometry.mapped[chartGeometry.mapped.length - 1]
                            ?.x ?? chartGeometry.width - chartGeometry.padRight
                        }
                        y={chartGeometry.height - 12}
                        textAnchor="end"
                        fontSize={labelUnits}
                        fill="#64748b"
                      >
                        {formatDateShort(
                          locale,
                          chartGeometry.mapped[chartGeometry.mapped.length - 1]
                            ?.pt.recorded_at || ''
                        )}
                      </text>
                    )}
                  </>
                ))}
            </svg>
          </div>
        </div>
      ) : (
        <div className="alert alert-light rounded-4 text-muted small mb-4 border">
          {t('priceHistoryEmptyRange')}
        </div>
      )}

      {/* Per-Merchant Fake Discount Detector Cards */}
      <div>
        <h3 className="h6 fw-bold d-flex align-items-center mb-3 gap-2">
          <BsSearch aria-hidden="true" />{' '}
          {t('priceHistoryMerchantAuditHeading')}
        </h3>
        <div className="row g-3">
          {offerAnalyses.map((oa) => {
            const style = getVerdictBadgeStyle(oa.verdict);
            return (
              <div key={oa.product_id} className="col-md-6 col-12">
                <div className="rounded-4 h-100 border bg-white p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                    <div>
                      <span className="badge bg-danger text-uppercase small me-2">
                        {oa.platform}
                      </span>
                      <span className="fw-bold text-dark small">
                        <ContentText text={oa.merchant_name} locale={locale} />
                      </span>
                    </div>
                    <span
                      className={`badge ${style.badgeClass} rounded-pill small px-3 py-1`}
                    >
                      <style.icon aria-hidden="true" className="me-1" />
                      {discountVerdictCopy(tVerdict, oa, locale).label}
                    </span>
                  </div>

                  <div className="d-flex align-items-baseline mb-2 flex-wrap gap-3">
                    <div>
                      <span className="text-muted small">
                        {t('priceHistoryCurrentPriceLabel')}{' '}
                      </span>
                      <span className="fw-bold text-danger">
                        {formatVnd(oa.price_current, locale)}
                      </span>
                    </div>
                    {oa.price_original && (
                      <div>
                        <span className="text-muted small">
                          {t('priceHistoryStrikethroughLabel')}{' '}
                        </span>
                        <span className="text-muted text-decoration-line-through small">
                          {formatVnd(oa.price_original, locale)}
                        </span>
                        <span className="badge bg-light text-dark small ms-1 border">
                          {t('priceHistoryClaimedPctBadge', {
                            pct: formatPlainNumber(
                              oa.claimed_discount_pct,
                              locale
                            ),
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className="d-flex text-muted mb-2 flex-wrap gap-3"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    <span>
                      {t('priceHistoryMedianLabel')}{' '}
                      <strong>
                        {formatVnd(oa.historical_median_price, locale)}
                      </strong>
                    </span>
                    <span>
                      {t('priceHistoryMinLabel')}{' '}
                      <strong>
                        {formatVnd(oa.historical_min_price, locale)}
                      </strong>
                    </span>
                    <span>
                      {t('priceHistoryMaxLabel')}{' '}
                      <strong>
                        {formatVnd(oa.historical_max_price, locale)}
                      </strong>
                    </span>
                    {(() => {
                      const offerOmnibus = omnibusByOffer.get(oa.product_id);
                      if (
                        !offerOmnibus ||
                        offerOmnibus.priorFloorPriceVnd == null ||
                        (offerOmnibus.windowStatus !==
                          'omnibus_30d_certified' &&
                          offerOmnibus.windowStatus !== 'partial_window')
                      ) {
                        return null;
                      }
                      const floorFormatted = formatVnd(
                        offerOmnibus.priorFloorPriceVnd,
                        locale
                      );
                      return (
                        <span className="text-dark fw-medium">
                          {offerOmnibus.windowStatus === 'omnibus_30d_certified'
                            ? tOmnibus('oOk')
                            : tOmnibus('oPart', {
                                days: offerOmnibus.windowDaysUsed,
                              })}
                          {': '}
                          <strong>{floorFormatted}</strong>
                        </span>
                      );
                    })()}
                  </div>

                  <p className="small text-secondary lh-sm mb-0">
                    {discountVerdictCopy(tVerdict, oa, locale).explanation}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
