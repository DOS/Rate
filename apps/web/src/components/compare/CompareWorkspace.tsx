'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { IconType } from 'react-icons';
import {
  BsAspectRatio,
  BsBatteryHalf,
  BsCalendar3,
  BsCamera,
  BsCpu,
  BsGlobe,
  BsPhone,
  BsReception4,
  BsSearch,
  BsShieldCheck,
  BsStar,
  BsVolumeUp,
} from 'react-icons/bs';
import { Link, useRouter } from '@/lib/navigation';
import { IntentLink } from '@/components/elementary/IntentLink';
import type {
  KeySpecs,
  MasterProduct,
  ProductSpecifications,
} from '@repo/shared-data';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  specFieldApplies,
  type CategorySpecTemplate,
  type RatingCriterionKey,
  type SpecGroupKey,
  type UseCasePresetId,
} from '@repo/shared-data/rules';
import {
  availableCategoryUseCasePresets,
  computeCustomWeightedScore5,
  defaultCategoryWeights,
  extractCategoryCriteriaScores,
  isDefaultCategoryWeights,
  mergeUseCaseQueryIntoSearch,
  normalizeCategoryWeights,
  parseUseCaseWeightsFromParams,
  resolveCategoryPreset,
  resolveLocalizedPresetName,
  sanitizeSliderWeight,
  scoredCategoryCriteriaForProducts,
  type ActiveWeightMode,
  type CategoryCriterionWeights,
  type CustomWeightedScoreResult,
} from '@/lib/use-case-weights';
import UseCaseWeightBar from './UseCaseWeightBar';
import {
  type CanonicalCategorySlug,
  MAX_VALID_VND_PRICE,
  buildPopular1v1BattlesForCategory,
  getMasterProductCategorySlug,
  getMasterProductHref,
  rankMasterProductsForLeaderboard,
  resolveCompareBatteryMah,
  resolveCompareDisplaySizeInch,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating5,
  resolveCompareExpertRating5Shown,
  resolveCompareExpertRating10,
  resolveCompareMemoryScore,
  resolveCompareRamGb,
  resolveCompareStorageGb,
  resolveProductImageUrl,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  isMultiPlatformFloor,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  type CompareTrayItem,
  getCompareTray,
  MAX_COMPARE_ITEMS,
  setCompareTray,
} from './compare-tray';
import { upsertWatchlistItem } from '@/components/watchlist/watchlist-store';
import {
  getSpecUiDictionary,
  localizeSpecValue,
  localizedSpecValue,
  normalizeStorageExpansion,
  specGroupHeading,
} from '@/lib/spec-localizer';
import { compareRowIsShown, known5g } from '@/lib/product-spec-rows';
import ContentText from '@/components/elementary/ContentText';
import {
  compareCellSegments,
  plainCompareCell,
  specPart,
  type CompareCellSegment,
} from '@/lib/compare-cell';
import { productImageUrl } from '@/lib/rate-domain-core';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  itemSlugFromProductAnswer,
  productFromProductAnswer,
  versusHref,
} from '@/lib/item-compare';
import { catalogRowSlug, type ItemCatalogRow } from '@/lib/item-directory';
import { masterSiblingKeyPrefix } from '@/lib/product-variant-links';
import StarRating from '@/components/elementary/StarRating';
import {
  formatDecimal,
  formatNumber,
  formatPriceVnd,
} from '@/lib/locale-format';
import {
  displayedScore5,
  formatRatingValue,
  formatScoreFixed,
} from '@/lib/rating-display';

interface CompareWorkspaceProps {
  initialProducts: MasterProduct[];
  catalogCandidates: MasterProduct[];
  initialCategory?: CanonicalCategorySlug;
  hasExplicitSlugs?: boolean;
  locale?: string;
  /** RATE_ITEM_MODEL on: variant slug to Item slug, for versus links. */
  itemSlugBySlug?: Readonly<Record<string, string>>;
  /**
   * `versus`: the hero above already scores the pair, so the matrix comes
   * first and the second summary is left out (DOS/Rate#1473).
   */
  layout?: 'compare' | 'versus';
  initialWeightMode?: ActiveWeightMode;
  initialCategoryWeights?: CategoryCriterionWeights;
  initialShowWeightSliders?: boolean;
}

type CompareTranslator = ReturnType<typeof useTranslations<'compare'>>;

interface SpecRowDef {
  id: string;
  label: string;
  /** The cell as plain text, for filters, exports and tests. */
  renderValue: (p: MasterProduct) => string;
  /** The cell with its spec values marked (specPart), for the matrix. */
  renderCell?: (p: MasterProduct) => string;
  /** A screen-only cell text that differs from the export (DOS/Rate#1528). */
  screenValue?: (p: MasterProduct) => string;
  numericValue?: (p: MasterProduct) => number | null;
  higherIsBetter?: boolean;
  /** Whether the category's spec template has this row (DOS/Rate#1166). */
  appliesTo?: (template: CategorySpecTemplate) => boolean;
}

interface SpecGroupDef {
  id: string;
  title: string;
  icon: IconType;
  rows: SpecRowDef[];
}

/**
 * A matrix cell: a cell with no marked spec value reads as before; otherwise
 * each spec value is localized and marked with its language when that is not
 * the page's, and the catalogue text around it is shown as is
 * (DOS/Rate#1392).
 */
function compareCellShownText(cell: string, locale: string): string {
  const segments = compareCellSegments(cell);
  if (!segments.some((s) => s.spec)) {
    return localizeSpecValue(plainCompareCell(cell), locale);
  }
  return segments
    .map((s) => (s.spec ? localizedSpecValue(s.text, locale).text : s.text))
    .join('');
}

function CompareCellText({
  segments,
  locale,
}: {
  segments: CompareCellSegment[];
  locale: string;
}) {
  if (!segments.some((s) => s.spec)) {
    const text = localizeSpecValue(
      segments.map((s) => s.text).join(''),
      locale
    );
    return <ContentText text={text} locale={locale} />;
  }
  return (
    <>
      {segments.map((segment, i) => {
        if (!segment.spec)
          return <React.Fragment key={i}>{segment.text}</React.Fragment>;
        const shown = localizedSpecValue(segment.text, locale);
        return (
          <ContentText
            key={i}
            text={shown.text}
            lang={shown.lang}
            locale={locale}
          />
        );
      })}
    </>
  );
}

function formatBool(
  val: boolean | string | undefined | null,
  t: CompareTranslator
): string {
  if (typeof val === 'string' && val.trim()) return val;
  if (val === true) return t('boolYes');
  if (val === false) return t('boolNo');
  return '-';
}

/** formatBool, with a raw string from the data marked as a spec value. */
function formatBoolPart(
  val: boolean | string | undefined | null,
  t: CompareTranslator
): string {
  const text = formatBool(val, t);
  return typeof val === 'string' && val.trim() ? specPart(text) : text;
}

function getEffectiveRating(p: MasterProduct): number {
  return resolveCompareEffectiveUserRating(p);
}

/** The rating as every page shows it: one decimal, rounded once (#1470, #1631). */
function shownRating(p: MasterProduct): number {
  return displayedScore5(getEffectiveRating(p));
}

export function buildCompareJsonProductEntry(
  p: MasterProduct,
  signal: RadarSignal | null | undefined
) {
  const u = getEffectiveRating(p);
  const e = resolveCompareExpertRating5(p);
  return {
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    userRating: u > 0 ? u : null,
    ratingScore5: u > 0 ? shownRating(p) : null,
    expertRating: e,
    minPriceVnd: sanitizeComparePriceVnd(p.min_price),
    dealRadar: radarExportFields(signal),
  };
}

/**
 * The "highest rated" verdict card's product: the one whose shown rating is
 * above every other. Two products that both show 4.9 have no winner, so the
 * card is left out, like the matrix's best mark (#1470).
 */
export function pickHighestRated(
  products: readonly MasterProduct[]
): MasterProduct | null {
  const byRating = products
    .filter((p) => shownRating(p) > 0)
    .sort((a, b) => shownRating(b) - shownRating(a));
  const [first, second] = byRating;
  if (!first) return null;
  if (second && shownRating(second) === shownRating(first)) return null;
  return first;
}

export interface CompareHeadToHeadSummary {
  bestRated: MasterProduct | null;
  lowestPrice: MasterProduct | null;
  highestMemory: MasterProduct | null;
  bestBattery: MasterProduct | null;
}

export function pickLowestPrice(
  products: readonly MasterProduct[]
): MasterProduct | null {
  const byPrice = products
    .filter((p) => sanitizeComparePriceVnd(p.min_price) > 0)
    .sort(
      (a, b) =>
        sanitizeComparePriceVnd(a.min_price) -
        sanitizeComparePriceVnd(b.min_price)
    );
  const [first, second] = byPrice;
  if (!first || !second) return null;
  if (
    sanitizeComparePriceVnd(first.min_price) ===
    sanitizeComparePriceVnd(second.min_price)
  ) {
    return null;
  }
  return first;
}

export function pickHighestMemory(
  products: readonly MasterProduct[]
): MasterProduct | null {
  const byMemory = products
    .filter((p) => resolveCompareMemoryScore(p) > 0)
    .sort(
      (a, b) => resolveCompareMemoryScore(b) - resolveCompareMemoryScore(a)
    );
  const [first, second] = byMemory;
  if (!first) return null;
  if (
    second &&
    resolveCompareMemoryScore(second) === resolveCompareMemoryScore(first)
  ) {
    return null;
  }
  return first;
}

export function pickBestBattery(
  products: readonly MasterProduct[]
): MasterProduct | null {
  const byBattery = products
    .filter((p) => (resolveCompareBatteryMah(p) ?? 0) > 0)
    .sort(
      (a, b) =>
        (resolveCompareBatteryMah(b) ?? 0) - (resolveCompareBatteryMah(a) ?? 0)
    );
  const [first, second] = byBattery;
  if (!first) return null;
  if (
    second &&
    (resolveCompareBatteryMah(second) ?? 0) ===
      (resolveCompareBatteryMah(first) ?? 0)
  ) {
    return null;
  }
  return first;
}

export function computeCompareHeadToHeadSummary(
  products: readonly MasterProduct[]
): CompareHeadToHeadSummary | null {
  if (products.length < 2) return null;
  const bestRated = pickHighestRated(products);
  const lowestPrice = pickLowestPrice(products);
  const highestMemory = pickHighestMemory(products);
  const bestBattery = pickBestBattery(products);
  if (!bestRated && !lowestPrice && !highestMemory && !bestBattery) {
    return null;
  }
  return { bestRated, lowestPrice, highestMemory, bestBattery };
}

const COMPARE_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeComparePriceVnd(value: unknown): number {
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

export function formatComparePriceVnd(
  value: unknown,
  locale?: string | null
): string {
  const safe = sanitizeComparePriceVnd(value);
  return safe > 0 ? formatPriceVnd(safe, locale) : '-';
}

export function buildCompareMarkdownMinPriceRow(
  rowLabel: string,
  items: readonly Pick<MasterProduct, 'min_price'>[],
  locale?: string | null
): string {
  return `| **${rowLabel}** | ${items
    .map((p) => formatComparePriceVnd(p.min_price, locale))
    .join(' | ')} |`;
}

function lookupCompareOwnSlug(
  map: Readonly<Record<string, string>> | null | undefined,
  slug: string
): string | undefined {
  if (!map || !slug || !Object.hasOwn(map, slug)) return undefined;
  const val = map[slug];
  return typeof val === 'string' && val ? val : undefined;
}

function setCompareOwnSlug(
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

export function isSameCompareVersusItem(
  slugA: string,
  slugB: string,
  versusSlugMap?: Readonly<Record<string, string>> | null
): boolean {
  if (!slugA || !slugB) return false;
  if (slugA.toLowerCase() === slugB.toLowerCase()) return true;
  const resolveSide = (slug: string) => {
    const mapped = lookupCompareOwnSlug(versusSlugMap, slug);
    return mapped && !mapped.toLowerCase().includes('-vs-') ? mapped : slug;
  };
  if (resolveSide(slugA).toLowerCase() === resolveSide(slugB).toLowerCase()) {
    return true;
  }
  const rawItemA = lookupCompareOwnSlug(versusSlugMap, slugA);
  const rawItemB = lookupCompareOwnSlug(versusSlugMap, slugB);
  return Boolean(
    rawItemA && rawItemB && rawItemA.toLowerCase() === rawItemB.toLowerCase()
  );
}

export function isValidCompareVersusPair(
  slugA: string,
  slugB: string,
  versusSlugMap?: Readonly<Record<string, string>> | null
): boolean {
  if (!slugA || !slugB) return false;
  if (isSameCompareVersusItem(slugA, slugB, versusSlugMap)) return false;
  if (
    lookupCompareOwnSlug(versusSlugMap, slugA)
      ?.toLowerCase()
      .includes('-vs-') ||
    lookupCompareOwnSlug(versusSlugMap, slugB)?.toLowerCase().includes('-vs-')
  ) {
    return false;
  }
  const resolveSide = (slug: string) => {
    const mapped = lookupCompareOwnSlug(versusSlugMap, slug);
    return mapped && !mapped.toLowerCase().includes('-vs-') ? mapped : slug;
  };
  const [first, second] = canonicalVersusOrder(
    resolveSide(slugA),
    resolveSide(slugB)
  );
  return Boolean(
    first &&
    second &&
    first.toLowerCase() !== second.toLowerCase() &&
    isParseableVersusPair(first.toLowerCase(), second.toLowerCase())
  );
}

export function dedupeCompareProductsByItem<T extends { slug: string }>(
  rows: readonly T[],
  versusSlugMap?: Readonly<Record<string, string>> | null
): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    if (!row || typeof row.slug !== 'string' || !row.slug) continue;
    if (
      kept.some((existing) =>
        isSameCompareVersusItem(existing.slug, row.slug, versusSlugMap)
      )
    ) {
      continue;
    }
    kept.push(row);
  }
  return kept;
}

export function isCompareCandidateSelected(
  products: readonly Pick<MasterProduct, 'slug'>[],
  candidateSlug: string,
  versusSlugMap?: Readonly<Record<string, string>> | null
): boolean {
  if (!candidateSlug) return false;
  return products.some((p) =>
    isSameCompareVersusItem(p.slug, candidateSlug, versusSlugMap)
  );
}

export function pickCompareCategoryDefaults(
  catalogCandidates: readonly MasterProduct[],
  category: CanonicalCategorySlug,
  versusSlugMap?: Readonly<Record<string, string>> | null,
  limit = 3
): MasterProduct[] {
  return dedupeCompareProductsByItem(
    catalogCandidates.filter(
      (c) => getMasterProductCategorySlug(c) === category
    ),
    versusSlugMap
  ).slice(0, limit);
}

