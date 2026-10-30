'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { IconType } from 'react-icons';
import { Link } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  normalizeLeaderboardCategory,
  normalizeLeaderboardCriterion,
  scoreMasterProductForLeaderboard,
  type CanonicalCategorySlug,
  type FilteredReviewCountsByMaster,
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
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import {
  BsArrowLeftRight,
  BsAwardFill,
  BsBatteryCharging,
  BsCameraFill,
  BsCheckCircleFill,
  BsCpu,
  BsDisplay,
  BsEarbuds,
  BsFolder2Open,
  BsFunnel,
  BsGem,
  BsLaptop,
  BsLightningCharge,
  BsPhone,
  BsSearch,
  BsShieldCheck,
  BsSliders,
  BsSmartwatch,
  BsStarFill,
  BsTablet,
  BsTrophy,
  BsTrophyFill,
} from 'react-icons/bs';
import ContentText from '@/components/elementary/ContentText';
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPriceVnd,
} from '@/lib/locale-format';

export type { LeaderboardCriterionKey, LeaderboardPriceSegment };

const LEADERBOARD_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeLeaderboardWeight(
  value: unknown,
  fallback = 0
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.max(0, Math.min(100, Math.round(Number(fallback) || 0)));
  }
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function sanitizeLeaderboardPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function formatLeaderboardPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  return formatPriceVnd(sanitizeLeaderboardPriceVnd(value), locale);
}

export function sanitizeLeaderboardMarkdownCell(
  value: unknown,
  fallback = '-'
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(LEADERBOARD_CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

export function sanitizeLeaderboardBarPercentage(score5: unknown): number {
  const num = Number(score5);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((num / 5) * 100)));
}

interface LeaderboardExplorerProps {
  readonly products: readonly MasterProduct[];
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
  readonly locale?: string;
  /** Stored reviews kept out of the rating, per master id (DOS/Rate#1139). */
  readonly filteredReviewCounts?: FilteredReviewCountsByMaster;
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
  icon: IconType;
  label: string;
}> {
  return [
    {
      slug: 'smartphones',
      icon: BsPhone,
      label: t('tabSmartphones'),
    },
    {
      slug: 'tablets',
      icon: BsTablet,
      label: t('tabTablets'),
    },
    {
      slug: 'laptops',
      icon: BsLaptop,
      label: t('tabLaptops'),
    },
    {
      slug: 'smartwatches',
      icon: BsSmartwatch,
      label: t('tabSmartwatches'),
    },
    {
      slug: 'earbuds',
      icon: BsEarbuds,
      label: t('tabEarbuds'),
    },
  ];
}

