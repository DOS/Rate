'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ContentText from '@/components/elementary/ContentText';
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
  MAX_VALID_VND_PRICE,
} from '@/lib/rate-domain';
import {
  displayedScore5,
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
  type RadarIndex,
  type RadarSignal,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  countSeasonalSaleCampaignDeals,
  matchesSeasonalSaleFilter,
  type SeasonalSaleFilterMode,
} from '@/lib/omnibus-price-audit';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  formatDecimal,
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';
import { formatScoreFixed } from '@/lib/rating-display';
import StarRating from '@/components/elementary/StarRating';

interface DealFinderWorkspaceProps {
  readonly products: MasterProduct[];
  readonly initialCategory?: CanonicalCategorySlug | 'all';
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
}

// Ranked deals render in pages so a 100-product catalogue is not one
// 30,000px column on phones (DOS/Rate#633).
const DEALS_PAGE_SIZE = 12;

export type PersonaKey =
  'default' | 'value_hunter' | 'photography' | 'gaming' | 'endurance';

function parseStrictDecimalVnd(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function sanitizeDealRadarPriceVnd(value: unknown): number | null {
  const raw = parseStrictDecimalVnd(value);
  if (raw == null || raw <= 0 || raw > MAX_VALID_VND_PRICE) return null;
  const rounded = Math.round(raw);
  return rounded > 0 && rounded <= MAX_VALID_VND_PRICE ? rounded : null;
}

export function resolveClaimedOriginalPriceVnd(
  priceOriginal: unknown,
  priceCurrent: unknown
): number | null {
  const safeCurrent = sanitizeDealRadarPriceVnd(priceCurrent);
  const safeOriginal = sanitizeDealRadarPriceVnd(priceOriginal);
  if (safeCurrent == null || safeOriginal == null) return null;
  return safeOriginal > safeCurrent ? safeOriginal : null;
}

export function formatDealRadarPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  const safe = sanitizeDealRadarPriceVnd(value);
  return safe != null ? formatPriceVnd(safe, locale) : '-';
}

export function sanitizeDealFinderBudgetVnd(value: unknown): number {
  const num = parseStrictDecimalVnd(value);
  if (num == null || num <= 0) return MAX_VALID_VND_PRICE;
  const rounded = Math.round(num);
  if (rounded <= 0) return MAX_VALID_VND_PRICE;
  return Math.min(MAX_VALID_VND_PRICE, rounded);
}

export function sanitizeDealFinderSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export function sanitizeDealFinderMarkdownCell(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const cleaned = value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || '-';
}

/** The criterion each persona leans on (see rankProductsForDealFinder). */
const PERSONA_LEAN: Record<
  Exclude<PersonaKey, 'default'>,
  'value' | 'camera' | 'performance' | 'battery'
> = {
  value_hunter: 'value',
  photography: 'camera',
  gaming: 'performance',
  endurance: 'battery',
};

/**
 * The personas worth offering (DOS/Rate#1556): the default one, and one whose
 * criterion some product in the category has a real score for. Without one,
 * the persona ranks exactly like the default.
 */
export function availableDealPersonas(
  products: readonly MasterProduct[],
  categoryFilter: CanonicalCategorySlug | 'all'
): PersonaKey[] {
  const scored = new Set<string>();
  if (Array.isArray(products)) {
    for (const p of products) {
      if (!p || typeof p !== 'object') continue;
      if (
        categoryFilter !== 'all' &&
        getMasterProductCategorySlug(p) !== categoryFilter
      ) {
        continue;
      }
      // A persona ranks, so it needs a score past the ranking threshold.
      const { rankCriteria } = scoreMasterProductForLeaderboard(p);
      for (const c of Object.values(PERSONA_LEAN)) {
        if ((rankCriteria[c] ?? 0) > 0) scored.add(c);
      }
    }
  }
  return [
    'default',
    ...(Object.keys(PERSONA_LEAN) as Exclude<PersonaKey, 'default'>[]).filter(
      (k) => scored.has(PERSONA_LEAN[k])
    ),
  ];
}

