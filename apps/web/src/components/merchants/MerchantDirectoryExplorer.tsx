'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/lib/navigation';
import { escapeCsvCell } from '@/lib/csv-safe';
import { MAX_VALID_VND_PRICE, type MerchantSummary } from '@/lib/rate-domain';
import {
  DEFAULT_MERCHANT_DIRECTORY_FILTERS,
  MERCHANT_PAGE_SIZE,
  merchantDirectoryFilterParams,
  parseMerchantDirectoryFilters,
  type MerchantDirectoryFilters,
  type MerchantDirectorySummary,
  type MerchantRiskTier,
  type MerchantSeedingTier,
  type MerchantSortOption,
} from '@/lib/merchant-directory';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  merchantRiskTone,
  type MerchantRiskTone,
} from '@/lib/merchant-risk-tone';
import {
  evaluateMerchantTrustBadge,
  type MerchantTrustBadgeResult,
} from '@/lib/merchant-trust-badge';
import {
  selectMerchantRadar,
  type CrossPlatformDealRadarResponse,
} from '@/lib/deal-radar';
import { useDealRadarPayload } from '@/components/radar/use-deal-radar';
import { useLocale, useTranslations } from 'next-intl';
import ContentText from '@/components/elementary/ContentText';
import {
  BsArrowCounterclockwise,
  BsBoxSeam,
  BsCheckCircleFill,
  BsFunnel,
  BsPeopleFill,
  BsRobot,
  BsSearch,
  BsShield,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsSortDown,
} from 'react-icons/bs';

import {
  sanitizeMerchantAuditText,
  sanitizeMerchantCount,
} from '@/components/merchants/MerchantShareAuditButton';
import {
  collapseWhitespace,
  formatListingPrice,
  formatNumber,
  formatPlainNumber,
  sanitizeCurrencyPriceValue,
} from '@/lib/locale-format';
import StarRating from '@/components/elementary/StarRating';

// Rows per request when an export collects every matching store.
const EXPORT_PAGE_SIZE = 500;
export const MAX_MERCHANT_EXPORT_PAGES = 20;

export function updateOpenSafeDetailsIds(
  prev: Set<string>,
  merchantId: string,
  isOpen: boolean
): Set<string> {
  if (prev.has(merchantId) === isOpen) {
    return prev;
  }
  const next = new Set(prev);
  if (isOpen) {
    next.add(merchantId);
  } else {
    next.delete(merchantId);
  }
  return next;
}

class EmptyMerchantExportError extends Error {
  constructor() {
    super('No merchants match export filters');
    this.name = 'EmptyMerchantExportError';
  }
}

export interface MerchantClipboardTarget<TItem = ClipboardItem> {
  readonly write?: (items: TItem[]) => Promise<void>;
  readonly writeText?: (text: string) => Promise<void>;
}

export async function copyMerchantsMarkdownWithClipboard<
  TItem = ClipboardItem,
>(params: {
  readonly matchedCount: number;
  readonly fetchAllMatching: () => Promise<
    readonly MerchantDirectoryExplorerItem[]
  >;
  readonly buildMarkdown: (
    rows: readonly MerchantDirectoryExplorerItem[]
  ) => string;
  readonly clipboard?: MerchantClipboardTarget<TItem>;
  readonly createClipboardItem?: (blobPromise: Promise<Blob>) => TItem;
}): Promise<boolean> {
  const {
    matchedCount,
    fetchAllMatching,
    buildMarkdown,
    clipboard,
    createClipboardItem,
  } = params;
  if (!clipboard || matchedCount === 0) return false;
  // The rows are fetched first, but Safari only lets the clipboard be written
  // during the click: hand it a promise via ClipboardItem so the write starts
  // inside the gesture. Browsers without ClipboardItem fall back to
  // writeText after the fetch.
  const markdown = fetchAllMatching().then((rowsToExport) => {
    if (rowsToExport.length === 0) {
      throw new EmptyMerchantExportError();
    }
    return buildMarkdown(rowsToExport);
  });
  // Handled below through the clipboard call; this only keeps an early
  // clipboard refusal from leaving the promise unobserved.
  markdown.catch(() => {});
  try {
    if (createClipboardItem && typeof clipboard.write === 'function') {
      const blobPromise = markdown.then(
        (md) => new Blob([md], { type: 'text/plain' })
      );
      blobPromise.catch(() => {});
      await clipboard.write([createClipboardItem(blobPromise)]);
      return true;
    }
    if (typeof clipboard.writeText === 'function') {
      await clipboard.writeText(await markdown);
      return true;
    }
    return false;
  } catch {
    // Clipboard refused, fetch failed, or filtered rows were empty: nothing copied.
    return false;
  }
}

function parseFiniteDirectoryNumber(value: unknown): number | null {
  if (
    value == null ||
    (typeof value !== 'number' && typeof value !== 'string')
  ) {
    return null;
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return parsed === 0 ? 0 : parsed;
  }
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

export function merchantDirectoryDosafeDisplay(
  merchant:
    | {
        dosafe_risk_score?: unknown;
        dosafe_risk_known?: boolean;
      }
    | null
    | undefined
): {
  score: number;
  tone: MerchantRiskTone;
  badgeClass: string;
  statusKey: 'scamStatusClean' | 'scamStatusCaution' | 'scamStatusAlert';
} | null {
  if (!merchant || merchant.dosafe_risk_known === false) return null;
  const parsedScore = parseFiniteDirectoryNumber(merchant.dosafe_risk_score);
  if (parsedScore == null) return null;
  const rawDosafeScore = knownDosafeRiskScore({
    dosafe_risk_score: parsedScore,
    dosafe_risk_known: merchant.dosafe_risk_known,
  });
  if (rawDosafeScore == null) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(rawDosafeScore)));
  const dosafeScore = clamped === 0 ? 0 : clamped;
  const tone = merchantRiskTone(dosafeScore);
  return {
    score: dosafeScore,
    tone,
    badgeClass:
      tone === 'good'
        ? 'bg-success-subtle text-success'
        : tone === 'warn'
          ? 'bg-warning-subtle text-warning-emphasis'
          : 'bg-danger-subtle text-danger',
    statusKey:
      tone === 'good'
        ? 'scamStatusClean'
        : tone === 'warn'
          ? 'scamStatusCaution'
          : 'scamStatusAlert',
  };
}