export function buildCompareAutocompleteSuggestions(
  catalogCandidates: readonly MasterProduct[],
  remoteResults: readonly MasterProduct[] | null,
  activeCategory: CanonicalCategorySlug,
  searchQuery: string,
  versusSlugMap?: Readonly<Record<string, string>> | null,
  limit = 8
): MasterProduct[] {
  const sameCategoryCatalog = catalogCandidates.filter(
    (c) => getMasterProductCategorySlug(c) === activeCategory
  );
  const q = searchQuery.trim().toLowerCase();
  if (!q) {
    return dedupeCompareProductsByItem(
      sameCategoryCatalog,
      versusSlugMap
    ).slice(0, limit);
  }
  const localFiltered = sameCategoryCatalog.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.model.toLowerCase().includes(q) ||
      item.slug.toLowerCase().includes(q)
  );
  const sameCategoryRemote = (remoteResults ?? []).filter(
    (item) => getMasterProductCategorySlug(item) === activeCategory
  );
  return dedupeCompareProductsByItem(
    [...localFiltered, ...sameCategoryRemote],
    versusSlugMap
  ).slice(0, limit);
}

export function applyCompareCandidateSelection(
  products: readonly MasterProduct[],
  candidate: MasterProduct,
  activeCategory: CanonicalCategorySlug,
  activeReplaceIndex: number | null,
  versusSlugMap?: Readonly<Record<string, string>> | null
): {
  nextProducts: MasterProduct[];
  nextCategory: CanonicalCategorySlug;
} | null {
  const candidateCat = getMasterProductCategorySlug(candidate);
  if (candidateCat !== activeCategory) {
    return { nextProducts: [candidate], nextCategory: candidateCat };
  }

  if (
    activeReplaceIndex !== null &&
    activeReplaceIndex >= 0 &&
    activeReplaceIndex < products.length
  ) {
    if (isCompareCandidateSelected(products, candidate.slug, versusSlugMap)) {
      return null;
    }
    const next = [...products];
    next[activeReplaceIndex] = candidate;
    return {
      nextProducts: dedupeCompareProductsByItem(next, versusSlugMap),
      nextCategory: activeCategory,
    };
  }

  if (isCompareCandidateSelected(products, candidate.slug, versusSlugMap)) {
    return null;
  }
  if (products.length >= MAX_COMPARE_ITEMS) {
    return null;
  }
  return {
    nextProducts: dedupeCompareProductsByItem(
      [...products, candidate],
      versusSlugMap
    ),
    nextCategory: activeCategory,
  };
}

export function resolveCompareTrayRestore(
  trayItems: readonly CompareTrayItem[],
  catalogCandidates: readonly MasterProduct[],
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): {
  activeCategory: CanonicalCategorySlug;
  products: MasterProduct[];
  slugsCsv: string;
} | null {
  if (!Array.isArray(trayItems) || trayItems.length === 0) return null;
  const bySlug = new Map(catalogCandidates.map((c) => [c.slug, c]));
  const slugMap = buildCompareVersusSlugMap(catalogCandidates, itemSlugBySlug);
  const matched: MasterProduct[] = [];
  for (const trayItem of trayItems) {
    if (!trayItem?.slug) continue;
    const direct = bySlug.get(trayItem.slug);
    if (direct) {
      matched.push(direct);
      continue;
    }
    // Under RATE_ITEM_MODEL, catalogCandidates collapses each Item to its
    // standing variant. Match a saved non-standing variant back to its Item's
    // candidate while keeping the saved variant's own slug, name, thumbnail,
    // and price so storedProducts hydration and ?slugs= load that exact size (#1820).
    const standingSibling = slugMap
      ? catalogCandidates.find((c) =>
          isSameCompareVersusItem(c.slug, trayItem.slug, slugMap)
        )
      : undefined;
    if (standingSibling) {
      matched.push({
        ...standingSibling,
        id: `tray-${trayItem.slug}`,
        slug: trayItem.slug,
        name: trayItem.name || standingSibling.name,
        brand: trayItem.brand || standingSibling.brand,
        thumbnail: trayItem.thumbnail ?? standingSibling.thumbnail,
        min_price:
          sanitizeComparePriceVnd(trayItem.min_price) ||
          standingSibling.min_price,
        max_price: sanitizeComparePriceVnd(trayItem.min_price),
      });
    }
  }
  if (matched.length === 0) return null;
  const primaryCat = getMasterProductCategorySlug(matched[0]!);
  const mergedSlugMap = buildCompareVersusSlugMap(
    [...catalogCandidates, ...matched],
    itemSlugBySlug
  );
  const sameCatMatched = dedupeCompareProductsByItem(
    matched.filter((m) => getMasterProductCategorySlug(m) === primaryCat),
    mergedSlugMap
  );
  if (sameCatMatched.length === 0) return null;
  return {
    activeCategory: primaryCat,
    products: sameCatMatched,
    slugsCsv: sameCatMatched.map((m) => m.slug).join(','),
  };
}

export function buildCompareVersusSlugMap(
  rows: readonly MasterProduct[],
  itemSlugBySlug?: Readonly<Record<string, string>> | null,
  clientItemSlugs?: Readonly<Record<string, string>> | null
): Record<string, string> | undefined {
  const map = Object.create(null) as Record<string, string>;
  const explicitRowItemSlugs = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.slug !== 'string' || !row.slug) continue;
    const itemRow = row as ItemCatalogRow;
    if (typeof itemRow.item_slug === 'string' && itemRow.item_slug) {
      setCompareOwnSlug(map, row.slug, itemRow.item_slug);
      explicitRowItemSlugs.add(row.slug);
    }
  }
  if (itemSlugBySlug) {
    for (const [slug, itemSlug] of Object.entries(itemSlugBySlug)) {
      if (slug && typeof itemSlug === 'string' && itemSlug) {
        setCompareOwnSlug(map, slug, itemSlug);
      }
    }
  }
  if (clientItemSlugs) {
    // Confirmed client answers (including confirmed unlinked `slug -> slug`)
    // take precedence over sibling heuristics; empty entries are ignored.
    for (const [slug, itemSlug] of Object.entries(clientItemSlugs)) {
      if (slug && typeof itemSlug === 'string' && itemSlug) {
        setCompareOwnSlug(map, slug, itemSlug);
      }
    }
  }

  const itemModeActive = itemSlugBySlug != null || Object.keys(map).length > 0;
  if (itemModeActive) {
    // Propagate only genuine Item slugs (never `getItemSlugsFor`'s unlinked
    // identity fallback `slug -> slug`) across unresolved `brand:model:` siblings.
    const prefixItemSlugs = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row?.slug) continue;
      const mapped = lookupCompareOwnSlug(map, row.slug);
      if (!mapped) continue;
      const isGenuineItemSlug =
        mapped !== row.slug || explicitRowItemSlugs.has(row.slug);
      if (!isGenuineItemSlug) continue;
      const prefix = masterSiblingKeyPrefix(row.model_key);
      if (!prefix) continue;
      let set = prefixItemSlugs.get(prefix);
      if (!set) {
        set = new Set<string>();
        prefixItemSlugs.set(prefix, set);
      }
      set.add(mapped);
    }
    for (const row of rows) {
      if (!row?.slug || lookupCompareOwnSlug(map, row.slug)) continue;
      const prefix = masterSiblingKeyPrefix(row.model_key);
      const set = prefix ? prefixItemSlugs.get(prefix) : undefined;
      if (set && set.size === 1) {
        setCompareOwnSlug(map, row.slug, [...set][0]!);
      }
    }
  }

  return itemSlugBySlug != null || Object.keys(map).length > 0
    ? map
    : undefined;
}

export function resolveComparePopularBattles(
  catalogCandidates: MasterProduct[],
  category: CanonicalCategorySlug,
  versusSlugMap?: Readonly<Record<string, string>> | null,
  maxPairs = 3
) {
  const mergedMap =
    buildCompareVersusSlugMap(catalogCandidates, versusSlugMap) ??
    (Object.create(null) as Record<string, string>);

  const ranked = rankMasterProductsForLeaderboard(catalogCandidates, {
    category,
    criterion: 'combined',
  });
  const seenItems = new Set<string>();
  const uniqueItemCandidates: MasterProduct[] = [];
  for (const entry of ranked) {
    const slug = entry.product.slug;
    if (!slug) continue;
    const mappedItem = lookupCompareOwnSlug(mergedMap, slug);
    if (mappedItem && mappedItem.toLowerCase().includes('-vs-')) {
      continue;
    }
    const itemKey = (mappedItem || slug).toLowerCase();
    if (seenItems.has(itemKey)) {
      continue;
    }
    seenItems.add(itemKey);
    uniqueItemCandidates.push(
      mappedItem && mappedItem !== slug
        ? ({
            ...entry.product,
            item_slug: mappedItem,
          } as MasterProduct)
        : entry.product
    );
  }

  const rawBattles = buildPopular1v1BattlesForCategory(
    uniqueItemCandidates,
    category,
    20
  );
  const seenHrefs = new Set<string>();
  const resolved: typeof rawBattles = [];
  for (const battle of rawBattles) {
    const slugA = battle.productA.slug;
    const slugB = battle.productB.slug;
    if (!isValidCompareVersusPair(slugA, slugB, mergedMap)) {
      continue;
    }
    const href = versusHref(slugA, slugB, mergedMap);
    const nextVersusSlug = href.replace(/^\/compare\//, '');
    const hrefKey = href.toLowerCase();
    if (seenHrefs.has(hrefKey)) continue;
    seenHrefs.add(hrefKey);
    resolved.push({
      ...battle,
      versusSlug: nextVersusSlug,
      versusHref: href,
    });
    if (resolved.length >= maxPairs) break;
  }
  return resolved;
}

export const MAX_COMPARE_ITEM_LOOKUP_ATTEMPTS = 2;
export const COMPARE_ITEM_LOOKUP_RETRY_MS = 800;
export const COMPARE_ITEM_LOOKUP_TIMEOUT_MS = 5_000;

export interface CompareItemLookupFailure {
  attempts: number;
  retryAt: number;
}

export function parseCompareItemLookupAnswer(
  responseOk: boolean,
  json: unknown,
  slug: string
): string | null {
  if (
    !responseOk ||
    !json ||
    typeof json !== 'object' ||
    (json as { ok?: unknown }).ok !== true
  ) {
    return null;
  }
  return itemSlugFromProductAnswer(json, slug);
}

export function planCompareItemLookupBatch(
  candidateSlugs: readonly string[],
  itemSlugBySlug: Readonly<Record<string, string>> | null | undefined,
  clientItemSlugs: Readonly<Record<string, string>>,
  failures: ReadonlyMap<string, CompareItemLookupFailure>,
  now: number
): { readyToFetch: string[]; earliestRetryAt: number } {
  const readyToFetch: string[] = [];
  let earliestRetryAt = Number.POSITIVE_INFINITY;
  for (const slug of candidateSlugs) {
    if (
      !slug ||
      lookupCompareOwnSlug(itemSlugBySlug, slug) ||
      Object.hasOwn(clientItemSlugs, slug)
    ) {
      continue;
    }
    const failure = failures.get(slug);
    const attempts = failure?.attempts ?? 0;
    if (attempts >= MAX_COMPARE_ITEM_LOOKUP_ATTEMPTS) continue;
    const retryAt = failure?.retryAt ?? 0;
    if (now >= retryAt) {
      readyToFetch.push(slug);
    } else if (retryAt < earliestRetryAt) {
      earliestRetryAt = retryAt;
    }
  }
  return { readyToFetch, earliestRetryAt };
}

export function applyCompareItemLookupOutcomes(
  entries: ReadonlyArray<readonly [string, string | null]>,
  failures: Map<string, CompareItemLookupFailure>,
  finishedAt: number,
  initialEarliestRetryAt = Number.POSITIVE_INFINITY
): { confirmed: Array<[string, string]>; nextRetryAt: number } {
  const confirmed: Array<[string, string]> = [];
  let nextRetryAt = initialEarliestRetryAt;
  for (const [slug, resolved] of entries) {
    if (resolved) {
      failures.delete(slug);
      confirmed.push([slug, resolved]);
    } else {
      const prevAttempts = failures.get(slug)?.attempts ?? 0;
      const attempts = prevAttempts + 1;
      const delayMs = COMPARE_ITEM_LOOKUP_RETRY_MS * 2 ** prevAttempts;
      const retryAt = finishedAt + delayMs;
      failures.set(slug, { attempts, retryAt });
      if (
        attempts < MAX_COMPARE_ITEM_LOOKUP_ATTEMPTS &&
        retryAt < nextRetryAt
      ) {
        nextRetryAt = retryAt;
      }
    }
  }
  return { confirmed, nextRetryAt };
}

/** A retry render can join an existing lookup. Only its owner may settle it. */
export function startCompareItemLookup(
  slug: string,
  inFlight: Map<string, AbortController>,
  onSettled: (slug: string, itemSlug: string | null) => void,
  fetchProduct: typeof fetch = fetch
): void {
  if (inFlight.has(slug)) return;
  const controller = new AbortController();
  inFlight.set(slug, controller);
  const timeout = setTimeout(() => {
    settle(null);
    controller.abort();
  }, COMPARE_ITEM_LOOKUP_TIMEOUT_MS);

  function settle(itemSlug: string | null) {
    if (inFlight.get(slug) !== controller) return;
    clearTimeout(timeout);
    controller.signal.onabort = null;
    inFlight.delete(slug);
    if (!controller.signal.aborted) onSettled(slug, itemSlug);
  }

  controller.signal.onabort = () => settle(null);
  void (async () => {
    let itemSlug: string | null = null;
    try {
      const response = await fetchProduct(
        `/api/v1/rate/products/${encodeURIComponent(slug)}`,
        { signal: controller.signal }
      );
      if (response.ok) {
        itemSlug = parseCompareItemLookupAnswer(
          true,
          await response.json(),
          slug
        );
      }
    } catch {
      // A failed request or body read follows the same per-slug backoff.
    }
    settle(itemSlug);
  })();
}

export type CompareReplaceTranslate = (key: 'replaceDeviceBtn') => string;

export type CompareAddSlotTranslate = (
  key: 'addSameCategoryTitle',
  values: { unit: string }
) => string;

export function resolveCompareReplaceButtonA11y(
  t: CompareReplaceTranslate,
  options: {
    productName: unknown;
    isReplacing: boolean;
  }
): {
  visibleLabel: string;
  ariaLabel: string;
  ariaPressed: boolean;
} {
  const visibleLabel = t('replaceDeviceBtn')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(COMPARE_CONTROL_CHARS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanName =
    typeof options.productName === 'string'
      ? options.productName
          .replace(/[\r\n\t]+/g, ' ')
          .replace(COMPARE_CONTROL_CHARS_RE, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  return {
    visibleLabel,
    ariaLabel:
      cleanName && visibleLabel
        ? `${visibleLabel}: ${cleanName}`
        : visibleLabel || cleanName,
    ariaPressed: Boolean(options.isReplacing),
  };
}

export function resolveCompareAddSlotAriaLabel(
  t: CompareAddSlotTranslate,
  unitLabel: string
): string {
  return t('addSameCategoryTitle', { unit: unitLabel })
    .replace(/[\r\n\t]+/g, ' ')
    .replace(COMPARE_CONTROL_CHARS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const COMPARE_AUTOCOMPLETE_LIST_ID = 'compare-autocomplete-listbox';
export const COMPARE_AUTOCOMPLETE_HEADING_ID = 'compare-autocomplete-heading';

export function resolveCompareAutocompleteA11y(options: {
  dropdownOpen: boolean;
  productCount: number;
  activeReplaceIndex: number | null;
  maxItems?: number;
}): {
  role: 'combobox';
  ariaAutocomplete: 'list';
  ariaExpanded: boolean;
  ariaControls: string;
  disabled: boolean;
} {
  const max = options.maxItems ?? MAX_COMPARE_ITEMS;
  const canOpen =
    options.productCount < max || options.activeReplaceIndex !== null;
  return {
    role: 'combobox',
    ariaAutocomplete: 'list',
    ariaExpanded: Boolean(options.dropdownOpen && canOpen),
    ariaControls: COMPARE_AUTOCOMPLETE_LIST_ID,
    disabled: !canOpen,
  };
}

export function shouldDismissCompareOnOutsidePointerDown(
  target: { closest?: (selector: string) => unknown } | null | undefined,
  isInsideSearchBox: boolean
): boolean {
  if (isInsideSearchBox) return false;
  if (
    target &&
    typeof target.closest === 'function' &&
    target.closest('[data-compare-slot-trigger]')
  ) {
    return false;
  }
  return true;
}

export function shouldDismissCompareOnFocusOut(
  relatedTarget: { closest?: (selector: string) => unknown } | null | undefined,
  isInsideSearchBox: boolean
): boolean {
  if (!relatedTarget || isInsideSearchBox) return false;
  if (
    typeof relatedTarget.closest === 'function' &&
    relatedTarget.closest('[data-compare-slot-trigger]')
  ) {
    return false;
  }
  return true;
}

export function nextCompareReplaceState(
  currentReplaceIndex: number | null,
  clickedIndex: number
): {
  replaceIndex: number | null;
  dropdownOpen: boolean;
} {
  if (currentReplaceIndex === clickedIndex) {
    return { replaceIndex: null, dropdownOpen: false };
  }
  return { replaceIndex: clickedIndex, dropdownOpen: true };
}

export const COMPARE_REPLACE_FOCUS_DELAY_MS = 50;

export interface CompareReplaceFocusTimerRef {
  current: ReturnType<typeof setTimeout> | null;
}

export interface CompareReplaceIndexRef {
  current: number | null;
}

export function cancelPendingCompareReplaceFocus(
  timerRef: CompareReplaceFocusTimerRef,
  scheduledReplaceRef?: CompareReplaceIndexRef
): void {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  if (scheduledReplaceRef) {
    scheduledReplaceRef.current = null;
  }
}

export function syncCompareReplaceFocusState(options: {
  timerRef: CompareReplaceFocusTimerRef;
  activeReplaceRef: CompareReplaceIndexRef;
  scheduledReplaceRef: CompareReplaceIndexRef;
  activeReplaceIndex: number | null;
}): void {
  const {
    timerRef,
    activeReplaceRef,
    scheduledReplaceRef,
    activeReplaceIndex,
  } = options;
  activeReplaceRef.current = activeReplaceIndex;
  if (
    activeReplaceIndex === null ||
    activeReplaceIndex !== scheduledReplaceRef.current
  ) {
    cancelPendingCompareReplaceFocus(timerRef, scheduledReplaceRef);
  }
}

export function scheduleCompareReplaceFocus(options: {
  timerRef: CompareReplaceFocusTimerRef;
  activeReplaceRef: CompareReplaceIndexRef;
  scheduledReplaceRef: CompareReplaceIndexRef;
  expectedReplaceIndex: number | null;
  focusInput: () => void;
  delayMs?: number;
}): void {
  const {
    timerRef,
    activeReplaceRef,
    scheduledReplaceRef,
    expectedReplaceIndex,
    focusInput,
    delayMs = COMPARE_REPLACE_FOCUS_DELAY_MS,
  } = options;
  cancelPendingCompareReplaceFocus(timerRef, scheduledReplaceRef);
  activeReplaceRef.current = expectedReplaceIndex;
  if (expectedReplaceIndex === null) {
    return;
  }
  scheduledReplaceRef.current = expectedReplaceIndex;
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    const stillActive =
      activeReplaceRef.current === expectedReplaceIndex &&
      scheduledReplaceRef.current === expectedReplaceIndex;
    scheduledReplaceRef.current = null;
    if (stillActive) {
      focusInput();
    }
  }, delayMs);
}

export function sanitizeCompareMerchantCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

export function sanitizeCompareMarkdownCell(
  value: unknown,
  fallback = '-'
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(COMPARE_CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || fallback;
}

function buildCategoryTabs(t: CompareTranslator): Array<{
  slug: CanonicalCategorySlug;
  label: string;
  unitLabel: string;
}> {
  return [
    {
      slug: 'smartphones',
      label: t('catSmartphones'),
      unitLabel: t('catSmartphonesUnit'),
    },
    {
      slug: 'tablets',
      label: t('catTablets'),
      unitLabel: t('catTabletsUnit'),
    },
    {
      slug: 'laptops',
      label: t('catLaptops'),
      unitLabel: t('catLaptopsUnit'),
    },
    {
      slug: 'smartwatches',
      label: t('catSmartwatches'),
      unitLabel: t('catSmartwatchesUnit'),
    },
    {
      slug: 'earbuds',
      label: t('catEarbuds'),
      unitLabel: t('catEarbudsUnit'),
    },
  ];
}

// Rows mark their spec values; renderValue hands everything but the matrix
// cells the plain text (DOS/Rate#1392).
function withPlainValues(groups: SpecGroupDef[]): SpecGroupDef[] {
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      renderCell: row.renderValue,
      renderValue: (p: MasterProduct) => plainCompareCell(row.renderValue(p)),
    })),
  }));
}

