'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BsArrowLeftRight,
  BsExclamationTriangle,
  BsGraphDownArrow,
} from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@repo/shared-data';
import {
  type CanonicalCategorySlug,
  getMasterProductCategorySlug,
} from '@/lib/rate-domain';
import {
  scoreMasterProductForLeaderboard,
  type ScoredLeaderboardItem,
} from '@/lib/leaderboard-engine';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarItem,
  type CrossPlatformDealRadarResponse,
  type CrossPlatformPriceSpreadItem,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';

interface DealFinderWorkspaceProps {
  readonly products: MasterProduct[];
  readonly initialCategory?: CanonicalCategorySlug | 'all';
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
}

// Ranked deals render in pages so a 100-product catalogue is not one
// 30,000px column on phones (DOS/Rate#633).
const DEALS_PAGE_SIZE = 12;

type PersonaKey =
  'default' | 'value_hunter' | 'photography' | 'gaming' | 'endurance';

export default function DealFinderWorkspace({
  products,
  initialCategory = 'all',
  dealRadar = null,
}: DealFinderWorkspaceProps) {
  const t = useTranslations('deals');
  const [categoryFilter, setCategoryFilter] = useState<
    CanonicalCategorySlug | 'all'
  >(initialCategory);
  const [persona, setPersona] = useState<PersonaKey>('value_hunter');
  const [maxBudgetVnd, setMaxBudgetVnd] = useState<number>(65_000_000);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [copiedRadarMd, setCopiedRadarMd] = useState<boolean>(false);
  const radarIndex = useDealRadarIndex(dealRadar);
  // Paging restarts whenever a filter changes the ranking.
  const filterKey = `${categoryFilter}|${persona}|${maxBudgetVnd}|${searchQuery}`;
  const [paging, setPaging] = useState({
    key: filterKey,
    count: DEALS_PAGE_SIZE,
  });
  const visibleCount =
    paging.key === filterKey ? paging.count : DEALS_PAGE_SIZE;
  // After "show more", focus the first new card's link so keyboard and
  // screen-reader users land on the new results (the button may be gone).
  const focusCardIndex = useRef<number | null>(null);
  useEffect(() => {
    const index = focusCardIndex.current;
    if (index === null) return;
    focusCardIndex.current = null;
    document
      .querySelectorAll<HTMLElement>('#rate-ranked-deals > div')
      [index]?.querySelector<HTMLElement>('a[href]')
      ?.focus();
  }, [visibleCount]);

  const categoryOptions: Array<{
    slug: CanonicalCategorySlug | 'all';
    label: string;
  }> = [
    { slug: 'all', label: t('catAll') },
    { slug: 'smartphones', label: t('catSmartphones') },
    { slug: 'tablets', label: t('catTablets') },
    { slug: 'laptops', label: t('catLaptops') },
    { slug: 'smartwatches', label: t('catSmartwatches') },
    { slug: 'earbuds', label: t('catEarbuds') },
  ];

  const personaOptions: Array<{
    key: PersonaKey;
    label: string;
  }> = [
    { key: 'value_hunter', label: t('personaValueHunter') },
    { key: 'default', label: t('personaDefault') },
    { key: 'photography', label: t('personaPhotography') },
    { key: 'gaming', label: t('personaGaming') },
    { key: 'endurance', label: t('personaEndurance') },
  ];

  const filteredGenuineDeals = useMemo<CrossPlatformDealRadarItem[]>(() => {
    if (!dealRadar) return [];
    return dealRadar.genuineDeals.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const filteredFakeSaleTraps = useMemo<CrossPlatformDealRadarItem[]>(() => {
    if (!dealRadar) return [];
    return dealRadar.fakeSaleTraps.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const filteredPriceSpreadLeaders = useMemo<
    CrossPlatformPriceSpreadItem[]
  >(() => {
    if (!dealRadar || !Array.isArray(dealRadar.priceSpreadLeaders)) return [];
    return dealRadar.priceSpreadLeaders.filter(
      (item) => categoryFilter === 'all' || item.categorySlug === categoryFilter
    );
  }, [dealRadar, categoryFilter]);

  const handleCopyRadarMarkdown = async () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    try {
      const lines = [
        t('radarMdHeader'),
        t('radarMdMeta', {
          category: categoryFilter,
          clusters: dealRadar.totalClustersAnalyzed,
          offers: dealRadar.totalOffersAnalyzed,
        }),
        '',
        t('radarMdGenuineTitle'),
        t('radarMdGenuineTableHead'),
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredGenuineDeals.map(
          (g) =>
            `| ${g.productName} | ${g.platform.toUpperCase()} (${g.merchantName}) | **${g.priceCurrent.toLocaleString('vi-VN')} ₫** | ${g.marketMedianPrice.toLocaleString('vi-VN')} ₫ | -${g.savingsVsMedianVnd.toLocaleString('vi-VN')} ₫ (-${g.savingsVsMedianPct}%) | ${g.jreviewsScore10 != null ? `${g.jreviewsScore10.toFixed(1)}/10` : t('noScore')} |`
        ),
        '',
        t('radarMdFakeTitle'),
        t('radarMdFakeTableHead'),
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredFakeSaleTraps.map(
          (trap) =>
            `| ${trap.productName} | ${trap.platform.toUpperCase()} (${trap.merchantName}) | ${trap.priceCurrent.toLocaleString('vi-VN')} ₫ | ${(trap.priceOriginal || trap.priceCurrent).toLocaleString('vi-VN')} ₫ | ${trap.marketMedianPrice.toLocaleString('vi-VN')} ₫ | **+${trap.fakeMarkupPct}%** |`
        ),
        '',
        t('radarMdSpreadTitle'),
        t('radarMdSpreadTableHead'),
        '| --- | --- | --- | --- | --- | --- |',
        ...filteredPriceSpreadLeaders.map(
          (s) =>
            `| ${s.productName} | ${s.cheapestPlatform.toUpperCase()} (${s.cheapestMerchantName}) | ${s.priciestPlatform.toUpperCase()} (${s.priciestMerchantName}) | **${s.minPrice.toLocaleString('vi-VN')} ₫** | ${s.maxPrice.toLocaleString('vi-VN')} ₫ | **-${s.spreadVnd.toLocaleString('vi-VN')} ₫ (${s.spreadPct}%)** |`
        ),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedRadarMd(true);
      setTimeout(() => setCopiedRadarMd(false), 2200);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleDownloadRadarCsv = () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      'Verdict',
      'Device',
      'Brand',
      'Category',
      'Platform',
      'Merchant',
      'Official Mall',
      'Current Price (VND)',
      'Claimed Original Price (VND)',
      '10-Platform Median (VND)',
      'Savings vs Median (%)',
      'Fake Markup (%)',
      'JReviews Score (/10)',
    ];
    const allItems = [...filteredGenuineDeals, ...filteredFakeSaleTraps];
    const rows = [
      ...allItems.map((it) => [
        it.verdict,
        it.productName,
        it.brand,
        it.categorySlug,
        it.platform,
        it.merchantName,
        it.isOfficialMall ? 'Mall' : 'Standard',
        it.priceCurrent,
        it.priceOriginal ?? it.priceCurrent,
        it.marketMedianPrice,
        it.savingsVsMedianPct,
        it.fakeMarkupPct,
        it.jreviewsScore10 != null ? it.jreviewsScore10.toFixed(1) : '',
      ]),
      ...filteredPriceSpreadLeaders.map((sp) => [
        'price_spread_leader',
        sp.productName,
        sp.brand,
        sp.categorySlug,
        `${sp.cheapestPlatform} vs ${sp.priciestPlatform}`,
        sp.cheapestMerchantName,
        'Verified',
        sp.minPrice,
        sp.maxPrice,
        sp.medianPrice,
        sp.spreadPct,
        0,
        '-',
      ]),
    ];
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deal-radar-${categoryFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadRadarJson = () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    const payload = {
      source: 'Rate.vn 10-Platform Deal & Fake-Sale Anomaly Radar',
      categoryFilter,
      exportedAt: new Date().toISOString(),
      totalClustersAnalyzed: dealRadar.totalClustersAnalyzed,
      totalOffersAnalyzed: dealRadar.totalOffersAnalyzed,
      genuineDeals: filteredGenuineDeals,
      fakeSaleTraps: filteredFakeSaleTraps,
      priceSpreadLeaders: filteredPriceSpreadLeaders,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deal-radar-${categoryFilter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rankedDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const scored: Array<
      Omit<ScoredLeaderboardItem, 'rank'> & {
        personaScore5: number;
        spreadSavingsVnd: number;
        costPerPointVnd: number;
      }
    > = [];

    for (const p of products) {
      const cat = getMasterProductCategorySlug(p);
      if (categoryFilter !== 'all' && cat !== categoryFilter) continue;
      const minP = Number(p.min_price || 0);
      if (minP <= 0 || minP > maxBudgetVnd) continue;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.brand.toLowerCase().includes(q)
      ) {
        continue;
      }

      const item = scoreMasterProductForLeaderboard(p);
      const c = item.criteria;
      let personaScore5 = item.combinedScore5;
      if (persona === 'value_hunter') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.45 + c.value * 0.55).toFixed(2)
        );
      } else if (persona === 'photography') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.camera * 0.6).toFixed(2)
        );
      } else if (persona === 'gaming') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.performance * 0.6).toFixed(2)
        );
      } else if (persona === 'endurance') {
        personaScore5 = Number(
          (item.combinedScore5 * 0.4 + c.battery * 0.6).toFixed(2)
        );
      }

      const maxP = Number(p.max_price || minP);
      const spreadSavingsVnd = Math.max(0, maxP - minP);
      const combinedScore10 = item.combinedScore5 * 2;
      const costPerPointVnd =
        combinedScore10 > 0 ? Math.round(minP / combinedScore10) : minP;

      scored.push({
        ...item,
        personaScore5,
        spreadSavingsVnd,
        costPerPointVnd,
      });
    }

    scored.sort((a, b) => {
      if (b.personaScore5 !== a.personaScore5) {
        return b.personaScore5 - a.personaScore5;
      }
      return a.minPrice - b.minPrice;
    });

    return scored.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }, [products, categoryFilter, persona, maxBudgetVnd, searchQuery]);

  const handleCopyDealsMarkdown = async () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    try {
      const lines = [
        t('dealsMdHeader', { count: rankedDeals.length }),
        t('dealsMdBudgetLine', {
          budget: maxBudgetVnd.toLocaleString('vi-VN'),
          persona,
        }),
        t('dealsMdUrlLine', { url: window.location.href }),
        '',
        t('dealsMdTableHead'),
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rankedDeals
          .slice(0, 20)
          .map(
            (d) =>
              `| #${d.rank} | ${d.name} | ${d.brand} | **${d.personaScore5 > 0 ? `${d.personaScore5.toFixed(2)}/5.0` : t('noScore')}** | ★ ${d.userScore5 > 0 ? d.userScore5.toFixed(1) : t('noScore')} (${d.expertScore10 != null ? `Lab ${d.expertScore10.toFixed(1)}/10` : t('labNoScore')}) | **${d.minPrice.toLocaleString('vi-VN')} ₫** | ${d.spreadSavingsVnd > 0 ? `-${d.spreadSavingsVnd.toLocaleString('vi-VN')} ₫` : t('samePrice')} | ${radarMarkdownCell(getRadarSignal(radarIndex, d.slug))} |`
          ),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadDealsCsv = () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      'Rank',
      'Device',
      'Brand',
      'Category',
      'Persona Score (/5.0)',
      'User Score (/5.0)',
      'Expert Score (/10)',
      'Lowest Price (VND)',
      'Spread Savings (VND)',
      'Cost / JReviews Point (VND)',
      'URL',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = rankedDeals.map((d) => [
      d.rank,
      d.name,
      d.brand,
      d.categorySlug,
      d.personaScore5 > 0 ? d.personaScore5.toFixed(2) : '',
      d.userScore5 > 0 ? d.userScore5.toFixed(2) : '',
      d.expertScore10 != null ? d.expertScore10.toFixed(1) : '',
      d.minPrice,
      d.spreadSavingsVnd,
      d.costPerPointVnd,
      `${window.location.origin}${d.productHref}`,
      ...radarCsvCells(getRadarSignal(radarIndex, d.slug)),
    ]);
    const csvContent = `\uFEFF${[
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deals-${categoryFilter}-${persona}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDealsJson = () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    const payload = {
      source: 'Rate.vn Verified Deal Finder',
      categoryFilter,
      persona,
      maxBudgetVnd,
      exportedAt: new Date().toISOString(),
      dealCount: rankedDeals.length,
      deals: rankedDeals.map((d) => ({
        rank: d.rank,
        slug: d.slug,
        name: d.name,
        brand: d.brand,
        category: d.categorySlug,
        dealRadar: radarExportFields(getRadarSignal(radarIndex, d.slug)),
        personaScore5: d.personaScore5,
        userScore5: d.userScore5,
        expertScore10: d.expertScore10,
        minPriceVnd: d.minPrice,
        spreadSavingsVnd: d.spreadSavingsVnd,
        costPerPointVnd: d.costPerPointVnd,
        href: d.productHref,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-deals-${categoryFilter}-${persona}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Filter & Export Control Card */}
      <div className="rate-card p-md-4 mb-4 p-3">
        <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
          <div>
            <span className="badge bg-danger rounded-pill me-2 text-white">
              {t('filterBadge')}
            </span>
            <strong className="text-dark">
              {t('showingCount', {
                visible: Math.min(visibleCount, rankedDeals.length),
                count: rankedDeals.length,
              })}
            </strong>
          </div>
          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyDealsMarkdown}
              data-testid="deals-copy-md-btn"
              className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
            >
              {copiedMarkdown ? t('copiedMdBtn') : t('copyMdBtn')}
            </button>
            <button
              type="button"
              onClick={handleDownloadDealsCsv}
              data-testid="deals-export-csv-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              {t('exportCsvBtn', { count: rankedDeals.length })}
            </button>
            <button
              type="button"
              onClick={handleDownloadDealsJson}
              data-testid="deals-export-json-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              {t('exportJsonBtn', { count: rankedDeals.length })}
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
          <span className="small text-secondary fw-semibold me-1">
            {t('categoryLabel')}
          </span>
          {categoryOptions.map((opt) => (
            <button
              key={opt.slug}
              type="button"
              onClick={() => setCategoryFilter(opt.slug)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                categoryFilter === opt.slug
                  ? 'btn-dark fw-bold text-white'
                  : 'btn-light text-secondary border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Persona Pills */}
        <div
          id="rate-deal-personas"
          className="d-flex align-items-center mb-3 flex-wrap gap-2"
        >
          <span className="small text-secondary fw-semibold me-1">
            {t('personaLabel')}
          </span>
          {personaOptions.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={persona === p.key}
              onClick={() => setPersona(p.key)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                persona === p.key
                  ? 'btn-danger fw-bold text-white'
                  : 'btn-light text-secondary border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Budget Slider & Search */}
        <div className="row g-3 align-items-center">
          <div className="col-md-6">
            <div className="d-flex justify-content-between small mb-1">
              <span className="fw-semibold text-secondary">
                {t('maxBudgetLabel')}
              </span>
              <strong className="text-danger rate-tabular">
                ≤ {maxBudgetVnd.toLocaleString('vi-VN')} ₫
              </strong>
            </div>
            <input
              type="range"
              min={5_000_000}
              max={65_000_000}
              step={2_500_000}
              value={maxBudgetVnd}
              onChange={(e) => setMaxBudgetVnd(Number(e.target.value))}
              className="form-range"
              aria-label={t('maxBudgetAria')}
            />
          </div>
          <div className="col-md-6">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="form-control form-control-sm rounded-pill px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Live Cross-Platform Deal & Fake-Sale Trap Radar */}
      {dealRadar &&
        (filteredGenuineDeals.length > 0 ||
          filteredFakeSaleTraps.length > 0 ||
          filteredPriceSpreadLeaders.length > 0) && (
          <div
            className="rate-card p-md-4 mb-4 p-3"
            data-testid="cross-platform-deal-radar"
          >
            <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
              <h2 className="fs-6 lh-base fw-bold text-dark mb-0">
                <span className="badge bg-dark rounded-pill text-warning me-2">
                  {t('radarBannerBadge')}
                </span>
                {t('radarScannedSummary', {
                  offers: dealRadar.totalOffersAnalyzed,
                  clusters: dealRadar.totalClustersAnalyzed,
                })}
              </h2>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyRadarMarkdown}
                  data-testid="radar-copy-md-btn"
                  className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
                >
                  {copiedRadarMd ? t('copiedRadarMdBtn') : t('copyRadarMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRadarCsv}
                  data-testid="radar-export-csv-btn"
                  className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
                >
                  {t('exportRadarCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRadarJson}
                  data-testid="radar-export-json-btn"
                  className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
                >
                  {t('exportRadarJsonBtn')}
                </button>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-lg-6">
                <h3 className="rate-radar-list-title is-good">
                  <BsGraphDownArrow aria-hidden="true" />
                  {t('genuineDealsHeader', {
                    count: filteredGenuineDeals.length,
                  })}
                </h3>
                {filteredGenuineDeals.length > 0 ? (
                  <ul className="rate-radar-list">
                    {filteredGenuineDeals.slice(0, 6).map((g) => (
                      <li key={g.id}>
                        <div className="rate-radar-item-main">
                          <Link href={g.productHref} className="text-truncate">
                            {g.productName}
                          </Link>
                          <span className="rate-radar-item-meta text-truncate">
                            <span className="rate-radar-platform">
                              {g.platform}
                            </span>
                            {g.merchantName} ·{' '}
                            {t('medianPriceLabel', {
                              price:
                                g.marketMedianPrice.toLocaleString('vi-VN'),
                            })}
                          </span>
                        </div>
                        <div className="rate-radar-item-side">
                          <span className="rate-radar-price">
                            {g.priceCurrent.toLocaleString('vi-VN')} ₫
                          </span>
                          <span className="rate-radar-tag is-good">
                            {t('savingsVsMedianBadge', {
                              pct: g.savingsVsMedianPct,
                            })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rate-radar-empty">{t('radarNoGenuine')}</p>
                )}
              </div>

              <div className="col-lg-6">
                <h3 className="rate-radar-list-title is-bad">
                  <BsExclamationTriangle aria-hidden="true" />
                  {t('fakeTrapsHeader', {
                    count: filteredFakeSaleTraps.length,
                  })}
                </h3>
                {filteredFakeSaleTraps.length > 0 ? (
                  <ul className="rate-radar-list">
                    {filteredFakeSaleTraps.slice(0, 6).map((trap) => (
                      <li key={trap.id}>
                        <div className="rate-radar-item-main">
                          <Link
                            href={trap.productHref}
                            className="text-truncate"
                          >
                            {trap.productName}
                          </Link>
                          <span className="rate-radar-item-meta text-truncate">
                            <span className="rate-radar-platform">
                              {trap.platform}
                            </span>
                            {trap.merchantName} · {t('claimedOrigLabel')}{' '}
                            <s>
                              {(
                                trap.priceOriginal || trap.priceCurrent
                              ).toLocaleString('vi-VN')}{' '}
                              ₫
                            </s>
                          </span>
                        </div>
                        <div className="rate-radar-item-side">
                          <span className="rate-radar-price">
                            {trap.priceCurrent.toLocaleString('vi-VN')} ₫
                          </span>
                          <span className="rate-radar-tag is-bad">
                            {t('fakeMarkupBadge', { pct: trap.fakeMarkupPct })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rate-radar-empty">{t('radarNoTraps')}</p>
                )}
              </div>
            </div>

            {filteredPriceSpreadLeaders.length > 0 && (
              <div
                data-testid="deals-price-spread-leaders"
                className="rate-radar-spread"
              >
                <h3 className="rate-radar-list-title">
                  <BsArrowLeftRight aria-hidden="true" />
                  {t('spreadLeadersHeader', {
                    count: filteredPriceSpreadLeaders.length,
                  })}
                </h3>
                <div className="row g-2">
                  {filteredPriceSpreadLeaders.slice(0, 6).map((s) => (
                    <div key={s.id} className="col-lg-4 col-md-6">
                      <div className="rate-radar-spread-item">
                        <div className="rate-radar-item-main">
                          <Link href={s.productHref} className="text-truncate">
                            {s.productName}
                          </Link>
                          <span className="rate-radar-item-meta">
                            <span className="rate-radar-platform">
                              {s.cheapestPlatform}
                            </span>
                            ({s.minPrice.toLocaleString('vi-VN')} ₫) vs{' '}
                            <span className="rate-radar-platform">
                              {s.priciestPlatform}
                            </span>
                          </span>
                        </div>
                        <div className="rate-radar-item-side">
                          <span className="rate-radar-price">
                            -{s.spreadVnd.toLocaleString('vi-VN')} ₫
                          </span>
                          <span className="rate-radar-tag is-warn">
                            {t('spreadPctBadge', { pct: s.spreadPct })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Ranked Deals Grid */}
      {rankedDeals.length === 0 ? (
        <div className="rate-card p-5 text-center">
          <p className="text-secondary mb-3">
            {t('emptyBudgetText', {
              budget: maxBudgetVnd.toLocaleString('vi-VN'),
            })}
          </p>
          <button
            type="button"
            onClick={() => {
              setMaxBudgetVnd(65_000_000);
              setCategoryFilter('all');
              setSearchQuery('');
            }}
            className="btn btn-sm btn-dark rounded-pill px-4"
          >
            {t('resetBudgetBtn')}
          </button>
        </div>
      ) : (
        <>
          <div className="row g-3" id="rate-ranked-deals">
            {rankedDeals.slice(0, visibleCount).map((deal) => (
              <div key={deal.slug} className="col-lg-6">
                <div className="rate-card d-flex flex-column justify-content-between h-100 p-3">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        <span className="badge bg-dark rounded-pill text-white">
                          {t('rankDealBadge', { rank: deal.rank })}
                        </span>
                        <span className="rate-spec-pill">{deal.brand}</span>
                        <span className="rate-score-badge-user">
                          ★{' '}
                          {deal.personaScore5 > 0
                            ? `${deal.personaScore5.toFixed(2)}/5.0`
                            : t('noScore')}
                        </span>
                        <span className="rate-score-badge-expert">
                          {deal.expertScore10 != null
                            ? `Lab ${deal.expertScore10.toFixed(1)}/10`
                            : t('labNoScore')}
                        </span>
                        <RadarBadge
                          signal={getRadarSignal(radarIndex, deal.slug)}
                          minSpreadPct={Infinity}
                        />
                      </div>
                      {deal.spreadSavingsVnd > 0 && (
                        <span className="badge bg-success-subtle text-success rounded-pill rate-tabular">
                          {t('spreadSavingsBadge', {
                            amount:
                              deal.spreadSavingsVnd.toLocaleString('vi-VN'),
                          })}
                        </span>
                      )}
                    </div>

                    <div className="d-flex align-items-center my-2 gap-3">
                      <img
                        src={deal.thumbnail}
                        alt={deal.name}
                        className="rounded-3 flex-shrink-0 border bg-white p-1"
                        style={{ width: 64, height: 64, objectFit: 'contain' }}
                      />
                      <div className="overflow-hidden">
                        <Link
                          href={deal.productHref}
                          className="fw-bold text-dark text-decoration-none d-block text-truncate"
                        >
                          {deal.name}
                        </Link>
                        <div className="text-danger fw-bold rate-tabular mt-1">
                          {deal.minPrice.toLocaleString('vi-VN')} ₫{' '}
                          <span className="text-secondary small fw-normal">
                            {t('costPerPointSub', {
                              cost: deal.costPerPointVnd.toLocaleString(
                                'vi-VN'
                              ),
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top mt-2 flex-wrap gap-2 pt-2">
                    <CompareQuickToggle
                      item={{
                        slug: deal.slug,
                        name: deal.name,
                        brand: deal.brand,
                        thumbnail: deal.thumbnail,
                        min_price: deal.minPrice,
                        categoryPath: deal.categoryPath,
                      }}
                    />
                    <Link
                      href={deal.productHref}
                      className="btn btn-sm btn-dark rounded-pill fw-semibold px-3"
                    >
                      {t('audit10PlatformsLink')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rankedDeals.length > visibleCount && (
            <div className="mt-4 text-center">
              <button
                type="button"
                className="btn btn-outline-dark rounded-pill fw-semibold px-4"
                aria-controls="rate-ranked-deals"
                onClick={() => {
                  focusCardIndex.current = visibleCount;
                  setPaging({
                    key: filterKey,
                    count: visibleCount + DEALS_PAGE_SIZE,
                  });
                }}
              >
                {t('showMoreDeals', {
                  count: rankedDeals.length - visibleCount,
                })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