export function merchantDirectoryReviewRiskDisplay(
  merchant:
    | {
        review_risk_score?: unknown;
        review_risk_breakdown?: { total_reviews?: unknown } | null;
      }
    | null
    | undefined
): {
  score: number;
  tone: MerchantRiskTone;
  badgeClass: string;
} | null {
  if (!merchant || !hasReviewRiskEvidence(merchant.review_risk_breakdown)) {
    return null;
  }
  const brk = merchant.review_risk_breakdown;
  if (
    brk &&
    typeof brk === 'object' &&
    'total_reviews' in brk &&
    brk.total_reviews !== undefined
  ) {
    const count = parseFiniteDirectoryNumber(brk.total_reviews);
    if (count == null || count <= 0) return null;
  }
  const rawScore = parseFiniteDirectoryNumber(merchant.review_risk_score);
  if (rawScore == null) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(rawScore)));
  const reviewScore = clamped === 0 ? 0 : clamped;
  const tone = merchantRiskTone(reviewScore);
  return {
    score: reviewScore,
    tone,
    badgeClass:
      tone === 'good'
        ? 'bg-success-subtle text-success'
        : tone === 'warn'
          ? 'bg-warning-subtle text-warning-emphasis'
          : 'bg-danger-subtle text-danger',
  };
}

export function merchantDirectoryTrustDisplay(trustScore: unknown): {
  score: number;
  tier: 'high' | 'moderate' | 'risk';
  badgeClass: string;
} | null {
  const rawTrust = parseFiniteDirectoryNumber(trustScore);
  if (rawTrust == null) return null;
  const score = Math.min(100, Math.max(0, Math.round(rawTrust)));
  if (score >= 80) {
    return { score, tier: 'high', badgeClass: 'bg-success text-white' };
  }
  if (score > 50) {
    return { score, tier: 'moderate', badgeClass: 'bg-warning text-dark' };
  }
  return { score, tier: 'risk', badgeClass: 'bg-danger text-white' };
}

export function sanitizeMerchantDirectoryPriceVnd(
  value: unknown,
  currency?: string | null
): number | null {
  const raw = parseFiniteDirectoryNumber(value);
  if (raw == null || raw <= 0 || raw > MAX_VALID_VND_PRICE) return null;
  const sanitized = sanitizeCurrencyPriceValue(raw, currency);
  return sanitized > 0 && sanitized <= MAX_VALID_VND_PRICE ? sanitized : null;
}

export function formatMerchantDirectoryPriceRange(
  merchant:
    | {
        min_price?: unknown;
        max_price?: unknown;
        currency?: string | null;
      }
    | null
    | undefined,
  locale?: string | null
): string | null {
  if (!merchant) return null;
  const currency = merchant.currency ?? null;
  const safeMin = sanitizeMerchantDirectoryPriceVnd(
    merchant.min_price,
    currency
  );
  const safeMax = sanitizeMerchantDirectoryPriceVnd(
    merchant.max_price,
    currency
  );
  if (safeMin == null && safeMax == null) return null;
  if (safeMin != null && safeMax != null) {
    const low = Math.min(safeMin, safeMax);
    const high = Math.max(safeMin, safeMax);
    return high > low
      ? `${formatListingPrice(low, currency, locale)} - ${formatListingPrice(high, currency, locale)}`
      : formatListingPrice(low, currency, locale);
  }
  return formatListingPrice((safeMin ?? safeMax)!, currency, locale);
}

export type MerchantDirectoryExplorerItem = Omit<
  MerchantSummary,
  'dosafe_risk_score' | 'review_risk_score' | 'dosafe_risk_known'
> & {
  dosafe_risk_score: number | null;
  review_risk_score: number | null;
  dosafe_risk_known?: boolean;
  offerCount?: number | null;
  activeFakeDiscountCount?: number | null;
  fakeDiscountCount?: number | null;
};

function toNonNegativeCountOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
    ? raw
    : null;
}

export function resolveDirectoryMerchantFakeDiscountCount(
  merchant: Pick<
    MerchantDirectoryExplorerItem,
    'id' | 'name' | 'activeFakeDiscountCount' | 'fakeDiscountCount'
  >,
  radarPayload: CrossPlatformDealRadarResponse | null | undefined
): number | null {
  if (
    merchant.activeFakeDiscountCount !== undefined ||
    merchant.fakeDiscountCount !== undefined
  ) {
    return toNonNegativeCountOrNull(
      merchant.activeFakeDiscountCount ?? merchant.fakeDiscountCount
    );
  }
  if (!radarPayload) return null;
  const stats = selectMerchantRadar(radarPayload, merchant);
  if (stats.fakeTrapCount > 0) return stats.fakeTrapCount;
  // Deal radar only inspects a subset of master products and keeps one trap per
  // cluster, so an absence from fakeSaleTraps never proves 0 active fake
  // discounts across all merchant offers. Fail closed unless an explicit
  // merchant-wide fake-discount count is supplied above.
  return null;
}

export function filterVerifiedSafeDirectoryMerchants(
  items: readonly MerchantDirectoryExplorerItem[],
  radarPayload: CrossPlatformDealRadarResponse | null | undefined
): MerchantDirectoryExplorerItem[] {
  return items.filter(
    (m) => evaluateMerchantDirectoryTrustBadge(m, radarPayload).verifiedSafe
  );
}

export function evaluateMerchantDirectoryTrustBadge(
  merchant: MerchantDirectoryExplorerItem,
  radarPayload: CrossPlatformDealRadarResponse | null | undefined
): MerchantTrustBadgeResult {
  return evaluateMerchantTrustBadge({
    dosafe_risk_score: merchant.dosafe_risk_score,
    dosafe_risk_known: merchant.dosafe_risk_known,
    review_risk_score: merchant.review_risk_score,
    review_risk_breakdown: merchant.review_risk_breakdown,
    risk_score: merchant.risk_score,
    trust_score: merchant.trust_score,
    is_official: merchant.is_official,
    offerCount: merchant.offerCount ?? merchant.product_count,
    product_count: merchant.product_count,
    activeFakeDiscountCount: resolveDirectoryMerchantFakeDiscountCount(
      merchant,
      radarPayload
    ),
  });
}

export interface MerchantDirectoryExplorerPage {
  items: MerchantDirectoryExplorerItem[];
  /** Stores matching the filters, across all pages. */
  matched: number;
  offset: number;
}

export type MerchantDirectoryMarkdownKey =
  | 'dirMdHeading'
  | 'dirMdColMerchant'
  | 'dirMdColPlatform'
  | 'dirMdColOfficialMall'
  | 'dirMdColTrustScore'
  | 'dirMdColReviewRisk'
  | 'dirMdColGenuineDeals'
  | 'dirMdColFakeTraps'
  | 'dirMdColAuthenticReviews'
  | 'dirMdColTrackedProducts'
  | 'dirMdYes'
  | 'dirMdNo'
  | 'dirMdUnknownMerchant'
  | 'trustNoData'
  | 'reviewRiskNoDataShort';