export function rankProductsForDealFinder(
  products: readonly MasterProduct[],
  options: {
    readonly categoryFilter: CanonicalCategorySlug | 'all';
    readonly persona: PersonaKey;
    readonly maxBudgetVnd: number;
    readonly searchQuery: string;
  }
) {
  const { categoryFilter, persona, maxBudgetVnd, searchQuery } = options;
  const safeBudget = sanitizeDealFinderBudgetVnd(maxBudgetVnd);
  const q = sanitizeDealFinderSearchQuery(searchQuery);
  const scored: Array<
    Omit<ScoredLeaderboardItem, 'rank'> & {
      personaScore5: number;
      spreadSavingsVnd: number;
      costPerPointVnd: number;
    }
  > = [];

  if (!Array.isArray(products)) return [];

  for (const p of products) {
    if (!p || typeof p !== 'object') continue;
    const cat = getMasterProductCategorySlug(p);
    if (categoryFilter !== 'all' && cat !== categoryFilter) continue;
    const rawMinP = parseStrictDecimalVnd(p.min_price);
    if (
      rawMinP == null ||
      rawMinP <= 0 ||
      rawMinP > MAX_VALID_VND_PRICE ||
      rawMinP > safeBudget
    ) {
      continue;
    }
    const minP = Math.round(rawMinP);
    if (minP <= 0 || minP > MAX_VALID_VND_PRICE) continue;
    const nameLower = typeof p.name === 'string' ? p.name.toLowerCase() : '';
    const brandLower = typeof p.brand === 'string' ? p.brand.toLowerCase() : '';
    if (q && !nameLower.includes(q) && !brandLower.includes(q)) {
      continue;
    }

    const item = scoreMasterProductForLeaderboard(p);
    const c = item.rankCriteria;
    // The default view shows the one rating (D3). A persona leans on one
    // criterion only where the product has a score past the ranking
    // threshold; otherwise the rating stands (DOS/Rate#1143, D9).
    const lean = (score: number | null, share: number) =>
      score != null && score > 0 && item.userScore5 > 0
        ? item.userScore5 * (1 - share) + score * share
        : item.userScore5;
    let personaScore5 = item.userScore5;
    if (persona === 'value_hunter') {
      personaScore5 = lean(c.value, 0.55);
    } else if (persona === 'photography') {
      personaScore5 = lean(c.camera, 0.6);
    } else if (persona === 'gaming') {
      personaScore5 = lean(c.performance, 0.6);
    } else if (persona === 'endurance') {
      personaScore5 = lean(c.battery, 0.6);
    }

    const rawMaxP = parseStrictDecimalVnd(p.max_price);
    const maxP =
      rawMaxP != null && rawMaxP >= minP && rawMaxP <= MAX_VALID_VND_PRICE
        ? Math.round(rawMaxP)
        : minP;
    const spreadSavingsVnd = Math.max(0, maxP - minP);
    // Per point of the rating the card shows (D3).
    const ratingScore10 = displayedScore5(item.userScore5) * 2;
    const costPerPointVnd =
      ratingScore10 > 0 ? Math.round(minP / ratingScore10) : 0;

    scored.push({
      ...item,
      minPrice: minP,
      personaScore5,
      spreadSavingsVnd,
      costPerPointVnd,
    });
  }

  // The default view ranks by the rating as shown, the composite breaking
  // a tie (D3); a persona ranks by its own score.
  const shown = (score: number) =>
    persona === 'default' ? displayedScore5(score) : score;
  scored.sort((a, b) => {
    if (shown(b.personaScore5) !== shown(a.personaScore5)) {
      return shown(b.personaScore5) - shown(a.personaScore5);
    }
    if (b.combinedScore5 !== a.combinedScore5) {
      return b.combinedScore5 - a.combinedScore5;
    }
    return a.minPrice - b.minPrice;
  });

  return scored.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export function formatDealPersonaScore(
  personaScore5: number,
  persona: PersonaKey
): string | null {
  if (!(personaScore5 > 0)) return null;
  return formatScoreFixed(personaScore5, persona === 'default' ? 1 : 2);
}

export function buildDealJsonItem(
  d: ReturnType<typeof rankProductsForDealFinder>[number],
  signal: RadarSignal | null | undefined
) {
  return {
    rank: d.rank,
    slug: d.slug,
    name: d.name,
    brand: d.brand,
    category: d.categorySlug,
    dealRadar: radarExportFields(signal),
    personaScore5: d.personaScore5,
    userScore5: d.userScore5,
    ratingScore5: d.userScore5 > 0 ? displayedScore5(d.userScore5) : null,
    expertScore10: d.expertScore10,
    minPriceVnd: d.minPrice,
    spreadSavingsVnd: d.spreadSavingsVnd,
    costPerPointVnd: d.costPerPointVnd,
    href: d.productHref,
  };
}

export function filterValidRadarDeals(
  items: readonly CrossPlatformDealRadarItem[] | null | undefined,
  categoryFilter: CanonicalCategorySlug | 'all'
): CrossPlatformDealRadarItem[] {
  if (!Array.isArray(items)) return [];
  const out: CrossPlatformDealRadarItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (categoryFilter !== 'all' && item.categorySlug !== categoryFilter) {
      continue;
    }
    const safeCurrent = sanitizeDealRadarPriceVnd(item.priceCurrent);
    if (safeCurrent == null) continue;
    out.push({
      ...item,
      priceCurrent: safeCurrent,
      priceOriginal: resolveClaimedOriginalPriceVnd(
        item.priceOriginal,
        safeCurrent
      ),
    });
  }
  return out;
}

