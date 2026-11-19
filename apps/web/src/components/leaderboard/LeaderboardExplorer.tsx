'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { IconType } from 'react-icons';
import { Link } from '@/lib/navigation';
import { IntentLink } from '@/components/elementary/IntentLink';
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
} from '@/lib/rate-domain';
import {
  LEADERBOARD_SCORE_CRITERIA,
  displayedScore5,
  leaderboardCriteriaForCategory,
  weightedCriteriaScore5,
  type LeaderboardCriteriaBreakdown,
} from '@/lib/leaderboard-engine';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarResponse,
  type RadarSignal,
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
import StarRating from '@/components/elementary/StarRating';
import {
  formatDecimal,
  formatPercent,
  formatPriceVnd,
} from '@/lib/locale-format';
import {
  displayRating,
  formatRatingValue,
  formatScoreFixed,
  roundScore,
} from '@/lib/rating-display';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  parseCompareToken,
  versusHref,
} from '@/lib/item-compare';
import {
  catalogRowSlug,
  type ItemCatalogRow,
  type ItemVariantChip,
} from '@/lib/item-directory';

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
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  let num: number;
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return 0;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return 0;
    }
    num = Number(trimmed);
  } else {
    num = value;
  }
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  const rounded = Math.round(num);
  return rounded > 0 && rounded <= MAX_VALID_VND_PRICE ? rounded : 0;
}

export function formatLeaderboardPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  return formatPriceVnd(sanitizeLeaderboardPriceVnd(value), locale);
}

export function formatLeaderboardDisplayPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  const safePrice = sanitizeLeaderboardPriceVnd(value);
  return safePrice > 0 ? formatLeaderboardPriceVnd(safePrice, locale) : '-';
}

