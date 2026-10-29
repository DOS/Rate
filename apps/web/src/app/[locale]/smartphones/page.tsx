import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { IntentLink } from '@/components/elementary/IntentLink';
import {
  getCachedCategoryDirectoryFacets,
  getCachedMasterProducts,
  getItemCatalogPage,
  getCrossPlatformDealRadar,
  getMasterProducts,
  type MasterProductFilterParams,
} from '@/server/rate';
import type { CanonicalCategorySlug } from '@/lib/rate-api';
import { isPlainListing } from '@/lib/catalog-listing';
import { absoluteUrl, SITE_URL } from '@/lib/seo';
import { buildRadarIndex, getRadarSignal } from '@/lib/deal-radar';
import ProductCard, {
  type ProductCardSpec,
} from '@/components/product/ProductCard';
import { saleStateOfMaster } from '@/lib/sale-state';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
  SORT_OPTIONS,
  type ProductSortOption,
} from '@/lib/category-filters';
import { catalogRowSlug, itemSizeChips } from '@/lib/item-directory';
import PageShell from '../components/page-shell';
import ListSidebarOne from '../components/list-sidebar-one';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import ContentText from '@/components/elementary/ContentText';
import CategoryCatalogToolbar from '@/components/leaderboard/CategoryCatalogToolbar';
import {
  BsArrowLeftRight,
  BsArrowRight,
  BsBatteryHalf,
  BsCpu,
  BsLightningCharge,
  BsPhone,
  BsSearch,
  BsTrophy,
  BsGraphDownArrow,
  BsExclamationTriangle,
} from 'react-icons/bs';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import ClientMessages from '@/components/providers/ClientMessages';
import BootstrapClient from '@/app/BootstrapClient';
import { productImageUrl } from '@/lib/rate-domain-core';