export function filterValidRadarSpreads(
  items: readonly CrossPlatformPriceSpreadItem[] | null | undefined,
  categoryFilter: CanonicalCategorySlug | 'all'
): CrossPlatformPriceSpreadItem[] {
  if (!Array.isArray(items)) return [];
  const out: CrossPlatformPriceSpreadItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (categoryFilter !== 'all' && item.categorySlug !== categoryFilter) {
      continue;
    }
    const safeMin = sanitizeDealRadarPriceVnd(item.minPrice);
    const safeMax = sanitizeDealRadarPriceVnd(item.maxPrice);
    const safeSpread = sanitizeDealRadarPriceVnd(item.spreadVnd);
    if (
      safeMin == null ||
      safeMax == null ||
      safeMax < safeMin ||
      safeSpread == null
    ) {
      continue;
    }
    out.push({
      ...item,
      minPrice: safeMin,
      maxPrice: safeMax,
      spreadVnd: safeSpread,
    });
  }
  return out;
}

type RadarMarkdownTranslateKey =
  | 'radarMdHeader'
  | 'radarMdMeta'
  | 'radarMdGenuineTitle'
  | 'radarMdGenuineTableHead'
  | 'radarMdFakeTitle'
  | 'radarMdFakeTableHead'
  | 'radarMdSpreadTitle'
  | 'radarMdSpreadTableHead'
  | 'noScore';

export function buildDealRadarMarkdown(params: {
  readonly t: (
    key: RadarMarkdownTranslateKey,
    values?: Record<string, string | number>
  ) => string;
  readonly locale: string;
  readonly categoryLabel: string;
  readonly totalClustersAnalyzed: number;
  readonly totalOffersAnalyzed: number;
  readonly genuineDeals: readonly CrossPlatformDealRadarItem[];
  readonly fakeSaleTraps: readonly CrossPlatformDealRadarItem[];
  readonly priceSpreadLeaders: readonly CrossPlatformPriceSpreadItem[];
}): string {
  const {
    t,
    locale,
    categoryLabel,
    totalClustersAnalyzed,
    totalOffersAnalyzed,
    genuineDeals,
    fakeSaleTraps,
    priceSpreadLeaders,
  } = params;
  const safeClusters = Math.max(
    0,
    Math.round(parseStrictDecimalVnd(totalClustersAnalyzed) ?? 0)
  );
  const safeOffers = Math.max(
    0,
    Math.round(parseStrictDecimalVnd(totalOffersAnalyzed) ?? 0)
  );
  const lines = [
    t('radarMdHeader'),
    t('radarMdMeta', {
      category: sanitizeDealFinderMarkdownCell(categoryLabel),
      clusters: formatNumber(safeClusters, locale),
      offers: safeOffers,
    }),
    '',
    t('radarMdGenuineTitle'),
    t('radarMdGenuineTableHead'),
    '| --- | --- | --- | --- | --- | --- |',
    ...genuineDeals.map((g) => {
      const safeCurrent = sanitizeDealRadarPriceVnd(g.priceCurrent);
      const safeMedian = sanitizeDealRadarPriceVnd(g.marketMedianPrice);
      const safeSavings = sanitizeDealRadarPriceVnd(g.savingsVsMedianVnd);
      const safeSavingsPct = formatPlainNumber(g.savingsVsMedianPct, locale);
      return `| ${sanitizeDealFinderMarkdownCell(g.productName)} | ${sanitizeDealFinderMarkdownCell(g.platform.toUpperCase())} (${sanitizeDealFinderMarkdownCell(g.merchantName)}) | ${safeCurrent != null ? `**${formatNumber(safeCurrent, locale)} ₫**` : '-'} | ${safeMedian != null ? `${formatNumber(safeMedian, locale)} ₫` : '-'} | ${safeSavings != null ? `-${formatNumber(safeSavings, locale)} ₫ (-${safeSavingsPct}%)` : '-'} | ${g.jreviewsScore10 != null && g.jreviewsScore10 > 0 ? `${formatScoreFixed(g.jreviewsScore10, 1)}/10` : t('noScore')} |`;
    }),
    '',
    t('radarMdFakeTitle'),
    t('radarMdFakeTableHead'),
    '| --- | --- | --- | --- | --- | --- |',
    ...fakeSaleTraps.map((trap) => {
      const safeCurrent = sanitizeDealRadarPriceVnd(trap.priceCurrent);
      const claimedOrig = resolveClaimedOriginalPriceVnd(
        trap.priceOriginal,
        trap.priceCurrent
      );
      const safeMedian = sanitizeDealRadarPriceVnd(trap.marketMedianPrice);
      const safeMarkupPct = formatPlainNumber(trap.fakeMarkupPct, locale);
      return `| ${sanitizeDealFinderMarkdownCell(trap.productName)} | ${sanitizeDealFinderMarkdownCell(trap.platform.toUpperCase())} (${sanitizeDealFinderMarkdownCell(trap.merchantName)}) | ${safeCurrent != null ? `${formatNumber(safeCurrent, locale)} ₫` : '-'} | ${claimedOrig != null ? `${formatNumber(claimedOrig, locale)} ₫` : '-'} | ${safeMedian != null ? `${formatNumber(safeMedian, locale)} ₫` : '-'} | **+${safeMarkupPct}%** |`;
    }),
    '',
    t('radarMdSpreadTitle'),
    t('radarMdSpreadTableHead'),
    '| --- | --- | --- | --- | --- | --- |',
    ...priceSpreadLeaders.map((s) => {
      const safeMin = sanitizeDealRadarPriceVnd(s.minPrice);
      const safeMax = sanitizeDealRadarPriceVnd(s.maxPrice);
      const safeSpread = sanitizeDealRadarPriceVnd(s.spreadVnd);
      const safeSpreadPct = formatPlainNumber(s.spreadPct, locale);
      return `| ${sanitizeDealFinderMarkdownCell(s.productName)} | ${sanitizeDealFinderMarkdownCell(s.cheapestPlatform.toUpperCase())} (${sanitizeDealFinderMarkdownCell(s.cheapestMerchantName)}) | ${sanitizeDealFinderMarkdownCell(s.priciestPlatform.toUpperCase())} (${sanitizeDealFinderMarkdownCell(s.priciestMerchantName)}) | ${safeMin != null ? `**${formatNumber(safeMin, locale)} ₫**` : '-'} | ${safeMax != null ? `${formatNumber(safeMax, locale)} ₫` : '-'} | ${safeSpread != null ? `**-${formatNumber(safeSpread, locale)} ₫ (${safeSpreadPct}%)**` : '-'} |`;
    }),
  ];
  return lines.join('\n');
}