export function formatLeaderboardShowdownDelta(
  scoreA: number,
  scoreB: number,
  scoreDigits: 1 | 2,
  locale?: string | null
): string | null {
  const safeA = displayRating(scoreA);
  const safeB = displayRating(scoreB);
  if (safeA === null || safeB === null) return null;
  const delta = roundScore(
    Math.abs(roundScore(safeA, scoreDigits) - roundScore(safeB, scoreDigits)),
    scoreDigits
  );
  if (delta <= 0) return null;
  return `Δ ${formatDecimal(delta, locale, scoreDigits)}`;
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

export type LeaderboardPersonaKey =
  | 'none'
  | 'photography'
  | 'gaming'
  | 'endurance'
  | 'business'
  | 'value_hunter'
  | 'custom';

export function resolveLeaderboardActiveScoreLabel(
  activePersona: LeaderboardPersonaKey,
  activeCriterion: LeaderboardCriterionKey,
  copy: {
    readonly personaLabels: Readonly<Record<LeaderboardPersonaKey, string>>;
    readonly critLabels: Readonly<Record<LeaderboardCriterionKey, string>>;
  },
  totalWeight = 100
): string {
  return activePersona !== 'none' && totalWeight > 0
    ? copy.personaLabels[activePersona]
    : copy.critLabels[activeCriterion];
}

export function formatLeaderboardActiveScore(
  activeScore5: number,
  scoreDigits: 1 | 2,
  emptyText = ''
): string {
  return activeScore5 > 0
    ? formatScoreFixed(activeScore5, scoreDigits)
    : emptyText;
}

function lookupLeaderboardOwnSlug(
  map: Readonly<Record<string, string>> | null | undefined,
  slug: string
): string | undefined {
  if (!map || !slug || !Object.hasOwn(map, slug)) return undefined;
  const val = map[slug];
  return typeof val === 'string' && val ? val : undefined;
}

function setLeaderboardOwnSlug(
  map: Record<string, string>,
  slug: string,
  value: string
): void {
  if (slug === '__proto__') {
    Object.defineProperty(map, slug, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    map[slug] = value;
  }
}

export function buildLeaderboardItemSlugMap(
  products: readonly ItemCatalogRow[],
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;
  if (itemSlugBySlug) {
    for (const [slug, itemSlug] of Object.entries(itemSlugBySlug)) {
      if (slug && typeof itemSlug === 'string' && itemSlug) {
        setLeaderboardOwnSlug(map, slug, itemSlug);
      }
    }
  }
  for (const p of products) {
    if (!p || typeof p.slug !== 'string' || !p.slug) continue;
    if (
      typeof p.item_slug === 'string' &&
      p.item_slug &&
      !lookupLeaderboardOwnSlug(map, p.slug)
    ) {
      setLeaderboardOwnSlug(map, p.slug, p.item_slug);
    }
  }
  return map;
}

export function resolveLeaderboardVersusSideSlug(
  slug: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  if (!slug) return '';
  const mapped = lookupLeaderboardOwnSlug(itemSlugBySlug, slug);
  return mapped && !mapped.toLowerCase().includes('-vs-') ? mapped : slug;
}

export function isSameLeaderboardVersusItem(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): boolean {
  if (!slugA || !slugB) return false;
  if (slugA.toLowerCase() === slugB.toLowerCase()) return true;
  const sideA = resolveLeaderboardVersusSideSlug(slugA, itemSlugBySlug);
  const sideB = resolveLeaderboardVersusSideSlug(slugB, itemSlugBySlug);
  if (sideA.toLowerCase() === sideB.toLowerCase()) return true;
  const rawItemA = lookupLeaderboardOwnSlug(itemSlugBySlug, slugA);
  const rawItemB = lookupLeaderboardOwnSlug(itemSlugBySlug, slugB);
  return Boolean(
    rawItemA && rawItemB && rawItemA.toLowerCase() === rawItemB.toLowerCase()
  );
}

export function isValidLeaderboardVersusPair(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): boolean {
  if (!slugA || !slugB) return false;
  if (isSameLeaderboardVersusItem(slugA, slugB, itemSlugBySlug)) return false;
  if (
    lookupLeaderboardOwnSlug(itemSlugBySlug, slugA)
      ?.toLowerCase()
      .includes('-vs-') ||
    lookupLeaderboardOwnSlug(itemSlugBySlug, slugB)
      ?.toLowerCase()
      .includes('-vs-')
  ) {
    return false;
  }
  const sideA = resolveLeaderboardVersusSideSlug(slugA, itemSlugBySlug);
  const sideB = resolveLeaderboardVersusSideSlug(slugB, itemSlugBySlug);
  const [first, second] = canonicalVersusOrder(sideA, sideB);
  return Boolean(
    first &&
    second &&
    first.toLowerCase() !== second.toLowerCase() &&
    isParseableVersusPair(first.toLowerCase(), second.toLowerCase())
  );
}

const LEADERBOARD_COMPARE_PIN_RE =
  /^[a-z0-9][a-z0-9._-]{0,159}@[a-z0-9][a-z0-9-]{0,40}$/i;
export type LeaderboardCompareSlugRow = Pick<
  ItemCatalogRow,
  'slug' | 'item_slug'
> & {
  id?: string;
  item_variants?: readonly ItemVariantChip[];
  variant_key?: string | null;
  variant_count?: number | null;
  default_variant_id?: string | null;
};

interface LeaderboardCompareEntry {
  token: string;
  variantSlug: string;
}

export function encodeLeaderboardCompareSlug(token: string): string {
  return encodeURIComponent(token).replace(/%40/gi, '@');
}

export function resolveLeaderboardCompareEntries(
  entries: ReadonlyArray<{
    product: LeaderboardCompareSlugRow;
  }>,
  itemSlugBySlug?: Readonly<Record<string, string>> | null,
  limit = 3
): LeaderboardCompareEntry[] {
  const seen = new Set<string>();
  const out: LeaderboardCompareEntry[] = [];
  if (limit <= 0) return out;
  for (const entry of entries) {
    const product = entry?.product;
    const rawSlug = product?.slug?.trim() ?? '';
    if (!rawSlug) continue;
    const mappedSlug = lookupLeaderboardOwnSlug(itemSlugBySlug, rawSlug);
    const canonical = (mappedSlug || catalogRowSlug(product)).trim();
    const key = (canonical || rawSlug).toLowerCase();
    if (!key || seen.has(key)) continue;

    let token = itemSlugBySlug === null ? rawSlug : canonical || rawSlug;
    const hasExplicitItemSlug =
      itemSlugBySlug !== null &&
      Boolean(product.item_slug || (mappedSlug && mappedSlug !== rawSlug));
    const isConfirmedDefault = Boolean(
      product.default_variant_id &&
      product.id &&
      product.id === product.default_variant_id
    );
    if (hasExplicitItemSlug && !isConfirmedDefault) {
      if (
        Array.isArray(product.item_variants) &&
        product.item_variants.length > 1
      ) {
        const matched = product.id
          ? product.item_variants.find((v) => v.id === product.id)
          : undefined;
        const pinned =
          matched && typeof matched.variant_key === 'string'
            ? `${canonical}@${matched.variant_key.trim().toLowerCase()}`
            : '';
        token =
          pinned && LEADERBOARD_COMPARE_PIN_RE.test(pinned)
            ? pinned
            : rawSlug || token;
      } else if (
        typeof product.variant_key === 'string' &&
        product.variant_key.trim() &&
        (Number(product.variant_count) > 1 ||
          Boolean(product.default_variant_id && product.id))
      ) {
        const pinned = `${canonical}@${product.variant_key.trim().toLowerCase()}`;
        token = LEADERBOARD_COMPARE_PIN_RE.test(pinned)
          ? pinned
          : rawSlug || token;
      }
    }

    if (!token) continue;
    seen.add(key);
    out.push({ token, variantSlug: rawSlug });
    if (out.length >= limit) break;
  }
  return out;
}

export function resolveLeaderboardCompareSlugs(
  entries: ReadonlyArray<{ product: LeaderboardCompareSlugRow }>,
  itemSlugBySlug?: Readonly<Record<string, string>> | null,
  limit = 3
): string[] {
  return resolveLeaderboardCompareEntries(entries, itemSlugBySlug, limit).map(
    (entry) => entry.token
  );
}

/** Keep the represented masters in the shared link in case Item reads fail later. */
export function leaderboardCompareHref(
  entries: readonly LeaderboardCompareEntry[],
  activeCategory: CanonicalCategorySlug,
  categoryParam: 'cat' | 'category'
): string {
  const slugs = entries
    .map(({ token }) => encodeLeaderboardCompareSlug(token))
    .join(',');
  const fallbacks = new URLSearchParams();
  // Conventional size pins already name their master. Keep those URLs stable.
  // For an irregular pin, carry the exact masters for the entire comparison.
  const hasPin = entries.some(
    ({ token }) => !!parseCompareToken(token).variantKey
  );
  const needsFallback =
    hasPin &&
    entries.some(({ token, variantSlug }) => {
      const { slug, variantKey } = parseCompareToken(token);
      const master = variantSlug.toLowerCase();
      if (!variantKey) {
        // A grouped single-size row can have an unrelated retail identifier.
        return (
          master !== slug &&
          !/^-[0-9]+(?:gb|tb)$/i.test(
            master.startsWith(slug) ? master.slice(slug.length) : ''
          )
        );
      }
      return (
        variantKey === 'standard' ||
        slug.endsWith(`-${variantKey}`) ||
        `${slug}-${variantKey}` !== master
      );
    });
  if (needsFallback) {
    for (const { token, variantSlug } of entries) {
      if (token !== variantSlug)
        fallbacks.set(`variant.${token.toLowerCase()}`, variantSlug);
    }
  }
  const href =
    categoryParam === 'cat'
      ? `/compare?cat=${activeCategory}&slugs=${slugs}`
      : `/compare?category=${activeCategory}&slugs=${slugs}`;
  return fallbacks.size ? `${href}&${fallbacks}` : href;
}

export function resolveLeaderboardEffectiveVersusSlugs(
  entries: ReadonlyArray<{
    product: Pick<ItemCatalogRow, 'slug' | 'item_slug'>;
  }>,
  requestedSlugA: string,
  requestedSlugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): { effectiveVersusA: string; effectiveVersusB: string } {
  const hasOpponent = (slug: string) =>
    Boolean(
      slug &&
      entries.some((other) =>
        isValidLeaderboardVersusPair(slug, other.product.slug, itemSlugBySlug)
      )
    );
  const effectiveVersusA =
    requestedSlugA &&
    entries.some((e) => e.product.slug === requestedSlugA) &&
    hasOpponent(requestedSlugA)
      ? requestedSlugA
      : (entries.find((e) => hasOpponent(e.product.slug))?.product.slug ??
        entries[0]?.product.slug ??
        '');
  const effectiveVersusB =
    requestedSlugB &&
    isValidLeaderboardVersusPair(
      requestedSlugB,
      effectiveVersusA,
      itemSlugBySlug
    ) &&
    entries.some((e) => e.product.slug === requestedSlugB)
      ? requestedSlugB
      : (entries.find((e) =>
          isValidLeaderboardVersusPair(
            e.product.slug,
            effectiveVersusA,
            itemSlugBySlug
          )
        )?.product.slug ?? '');
  return { effectiveVersusA, effectiveVersusB };
}

export function buildLeaderboardMarkdownRow(
  entry: Pick<
    RankedProductEntry,
    'product' | 'activeScore5' | 'userScore5' | 'expertScore10'
  >,
  rank: number,
  scoreDigits: 1 | 2,
  unratedShort: string,
  radar: RadarSignal | null | undefined,
  locale?: string
): string[] {
  const safePrice = sanitizeLeaderboardPriceVnd(entry.product.min_price);
  return [
    `#${rank}`,
    sanitizeLeaderboardMarkdownCell(entry.product.name),
    sanitizeLeaderboardMarkdownCell(entry.product.brand),
    formatLeaderboardActiveScore(entry.activeScore5, scoreDigits, unratedShort),
    entry.userScore5 > 0
      ? formatScoreFixed(displayedScore5(entry.userScore5), 1)
      : unratedShort,
    entry.expertScore10 != null
      ? formatScoreFixed(entry.expertScore10, 1)
      : unratedShort,
    formatLeaderboardDisplayPriceVnd(safePrice, locale),
    radarMarkdownCell(radar, locale),
  ];
}

export function buildLeaderboardCsvRow(
  entry: Pick<
    RankedProductEntry,
    | 'product'
    | 'categorySlug'
    | 'activeScore5'
    | 'userScore5'
    | 'expertScore10'
    | 'criteria'
  >,
  rank: number,
  scoreDigits: 1 | 2,
  radar: RadarSignal | null | undefined
): string[] {
  const safePrice = sanitizeLeaderboardPriceVnd(entry.product.min_price);
  return [
    String(rank),
    entry.product.slug,
    entry.product.name,
    entry.product.brand || '',
    entry.categorySlug,
    formatLeaderboardActiveScore(entry.activeScore5, scoreDigits),
    entry.userScore5 > 0
      ? formatScoreFixed(displayedScore5(entry.userScore5), 1)
      : '',
    entry.expertScore10 != null ? formatScoreFixed(entry.expertScore10, 1) : '',
    ...LEADERBOARD_SCORE_CRITERIA.map((c) => {
      const score = entry.criteria[c];
      return score != null && score > 0 ? formatScoreFixed(score, 1) : '';
    }),
    safePrice > 0 ? String(safePrice) : '',
    ...radarCsvCells(radar),
  ];
}

export function buildLeaderboardJsonItem(
  entry: Pick<
    RankedProductEntry,
    'product' | 'activeScore5' | 'userScore5' | 'expertScore10' | 'criteria'
  >,
  rank: number,
  signal: RadarSignal | null | undefined
) {
  return {
    rank,
    slug: entry.product.slug,
    name: entry.product.name,
    brand: entry.product.brand,
    activeScore5: entry.activeScore5,
    userScore5: entry.userScore5,
    ratingScore5:
      entry.userScore5 > 0 ? displayedScore5(entry.userScore5) : null,
    expertScore10: entry.expertScore10,
    criteria: entry.criteria,
    minPriceVnd: sanitizeLeaderboardPriceVnd(entry.product.min_price),
    dealRadar: radarExportFields(signal),
  };
}

interface LeaderboardExplorerProps {
  readonly products: readonly ItemCatalogRow[];
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
  readonly locale?: string;
  /** Stored reviews kept out of the rating, per master id (DOS/Rate#1139). */
  readonly filteredReviewCounts?: FilteredReviewCountsByMaster;
  /** RATE_ITEM_MODEL on: variant slug to Item slug, for versus links. */
  readonly itemSlugBySlug?: Readonly<Record<string, string>>;
}

interface RankedProductEntry {
  product: ItemCatalogRow;
  categorySlug: CanonicalCategorySlug;
  categoryPath: string;
  productHref: string;
  thumbnail: string;
  userScore5: number;
  expertScore10: number | null;
  combinedScore5: number;
  authenticCount: number;
  ignoredCount: number;
  criteria: LeaderboardCriteriaBreakdown;
  rankCriteria: LeaderboardCriteriaBreakdown;
  activeScore5: number;
}

/** The criterion a category can rank by: combined when it lacks it. */
function criterionForCategory(
  cat: CanonicalCategorySlug,
  crit: LeaderboardCriterionKey
): LeaderboardCriterionKey {
  return crit === 'combined' ||
    crit === 'user' ||
    crit === 'expert' ||
    leaderboardCriteriaForCategory(cat).includes(crit)
    ? crit
    : 'combined';
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
  item: ItemCatalogRow,
  criterion: LeaderboardCriterionKey,
  filteredReviewCounts?: FilteredReviewCountsByMaster
): RankedProductEntry {
  const scored = scoreMasterProductForLeaderboard(
    item,
    criterion,
    filteredReviewCounts
  );
  return {
    product: scored.product as ItemCatalogRow,
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
    rankCriteria: scored.rankCriteria,
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
  locale: localeProp,
  filteredReviewCounts,
  itemSlugBySlug,
}: LeaderboardExplorerProps) {
  const t = useTranslations('leaderboard');
  const hookLocale = useLocale();
  const locale = localeProp || hookLocale;

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
  const [activePersona, setActivePersona] =
    useState<LeaderboardPersonaKey>('none');
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

  // The category's criteria that at least one product has a real score
  // for. A criterion with none gets no tab, no weight and no row cell, not
  // an empty list (DOS/Rate#1553). A tab and a weight need a score past the
  // ranking threshold; a cell needs one past the display threshold (D9).
  const { scoredCriteria, shownCriteria } = useMemo(() => {
    const ranked = new Set<LeaderboardCriterionKey>();
    const shown = new Set<LeaderboardCriterionKey>();
    const own = leaderboardCriteriaForCategory(activeCategory);
    for (const item of categoryProducts) {
      const { criteria, rankCriteria } = computeProductScores(
        item,
        'combined',
        filteredReviewCounts
      );
      for (const c of own) {
        if ((criteria[c] ?? 0) > 0) shown.add(c);
        if ((rankCriteria[c] ?? 0) > 0) ranked.add(c);
      }
      if (ranked.size === own.length) break;
    }
    return {
      scoredCriteria: own.filter((c) => ranked.has(c)),
      shownCriteria: own.filter((c) => shown.has(c)),
    };
  }, [activeCategory, categoryProducts, filteredReviewCounts]);
  const hasScoredCriteria = scoredCriteria.length > 0;
  const hasShownCriteria = shownCriteria.length > 0;
  // Only the weights of the category's own criteria count: a screen
  // weight left over from phones does not empty the earbuds list.
  const weightedCriteria = useMemo(
    () => leaderboardCriteriaForCategory(activeCategory),
    [activeCategory]
  );
  const totalWeight = weightedCriteria.reduce(
    (sum, c) => sum + customWeights[c],
    0
  );
  const hasActivePersonaWeights = activePersona !== 'none' && totalWeight > 0;
  const activeScoreLabel = resolveLeaderboardActiveScoreLabel(
    activePersona,
    activeCriterion,
    copy,
    totalWeight
  );
  // The one rating shows at 1 decimal (D3); a persona's own weighted score
  // keeps 2, under the persona's name.
  const ratingView =
    !hasActivePersonaWeights &&
    (activeCriterion === 'combined' || activeCriterion === 'user');
  const scoreDigits: 1 | 2 = ratingView ? 1 : 2;

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

    const scored = filtered
      .map((item) => {
        const base = computeProductScores(
          item,
          activeCriterion,
          filteredReviewCounts
        );
        // A product the active tab has no score for stays out, weights or
        // not; one with no real score on the weighted criteria drops out of
        // the weighted ranking, like a criterion tab (DOS/Rate#1143).
        if (
          hasActivePersonaWeights &&
          (activeCriterion === 'combined'
            ? base.combinedScore5 > 0
            : base.activeScore5 > 0)
        ) {
          const weighted5 = weightedCriteriaScore5(
            base.rankCriteria,
            customWeights,
            weightedCriteria
          );
          return {
            ...base,
            activeScore5: weighted5 ?? 0,
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
        // The overall view keeps a product with an expert score but no
        // rating yet, after every rated one (D3).
        if (activeCriterion === 'combined' && !hasActivePersonaWeights) {
          return entry.combinedScore5 > 0;
        }
        return entry.activeScore5 > 0;
      });

    // Ranked by the score as shown, so equal-looking scores never rank by
    // a hidden decimal; the composite breaks the tie (D3).
    const shown = (score: number) =>
      !hasActivePersonaWeights &&
      (activeCriterion === 'combined' || activeCriterion === 'user')
        ? displayedScore5(score)
        : score;
    return scored.sort((a, b) => {
      if (shown(b.activeScore5) !== shown(a.activeScore5)) {
        return shown(b.activeScore5) - shown(a.activeScore5);
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
    hasActivePersonaWeights,
    weightedCriteria,
    customWeights,
    filteredReviewCounts,
  ]);

  const resolvedItemSlugBySlug = useMemo(
    () => buildLeaderboardItemSlugMap(products, itemSlugBySlug),
    [products, itemSlugBySlug]
  );

  const top3Compare = useMemo(
    () =>
      resolveLeaderboardCompareEntries(
        rankedEntries,
        resolvedItemSlugBySlug,
        3
      ),
    [rankedEntries, resolvedItemSlugBySlug]
  );

  const [copiedLeaderboardMd, setCopiedLeaderboardMd] = useState(false);
  const [versusSlugA, setVersusSlugA] = useState<string>('');
  const [versusSlugB, setVersusSlugB] = useState<string>('');

  const { effectiveVersusA, effectiveVersusB } = useMemo(
    () =>
      resolveLeaderboardEffectiveVersusSlugs(
        rankedEntries,
        versusSlugA,
        versusSlugB,
        resolvedItemSlugBySlug
      ),
    [rankedEntries, versusSlugA, versusSlugB, resolvedItemSlugBySlug]
  );

  const showdownPairs = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{
      iA: number;
      iB: number;
      a: RankedProductEntry;
      b: RankedProductEntry;
      vHref: string;
    }> = [];
    for (const [iA, iB] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const a = rankedEntries[iA];
      const b = rankedEntries[iB];
      if (
        !a ||
        !b ||
        !isValidLeaderboardVersusPair(
          a.product.slug,
          b.product.slug,
          resolvedItemSlugBySlug
        )
      ) {
        continue;
      }
      const vHref = versusHref(
        a.product.slug,
        b.product.slug,
        resolvedItemSlugBySlug
      );
      const key = vHref.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ iA, iB, a, b, vHref });
    }
    return out;
  }, [rankedEntries, resolvedItemSlugBySlug]);

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
    const rows = rankedEntries.map((entry, idx) =>
      buildLeaderboardMarkdownRow(
        entry,
        idx + 1,
        scoreDigits,
        t('unratedShort'),
        getRadarSignal(radarIndex, entry.product.slug),
        locale
      )
    );
    const md = [
      `### 🏆 Rate.vn JReviews Leaderboard (${activeCategory.toUpperCase()} - ${activeScoreLabel})`,
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
    const rows = rankedEntries.map((entry, idx) =>
      buildLeaderboardCsvRow(
        entry,
        idx + 1,
        scoreDigits,
        getRadarSignal(radarIndex, entry.product.slug)
      )
    );
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
      items: rankedEntries.map((entry, idx) =>
        buildLeaderboardJsonItem(
          entry,
          idx + 1,
          getRadarSignal(radarIndex, entry.product.slug)
        )
      ),
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
    const crit = criterionForCategory(cat, activeCriterion);
    setActiveCategory(cat);
    setActiveCriterion(crit);
    setSelectedBrand('all');
    replaceTabUrl(cat, crit);
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
  // A URL such as ?cat=earbuds&criterion=screen opens on the combined tab.
  // So does a criterion no product has a score for yet (DOS/Rate#1553).
  // Before paint, so an empty list never flashes, and the URL follows.
  useLayoutEffect(() => {
    let crit = criterionForCategory(activeCategory, activeCriterion);
    if (
      crit !== 'combined' &&
      crit !== 'user' &&
      crit !== 'expert' &&
      !scoredCriteria.includes(crit)
    ) {
      crit = 'combined';
    }
    if (crit === activeCriterion) return;
    setActiveCriterion(crit);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?cat=${activeCategory}&criterion=${crit}`
    );
  }, [activeCategory, activeCriterion, scoredCriteria]);
  useEffect(() => {
    if (hasScoredCriteria || activePersona === 'none') return;
    setActivePersona('none');
    setShowWeightSliders(false);
    setCustomWeights({
      screen: 20,
      performance: 20,
      camera: 20,
      battery: 20,
      value: 20,
    });
  }, [hasScoredCriteria, activePersona]);

  const allCriterionOptions: Array<{
    key: LeaderboardCriterionKey;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'combined',
      label: copy.critLabels.combined,
      icon: <BsTrophyFill aria-hidden="true" className="text-warning" />,
    },
    {
      key: 'user',
      label: copy.critLabels.user,
      icon: <BsStarFill aria-hidden="true" className="text-warning" />,
    },
    {
      key: 'expert',
      label: copy.critLabels.expert,
      icon: <BsShieldCheck aria-hidden="true" className="text-primary" />,
    },
    {
      key: 'screen',
      label: copy.critLabels.screen,
      icon: <BsDisplay aria-hidden="true" className="text-danger" />,
    },
    {
      key: 'performance',
      label: copy.critLabels.performance,
      icon: <BsCpu aria-hidden="true" className="text-danger" />,
    },
    {
      key: 'camera',
      label: copy.critLabels.camera,
      icon: <BsCameraFill aria-hidden="true" className="text-danger" />,
    },
    {
      key: 'battery',
      label: copy.critLabels.battery,
      icon: <BsBatteryCharging aria-hidden="true" className="text-success" />,
    },
    {
      key: 'value',
      label: copy.critLabels.value,
      icon: <BsGem aria-hidden="true" className="text-info" />,
    },
  ];
  const criterionOptions = allCriterionOptions.filter(
    (opt) =>
      opt.key === 'combined' ||
      opt.key === 'user' ||
      opt.key === 'expert' ||
      scoredCriteria.includes(opt.key)
  );

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
            {top3Compare.length >= 2 && (
              <Link
                href={leaderboardCompareHref(
                  top3Compare,
                  activeCategory,
                  'cat'
                )}
                className="btn btn-sm btn-danger rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-3 py-1"
              >
                <BsArrowLeftRight aria-hidden="true" />
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
                  aria-pressed={isSelected && !hasActivePersonaWeights}
                  onClick={() => {
                    setActivePersona('none');
                    handleSelectCriterion(opt.key);
                  }}
                  className={`btn btn-sm rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2 ${
                    isSelected && !hasActivePersonaWeights
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
        {hasScoredCriteria && (
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
                      {
                        key: 'performance',
                        label: copy.critLabels.performance,
                      },
                      { key: 'camera', label: copy.critLabels.camera },
                      { key: 'battery', label: copy.critLabels.battery },
                      { key: 'value', label: copy.critLabels.value },
                    ] as const
                  )
                    .filter((slider) => scoredCriteria.includes(slider.key))
                    .map((slider) => (
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
                            updateSingleWeight(
                              slider.key,
                              Number(e.target.value)
                            )
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
        )}

        {/* Search + Price Segment + Brand Filter Bar */}
        <div className="row g-2 border-top align-items-center pt-3">
          <div className="col-lg-5 col-md-12">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted">
                <BsSearch aria-hidden="true" />
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
                <BsFunnel aria-hidden="true" className="me-1" />{' '}
                {t('brandFilterLabel')}
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
        {rankedEntries.length >= 2 && effectiveVersusA && effectiveVersusB && (
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
                  {rankedEntries
                    .map((entry, idx) => ({ entry, idx }))
                    .filter(({ entry }) =>
                      rankedEntries.some((other) =>
                        isValidLeaderboardVersusPair(
                          entry.product.slug,
                          other.product.slug,
                          resolvedItemSlugBySlug
                        )
                      )
                    )
                    .map(({ entry, idx }) => (
                      <option
                        key={entry.product.slug}
                        value={entry.product.slug}
                      >
                        #{idx + 1} {entry.product.name} (
                        {formatRatingValue(
                          entry.activeScore5,
                          locale,
                          scoreDigits
                        )}
                        ★)
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
                    .filter((e) =>
                      isValidLeaderboardVersusPair(
                        e.product.slug,
                        effectiveVersusA,
                        resolvedItemSlugBySlug
                      )
                    )
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
                          {formatRatingValue(
                            entry.activeScore5,
                            locale,
                            scoreDigits
                          )}
                          ★)
                        </option>
                      );
                    })}
                </select>
              </div>
              <div className="col-lg-2 col-md-2">
                {effectiveVersusA &&
                  effectiveVersusB &&
                  isValidLeaderboardVersusPair(
                    effectiveVersusA,
                    effectiveVersusB,
                    resolvedItemSlugBySlug
                  ) && (
                    <Link
                      href={versusHref(
                        effectiveVersusA,
                        effectiveVersusB,
                        resolvedItemSlugBySlug
                      )}
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
              <BsTrophyFill aria-hidden="true" className="text-warning fs-4" />
              <h2 className="h4 fw-bold mb-0 text-white">{copy.podiumTitle}</h2>
            </div>
            <span className="badge bg-warning text-dark rounded-pill fw-bold px-3 py-2">
              {activeScoreLabel}
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
                          : '1px solid var(--rate-glass-border)',
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
                          <StarRating
                            value={entry.activeScore5}
                            digits={scoreDigits}
                            size="lg"
                            emptyLabel={t('unratedShort')}
                          />
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
                            <StarRating
                              value={entry.userScore5}
                              count={entry.authenticCount}
                              size="sm"
                              emptyLabel={t('unratedShort')}
                            />
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
                      {hasShownCriteria && (
                        <div
                          className="rounded-3 mb-3 p-2 px-3"
                          style={{ background: 'var(--rate-glass-bg)' }}
                        >
                          <div
                            className="text-white-50 mb-1"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {t('criteriaSourceExpert')}
                          </div>
                          {(
                            [
                              { key: 'screen', label: copy.critLabels.screen },
                              {
                                key: 'performance',
                                label: copy.critLabels.performance,
                              },
                              { key: 'camera', label: copy.critLabels.camera },
                              {
                                key: 'battery',
                                label: copy.critLabels.battery,
                              },
                              { key: 'value', label: copy.critLabels.value },
                            ] as const
                          )
                            .filter((c) => shownCriteria.includes(c.key))
                            .map((c) => {
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
                                      {val != null
                                        ? formatRatingValue(val, locale, 2)
                                        : t('criterionNoData')}
                                    </strong>
                                  </div>
                                  {val != null && (
                                    <div
                                      className="progress rounded-pill"
                                      style={{
                                        height: 4,
                                        backgroundColor:
                                          'rgba(255,255,255,0.12)',
                                      }}
                                    >
                                      <div
                                        className="progress-bar bg-warning"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}

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
                        {formatLeaderboardDisplayPriceVnd(
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
      {showdownPairs.length > 0 && top3Compare.length >= 2 && (
        <div className="rate-card rounded-4 p-md-4 mb-4 border bg-white p-3 shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <div className="rate-eyebrow mb-1">{t('showdownsEyebrow')}</div>
              <h3 className="h6 fw-bold text-dark mb-0">
                {t('showdownsHeading')}
              </h3>
            </div>
            <Link
              href={leaderboardCompareHref(
                top3Compare.slice(0, 2),
                activeCategory,
                'category'
              )}
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
            >
              {t('openCompareMatrixBtn')}
            </Link>
          </div>

          <div className="row g-3">
            {showdownPairs.map(({ iA, iB, a, b, vHref }) => {
              const deltaBadge = formatLeaderboardShowdownDelta(
                a.activeScore5,
                b.activeScore5,
                scoreDigits,
                locale
              );
              return (
                <div key={vHref} className="col-lg-4 col-md-6">
                  <div className="rounded-4 d-flex flex-column justify-content-between bg-light h-100 border p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="badge bg-dark rounded-pill small text-white">
                        #{iA + 1} vs #{iB + 1}
                      </span>
                      {deltaBadge && (
                        <span className="badge bg-danger-subtle text-danger rounded-pill small rate-tabular">
                          {deltaBadge}
                        </span>
                      )}
                    </div>

                    <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                      <div className="overflow-hidden">
                        <div className="small fw-bold text-dark text-truncate">
                          {a.product.name}
                        </div>
                        <StarRating
                          value={a.activeScore5}
                          digits={scoreDigits}
                          size="sm"
                          emptyLabel={t('unratedShort')}
                        />
                      </div>
                      <span className="badge bg-secondary rounded-pill flex-shrink-0">
                        VS
                      </span>
                      <div className="overflow-hidden text-end">
                        <div className="small fw-bold text-dark text-truncate">
                          {b.product.name}
                        </div>
                        <StarRating
                          value={b.activeScore5}
                          digits={scoreDigits}
                          size="sm"
                          emptyLabel={t('unratedShort')}
                        />
                      </div>
                    </div>

                    <div className="border-top mt-2 pt-2 text-end">
                      <IntentLink
                        href={vHref}
                        className="btn btn-sm btn-dark rounded-pill small fw-semibold w-100"
                      >
                        <BsArrowLeftRight aria-hidden="true" className="me-1" />
                        {t('view1v1DeepBtn')}
                      </IntentLink>
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
          <BsAwardFill aria-hidden="true" className="text-danger" />
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
          const minPriceText = formatLeaderboardDisplayPriceVnd(
            safeRowPrice,
            locale
          );
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
                      <StarRating
                        value={entry.userScore5}
                        count={entry.authenticCount}
                        size="sm"
                        emptyLabel={t('userUnrated')}
                      />
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
                      )
                        .filter((c) => shownCriteria.includes(c.key))
                        .map((c) => (
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
                              {(entry.criteria[c.key] ?? 0) > 0
                                ? formatRatingValue(
                                    entry.criteria[c.key] ?? 0,
                                    locale,
                                    2
                                  )
                                : t('criterionNoData')}
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
                      <div className="small text-muted">{activeScoreLabel}</div>
                      <StarRating
                        value={entry.activeScore5}
                        digits={scoreDigits}
                        emptyLabel={t('unratedShort')}
                      />
                      <div className="small text-secondary rate-tabular">
                        {minPriceText} ({entry.product.merchant_count || 0}{' '}
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