function computeProductScores(
  item: MasterProduct,
  criterion: LeaderboardCriterionKey,
  filteredReviewCounts?: FilteredReviewCountsByMaster
): RankedProductEntry {
  const scored = scoreMasterProductForLeaderboard(
    item,
    criterion,
    filteredReviewCounts
  );
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

/**
 * Reports the URL's ?cat= and ?criterion=. useSearchParams makes only this
 * empty component client-rendered (inside its Suspense boundary), so the
 * leaderboard itself stays in the cached server HTML.
 */
function TabFromUrl({
  onCategory,
  onCriterion,
}: {
  readonly onCategory: (cat: CanonicalCategorySlug) => void;
  readonly onCriterion: (crit: LeaderboardCriterionKey) => void;
}) {
  const searchParams = useSearchParams();
  // Normalized first, so the effects fire only when the effective tab
  // changes: a criterion click that writes ?cat=smartphones onto a plain
  // URL must not count as a category change (and reset the brand).
  const cat = normalizeLeaderboardCategory(searchParams.get('cat'));
  const crit = normalizeLeaderboardCriterion(searchParams.get('criterion'));
  useEffect(() => onCategory(cat), [cat, onCategory]);
  useEffect(() => onCriterion(crit), [crit, onCriterion]);
  return null;
}

export default function LeaderboardExplorer({
  products,
  dealRadar,
  filteredReviewCounts,
}: LeaderboardExplorerProps) {
  const t = useTranslations('leaderboard');
  const locale = useLocale();

  const radarIndex = useDealRadarIndex(dealRadar);
  const categoryTabs = useMemo(() => buildCategoryTabs(t), [t]);

  const [activeCategory, setActiveCategory] =
    useState<CanonicalCategorySlug>('smartphones');
  const [activeCriterion, setActiveCriterion] =
    useState<LeaderboardCriterionKey>('combined');

  // Keeps the tab in the URL without a server round trip; Next syncs its
  // router with the native history API.
  const replaceTabUrl = (
    cat: CanonicalCategorySlug,
    crit: LeaderboardCriterionKey
  ) => {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?cat=${cat}&criterion=${crit}`
    );
  };
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
      [key]: sanitizeLeaderboardWeight(val, prev[key]),
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
      priceSegmentAria: t('priceSegmentAria'),
      priceUnder15: t('priceUnder15'),
      price15to25: t('price15to25'),
      priceOver25: t('priceOver25'),
      podiumTitle: t('podiumTitle'),
      rank1Label: t('rank1Label'),
      rank2Label: t('rank2Label'),
      rank3Label: t('rank3Label'),
      fullTableTitle: t('fullTableTitle'),
      verifiedReviewsSuffix: t('verifiedReviewsSuffix'),
      storesTrackedSuffix: t('storesTrackedSuffix'),
      viewAuditDetailBtn: t('viewAuditDetailBtn'),
      inspectBtn: t('inspectBtn'),
      critLabels: {
        combined: t('critCombined'),
        user: t('critUser'),
        expert: t('critExpert'),
        screen: t('critScreen'),
        performance: t('critPerformance'),
        // Earbuds score noise cancelling here (DOS/Rate#1250).
        camera: activeCategory === 'earbuds' ? t('critAnc') : t('critCamera'),
        battery: t('critBattery'),
        value: t('critValue'),
      },
    }),
    [t, activeCategory]
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<CanonicalCategorySlug, number>();
    for (const p of products) {
      const cat = getMasterProductCategorySlug(p);
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [products]);

  // Rows read the category's view of a product, like the product page: no
  // RAM or storage pill for earbuds (DOS/Rate#1166).
  const categoryProducts = useMemo(() => {
    return products
      .filter((p) => getMasterProductCategorySlug(p) === activeCategory)
      .map((p) => applyCategorySpecTemplate(activeCategory, p));
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
      const minPrice = sanitizeLeaderboardPriceVnd(item.min_price);
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
        const base = computeProductScores(
          item,
          activeCriterion,
          filteredReviewCounts
        );
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
      const priceA = sanitizeLeaderboardPriceVnd(a.product.min_price);
      const priceB = sanitizeLeaderboardPriceVnd(b.product.min_price);
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
    filteredReviewCounts,
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
      'Price signal',
    ];
    const sep = headers.map(() => '---');
    const rows = rankedEntries.map((entry, idx) => {
      const radar = getRadarSignal(radarIndex, entry.product.slug);
      const safePrice = sanitizeLeaderboardPriceVnd(entry.product.min_price);
      return [
        `#${idx + 1}`,
        sanitizeLeaderboardMarkdownCell(entry.product.name),
        sanitizeLeaderboardMarkdownCell(entry.product.brand),
        entry.activeScore5.toFixed(2),
        entry.userScore5 > 0 ? entry.userScore5.toFixed(1) : t('unratedShort'),
        entry.expertScore10 != null
          ? entry.expertScore10.toFixed(1)
          : t('unratedShort'),
        safePrice > 0 ? formatLeaderboardPriceVnd(safePrice) : '-',
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
        String(sanitizeLeaderboardPriceVnd(entry.product.min_price)),
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
        minPriceVnd: sanitizeLeaderboardPriceVnd(entry.product.min_price),
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
    replaceTabUrl(cat, activeCriterion);
  };

  const handleSelectCriterion = (crit: LeaderboardCriterionKey) => {
    setActiveCriterion(crit);
    replaceTabUrl(activeCategory, crit);
  };

  // The page is cached with the default tab; TabFromUrl applies the URL's
  // ?cat= and ?criterion= on load and on every later navigation, including
  // a same-route link to plain /leaderboard (DOS/Rate#508).
  const applyUrlCategory = useCallback((cat: CanonicalCategorySlug) => {
    setActiveCategory(cat);
    setSelectedBrand('all');
  }, []);
  const applyUrlCriterion = useCallback((crit: LeaderboardCriterionKey) => {
    setActiveCriterion(crit);
  }, []);

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
      <Suspense fallback={null}>
        <TabFromUrl
          onCategory={applyUrlCategory}
          onCriterion={applyUrlCriterion}
        />
      </Suspense>
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

        {/* 5-Category Switcher Pills: single-select buttons, not tabs (no
            panels); the pressed one is exposed, not only its colour
            (DOS/Rate#1067). */}
        <div
          className="d-flex mb-4 flex-wrap gap-2"
          role="group"
          aria-label={t('categoryTabsAria')}
        >
          {categoryTabs.map((tab) => {
            const isSelected = tab.slug === activeCategory;
            const count = categoryCounts.get(tab.slug) ?? 0;
            return (
              <button
                key={tab.slug}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectCategory(tab.slug)}
                className={`btn rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-2 ${
                  isSelected
                    ? 'btn-danger text-white shadow-sm'
                    : 'btn-outline-dark bg-light'
                }`}
              >
                <tab.icon aria-hidden="true" />
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
          <div
            id="leaderboard-criterion-label"
            className="small text-muted fw-semibold mb-2"
          >
            {copy.chooseCriterion}
          </div>
          <div
            className="d-flex flex-wrap gap-2"
            role="group"
            aria-labelledby="leaderboard-criterion-label"
          >
            {criterionOptions.map((opt) => {
              const isSelected = opt.key === activeCriterion;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={isSelected && activePersona === 'none'}
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
            <div
              id="leaderboard-persona-label"
              className="small text-muted fw-semibold"
            >
              {copy.personaTitle}
            </div>
            <button
              type="button"
              aria-expanded={showWeightSliders}
              aria-controls="leaderboard-weight-sliders"
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
              {/* Custom weights select no persona pill and are shown only by
                  this button's colour, so its name says so too (#1067). */}
              {activePersona === 'custom' && (
                <span className="visually-hidden">
                  {`: ${copy.personaLabels.custom}`}
                </span>
              )}
            </button>
          </div>

          <div
            className="d-flex flex-wrap gap-2"
            role="group"
            aria-labelledby="leaderboard-persona-label"
          >
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
                  aria-pressed={isSelected}
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
            <div
              id="leaderboard-weight-sliders"
              className="rounded-3 bg-light mt-2 border p-3"
            >
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
                        {formatPercent(customWeights[slider.key], locale)}
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
            <div
              className="d-flex flex-wrap gap-1"
              role="group"
              aria-label={copy.priceSegmentAria}
            >
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
                  aria-pressed={priceSegment === seg.id}
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
                      {formatDecimal(entry.activeScore5, locale, 2)}★)
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
                          {formatDecimal(entry.activeScore5, locale, 2)}★)
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
                            {formatDecimal(entry.activeScore5, locale, 2)}
                            <span className="fs-6 text-white-50">
                              /{formatDecimal(5, locale, 1)}
                            </span>
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
                            loading="lazy"
                            decoding="async"
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
                                ? `${formatDecimal(entry.userScore5, locale, 2)}/${formatDecimal(5, locale, 1)}`
                                : t('unratedShort')}
                            </span>
                            <span className="rate-score-badge-expert">
                              {entry.expertScore10 != null
                                ? t('expertScoreShort', {
                                    score: formatDecimal(
                                      entry.expertScore10,
                                      locale,
                                      1
                                    ),
                                  })
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
                          const pct = sanitizeLeaderboardBarPercentage(val);
                          return (
                            <div key={c.key} className="mb-1 last:mb-0">
                              <div
                                className="d-flex justify-content-between text-white-50"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                <span>{c.label}</span>
                                <strong className="rate-tabular text-white">
                                  {formatDecimal(val, locale, 2)}
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
                            <ContentText text={keySpecs.chip} locale={locale} />
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
                        {formatLeaderboardPriceVnd(
                          entry.product.min_price,
                          locale
                        )}
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
                const delta = formatDecimal(
                  Math.abs(a.activeScore5 - b.activeScore5),
                  locale,
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
                          Δ {delta} / {formatDecimal(5, locale, 1)}
                        </span>
                      </div>

                      <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {a.product.name}
                          </div>
                          <div className="small text-secondary rate-tabular">
                            ★ {formatDecimal(a.activeScore5, locale, 2)}
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
                            ★ {formatDecimal(b.activeScore5, locale, 2)}
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
          const safeRowPrice = sanitizeLeaderboardPriceVnd(
            entry.product.min_price
          );
          const minPriceText = formatNumber(safeRowPrice, locale);
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
                        loading="lazy"
                        decoding="async"
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
                            {t('blockedSpamCount', {
                              count: entry.ignoredCount,
                            })}
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
                            <ContentText text={keySpecs.chip} locale={locale} />
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
                            <ContentText
                              text={keySpecs.battery}
                              locale={locale}
                            />
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
                            ? t('userScoreShort', {
                                score: formatDecimal(
                                  entry.userScore5,
                                  locale,
                                  2
                                ),
                              })
                            : t('userUnrated')}
                        </span>
                      </span>
                      <span className="rate-score-badge-expert">
                        <span>
                          {entry.expertScore10 != null
                            ? t('expertScoreShort', {
                                score: formatDecimal(
                                  entry.expertScore10,
                                  locale,
                                  1
                                ),
                              })
                            : t('expertUnrated')}
                        </span>
                      </span>
                    </div>
                    <div className="row g-1 small">
                      {(
                        [
                          { key: 'screen', short: t('shortDisplay') },
                          { key: 'performance', short: t('shortPerf') },
                          {
                            key: 'camera',
                            // Earbuds score noise cancelling here, the
                            // others their cameras (DOS/Rate#1250).
                            short:
                              activeCategory === 'earbuds'
                                ? t('shortAnc')
                                : t('shortCamera'),
                          },
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
                              ? formatDecimal(entry.criteria[c.key], locale, 2)
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
                        {formatDecimal(entry.activeScore5, locale, 2)}
                        <span className="fs-6 text-muted fw-normal">
                          /{formatDecimal(5, locale, 1)}
                        </span>
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
                          min_price: safeRowPrice,
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