export function buildDealRadarCsvRows(
  genuineDeals: readonly CrossPlatformDealRadarItem[],
  fakeSaleTraps: readonly CrossPlatformDealRadarItem[],
  priceSpreadLeaders: readonly CrossPlatformPriceSpreadItem[]
): Array<Array<string | number>> {
  const allItems = [...genuineDeals, ...fakeSaleTraps];
  return [
    ...allItems.map((it) => {
      const safeCurrent = sanitizeDealRadarPriceVnd(it.priceCurrent);
      const safeOriginal = resolveClaimedOriginalPriceVnd(
        it.priceOriginal,
        it.priceCurrent
      );
      const safeMedian = sanitizeDealRadarPriceVnd(it.marketMedianPrice);
      return [
        it.verdict,
        it.productName,
        it.brand,
        it.categorySlug,
        it.platform,
        it.merchantName,
        it.isOfficialMall ? 'Mall' : 'Standard',
        safeCurrent ?? '',
        safeOriginal ?? '',
        safeMedian ?? '',
        it.savingsVsMedianPct,
        it.fakeMarkupPct,
        it.jreviewsScore10 != null && it.jreviewsScore10 > 0
          ? formatScoreFixed(it.jreviewsScore10, 1)
          : '',
      ];
    }),
    ...priceSpreadLeaders.map((sp) => {
      const safeMin = sanitizeDealRadarPriceVnd(sp.minPrice);
      const safeMax = sanitizeDealRadarPriceVnd(sp.maxPrice);
      const safeMedian = sanitizeDealRadarPriceVnd(sp.medianPrice);
      return [
        'price_spread_leader',
        sp.productName,
        sp.brand,
        sp.categorySlug,
        `${sp.cheapestPlatform} vs ${sp.priciestPlatform}`,
        sp.cheapestMerchantName,
        'Verified',
        safeMin ?? '',
        safeMax ?? '',
        safeMedian ?? '',
        sp.spreadPct,
        0,
        '-',
      ];
    }),
  ];
}

type DealsMarkdownTranslateKey =
  | 'dealsMdHeader'
  | 'dealsMdBudgetLine'
  | 'dealsMdUrlLine'
  | 'dealsMdTableHead'
  | 'noScore'
  | 'labNoScore'
  | 'samePrice';