// Reads searchParams, so it renders per request. The [locale] layout's
// generateStaticParams would otherwise make it static, and the searchParams
// read would then fail with DYNAMIC_SERVER_USAGE (DOS/Rate#491).
export const dynamic = 'force-dynamic';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const facets = await getCachedCategoryDirectoryFacets('smartphones');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = catalogCanonicalUrl('/smartphones', await searchParams);

  return {
    title:
      totalModels > 0
        ? t('meta.smartphones.titleCount', { count: totalModels })
        : t('meta.smartphones.titleDefault'),
    description: t('meta.smartphones.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

/**
 * Canonical URL of a catalogue page: page 2+ of a category is its own page
 * (self-canonical), not a duplicate of page 1 (DOS/Rate#482). Filters still
 * canonicalise to the category.
 */
export function catalogCanonicalUrl(
  basePath: string,
  rawSearch: SearchParamsInput
): string {
  const page = Math.floor(Number(getSingleParam(rawSearch.page)));
  const base = `https://rate.vn${basePath}`;
  return Number.isFinite(page) && page > 1 && page <= 500
    ? `${base}?page=${page}`
    : base;
}

function getSingleParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

function parseCsvStrings(val: string | string[] | undefined): string[] {
  const raw = getSingleParam(val);
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsvNumbers(val: string | string[] | undefined): number[] {
  return parseCsvStrings(val)
    .map((s) => Number(s))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

// Products per catalogue page (DOS/Rate#466). One extra row is requested to
// know whether a next page exists.
const CATALOG_PAGE_SIZE = 200;

function buildFilterHref(
  basePath: string,
  currentSearch: SearchParamsInput,
  overrides: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(currentSearch)) {
    const single = getSingleParam(val);
    if (single) {
      params.set(key, single);
    }
  }
  // Any other change (filter, sort) starts again from the first page.
  if (!('page' in overrides)) params.delete('page');
  for (const [key, val] of Object.entries(overrides)) {
    if (val === null || val === undefined || val === '') {
      params.delete(key);
    } else {
      params.set(key, val);
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

interface ActiveFilterChip {
  id: string;
  label: string;
  removeHref: string;
}

export async function CategoryCatalogContent({
  locale,
  rawSearch,
  defaultCategorySlug = 'smartphones',
  basePath = '/smartphones',
}: {
  locale: string;
  rawSearch: SearchParamsInput;
  defaultCategorySlug?: string;
  basePath?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const categorySlug =
    getSingleParam(rawSearch.category) || defaultCategorySlug;
  const q = getSingleParam(rawSearch.q).trim();
  const requestedPage = Math.floor(Number(getSingleParam(rawSearch.page)));
  const page =
    Number.isFinite(requestedPage) && requestedPage > 1
      ? Math.min(requestedPage, 500)
      : 1;
  const brands = parseCsvStrings(rawSearch.brands);
  const singleBrand = getSingleParam(rawSearch.brand).trim();
  const activeBrands =
    brands.length > 0 ? brands : singleBrand ? [singleBrand] : [];
  const ramGb = parseCsvNumbers(rawSearch.ram);
  const storageGb = parseCsvNumbers(rawSearch.storage);
  const minPrice = Number(getSingleParam(rawSearch.minPrice) || 0);
  const maxPrice = Number(getSingleParam(rawSearch.maxPrice) || 0);
  const minRating = Number(getSingleParam(rawSearch.rating) || 0);
  const has5g = getSingleParam(rawSearch.has5g) === '1';
  const highRefresh = getSingleParam(rawSearch.highRefresh) === '1';
  const bigBattery = getSingleParam(rawSearch.bigBattery) === '1';
  const fastCharge = getSingleParam(rawSearch.fastCharge) === '1';
  const hasNfc = getSingleParam(rawSearch.hasNfc) === '1';
  const compactScreen = getSingleParam(rawSearch.compactScreen) === '1';

  const sortParam = (getSingleParam(rawSearch.sort) ||
    'default') as ProductSortOption;
  const matchedSort = SORT_OPTIONS.find((s) => s.value === sortParam);
  const currentSortOption: { value: ProductSortOption; label: string } = {
    value: matchedSort ? matchedSort.value : 'default',
    label: t(`sortOptions.${matchedSort ? matchedSort.value : 'default'}`),
  };

  const filterParams: MasterProductFilterParams = {
    categorySlug,
    brands: activeBrands.length > 0 ? activeBrands : undefined,
    search: q || undefined,
    minPrice: minPrice > 0 ? minPrice : undefined,
    maxPrice: maxPrice > 0 ? maxPrice : undefined,
    minRating: minRating > 0 ? minRating : undefined,
    ramGb: ramGb.length > 0 ? ramGb : undefined,
    storageGb: storageGb.length > 0 ? storageGb : undefined,
    minBatteryMah: bigBattery
      ? categorySlug === 'tablets'
        ? 8000
        : 5000
      : undefined,
    minRefreshRateHz: highRefresh ? 120 : undefined,
    minFastChargingW: fastCharge ? 45 : undefined,
    has5g: has5g ? true : undefined,
    hasNfc: hasNfc ? true : undefined,
    maxScreenSizeInch: compactScreen ? 6.2 : undefined,
    sort: currentSortOption.value,
    limit: CATALOG_PAGE_SIZE + 1,
    offset: (page - 1) * CATALOG_PAGE_SIZE,
  };

  // The plain listing (only the bounded page and a known sort) is most of
  // the traffic and shares the data cache. Filtered reads stay uncached:
  // free-form values (search, prices, brands) would each create an entry
  // (DOS/Rate#495).
  const readVariants = (params: MasterProductFilterParams) =>
    isPlainListing(params)
      ? getCachedMasterProducts(params)
      : getMasterProducts(params);
  const [facets, pageRows, categoryDealRadar] = await Promise.all([
    getCachedCategoryDirectoryFacets(categorySlug),
    // RATE_ITEM_MODEL on: one card per Item, so the page is cut after
    // grouping every matching variant (DOS/Rate#1155); off: as before.
    getItemCatalogPage(
      (offset, limit) => readVariants({ ...filterParams, limit, offset }),
      filterParams.offset ?? 0,
      filterParams.limit ?? CATALOG_PAGE_SIZE + 1,
      filterParams.sort
    ).then((itemRows) => itemRows ?? readVariants(filterParams)),
    getCrossPlatformDealRadar({
      categorySlug: categorySlug as CanonicalCategorySlug,
      // Max page size: card badges and exports need a signal for EVERY product,
      // the feed strips below slice their own top entries.
      limit: 50,
    }),
  ]);

  const hasNextPage = pageRows.length > CATALOG_PAGE_SIZE;
  const products = pageRows.slice(0, CATALOG_PAGE_SIZE);
  const pageHref = (target: number) =>
    buildFilterHref(basePath, rawSearch, {
      page: target > 1 ? String(target) : null,
    });

  const radarIndex = buildRadarIndex(categoryDealRadar);

  const baseSchema = getCategoryFilterSchema(
    categorySlug,
    facets.brands.map((b) => b.name)
  );
  const schema = localizeCategoryFilterSchema(baseSchema, t);

  // Build dismissible active filter tags matching grid-layout-01 `.alert.tag-alert`
  const activeChips: ActiveFilterChip[] = [];

  if (q) {
    activeChips.push({
      id: 'q',
      label: t('page.chipKeyword', { query: q }),
      removeHref: buildFilterHref(basePath, rawSearch, { q: null }),
    });
  }

  for (const b of activeBrands) {
    const nextBrands = activeBrands.filter(
      (item) => item.toLowerCase() !== b.toLowerCase()
    );
    activeChips.push({
      id: `brand-${b}`,
      label: t('page.chipBrand', { brand: b }),
      removeHref: buildFilterHref(basePath, rawSearch, {
        brands: nextBrands.length > 0 ? nextBrands.join(',') : null,
        brand: null,
      }),
    });
  }

  if (minRating > 0) {
    activeChips.push({
      id: 'rating',
      label: `★ ${minRating.toFixed(1)}+`,
      removeHref: buildFilterHref(basePath, rawSearch, { rating: null }),
    });
  }

  if (minPrice > 0 || maxPrice > 0) {
    const minM = minPrice > 0 ? `${Math.round(minPrice / 1_000_000)}tr` : '0đ';
    const maxM =
      maxPrice > 0
        ? `${Math.round(maxPrice / 1_000_000)}tr`
        : `${schema.priceRangeMillion.max}tr+`;
    activeChips.push({
      id: 'price',
      label: t('page.chipPrice', { min: minM, max: maxM }),
      removeHref: buildFilterHref(basePath, rawSearch, {
        minPrice: null,
        maxPrice: null,
      }),
    });
  }

  for (const r of ramGb) {
    const nextRam = ramGb.filter((x) => x !== r);
    activeChips.push({
      id: `ram-${r}`,
      label: `RAM ${r}GB`,
      removeHref: buildFilterHref(basePath, rawSearch, {
        ram: nextRam.length > 0 ? nextRam.join(',') : null,
      }),
    });
  }

  for (const s of storageGb) {
    const nextStorage = storageGb.filter((x) => x !== s);
    activeChips.push({
      id: `rom-${s}`,
      label: `ROM ${formatStorageLabel(s)}`,
      removeHref: buildFilterHref(basePath, rawSearch, {
        storage: nextStorage.length > 0 ? nextStorage.join(',') : null,
      }),
    });
  }

  const featureKeyFlags: { key: string; active: boolean }[] = [
    { key: 'has5g', active: has5g },
    { key: 'highRefresh', active: highRefresh },
    { key: 'bigBattery', active: bigBattery },
    { key: 'fastCharge', active: fastCharge },
    { key: 'hasNfc', active: hasNfc },
    { key: 'compactScreen', active: compactScreen },
  ];

  for (const flag of featureKeyFlags) {
    if (!flag.active) continue;
    const def = schema.featureCheckboxes.find((f) => f.key === flag.key);
    activeChips.push({
      id: `feat-${flag.key}`,
      label: def ? def.label : flag.key,
      removeHref: buildFilterHref(basePath, rawSearch, { [flag.key]: null }),
    });
  }

  // Breadcrumb and a summary ItemList of the listed products, the form Google
  // reads on list pages (DOS/Rate#750).
  const [tNav, tDetail] = await Promise.all([
    getTranslations({ locale, namespace: 'rate.nav' }),
    getTranslations({ locale, namespace: 'productDetail' }),
  ]);
  const categoryLabel = tNav.has(categorySlug)
    ? tNav(categorySlug as 'smartphones')
    : categorySlug;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: tDetail('breadcrumbHome'),
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: categoryLabel,
            item: absoluteUrl(basePath),
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: categoryLabel,
        itemListElement: products.map((item, index) => ({
          '@type': 'ListItem',
          position: (page - 1) * CATALOG_PAGE_SIZE + index + 1,
          name: item.name,
          url: absoluteUrl(`${basePath}/${catalogRowSlug(item)}`),
        })),
      },
    ],
  };

  return (
    <ClientMessages scope="catalog">
      <PageShell locale={locale}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
        {/* Bootstrap JS (bundled, not a CDN) drives only the catalog's sort
        dropdown and filter drawer, so other pages skip it (DOS/Rate#754). */}
        <BootstrapClient />

        {/* Hero Banner (DESIGN.md v2.0 Dark Obsidian + DOS Crimson Glow) */}
        <div
          className="hero-banner rate-surface-dark rate-ink-on-dark position-relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 18% 22%, rgba(216, 48, 48, 0.16), transparent 45%), radial-gradient(circle at 82% 18%, rgba(99, 102, 241, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
            paddingTop: '3.5rem',
            paddingBottom: '4.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="position-relative z-1 rate-catalog-wide">
            <div className="row justify-content-center align-items-center">
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                <div className="position-relative mt-2 text-start">
                  <span className="rate-eyebrow mb-3">
                    {schema.directoryName} · {schema.categoryTitle}
                  </span>
                  <h1
                    className="fw-bold mb-2 text-white"
                    style={{
                      fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)',
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {schema.categoryTitle}
                  </h1>
                  <p
                    className="fs-6 mb-0"
                    style={{ color: '#94a3b8', maxWidth: '760px' }}
                  >
                    {schema.categorySubtitle}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Hero Search Bar matching grid-layout-01 `.heroSearch.style-01` */}
        <div className="position-relative d-flex flex-column mt-n3 z-2">
          <div className="rate-catalog-wide">
            <div className="row align-items-center justify-content-center">
              <div className="col-12">
                <form
                  method="GET"
                  action={basePath}
                  className="heroSearch style-01 shadow-sm"
                >
                  {categorySlug !== defaultCategorySlug && (
                    <input type="hidden" name="category" value={categorySlug} />
                  )}
                  {sortParam !== 'default' && (
                    <input type="hidden" name="sort" value={sortParam} />
                  )}
                  {minRating > 0 && (
                    <input
                      type="hidden"
                      name="rating"
                      value={String(minRating)}
                    />
                  )}
                  {minPrice > 0 && (
                    <input
                      type="hidden"
                      name="minPrice"
                      value={String(minPrice)}
                    />
                  )}
                  {maxPrice > 0 && (
                    <input
                      type="hidden"
                      name="maxPrice"
                      value={String(maxPrice)}
                    />
                  )}
                  {ramGb.length > 0 && (
                    <input type="hidden" name="ram" value={ramGb.join(',')} />
                  )}
                  {storageGb.length > 0 && (
                    <input
                      type="hidden"
                      name="storage"
                      value={storageGb.join(',')}
                    />
                  )}
                  {has5g && <input type="hidden" name="has5g" value="1" />}
                  {highRefresh && (
                    <input type="hidden" name="highRefresh" value="1" />
                  )}
                  {bigBattery && (
                    <input type="hidden" name="bigBattery" value="1" />
                  )}
                  {fastCharge && (
                    <input type="hidden" name="fastCharge" value="1" />
                  )}
                  {hasNfc && <input type="hidden" name="hasNfc" value="1" />}
                  {compactScreen && (
                    <input type="hidden" name="compactScreen" value="1" />
                  )}
                  <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2 align-items-center">
                    <div className="col-xl-9 col-lg-8 col-md-12">
                      <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                        <div className="col-xl-7 col-lg-7 col-md-12 col-sm-12">
                          <div className="form-group mb-0">
                            <div className="mobSearch d-flex align-items-center justify-content-start">
                              {/* The caption labels the input, not only sits
                                  next to it (DOS/Rate#1077). */}
                              <div className="flexStart ps-2">
                                <label
                                  htmlFor="catalog-search-q"
                                  className="fw-semibold text-dark text-nowrap mb-0"
                                >
                                  {t('page.searchLabel')}
                                </label>
                              </div>
                              <input
                                id="catalog-search-q"
                                type="text"
                                name="q"
                                defaultValue={q}
                                className="form-control fs-6 fw-medium border-0"
                                placeholder={schema.searchPlaceholder}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-5 col-lg-5 col-md-12 col-sm-12 single-border">
                          <div className="form-group mb-0">
                            <div className="mobSearch d-flex align-items-center justify-content-start">
                              <div className="flexStart ps-2">
                                <label
                                  htmlFor="catalog-search-brands"
                                  className="fw-semibold text-dark mb-0"
                                >
                                  {t('page.brandLabel')}
                                </label>
                              </div>
                              <input
                                id="catalog-search-brands"
                                type="text"
                                name="brands"
                                defaultValue={activeBrands.join(',')}
                                className="form-control fs-6 fw-medium border-0"
                                placeholder="Apple, Samsung, Xiaomi..."
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-xl-3 col-lg-4 col-md-12 col-sm-12">
                      <div className="form-group d-flex mb-0 gap-2">
                        <button
                          type="submit"
                          className="btn btn-primary full-width fw-medium"
                        >
                          <BsSearch className="me-2" />
                          {t('page.searchBtn')}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width catalog (DOS/Rate#1132): a fixed-width filter sidebar
        that sticks under the navbar, and results that take the rest of the
        width up to the .rate-catalog-wide cap. */}
        <section className="rate-catalog-section">
          <div className="rate-catalog-wide">
            <div className="rate-catalog-layout">
              {/* Left Sidebar: Dynamic 10-Field-Groups Filter */}
              <div className="rate-catalog-sidebar">
                <Suspense
                  fallback={
                    <div className="bg-light rounded-4 text-muted small p-4">
                      {t('page.loadingFilters')}
                    </div>
                  }
                >
                  <ListSidebarOne
                    categorySlug={categorySlug}
                    categories={facets.categories}
                    brandFacets={facets.brands}
                  />
                </Suspense>
              </div>

              {/* Right Listing Grid */}
              <div className="rate-catalog-results">
                {/* Active Filter Chips matching `.alert.tag-alert` */}
                {activeChips.length > 0 && (
                  <div className="row align-items-start mb-4">
                    <div className="col-xl-12 col-lg-12 col-md-12">
                      <div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
                        {activeChips.map((chip) => (
                          <div
                            key={chip.id}
                            className="alert tag-alert alert-light alert-dismissible fade show mb-0"
                            role="alert"
                          >
                            <span>{chip.label}</span>
                            <Link
                              href={chip.removeHref}
                              className="btn-close"
                              aria-label={t('page.removeFilterAria', {
                                label: chip.label,
                              })}
                            />
                          </div>
                        ))}

                        <div className="clearList ms-2">
                          <Link
                            href={
                              categorySlug !== defaultCategorySlug
                                ? `${basePath}?category=${categorySlug}`
                                : basePath
                            }
                            className="fw-medium text-primary text-md"
                          >
                            {t('page.clearAllBtn')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Header + Compare Button + Sort Dropdown */}
                <div className="row align-items-center justify-content-between g-2 mb-4">
                  <div className="col-xl-7 col-lg-7 col-md-7 col-sm-12">
                    <div className="d-flex align-items-center flex-wrap gap-2 gap-md-3">
                      <h2 className="h6 fw-semibold m-0">
                        {t('page.foundPrefix')}{' '}
                        <span className="text-primary fw-bold">
                          {products.length}
                        </span>{' '}
                        {t('page.foundSuffix', {
                          total: facets.totalUnfiltered,
                        })}
                      </h2>
                      {products.length >= 2 && (
                        <Link
                          href={`/compare?cat=${categorySlug}&slugs=${products
                            .map((p) => p.slug)
                            .slice(0, 3)
                            .join(',')}`}
                          className="rate-results-link"
                        >
                          <BsLightningCharge aria-hidden="true" />
                          {products.length >= 3
                            ? t('page.quickCompare3')
                            : t('page.quickCompare2')}
                        </Link>
                      )}
                      {products.length >= 2 && products[0] && products[1] && (
                        <IntentLink
                          href={`/compare/${products[0].slug}-vs-${products[1].slug}`}
                          className="rate-results-link"
                        >
                          <BsArrowLeftRight aria-hidden="true" />
                          {t('page.versus1v1Badge', {
                            brandA: products[0].brand,
                            brandB: products[1].brand,
                          })}
                        </IntentLink>
                      )}
                      <IntentLink
                        href={`/leaderboard?cat=${categorySlug}`}
                        className="rate-results-link"
                      >
                        <BsTrophy aria-hidden="true" />
                        {t('page.leaderboardBadge')}
                      </IntentLink>
                    </div>
                  </div>

                  <div className="col-xl-5 col-lg-5 col-md-5 col-sm-12">
                    <div className="text-md-end">
                      <div className="dropdown d-inline-flex mw-100 p-0">
                        <a
                          href="#shortfilter"
                          className="dropdown-toggle toogleDrops px-3 py-2"
                          id="shortfilter"
                          data-bs-toggle="dropdown"
                          aria-expanded="false"
                        >
                          {t('page.sortByPrefix', {
                            label: currentSortOption.label,
                          })}
                        </a>
                        <div className="dropdown-menu dropdown-menu-end border shadow-sm">
                          <ul className="card rounded-0 list-unstyled mb-0 p-0">
                            {SORT_OPTIONS.map((opt) => (
                              <li key={opt.value}>
                                <Link
                                  href={buildFilterHref(basePath, rawSearch, {
                                    sort:
                                      opt.value === 'default'
                                        ? null
                                        : opt.value,
                                  })}
                                  className={`dropdown-item ${
                                    currentSortOption.value === opt.value
                                      ? 'active'
                                      : ''
                                  }`}
                                >
                                  {t(`sortOptions.${opt.value}`)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <CategoryCatalogToolbar
                  categorySlug={categorySlug}
                  categoryTitle={
                    facets.currentCategory?.name || schema.categoryTitle
                  }
                  products={products}
                  dealRadar={categoryDealRadar}
                />

                {/* Product Cards Grid (DESIGN.md v3.0 Rating & Review-First .rate-card) */}
                {products.length === 0 ? (
                  <div className="card rounded-4 bg-light border-0 p-5 text-center shadow-sm">
                    <h3 className="h5 fw-bold mb-2">
                      {facets.totalUnfiltered === 0
                        ? t('page.emptySyncingTitle', {
                            title: schema.categoryTitle,
                          })
                        : t('page.emptyMatchingTitle')}
                    </h3>
                    <p className="text-muted mb-3">
                      {facets.totalUnfiltered === 0
                        ? t('page.emptySyncingDesc', {
                            title: schema.categoryTitle,
                            brands: schema.defaultBrands.join(', '),
                          })
                        : t('page.emptyMatchingDesc')}
                    </p>
                    <div className="d-flex justify-content-center flex-wrap gap-2">
                      {activeChips.length > 0 && (
                        <Link
                          href={basePath}
                          className="btn btn-primary rounded-pill fw-medium px-4"
                        >
                          {t('page.resetFiltersBtn')}
                        </Link>
                      )}
                      {categorySlug !== 'smartphones' && (
                        <Link
                          href="/smartphones"
                          className="btn btn-primary rounded-pill fw-medium px-4"
                        >
                          {t('page.browseSmartphonesBtn')}
                        </Link>
                      )}
                      <Link
                        href="/merchants"
                        className="btn btn-outline-dark rounded-pill fw-medium px-4"
                      >
                        {t('page.merchantProfilesBtn')}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rate-catalog-grid">
                    {products.map((storedItem) => {
                      // Only the specs the category has (DOS/Rate#1142).
                      const item = applyCategorySpecTemplate(
                        categorySlug,
                        storedItem
                      );
                      const keySpecs = (item.key_specs || {}) as KeySpecs;
                      const specs = (item.specifications ||
                        {}) as ProductSpecifications;
                      const thumb = productImageUrl(item);

                      const effectiveRating =
                        item.user_rating_weighted &&
                        Number(item.user_rating_weighted) > 0
                          ? Number(item.user_rating_weighted)
                          : item.average_rating &&
                              Number(item.average_rating) > 0
                            ? Number(item.average_rating)
                            : null;
                      const expertScore =
                        item.expert_rating != null &&
                        Number(item.expert_rating) > 0
                          ? Number(item.expert_rating)
                          : null;

                      const refreshHz = specs.display?.refresh_rate_hz;
                      const fastChargeW = specs.battery?.fast_charging_w;
                      const memoryLabel = [
                        item.ram_gb ? `${item.ram_gb}GB` : '',
                        item.storage_gb
                          ? formatStorageLabel(Number(item.storage_gb))
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' / ');
                      const tags = [
                        memoryLabel,
                        item.has_5g ? '5G' : '',
                        refreshHz && refreshHz >= 120 ? `${refreshHz}Hz` : '',
                        specs.connectivity?.nfc ? 'NFC' : '',
                      ].filter(Boolean);

                      const cardSpecs: ProductCardSpec[] = [];
                      const chip = keySpecs.chip || specs.hardware?.chipset;
                      if (chip) {
                        cardSpecs.push({
                          key: 'chip',
                          icon: <BsCpu />,
                          label: String(chip),
                        });
                      }
                      const screen =
                        keySpecs.screen ||
                        (item.screen_size_inch
                          ? `${item.screen_size_inch}"`
                          : '');
                      if (screen) {
                        cardSpecs.push({
                          key: 'screen',
                          icon: <BsPhone />,
                          label: String(screen),
                        });
                      }
                      if (item.battery_mah) {
                        cardSpecs.push({
                          key: 'battery',
                          icon: <BsBatteryHalf />,
                          label: `${item.battery_mah} mAh${
                            fastChargeW ? ` · ${fastChargeW}W` : ''
                          }`,
                        });
                      }

                      return (
                        <div key={item.id}>
                          <ProductCard
                            slug={item.slug}
                            href={`${basePath}/${catalogRowSlug(item)}`}
                            sizeChips={itemSizeChips(
                              item,
                              `${basePath}/${catalogRowSlug(item)}`,
                              formatStorageLabel,
                              storageGb
                            )}
                            categoryPath={basePath}
                            name={item.name}
                            brand={item.brand}
                            thumbnail={thumb ?? null}
                            tags={tags}
                            specs={cardSpecs}
                            userScore={effectiveRating}
                            reviewCount={Number(
                              item.authentic_review_count ||
                                item.total_reviews ||
                                0
                            )}
                            expertScore={expertScore}
                            radarSignal={getRadarSignal(radarIndex, item.slug)}
                            minPrice={Number(item.min_price || 0)}
                            maxPrice={Number(item.max_price || 0)}
                            merchantCount={item.merchant_count || 0}
                            saleState={saleStateOfMaster(item)}
                            verified
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {(page > 1 || hasNextPage) && (
                  <nav
                    className="d-flex justify-content-center align-items-center gap-3 mt-4"
                    aria-label={t('page.paginationLabel')}
                  >
                    {page > 1 &&
                      (products.length === 0 ? (
                        // Past the last page: go back to the start.
                        <Link
                          href={pageHref(1)}
                          className="btn btn-outline-secondary rounded-pill px-4"
                        >
                          {t('page.firstPage')}
                        </Link>
                      ) : (
                        <Link
                          href={pageHref(page - 1)}
                          className="btn btn-outline-secondary rounded-pill px-4"
                          rel="prev"
                        >
                          {t('page.prevPage')}
                        </Link>
                      ))}
                    <span className="text-muted small">
                      {t('page.pageNumber', { page })}
                    </span>
                    {hasNextPage && (
                      <Link
                        href={pageHref(page + 1)}
                        className="btn btn-outline-secondary rounded-pill px-4"
                        rel="next"
                      >
                        {t('page.nextPage')}
                      </Link>
                    )}
                  </nav>
                )}
                {/* Deal radar sits after the results so the product list
                starts right under the toolbar (DOS/Rate#1132). */}
                {categoryDealRadar &&
                  (categoryDealRadar.genuineDeals.length > 0 ||
                    categoryDealRadar.fakeSaleTraps.length > 0) && (
                    <div
                      className="rate-card rate-home-radar mt-4"
                      data-testid="category-deal-radar"
                    >
                      <div className="rate-radar-spread-head">
                        <div>
                          <span className="rate-eyebrow mb-2">
                            {t('page.radarBannerBadge', {
                              title: schema.categoryTitle,
                            })}
                          </span>
                          <div className="rate-radar-item-meta">
                            {t('page.radarAnalyzedSub', {
                              count: categoryDealRadar.totalOffersAnalyzed,
                            })}
                          </div>
                        </div>
                        <Link href="/deals">
                          {t('page.viewAllRadarBtn')}
                          <BsArrowRight aria-hidden="true" />
                        </Link>
                      </div>

                      {categoryDealRadar.genuineDeals.length > 0 && (
                        <h3 className="rate-radar-list-title is-good mt-3">
                          <BsGraphDownArrow aria-hidden="true" />
                          {t('page.radarDealsTitle')}
                        </h3>
                      )}
                      <ul className="rate-radar-list">
                        {categoryDealRadar.genuineDeals.slice(0, 2).map((g) => (
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
                              </span>
                            </div>
                            <div className="rate-radar-item-side">
                              <span className="rate-radar-price">
                                {g.priceCurrent.toLocaleString('vi-VN')} ₫
                              </span>
                              <span className="rate-radar-tag is-good">
                                {t('page.vsMedianBadge', {
                                  pct: g.savingsVsMedianPct,
                                })}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {categoryDealRadar.fakeSaleTraps.length > 0 && (
                        <h3 className="rate-radar-list-title is-bad mt-3">
                          <BsExclamationTriangle aria-hidden="true" />
                          {t('page.radarTrapsTitle')}
                        </h3>
                      )}
                      <ul className="rate-radar-list">
                        {categoryDealRadar.fakeSaleTraps
                          .slice(0, 2)
                          .map((trap) => (
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
                                </span>
                              </div>
                              <div className="rate-radar-item-side">
                                <span className="rate-radar-price">
                                  {trap.priceCurrent.toLocaleString('vi-VN')} ₫
                                </span>
                                <span className="rate-radar-tag is-bad">
                                  {t('page.fakeMarkupBadge', {
                                    pct: trap.fakeMarkupPct,
                                  })}
                                </span>
                              </div>
                            </li>
                          ))}
                      </ul>

                      {Array.isArray(categoryDealRadar.priceSpreadLeaders) &&
                        categoryDealRadar.priceSpreadLeaders.length > 0 && (
                          <div
                            className="rate-radar-spread"
                            data-testid="category-price-spread-leaders"
                          >
                            <div className="rate-radar-spread-head">
                              <h3 className="rate-radar-list-title">
                                <BsArrowLeftRight aria-hidden="true" />
                                {t('page.spreadHeader', {
                                  title: schema.categoryTitle,
                                })}
                              </h3>
                              <span className="rate-radar-item-meta mb-3">
                                {t('page.spreadSub')}
                              </span>
                            </div>
                            <div className="row g-2">
                              {categoryDealRadar.priceSpreadLeaders
                                .slice(0, 2)
                                .map((sp) => (
                                  <div key={sp.productSlug} className="col-12">
                                    <div className="rate-radar-spread-item">
                                      <div className="rate-radar-item-main">
                                        <Link
                                          href={sp.productHref}
                                          className="text-truncate"
                                        >
                                          {sp.productName}
                                        </Link>
                                        <span className="rate-radar-item-meta">
                                          <span className="rate-radar-platform">
                                            {sp.cheapestPlatform}
                                          </span>
                                          vs{' '}
                                          <span className="rate-radar-platform">
                                            {sp.priciestPlatform}
                                          </span>
                                        </span>
                                      </div>
                                      <div className="rate-radar-item-side">
                                        <span className="rate-radar-tag is-warn">
                                          {t('page.spreadDiffBadge', {
                                            pct: sp.spreadPct,
                                            amount:
                                              sp.spreadVnd.toLocaleString(
                                                'vi-VN'
                                              ),
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
              </div>
            </div>
          </div>
        </section>

        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}

export default async function SmartphonesCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const rawSearch = await searchParams;
  return (
    <CategoryCatalogContent
      locale={locale}
      rawSearch={rawSearch}
      defaultCategorySlug="smartphones"
      basePath="/smartphones"
    />
  );
}
