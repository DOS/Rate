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
import type { MerchantSummary } from '@/lib/rate-domain';
import {
  DEFAULT_MERCHANT_DIRECTORY_FILTERS,
  MERCHANT_PAGE_SIZE,
  merchantDirectoryFilterParams,
  parseMerchantDirectoryFilters,
  type MerchantDirectoryFilters,
  type MerchantDirectoryPage,
  type MerchantDirectorySummary,
  type MerchantRiskTier,
  type MerchantSeedingTier,
  type MerchantSortOption,
} from '@/lib/merchant-directory';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  reviewRiskScoreOrNull,
} from '@/lib/merchant-risk-tone';
import { selectMerchantRadar } from '@/lib/deal-radar';
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
  BsStarFill,
} from 'react-icons/bs';

import {
  sanitizeMerchantAuditText,
  sanitizeMerchantCount,
  sanitizeMerchantScore100,
} from '@/components/merchants/MerchantShareAuditButton';
import {
  formatDecimal,
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';

// Rows per request when an export collects every matching store.
const EXPORT_PAGE_SIZE = 500;
export const MAX_MERCHANT_EXPORT_PAGES = 20;

interface MerchantDirectoryExplorerProps {
  /** First page for the initial filters, rendered on the server. */
  readonly initialPage: MerchantDirectoryPage;
  /** Whole-directory stats; they do not depend on the filters. */
  readonly summary: MerchantDirectorySummary;
  readonly locale?: string;
}

async function fetchDirectoryPage(
  filters: MerchantDirectoryFilters,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<MerchantDirectoryPage> {
  const params = merchantDirectoryFilterParams(filters);
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  const resp = await fetch(`/api/v1/rate/merchants/directory?${params}`, {
    signal,
  });
  if (!resp.ok) throw new Error(`merchant directory HTTP ${resp.status}`);
  const body = (await resp.json()) as { data: MerchantDirectoryPage };
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
  const fetchAllMatching = async (): Promise<MerchantSummary[]> => {
    const all: MerchantSummary[] = [];
    for (let pageIdx = 0; pageIdx < MAX_MERCHANT_EXPORT_PAGES; pageIdx += 1) {
      const offset = pageIdx * EXPORT_PAGE_SIZE;
      const page = await fetchDirectoryPage(filters, offset, EXPORT_PAGE_SIZE);
      all.push(...page.items);
      if (page.items.length < EXPORT_PAGE_SIZE || all.length >= page.matched) {
        break;
      }
    }
    // Pages can come from different cache snapshots: drop repeats.
    return [...new Map(all.map((m) => [m.id, m])).values()];
  };
  const radarPayload = useDealRadarPayload();

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
      dosafeZero: t('dosafeZero'),
      dosafeAlert: t('dosafeAlert'),
      authenticLabel: t('authenticLabel'),
      noReviewsToAnalyse: t('layer2NoReviews'),
      reviewRiskNoData: t('reviewRiskNoDataShort'),
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
    riskTier !== 'all' ||
    seedingTier !== 'all' ||
    sortBy !== 'trust_desc';

  const handleReset = () => {
    setQuery('');
    setPlatform('all');
    setOfficialOnly(false);
    setRiskTier('all');
    setSeedingTier('all');
    setSortBy('trust_desc');
  };

  const getMerchantRadarStats = (m: MerchantSummary) => {
    const r = selectMerchantRadar(radarPayload, m);
    return {
      genuineDealCount: r.genuineDealCount,
      fakeTrapCount: r.fakeTrapCount,
      bestSavingsPct: r.bestSavingsPct,
    };
  };

  const buildMerchantsMarkdown = (filteredMerchants: MerchantSummary[]) => {
    const headers = [
      'Merchant',
      'Platform',
      'Official Mall',
      'Trust Score (/100)',
      'Review risk (/100)',
      'Genuine Deals',
      'Fake Sale Traps',
      'Authentic Reviews',
      'Tracked Products',
    ];
    const sep = headers.map(() => '---');
    const rows = filteredMerchants.map((m) => {
      const rStats = getMerchantRadarStats(m);
      return [
        sanitizeMerchantAuditText(m.name, 'Unknown'),
        sanitizeMerchantAuditText(m.platform, 'shopee', 32).toUpperCase(),
        m.is_official ? 'Yes' : 'No',
        `${sanitizeMerchantScore100(m.trust_score)}/100`,
        hasReviewRiskEvidence(m.review_risk_breakdown)
          ? `${sanitizeMerchantScore100(m.review_risk_score)}/100`
          : labels.reviewRiskNoData,
        String(sanitizeMerchantCount(rStats.genuineDealCount)),
        String(sanitizeMerchantCount(rStats.fakeTrapCount)),
        String(sanitizeMerchantCount(m.review_risk_breakdown?.authentic_count)),
        String(sanitizeMerchantCount(m.product_count)),
      ];
    });
    const md = [
      `### 🛡️ Rate.vn Merchant Trust Directory (${filteredMerchants.length} merchants)`,
      '',
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');
    return md;
  };

  const handleCopyMerchantsMarkdown = async () => {
    if (typeof navigator === 'undefined' || matchedCount === 0) return;
    // The rows are fetched first, but Safari only lets the clipboard be written
    // during the click: hand it a promise via ClipboardItem so the write starts
    // inside the gesture. Browsers without ClipboardItem fall back to
    // writeText after the fetch.
    const markdown = fetchAllMatching().then(buildMerchantsMarkdown);
    // Handled below through the clipboard call; this only keeps an early
    // clipboard refusal from leaving the promise unobserved.
    markdown.catch(() => {});
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': markdown.then(
              (md) => new Blob([md], { type: 'text/plain' })
            ),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await markdown);
      }
      setCopiedMerchantsMd(true);
      setTimeout(() => setCopiedMerchantsMd(false), 2500);
    } catch {
      // Clipboard refused or fetch failed: nothing was copied.
    }
  };

  const handleDownloadMerchantsCsv = async () => {
    if (typeof document === 'undefined' || matchedCount === 0) return;
    let filteredMerchants: MerchantSummary[];
    try {
      filteredMerchants = await fetchAllMatching();
    } catch {
      return;
    }
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
      const ignoredReviews =
        sanitizeMerchantCount(m.review_risk_breakdown?.coin_spam_count) +
        sanitizeMerchantCount(m.review_risk_breakdown?.seeding_fake_count);
      return [
        sanitizeMerchantAuditText(m.id, '', 120),
        sanitizeMerchantAuditText(m.name, 'Unknown'),
        sanitizeMerchantAuditText(m.platform, 'shopee', 32),
        sanitizeMerchantAuditText(m.platform_shop_id, '', 80),
        m.is_official ? 'true' : 'false',
        String(sanitizeMerchantScore100(m.trust_score)),
        // Empty without analysed reviews (DOS/Rate#1258).
        hasReviewRiskEvidence(m.review_risk_breakdown)
          ? String(sanitizeMerchantScore100(m.review_risk_score))
          : '',
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
    let filteredMerchants: MerchantSummary[];
    try {
      filteredMerchants = await fetchAllMatching();
    } catch {
      return;
    }
    const payload = {
      source: 'Rate.vn Merchant Trust Directory',
      exportedAt: new Date().toISOString(),
      merchantCount: filteredMerchants.length,
      merchants: filteredMerchants.map((m) => ({
        ...m,
        // Null without analysed reviews (DOS/Rate#1258).
        review_risk_score: reviewRiskScoreOrNull(m),
        dealRadarStats: getMerchantRadarStats(m),
      })),
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
              <BsShop className="text-primary" />
              {summaryStats.total}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.officialMalls}</div>
            <div className="fs-4 fw-bold text-success d-flex align-items-center gap-2">
              <BsCheckCircleFill />
              {summaryStats.official}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.highTrustShops}</div>
            <div className="fs-4 fw-bold text-primary d-flex align-items-center gap-2">
              <BsShieldCheck />
              {summaryStats.safe}
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
            <div className="text-muted small">{labels.avgTrustScore}</div>
            {/* No store with a trust score: no average (DOS/Rate#1484). */}
            {summaryStats.avgTrust == null ? (
              <div className="fs-6 text-muted">{labels.reviewRiskNoData}</div>
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
                <BsSearch />
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
                <BsFunnel className="me-1" /> {labels.riskFilterLabel}
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
                <BsSortDown className="me-1" /> {labels.sortLabel}
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
              <BsCheckCircleFill />
              {labels.officialMallOnly}
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
              <strong className="text-dark">{matchedCount}</strong>{' '}
              {labels.ofCount} {summary.total} {labels.merchantsUnit}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-sm btn-link text-danger text-decoration-none d-inline-flex align-items-center gap-1 p-0"
              >
                <BsArrowCounterclockwise />
                {labels.resetFilters}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {matchedCount === 0 ? (
        <div className="card rounded-4 border bg-white p-5 text-center shadow-sm">
          <div className="mb-3">
            <BsShieldExclamation className="fs-1 text-warning" />
          </div>
          <h3 className="h5 fw-bold mb-2">{labels.emptyTitle}</h3>
          <p
            className="text-muted small mx-auto mb-4"
            style={{ maxWidth: 520 }}
          >
            {labels.emptySubtitle}
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
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
            {visibleMerchants.map((merchant) => {
              const dosafeScore = knownDosafeRiskScore(merchant);
              const trustScore = merchant.trust_score;
              const trustBadgeClass =
                trustScore == null
                  ? 'bg-light text-muted border'
                  : trustScore >= 80
                    ? 'bg-success text-white'
                    : trustScore >= 50
                      ? 'bg-warning text-dark'
                      : 'bg-danger text-white';

              const minPriceText = merchant.min_price
                ? formatPriceVnd(merchant.min_price, locale)
                : null;
              const maxPriceText =
                merchant.max_price && merchant.max_price !== merchant.min_price
                  ? formatPriceVnd(merchant.max_price, locale)
                  : null;

              return (
                <div className="col-lg-6 col-12" key={merchant.id}>
                  <div className="rate-card rounded-4 d-flex flex-column h-100 p-md-4 border bg-white p-3 shadow-sm">
                    <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
                      <div
                        className="d-flex align-items-center gap-3"
                        style={{ minWidth: 0 }}
                      >
                        <div
                          className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold fs-4 flex-shrink-0"
                          style={{ width: '56px', height: '56px' }}
                        >
                          <BsShop />
                        </div>
                        <div>
                          <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                            <span className="badge bg-danger text-uppercase small">
                              {merchant.platform}
                            </span>
                            {merchant.is_official && (
                              <span className="badge bg-success-subtle text-success small d-inline-flex align-items-center gap-1">
                                <BsCheckCircleFill /> {labels.officialBadge}
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
                        >
                          {trustScore == null
                            ? t('trustBadgeNoData')
                            : t('trustBadge', { score: trustScore })}
                        </span>
                      </div>
                    </div>

                    {/* Shop quick metrics: one wrapping line, not three boxes,
                        so the card stays short on phones (DOS/Rate#635). */}
                    <ul className="list-unstyled d-flex small rate-tabular column-gap-3 row-gap-1 mb-3 flex-wrap">
                      <li className="d-flex align-items-center gap-1">
                        <BsStarFill
                          aria-hidden="true"
                          className="text-warning"
                        />
                        <span className="text-muted">
                          {labels.platformRating}:
                        </span>
                        <strong>
                          {merchant.rating_star
                            ? `${formatDecimal(merchant.rating_star, locale, 2)} / ${formatDecimal(5, locale, 1)}`
                            : labels.noRating}
                        </strong>
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
                            {dosafeScore == null ? (
                              // No DOSafe score: no number, and no alert (#1465).
                              <span className="badge rounded-pill bg-light text-muted border">
                                {labels.reviewRiskNoData}
                              </span>
                            ) : (
                              <span
                                className={`badge rounded-pill rate-tabular ${
                                  dosafeScore === 0
                                    ? 'bg-success-subtle text-success'
                                    : 'bg-danger-subtle text-danger'
                                }`}
                              >
                                {dosafeScore}/100
                              </span>
                            )}
                          </div>
                          {dosafeScore != null && (
                            <div
                              className="small text-muted d-none d-sm-block"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {dosafeScore === 0
                                ? labels.dosafeZero
                                : labels.dosafeAlert}
                            </div>
                          )}
                        </div>

                        <div className="col-sm-6 col-12">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="small text-muted fw-medium">
                              <BsRobot aria-hidden="true" className="me-1" />
                              {labels.riskReviewLabel}
                            </span>
                            {hasReviewRiskEvidence(
                              merchant.review_risk_breakdown
                            ) ? (
                              <span
                                className={`badge rounded-pill rate-tabular ${
                                  merchant.review_risk_score <= 15
                                    ? 'bg-success-subtle text-success'
                                    : merchant.review_risk_score <= 40
                                      ? 'bg-warning-subtle text-warning-emphasis'
                                      : 'bg-danger-subtle text-danger'
                                }`}
                              >
                                {merchant.review_risk_score}/100
                              </span>
                            ) : (
                              // No analysed reviews: no number (#1249).
                              <span className="badge rounded-pill bg-light text-muted border">
                                {labels.reviewRiskNoData}
                              </span>
                            )}
                          </div>
                          <div
                            className="small text-muted d-none d-sm-block"
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {merchant.review_risk_breakdown.total_reviews >
                            0 ? (
                              <>
                                {labels.authenticLabel}{' '}
                                <strong>
                                  {
                                    merchant.review_risk_breakdown
                                      .authentic_count
                                  }
                                </strong>
                                /{merchant.review_risk_breakdown.total_reviews}{' '}
                                (
                                {t('filteredSpamCount', {
                                  count:
                                    merchant.review_risk_breakdown
                                      .coin_spam_count +
                                    merchant.review_risk_breakdown
                                      .seeding_fake_count,
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

                    {minPriceText && (
                      <div className="small text-muted mb-2">
                        {labels.priceRangeLabel}{' '}
                        <strong className="text-dark rate-tabular">
                          {minPriceText}
                          {maxPriceText ? ` - ${maxPriceText}` : ''}
                        </strong>
                      </div>
                    )}

                    {(() => {
                      const rStats = getMerchantRadarStats(merchant);
                      return (
                        <div
                          className="d-flex align-items-center mb-3 flex-wrap gap-1"
                          data-testid="merchant-deal-radar-badge"
                        >
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