export function buildDealsMarkdown(params: {
  readonly t: (
    key: DealsMarkdownTranslateKey,
    values?: Record<string, string | number>
  ) => string;
  readonly locale: string;
  readonly persona: PersonaKey;
  readonly personaLabel: string;
  readonly maxBudgetVnd: number;
  readonly url: string;
  readonly rankedDeals: ReturnType<typeof rankProductsForDealFinder>;
  readonly radarIndex: RadarIndex;
}): string {
  const {
    t,
    locale,
    persona,
    personaLabel,
    maxBudgetVnd,
    url,
    rankedDeals,
    radarIndex,
  } = params;
  const safeBudget = sanitizeDealFinderBudgetVnd(maxBudgetVnd);
  const safeUrl = String(url ?? '')
    .replace(/[\r\n\p{Cc}]+/gu, '')
    .trim();
  const lines = [
    t('dealsMdHeader', { count: rankedDeals.length }),
    t('dealsMdBudgetLine', {
      budget: formatNumber(safeBudget, locale),
      persona: sanitizeDealFinderMarkdownCell(personaLabel),
    }),
    t('dealsMdUrlLine', { url: safeUrl }),
    '',
    t('dealsMdTableHead'),
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rankedDeals.slice(0, 20).map((d) => {
      const personaStr = formatDealPersonaScore(d.personaScore5, persona);
      return `| #${d.rank} | ${sanitizeDealFinderMarkdownCell(d.name)} | ${sanitizeDealFinderMarkdownCell(d.brand)} | **${personaStr ? `${personaStr}/5.0` : t('noScore')}** | ★ ${d.userScore5 > 0 ? formatScoreFixed(displayedScore5(d.userScore5), 1) : t('noScore')} (${d.expertScore10 != null ? `Lab ${formatScoreFixed(d.expertScore10, 1)}/10` : t('labNoScore')}) | **${formatNumber(d.minPrice, locale)} ₫** | ${d.spreadSavingsVnd > 0 ? `-${formatNumber(d.spreadSavingsVnd, locale)} ₫` : t('samePrice')} | ${radarMarkdownCell(getRadarSignal(radarIndex, d.slug), locale)} |`;
    }),
  ];
  return lines.join('\n');
}