export type MerchantDirectoryMarkdownTranslator = (
  key: MerchantDirectoryMarkdownKey,
  values?: Record<string, string | number>
) => string;

const DIRECTORY_CONTROL_CHARS_RE = /\p{Cc}+/gu;

function sanitizeMerchantDirectoryMarkdownCell(
  value: unknown,
  fallback = '-',
  locale?: string | null,
  maxLen = 160
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = collapseWhitespace(
    value.replace(DIRECTORY_CONTROL_CHARS_RE, ' ').replace(/\|/g, '-'),
    locale
  )
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function buildMerchantsDirectoryMarkdown(params: {
  merchants: readonly MerchantDirectoryExplorerItem[];
  radarPayload?: Parameters<typeof selectMerchantRadar>[0];
  t: MerchantDirectoryMarkdownTranslator;
  locale: string;
}): string {
  const { merchants, radarPayload, t, locale } = params;
  const headers = [
    sanitizeMerchantDirectoryMarkdownCell(t('dirMdColMerchant'), '-', locale),
    sanitizeMerchantDirectoryMarkdownCell(t('dirMdColPlatform'), '-', locale),
    sanitizeMerchantDirectoryMarkdownCell(
      t('dirMdColOfficialMall'),
      '-',
      locale
    ),
    sanitizeMerchantDirectoryMarkdownCell(t('dirMdColTrustScore'), '-', locale),
    sanitizeMerchantDirectoryMarkdownCell(t('dirMdColReviewRisk'), '-', locale),
    sanitizeMerchantDirectoryMarkdownCell(
      t('dirMdColGenuineDeals'),
      '-',
      locale
    ),
    sanitizeMerchantDirectoryMarkdownCell(t('dirMdColFakeTraps'), '-', locale),
    sanitizeMerchantDirectoryMarkdownCell(
      t('dirMdColAuthenticReviews'),
      '-',
      locale
    ),
    sanitizeMerchantDirectoryMarkdownCell(
      t('dirMdColTrackedProducts'),
      '-',
      locale
    ),
  ];
  const sep = headers.map(() => '---');
  const yesCell = sanitizeMerchantDirectoryMarkdownCell(
    t('dirMdYes'),
    '-',
    locale
  );
  const noCell = sanitizeMerchantDirectoryMarkdownCell(
    t('dirMdNo'),
    '-',
    locale
  );
  const unknownMerchant = sanitizeMerchantDirectoryMarkdownCell(
    t('dirMdUnknownMerchant'),
    '-',
    locale
  );
  const trustNoData = sanitizeMerchantDirectoryMarkdownCell(
    t('trustNoData'),
    '-',
    locale
  );
  const reviewNoData = sanitizeMerchantDirectoryMarkdownCell(
    t('reviewRiskNoDataShort'),
    '-',
    locale
  );
  const rows = merchants.map((m) => {
    const rStats = selectMerchantRadar(radarPayload, m);
    const trust = merchantDirectoryTrustDisplay(m.trust_score);
    const review = merchantDirectoryReviewRiskDisplay(m);
    return [
      sanitizeMerchantDirectoryMarkdownCell(m.name, unknownMerchant, locale),
      sanitizeMerchantDirectoryMarkdownCell(
        m.platform,
        'shopee',
        locale,
        32
      ).toUpperCase(),
      m.is_official ? yesCell : noCell,
      // No trust score: no number (DOS/Rate#1484).
      trust == null ? trustNoData : `${formatNumber(trust.score, locale)}/100`,
      review == null
        ? reviewNoData
        : `${formatNumber(review.score, locale)}/100`,
      formatNumber(sanitizeMerchantCount(rStats.genuineDealCount), locale),
      formatNumber(sanitizeMerchantCount(rStats.fakeTrapCount), locale),
      formatNumber(
        sanitizeMerchantCount(m.review_risk_breakdown?.authentic_count),
        locale
      ),
      formatNumber(sanitizeMerchantCount(m.product_count), locale),
    ];
  });
  return [
    t('dirMdHeading', { count: merchants.length }),
    '',
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

interface MerchantDirectoryExplorerProps {
  /** First page for the initial filters, rendered on the server. */
  readonly initialPage: MerchantDirectoryExplorerPage;
  /** Whole-directory stats; they do not depend on the filters. */
  readonly summary: MerchantDirectorySummary;
  readonly locale?: string;
  /** SSR/unit-test fixture override (#1883). */
  readonly initialRadarPayload?: CrossPlatformDealRadarResponse | null;
  /** SSR/unit-test fixture override (#1883). */
  readonly initialVerifiedSafeOnly?: boolean;
}

async function fetchDirectoryPage(
  filters: MerchantDirectoryFilters,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<MerchantDirectoryExplorerPage> {
  const params = merchantDirectoryFilterParams(filters);
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  const resp = await fetch(`/api/v1/rate/merchants/directory?${params}`, {
    signal,
  });
  if (!resp.ok) throw new Error(`merchant directory HTTP ${resp.status}`);
  const body = (await resp.json()) as { data: MerchantDirectoryExplorerPage };
  return body.data;
}

/**
 * Reports the URL's directory filters. useSearchParams makes only this empty
 * component client-rendered (inside its Suspense boundary), so the first page
 * stays in the cached server HTML. Keyed on the parsed filters, so a URL
 * change that keeps them (or a typed query, which does not touch the URL)
 * does not overwrite what the user picked.
 */
function FiltersFromUrl({
  onFilters,
}: {
  readonly onFilters: (filters: MerchantDirectoryFilters) => void;
}) {
  const searchParams = useSearchParams();
  const parsed = parseMerchantDirectoryFilters((key) => searchParams.get(key));
  const parsedKey = JSON.stringify(parsed);
  // The explorer starts on the defaults, so a plain /merchants applies
  // nothing: a query typed right after load is not reset to ''.
  const appliedKey = useRef(JSON.stringify(DEFAULT_MERCHANT_DIRECTORY_FILTERS));
  useEffect(() => {
    if (parsedKey === appliedKey.current) return;
    appliedKey.current = parsedKey;
    onFilters(JSON.parse(parsedKey) as MerchantDirectoryFilters);
  }, [parsedKey, onFilters]);
  return null;
}

export default function MerchantDirectoryExplorer({
  initialPage,
  summary,
  initialRadarPayload,
  initialVerifiedSafeOnly = false,
}: MerchantDirectoryExplorerProps) {
  const t = useTranslations('merchants');
  const locale = useLocale();
  const [query, setQuery] = useState(DEFAULT_MERCHANT_DIRECTORY_FILTERS.query);
  const [platform, setPlatform] = useState(
    DEFAULT_MERCHANT_DIRECTORY_FILTERS.platform
  );
  const [officialOnly, setOfficialOnly] = useState(
    DEFAULT_MERCHANT_DIRECTORY_FILTERS.officialOnly
  );
  const [verifiedSafeOnly, setVerifiedSafeOnly] = useState(
    initialVerifiedSafeOnly
  );
  const [riskTier, setRiskTier] = useState<MerchantRiskTier>('all');
  const [seedingTier, setSeedingTier] = useState<MerchantSeedingTier>('all');
  const [sortBy, setSortBy] = useState<MerchantSortOption>(
    DEFAULT_MERCHANT_DIRECTORY_FILTERS.sortBy
  );
  // The page is cached unfiltered; FiltersFromUrl applies a link's filters
  // (and later navigations) here, and the effect below fetches that page.
  const applyUrlFilters = useCallback((next: MerchantDirectoryFilters) => {
    setQuery(next.query);
    setPlatform(next.platform);
    setOfficialOnly(next.officialOnly);
    setRiskTier(next.riskTier);
    setSeedingTier(next.seedingTier);
    setSortBy(next.sortBy);
  }, []);
  const [copiedMerchantsMd, setCopiedMerchantsMd] = useState(false);
  const [openSafeDetailsIds, setOpenSafeDetailsIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  // The server filters and pages the directory (DOS/Rate#452): only the
  // stores on screen are in the browser. Exports fetch every matching store.
  const filters = useMemo<MerchantDirectoryFilters>(
    () => ({ query, platform, officialOnly, riskTier, seedingTier, sortBy }),
    [query, platform, officialOnly, riskTier, seedingTier, sortBy]
  );
  // JSON, not a joined string: a query containing the separator cannot collide.
  const filterKey = JSON.stringify(filters);
  const [pageState, setPageState] = useState({
    key: filterKey,
    items: initialPage.items,
    matched: initialPage.matched,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const firstRender = useRef(true);
  const lastQuery = useRef(query);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Typing waits for a pause; other filter changes apply at once.
    const delay = filters.query !== lastQuery.current ? 250 : 0;
    lastQuery.current = filters.query;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const page = await fetchDirectoryPage(
          filters,
          0,
          MERCHANT_PAGE_SIZE,
          controller.signal
        );
        setPageState({
          key: filterKey,
          items: page.items,
          matched: page.matched,
        });
      } catch {
        // Aborted or offline: keep the current results.
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filterKey, filters]);
  const visibleMerchants = pageState.items;
  const matchedCount = pageState.matched;
  const handleShowMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const offset = visibleMerchants.length;
    try {
      const page = await fetchDirectoryPage(
        filters,
        offset,
        MERCHANT_PAGE_SIZE
      );
      setPageState((prev) => {
        // Only append to the list this page continues (same filters, same
        // length); skip ids already shown if the order shifted meanwhile.
        if (prev.key !== filterKey || prev.items.length !== offset) return prev;
        const shown = new Set(prev.items.map((m) => m.id));
        return {
          key: prev.key,
          items: [...prev.items, ...page.items.filter((m) => !shown.has(m.id))],
          matched: page.matched,
        };
      });
    } catch {
      // Keep what is shown; the button stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  };
  /** Every store matching the current filters, for the exports. */
  const fetchAllMatching = async (): Promise<
    MerchantDirectoryExplorerItem[]
  > => {
    const all: MerchantDirectoryExplorerItem[] = [];
    for (let pageIdx = 0; pageIdx < MAX_MERCHANT_EXPORT_PAGES; pageIdx += 1) {
      const offset = pageIdx * EXPORT_PAGE_SIZE;
      const page = await fetchDirectoryPage(filters, offset, EXPORT_PAGE_SIZE);
      all.push(...page.items);
      if (page.items.length < EXPORT_PAGE_SIZE || all.length >= page.matched) {
        break;
      }
    }
    // Pages can come from different cache snapshots: drop repeats.
    const unique = [...new Map(all.map((m) => [m.id, m])).values()];
    return verifiedSafeOnly
      ? filterVerifiedSafeDirectoryMerchants(unique, radarPayload)
      : unique;
  };
  const radarPayload = useDealRadarPayload(initialRadarPayload);

  const badgeByMerchantId = useMemo(() => {
    const map = new Map<string, MerchantTrustBadgeResult>();
    for (const m of visibleMerchants) {
      map.set(m.id, evaluateMerchantDirectoryTrustBadge(m, radarPayload));
    }
    return map;
  }, [visibleMerchants, radarPayload]);

  const displayedMerchants = useMemo(
    () =>
      verifiedSafeOnly
        ? visibleMerchants.filter(
            (m) => badgeByMerchantId.get(m.id)?.verifiedSafe === true
          )
        : visibleMerchants,
    [verifiedSafeOnly, visibleMerchants, badgeByMerchantId]
  );

  const displayedMatchedCount = verifiedSafeOnly
    ? displayedMerchants.length
    : matchedCount;

  const labels = useMemo(
    () => ({
      totalMerchants: t('totalMerchants'),
      officialMalls: t('officialMalls'),
      highTrustShops: t('highTrustShops'),
      avgTrustScore: t('avgTrustScore'),
      searchPlaceholder: t('searchPlaceholder'),
      allPlatforms: t('allPlatforms'),
      platformFilterAria: t('platformFilterAria'),
      seedingFilterAria: t('seedingFilterAria'),
      officialMallOnly: t('officialMallOnly'),
      verifiedSafeFilterBtn: t('verifiedSafeFilterBtn'),
      verifiedSafeBadge: t('verifiedSafeBadge'),
      verifiedSafeTooltip: t('verifiedSafeTooltip'),
      verifiedSafeSignalDosafe: t('verifiedSafeSignalDosafe'),
      verifiedSafeSignalReview: t('verifiedSafeSignalReview'),
      verifiedSafeSignalTrust: t('verifiedSafeSignalTrust'),
      verifiedSafeSignalFakeZero: t('verifiedSafeSignalFakeZero'),
      riskFilterLabel: t('riskFilterLabel'),
      riskAll: t('riskAll'),
      riskSafe: t('riskSafe'),
      riskModerate: t('riskModerate'),
      riskWarning: t('riskWarning'),
      seedingAll: t('seedingAll'),
      seedingLow: t('seedingLow'),
      seedingElevated: t('seedingElevated'),
      copyMdBtn: t('copyMdBtn'),
      copiedMdBtn: t('copiedMdBtn'),
      exportCsvBtn: t('exportCsvBtn'),
      sortLabel: t('sortLabel'),
      sortTrust: t('sortTrust'),
      sortProducts: t('sortProducts'),
      sortSeeding: t('sortSeeding'),
      sortFollowers: t('sortFollowers'),
      resetFilters: t('resetFilters'),
      showingCount: t('showingCount'),
      ofCount: t('ofCount'),
      merchantsUnit: t('merchantsUnit'),
      officialBadge: t('officialBadge'),
      platformRating: t('platformRating'),
      noRating: t('noRating'),
      followers: t('followers'),
      productsUnit: t('productsUnit'),
      scamStatusClean: t('scamStatusClean'),
      scamStatusCaution: t('scamStatusCaution'),
      scamStatusAlert: t('scamStatusAlert'),
      authenticLabel: t('authenticLabel'),
      noReviewsToAnalyse: t('layer2NoReviews'),
      reviewRiskNoData: t('reviewRiskNoDataShort'),
      trustNoData: t('trustNoData'),
      riskScamLabel: t('riskScamLabel'),
      riskReviewLabel: t('riskReviewLabel'),
      priceRangeLabel: t('priceRangeLabel'),
      viewTrustProfileCta: t('viewTrustProfileCta'),
      openStorefrontCta: t('openStorefrontCta'),
      emptyTitle: t('emptyTitle'),
      emptySubtitle: t('emptySubtitle'),
      inspectUrlCta: t('inspectUrlCta'),
    }),
    [t]
  );

  const platformCounts = useMemo(
    () => new Map(Object.entries(summary.platformCounts)),
    [summary.platformCounts]
  );

  const availablePlatforms = useMemo(() => {
    const base = [
      'shopee',
      'lazada',
      'tiki',
      'tiktok',
      'cellphones',
      'tgdd',
      'fptshop',
      'hoangha',
      'didongviet',
      'phongvu',
      'dienmayxanh',
      'topzone',
      'gearvn',
      'nguyenkim',
      'shopdunk',
      'hacom',
      'clickbuy',
      'viettelstore',
      'pico',
      'mediamart',
      'memoryzone',
      'anphatpc',
    ];
    for (const p of platformCounts.keys()) {
      if (!base.includes(p)) base.push(p);
    }
    return base;
  }, [platformCounts]);

  const summaryStats = summary;

  const hasActiveFilters =
    query.trim() !== '' ||
    platform !== 'all' ||
    officialOnly ||
    verifiedSafeOnly ||
    riskTier !== 'all' ||
    seedingTier !== 'all' ||
    sortBy !== 'trust_desc';

  const handleReset = () => {
    setQuery('');
    setPlatform('all');
    setOfficialOnly(false);
    setVerifiedSafeOnly(false);
    setRiskTier('all');
    setSeedingTier('all');
    setSortBy('trust_desc');
  };

  const getMerchantRadarStats = (m: MerchantDirectoryExplorerItem) => {
    const r = selectMerchantRadar(radarPayload, m);
    return {
      genuineDealCount: r.genuineDealCount,
      fakeTrapCount: r.fakeTrapCount,
      bestSavingsPct: r.bestSavingsPct,
    };
  };

  const buildMerchantsMarkdown = (
    filteredMerchants: readonly MerchantDirectoryExplorerItem[]
  ) =>
    buildMerchantsDirectoryMarkdown({
      merchants: filteredMerchants,
      radarPayload,
      t: (key, values) => t(key, values),
      locale,
    });

  const handleCopyMerchantsMarkdown = async () => {
    if (typeof navigator === 'undefined') return;
    const copied = await copyMerchantsMarkdownWithClipboard({
      matchedCount,
      fetchAllMatching,
      buildMarkdown: buildMerchantsMarkdown,
      clipboard: navigator.clipboard,
      createClipboardItem:
        typeof ClipboardItem !== 'undefined'
          ? (blobPromise) => new ClipboardItem({ 'text/plain': blobPromise })
          : undefined,
    });
    if (copied) {
      setCopiedMerchantsMd(true);
      setTimeout(() => setCopiedMerchantsMd(false), 2500);
    }
  };

  const handleDownloadMerchantsCsv = async () => {
    if (typeof document === 'undefined' || matchedCount === 0) return;
    let filteredMerchants: MerchantDirectoryExplorerItem[];
    try {
      filteredMerchants = await fetchAllMatching();
    } catch {
      return;
    }
    if (filteredMerchants.length === 0) return;
    const headers = [
      'MerchantID',
      'Name',
      'Platform',
      'ShopID',
      'IsOfficial',
      'TrustScore',
      'ReviewRiskScore',
      'GenuineDeals60D',
      'FakeSaleTraps60D',
      'AuthenticReviewCount',
      'IgnoredReviewCount',
      'TrackedProducts',
      'FollowerCount',
    ];
    const rows = filteredMerchants.map((m) => {
      const rStats = getMerchantRadarStats(m);
      const trust = merchantDirectoryTrustDisplay(m.trust_score);
      const review = merchantDirectoryReviewRiskDisplay(m);
      const ignoredReviews =
        sanitizeMerchantCount(m.review_risk_breakdown?.coin_spam_count) +
        sanitizeMerchantCount(m.review_risk_breakdown?.seeding_fake_count);
      return [
        sanitizeMerchantAuditText(m.id, '', 120),
        sanitizeMerchantAuditText(m.name, 'Unknown'),
        sanitizeMerchantAuditText(m.platform, 'shopee', 32),
        sanitizeMerchantAuditText(m.platform_shop_id, '', 80),
        m.is_official ? 'true' : 'false',
        trust == null ? '' : String(trust.score),
        // Empty without analysed reviews (DOS/Rate#1258).
        review == null ? '' : String(review.score),
        String(sanitizeMerchantCount(rStats.genuineDealCount)),
        String(sanitizeMerchantCount(rStats.fakeTrapCount)),
        String(sanitizeMerchantCount(m.review_risk_breakdown?.authentic_count)),
        String(ignoredReviews),
        String(sanitizeMerchantCount(m.product_count)),
        String(sanitizeMerchantCount(m.follower_count)),
      ];
    });
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
    a.download = `rate-merchants-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMerchantsJson = async () => {
    if (typeof document === 'undefined' || matchedCount === 0) return;
    let filteredMerchants: MerchantDirectoryExplorerItem[];
    try {
      filteredMerchants = await fetchAllMatching();
    } catch {
      return;
    }
    if (filteredMerchants.length === 0) return;
    const payload = {
      source: 'Rate.vn Merchant Trust Directory',
      exportedAt: new Date().toISOString(),
      merchantCount: filteredMerchants.length,
      merchants: filteredMerchants.map((m) => {
        const { dosafe_risk_known: _dosafeKnown, ...rest } = m;
        void _dosafeKnown;
        return {
          ...rest,
          min_price: sanitizeMerchantDirectoryPriceVnd(m.min_price),
          max_price: sanitizeMerchantDirectoryPriceVnd(m.max_price),
          dosafe_risk_score: merchantDirectoryDosafeDisplay(m)?.score ?? null,
          // Null without analysed reviews (DOS/Rate#1258, #1821).
          review_risk_score:
            merchantDirectoryReviewRiskDisplay(m)?.score ?? null,
          dealRadarStats: getMerchantRadarStats(m),
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-merchants-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Suspense fallback={null}>
        <FiltersFromUrl onFilters={applyUrlFilters} />
      </Suspense>
      {/* KPI Summary Strip */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.totalMerchants}</div>
            <div className="fs-4 fw-bold text-dark d-flex align-items-center gap-2">
              <BsShop aria-hidden="true" className="text-primary" />
              {summaryStats.total}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.officialMalls}</div>
            <div className="fs-4 fw-bold text-success d-flex align-items-center gap-2">
              <BsCheckCircleFill aria-hidden="true" />
              {summaryStats.official}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.highTrustShops}</div>
            <div
              className="fs-4 fw-bold text-primary d-flex align-items-center gap-2"
              data-testid="merchant-safe-count"
            >
              <BsShieldCheck aria-hidden="true" />
              {summaryStats.safe}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.avgTrustScore}</div>
            {/* No store with a trust score: no average (DOS/Rate#1484). */}
            {summaryStats.avgTrust == null ? (
              <div className="fs-6 text-muted">{labels.trustNoData}</div>
            ) : (
              <div className="fs-4 fw-bold text-dark">
                {summaryStats.avgTrust}
                <span className="fs-6 text-muted fw-normal">/100</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Filter & Search Controls */}
      <div className="card rounded-4 mb-4 border bg-white p-4 shadow-sm">
        <div className="row g-3 align-items-center">
          {/* Search Input */}
          <div className="col-lg-5 col-md-12">
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0 text-muted">
                <BsSearch aria-hidden="true" />
              </span>
              <input
                type="search"
                className="form-control bg-light border-start-0"
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={labels.searchPlaceholder}
              />
            </div>
          </div>

          {/* Risk Tier Filter */}
          <div className="col-lg-3 col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted">
                <BsFunnel aria-hidden="true" className="me-1" />{' '}
                {labels.riskFilterLabel}
              </span>
              <select
                className="form-select"
                value={riskTier}
                onChange={(e) =>
                  setRiskTier(e.target.value as MerchantRiskTier)
                }
                aria-label={labels.riskFilterLabel}
              >
                <option value="all">{labels.riskAll}</option>
                <option value="safe">{labels.riskSafe}</option>
                <option value="moderate">{labels.riskModerate}</option>
                <option value="warning">{labels.riskWarning}</option>
              </select>
            </div>
          </div>

          {/* Sort Select */}
          <div className="col-lg-4 col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted">
                <BsSortDown aria-hidden="true" className="me-1" />{' '}
                {labels.sortLabel}
              </span>
              <select
                className="form-select"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as MerchantSortOption)
                }
                aria-label={labels.sortLabel}
              >
                <option value="trust_desc">{labels.sortTrust}</option>
                <option value="products_desc">{labels.sortProducts}</option>
                <option value="seeding_asc">{labels.sortSeeding}</option>
                <option value="followers_desc">{labels.sortFollowers}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Platform Pills + Official Toggle + Seeding Risk Filter */}
        <div className="d-flex justify-content-between align-items-center border-top mt-3 flex-wrap gap-2 pt-3">
          <div className="d-flex align-items-center flex-wrap gap-2">
            {/* Each filter exposes its pressed choice, not only its colour
                (DOS/Rate#1069). */}
            <div
              className="d-flex align-items-center flex-wrap gap-2"
              role="group"
              aria-label={labels.platformFilterAria}
            >
              <button
                type="button"
                aria-pressed={platform === 'all'}
                onClick={() => setPlatform('all')}
                className={`btn btn-sm rounded-pill px-3 ${
                  platform === 'all'
                    ? 'btn-dark fw-semibold'
                    : 'btn-outline-dark'
                }`}
              >
                {labels.allPlatforms} ({summary.total})
              </button>
              {availablePlatforms.map((p) => {
                const count = platformCounts.get(p) ?? 0;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={platform === p}
                    onClick={() => setPlatform(p)}
                    className={`btn btn-sm rounded-pill text-uppercase px-3 ${
                      platform === p
                        ? 'btn-danger fw-semibold'
                        : 'btn-outline-secondary'
                    }`}
                  >
                    {p} ({count})
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-pressed={officialOnly}
              onClick={() => setOfficialOnly(!officialOnly)}
              className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-1 px-3 ${
                officialOnly ? 'btn-success fw-semibold' : 'btn-outline-success'
              }`}
            >
              <BsCheckCircleFill aria-hidden="true" />
              {labels.officialMallOnly}
            </button>

            <button
              type="button"
              aria-pressed={verifiedSafeOnly}
              data-testid="merchant-verified-safe-filter"
              onClick={() => setVerifiedSafeOnly(!verifiedSafeOnly)}
              className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-1 px-3 ${
                verifiedSafeOnly
                  ? 'btn-success fw-semibold'
                  : 'btn-outline-success'
              }`}
            >
              <BsShieldCheck aria-hidden="true" />
              {labels.verifiedSafeFilterBtn}
            </button>

            <div
              className="btn-group btn-group-sm"
              role="group"
              aria-label={labels.seedingFilterAria}
            >
              {(
                [
                  { id: 'all', label: labels.seedingAll },
                  { id: 'low', label: labels.seedingLow },
                  { id: 'elevated', label: labels.seedingElevated },
                ] as const
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  aria-pressed={seedingTier === tier.id}
                  onClick={() => setSeedingTier(tier.id)}
                  className={`btn rounded-pill ms-1 px-2 py-1 ${
                    seedingTier === tier.id
                      ? 'btn-primary fw-semibold text-white'
                      : 'btn-outline-primary'
                  }`}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyMerchantsMarkdown}
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3 py-1"
              data-testid="copy-merchants-md-btn"
            >
              {copiedMerchantsMd ? labels.copiedMdBtn : labels.copyMdBtn}
            </button>
            <button
              type="button"
              onClick={handleDownloadMerchantsCsv}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
              data-testid="download-merchants-csv-btn"
            >
              {labels.exportCsvBtn}
            </button>
            <button
              type="button"
              onClick={handleDownloadMerchantsJson}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
              data-testid="download-merchants-json-btn"
            >
              JSON
            </button>
            <span className="small text-muted ms-1">
              {labels.showingCount}{' '}
              <strong className="text-dark">{displayedMatchedCount}</strong>{' '}
              {labels.ofCount} {summary.total} {labels.merchantsUnit}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-sm btn-link text-danger text-decoration-none d-inline-flex align-items-center gap-1 p-0"
              >
                <BsArrowCounterclockwise aria-hidden="true" />
                {labels.resetFilters}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {displayedMatchedCount === 0 ? (
        <div className="card rounded-4 border bg-white p-5 text-center shadow-sm">
          <div className="mb-3">
            <BsShieldExclamation
              aria-hidden="true"
              className="fs-1 text-warning"
            />
          </div>
          <h3 className="h5 fw-bold mb-2">{labels.emptyTitle}</h3>
          <p
            className="text-muted small mx-auto mb-4"
            style={{ maxWidth: 520 }}
          >
            {verifiedSafeOnly && matchedCount > visibleMerchants.length
              ? t('verifiedSafeMorePagesHint', {
                  shown: visibleMerchants.length,
                  total: matchedCount,
                })
              : labels.emptySubtitle}
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
            {verifiedSafeOnly && matchedCount > visibleMerchants.length && (
              <button
                type="button"
                className="btn btn-outline-dark rounded-pill fw-semibold px-4"
                onClick={handleShowMore}
                disabled={loadingMore}
              >
                {t('showMoreMerchants', {
                  count: matchedCount - visibleMerchants.length,
                })}
              </button>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-outline-secondary rounded-pill px-4"
              >
                {labels.resetFilters}
              </button>
            )}
            <Link
              href={
                query.trim()
                  ? `/inspect?q=${encodeURIComponent(query.trim())}`
                  : '/inspect'
              }
              className="btn btn-danger rounded-pill fw-medium px-4"
            >
              <BsSearch aria-hidden="true" className="me-1" />
              {labels.inspectUrlCta}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="row g-4">
            {displayedMerchants.map((merchant) => {
              const dosafeDisplay = merchantDirectoryDosafeDisplay(merchant);
              const reviewDisplay =
                merchantDirectoryReviewRiskDisplay(merchant);
              const trustDisplay = merchantDirectoryTrustDisplay(
                merchant.trust_score
              );
              const trustBadgeClass =
                trustDisplay == null
                  ? 'bg-light text-muted border'
                  : trustDisplay.badgeClass;
              const priceRangeText = formatMerchantDirectoryPriceRange(
                merchant,
                locale
              );
              const brk = merchant.review_risk_breakdown;
              const totalReviews = sanitizeMerchantCount(brk?.total_reviews);

              return (
                <div className="col-lg-6 col-12" key={merchant.id}>
                  <div
                    className="rate-card rounded-4 d-flex flex-column h-100 p-md-4 border bg-white p-3 shadow-sm"
                    data-merchant-id={merchant.id}
                  >
                    <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
                      <div
                        className="d-flex align-items-center gap-3"
                        style={{ minWidth: 0 }}
                      >
                        <div
                          className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold fs-4 flex-shrink-0"
                          style={{ width: '56px', height: '56px' }}
                        >
                          <BsShop aria-hidden="true" />
                        </div>
                        <div>
                          <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                            <span className="badge bg-danger text-uppercase small">
                              {merchant.platform}
                            </span>
                            {merchant.is_official && (
                              <span className="badge bg-success-subtle text-success small d-inline-flex align-items-center gap-1">
                                <BsCheckCircleFill aria-hidden="true" />{' '}
                                {labels.officialBadge}
                              </span>
                            )}
                            <span className="text-muted small d-none d-md-inline">
                              ID: <code>{merchant.platform_shop_id}</code>
                            </span>
                          </div>
                          <h3 className="h5 fw-bold mb-0">
                            <Link
                              href={`/merchants/${merchant.id}`}
                              className="text-dark text-decoration-none"
                            >
                              <ContentText
                                text={merchant.name}
                                locale={locale}
                              />
                            </Link>
                          </h3>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-end">
                        <span
                          className={`badge ${trustBadgeClass} rounded-pill fs-6 rate-tabular px-3 py-2`}
                          data-testid="merchant-directory-trust-badge"
                        >
                          {trustDisplay == null
                            ? t('trustBadgeNoData')
                            : t('trustBadge', { score: trustDisplay.score })}
                        </span>
                      </div>
                    </div>

                    {/* Shop quick metrics: one wrapping line, not three boxes,
                        so the card stays short on phones (DOS/Rate#635). */}
                    <ul className="list-unstyled d-flex small rate-tabular column-gap-3 row-gap-1 mb-3 flex-wrap">
                      <li className="d-flex align-items-center gap-1">
                        <span className="text-muted">
                          {labels.platformRating}:
                        </span>
                        <StarRating
                          value={merchant.rating_star}
                          size="sm"
                          emptyLabel={labels.noRating}
                        />
                      </li>
                      {merchant.follower_count > 0 && (
                        <li className="d-flex align-items-center gap-1">
                          <BsPeopleFill
                            aria-hidden="true"
                            className="text-primary"
                          />
                          <span className="text-muted">
                            {labels.followers}:
                          </span>
                          <strong>
                            {formatNumber(merchant.follower_count, locale)}
                          </strong>
                        </li>
                      )}
                      <li className="d-flex align-items-center gap-1">
                        <BsBoxSeam
                          aria-hidden="true"
                          className="text-success"
                        />
                        <strong>
                          {merchant.product_count} {labels.productsUnit}
                        </strong>
                      </li>
                    </ul>

                    {/* Dual Risk Score Breakdown */}
                    <div className="rounded-3 mb-3 border bg-white p-3">
                      <div className="row g-3">
                        <div className="border-end-sm col-sm-6 col-12">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="small text-muted fw-medium">
                              <BsShield aria-hidden="true" className="me-1" />
                              {labels.riskScamLabel}
                            </span>
                            {dosafeDisplay == null ? (
                              // No DOSafe score: no number, and no alert (#1465).
                              <span
                                className="badge rounded-pill bg-light text-muted border"
                                data-testid="merchant-directory-scam-badge"
                                data-tone="unknown"
                              >
                                {labels.reviewRiskNoData}
                              </span>
                            ) : (
                              <span
                                className={`badge rounded-pill rate-tabular ${dosafeDisplay.badgeClass}`}
                                data-testid="merchant-directory-scam-badge"
                                data-tone={dosafeDisplay.tone}
                              >
                                {dosafeDisplay.score}/100
                              </span>
                            )}
                          </div>
                          {dosafeDisplay != null && (
                            <div
                              className="small text-muted d-none d-sm-block"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {labels[dosafeDisplay.statusKey]}
                            </div>
                          )}
                        </div>

                        <div className="col-sm-6 col-12">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="small text-muted fw-medium">
                              <BsRobot aria-hidden="true" className="me-1" />
                              {labels.riskReviewLabel}
                            </span>
                            {reviewDisplay == null ? (
                              // No analysed reviews: no number (#1249).
                              <span
                                className="badge rounded-pill bg-light text-muted border"
                                data-testid="merchant-directory-review-badge"
                                data-tone="unknown"
                              >
                                {labels.reviewRiskNoData}
                              </span>
                            ) : (
                              <span
                                className={`badge rounded-pill rate-tabular ${reviewDisplay.badgeClass}`}
                                data-testid="merchant-directory-review-badge"
                                data-tone={reviewDisplay.tone}
                              >
                                {reviewDisplay.score}/100
                              </span>
                            )}
                          </div>
                          <div
                            className="small text-muted d-none d-sm-block"
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {totalReviews > 0 ? (
                              <>
                                {labels.authenticLabel}{' '}
                                <strong>
                                  {sanitizeMerchantCount(brk?.authentic_count)}
                                </strong>
                                /{totalReviews} (
                                {t('filteredSpamCount', {
                                  count:
                                    sanitizeMerchantCount(
                                      brk?.coin_spam_count
                                    ) +
                                    sanitizeMerchantCount(
                                      brk?.seeding_fake_count
                                    ),
                                })}
                                )
                              </>
                            ) : (
                              labels.noReviewsToAnalyse
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {priceRangeText && (
                      <div className="small text-muted mb-2">
                        {labels.priceRangeLabel}{' '}
                        <strong className="text-dark rate-tabular">
                          {priceRangeText}
                        </strong>
                      </div>
                    )}

                    {(() => {
                      const rStats = getMerchantRadarStats(merchant);
                      const trustBadge = badgeByMerchantId.get(merchant.id);
                      const dosafeVal =
                        trustBadge?.signals.dosafeRiskScore != null
                          ? `${formatNumber(Math.round(trustBadge.signals.dosafeRiskScore), locale)}/100`
                          : labels.reviewRiskNoData;
                      const reviewVal =
                        trustBadge?.signals.reviewRiskScore != null
                          ? `${formatNumber(Math.round(trustBadge.signals.reviewRiskScore), locale)}/100`
                          : labels.reviewRiskNoData;
                      const authorityVal = trustBadge?.signals.isOfficial
                        ? trustBadge.signals.combinedTrustScore != null
                          ? `${labels.officialBadge} (${formatNumber(Math.round(trustBadge.signals.combinedTrustScore), locale)}/100)`
                          : labels.officialBadge
                        : trustBadge?.signals.combinedTrustScore != null
                          ? `${formatNumber(Math.round(trustBadge.signals.combinedTrustScore), locale)}/100`
                          : labels.trustNoData;
                      const signalTooltip = trustBadge?.verifiedSafe
                        ? `${labels.verifiedSafeTooltip}: ${labels.verifiedSafeSignalDosafe} ${dosafeVal} | ${labels.verifiedSafeSignalReview} ${reviewVal} | ${labels.verifiedSafeSignalTrust} ${authorityVal} | ${labels.verifiedSafeSignalFakeZero}`
                        : '';
                      return (
                        <div
                          className="d-flex align-items-center mb-3 flex-wrap gap-1"
                          data-testid="merchant-deal-radar-badge"
                        >
                          {trustBadge?.verifiedSafe && (
                            <details
                              open={openSafeDetailsIds.has(merchant.id)}
                              className={
                                openSafeDetailsIds.has(merchant.id)
                                  ? 'w-100'
                                  : 'd-inline-block'
                              }
                              data-testid="merchant-verified-safe-details"
                              onToggle={(e) => {
                                const isOpen = e.currentTarget.open;
                                setOpenSafeDetailsIds((prev) =>
                                  updateOpenSafeDetailsIds(
                                    prev,
                                    merchant.id,
                                    isOpen
                                  )
                                );
                              }}
                            >
                              <summary
                                className="d-inline-flex align-items-center"
                                style={{
                                  cursor: 'pointer',
                                  listStyle: 'none',
                                  minHeight: '24px',
                                }}
                              >
                                <span
                                  className="badge bg-success-subtle text-success border-success-subtle rounded-pill border d-inline-flex align-items-center gap-1 px-2 py-1"
                                  data-testid="merchant-verified-safe-badge"
                                  title={signalTooltip}
                                >
                                  <BsShieldCheck aria-hidden="true" />
                                  {labels.verifiedSafeBadge}
                                </span>
                              </summary>
                              <div
                                className="rounded-3 bg-light small text-dark mt-2 border p-2"
                                data-testid="merchant-verified-safe-breakdown"
                              >
                                <div className="fw-semibold text-success mb-1">
                                  {labels.verifiedSafeTooltip}
                                </div>
                                <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
                                  <li>
                                    {labels.verifiedSafeSignalDosafe}{' '}
                                    <strong>{dosafeVal}</strong>
                                  </li>
                                  <li>
                                    {labels.verifiedSafeSignalReview}{' '}
                                    <strong>{reviewVal}</strong>
                                  </li>
                                  <li>
                                    {labels.verifiedSafeSignalTrust}{' '}
                                    <strong>{authorityVal}</strong>
                                  </li>
                                  <li>{labels.verifiedSafeSignalFakeZero}</li>
                                </ul>
                              </div>
                            </details>
                          )}
                          {rStats.genuineDealCount > 0 && (
                            <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-2 py-1">
                              {t('radarGenuineBadge', {
                                count: rStats.genuineDealCount,
                                pct: formatPlainNumber(
                                  rStats.bestSavingsPct,
                                  locale
                                ),
                              })}
                            </span>
                          )}
                          {rStats.fakeTrapCount > 0 ? (
                            <span className="badge bg-danger-subtle text-danger border-danger-subtle rounded-pill border px-2 py-1">
                              {t('radarFakeBadge', {
                                count: rStats.fakeTrapCount,
                              })}
                            </span>
                          ) : (
                            <span className="badge bg-light text-secondary rounded-pill border px-2 py-1">
                              {t('radarZeroFakeBadge')}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                      <Link
                        href={`/merchants/${merchant.id}`}
                        className="btn btn-primary btn-sm rounded-pill fw-medium px-3"
                      >
                        {labels.viewTrustProfileCta}
                      </Link>
                      {merchant.url && (
                        <a
                          href={merchant.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                        >
                          {labels.openStorefrontCta}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {matchedCount > visibleMerchants.length && (
            <div className="mt-4 text-center">
              <button
                type="button"
                className="btn btn-outline-dark rounded-pill fw-semibold px-4"
                onClick={handleShowMore}
                disabled={loadingMore}
              >
                {t('showMoreMerchants', {
                  count: matchedCount - visibleMerchants.length,
                })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