export function buildSpecGroups(
  t: CompareTranslator,
  locale?: string | null
): SpecGroupDef[] {
  return withPlainValues([
    {
      id: 'market_trust',
      title: t('group0Title'),
      icon: BsStar,
      rows: [
        {
          id: 'rating_weighted',
          label: t('rowRatingWeighted'),
          renderValue: (p) => {
            const r = getEffectiveRating(p);
            const count = p.authentic_review_count || p.total_reviews || 0;
            return r > 0
              ? t('valAuthenticReviews', {
                  rating: formatRatingValue(r, locale),
                  count,
                })
              : t('valNoReviews');
          },
          // The best mark compares the rating as shown, at one decimal, so
          // 4.89 against 4.87 (both 4.9) is a tie, not a win (#1470).
          numericValue: (p) => {
            const r = getEffectiveRating(p);
            return r > 0 ? shownRating(p) : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'expert_rating',
          label: t('rowExpertRating'),
          renderValue: (p) => {
            const exp5 = resolveCompareExpertRating5Shown(p);
            return exp5 != null
              ? `Lab ${formatRatingValue(exp5, locale, 1)} / ${formatDecimal(5, locale, 1)}`
              : '-';
          },
          // On screen the lab score reads on 10, as the product page shows it.
          screenValue: (p) => {
            const exp10 = resolveCompareExpertRating10(p);
            return exp10 != null
              ? `Lab ${formatDecimal(exp10, locale, 1)}/10`
              : '-';
          },
          // Compared on the lab score on 10 the screen shows (one decimal).
          numericValue: (p) => resolveCompareExpertRating10(p),
          higherIsBetter: true,
        },
        {
          id: 'min_price',
          label: t('rowMinPrice'),
          renderValue: (p) => formatComparePriceVnd(p.min_price, locale),
          numericValue: (p) => {
            const safe = sanitizeComparePriceVnd(p.min_price);
            return safe > 0 ? safe : null;
          },
          higherIsBetter: false,
        },
        {
          id: 'price_range',
          label: t('rowPriceRange'),
          renderValue: (p) => {
            const min = sanitizeComparePriceVnd(p.min_price);
            const max = sanitizeComparePriceVnd(p.max_price);
            if (min <= 0) return '-';
            if (max > min) {
              return `${formatPriceVnd(min, locale)} - ${formatPriceVnd(max, locale)}`;
            }
            return formatPriceVnd(min, locale);
          },
        },
        {
          id: 'merchant_count',
          label: t('rowMerchantCount'),
          renderValue: (p) =>
            t('valSourcesCount', {
              count: sanitizeCompareMerchantCount(p.merchant_count),
            }),
          numericValue: (p) => sanitizeCompareMerchantCount(p.merchant_count),
          higherIsBetter: true,
        },
        {
          id: 'value_per_point',
          label: t('rowValuePerPoint'),
          renderValue: (p) => {
            const min = sanitizeComparePriceVnd(p.min_price);
            if (min <= 0) return '-';
            const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
            const exp5 = resolveCompareExpertRating5(p);
            const e = exp5 != null ? exp5 * 2 : null;
            const combined10 =
              u != null && e != null
                ? u * 2 * 0.6 + e * 0.4
                : u != null
                  ? u * 2
                  : (e ?? 0);
            if (combined10 <= 0) return '-';
            const costPerPt = Math.round(min / combined10);
            return t('valPerPoint', {
              cost: formatNumber(costPerPt, locale),
            });
          },
          numericValue: (p) => {
            const min = sanitizeComparePriceVnd(p.min_price);
            if (min <= 0) return null;
            const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
            const exp5 = resolveCompareExpertRating5(p);
            const e = exp5 != null ? exp5 * 2 : null;
            const combined10 =
              u != null && e != null
                ? u * 2 * 0.6 + e * 0.4
                : u != null
                  ? u * 2
                  : (e ?? 0);
            return combined10 > 0 ? Math.round(min / combined10) : null;
          },
          higherIsBetter: false,
        },
        {
          id: 'daily_cost_2y',
          label: t('rowDailyCost2y'),
          renderValue: (p) => {
            const min = sanitizeComparePriceVnd(p.min_price);
            if (min <= 0) return '-';
            const daily = Math.round(min / 730);
            return t('valPerDay', { cost: formatNumber(daily, locale) });
          },
          numericValue: (p) => {
            const min = sanitizeComparePriceVnd(p.min_price);
            return min > 0 ? Math.round(min / 730) : null;
          },
          higherIsBetter: false,
        },
      ],
    },
    {
      id: 'display',
      title: '1. Display',
      icon: BsPhone,
      rows: [
        {
          id: 'display_size',
          label: t('rowDisplaySize'),
          appliesTo: (tpl) => tpl.screen,
          renderValue: (p) => {
            const size = resolveCompareDisplaySizeInch(p);
            return size != null ? `${size}"` : '-';
          },
          numericValue: (p) => resolveCompareDisplaySizeInch(p),
          higherIsBetter: true,
        },
        {
          id: 'display_type',
          label: t('rowDisplayType'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specPart(specs.display?.type || keySpecs.screen || '-');
          },
        },
        {
          id: 'display_resolution',
          label: t('rowDisplayResolution'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const res = specs.display?.resolution || '-';
            // A resolution text that already names its density keeps it
            // once (DOS/Rate#1214).
            const ppi =
              specs.display?.ppi && !/ppi\b/i.test(res)
                ? ` (${specs.display.ppi} ppi)`
                : '';
            return res === '-' && !ppi ? '-' : `${specPart(res)}${ppi}`;
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.ppi ? Number(specs.display.ppi) : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'display_refresh',
          label: t('rowDisplayRefresh'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.refresh_rate_hz
              ? `${specs.display.refresh_rate_hz} Hz`
              : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.refresh_rate_hz
              ? Number(specs.display.refresh_rate_hz)
              : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'display_protection',
          label: t('rowDisplayProtection'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.display?.protection,
              specs.display?.features,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'hardware',
      title: '2. Hardware',
      icon: BsCpu,
      rows: [
        {
          id: 'hw_chipset',
          label: t('rowHwChipset'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specPart(specs.hardware?.chipset || keySpecs.chip || '-');
          },
        },
        {
          id: 'hw_cpu_gpu',
          appliesTo: (tpl) => specFieldApplies(tpl, 'hardware', 'cpu'),
          label: t('rowHwCpuGpu'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [specs.hardware?.cpu, specs.hardware?.gpu].filter(
              Boolean
            );
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
        {
          id: 'hw_ram',
          appliesTo: (tpl) => tpl.ram,
          label: t('rowHwRam'),
          renderValue: (p) => {
            const ram = resolveCompareRamGb(p);
            return ram != null ? `${ram} GB` : '-';
          },
          numericValue: (p) => resolveCompareRamGb(p),
          higherIsBetter: true,
        },
        {
          id: 'hw_storage',
          appliesTo: (tpl) => tpl.storage,
          label: t('rowHwStorage'),
          renderValue: (p) => {
            const rom = resolveCompareStorageGb(p);
            if (!rom) return '-';
            return rom >= 1024 ? `${rom / 1024} TB` : `${rom} GB`;
          },
          numericValue: (p) => resolveCompareStorageGb(p),
          higherIsBetter: true,
        },
        {
          id: 'hw_os_exp',
          appliesTo: (tpl) =>
            specFieldApplies(tpl, 'hardware', 'os') ||
            specFieldApplies(tpl, 'hardware', 'storage_expansion'),
          label: t('rowHwOsExp'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specPart(specs.hardware?.os),
              specs.hardware?.storage_expansion
                ? t('valCardSlotPrefix', {
                    value: specPart(
                      normalizeStorageExpansion(
                        specs.hardware.storage_expansion
                      )
                    ),
                  })
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'camera',
      title: '3. Camera',
      icon: BsCamera,
      rows: [
        {
          id: 'cam_main',
          label: t('rowCamMain'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specPart(
              specs.camera?.main_camera || keySpecs.camera || '-'
            );
          },
        },
        {
          id: 'cam_second',
          label: t('rowCamSecond'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(specs.camera?.second_camera || '-');
          },
        },
        {
          id: 'cam_third_fourth',
          label: t('rowCamThirdFourth'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.camera?.third_camera,
              specs.camera?.fourth_camera,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' + ') : '-';
          },
        },
        {
          id: 'cam_video',
          label: t('rowCamVideo'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.camera?.video_recording,
              specs.camera?.flash,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
        {
          id: 'cam_front',
          label: t('rowCamFront'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(specs.camera?.front_camera || '-');
          },
        },
      ],
    },
    {
      id: 'battery',
      title: '4. Battery',
      icon: BsBatteryHalf,
      rows: [
        {
          id: 'bat_capacity',
          label: t('rowBatCapacity'),
          renderValue: (p) => {
            const mah = resolveCompareBatteryMah(p);
            return mah != null ? `${mah} mAh` : '-';
          },
          numericValue: (p) => resolveCompareBatteryMah(p),
          higherIsBetter: true,
        },
        {
          id: 'bat_fast_charge',
          label: t('rowBatFastCharge'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.battery?.fast_charging_w
              ? `${specs.battery.fast_charging_w} W`
              : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.battery?.fast_charging_w
              ? Number(specs.battery.fast_charging_w)
              : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'bat_details',
          label: t('rowBatDetails'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            // Each part marked on its own, the catalogue prefix left out
            // (DOS/Rate#1392).
            const parts = [
              specPart(specs.battery?.type),
              specPart(specs.battery?.charging),
              specs.battery?.reverse_charging
                ? t('valReverseChargePrefix', {
                    value: formatBoolPart(specs.battery.reverse_charging, t),
                  })
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'design',
      title: '5. Design',
      icon: BsAspectRatio,
      rows: [
        {
          id: 'design_dim',
          label: t('rowDesignDim'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(specs.design?.dimensions || '-');
          },
        },
        {
          id: 'design_weight',
          label: t('rowDesignWeight'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.weight_g ? `${specs.design.weight_g} g` : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.weight_g
              ? Number(specs.design.weight_g)
              : null;
          },
          higherIsBetter: false,
        },
        {
          id: 'design_materials',
          label: t('rowDesignMaterials'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(
              specs.design?.materials || specs.design?.build || '-'
            );
          },
        },
        {
          id: 'design_resistance',
          label: t('rowDesignResistance'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(specs.design?.resistance || '-');
          },
        },
        {
          id: 'design_bio_colors',
          label: t('rowDesignBioColors'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const colors =
              specs.design?.colors && specs.design.colors.length > 0
                ? specs.design.colors.join(', ')
                : p.colors && p.colors.length > 0
                  ? p.colors.join(', ')
                  : null;
            const parts = [
              specPart(specs.design?.biometrics),
              colors ? t('valColorsPrefix', { value: specPart(colors) }) : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'cellular',
      title: '6. Cellular',
      icon: BsReception4,
      rows: [
        {
          id: 'cell_5g',
          appliesTo: (tpl) => tpl.has5g,
          label: t('rowCell5g'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            // Unknown stays empty, not "4G LTE" (DOS/Rate#1193).
            const has5g = known5g(specs.cellular?.has_5g, p.has_5g);
            if (has5g === true) return t('valHas5g');
            return has5g === false ? t('val4gLte') : '-';
          },
        },
        {
          id: 'cell_sim',
          label: t('rowCellSim'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.cellular?.sim_type,
              specs.cellular?.technology,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
        {
          id: 'cell_bands',
          label: t('rowCellBands'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.cellular?.bands_5g,
              specs.cellular?.data_speed,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'connectivity',
      title: '7. Connectivity',
      icon: BsGlobe,
      rows: [
        {
          id: 'conn_wlan_bt',
          label: t('rowConnWlanBt'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.connectivity?.wlan
                ? `Wi-Fi: ${specs.connectivity.wlan}`
                : null,
              specs.connectivity?.bluetooth
                ? `BT: ${specs.connectivity.bluetooth}`
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
        {
          id: 'conn_nfc',
          appliesTo: (tpl) => specFieldApplies(tpl, 'connectivity', 'nfc'),
          label: t('rowConnNfc'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return formatBoolPart(specs.connectivity?.nfc, t);
          },
        },
        {
          id: 'conn_usb_gps',
          label: t('rowConnUsbGps'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.connectivity?.usb,
              specs.connectivity?.location,
              specs.connectivity?.sensors,
            ].filter(Boolean);
            return parts.map(specPart).join(' | ') || '-';
          },
        },
      ],
    },
    {
      id: 'multimedia',
      title: '8. Multimedia',
      icon: BsVolumeUp,
      rows: [
        {
          id: 'mm_speaker',
          label: t('rowMmSpeaker'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specPart(specs.multimedia?.loudspeaker || '-');
          },
        },
        {
          id: 'mm_jack_audio',
          label: t('rowMmJackAudio'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const jack =
              specs.multimedia?.headphone_jack_35mm !== undefined
                ? `3.5mm: ${formatBoolPart(specs.multimedia.headphone_jack_35mm, t)}`
                : null;
            const parts = [
              jack,
              specPart(specs.multimedia?.audio_features),
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'availability',
      title: '9. Availability',
      icon: BsCalendar3,
      rows: [
        {
          id: 'avail_announced',
          label: t('rowAvailAnnounced'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.availability?.announced,
              specs.availability?.status,
            ].filter(Boolean);
            return parts.length > 0 ? parts.map(specPart).join(' | ') : '-';
          },
        },
        {
          id: 'avail_msrp',
          label: t('rowAvailMsrp'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [specs.availability?.prices_msrp, p.model_key].filter(
              Boolean
            );
            return parts.map(specPart).join(' | ') || '-';
          },
        },
      ],
    },
    {
      id: 'regulatory',
      title: '10. Regulatory',
      icon: BsShieldCheck,
      rows: [
        {
          id: 'reg_cert',
          label: t('rowRegCert'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            // Parts marked one by one: a prefixed "-" stays catalogue text.
            const parts = [
              specPart(specs.regulatory?.certifications),
              specPart(specs.regulatory?.fcc_approval),
              specs.regulatory?.sar_head
                ? t('valSarHeadPrefix', {
                    value: specPart(specs.regulatory.sar_head),
                  })
                : null,
              specs.regulatory?.sar_body
                ? t('valSarBodyPrefix', {
                    value: specPart(specs.regulatory.sar_body),
                  })
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
  ]);
}

/**
 * The spec groups and rows a category's template has, in its order, so an
 * earbud shows no screen, RAM or camera row and a watch no 5G row
 * (DOS/Rate#1142, DOS/Rate#1166). The market group always comes first.
 */
export function filterSpecGroupsForCategory(
  groups: readonly SpecGroupDef[],
  categorySlug: string
): SpecGroupDef[] {
  const template = getCategorySpecTemplate(categorySlug);
  const order = (id: string) =>
    id === 'market_trust' ? -1 : template.groups.indexOf(id as SpecGroupKey);
  return groups
    .filter((group) => order(group.id) !== -1 || group.id === 'market_trust')
    .sort((a, b) => order(a.id) - order(b.id))
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => row.appliesTo?.(template) ?? true),
    }))
    .filter((group) => group.rows.length > 0);
}

function CompareUrlWeightsSync({
  categorySlug,
  onSync,
}: {
  readonly categorySlug: string;
  readonly onSync: (
    cat: string,
    rawPreset: string | null,
    rawWeights: string | null
  ) => void;
}) {
  const searchParams = useSearchParams();
  const rawPreset = searchParams.get('preset');
  const rawWeights = searchParams.get('weights');
  useEffect(
    () => onSync(categorySlug, rawPreset, rawWeights),
    [categorySlug, rawPreset, rawWeights, onSync]
  );
  return null;
}

export default function CompareWorkspace({
  initialProducts,
  catalogCandidates,
  initialCategory = 'smartphones',
  hasExplicitSlugs = false,
  locale = 'vi',
  itemSlugBySlug,
  layout = 'compare',
  initialWeightMode = 'default',
  initialCategoryWeights,
  initialShowWeightSliders = false,
}: CompareWorkspaceProps) {
  const t = useTranslations('compare');
  const router = useRouter();
  const specDict = useMemo(() => getSpecUiDictionary(locale), [locale]);
  const categoryTabs = useMemo(() => buildCategoryTabs(t), [t]);
  const allSpecGroups = useMemo(() => buildSpecGroups(t, locale), [t, locale]);
  const [activeCategory, setActiveCategory] = useState<CanonicalCategorySlug>(
    () =>
      initialProducts.length > 0
        ? getMasterProductCategorySlug(initialProducts[0]!)
        : initialCategory
  );
  const [storedProducts, setProducts] = useState<MasterProduct[]>(() => {
    const targetCat =
      initialProducts.length > 0
        ? getMasterProductCategorySlug(initialProducts[0]!)
        : initialCategory;
    const sameCat = initialProducts.filter(
      (p) => getMasterProductCategorySlug(p) === targetCat
    );
    if (hasExplicitSlugs) return sameCat;
    return dedupeCompareProductsByItem(
      sameCat,
      buildCompareVersusSlugMap(
        [...catalogCandidates, ...initialProducts],
        itemSlugBySlug
      )
    );
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<MasterProduct[] | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [showDiffOnly, setShowDiffOnly] = useState(false);
  const [highlightWinners, setHighlightWinners] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [weightMode, setWeightMode] =
    useState<ActiveWeightMode>(initialWeightMode);
  const [categoryWeights, setCategoryWeights] =
    useState<CategoryCriterionWeights>(() => {
      const cat =
        initialProducts.length > 0
          ? getMasterProductCategorySlug(initialProducts[0]!)
          : initialCategory;
      if (initialCategoryWeights) {
        return normalizeCategoryWeights(cat, initialCategoryWeights)
          .sliderWeights;
      }
      if (initialWeightMode !== 'default' && initialWeightMode !== 'custom') {
        return normalizeCategoryWeights(
          cat,
          resolveCategoryPreset(cat, initialWeightMode).weights
        ).sliderWeights;
      }
      return defaultCategoryWeights(cat);
    });
  const [showWeightSliders, setShowWeightSliders] = useState(
    initialShowWeightSliders
  );
  const radarIndex = useDealRadarIndex();
  // Every row, verdict and export reads the category's view of a product,
  // like the product page (DOS/Rate#1166).
  const products = useMemo(
    () =>
      storedProducts.map((p) => applyCategorySpecTemplate(activeCategory, p)),
    [storedProducts, activeCategory]
  );
  const scoredCompareCriteria = useMemo(
    () =>
      scoredCategoryCriteriaForProducts(
        activeCategory,
        products.map((p) => ({ product: p }))
      ),
    [activeCategory, products]
  );
  const availableComparePresets = useMemo(
    () =>
      availableCategoryUseCasePresets(activeCategory, scoredCompareCriteria),
    [activeCategory, scoredCompareCriteria]
  );
  const canWeighCompare =
    layout === 'compare' &&
    products.length >= 2 &&
    availableComparePresets.length > 0;

  const replaceCompareWeightQuery = useCallback(
    (
      cat: CanonicalCategorySlug,
      nextMode: ActiveWeightMode,
      nextWeights: CategoryCriterionWeights,
      available: readonly RatingCriterionKey[]
    ) => {
      if (typeof window === 'undefined' || layout !== 'compare') return;
      const merged =
        available.length > 0
          ? mergeUseCaseQueryIntoSearch(
              window.location.search,
              cat,
              nextMode,
              nextWeights,
              available
            )
          : mergeUseCaseQueryIntoSearch(
              window.location.search,
              cat,
              'default',
              defaultCategoryWeights(cat),
              []
            );
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${merged}`
      );
    },
    [layout]
  );

  const handleCompareUrlWeightsSync = useCallback(
    (cat: string, rawPreset: string | null, rawWeights: string | null) => {
      const parsed = parseUseCaseWeightsFromParams(cat, {
        preset: rawPreset ?? undefined,
        weights: rawWeights ?? undefined,
      });
      setWeightMode(parsed.mode);
      setCategoryWeights(parsed.weights);
    },
    []
  );

  useEffect(() => {
    if (layout !== 'compare') return;
    if (!canWeighCompare) {
      if (weightMode !== 'default' || showWeightSliders) {
        const defaults = defaultCategoryWeights(activeCategory);
        setWeightMode('default');
        setShowWeightSliders(false);
        setCategoryWeights(defaults);
        replaceCompareWeightQuery(activeCategory, 'default', defaults, []);
      }
      return;
    }
    if (
      weightMode !== 'default' &&
      weightMode !== 'custom' &&
      !availableComparePresets.some((p) => p.id === weightMode)
    ) {
      const defaults = defaultCategoryWeights(activeCategory);
      setWeightMode('default');
      setCategoryWeights(defaults);
      replaceCompareWeightQuery(
        activeCategory,
        'default',
        defaults,
        scoredCompareCriteria
      );
    }
  }, [
    layout,
    canWeighCompare,
    weightMode,
    showWeightSliders,
    activeCategory,
    availableComparePresets,
    scoredCompareCriteria,
    replaceCompareWeightQuery,
  ]);

  const handleSelectComparePreset = (presetId: UseCasePresetId) => {
    const preset = resolveCategoryPreset(activeCategory, presetId);
    const norm = normalizeCategoryWeights(
      activeCategory,
      preset.weights,
      scoredCompareCriteria
    );
    setWeightMode(preset.id);
    setCategoryWeights(norm.sliderWeights);
    replaceCompareWeightQuery(
      activeCategory,
      preset.id,
      norm.sliderWeights,
      scoredCompareCriteria
    );
  };

  const handleUpdateCompareWeight = (key: RatingCriterionKey, val: number) => {
    const candidate: CategoryCriterionWeights = {
      ...categoryWeights,
      [key]: sanitizeSliderWeight(val, categoryWeights[key] ?? 0),
    };
    const normalized = normalizeCategoryWeights(
      activeCategory,
      candidate,
      scoredCompareCriteria
    );
    const nextMode: ActiveWeightMode = normalized.wasAllZeroReset
      ? 'default'
      : 'custom';
    setWeightMode(nextMode);
    setCategoryWeights(normalized.sliderWeights);
    replaceCompareWeightQuery(
      activeCategory,
      nextMode,
      normalized.sliderWeights,
      scoredCompareCriteria
    );
  };

  const handleResetCompareWeights = () => {
    handleSelectComparePreset('default');
  };
  // RATE_ITEM_MODEL on (the page passed a map): products the client added,
  // restored from the tray, or surfaced in Popular 1v1 Battles are read as
  // Items too, so 1v1 and product links name Canonical Items without a 308
  // (DOS/Rate#1294, #1764). Off: no map, no reads.
  const [clientItemSlugs, setClientItemSlugs] = useState<
    Record<string, string>
  >({});
  const [itemLookupRetryTick, setItemLookupRetryTick] = useState(0);
  const itemLookupFailuresRef = useRef<Map<string, CompareItemLookupFailure>>(
    new Map()
  );
  const itemLookupsRef = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const inFlight = itemLookupsRef.current;
    return () => {
      for (const controller of inFlight.values()) controller.abort();
    };
  }, []);
  const versusSlugMap = useMemo(
    () =>
      buildCompareVersusSlugMap(
        [...catalogCandidates, ...products, ...(remoteResults ?? [])],
        itemSlugBySlug,
        clientItemSlugs
      ),
    [
      catalogCandidates,
      products,
      remoteResults,
      itemSlugBySlug,
      clientItemSlugs,
    ]
  );
  const popularBattles = useMemo(
    () =>
      resolveComparePopularBattles(
        catalogCandidates,
        activeCategory,
        versusSlugMap,
        3
      ),
    [catalogCandidates, activeCategory, versusSlugMap]
  );
  useEffect(() => {
    const candidates = new Set([
      ...products.map((p) => p.slug),
      ...popularBattles.flatMap((b) => [b.productA.slug, b.productB.slug]),
      ...(remoteResults ?? []).map((p) => p.slug),
    ]);
    const inFlight = itemLookupsRef.current;
    for (const [slug, controller] of inFlight) {
      if (
        !itemSlugBySlug ||
        !candidates.has(slug) ||
        lookupCompareOwnSlug(itemSlugBySlug, slug)
      ) {
        controller.abort();
      }
    }
    if (!itemSlugBySlug) return;
    const failures = itemLookupFailuresRef.current;
    const { readyToFetch, earliestRetryAt } = planCompareItemLookupBatch(
      [...candidates],
      itemSlugBySlug,
      clientItemSlugs,
      failures,
      Date.now()
    );
    const replan = () => setItemLookupRetryTick((tick) => tick + 1);
    for (const slug of readyToFetch) {
      startCompareItemLookup(slug, inFlight, (completedSlug, itemSlug) => {
        const { nextRetryAt } = applyCompareItemLookupOutcomes(
          [[completedSlug, itemSlug]],
          failures,
          Date.now()
        );
        if (itemSlug) {
          setClientItemSlugs((prev) => {
            const next = { ...prev };
            setCompareOwnSlug(next, completedSlug, itemSlug);
            return next;
          });
        } else if (Number.isFinite(nextRetryAt)) {
          replan();
        }
      });
    }
    if (Number.isFinite(earliestRetryAt)) {
      const timer = setTimeout(
        replan,
        Math.max(0, earliestRetryAt - Date.now())
      );
      return () => clearTimeout(timer);
    }
  }, [
    itemSlugBySlug,
    products,
    popularBattles,
    remoteResults,
    clientItemSlugs,
    itemLookupRetryTick,
  ]);
  const specGroups = useMemo(
    () => filterSpecGroupsForCategory(allSpecGroups, activeCategory),
    [allSpecGroups, activeCategory]
  );

  // No row that every column leaves empty, and with `showDiffOnly` no row
  // where every column agrees (DOS/Rate#1186).
  const visibleSpecGroups = specGroups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        compareRowIsShown(
          // The text the cells show, where "N/A" becomes "-", localized
          // part by part as the cells do (DOS/Rate#1392).
          products.map((p) =>
            compareCellShownText(
              (row.screenValue ?? row.renderCell ?? row.renderValue)(p),
              locale
            )
          ),
          showDiffOnly
        )
      ),
    }))
    .filter((group) => group.rows.length > 0);

  // A spec group's heading in the page's language, for the table and the
  // exports alike (DOS/Rate#1529); a watch's cellular heading has no "5G"
  // (DOS/Rate#1166).
  const groupHeading = (group: { id: string; title: string }) =>
    group.id in specDict.groups
      ? specGroupHeading(
          specDict,
          group.id as SpecGroupKey,
          getCategorySpecTemplate(activeCategory).has5g
        )
      : group.title;

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const replaceFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const activeReplaceIndexRef = useRef<number | null>(null);
  const scheduledReplaceIndexRef = useRef<number | null>(null);
  const restoredTrayRef = useRef(false);

  const activeReplaceIndex =
    replaceIndex !== null && replaceIndex >= 0 && replaceIndex < products.length
      ? replaceIndex
      : null;

  useEffect(() => {
    syncCompareReplaceFocusState({
      timerRef: replaceFocusTimerRef,
      activeReplaceRef: activeReplaceIndexRef,
      scheduledReplaceRef: scheduledReplaceIndexRef,
      activeReplaceIndex,
    });
  }, [activeReplaceIndex]);

  useEffect(() => {
    return () => {
      activeReplaceIndexRef.current = null;
      cancelPendingCompareReplaceFocus(
        replaceFocusTimerRef,
        scheduledReplaceIndexRef
      );
    };
  }, []);

  const clearReplaceMode = () => {
    cancelPendingCompareReplaceFocus(
      replaceFocusTimerRef,
      scheduledReplaceIndexRef
    );
    activeReplaceIndexRef.current = null;
    setReplaceIndex(null);
  };

  const activeCategoryMeta = useMemo(
    () =>
      categoryTabs.find((tab) => tab.slug === activeCategory) ||
      categoryTabs[0]!,
    [activeCategory, categoryTabs]
  );

  // Candidates deduplicated per Item under RATE_ITEM_MODEL (#1820), then
  // strictly locked to the active category.
  const dedupedCatalogCandidates = useMemo(
    () => dedupeCompareProductsByItem(catalogCandidates, versusSlugMap),
    [catalogCandidates, versusSlugMap]
  );

  const categoryLockedCandidates = useMemo(
    () =>
      dedupedCatalogCandidates.filter(
        (c) => getMasterProductCategorySlug(c) === activeCategory
      ),
    [dedupedCatalogCandidates, activeCategory]
  );

  // Rows known to carry their full spec sheet: the page's own and the search
  // API's. A picker candidate carries only the ranking fields (DOS/Rate#1515),
  // so a candidate that joins the comparison has its sheet read from the
  // products API; the exports wait for it.
  const fullRowsRef = useRef(new Map<string, MasterProduct>());
  const [specsLoading, setSpecsLoading] = useState(false);
  useEffect(() => {
    for (const p of initialProducts) fullRowsRef.current.set(p.slug, p);
  }, [initialProducts]);
  useEffect(() => {
    for (const p of remoteResults ?? []) fullRowsRef.current.set(p.slug, p);
  }, [remoteResults]);
  useEffect(() => {
    const known = fullRowsRef.current;
    if (
      storedProducts.some((p) => known.has(p.slug) && known.get(p.slug) !== p)
    ) {
      setProducts((prev) => prev.map((p) => known.get(p.slug) ?? p));
      return;
    }
    const missing = storedProducts
      .map((p) => p.slug)
      .filter((slug) => !known.has(slug));
    setSpecsLoading(missing.length > 0);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map((slug) =>
        fetch(`/api/v1/rate/products/${encodeURIComponent(slug)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json: unknown) =>
            productFromProductAnswer<MasterProduct>(json, slug)
          )
          .catch(() => null)
      )
    ).then((rows) => {
      if (cancelled) return;
      for (const row of rows) if (row) known.set(row.slug, row);
      if (rows.some(Boolean)) {
        setProducts((prev) => prev.map((p) => known.get(p.slug) ?? p));
      }
      // A failed read leaves the exports shut: the navigation's server render
      // still brings the full row, and a short export would be wrong.
      setSpecsLoading(rows.some((row) => !row));
    });
    return () => {
      cancelled = true;
    };
  }, [storedProducts]);

  // Sync local products state when server initialProducts prop updates (e.g. Back/Forward navigation)
  useEffect(() => {
    const first = initialProducts[0];
    if (!first && !hasExplicitSlugs) return;
    const cat = first ? getMasterProductCategorySlug(first) : initialCategory;
    cancelPendingCompareReplaceFocus(
      replaceFocusTimerRef,
      scheduledReplaceIndexRef
    );
    activeReplaceIndexRef.current = null;
    setReplaceIndex(null);
    setActiveCategory(cat);
    const sameCat = initialProducts.filter(
      (p) => getMasterProductCategorySlug(p) === cat
    );
    setProducts(
      hasExplicitSlugs
        ? sameCat
        : dedupeCompareProductsByItem(
            sameCat,
            buildCompareVersusSlugMap(
              [...catalogCandidates, ...initialProducts],
              itemSlugBySlug
            )
          )
    );
  }, [
    initialProducts,
    initialCategory,
    hasExplicitSlugs,
    catalogCandidates,
    itemSlugBySlug,
  ]);

  // If user visits /compare without ?slugs=, restore their saved Compare Tray (strictly filtered to same category)
  useEffect(() => {
    if (restoredTrayRef.current) return;
    restoredTrayRef.current = true;

    if (!hasExplicitSlugs) {
      const restored = resolveCompareTrayRestore(
        getCompareTray(),
        catalogCandidates,
        itemSlugBySlug
      );
      if (restored) {
        setActiveCategory(restored.activeCategory);
        setProducts(restored.products);
        let restoredQuery = `?slugs=${restored.slugsCsv}`;
        if (typeof window !== 'undefined' && layout === 'compare') {
          const parsedRestored = parseUseCaseWeightsFromParams(
            restored.activeCategory,
            window.location.search
          );
          restoredQuery = mergeUseCaseQueryIntoSearch(
            restoredQuery,
            restored.activeCategory,
            parsedRestored.mode,
            parsedRestored.weights
          );
        }
        router.replace(`/compare${restoredQuery}`, {
          scroll: false,
        });
        return;
      }
    }

    // Otherwise only show the page's defaults or a shared ?slugs= list: the
    // tray changes on the visitor's own edits (syncSelection), never on load,
    // so it does not follow them site-wide or lose what they saved (#714).
  }, [hasExplicitSlugs, catalogCandidates, itemSlugBySlug, layout, router]);

  // Sync URL and localStorage tray whenever compared products change (always locked to 1 category)
  const syncSelection = (
    nextProducts: MasterProduct[],
    explicitCat?: CanonicalCategorySlug
  ) => {
    const targetCat =
      explicitCat ||
      (nextProducts.length > 0
        ? getMasterProductCategorySlug(nextProducts[0]!)
        : activeCategory);
    const sameCategoryProducts = dedupeCompareProductsByItem(
      nextProducts.filter((p) => getMasterProductCategorySlug(p) === targetCat),
      versusSlugMap
    );
    clearReplaceMode();
    setActiveCategory(targetCat);
    setProducts(sameCategoryProducts);
    setCompareTray(
      sameCategoryProducts.map((p) => ({
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        thumbnail: resolveProductImageUrl(p.slug, productImageUrl(p)),
        min_price: sanitizeComparePriceVnd(p.min_price),
        categorySlug: targetCat,
      }))
    );
    const slugsCsv = sameCategoryProducts.map((p) => p.slug).join(',');
    const baseQuery = slugsCsv
      ? `?slugs=${slugsCsv}`
      : `?category=${targetCat}`;
    let finalQuery = baseQuery;
    if (targetCat !== activeCategory) {
      const nextDefaults = defaultCategoryWeights(targetCat);
      setWeightMode('default');
      setCategoryWeights(nextDefaults);
      setShowWeightSliders(false);
    } else if (layout === 'compare') {
      finalQuery = mergeUseCaseQueryIntoSearch(
        baseQuery,
        targetCat,
        weightMode,
        categoryWeights
      );
    }
    router.replace(`/compare${finalQuery}`, { scroll: false });
  };

  const handleSwitchCategoryTab = (nextCat: CanonicalCategorySlug) => {
    if (nextCat === activeCategory && products.length > 0) return;
    clearReplaceMode();
    setSearchQuery('');
    setDropdownOpen(false);
    const nextDefaults = pickCompareCategoryDefaults(
      catalogCandidates,
      nextCat,
      versusSlugMap,
      3
    );
    syncSelection(nextDefaults, nextCat);
  };

  const dropdownOpenRef = useRef(dropdownOpen);
  const productsCountRef = useRef(products.length);
  const suppressNextInputFocusOpenRef = useRef(false);
  useEffect(() => {
    dropdownOpenRef.current = dropdownOpen;
    productsCountRef.current = products.length;
  }, [dropdownOpen, products.length]);

  const focusSearchInputWithoutOpening = useCallback(() => {
    const input = searchInputRef.current;
    if (!input || input.disabled) return;
    suppressNextInputFocusOpenRef.current = true;
    input.focus();
    queueMicrotask(() => {
      suppressNextInputFocusOpenRef.current = false;
    });
  }, []);

  const restoreFocusAfterAutocompleteClose = useCallback(
    (previousReplaceIndex: number | null, nextProductCount: number) => {
      if (nextProductCount >= MAX_COMPARE_ITEMS) {
        const targetIdx =
          previousReplaceIndex !== null
            ? previousReplaceIndex
            : nextProductCount - 1;
        requestAnimationFrame(() => {
          const triggers = document.querySelectorAll<HTMLElement>(
            '[data-compare-slot-trigger="replace"]'
          );
          triggers[targetIdx]?.focus();
        });
        return;
      }
      focusSearchInputWithoutOpening();
    },
    [focusSearchInputWithoutOpening]
  );

  const dismissAutocomplete = () => {
    cancelPendingCompareReplaceFocus(
      replaceFocusTimerRef,
      scheduledReplaceIndexRef
    );
    activeReplaceIndexRef.current = null;
    setDropdownOpen(false);
    setReplaceIndex(null);
  };

  // Close autocomplete dropdown on outside pointer down, outside focus loss, or Escape (#1820).
  useEffect(() => {
    const closeAndClearReplace = () => {
      cancelPendingCompareReplaceFocus(
        replaceFocusTimerRef,
        scheduledReplaceIndexRef
      );
      activeReplaceIndexRef.current = null;
      setDropdownOpen(false);
      setReplaceIndex(null);
    };

    const handleOutside = (e: MouseEvent) => {
      if (!searchBoxRef.current) return;
      const isInside = searchBoxRef.current.contains(e.target as Node);
      const targetEl =
        e.target && typeof e.target === 'object'
          ? (e.target as { closest?: (selector: string) => unknown })
          : null;
      if (shouldDismissCompareOnOutsidePointerDown(targetEl, isInside)) {
        closeAndClearReplace();
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const box = searchBoxRef.current;
      if (!box) return;
      const next = e.relatedTarget as Node | null;
      const isInside = Boolean(next && box.contains(next));
      const relatedEl =
        next && typeof next === 'object'
          ? (next as { closest?: (selector: string) => unknown })
          : null;
      if (shouldDismissCompareOnFocusOut(relatedEl, isInside)) {
        closeAndClearReplace();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const box = searchBoxRef.current;
      const activeEl =
        typeof document !== 'undefined' ? document.activeElement : null;
      const wasInside = Boolean(box && activeEl && box.contains(activeEl));
      const previousReplaceIndex = activeReplaceIndexRef.current;
      if (
        !wasInside &&
        previousReplaceIndex === null &&
        !dropdownOpenRef.current
      ) {
        return;
      }
      e.preventDefault();
      closeAndClearReplace();
      if (wasInside) {
        restoreFocusAfterAutocompleteClose(
          previousReplaceIndex,
          productsCountRef.current
        );
      }
    };

    const box = searchBoxRef.current;
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    box?.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      box?.removeEventListener('focusout', handleFocusOut);
    };
  }, [restoreFocusAfterAutocompleteClose]);

  // Debounced remote search via Layer 1 REST API `/api/v1/rate/products` (locked to activeCategory)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/v1/rate/products?category=${encodeURIComponent(activeCategory)}&q=${encodeURIComponent(q)}&limit=8`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            ok: boolean;
            data?: MasterProduct[];
          };
          if (json.ok && Array.isArray(json.data)) {
            setRemoteResults(
              json.data.filter(
                (item) => getMasterProductCategorySlug(item) === activeCategory
              )
            );
          }
        }
      } catch {
        // Ignore abort errors
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeCategory]);

  // Combine instant client-side matches + remote REST API matches, deduplicated per Item (#1820)
  const suggestions = useMemo(
    () =>
      buildCompareAutocompleteSuggestions(
        catalogCandidates,
        remoteResults,
        activeCategory,
        searchQuery,
        versusSlugMap,
        8
      ),
    [
      catalogCandidates,
      remoteResults,
      activeCategory,
      searchQuery,
      versusSlugMap,
    ]
  );

  const handleSelectCandidate = (candidate: MasterProduct) => {
    const previousReplaceIndex = activeReplaceIndex;
    const activeEl =
      typeof document !== 'undefined' ? document.activeElement : null;
    const wasInsideSearchBox = Boolean(
      searchBoxRef.current &&
      activeEl &&
      searchBoxRef.current.contains(activeEl)
    );
    const applied = applyCompareCandidateSelection(
      products,
      candidate,
      activeCategory,
      activeReplaceIndex,
      versusSlugMap
    );
    if (!applied) return;
    syncSelection(applied.nextProducts, applied.nextCategory);
    clearReplaceMode();
    setSearchQuery('');
    setDropdownOpen(false);
    if (wasInsideSearchBox) {
      restoreFocusAfterAutocompleteClose(
        previousReplaceIndex,
        applied.nextProducts.length
      );
    }
  };

  const handleRemoveProduct = (slug: string) => {
    clearReplaceMode();
    syncSelection(
      products.filter((p) => p.slug !== slug),
      activeCategory
    );
  };

  const handleStartReplace = (idx: number) => {
    const next =
      idx >= 0 && idx < products.length
        ? nextCompareReplaceState(activeReplaceIndex, idx)
        : { replaceIndex: null, dropdownOpen: false };
    setReplaceIndex(next.replaceIndex);
    setDropdownOpen(next.dropdownOpen);
    scheduleCompareReplaceFocus({
      timerRef: replaceFocusTimerRef,
      activeReplaceRef: activeReplaceIndexRef,
      scheduledReplaceRef: scheduledReplaceIndexRef,
      expectedReplaceIndex: next.dropdownOpen ? next.replaceIndex : null,
      focusInput: () => {
        searchInputRef.current?.focus();
      },
    });
  };

  const [watchedAllToast, setWatchedAllToast] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyMarkdownReport = async () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    try {
      const headerCols = [
        t('mdReportColSpec'),
        ...products.map((p) => sanitizeCompareMarkdownCell(p.name)),
      ];
      const sepCols = headerCols.map(() => '---');
      const lines: string[] = [
        `### ${t('mdReportTitle', { category: activeCategoryMeta.label })}`,
        `- **${t('mdAuditUrl')}:** ${window.location.href}`,
        '',
        `| ${headerCols.join(' | ')} |`,
        `| ${sepCols.join(' | ')} |`,
        `| **${t('mdRowUserRating')}** | ${products
          .map((p) => {
            const r = getEffectiveRating(p);
            const cnt = p.authentic_review_count || p.total_reviews || 0;
            return r > 0
              ? `★ ${formatScoreFixed(shownRating(p), 1)}/5.0 (${cnt} review)`
              : t('unratedShort');
          })
          .join(' | ')} |`,
        `| **${t('mdRowExpertRating')}** | ${products
          .map((p) => {
            const exp5 = resolveCompareExpertRating5Shown(p);
            return exp5 != null
              ? `Lab ${formatScoreFixed(exp5, 1)}/5.0`
              : t('unratedShort');
          })
          .join(' | ')} |`,
        buildCompareMarkdownMinPriceRow(t('mdRowMinPrice'), products, locale),
        `| **${t('mdRowDealRadar')}** | ${products
          .map((p) =>
            radarMarkdownCell(getRadarSignal(radarIndex, p.slug), locale)
          )
          .join(' | ')} |`,
        `| **${t('mdRowHardwareMemory')}** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            const ram = resolveCompareRamGb(p);
            const rom = resolveCompareStorageGb(p);
            const parts = [
              ks.chip,
              ram ? `${ram}GB RAM` : ks.ram,
              rom
                ? `${rom >= 1024 ? `${rom / 1024}TB` : `${rom}GB`}`
                : ks.storage,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' / ') : '-';
          })
          .join(' | ')} |`,
        `| **${t('mdRowBatteryEnergy')}** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            const mah = resolveCompareBatteryMah(p);
            return mah ? `${mah} mAh` : ks.battery || '-';
          })
          .join(' | ')} |`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadCompareCsv = () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    const headers = [
      t('csvColSpecGroup'),
      t('csvColTechCriterion'),
      ...products.map((p) => p.name),
    ];
    const productRadarCells = products.map((p) =>
      radarCsvCells(getRadarSignal(radarIndex, p.slug))
    );
    const rows: string[] = [
      headers.map(escapeCsvCell).join(','),
      [
        t('csvRadarGroupTitle'),
        t('csvRadarVerdictRow'),
        ...products.map((p) =>
          radarLabel(getRadarSignal(radarIndex, p.slug), 0, locale)
        ),
      ]
        .map((c) => escapeCsvCell(c))
        .join(','),
      ...RADAR_CSV_HEADERS.map((hdr, idx) =>
        [
          t('csvRadarGroupTitle'),
          hdr,
          ...productRadarCells.map((cells) => cells[idx] ?? ''),
        ]
          .map((c) => escapeCsvCell(c))
          .join(',')
      ),
    ];
    for (const group of specGroups) {
      for (const row of group.rows) {
        const vals = products.map((p) => row.renderValue(p));
        if (vals.every((v) => !v || v === '-')) continue;
        rows.push(
          [groupHeading(group), row.label, ...vals]
            .map((c) => escapeCsvCell(c))
            .join(',')
        );
      }
    }
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-compare-${activeCategory}-${products.map((p) => p.slug).join('-vs-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCompareJson = () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    const payload = {
      source: 'Rate.vn Compare Matrix',
      category: activeCategory,
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map((p) =>
        buildCompareJsonProductEntry(p, getRadarSignal(radarIndex, p.slug))
      ),
      matrix: specGroups.map((group) => ({
        groupId: group.id,
        groupTitle: groupHeading(group),
        // Like the CSV, no row that every product leaves empty.
        rows: group.rows
          .filter((row) =>
            compareRowIsShown(
              products.map((p) => row.renderValue(p)),
              false
            )
          )
          .map((row) => ({
            id: row.id,
            label: row.label,
            values: Object.fromEntries(
              products.map((p) => [p.slug, row.renderValue(p)])
            ),
          })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-compare-${activeCategory}-${products.map((p) => p.slug).join('-vs-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWatchAllCompared = () => {
    for (const p of products) {
      const minP = sanitizeComparePriceVnd(p.min_price);
      const targetP =
        minP > 0
          ? Math.max(100_000, Math.round((minP * 0.95) / 100_000) * 100_000)
          : 10_000_000;
      const thumb = resolveProductImageUrl(p.slug, productImageUrl(p));
      const resolvedHref = getMasterProductHref(p);
      const resolvedCategoryPath =
        resolvedHref.replace(`/${p.slug}`, '') || '/smartphones';
      upsertWatchlistItem({
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        categoryPath: resolvedCategoryPath,
        thumbnail: thumb,
        priceWhenAdded: minP,
        targetPrice: targetP,
        addedAt: new Date().toISOString(),
      });
    }
    setWatchedAllToast(true);
    setTimeout(() => setWatchedAllToast(false), 2200);
  };

  const headToHeadSummary = useMemo(
    () => computeCompareHeadToHeadSummary(products),
    [products]
  );

  const autocompleteA11y = resolveCompareAutocompleteA11y({
    dropdownOpen,
    productCount: products.length,
    activeReplaceIndex,
  });

  const comparePresetLabels: Record<UseCasePresetId, string> = {
    default: t('preset_default'),
    gaming: t('preset_gaming'),
    camera: t('preset_camera'),
    endurance: t('preset_endurance'),
    value: t('preset_value'),
    media: t('preset_media'),
    study_work: t('preset_study_work'),
    office: t('preset_office'),
    creator: t('preset_creator'),
    fitness: t('preset_fitness'),
    smart_daily: t('preset_smart_daily'),
    audiophile: t('preset_audiophile'),
    commute_anc: t('preset_commute_anc'),
    calls_work: t('preset_calls_work'),
  };

  const compareCriterionLabels: Partial<Record<RatingCriterionKey, string>> = {
    performance: t('weightCrit_performance'),
    camera: t('weightCrit_camera'),
    battery: t('weightCrit_battery'),
    display: t('weightCrit_display'),
    design: t('weightCrit_design'),
    value: t('weightCrit_value'),
    sound: t('weightCrit_sound'),
    software: t('weightCrit_software'),
    keyboard: t('weightCrit_keyboard'),
    thermals: t('weightCrit_thermals'),
    health: t('weightCrit_health'),
    apps: t('weightCrit_apps'),
    anc: t('weightCrit_anc'),
    comfort: t('weightCrit_comfort'),
    calls: t('weightCrit_calls'),
  };

  const hasActiveCompareWeights =
    canWeighCompare &&
    !isDefaultCategoryWeights(
      activeCategory,
      weightMode,
      categoryWeights,
      scoredCompareCriteria
    );

  const customCompareScoresById = useMemo(() => {
    const map = new Map<string, CustomWeightedScoreResult>();
    if (!hasActiveCompareWeights) return map;
    for (const p of products) {
      const critScores = extractCategoryCriteriaScores(p, activeCategory);
      const res = computeCustomWeightedScore5(
        activeCategory,
        critScores,
        categoryWeights,
        {
          onlyCriteria: scoredCompareCriteria,
          officialScore5: getEffectiveRating(p),
          product: p,
        }
      );
      map.set(p.id, res);
    }
    return map;
  }, [
    hasActiveCompareWeights,
    products,
    activeCategory,
    categoryWeights,
    scoredCompareCriteria,
  ]);

  const customCompareWinner = useMemo(() => {
    if (!hasActiveCompareWeights) return null;
    const scoredItems = products
      .map((p) => ({
        product: p,
        score5: customCompareScoresById.get(p.id)?.customScore5 ?? null,
      }))
      .filter(
        (entry): entry is { product: MasterProduct; score5: number } =>
          entry.score5 !== null
      )
      .sort((a, b) => b.score5 - a.score5);
    if (scoredItems.length === 0) return null;
    const top = scoredItems[0]!;
    const runnerUp = scoredItems[1] ?? null;
    const delta5 = runnerUp ? Math.max(0, top.score5 - runnerUp.score5) : null;
    const isTie = runnerUp !== null && delta5 !== null && delta5 < 0.01;
    const winnerIds = new Set<string>(
      scoredItems
        .filter((entry) => Math.abs(entry.score5 - top.score5) < 0.01)
        .map((entry) => entry.product.id)
    );
    return {
      leadProduct: top.product,
      leadScore5: top.score5,
      delta5,
      isTie,
      scoredCount: scoredItems.length,
      winnerIds,
    };
  }, [hasActiveCompareWeights, products, customCompareScoresById]);

  const activeComparePresetTitle = resolveLocalizedPresetName(
    activeCategory,
    weightMode,
    locale,
    comparePresetLabels,
    t('customWeightsActive')
  );

  const controlsBlock = (
    <>
      {/* 5-Category Lock Switcher Bar */}
      <div className="rate-card mb-3 p-3">
        <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2">
          <div className="small fw-semibold text-secondary">
            {t('categoryLockLabel')}
          </div>
          <div
            className="d-flex flex-wrap gap-2"
            // Single-select buttons, not tabs: there are no panels (DOS/Rate#1067).
            role="group"
            aria-label={t('categoryTabsAria')}
          >
            {categoryTabs.map((tab) => {
              const isActive = tab.slug === activeCategory;
              const count = dedupedCatalogCandidates.filter(
                (c) => getMasterProductCategorySlug(c) === tab.slug
              ).length;
              return (
                <button
                  key={tab.slug}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleSwitchCategoryTab(tab.slug)}
                  className={`btn btn-sm rounded-pill fw-semibold px-3 py-1 ${
                    isActive
                      ? 'btn-dark text-white'
                      : 'btn-light text-secondary border'
                  }`}
                >
                  {tab.label} <span className="rate-tabular">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Interactive Autocomplete Search & Control Bar */}
      <div className="rate-card p-md-4 mb-4 p-3">
        <div className="row g-3 align-items-center">
          {/* Autocomplete Input */}
          <div
            className="col-lg-6"
            ref={searchBoxRef}
            onBlur={(e) => {
              const box = searchBoxRef.current;
              if (!box) return;
              const next = e.relatedTarget as Node | null;
              const isInside = Boolean(next && box.contains(next));
              const relatedEl =
                next && typeof next === 'object'
                  ? (next as { closest?: (selector: string) => unknown })
                  : null;
              if (shouldDismissCompareOnFocusOut(relatedEl, isInside)) {
                dismissAutocomplete();
              }
            }}
          >
            <label
              htmlFor="compare-autocomplete-input"
              className="form-label fw-bold small text-uppercase text-muted mb-1"
            >
              {activeReplaceIndex !== null && products[activeReplaceIndex]
                ? t('replacingDeviceLabel', {
                    unit: activeCategoryMeta.unitLabel,
                    name: products[activeReplaceIndex]?.name ?? '',
                  })
                : t('searchAddDeviceLabel', {
                    category: activeCategoryMeta.label,
                    count: products.length,
                    max: MAX_COMPARE_ITEMS,
                  })}
            </label>
            <div className="position-relative">
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0 rounded-start-pill ps-3">
                  <BsSearch aria-hidden="true" />
                </span>
                <input
                  ref={searchInputRef}
                  id="compare-autocomplete-input"
                  type="text"
                  role={autocompleteA11y.role}
                  aria-autocomplete={autocompleteA11y.ariaAutocomplete}
                  aria-expanded={autocompleteA11y.ariaExpanded}
                  aria-controls={autocompleteA11y.ariaControls}
                  autoComplete="off"
                  value={searchQuery}
                  onFocus={() => {
                    if (suppressNextInputFocusOpenRef.current) {
                      suppressNextInputFocusOpenRef.current = false;
                      return;
                    }
                    setDropdownOpen(true);
                  }}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'ArrowDown' &&
                      !autocompleteA11y.disabled &&
                      !dropdownOpen
                    ) {
                      e.preventDefault();
                      setDropdownOpen(true);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      const previousReplaceIndex = activeReplaceIndex;
                      dismissAutocomplete();
                      if (
                        products.length >= MAX_COMPARE_ITEMS &&
                        previousReplaceIndex !== null
                      ) {
                        restoreFocusAfterAutocompleteClose(
                          previousReplaceIndex,
                          products.length
                        );
                      }
                    }
                  }}
                  placeholder={
                    autocompleteA11y.disabled
                      ? t('maxDevicesPlaceholder')
                      : t('searchDevicePlaceholder', {
                          unit: activeCategoryMeta.unitLabel,
                        })
                  }
                  disabled={autocompleteA11y.disabled}
                  className="form-control bg-light border-start-0 rounded-end-pill py-2"
                />
                {activeReplaceIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      const previousReplaceIndex = activeReplaceIndex;
                      dismissAutocomplete();
                      restoreFocusAfterAutocompleteClose(
                        previousReplaceIndex,
                        products.length
                      );
                    }}
                    className="btn btn-outline-secondary rounded-pill btn-sm ms-2"
                  >
                    {t('cancelReplaceBtn')}
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown */}
              {autocompleteA11y.ariaExpanded && (
                <div
                  className="card rounded-4 position-absolute mt-2 w-100 overflow-hidden border shadow-lg"
                  style={{ zIndex: 1050 }}
                >
                  <div
                    id={COMPARE_AUTOCOMPLETE_HEADING_ID}
                    className="bg-light border-bottom d-flex justify-content-between align-items-center px-3 py-2"
                  >
                    <span className="small fw-semibold text-muted">
                      {searchQuery.trim()
                        ? t('searchResultsFor', {
                            category: activeCategoryMeta.label,
                            query: searchQuery.trim(),
                          })
                        : t('sameCategoryList', {
                            unit: activeCategoryMeta.unitLabel,
                          })}
                    </span>
                    {isSearching && (
                      <span className="badge bg-secondary rounded-pill small">
                        {t('searchingBadge')}
                      </span>
                    )}
                  </div>

                  <div
                    id={COMPARE_AUTOCOMPLETE_LIST_ID}
                    role="listbox"
                    aria-labelledby={COMPARE_AUTOCOMPLETE_HEADING_ID}
                    className="list-group list-group-flush"
                    style={{
                      maxHeight: '340px',
                      overflowY: 'auto',
                    }}
                  >
                    {suggestions.length === 0 ? (
                      <div
                        role="option"
                        aria-disabled="true"
                        aria-selected="false"
                        className="text-muted small p-4 text-center"
                      >
                        {t('noMatchingDevices', {
                          unit: activeCategoryMeta.unitLabel,
                          query: searchQuery,
                        })}
                      </div>
                    ) : (
                      suggestions.map((item) => {
                        const alreadySelected = isCompareCandidateSelected(
                          products,
                          item.slug,
                          versusSlugMap
                        );
                        const thumb = resolveProductImageUrl(
                          item.slug,
                          productImageUrl(item)
                        );
                        const priceFormatted = formatComparePriceVnd(
                          item.min_price,
                          locale
                        );
                        const rating = getEffectiveRating(item);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={alreadySelected}
                            disabled={alreadySelected}
                            onClick={() => handleSelectCandidate(item)}
                            className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3 px-3 py-2 ${
                              alreadySelected ? 'bg-light opacity-75' : ''
                            }`}
                          >
                            <div className="d-flex align-items-center gap-3 overflow-hidden">
                              <div
                                className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 border bg-white"
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  padding: '4px',
                                }}
                              >
                                {thumb ? (
                                  <img
                                    loading="lazy"
                                    decoding="async"
                                    src={thumb}
                                    alt={item.name}
                                    style={{
                                      maxWidth: '100%',
                                      maxHeight: '100%',
                                      objectFit: 'contain',
                                    }}
                                  />
                                ) : (
                                  <span className="small text-muted">SP</span>
                                )}
                              </div>
                              <div className="overflow-hidden text-start">
                                <div className="fw-bold text-dark text-truncate small">
                                  {item.name}
                                </div>
                                <div className="d-flex align-items-center mt-1 flex-wrap gap-2">
                                  <span className="rate-spec-pill">
                                    {item.brand}
                                  </span>
                                  <StarRating
                                    value={rating}
                                    size="sm"
                                    emptyLabel={t('unratedShort')}
                                  />
                                  <span
                                    className="text-secondary fw-semibold rate-tabular"
                                    style={{ fontSize: '0.8125rem' }}
                                  >
                                    {priceFormatted}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span
                              className={`badge rounded-pill flex-shrink-0 px-3 py-2 ${
                                alreadySelected
                                  ? 'bg-secondary text-white'
                                  : activeReplaceIndex !== null
                                    ? 'bg-dark text-white'
                                    : 'bg-danger text-white'
                              }`}
                            >
                              {alreadySelected
                                ? t('alreadyComparingBadge')
                                : activeReplaceIndex !== null
                                  ? t('selectReplacementBadge')
                                  : t('addToCompareBadge')}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comparison Mode Toggles & Share Button */}
          <div className="col-lg-6">
            <div className="d-flex align-items-center justify-content-lg-end pt-lg-3 flex-wrap gap-3">
              <div className="form-check form-switch mb-0">
                <input
                  id="toggle-diff-only"
                  type="checkbox"
                  className="form-check-input"
                  checked={showDiffOnly}
                  onChange={(e) => setShowDiffOnly(e.target.checked)}
                />
                <label
                  htmlFor="toggle-diff-only"
                  className="form-check-label small fw-semibold"
                >
                  {t('showDiffOnlyToggle')}
                </label>
              </div>

              <div className="form-check form-switch mb-0">
                <input
                  id="toggle-highlight-winners"
                  type="checkbox"
                  className="form-check-input"
                  checked={highlightWinners}
                  onChange={(e) => setHighlightWinners(e.target.checked)}
                />
                <label
                  htmlFor="toggle-highlight-winners"
                  className="form-check-label small fw-semibold"
                >
                  {t('highlightWinnersToggle')}
                </label>
              </div>

              <button
                type="button"
                onClick={handleCopyShareLink}
                className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
              >
                {copiedLink ? t('copiedLinkToast') : t('copyCompareLinkBtn')}
              </button>

              {products.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyMarkdownReport}
                    disabled={specsLoading}
                    className="btn btn-sm btn-outline-danger rounded-pill fw-medium px-3 py-2"
                  >
                    {copiedMarkdown
                      ? t('copiedMarkdownToast')
                      : t('copyMarkdownTableBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareCsv}
                    disabled={specsLoading}
                    data-testid="compare-export-csv-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    CSV ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareJson}
                    disabled={specsLoading}
                    data-testid="compare-export-json-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    JSON ({products.length})
                  </button>
                </>
              )}

              {products.length === 2 &&
                products[0] &&
                products[1] &&
                isValidCompareVersusPair(
                  products[0].slug,
                  products[1].slug,
                  versusSlugMap
                ) && (
                  <Link
                    href={versusHref(
                      products[0].slug,
                      products[1].slug,
                      versusSlugMap
                    )}
                    className="btn btn-sm btn-dark rounded-pill fw-medium px-3 py-2"
                  >
                    {t('deep1v1PageBtn')}
                  </Link>
                )}

              {products.length > 0 && (
                <button
                  type="button"
                  onClick={handleWatchAllCompared}
                  className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3 py-2"
                >
                  {watchedAllToast
                    ? t('savedWatchlistToast')
                    : t('watchAllGroupBtn', { count: products.length })}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Preset Chips strictly from Same Category */}
        {categoryLockedCandidates.length >= 2 && (
          <div className="d-flex align-items-center border-top mt-3 flex-wrap gap-2 pt-3">
            <span className="small text-muted fw-medium me-1">
              {t('quickAddSameCategory', {
                unit: activeCategoryMeta.unitLabel,
              })}
            </span>
            {categoryLockedCandidates
              .filter(
                (c) =>
                  !isCompareCandidateSelected(products, c.slug, versusSlugMap)
              )
              .slice(0, 5)
              .map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  disabled={products.length >= MAX_COMPARE_ITEMS}
                  onClick={() => handleSelectCandidate(c)}
                  className="btn btn-sm btn-light rounded-pill small border px-3 py-1"
                >
                  + {c.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* RTINGS-style Use-Case Presets & Custom Weight Sliders (#1864) */}
      {canWeighCompare && (
        <div
          className="rate-card p-md-4 mb-4 p-3"
          data-testid="compare-use-case-card"
        >
          <UseCaseWeightBar
            variant="light"
            categorySlug={activeCategory}
            availableCriteria={scoredCompareCriteria}
            mode={weightMode}
            weights={categoryWeights}
            showSliders={showWeightSliders}
            onToggleSliders={() => setShowWeightSliders((v) => !v)}
            onSelectPreset={handleSelectComparePreset}
            onUpdateWeight={handleUpdateCompareWeight}
            onReset={handleResetCompareWeights}
            locale={locale}
            testIdPrefix="compare-weights"
            copy={{
              groupLabel: t('useCaseLabel'),
              customizeBtn: t('customWeightsBtn'),
              customActiveBadge: t('customWeightsActive'),
              resetBtn: t('resetWeightsBtn'),
              normalizedSummaryPrefix: t('normalizedWeightsPrefix'),
              officialKeepNote: t('officialScoreKeepNote'),
              presetLabels: comparePresetLabels,
              criterionLabels: compareCriterionLabels,
            }}
          />

          {hasActiveCompareWeights && customCompareWinner && (
            <div
              data-testid="compare-custom-winner-banner"
              className="rounded-3 bg-light d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2 border p-3"
            >
              <div>
                <span className="badge bg-dark rounded-pill fw-semibold me-2 text-white">
                  {t('yourCustomScoreLabel')}
                </span>
                <span className="small text-dark fw-medium">
                  {customCompareWinner.isTie
                    ? t('customWinnerTie', {
                        preset: activeComparePresetTitle,
                        score: formatRatingValue(
                          customCompareWinner.leadScore5,
                          locale,
                          2
                        ),
                      })
                    : customCompareWinner.delta5 !== null &&
                        customCompareWinner.scoredCount >= 2
                      ? t('customWinnerSummary', {
                          preset: activeComparePresetTitle,
                          winner: customCompareWinner.leadProduct.name,
                          score: formatRatingValue(
                            customCompareWinner.leadScore5,
                            locale,
                            2
                          ),
                          delta: formatDecimal(
                            customCompareWinner.delta5,
                            locale,
                            2
                          ),
                        })
                      : t('customWinnerSingle', {
                          preset: activeComparePresetTitle,
                          winner: customCompareWinner.leadProduct.name,
                          score: formatRatingValue(
                            customCompareWinner.leadScore5,
                            locale,
                            2
                          ),
                        })}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const popularBlock = (
    <>
      {/* Popular 1v1 Head-to-Head Battles Hub for Active Category */}
      {popularBattles.length > 0 && (
        <div className="rate-card p-md-4 mb-4 p-3">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <div className="rate-eyebrow mb-1">
                {t('popular1v1Eyebrow', {
                  category: activeCategoryMeta.label,
                })}
              </div>
              <h2 className="h6 fw-bold text-dark mb-0">
                {t('popular1v1Heading', {
                  category: activeCategoryMeta.label,
                })}
              </h2>
            </div>
            <IntentLink
              href={`/leaderboard?cat=${activeCategory}`}
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
            >
              {t('viewLeaderboardCategoryBtn', {
                category: activeCategoryMeta.label,
              })}
            </IntentLink>
          </div>

          <div className="row g-3">
            {popularBattles.map((battle) => (
              <div key={battle.versusSlug} className="col-lg-4 col-md-6">
                <div className="rounded-4 d-flex flex-column justify-content-between bg-light h-100 border p-3">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="badge bg-dark rounded-pill small text-white">
                        #{battle.productA.rank} vs #{battle.productB.rank}{' '}
                        {activeCategoryMeta.label}
                      </span>
                      <span className="badge bg-danger-subtle text-danger rounded-pill small rate-tabular">
                        {/* A 0.00 gap is a tie, as on the home page (DOS/Rate#1209). */}
                        {battle.scoreDelta5 > 0.05
                          ? t('scoreDeltaBadge', {
                              delta: formatDecimal(
                                battle.scoreDelta5,
                                locale,
                                1
                              ),
                            })
                          : t('mdRowTie')}
                      </span>
                    </div>

                    <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={battle.productA.thumbnail}
                          alt={battle.productA.name}
                          className="rounded-2 flex-shrink-0 border bg-white p-1"
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain',
                          }}
                        />
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {battle.productA.name}
                          </div>
                          <StarRating
                            value={battle.productA.userScore5}
                            digits={1}
                            size="sm"
                          />
                        </div>
                      </div>

                      <span className="badge bg-secondary rounded-pill flex-shrink-0">
                        VS
                      </span>

                      <div className="d-flex align-items-center gap-2 overflow-hidden text-end">
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {battle.productB.name}
                          </div>
                          <StarRating
                            value={battle.productB.userScore5}
                            digits={1}
                            size="sm"
                          />
                        </div>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={battle.productB.thumbnail}
                          alt={battle.productB.name}
                          className="rounded-2 flex-shrink-0 border bg-white p-1"
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top mt-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        syncSelection(
                          [battle.productA.product, battle.productB.product],
                          activeCategory
                        )
                      }
                      className="btn btn-sm btn-outline-secondary rounded-pill small px-3"
                    >
                      {t('loadIntoMatrixBtn')}
                    </button>
                    <IntentLink
                      href={versusHref(
                        battle.productA.slug,
                        battle.productB.slug,
                        versusSlugMap
                      )}
                      data-testid="popular-battle-1v1-link"
                      className="btn btn-sm btn-dark rounded-pill small fw-semibold px-3"
                    >
                      {t('go1v1Btn')}
                    </IntentLink>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const summaryBlock = (
    <>
      {/* Automated Head-to-Head 10-Group Verdict Summary Card */}
      {headToHeadSummary && (
        <div className="rate-scoreboard-dark p-md-4 mb-4 p-3 shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div className="d-flex align-items-center flex-wrap gap-2">
              <span
                className="badge rounded-pill fw-semibold px-3 py-1"
                style={{
                  backgroundColor: 'rgba(45, 186, 105, 0.16)',
                  color: 'var(--rate-ink-success)',
                  border: '1px solid rgba(45, 186, 105, 0.3)',
                }}
              >
                {t('verdictBadge', { category: activeCategoryMeta.label })}
              </span>
              <span className="fw-bold text-white">
                {t('verdictSummaryHeading', {
                  count: products.length,
                  category: activeCategoryMeta.label,
                })}
              </span>
            </div>
            <Link
              href={`/${activeCategory}`}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
            >
              {t('viewAllCategoryBtn', { category: activeCategoryMeta.label })}
            </Link>
          </div>
          <div className="row g-3">
            {headToHeadSummary.bestRated && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'var(--rate-glass-bg)',
                    border: '1px solid var(--rate-glass-border)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: 'var(--rate-ink-success)' }}
                  >
                    {t('verdictHighestRatedTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestRated.name}
                  </div>
                  <StarRating
                    value={getEffectiveRating(headToHeadSummary.bestRated)}
                    size="sm"
                    title={t('verdictAiFilteredNote')}
                  />
                </div>
              </div>
            )}
            {headToHeadSummary.highestMemory && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'var(--rate-glass-bg)',
                    border: '1px solid var(--rate-glass-border)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: 'var(--rate-ink-expert)' }}
                  >
                    {t('verdictTopHardwareTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.highestMemory.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {(() => {
                      const ram = resolveCompareRamGb(
                        headToHeadSummary.highestMemory
                      );
                      const rom = resolveCompareStorageGb(
                        headToHeadSummary.highestMemory
                      );
                      return `${ram ? `${ram}GB RAM - ` : ''}${
                        rom
                          ? rom >= 1024
                            ? `${rom / 1024}TB`
                            : `${rom}GB`
                          : t('verdictNormalized10Groups')
                      }`;
                    })()}
                  </div>
                </div>
              </div>
            )}
            {headToHeadSummary.bestBattery && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'var(--rate-glass-bg)',
                    border: '1px solid var(--rate-glass-border)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: 'var(--rate-ink-warning)' }}
                  >
                    {t('verdictBestBatteryTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestBattery.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {(() => {
                      const mah = resolveCompareBatteryMah(
                        headToHeadSummary.bestBattery
                      );
                      return mah
                        ? `${mah} mAh`
                        : t('verdictNormalized10Groups');
                    })()}
                  </div>
                </div>
              </div>
            )}
            {headToHeadSummary.lowestPrice && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'var(--rate-glass-bg)',
                    border: '1px solid var(--rate-glass-border)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: 'var(--rate-fg-secondary)' }}
                  >
                    {t('verdictLowestPriceTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.lowestPrice.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {formatComparePriceVnd(
                      headToHeadSummary.lowestPrice.min_price,
                      locale
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const matrixBlock = (
    <>
      {/* Empty State if 0 products */}
      {products.length === 0 ? (
        <div className="rate-card p-5 text-center">
          <h4 className="fw-bold mb-2">
            {t('emptyMatrixTitle', { unit: activeCategoryMeta.unitLabel })}
          </h4>
          <p className="text-muted mb-4">
            {t('emptyMatrixDesc', { unit: activeCategoryMeta.unitLabel })}
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
            {categoryLockedCandidates.slice(0, 3).map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => handleSelectCandidate(c)}
                className="btn btn-dark rounded-pill px-4"
              >
                {t('addDeviceQuickBtn', { name: c.name })}
              </button>
            ))}
            <Link
              href={`/${activeCategory}`}
              className="btn btn-outline-secondary rounded-pill px-4"
            >
              {t('viewCategoryCatalogBtn', {
                category: activeCategoryMeta.label,
              })}
            </Link>
          </div>
        </div>
      ) : (
        <div className="rate-card p-md-4 overflow-hidden p-3">
          <div className="table-responsive">
            <table className="table-bordered mb-0 table text-center align-middle">
              {/* Product Column Headers */}
              <thead className="table-light">
                <tr>
                  <th
                    style={{ width: '230px', minWidth: '200px' }}
                    className="bg-light p-3 text-start align-middle"
                  >
                    <div className="rate-eyebrow mb-2">
                      {activeCategoryMeta.label}
                    </div>
                    <div className="fw-bold text-dark mb-1">
                      {t('matrixHeaderTitle')}
                    </div>
                    <div
                      className="text-muted fw-normal"
                      style={{ fontSize: '0.8125rem' }}
                    >
                      {t('matrixHeaderSubtitle', {
                        count: products.length,
                        unit: activeCategoryMeta.unitLabel,
                      })}
                    </div>
                  </th>

                  {products.map((p, idx) => {
                    const thumb = resolveProductImageUrl(
                      p.slug,
                      productImageUrl(p)
                    );
                    const minPriceFormatted = formatComparePriceVnd(
                      p.min_price,
                      locale
                    );
                    const replaceA11y = resolveCompareReplaceButtonA11y(t, {
                      productName: p.name,
                      isReplacing: activeReplaceIndex === idx,
                    });
                    const userRating = getEffectiveRating(p);
                    const expertRating = resolveCompareExpertRating10(p);
                    const reviewCount =
                      p.authentic_review_count || p.total_reviews || 0;

                    return (
                      <th
                        key={p.id}
                        style={{ minWidth: '240px' }}
                        className="position-relative bg-white p-3 align-top"
                      >
                        {/* Top action buttons: Replace & Remove */}
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <button
                            type="button"
                            data-compare-slot-trigger="replace"
                            aria-pressed={replaceA11y.ariaPressed}
                            aria-label={replaceA11y.ariaLabel}
                            onClick={() => handleStartReplace(idx)}
                            className={`btn btn-sm rounded-pill small px-2 py-0 ${
                              replaceA11y.ariaPressed
                                ? 'btn-dark fw-semibold'
                                : 'btn-light text-muted border'
                            }`}
                            title={t('replaceDeviceTitle', {
                              unit: activeCategoryMeta.unitLabel,
                            })}
                          >
                            {replaceA11y.visibleLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(p.slug)}
                            className="rate-remove-target btn btn-sm border-0 d-inline-flex align-items-center justify-content-center p-0"
                            title={t('removeDeviceTitle')}
                            aria-label={t('removeDeviceAria', { name: p.name })}
                          >
                            <span
                              className="rate-remove-dot rounded-circle d-inline-flex align-items-center justify-content-center"
                              aria-hidden="true"
                            >
                              ×
                            </span>
                          </button>
                        </div>

                        <div className="d-flex flex-column align-items-center">
                          <div
                            className="rounded-3 d-flex align-items-center justify-content-center position-relative mb-2 border bg-white p-2"
                            style={{ height: '148px', width: '148px' }}
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={p.name}
                                style={{
                                  maxHeight: '132px',
                                  maxWidth: '132px',
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              <div className="text-muted small">{p.brand}</div>
                            )}
                          </div>

                          <span className="rate-spec-pill mb-1">{p.brand}</span>

                          <Link
                            href={getMasterProductHref({
                              ...p,
                              slug:
                                lookupCompareOwnSlug(versusSlugMap, p.slug) ||
                                catalogRowSlug(p as ItemCatalogRow),
                              metadata: {
                                ...(p.metadata &&
                                typeof p.metadata === 'object' &&
                                !Array.isArray(p.metadata)
                                  ? p.metadata
                                  : {}),
                                category_slug: getMasterProductCategorySlug(p),
                              },
                            })}
                            className="fw-bold text-dark text-decoration-none h6 mb-2"
                          >
                            {p.name}
                          </Link>

                          {/* Core Rating Badges First (Per DESIGN.md v3.0) */}
                          <div className="d-flex justify-content-center align-items-center mb-2 flex-wrap gap-1">
                            {hasActiveCompareWeights && (
                              <span className="small text-secondary fw-semibold w-100">
                                {t('officialRateScoreLabel')}
                              </span>
                            )}
                            <StarRating
                              value={userRating}
                              count={reviewCount}
                              size="sm"
                              emptyLabel={t('unratedShort')}
                            />
                            {expertRating != null && (
                              <span className="rate-score-badge-expert">
                                Lab {formatDecimal(expertRating, locale, 1)}/10
                              </span>
                            )}
                          </div>

                          {hasActiveCompareWeights &&
                            (() => {
                              const customEntry = customCompareScoresById.get(
                                p.id
                              );
                              const customVal =
                                customEntry?.customScore5 ?? null;
                              const isCustomWinner =
                                customVal !== null &&
                                customCompareWinner !== null &&
                                !customCompareWinner.isTie &&
                                customCompareWinner.scoredCount >= 2 &&
                                customCompareWinner.winnerIds.has(p.id);
                              return (
                                <div
                                  data-testid="compare-col-custom-score"
                                  className={`rounded-pill rate-tabular small fw-semibold mb-2 border px-2 py-1 ${
                                    isCustomWinner
                                      ? 'bg-success bg-opacity-10 border-success text-success'
                                      : 'bg-light text-dark'
                                  }`}
                                >
                                  {customVal !== null
                                    ? `${t('yourCustomScoreLabel')}: ★ ${formatRatingValue(customVal, locale, 2)}/5`
                                    : `${t('yourCustomScoreLabel')}: ${t('criterionNoData')}`}
                                  {isCustomWinner && (
                                    <span
                                      className="badge bg-success rounded-pill ms-1 text-white"
                                      style={{ fontSize: '0.75rem' }}
                                    >
                                      {t('bestBadge')}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                          {/* Neutral Reference Price */}
                          <div className="text-secondary small fw-semibold rate-tabular mb-2">
                            {t('referencePriceLabel')}{' '}
                            <strong className="text-dark">
                              {minPriceFormatted}
                            </strong>
                          </div>

                          <div
                            className="mb-2"
                            data-testid="compare-radar-signal"
                          >
                            <RadarBadge
                              signal={getRadarSignal(radarIndex, p.slug)}
                              minSpreadPct={Infinity}
                            />
                          </div>

                          <div className="d-flex mt-1 gap-2">
                            <Link
                              href={`${getMasterProductHref({
                                ...p,
                                slug:
                                  lookupCompareOwnSlug(versusSlugMap, p.slug) ||
                                  catalogRowSlug(p as ItemCatalogRow),
                                metadata: {
                                  ...(p.metadata &&
                                  typeof p.metadata === 'object' &&
                                  !Array.isArray(p.metadata)
                                    ? p.metadata
                                    : {}),
                                  category_slug:
                                    getMasterProductCategorySlug(p),
                                },
                              })}#jreviews-section`}
                              className="btn btn-sm btn-dark rounded-pill fw-medium px-3"
                            >
                              {t('readReviewsAndScoreBtn')}
                            </Link>
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  {/* Empty Add-Device Slot Column if fewer than 4 products */}
                  {products.length < MAX_COMPARE_ITEMS && (
                    <th
                      style={{ minWidth: '210px', width: '220px' }}
                      className="bg-light p-3 align-middle"
                    >
                      <div className="d-flex flex-column align-items-center justify-content-center py-4">
                        <button
                          type="button"
                          data-compare-slot-trigger="add"
                          onClick={() => {
                            clearReplaceMode();
                            setDropdownOpen(true);
                            searchInputRef.current?.focus();
                          }}
                          className="btn btn-outline-dark rounded-circle d-flex align-items-center justify-content-center mb-2"
                          style={{
                            width: '52px',
                            height: '52px',
                            fontSize: '24px',
                          }}
                          title={resolveCompareAddSlotAriaLabel(
                            t,
                            activeCategoryMeta.unitLabel
                          )}
                          aria-label={resolveCompareAddSlotAriaLabel(
                            t,
                            activeCategoryMeta.unitLabel
                          )}
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                        <div className="fw-bold small text-dark mb-1">
                          {t('addCategorySlotTitle', {
                            category: activeCategoryMeta.label,
                          })}
                        </div>
                        <div
                          className="text-muted fw-normal"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {t('remainingSlotsSub', {
                            remaining: MAX_COMPARE_ITEMS - products.length,
                          })}
                        </div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {hasActiveCompareWeights && (
                  <tr data-testid="compare-custom-score-row">
                    <td className="text-dark small fw-semibold bg-light text-start">
                      <div>{t('yourCustomScoreLabel')}</div>
                      <div className="text-muted fw-normal">
                        {activeComparePresetTitle}
                      </div>
                    </td>
                    {products.map((p) => {
                      const customVal =
                        customCompareScoresById.get(p.id)?.customScore5 ?? null;
                      const isCustomWinner =
                        highlightWinners &&
                        customVal !== null &&
                        customCompareWinner !== null &&
                        !customCompareWinner.isTie &&
                        customCompareWinner.scoredCount >= 2 &&
                        customCompareWinner.winnerIds.has(p.id);
                      return (
                        <td
                          key={`custom-score-${p.id}`}
                          className={`small rate-tabular ${
                            isCustomWinner
                              ? 'bg-success bg-opacity-10 fw-bold text-success'
                              : customVal !== null
                                ? 'fw-semibold text-dark'
                                : 'text-secondary'
                          }`}
                        >
                          {customVal !== null
                            ? `★ ${formatRatingValue(customVal, locale, 2)} / 5`
                            : t('criterionNoData')}
                          {isCustomWinner && (
                            <span
                              className="badge bg-success rounded-pill ms-1 text-white"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              {t('bestBadge')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {products.length < MAX_COMPARE_ITEMS && (
                      <td className="bg-light text-muted small">-</td>
                    )}
                  </tr>
                )}
                <tr data-testid="compare-radar-row">
                  <td className="text-muted small fw-semibold bg-light text-start">
                    {t('radarRowMatrixTitle')}
                  </td>
                  {products.map((p) => {
                    const sig = getRadarSignal(radarIndex, p.slug);
                    if (sig.verdict === 'none') {
                      return (
                        <td
                          key={`radar-${p.id}`}
                          className="small text-secondary"
                        >
                          {t('radarStableMedian')}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={`radar-${p.id}`}
                        className={`small fw-semibold ${
                          sig.verdict === 'genuine_deal'
                            ? 'bg-success bg-opacity-10 text-success'
                            : 'bg-danger bg-opacity-10 text-danger'
                        }`}
                      >
                        {sig.verdict === 'genuine_deal'
                          ? t(
                              isMultiPlatformFloor(sig.genuineDeal)
                                ? 'radarGenuineFloor'
                                : 'radarBelowMedian',
                              {
                                pct: formatDecimal(sig.savingsPct, locale, 1),
                                platform: (
                                  sig.genuineDeal?.platform ?? ''
                                ).toUpperCase(),
                              }
                            )
                          : t('radarFakeMarkup', {
                              pct: formatDecimal(sig.fakeMarkupPct, locale, 1),
                            })}
                      </td>
                    );
                  })}
                  {products.length < MAX_COMPARE_ITEMS && (
                    <td className="bg-light text-muted small">-</td>
                  )}
                </tr>
                {visibleSpecGroups.map((group) => {
                  const visibleRows = group.rows;

                  const totalCols =
                    products.length +
                    1 +
                    (products.length < MAX_COMPARE_ITEMS ? 1 : 0);

                  const groupTitle = groupHeading(group);

                  return (
                    <React.Fragment key={group.id}>
                      <tr className="table-secondary fw-bold text-start">
                        <td colSpan={totalCols} className="px-3 py-2">
                          <group.icon aria-hidden="true" className="me-2" />
                          {groupTitle}
                        </td>
                      </tr>

                      {visibleRows.map((row) => {
                        // Compute best numeric value across compared products if applicable
                        let bestNumeric: number | null = null;
                        if (
                          highlightWinners &&
                          products.length > 1 &&
                          row.numericValue
                        ) {
                          const nums = products
                            .map((p) => row.numericValue?.(p) ?? null)
                            .filter(
                              (n): n is number => n !== null && !Number.isNaN(n)
                            );
                          if (nums.length >= 2) {
                            const uniqueNums = new Set(nums);
                            if (uniqueNums.size > 1) {
                              bestNumeric =
                                row.higherIsBetter === false
                                  ? Math.min(...nums)
                                  : Math.max(...nums);
                            }
                          }
                        }

                        return (
                          <tr key={row.id}>
                            <td className="text-muted small fw-medium bg-light text-start">
                              {row.label}
                            </td>
                            {products.map((p) => {
                              const cell = (row.renderCell ?? row.renderValue)(
                                p
                              );
                              const segments = compareCellSegments(cell);
                              const numVal = row.numericValue?.(p) ?? null;
                              const isWinner =
                                bestNumeric !== null &&
                                numVal !== null &&
                                numVal === bestNumeric;

                              return (
                                <td
                                  key={`${row.id}-${p.id}`}
                                  className={`small ${
                                    isWinner
                                      ? 'bg-success bg-opacity-10 fw-bold text-success'
                                      : 'text-dark'
                                  }`}
                                >
                                  {/* Screen-only cells: the stars, and the
                                  lab score on 10 as the product page shows
                                  it; exports keep renderValue (#1528). */}
                                  {row.screenValue ? (
                                    row.screenValue(p)
                                  ) : row.id === 'rating_weighted' ? (
                                    <StarRating
                                      value={getEffectiveRating(p)}
                                      count={
                                        p.authentic_review_count ||
                                        p.total_reviews ||
                                        0
                                      }
                                      size="sm"
                                      emptyLabel={t('valNoReviews')}
                                    />
                                  ) : (
                                    <CompareCellText
                                      segments={segments}
                                      locale={locale}
                                    />
                                  )}
                                  {isWinner && (
                                    <span
                                      className="badge bg-success rounded-pill ms-1 text-white"
                                      style={{ fontSize: '0.8125rem' }}
                                    >
                                      {t('bestBadge')}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            {products.length < MAX_COMPARE_ITEMS && (
                              <td className="bg-light text-muted small">-</td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  // The versus page already scores the pair in its hero, so it shows the
  // comparison right after it, then the picker and other pairs; the
  // second summary stays on /compare only (DOS/Rate#1473).
  if (layout === 'versus') {
    return (
      <div>
        {matrixBlock}
        <div className="mt-4">{controlsBlock}</div>
        {popularBlock}
      </div>
    );
  }

  return (
    <div>
      <Suspense fallback={null}>
        <CompareUrlWeightsSync
          categorySlug={activeCategory}
          onSync={handleCompareUrlWeightsSync}
        />
      </Suspense>
      {controlsBlock}
      {popularBlock}
      {summaryBlock}
      {matrixBlock}
    </div>
  );
}