export default function DealFinderWorkspace({
  products,
  initialCategory = 'all',
  dealRadar = null,
}: DealFinderWorkspaceProps) {
  const t = useTranslations('deals');
  const locale = useLocale();
  const categoryLabelId = useId();
  const personaLabelId = useId();
  const campaignLabelId = useId();
  const [categoryFilter, setCategoryFilter] = useState<
    CanonicalCategorySlug | 'all'
  >(initialCategory);
  const [chosenPersona, setPersona] = useState<PersonaKey>('value_hunter');
  const [campaignFilter, setCampaignFilter] =
    useState<SeasonalSaleFilterMode>('all');
  const [maxBudgetVnd, setMaxBudgetVnd] = useState<number>(65_000_000);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [copiedRadarMd, setCopiedRadarMd] = useState<boolean>(false);
  const radarIndex = useDealRadarIndex(dealRadar);
  // A persona whose criterion no product here has a score for is not
  // offered, and the ranking falls back to the default (DOS/Rate#1556).
  const availablePersonas = useMemo(
    () => availableDealPersonas(products, categoryFilter),
    [products, categoryFilter]
  );
  const persona: PersonaKey = availablePersonas.includes(chosenPersona)
    ? chosenPersona
    : 'default';
  // Paging restarts whenever a filter changes the ranking.
  const filterKey = `${categoryFilter}|${persona}|${campaignFilter}|${maxBudgetVnd}|${searchQuery}`;
  const [paging, setPaging] = useState({
    key: filterKey,
    count: DEALS_PAGE_SIZE,
  });
  // Adjusting state during render (not in an effect): record the new key so
  // returning to an earlier filter selection also starts at the first page.
  if (paging.key !== filterKey) {
    setPaging({ key: filterKey, count: DEALS_PAGE_SIZE });
  }
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

  const selectedCategoryLabel =
    categoryOptions.find((opt) => opt.slug === categoryFilter)?.label ??
    categoryFilter;
  const selectedPersonaLabel =
    personaOptions.find((opt) => opt.key === persona)?.label ?? persona;

  const filteredGenuineDeals = useMemo<CrossPlatformDealRadarItem[]>(
    () => filterValidRadarDeals(dealRadar?.genuineDeals, categoryFilter),
    [dealRadar, categoryFilter]
  );

  const filteredFakeSaleTraps = useMemo<CrossPlatformDealRadarItem[]>(
    () => filterValidRadarDeals(dealRadar?.fakeSaleTraps, categoryFilter),
    [dealRadar, categoryFilter]
  );

  const filteredPriceSpreadLeaders = useMemo<CrossPlatformPriceSpreadItem[]>(
    () =>
      filterValidRadarSpreads(dealRadar?.priceSpreadLeaders, categoryFilter),
    [dealRadar, categoryFilter]
  );

  const handleCopyRadarMarkdown = async () => {
    if (typeof window === 'undefined' || !dealRadar) return;
    try {
      const md = buildDealRadarMarkdown({
        t,
        locale,
        categoryLabel: selectedCategoryLabel,
        totalClustersAnalyzed: dealRadar.totalClustersAnalyzed,
        totalOffersAnalyzed: dealRadar.totalOffersAnalyzed,
        genuineDeals: filteredGenuineDeals,
        fakeSaleTraps: filteredFakeSaleTraps,
        priceSpreadLeaders: filteredPriceSpreadLeaders,
      });
      await navigator.clipboard.writeText(md);
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
    const rows = buildDealRadarCsvRows(
      filteredGenuineDeals,
      filteredFakeSaleTraps,
      filteredPriceSpreadLeaders
    );
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
      source:
        'Rate.vn cross-store price lows and fake-sale warnings (22 stores)',
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

  const baseRankedDeals = useMemo(
    () =>
      rankProductsForDealFinder(products, {
        categoryFilter,
        persona,
        maxBudgetVnd,
        searchQuery,
      }),
    [products, categoryFilter, persona, maxBudgetVnd, searchQuery]
  );

  const seasonalCampaignCounts = useMemo(
    () =>
      countSeasonalSaleCampaignDeals(baseRankedDeals, (slug) =>
        getRadarSignal(radarIndex, slug)
      ),
    [baseRankedDeals, radarIndex]
  );

  const rankedDeals = useMemo(() => {
    if (campaignFilter === 'all') return baseRankedDeals;
    return baseRankedDeals
      .filter((d) =>
        matchesSeasonalSaleFilter(
          getRadarSignal(radarIndex, d.slug),
          campaignFilter
        )
      )
      .map((d, idx) => ({
        ...d,
        rank: idx + 1,
      }));
  }, [baseRankedDeals, campaignFilter, radarIndex]);

  const handleCopyDealsMarkdown = async () => {
    if (typeof window === 'undefined' || rankedDeals.length === 0) return;
    try {
      const md = buildDealsMarkdown({
        t,
        locale,
        persona,
        personaLabel: selectedPersonaLabel,
        maxBudgetVnd,
        url: window.location.href,
        rankedDeals,
        radarIndex,
      });
      await navigator.clipboard.writeText(md);
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
      formatDealPersonaScore(d.personaScore5, persona) ?? '',
      d.userScore5 > 0
        ? formatScoreFixed(displayedScore5(d.userScore5), 1)
        : '',
      d.expertScore10 != null ? formatScoreFixed(d.expertScore10, 1) : '',
      d.minPrice,
      d.spreadSavingsVnd,
      d.costPerPointVnd > 0 ? d.costPerPointVnd : '',
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
      deals: rankedDeals.map((d) =>
        buildDealJsonItem(d, getRadarSignal(radarIndex, d.slug))
      ),
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
              disabled={rankedDeals.length === 0}
              onClick={handleCopyDealsMarkdown}
              data-testid="deals-copy-md-btn"
              className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
            >
              {copiedMarkdown ? t('copiedMdBtn') : t('copyMdBtn')}
            </button>
            <button
              type="button"
              disabled={rankedDeals.length === 0}
              onClick={handleDownloadDealsCsv}
              data-testid="deals-export-csv-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              {t('exportCsvBtn', { count: rankedDeals.length })}
            </button>
            <button
              type="button"
              disabled={rankedDeals.length === 0}
              onClick={handleDownloadDealsJson}
              data-testid="deals-export-json-btn"
              className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3"
            >
              {t('exportJsonBtn', { count: rankedDeals.length })}
            </button>
          </div>
        </div>

        {/* Category Pills: the pressed one is exposed (DOS/Rate#1069) */}
        <div
          className="d-flex align-items-center mb-3 flex-wrap gap-2"
          role="group"
          aria-labelledby={categoryLabelId}
        >
          <span
            id={categoryLabelId}
            className="small text-secondary fw-semibold me-1"
          >
            {t('categoryLabel')}
          </span>
          {categoryOptions.map((opt) => (
            <button
              key={opt.slug}
              type="button"
              aria-pressed={categoryFilter === opt.slug}
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

        {/* Persona Pills: only with a choice to make */}
        {availablePersonas.length > 1 && (
          <div
            id="rate-deal-personas"
            className="d-flex align-items-center mb-3 flex-wrap gap-2"
            role="group"
            aria-labelledby={personaLabelId}
          >
            <span
              id={personaLabelId}
              className="small text-secondary fw-semibold me-1"
            >
              {t('personaLabel')}
            </span>
            {personaOptions
              .filter((p) => availablePersonas.includes(p.key))
              .map((p) => (
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
        )}

        {/* Seasonal Sale Campaign Filter Chips (#1863) */}
        <div
          data-testid="deals-seasonal-campaign-filter"
          className="d-flex align-items-center mb-3 flex-wrap gap-2"
          role="group"
          aria-labelledby={campaignLabelId}
        >
          <span
            id={campaignLabelId}
            className="small text-secondary fw-semibold me-1"
          >
            {t('campaignFilterLabel')}
          </span>
          {(
            [
              {
                key: 'all',
                label: t('campaignAll'),
              },
              {
                key: 'genuine_sale_drops',
                label: t('campaignGenuineDrops', {
                  count: seasonalCampaignCounts.genuineSaleCount,
                }),
              },
              {
                key: 'inflated_presale_warnings',
                label: t('campaignInflatedTraps', {
                  count: seasonalCampaignCounts.inflatedWarningCount,
                }),
              },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              data-testid={`deals-campaign-chip-${chip.key}`}
              aria-pressed={campaignFilter === chip.key}
              onClick={() => setCampaignFilter(chip.key)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                campaignFilter === chip.key
                  ? 'btn-dark fw-bold text-white'
                  : 'btn-light text-secondary border'
              }`}
            >
              {chip.label}
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
                ≤ {formatPriceVnd(maxBudgetVnd, locale)}
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
              // Named even after the placeholder is gone (DOS/Rate#1077).
              aria-label={t('searchPlaceholder')}
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
              {campaignFilter !== 'inflated_presale_warnings' && (
                <div
                  className={
                    campaignFilter === 'genuine_sale_drops'
                      ? 'col-12'
                      : 'col-lg-6'
                  }
                >
                  <h3 className="rate-radar-list-title is-good">
                    <BsGraphDownArrow aria-hidden="true" />
                    {t('genuineDealsHeader', {
                      count: filteredGenuineDeals.length,
                    })}
                  </h3>
                  {filteredGenuineDeals.length > 0 ? (
                    <ul className="rate-radar-list">
                      {filteredGenuineDeals.slice(0, 6).map((g) => {
                        const safeMedian = sanitizeDealRadarPriceVnd(
                          g.marketMedianPrice
                        );
                        return (
                          <li key={g.id}>
                            <div className="rate-radar-item-main">
                              <Link
                                href={g.productHref}
                                className="text-truncate"
                              >
                                {g.productName}
                              </Link>
                              <span className="rate-radar-item-meta text-truncate">
                                <span className="rate-radar-platform">
                                  {g.platform}
                                </span>
                                <ContentText
                                  text={g.merchantName}
                                  locale={locale}
                                />
                                {safeMedian != null && (
                                  <>
                                    {' '}
                                    ·{' '}
                                    {t('medianPriceLabel', {
                                      price: formatNumber(safeMedian, locale),
                                    })}
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="rate-radar-item-side">
                              <span className="rate-radar-price">
                                {formatDealRadarPriceVnd(
                                  g.priceCurrent,
                                  locale
                                )}
                              </span>
                              <span className="rate-radar-tag is-good">
                                {t('savingsVsMedianBadge', {
                                  pct: formatPlainNumber(
                                    g.savingsVsMedianPct,
                                    locale
                                  ),
                                })}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rate-radar-empty">{t('radarNoGenuine')}</p>
                  )}
                </div>
              )}

              {campaignFilter !== 'genuine_sale_drops' && (
                <div
                  className={
                    campaignFilter === 'inflated_presale_warnings'
                      ? 'col-12'
                      : 'col-lg-6'
                  }
                >
                  <h3 className="rate-radar-list-title is-bad">
                    <BsExclamationTriangle aria-hidden="true" />
                    {t('fakeTrapsHeader', {
                      count: filteredFakeSaleTraps.length,
                    })}
                  </h3>
                  {filteredFakeSaleTraps.length > 0 ? (
                    <ul className="rate-radar-list">
                      {filteredFakeSaleTraps.slice(0, 6).map((trap) => {
                        const claimedOrig = resolveClaimedOriginalPriceVnd(
                          trap.priceOriginal,
                          trap.priceCurrent
                        );
                        return (
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
                                <ContentText
                                  text={trap.merchantName}
                                  locale={locale}
                                />
                                {claimedOrig != null && (
                                  <>
                                    {' '}
                                    · {t('claimedOrigLabel')}{' '}
                                    <s>{formatPriceVnd(claimedOrig, locale)}</s>
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="rate-radar-item-side">
                              <span className="rate-radar-price">
                                {formatDealRadarPriceVnd(
                                  trap.priceCurrent,
                                  locale
                                )}
                              </span>
                              <span className="rate-radar-tag is-bad">
                                {t('fakeMarkupBadge', {
                                  pct: formatPlainNumber(
                                    trap.fakeMarkupPct,
                                    locale
                                  ),
                                })}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rate-radar-empty">{t('radarNoTraps')}</p>
                  )}
                </div>
              )}
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
                            ({formatDealRadarPriceVnd(s.minPrice, locale)}) vs{' '}
                            <span className="rate-radar-platform">
                              {s.priciestPlatform}
                            </span>
                          </span>
                        </div>
                        <div className="rate-radar-item-side">
                          <span className="rate-radar-price">
                            -{formatDealRadarPriceVnd(s.spreadVnd, locale)}
                          </span>
                          <span className="rate-radar-tag is-warn">
                            {t('spreadPctBadge', {
                              pct: formatPlainNumber(s.spreadPct, locale),
                            })}
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
            {campaignFilter === 'genuine_sale_drops' &&
            baseRankedDeals.length > 0
              ? t('campaignEmptyGenuine')
              : campaignFilter === 'inflated_presale_warnings' &&
                  baseRankedDeals.length > 0
                ? t('campaignEmptyTraps')
                : t('emptyBudgetText', {
                    budget: formatNumber(maxBudgetVnd, locale),
                  })}
          </p>
          <button
            type="button"
            onClick={() => {
              focusCardIndex.current = 0;
              if (campaignFilter !== 'all' && baseRankedDeals.length > 0) {
                setCampaignFilter('all');
                return;
              }
              setMaxBudgetVnd(65_000_000);
              setCategoryFilter('all');
              setCampaignFilter('all');
              setSearchQuery('');
            }}
            className="btn btn-sm btn-dark rounded-pill px-4"
          >
            {campaignFilter !== 'all' && baseRankedDeals.length > 0
              ? t('campaignResetBtn')
              : t('resetBudgetBtn')}
          </button>
        </div>
      ) : (
        <>
          <div className="row g-3" id="rate-ranked-deals">
            {rankedDeals.slice(0, visibleCount).map((deal) => {
              const dealSignal = getRadarSignal(radarIndex, deal.slug);
              const trapOrig = dealSignal.fakeSaleTrap
                ? resolveClaimedOriginalPriceVnd(
                    dealSignal.fakeSaleTrap.priceOriginal,
                    dealSignal.fakeSaleTrap.priceCurrent
                  )
                : null;
              const genuineSavingsVnd = dealSignal.genuineDeal
                ? sanitizeDealRadarPriceVnd(
                    dealSignal.genuineDeal.savingsVsMedianVnd
                  )
                : null;
              return (
                <div key={deal.slug} className="col-lg-6">
                  <div className="rate-card d-flex flex-column justify-content-between h-100 p-3">
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <div className="d-flex align-items-center flex-wrap gap-2">
                          <span className="badge bg-dark rounded-pill text-white">
                            {t('rankDealBadge', { rank: deal.rank })}
                          </span>
                          <span className="rate-spec-pill">{deal.brand}</span>
                          <StarRating
                            value={deal.personaScore5}
                            digits={persona === 'default' ? 1 : 2}
                            size="sm"
                            emptyLabel={t('noScore')}
                          />
                          <span className="rate-score-badge-expert">
                            {deal.expertScore10 != null
                              ? `Lab ${formatDecimal(deal.expertScore10, locale, 1)}/10`
                              : t('labNoScore')}
                          </span>
                          <RadarBadge
                            signal={dealSignal}
                            minSpreadPct={Infinity}
                          />
                        </div>
                        {deal.spreadSavingsVnd > 0 && (
                          <span className="badge bg-success-subtle text-success rounded-pill rate-tabular">
                            {t('spreadSavingsBadge', {
                              amount: formatNumber(
                                deal.spreadSavingsVnd,
                                locale
                              ),
                            })}
                          </span>
                        )}
                      </div>

                      <div className="d-flex align-items-center my-2 gap-3">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={deal.thumbnail}
                          alt={deal.name}
                          className="rounded-3 flex-shrink-0 border bg-white p-1"
                          style={{
                            width: 64,
                            height: 64,
                            objectFit: 'contain',
                          }}
                        />
                        <div className="overflow-hidden">
                          <Link
                            href={deal.productHref}
                            className="fw-bold text-dark text-decoration-none d-block text-truncate"
                          >
                            {deal.name}
                          </Link>
                          <div className="text-danger fw-bold rate-tabular mt-1">
                            {formatPriceVnd(deal.minPrice, locale)}{' '}
                            {deal.costPerPointVnd > 0 && (
                              <span className="text-secondary small fw-normal">
                                {t('costPerPointSub', {
                                  cost: formatNumber(
                                    deal.costPerPointVnd,
                                    locale
                                  ),
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {campaignFilter === 'inflated_presale_warnings' &&
                        dealSignal.fakeSaleTrap &&
                        trapOrig != null && (
                          <div
                            className="rounded-3 bg-danger-subtle text-danger border-danger-subtle small mt-2 border p-2"
                            data-testid="deals-card-trap-callout"
                          >
                            {t('campaignCardTrapNote', {
                              platform:
                                dealSignal.fakeSaleTrap.platform.toUpperCase(),
                              claimed: formatPriceVnd(trapOrig, locale),
                              pct: formatPlainNumber(
                                dealSignal.fakeSaleTrap.fakeMarkupPct,
                                locale
                              ),
                            })}
                          </div>
                        )}

                      {campaignFilter === 'genuine_sale_drops' &&
                        dealSignal.genuineDeal &&
                        genuineSavingsVnd != null && (
                          <div
                            className="rounded-3 bg-success-subtle text-success border-success-subtle small mt-2 border p-2"
                            data-testid="deals-card-genuine-callout"
                          >
                            {t('campaignCardGenuineNote', {
                              platform:
                                dealSignal.genuineDeal.platform.toUpperCase(),
                              savings: formatPriceVnd(
                                genuineSavingsVnd,
                                locale
                              ),
                              pct: formatPlainNumber(
                                dealSignal.genuineDeal.savingsVsMedianPct,
                                locale
                              ),
                            })}
                          </div>
                        )}
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
              );
            })}
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
