'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/navigation';
import {
  getMasterProductCategorySlug,
  scoreMasterProductForLeaderboard,
  type CanonicalCategorySlug,
  type LeaderboardCriterionKey,
  type LeaderboardPriceSegment,
  type MasterProduct,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarResponse,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import { escapeCsvCell } from '@/lib/csv-safe';
import type { KeySpecs } from '@repo/shared-data';
import {
  BsArrowLeftRight,
  BsAwardFill,
  BsBatteryCharging,
  BsCameraFill,
  BsCheckCircleFill,
  BsCpu,
  BsDisplay,
  BsFolder2Open,
  BsFunnel,
  BsGem,
  BsLightningCharge,
  BsSearch,
  BsShieldCheck,
  BsSliders,
  BsStarFill,
  BsTrophy,
  BsTrophyFill,
} from 'react-icons/bs';

export type { LeaderboardCriterionKey, LeaderboardPriceSegment };

interface LeaderboardExplorerProps {
  readonly products: readonly MasterProduct[];
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
  readonly initialCategory?: CanonicalCategorySlug;
  readonly initialCriterion?: LeaderboardCriterionKey;
  readonly locale?: string;
}

interface RankedProductEntry {
  product: MasterProduct;
  categorySlug: CanonicalCategorySlug;
  categoryPath: string;
  productHref: string;
  thumbnail: string;
  userScore5: number;
  expertScore10: number | null;
  combinedScore5: number;
  authenticCount: number;
  ignoredCount: number;
  criteria: {
    screen: number;
    performance: number;
    camera: number;
    battery: number;
    value: number;
  };
  activeScore5: number;
}

type TranslateFn = ReturnType<typeof useTranslations<'leaderboard'>>;

function buildCategoryTabs(t: TranslateFn): ReadonlyArray<{
  slug: CanonicalCategorySlug;
  icon: string;
  label: string;
}> {
  return [
    {
      slug: 'smartphones',
      icon: '📱',
      label: t('tabSmartphones'),
    },
    {
      slug: 'tablets',
      icon: '📟',
      label: t('tabTablets'),
    },
    {
      slug: 'laptops',
      icon: '💻',
      label: t('tabLaptops'),
    },
    {
      slug: 'smartwatches',
      icon: '⌚',
      label: t('tabSmartwatches'),
    },
    {
      slug: 'earbuds',
      icon: '🎧',
      label: t('tabEarbuds'),
    },
  ];
}

function computeProductScores(
  item: MasterProduct,
  criterion: LeaderboardCriterionKey
): RankedProductEntry {
  const scored = scoreMasterProductForLeaderboard(item, criterion);
  return {
    product: scored.product,
    categorySlug: scored.categorySlug,
    categoryPath: scored.categoryPath,
    productHref: scored.productHref,
    thumbnail: scored.thumbnail,
    userScore5: scored.userScore5,
    expertScore10: scored.expertScore10,
    combinedScore5: scored.combinedScore5,
    authenticCount: scored.authenticReviewCount,
    ignoredCount: scored.filteredNoiseReviewCount,
    criteria: scored.criteria,
    activeScore5: scored.activeScore5,
  };
}

export default function LeaderboardExplorer({
  products,
  dealRadar,
  initialCategory = 'smartphones',
  initialCriterion = 'combined',
}: LeaderboardExplorerProps) {
  const t = useTranslations('leaderboard');
  const router = useRouter();

  const radarIndex = useDealRadarIndex(dealRadar);
  const categoryTabs = useMemo(() => buildCategoryTabs(t), [t]);

  const [activeCategory, setActiveCategory] =
    useState<CanonicalCategorySlug>(initialCategory);
  const [activeCriterion, setActiveCriterion] =
    useState<LeaderboardCriterionKey>(initialCriterion);
  const [priceSegment, setPriceSegment] =
    useState<LeaderboardPriceSegment>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePersona, setActivePersona] = useState<
    | 'none'
    | 'photography'
    | 'gaming'
    | 'endurance'
    | 'business'
    | 'value_hunter'
    | 'custom'
  >('none');
  const [showWeightSliders, setShowWeightSliders] = useState<boolean>(false);
  const [customWeights, setCustomWeights] = useState<{
    screen: number;
    performance: number;
    camera: number;
    battery: number;
    value: number;
  }>({
    screen: 20,
    performance: 20,
    camera: 20,
    battery: 20,
    value: 20,
  });

  const applyPersonaPreset = (
    persona:
      | 'none'
      | 'photography'
      | 'gaming'
      | 'endurance'
      | 'business'
      | 'value_hunter'
  ) => {
    setActivePersona(persona);
    if (persona === 'none') {
      setCustomWeights({
        screen: 20,
        performance: 20,
        camera: 20,
        battery: 20,
        value: 20,
      });
      return;
    }
    if (persona === 'photography') {
      setCustomWeights({
        screen: 25,
        performance: 15,
        camera: 45,
        battery: 10,
        value: 5,
      });
    } else if (persona === 'gaming') {
      setCustomWeights({
        screen: 25,
        performance: 45,
        camera: 5,
        battery: 20,
        value: 5,
      });
    } else if (persona === 'endurance') {
      setCustomWeights({
        screen: 15,
        performance: 15,
        camera: 10,
        battery: 45,
        value: 15,
      });
    } else if (persona === 'business') {
      setCustomWeights({
        screen: 30,
        performance: 25,
        camera: 10,
        battery: 25,
        value: 10,
      });
    } else if (persona === 'value_hunter') {
      setCustomWeights({
        screen: 15,
        performance: 20,
        camera: 10,
        battery: 15,
        value: 40,
      });
    }
  };

  const updateSingleWeight = (
    key: 'screen' | 'performance' | 'camera' | 'battery' | 'value',
    val: number
  ) => {
    setActivePersona('custom');
    setCustomWeights((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(100, val)),
    }));
  };

  const copy = useMemo(
    () => ({
      dirLabel: t('dirLabel'),
      chooseCategory: t('chooseCategory'),
      chooseCriterion: t('chooseCriterion'),
      personaTitle: t('personaTitle'),
      customizeWeightsBtn: t('customizeWeightsBtn'),
      personaLabels: {
        none: t('personaNone'),
        photography: t('personaPhotography'),
        gaming: t('personaGaming'),
        endurance: t('personaEndurance'),
        business: t('personaBusiness'),
        value_hunter: t('personaValueHunter'),
        custom: t('personaCustom'),
      },
      compareTop3Btn: t('compareTop3Btn'),
      searchPlaceholder: t('searchPlaceholder'),
      allBrands: t('allBrands'),
      priceAll: t('priceAll'),
      priceUnder15: t('priceUnder15'),
      price15to25: t('price15to25'),
      priceOver25: t('priceOver25'),
      podiumTitle: t('podiumTitle'),
      rank1Label: t('rank1Label'),
      rank2Label: t('rank2Label'),
      rank3Label: t('rank3Label'),
      fullTableTitle: t('fullTableTitle'),
      verifiedReviewsSuffix: t('verifiedReviewsSuffix'),
      blockedSpamSuffix: t('blockedSpamSuffix'),
      storesTrackedSuffix: t('storesTrackedSuffix'),
      viewAuditDetailBtn: t('viewAuditDetailBtn'),
      inspectBtn: t('inspectBtn'),
      critLabels: {
        combined: t('critCombined'),
        user: t('critUser'),
        expert: t('critExpert'),
        screen: t('critScreen'),
        performance: t('critPerformance'),
        camera: t('critCamera'),
        battery: t('critBattery'),
        value: t('critValue'),
      },
    }),
    [t]
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<CanonicalCategorySlug, number>();
    for (const p of products) {
      const cat = getMasterProductCategorySlug(p);
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const categoryProducts = useMemo(() => {
    return products.filter(
      (p) => getMasterProductCategorySlug(p) === activeCategory
    );
  }, [products, activeCategory]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const p of categoryProducts) {
      if (p.brand) brands.add(p.brand);
    }
    return Array.from(brands).sort();
  }, [categoryProducts]);

  const rankedEntries = useMemo(() => {
    const kw = searchQuery.trim().toLowerCase();

    const filtered = categoryProducts.filter((item) => {
      if (
        selectedBrand !== 'all' &&
        item.brand.toLowerCase() !== selectedBrand.toLowerCase()
      ) {
        return false;
      }
      const minPrice = Number(item.min_price || 0);
      if (priceSegment !== 'all') {
        if (minPrice <= 0) return false;
        if (priceSegment === 'under15m' && minPrice >= 15_000_000) return false;
        if (
          priceSegment === '15to25m' &&
          (minPrice < 15_000_000 || minPrice > 25_000_000)
        ) {
          return false;
        }
        if (priceSegment === 'over25m' && minPrice <= 25_000_000) return false;
      }

      if (kw) {
        const keySpecs = (item.key_specs || {}) as KeySpecs;
        const hay = [
          item.name,
          item.brand,
          item.model,
          item.slug,
          item.model_key,
          keySpecs.chip || '',
          keySpecs.screen || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    const totalWeight =
      customWeights.screen +
      customWeights.performance +
      customWeights.camera +
      customWeights.battery +
      customWeights.value;

    const scored = filtered
      .map((item) => {
        const base = computeProductScores(item, activeCriterion);
        if (activePersona !== 'none' && totalWeight > 0) {
          const weighted5 = Number(
            (
              (base.criteria.screen * customWeights.screen +
                base.criteria.performance * customWeights.performance +
                base.criteria.camera * customWeights.camera +
                base.criteria.battery * customWeights.battery +
                base.criteria.value * customWeights.value) /
              totalWeight
            ).toFixed(2)
          );
          return {
            ...base,
            activeScore5: weighted5,
          };
        }
        return base;
      })
      .filter((entry) => {
        if (activeCriterion === 'expert' && entry.expertScore10 == null) {
          return false;
        }
        if (activeCriterion === 'user' && entry.userScore5 <= 0) {
          return false;
        }
        return entry.activeScore5 > 0;
      });

    return scored.sort((a, b) => {
      if (b.activeScore5 !== a.activeScore5) {
        return b.activeScore5 - a.activeScore5;
      }
      if (b.combinedScore5 !== a.combinedScore5) {
        return b.combinedScore5 - a.combinedScore5;
      }
      if (b.authenticCount !== a.authenticCount) {
        return b.authenticCount - a.authenticCount;
      }
      const priceA = Number(a.product.min_price || 0);
      const priceB = Number(b.product.min_price || 0);
      if (priceA > 0 && priceB > 0 && priceA !== priceB) {
        return priceA - priceB;
      }
      if (priceA > 0 && priceB <= 0) {
        return -1;
      }
      if (priceA <= 0 && priceB > 0) {
        return 1;
      }
      return a.product.slug.localeCompare(b.product.slug);
    });
  }, [
    categoryProducts,
    selectedBrand,
    priceSegment,
    searchQuery,
    activeCriterion,
    activePersona,
    customWeights,
  ]);

  const top3Slugs = useMemo(
    () => rankedEntries.slice(0, 3).map((e) => e.product.slug),
    [rankedEntries]
  );

  const [copiedLeaderboardMd, setCopiedLeaderboardMd] = useState(false);
  const [versusSlugA, setVersusSlugA] = useState<string>('');
  const [versusSlugB, setVersusSlugB] = useState<string>('');

  const effectiveVersusA = useMemo(() => {
    if (
      versusSlugA &&
      rankedEntries.some((e) => e.product.slug === versusSlugA)
    ) {
      return versusSlugA;
    }
    return rankedEntries[0]?.product.slug ?? '';
  }, [versusSlugA, rankedEntries]);

  const effectiveVersusB = useMemo(() => {
    if (
      versusSlugB &&
      versusSlugB !== effectiveVersusA &&
      rankedEntries.some((e) => e.product.slug === versusSlugB)
    ) {
      return versusSlugB;
    }
    return (
      rankedEntries.find((e) => e.product.slug !== effectiveVersusA)?.product
        .slug ?? ''
    );
  }, [versusSlugB, effectiveVersusA, rankedEntries]);

  const handleCopyLeaderboardMarkdown = async () => {
    if (typeof navigator === 'undefined' || rankedEntries.length === 0) return;
    const headers = [
      'Rank',
      'Product',
      'Brand',
      'Active Score (/5.0)',
      'User Rating (/5.0)',
      'Expert Score (/10)',
      'Reference Price (VND)',
      'Deal Radar',
    ];
    const sep = headers.map(() => '---');
    const rows = rankedEntries.map((entry, idx) => {
      const radar = getRadarSignal(radarIndex, entry.product.slug);
      return [
        `#${idx + 1}`,
        entry.product.name.replace(/\|/g, '-'),
        entry.product.brand || '-',
        entry.activeScore5.toFixed(2),
        entry.userScore5 > 0 ? entry.userScore5.toFixed(1) : t('unratedShort'),
        entry.expertScore10 != null
          ? entry.expertScore10.toFixed(1)
          : t('unratedShort'),
        entry.product.min_price
          ? `${Number(entry.product.min_price).toLocaleString('vi-VN')} ₫`
          : '-',
        radarMarkdownCell(radar),
      ];
    });
    const md = [
      `### 🏆 Rate.vn JReviews Leaderboard (${activeCategory.toUpperCase()} - ${copy.critLabels[activeCriterion]})`,
      '',
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopiedLeaderboardMd(true);
      setTimeout(() => setCopiedLeaderboardMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadLeaderboardCsv = () => {
    if (typeof document === 'undefined' || rankedEntries.length === 0) return;
    const escapeCsv = escapeCsvCell;
    const headers = [
      'Rank',
      'Slug',
      'Name',
      'Brand',
      'Category',
      'ActiveScore5',
      'UserScore5',
      'ExpertScore10',
      'Screen5',
      'Performance5',
      'Camera5',
      'Battery5',
      'Value5',
      'MinPriceVND',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = rankedEntries.map((entry, idx) => {
      const radar = getRadarSignal(radarIndex, entry.product.slug);
      return [
        String(idx + 1),
        entry.product.slug,
        entry.product.name,
        entry.product.brand || '',
        entry.categorySlug,
        entry.activeScore5.toFixed(2),
        entry.userScore5 > 0 ? entry.userScore5.toFixed(1) : '',
        entry.expertScore10 != null ? entry.expertScore10.toFixed(1) : '',
        entry.criteria.screen > 0 ? entry.criteria.screen.toFixed(1) : '',
        entry.criteria.performance > 0
          ? entry.criteria.performance.toFixed(1)
          : '',
        entry.criteria.camera > 0 ? entry.criteria.camera.toFixed(1) : '',
        entry.criteria.battery > 0 ? entry.criteria.battery.toFixed(1) : '',
        entry.criteria.value > 0 ? entry.criteria.value.toFixed(1) : '',
        String(entry.product.min_price || 0),
        ...radarCsvCells(radar),
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
    a.download = `rate-leaderboard-${activeCategory}-${activeCriterion}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadLeaderboardJson = () => {
    if (typeof document === 'undefined' || rankedEntries.length === 0) return;
    const payload = {
      source: 'Rate.vn JReviews Leaderboard',
      category: activeCategory,
      criterion: activeCriterion,
      persona: activePersona,
      exportedAt: new Date().toISOString(),
      count: rankedEntries.length,
      items: rankedEntries.map((entry, idx) => ({
        rank: idx + 1,
        slug: entry.product.slug,
        name: entry.product.name,
        brand: entry.product.brand,
        activeScore5: entry.activeScore5,
        userScore5: entry.userScore5,
        expertScore10: entry.expertScore10,
        criteria: entry.criteria,
        minPriceVnd: Number(entry.product.min_price || 0),
        dealRadar: radarExportFields(
          getRadarSignal(radarIndex, entry.product.slug)
        ),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-leaderboard-${activeCategory}-${activeCriterion}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectCategory = (cat: CanonicalCategorySlug) => {
    setActiveCategory(cat);
    setSelectedBrand('all');
    router.replace(`/leaderboard?cat=${cat}&criterion=${activeCriterion}`, {
      scroll: false,
    });
  };

  const handleSelectCriterion = (crit: LeaderboardCriterionKey) => {
    setActiveCriterion(crit);
    router.replace(`/leaderboard?cat=${activeCategory}&criterion=${crit}`, {
      scroll: false,
    });
  };

  const criterionOptions: Array<{
    key: LeaderboardCriterionKey;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'combined',
      label: copy.critLabels.combined,
      icon: <BsTrophyFill className="text-warning" />,
    },
    {
      key: 'user',
      label: copy.critLabels.user,
      icon: <BsStarFill className="text-warning" />,
    },
    {
      key: 'expert',
      label: copy.critLabels.expert,
      icon: <BsShieldCheck className="text-primary" />,
    },
    {
      key: 'screen',
      label: copy.critLabels.screen,
      icon: <BsDisplay className="text-danger" />,
    },
    {
      key: 'performance',
      label: copy.critLabels.performance,
      icon: <BsCpu className="text-danger" />,
    },
    {
      key: 'camera',
      label: copy.critLabels.camera,
      icon: <BsCameraFill className="text-danger" />,
    },
    {
      key: 'battery',
      label: copy.critLabels.battery,
      icon: <BsBatteryCharging className="text-success" />,
    },
    {
      key: 'value',
      label: copy.critLabels.value,
      icon: <BsGem className="text-info" />,
    },
  ];

  return (
    <div>
      {/* 1. Directory -> 5-Category Hierarchy & Criterion Control Panel */}
      <div className="card rounded-4 mb-4 border bg-white p-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
          <div className="d-flex align-items-center flex-wrap gap-2">
            <span className="badge bg-dark rounded-pill px-3 py-2 text-white">
              <BsFolder2Open aria-hidden="true" className="me-1" />
              {copy.dirLabel}
            </span>
            <span className="small text-muted fw-semibold">
              {copy.chooseCategory}
            </span>
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyLeaderboardMarkdown}
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3 py-1"
              data-testid="copy-leaderboard-md-btn"
            >
              {copiedLeaderboardMd
                ? t('copiedLeaderboardMd')
                : t('copyLeaderboardMdBtn')}
            </button>
            <button
              type="button"
              onClick={handleDownloadLeaderboardCsv}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
              data-testid="download-leaderboard-csv-btn"
            >
              {t('exportCsvBtn')}
            </button>
            <button
              type="button"
              onClick={handleDownloadLeaderboardJson}
              className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
              data-testid="download-leaderboard-json-btn"
            >
              JSON
            </button>
            {top3Slugs.length >= 2 && (
              <Link
                href={`/compare?cat=${activeCategory}&slugs=${top3Slugs.join(',')}`}
                className="btn btn-sm btn-danger rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-1"
              >
                <BsArrowLeftRight />
                <span>{copy.compareTop3Btn}</span>
              </Link>
            )}
          </div>
        </div>

        {/* 5-Category Switcher Pills */}
        <div
          className="d-flex mb-4 flex-wrap gap-2"
          role="tablist"
          aria-label={t('categoryTabsAria')}
        >
          {categoryTabs.map((tab) => {
            const isSelected = tab.slug === activeCategory;
            const count = categoryCounts.get(tab.slug) ?? 0;
            return (
              <button
                key={tab.slug}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectCategory(tab.slug)}
                className={`btn rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-2 ${
                  isSelected
                    ? 'btn-danger text-white shadow-sm'
                    : 'btn-outline-dark bg-light'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`badge rounded-pill rate-tabular ${
                    isSelected
                      ? 'text-danger bg-white'
                      : 'bg-secondary bg-opacity-25 text-dark'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 8-Mode JReviews Ranking Criterion Selector */}
        <div className="mb-3">
          <div className="small text-muted fw-semibold mb-2">
            {copy.chooseCriterion}
          </div>
          <div className="d-flex flex-wrap gap-2">
            {criterionOptions.map((opt) => {
              const isSelected = opt.key === activeCriterion;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setActivePersona('none');
                    handleSelectCriterion(opt.key);
                  }}
                  className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2 ${
                    isSelected && activePersona === 'none'
                      ? 'btn-dark fw-semibold text-white shadow-sm'
                      : 'btn-outline-secondary text-dark bg-white'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Smart Use-Case Persona Recommender & Custom 5-Criteria Weight Sliders (Issue #52) */}
        <div className="border-top mb-3 pt-3">
          <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
            <div className="small text-muted fw-semibold">
              {copy.personaTitle}
            </div>
            <button
              type="button"
              onClick={() => setShowWeightSliders((v) => !v)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                showWeightSliders || activePersona === 'custom'
                  ? 'btn-primary fw-semibold text-white'
                  : 'btn-outline-primary'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              <BsSliders aria-hidden="true" className="me-1" />
              {copy.customizeWeightsBtn}
            </button>
          </div>

          <div className="d-flex flex-wrap gap-2">
            {(
              [
                'none',
                'photography',
                'gaming',
                'endurance',
                'business',
                'value_hunter',
              ] as const
            ).map((presetKey) => {
              const isSelected = activePersona === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => applyPersonaPreset(presetKey)}
                  className={`btn btn-sm rounded-pill px-3 py-1 ${
                    isSelected
                      ? 'btn-danger fw-semibold text-white shadow-sm'
                      : 'btn-outline-dark bg-light'
                  }`}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {copy.personaLabels[presetKey]}
                </button>
              );
            })}
          </div>

          {showWeightSliders && (
            <div className="rounded-3 bg-light mt-2 border p-3">
              <div className="row g-3">
                {(
                  [
                    { key: 'screen', label: copy.critLabels.screen },
                    { key: 'performance', label: copy.critLabels.performance },
                    { key: 'camera', label: copy.critLabels.camera },
                    { key: 'battery', label: copy.critLabels.battery },
                    { key: 'value', label: copy.critLabels.value },
                  ] as const
                ).map((slider) => (
                  <div key={slider.key} className="col-md-4 col-sm-6">
                    <div className="d-flex justify-content-between small fw-semibold mb-1">
                      <span>{slider.label}</span>
                      <span className="rate-tabular text-danger">
                        {customWeights[slider.key]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={customWeights[slider.key]}
                      onChange={(e) =>
                        updateSingleWeight(slider.key, Number(e.target.value))
                      }
                      className="form-range"
                      aria-label={slider.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search + Price Segment + Brand Filter Bar */}
        <div className="row g-2 border-top align-items-center pt-3">
          <div className="col-lg-5 col-md-12">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted">
                <BsSearch />
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="form-control bg-light border-start-0"
                aria-label={copy.searchPlaceholder}
              />
            </div>
          </div>

          <div className="col-lg-4 col-md-6">
            <div className="d-flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: copy.priceAll },
                  { id: 'under15m', label: copy.priceUnder15 },
                  { id: '15to25m', label: copy.price15to25 },
                  { id: 'over25m', label: copy.priceOver25 },
                ] as const
              ).map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setPriceSegment(seg.id)}
                  className={`btn btn-sm rounded-pill px-2 py-1 ${
                    priceSegment === seg.id
                      ? 'btn-danger fw-semibold text-white'
                      : 'btn-outline-secondary'
                  }`}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="col-lg-3 col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted">
                <BsFunnel className="me-1" /> {t('brandFilterLabel')}
              </span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="form-select"
                aria-label={t('brandFilterAria')}
              >
                <option value="all">{copy.allBrands}</option>
                {availableBrands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Interactive Same-Category 1v1 Matchup Picker (Issue #67) */}
        {rankedEntries.length >= 2 && (
          <div className="border-top mt-3 pt-3">
            <div className="row g-2 align-items-center">
              <div className="col-lg-4 col-md-12">
                <div className="small fw-semibold text-dark">
                  <BsLightningCharge aria-hidden="true" className="me-1" />
                  {t('quick1v1PickerLabel')}
                </div>
              </div>
              <div className="col-lg-3 col-md-5">
                <select
                  className="form-select form-select-sm"
                  value={effectiveVersusA}
                  onChange={(e) => setVersusSlugA(e.target.value)}
                  aria-label={t('selectDeviceAAria')}
                >
                  {rankedEntries.map((entry, idx) => (
                    <option key={entry.product.slug} value={entry.product.slug}>
                      #{idx + 1} {entry.product.name} (
                      {entry.activeScore5.toFixed(2)}★)
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 col-md-5">
                <select
                  className="form-select form-select-sm"
                  value={effectiveVersusB}
                  onChange={(e) => setVersusSlugB(e.target.value)}
                  aria-label={t('selectDeviceBAria')}
                >
                  {rankedEntries
                    .filter((e) => e.product.slug !== effectiveVersusA)
                    .map((entry) => {
                      const rankIdx = rankedEntries.findIndex(
                        (r) => r.product.slug === entry.product.slug
                      );
                      return (
                        <option
                          key={entry.product.slug}
                          value={entry.product.slug}
                        >
                          #{rankIdx + 1} {entry.product.name} (
                          {entry.activeScore5.toFixed(2)}★)
                        </option>
                      );
                    })}
                </select>
              </div>
              <div className="col-lg-2 col-md-2">
                {effectiveVersusA && effectiveVersusB && (
                  <Link
                    href={`/compare/${effectiveVersusA}-vs-${effectiveVersusB}`}
                    className="btn btn-sm btn-danger rounded-pill fw-bold w-100"
                    data-testid="leaderboard-1v1-go-btn"
                  >
                    <BsArrowLeftRight aria-hidden="true" className="me-1" />
                    {t('go1v1BattleBtn')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Top 3 Podium (.rate-scoreboard-dark) */}
      {rankedEntries.length > 0 && (
        <div className="rate-scoreboard-dark p-lg-5 mb-4 p-4">
          <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <BsTrophyFill className="text-warning fs-4" />
              <h2 className="h4 fw-bold mb-0 text-white">{copy.podiumTitle}</h2>
            </div>
            <span className="badge bg-warning text-dark rounded-pill fw-bold px-3 py-2">
              {copy.critLabels[activeCriterion]}
            </span>
          </div>

          <div className="row g-4 align-items-stretch">
            {rankedEntries.slice(0, 3).map((entry, idx) => {
              const rankBadgeStyle =
                idx === 0
                  ? {
                      background:
                        'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#0f172a',
                    }
                  : idx === 1
                    ? {
                        background:
                          'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
                        color: '#0f172a',
                      }
                    : {
                        background:
                          'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
                        color: '#ffffff',
                      };
              const rankLabel =
                idx === 0
                  ? copy.rank1Label
                  : idx === 1
                    ? copy.rank2Label
                    : copy.rank3Label;
              const keySpecs = (entry.product.key_specs || {}) as KeySpecs;
              const radarSignal = getRadarSignal(
                radarIndex,
                entry.product.slug
              );

              return (
                <div
                  key={entry.product.id}
                  className="col-lg-4 col-md-6 col-12"
                >
                  <div
                    className="rounded-4 d-flex flex-column justify-content-between h-100 p-4"
                    style={{
                      background:
                        idx === 0
                          ? 'rgba(245, 158, 11, 0.10)'
                          : 'rgba(255, 255, 255, 0.05)',
                      border:
                        idx === 0
                          ? '1.5px solid rgba(245, 158, 11, 0.55)'
                          : '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                  >
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
                        <span
                          className="badge rounded-pill fw-bold rate-tabular px-3 py-2"
                          style={rankBadgeStyle}
                        >
                          <BsTrophy aria-hidden="true" className="me-1" />
                          {rankLabel}
                        </span>
                        <div className="text-end">
                          <div className="fs-4 fw-bold text-warning rate-tabular lh-1">
                            {entry.activeScore5.toFixed(2)}
                            <span className="fs-6 text-white-50">/5.0</span>
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center mb-3 gap-3">
                        <Link
                          href={entry.productHref}
                          className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-white p-2"
                          style={{ width: 76, height: 76 }}
                        >
                          <img
                            src={entry.thumbnail}
                            alt={entry.product.name}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '64px',
                              objectFit: 'contain',
                            }}
                          />
                        </Link>
                        <div>
                          <div className="small text-white-50 text-uppercase fw-semibold">
                            {entry.product.brand}
                          </div>
                          <h3 className="h6 fw-bold mb-1 text-white">
                            <Link
                              href={entry.productHref}
                              className="text-decoration-none text-white"
                            >
                              {entry.product.name}
                            </Link>
                          </h3>
                          <div className="d-flex flex-wrap gap-1">
                            <span className="rate-score-badge-user">
                              ★{' '}
                              {entry.userScore5 > 0
                                ? `${entry.userScore5.toFixed(2)}/5.0`
                                : t('unratedShort')}
                            </span>
                            <span className="rate-score-badge-expert">
                              {entry.expertScore10 != null
                                ? `Expert ${entry.expertScore10.toFixed(1)}/10`
                                : t('expertUnrated')}
                            </span>
                            <RadarBadge
                              signal={radarSignal}
                              minSpreadPct={Infinity}
                              style={{ fontSize: '0.8125rem' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mini 5-Criteria Bars */}
                      <div
                        className="rounded-3 mb-3 p-2 px-3"
                        style={{ background: 'rgba(15, 23, 42, 0.55)' }}
                      >
                        {(
                          [
                            { key: 'screen', label: copy.critLabels.screen },
                            {
                              key: 'performance',
                              label: copy.critLabels.performance,
                            },
                            { key: 'camera', label: copy.critLabels.camera },
                            { key: 'battery', label: copy.critLabels.battery },
                            { key: 'value', label: copy.critLabels.value },
                          ] as const
                        ).map((c) => {
                          const val = entry.criteria[c.key];
                          const pct = Math.round((val / 5) * 100);
                          return (
                            <div key={c.key} className="mb-1 last:mb-0">
                              <div
                                className="d-flex justify-content-between text-white-50"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                <span>{c.label}</span>
                                <strong className="rate-tabular text-white">
                                  {val.toFixed(2)}
                                </strong>
                              </div>
                              <div
                                className="progress rounded-pill"
                                style={{
                                  height: 4,
                                  backgroundColor: 'rgba(255,255,255,0.12)',
                                }}
                              >
                                <div
                                  className="progress-bar bg-warning"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="d-flex mb-3 flex-wrap gap-1">
                        {keySpecs.chip && (
                          <span className="badge bg-dark border-secondary text-white-50 small border">
                            {keySpecs.chip}
                          </span>
                        )}
                        {keySpecs.ram && (
                          <span className="badge bg-dark border-secondary text-white-50 small rate-tabular border">
                            {keySpecs.ram}
                            {keySpecs.storage ? ` / ${keySpecs.storage}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-top border-secondary border-opacity-25 d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2">
                      <span className="small text-white-50 rate-tabular">
                        {Number(entry.product.min_price).toLocaleString(
                          'vi-VN'
                        )}{' '}
                        ₫
                      </span>
                      <Link
                        href={entry.productHref}
                        className="btn btn-sm btn-warning text-dark rounded-pill fw-semibold px-3"
                      >
                        {copy.viewAuditDetailBtn}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2.5. Top 1v1 Head-to-Head Battles among Current Leaderboard */}
      {rankedEntries.length >= 2 && (
        <div className="rate-card rounded-4 p-md-4 mb-4 border bg-white p-3 shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <div className="rate-eyebrow mb-1">{t('showdownsEyebrow')}</div>
              <h3 className="h6 fw-bold text-dark mb-0">
                {t('showdownsHeading')}
              </h3>
            </div>
            <Link
              href={`/compare?category=${activeCategory}&slugs=${encodeURIComponent(
                rankedEntries
                  .slice(0, 2)
                  .map((e: RankedProductEntry) => e.product.slug)
                  .join(',')
              )}`}
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
            >
              {t('openCompareMatrixBtn')}
            </Link>
          </div>

          <div className="row g-3">
            {(
              [
                [0, 1],
                [0, 2],
                [1, 2],
              ] as const
            )
              .filter(
                ([iA, iB]) =>
                  Boolean(rankedEntries[iA]) && Boolean(rankedEntries[iB])
              )
              .map(([iA, iB]) => {
                const a = rankedEntries[iA]!;
                const b = rankedEntries[iB]!;
                const vHref = `/compare/${a.product.slug}-vs-${b.product.slug}`;
                const delta = Math.abs(a.activeScore5 - b.activeScore5).toFixed(
                  2
                );
                return (
                  <div key={vHref} className="col-lg-4 col-md-6">
                    <div className="rounded-4 d-flex flex-column justify-content-between bg-light h-100 border p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-dark rounded-pill small text-white">
                          #{iA + 1} vs #{iB + 1}
                        </span>
                        <span className="badge bg-danger-subtle text-danger rounded-pill small rate-tabular">
                          Δ {delta} / 5.0
                        </span>
                      </div>

                      <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {a.product.name}
                          </div>
                          <div className="small text-secondary rate-tabular">
                            ★ {a.activeScore5.toFixed(2)}
                          </div>
                        </div>
                        <span className="badge bg-secondary rounded-pill flex-shrink-0">
                          VS
                        </span>
                        <div className="overflow-hidden text-end">
                          <div className="small fw-bold text-dark text-truncate">
                            {b.product.name}
                          </div>
                          <div className="small text-secondary rate-tabular">
                            ★ {b.activeScore5.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="border-top mt-2 pt-2 text-end">
                        <Link
                          href={vHref}
                          className="btn btn-sm btn-dark rounded-pill small fw-semibold w-100"
                        >
                          <BsArrowLeftRight className="me-1" />
                          {t('view1v1DeepBtn')}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. Full Ranked Leaderboard List (#1 .. #N) */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 className="h5 fw-bold text-dark d-flex align-items-center mb-0 gap-2">
          <BsAwardFill className="text-danger" />
          <span>
            {copy.fullTableTitle} ({rankedEntries.length})
          </span>
        </h3>
      </div>

      <div className="d-flex flex-column gap-3">
        {rankedEntries.map((entry, idx) => {
          const rank = idx + 1;
          const keySpecs = (entry.product.key_specs || {}) as KeySpecs;
          const minPriceText = Number(
            entry.product.min_price || 0
          ).toLocaleString('vi-VN');
          const rowRadarSignal = getRadarSignal(radarIndex, entry.product.slug);

          return (
            <div
              key={entry.product.id}
              className="rate-card rounded-4 p-md-4 border bg-white p-3 shadow-sm"
            >
              <div className="row g-3 align-items-center">
                {/* Rank + Image + Product Identity */}
                <div className="col-lg-5 col-md-12">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className={`rounded-circle d-flex align-items-center justify-content-center fw-bold rate-tabular flex-shrink-0 ${
                        rank === 1
                          ? 'bg-warning text-dark fs-5'
                          : rank <= 3
                            ? 'bg-dark fs-5 text-white'
                            : 'bg-light text-secondary border'
                      }`}
                      style={{ width: 44, height: 44 }}
                    >
                      #{rank}
                    </div>

                    <Link
                      href={entry.productHref}
                      className="bg-light rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 p-2"
                      style={{ width: 72, height: 72 }}
                    >
                      <img
                        src={entry.thumbnail}
                        alt={entry.product.name}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '58px',
                          objectFit: 'contain',
                        }}
                      />
                    </Link>

                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="d-flex align-items-center mb-1 flex-wrap gap-1">
                        <span className="badge bg-dark rounded-pill small text-white">
                          {entry.product.brand}
                        </span>
                        <span className="badge bg-success-subtle text-success rounded-pill small">
                          <BsCheckCircleFill className="me-1" />
                          {entry.authenticCount} {copy.verifiedReviewsSuffix}
                        </span>
                        {entry.ignoredCount > 0 && (
                          <span className="badge bg-danger-subtle text-danger rounded-pill small">
                            <BsShieldCheck
                              aria-hidden="true"
                              className="me-1"
                            />
                            {entry.ignoredCount} {copy.blockedSpamSuffix}
                          </span>
                        )}
                        <RadarBadge
                          signal={rowRadarSignal}
                          minSpreadPct={Infinity}
                        />
                      </div>

                      <h4 className="h6 fw-bold text-dark mb-1">
                        <Link
                          href={entry.productHref}
                          className="text-dark text-decoration-none"
                        >
                          {entry.product.name}
                        </Link>
                      </h4>

                      <div className="d-flex flex-wrap gap-1">
                        {keySpecs.chip && (
                          <span className="rate-spec-pill">
                            {keySpecs.chip}
                          </span>
                        )}
                        {keySpecs.ram && (
                          <span className="rate-spec-pill rate-tabular">
                            {keySpecs.ram}
                            {keySpecs.storage ? `/${keySpecs.storage}` : ''}
                          </span>
                        )}
                        {keySpecs.battery && (
                          <span className="rate-spec-pill rate-tabular">
                            {keySpecs.battery}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5-Criteria JReviews Breakdown */}
                <div className="col-lg-4 col-md-7">
                  <div className="rounded-3 bg-light border p-2 px-3">
                    <div className="d-flex mb-2 flex-wrap gap-2">
                      <span className="rate-score-badge-user">
                        <BsStarFill className="text-warning" />
                        <span>
                          {entry.userScore5 > 0
                            ? `User ${entry.userScore5.toFixed(2)}/5.0`
                            : t('userUnrated')}
                        </span>
                      </span>
                      <span className="rate-score-badge-expert">
                        <span>
                          {entry.expertScore10 != null
                            ? `Expert ${entry.expertScore10.toFixed(1)}/10`
                            : t('expertUnrated')}
                        </span>
                      </span>
                    </div>
                    <div className="row g-1 small">
                      {(
                        [
                          { key: 'screen', short: t('shortDisplay') },
                          { key: 'performance', short: t('shortPerf') },
                          { key: 'camera', short: t('shortCamAnc') },
                          { key: 'battery', short: t('shortBattery') },
                          { key: 'value', short: t('shortValue') },
                        ] as const
                      ).map((c) => (
                        <div
                          key={c.key}
                          className="d-flex justify-content-between col-6 pe-2"
                        >
                          <span
                            className="text-muted"
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {c.short}:
                          </span>
                          <strong
                            className={`rate-tabular ${
                              activeCriterion === c.key
                                ? 'text-danger'
                                : 'text-dark'
                            }`}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {entry.criteria[c.key] > 0
                              ? entry.criteria[c.key].toFixed(2)
                              : t('unratedShort')}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Active Criterion Score + Reference Price + Quick Actions */}
                <div className="col-lg-3 col-md-5 text-md-end">
                  <div className="d-flex flex-md-column justify-content-between align-items-center align-items-md-end gap-2">
                    <div>
                      <div className="small text-muted">
                        {copy.critLabels[activeCriterion]}
                      </div>
                      <div className="h4 fw-bold text-danger rate-tabular mb-0">
                        {entry.activeScore5.toFixed(2)}
                        <span className="fs-6 text-muted fw-normal">/5.0</span>
                      </div>
                      <div className="small text-secondary rate-tabular">
                        {minPriceText} ₫ ({entry.product.merchant_count || 0}{' '}
                        {copy.storesTrackedSuffix})
                      </div>
                    </div>

                    <div className="d-flex justify-content-md-end mt-1 flex-wrap gap-1">
                      <CompareQuickToggle
                        item={{
                          slug: entry.product.slug,
                          name: entry.product.name,
                          brand: entry.product.brand,
                          categoryPath: entry.categoryPath,
                          thumbnail: entry.thumbnail,
                          min_price: Number(entry.product.min_price || 0),
                        }}
                      />
                      <Link
                        href={entry.productHref}
                        className="btn btn-sm btn-primary rounded-pill fw-medium px-3"
                      >
                        {copy.viewAuditDetailBtn}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
