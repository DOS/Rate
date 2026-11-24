'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsDownload } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  formatDecimal,
  formatListingPrice,
  formatNumber,
  sanitizeCurrencyPriceValue,
} from '@/lib/locale-format';
import { displayedScore5, formatScoreFixed } from '@/lib/rating-display';
import {
  MAX_VALID_VND_PRICE,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
  resolveListingPriceCurrency,
  type MasterProduct,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  RADAR_CSV_HEADERS,
  type CrossPlatformDealRadarResponse,
  type RadarSignal,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  versusHref,
} from '@/lib/item-compare';
import { catalogRowSlug, type ItemCatalogRow } from '@/lib/item-directory';

const CATALOG_CONTROL_CHARS_RE = /\p{Cc}+/gu;
const SAFE_CATALOG_VERSUS_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UNSAFE_CATALOG_VERSUS_SLUG_KEYS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'na',
  'false',
  'true',
  '__proto__',
  'constructor',
  'prototype',
  'tostring',
  'tolocalestring',
  'valueof',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  ...Object.getOwnPropertyNames(Object.prototype).map((k) => k.toLowerCase()),
]);

function isSafeCatalogVersusSlug(slug: unknown): slug is string {
  return (
    typeof slug === 'string' &&
    SAFE_CATALOG_VERSUS_SLUG_RE.test(slug) &&
    !slug.includes('..') &&
    !slug.endsWith('.') &&
    !(slug in Object.prototype) &&
    !UNSAFE_CATALOG_VERSUS_SLUG_KEYS.has(slug.toLowerCase())
  );
}

export function lookupCatalogOwnSlug(
  map: Readonly<Record<string, string>> | null | undefined,
  slug: string
): string | undefined {
  if (
    !map ||
    typeof map !== 'object' ||
    Array.isArray(map) ||
    typeof slug !== 'string' ||
    !slug ||
    !Object.hasOwn(map, slug)
  ) {
    return undefined;
  }
  const val = map[slug];
  return typeof val === 'string' && val ? val : undefined;
}

function setCatalogOwnSlug(
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

export function resolveCatalogVersusSideSlug(
  slug: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  if (typeof slug !== 'string' || !slug) return '';
  const mapped = lookupCatalogOwnSlug(itemSlugBySlug, slug);
  return isSafeCatalogVersusSlug(mapped) &&
    !mapped.toLowerCase().includes('-vs-')
    ? mapped
    : slug;
}

function canBeCatalogVersusSide(
  slug: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): boolean {
  if (typeof slug !== 'string' || !slug) return false;
  if (
    lookupCatalogOwnSlug(itemSlugBySlug, slug)?.toLowerCase().includes('-vs-')
  ) {
    return false;
  }
  const side = resolveCatalogVersusSideSlug(slug, itemSlugBySlug);
  return isSafeCatalogVersusSlug(side) && !side.toLowerCase().includes('-vs-');
}

export function isValidCatalogVersusPair(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): boolean {
  if (
    typeof slugA !== 'string' ||
    typeof slugB !== 'string' ||
    !slugA ||
    !slugB ||
    slugA.toLowerCase() === slugB.toLowerCase()
  ) {
    return false;
  }
  if (
    !canBeCatalogVersusSide(slugA, itemSlugBySlug) ||
    !canBeCatalogVersusSide(slugB, itemSlugBySlug)
  ) {
    return false;
  }
  const rawItemA = lookupCatalogOwnSlug(itemSlugBySlug, slugA);
  const rawItemB = lookupCatalogOwnSlug(itemSlugBySlug, slugB);
  if (
    rawItemA &&
    rawItemB &&
    rawItemA.toLowerCase() === rawItemB.toLowerCase()
  ) {
    return false;
  }
  const sideA = resolveCatalogVersusSideSlug(slugA, itemSlugBySlug);
  const sideB = resolveCatalogVersusSideSlug(slugB, itemSlugBySlug);
  if (sideA.toLowerCase() === sideB.toLowerCase()) return false;
  const [first, second] = canonicalVersusOrder(sideA, sideB);
  return isParseableVersusPair(first, second);
}

export function sanitizeCatalogToolbarText(
  value: unknown,
  fallback = '',
  maxLen = 160
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(CATALOG_CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeCatalogPriceVnd(
  value: unknown,
  currency?: string | null
): number {
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
  const sanitized = sanitizeCurrencyPriceValue(num, currency);
  return sanitized > 0 && sanitized <= MAX_VALID_VND_PRICE ? sanitized : 0;
}

export function sanitizeCatalogCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

export function sanitizeCatalogDownloadSlug(
  value: unknown,
  fallback = 'catalog'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(CATALOG_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

export function resolveCatalogExportSlug(
  p: { slug: string; item_slug?: string },
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  const mapped = lookupCatalogOwnSlug(itemSlugBySlug, p.slug);
  const raw = mapped || catalogRowSlug(p);
  return sanitizeCatalogToolbarText(raw, '', 120);
}

export function buildCatalogJsonProductEntry(
  p: MasterProduct & { item_slug?: string },
  rank: number,
  signal: RadarSignal | null | undefined,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
) {
  const rawUser = resolveCompareEffectiveUserRating(p);
  const expertScore10 = resolveCompareExpertRating10(p);
  const currency = resolveListingPriceCurrency({ master: p });
  const minPrice = sanitizeCatalogPriceVnd(p.min_price, currency);
  return {
    rank,
    slug: resolveCatalogExportSlug(p, itemSlugBySlug),
    name: sanitizeCatalogToolbarText(p.name, 'Unknown'),
    brand: sanitizeCatalogToolbarText(p.brand, '', 80),
    userRating: rawUser > 0 ? rawUser : null,
    ratingScore5: rawUser > 0 ? displayedScore5(rawUser) : null,
    expertRating: expertScore10,
    currency,
    minPrice,
    minPriceVnd: minPrice,
    dealRadar: radarExportFields(signal),
  };
}

export function buildCatalogItemSlugMap(
  products: readonly ItemCatalogRow[],
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): Record<string, string> {
  const map: Record<string, string> = {};
  if (
    itemSlugBySlug &&
    typeof itemSlugBySlug === 'object' &&
    !Array.isArray(itemSlugBySlug)
  ) {
    for (const [slug, itemSlug] of Object.entries(itemSlugBySlug)) {
      if (slug && typeof itemSlug === 'string' && itemSlug) {
        setCatalogOwnSlug(map, slug, itemSlug);
      }
    }
  }
  for (const p of products) {
    if (!p || typeof p.slug !== 'string' || !p.slug) continue;
    const rowSlug = catalogRowSlug(p);
    if (rowSlug && rowSlug !== p.slug && !Object.hasOwn(map, p.slug)) {
      setCatalogOwnSlug(map, p.slug, rowSlug);
    }
  }
  return map;
}

export function buildCatalogCsvRow(
  p: ItemCatalogRow,
  rank: number,
  safeCategorySlug: string,
  radar: RadarSignal | null | undefined,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string[] {
  const rawUser = resolveCompareEffectiveUserRating(p);
  const userRating = rawUser > 0 ? rawUser : null;
  const expertScore10 = resolveCompareExpertRating10(p);
  const currency = resolveListingPriceCurrency({ master: p });
  const minPrice = sanitizeCatalogPriceVnd(p.min_price, currency);
  const maxPrice = sanitizeCatalogPriceVnd(p.max_price, currency);
  return [
    String(rank),
    resolveCatalogExportSlug(p, itemSlugBySlug),
    sanitizeCatalogToolbarText(p.name, 'Unknown'),
    sanitizeCatalogToolbarText(p.brand, '', 80),
    safeCategorySlug,
    userRating != null ? formatScoreFixed(displayedScore5(userRating), 1) : '',
    expertScore10 != null ? formatScoreFixed(expertScore10, 1) : '',
    String(
      sanitizeCatalogCount(p.authentic_review_count || p.total_reviews || 0)
    ),
    String(sanitizeCatalogCount(p.merchant_count)),
    minPrice > 0 ? String(minPrice) : '',
    maxPrice > 0 ? String(maxPrice) : '',
    ...radarCsvCells(radar),
  ];
}

export type CatalogMarkdownKey =
  | 'toolbar.mdTitle'
  | 'toolbar.mdColModel'
  | 'toolbar.mdColBrand'
  | 'toolbar.mdColUserRating'
  | 'toolbar.mdColExpertScore'
  | 'toolbar.mdColAuthenticReviews'
  | 'toolbar.mdColMinPrice'
  | 'toolbar.mdColPriceSignal'
  | 'toolbar.unratedText';

export function buildCatalogMarkdown(
  products: readonly ItemCatalogRow[],
  categoryTitle: string,
  radarFor: (slug: string) => RadarSignal | null | undefined,
  locale: string,
  t: (
    key: CatalogMarkdownKey,
    values?: Record<string, string | number>
  ) => string
): string {
  const safeTitle = sanitizeCatalogToolbarText(
    categoryTitle,
    'smartphones',
    120
  );
  const headers = [
    '#',
    sanitizeCatalogToolbarText(t('toolbar.mdColModel'), 'Model'),
    sanitizeCatalogToolbarText(t('toolbar.mdColBrand'), 'Brand'),
    sanitizeCatalogToolbarText(
      t('toolbar.mdColUserRating'),
      'User rating (/5.0)'
    ),
    sanitizeCatalogToolbarText(
      t('toolbar.mdColExpertScore'),
      'Expert score (/10)'
    ),
    sanitizeCatalogToolbarText(
      t('toolbar.mdColAuthenticReviews'),
      'Authentic reviews'
    ),
    sanitizeCatalogToolbarText(t('toolbar.mdColMinPrice'), 'Min price (VND)'),
    sanitizeCatalogToolbarText(t('toolbar.mdColPriceSignal'), 'Price signal'),
  ];
  const sep = headers.map(() => '---');
  const rows = products.map((p, idx) => {
    const rawUser = resolveCompareEffectiveUserRating(p);
    const userRating = rawUser > 0 ? rawUser : null;
    const expertScore10 = resolveCompareExpertRating10(p);
    const radar = radarFor(p.slug);
    const currency = resolveListingPriceCurrency({ master: p });
    const minPrice = sanitizeCatalogPriceVnd(p.min_price, currency);
    const authReviews = sanitizeCatalogCount(
      p.authentic_review_count || p.total_reviews || 0
    );
    return [
      String(idx + 1),
      sanitizeCatalogToolbarText(p.name, 'Unknown'),
      sanitizeCatalogToolbarText(p.brand, '-', 80),
      userRating != null
        ? `${formatDecimal(displayedScore5(userRating), locale, 1)}/${formatDecimal(5, locale, 1)}`
        : t('toolbar.unratedText'),
      expertScore10 != null
        ? `${formatDecimal(expertScore10, locale, 1)}/10`
        : t('toolbar.unratedText'),
      formatNumber(authReviews, locale),
      minPrice > 0 ? formatListingPrice(minPrice, currency, locale) : '-',
      radarMarkdownCell(radar, locale),
    ];
  });

  return [
    t('toolbar.mdTitle', { title: safeTitle, count: products.length }),
    '',
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

interface CategoryCatalogToolbarProps {
  readonly categorySlug: string;
  readonly categoryTitle: string;
  readonly products: readonly ItemCatalogRow[];
  readonly dealRadar?: CrossPlatformDealRadarResponse | null;
  readonly itemSlugBySlug?: Readonly<Record<string, string>>;
}

export default function CategoryCatalogToolbar({
  categorySlug,
  categoryTitle,
  products,
  dealRadar,
  itemSlugBySlug,
}: CategoryCatalogToolbarProps) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const [slugA, setSlugA] = useState<string>('');
  const [slugB, setSlugB] = useState<string>('');
  const [copiedCatalogMd, setCopiedCatalogMd] = useState(false);
  const { ref: exportMenuRef, close: closeExportMenu } = useDetailsDismiss();

  const radarIndex = useDealRadarIndex(dealRadar);
  const radarFor = (slug: string) => getRadarSignal(radarIndex, slug);

  const safeCategorySlug = sanitizeCatalogDownloadSlug(
    categorySlug,
    'smartphones'
  );
  const safeCategoryTitle = sanitizeCatalogToolbarText(
    categoryTitle,
    safeCategorySlug,
    120
  );

  const resolvedItemSlugBySlug = useMemo(
    () => buildCatalogItemSlugMap(products, itemSlugBySlug),
    [products, itemSlugBySlug]
  );

  const validCandidates = useMemo(
    () =>
      products.filter((p) =>
        canBeCatalogVersusSide(p.slug, resolvedItemSlugBySlug)
      ),
    [products, resolvedItemSlugBySlug]
  );

  const selectableProductsA = useMemo(
    () =>
      validCandidates.filter((pA) =>
        validCandidates.some((pB) =>
          isValidCatalogVersusPair(pA.slug, pB.slug, resolvedItemSlugBySlug)
        )
      ),
    [validCandidates, resolvedItemSlugBySlug]
  );

  const effectiveSlugA = useMemo(() => {
    if (slugA && selectableProductsA.some((p) => p.slug === slugA)) {
      return slugA;
    }
    return selectableProductsA[0]?.slug ?? '';
  }, [slugA, selectableProductsA]);

  const selectableProductsB = useMemo(() => {
    if (!effectiveSlugA) return [];
    return validCandidates.filter((p) =>
      isValidCatalogVersusPair(effectiveSlugA, p.slug, resolvedItemSlugBySlug)
    );
  }, [effectiveSlugA, validCandidates, resolvedItemSlugBySlug]);

  const effectiveSlugB = useMemo(() => {
    if (slugB && selectableProductsB.some((p) => p.slug === slugB)) {
      return slugB;
    }
    return selectableProductsB[0]?.slug ?? '';
  }, [slugB, selectableProductsB]);

  const handleCopyCatalogMarkdown = async () => {
    if (typeof navigator === 'undefined' || products.length === 0) return;
    const md = buildCatalogMarkdown(
      products,
      safeCategoryTitle,
      radarFor,
      locale,
      t
    );

    try {
      await navigator.clipboard.writeText(md);
      setCopiedCatalogMd(true);
      setTimeout(() => setCopiedCatalogMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadCatalogCsv = () => {
    if (typeof document === 'undefined' || products.length === 0) return;
    const headers = [
      'Rank',
      'Slug',
      'Name',
      'Brand',
      'Category',
      'UserRating5',
      'ExpertScore10',
      'AuthenticReviewCount',
      'MerchantCount',
      'MinPriceVND',
      'MaxPriceVND',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = products.map((p, idx) =>
      buildCatalogCsvRow(
        p,
        idx + 1,
        safeCategorySlug,
        radarFor(p.slug),
        resolvedItemSlugBySlug
      )
    );

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
    a.download = `rate-catalog-${safeCategorySlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCategoryJson = () => {
    if (typeof document === 'undefined' || products.length === 0) return;
    const payload = {
      source: 'Rate.vn Category Catalog',
      categorySlug: safeCategorySlug,
      categoryTitle: safeCategoryTitle,
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map((p, idx) =>
        buildCatalogJsonProductEntry(
          p,
          idx + 1,
          radarFor(p.slug),
          resolvedItemSlugBySlug
        )
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-catalog-${safeCategorySlug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) return null;

  return (
    <div className="rate-card rate-catalog-toolbar mb-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        {effectiveSlugA &&
        effectiveSlugB &&
        isValidCatalogVersusPair(
          effectiveSlugA,
          effectiveSlugB,
          resolvedItemSlugBySlug
        ) ? (
          <div className="d-flex align-items-center flex-grow-1 flex-wrap gap-2">
            <span className="rate-catalog-toolbar-label">
              {t('toolbar.quick1v1Label', { title: safeCategoryTitle })}
            </span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '190px' }}
              value={effectiveSlugA}
              onChange={(e) => setSlugA(e.target.value)}
              aria-label={t('toolbar.selectDeviceAAria')}
            >
              {selectableProductsA.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="rate-catalog-toolbar-vs" aria-hidden="true">
              vs
            </span>
            <select
              className="form-select form-select-sm w-auto"
              style={{ maxWidth: '190px' }}
              value={effectiveSlugB}
              onChange={(e) => setSlugB(e.target.value)}
              aria-label={t('toolbar.selectDeviceBAria')}
            >
              {selectableProductsB.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <Link
              href={versusHref(
                effectiveSlugA,
                effectiveSlugB,
                resolvedItemSlugBySlug
              )}
              className="btn btn-sm btn-primary fw-semibold px-3"
              data-testid="catalog-1v1-go-btn"
            >
              {t('toolbar.versusGoBtn')}
            </Link>
          </div>
        ) : (
          <div />
        )}

        <details ref={exportMenuRef} className="rate-export-menu ms-auto">
          <summary>
            <BsDownload aria-hidden="true" />
            {t('toolbar.exportMenu')}
          </summary>
          <div className="rate-export-menu-list">
            <button
              type="button"
              onClick={handleCopyCatalogMarkdown}
              data-testid="copy-catalog-md-btn"
            >
              {copiedCatalogMd
                ? t('toolbar.copiedMdBtn')
                : t('toolbar.copyMdBtn')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadCatalogCsv();
                closeExportMenu();
              }}
              data-testid="download-catalog-csv-btn"
            >
              {t('toolbar.exportCsvBtn')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadCategoryJson();
                closeExportMenu();
              }}
              data-testid="download-catalog-json-btn"
            >
              {t('toolbar.exportJsonBtn')}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
