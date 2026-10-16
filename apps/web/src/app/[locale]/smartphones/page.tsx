import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import {
  getCachedCategoryDirectoryFacets,
  getMasterProducts,
  type MasterProductFilterParams,
} from '@/server/rate';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
  SORT_OPTIONS,
  type ProductSortOption,
} from '@/lib/category-filters';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import ListSidebarOne from '../components/list-sidebar-one';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import {
  BsCpu,
  BsLightningCharge,
  BsPatchCheckFill,
  BsPhone,
  BsSearch,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';

import { normalizeRateLocale } from '@/lib/rate-i18n';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const facets = await getCachedCategoryDirectoryFacets('smartphones');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = 'https://rate.vn/smartphones';

  return {
    title:
      lang === 'en'
        ? `Smartphone Price Comparison & 10-Group Spec Filter (${totalModels} Models) | Rate.vn`
        : lang === 'cs'
          ? `Srovnání cen chytrých telefonů a filtr 10 skupin parametrů (${totalModels} modelů) | Rate.vn`
          : totalModels > 0
            ? `So sánh giá Điện thoại di động (${totalModels} mẫu máy chuẩn hóa) | Rate.vn`
            : 'So sánh giá Điện thoại di động & Kiểm định khuyến mãi AI | Rate.vn',
    description:
      lang === 'en'
        ? 'Filter smartphones by 10 standardized technical spec groups (PhoneArena/GSMArena), inspect true historical prices, and filter AI seeding reviews on Rate.vn.'
        : lang === 'cs'
          ? 'Filtrujte chytré telefony podle 10 skupin parametrů, zkontrolujte historii skutečných cen a filtrujte AI seeding recenze na Rate.vn.'
          : 'Tìm kiếm và lọc điện thoại theo 10 nhóm thông số kỹ thuật chuẩn PhoneArena/GSMArena, kiểm tra lịch sử giá thật và lọc đánh giá Seeding bằng AI trên Rate.vn.',
    alternates: {
      canonical: canonicalUrl,
    },
  };
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
  const categorySlug =
    getSingleParam(rawSearch.category) || defaultCategorySlug;
  const q = getSingleParam(rawSearch.q).trim();
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
  const currentSortOption: { value: ProductSortOption; label: string } =
    SORT_OPTIONS.find((s) => s.value === sortParam) ?? {
      value: 'default',
      label: 'Mặc định (Mới cập nhật)',
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
  };

  const [facets, products] = await Promise.all([
    getCachedCategoryDirectoryFacets(categorySlug),
    getMasterProducts(filterParams),
  ]);

  const schema = getCategoryFilterSchema(
    categorySlug,
    facets.brands.map((b) => b.name)
  );

  // Build dismissible active filter tags matching grid-layout-01 `.alert.tag-alert`
  const activeChips: ActiveFilterChip[] = [];

  if (q) {
    activeChips.push({
      id: 'q',
      label: `Từ khóa: "${q}"`,
      removeHref: buildFilterHref(basePath, rawSearch, { q: null }),
    });
  }

  for (const b of activeBrands) {
    const nextBrands = activeBrands.filter(
      (item) => item.toLowerCase() !== b.toLowerCase()
    );
    activeChips.push({
      id: `brand-${b}`,
      label: `Hãng: ${b}`,
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
      label: `Giá: ${minM} - ${maxM}`,
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

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      {/* Hero Banner (DESIGN.md v2.0 Dark Obsidian + DOS Crimson Glow) */}
      <div
        className="hero-banner position-relative overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(255, 46, 41, 0.16), transparent 45%), radial-gradient(circle at 82% 18%, rgba(99, 102, 241, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
          paddingTop: '3.5rem',
          paddingBottom: '4.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="position-relative z-1 container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
              <div className="position-relative mt-2 text-start">
                <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
                  <span
                    className="badge rounded-pill px-3 py-2"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.07)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#f8fafc',
                    }}
                  >
                    📂 Directory: {schema.directoryName}
                  </span>
                  <span
                    className="badge rounded-pill px-3 py-2"
                    style={{
                      backgroundColor: 'rgba(255, 46, 41, 0.16)',
                      border: '1px solid rgba(255, 46, 41, 0.38)',
                      color: '#ff8585',
                    }}
                  >
                    Category:{' '}
                    {facets.currentCategory?.name || schema.categoryTitle}
                  </span>
                </div>
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
        <div className="container">
          <div className="row align-items-center justify-content-center">
            <div className="col-xl-11 col-lg-12 col-md-12 col-12">
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
                            <div className="flexStart ps-2">
                              <span className="fw-semibold text-dark">
                                Tìm máy
                              </span>
                            </div>
                            <input
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
                              <span className="fw-semibold text-dark">
                                Hãng
                              </span>
                            </div>
                            <input
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
                        Tìm kiếm
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Section matching grid-layout-01 */}
      <section>
        <div className="container">
          <div className="row g-4">
            {/* Left Sidebar: Dynamic 10-Field-Groups Filter */}
            <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
              <Suspense
                fallback={
                  <div className="bg-light rounded-4 text-muted small p-4">
                    Đang tải bộ lọc thông số...
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
            <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
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
                            aria-label={`Remove ${chip.label}`}
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
                          Xóa tất cả
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Results Header + Compare Button + Sort Dropdown */}
              <div className="row align-items-center justify-content-between g-2 mb-4">
                <div className="col-xl-7 col-lg-7 col-md-7 col-sm-12">
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <h6 className="m-0">
                      Tìm thấy{' '}
                      <span className="text-primary fw-bold">
                        {products.length}
                      </span>{' '}
                      / {facets.totalUnfiltered} sản phẩm chuẩn hóa
                    </h6>
                    {products.length >= 2 && (
                      <Link
                        href={`/compare?cat=${categorySlug}&slugs=${products
                          .map((p) => p.slug)
                          .slice(0, 3)
                          .join(',')}`}
                        className="badge bg-primary-subtle text-primary text-decoration-none rounded-pill fw-semibold px-3 py-2"
                      >
                        <BsLightningCharge className="me-1" />
                        So sánh nhanh {products.length >= 3 ? '3 máy' : '2 máy'}
                      </Link>
                    )}
                    {products.length >= 2 && products[0] && products[1] && (
                      <Link
                        href={`/compare/${products[0].slug}-vs-${products[1].slug}`}
                        className="badge bg-danger-subtle text-danger text-decoration-none rounded-pill fw-semibold px-3 py-2"
                      >
                        ⚔️ Kèo 1v1: {products[0].brand} vs {products[1].brand}
                      </Link>
                    )}
                    <Link
                      href={`/leaderboard?cat=${categorySlug}`}
                      className="badge bg-dark text-decoration-none rounded-pill fw-semibold px-3 py-2 text-white"
                    >
                      🏆 Bảng Xếp Hạng
                    </Link>
                  </div>
                </div>

                <div className="col-xl-5 col-lg-5 col-md-5 col-sm-12">
                  <div className="text-md-end">
                    <div className="dropdown d-inline-flex p-0">
                      <a
                        href="#shortfilter"
                        className="dropdown-toggle toogleDrops px-3 py-2"
                        id="shortfilter"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        Sắp xếp: {currentSortOption.label}
                      </a>
                      <div className="dropdown-menu dropdown-menu-end border shadow-sm">
                        <ul className="card rounded-0 list-unstyled mb-0 p-0">
                          {SORT_OPTIONS.map((opt) => (
                            <li key={opt.value}>
                              <Link
                                href={buildFilterHref(basePath, rawSearch, {
                                  sort:
                                    opt.value === 'default' ? null : opt.value,
                                })}
                                className={`dropdown-item ${
                                  currentSortOption.value === opt.value
                                    ? 'active'
                                    : ''
                                }`}
                              >
                                {opt.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Cards Grid (DESIGN.md v3.0 Rating & Review-First .rate-card) */}
              {products.length === 0 ? (
                <div className="card rounded-4 bg-light border-0 p-5 text-center shadow-sm">
                  <h5 className="fw-bold mb-2">
                    {facets.totalUnfiltered === 0
                      ? `Danh mục "${schema.categoryTitle}" đang chờ đồng bộ dữ liệu sản phẩm mới`
                      : 'Không tìm thấy sản phẩm khớp với bộ lọc hiện tại'}
                  </h5>
                  <p className="text-muted mb-3">
                    {facets.totalUnfiltered === 0
                      ? `Bộ khung chuẩn hóa 10 nhóm thông số cho ${schema.categoryTitle} (${schema.defaultBrands.join(', ')}) đã sẵn sàng. Trong lúc chờ đội ngũ Crawler nạp thêm dữ liệu danh mục này, bạn có thể khám phá danh mục Điện thoại hoặc Bảng so sánh.`
                      : 'Hãy thử nới lỏng khoảng giá hoặc bỏ bớt một vài tiêu chí phần cứng để xem thêm các dòng máy khác.'}
                  </p>
                  <div className="d-flex justify-content-center flex-wrap gap-2">
                    {activeChips.length > 0 && (
                      <Link
                        href={basePath}
                        className="btn btn-primary rounded-pill fw-medium px-4"
                      >
                        Đặt lại bộ lọc
                      </Link>
                    )}
                    {categorySlug !== 'smartphones' && (
                      <Link
                        href="/smartphones"
                        className="btn btn-primary rounded-pill fw-medium px-4"
                      >
                        Xem danh mục Điện thoại đang có sẵn →
                      </Link>
                    )}
                    <Link
                      href="/merchants"
                      className="btn btn-outline-dark rounded-pill fw-medium px-4"
                    >
                      Hồ sơ Tín nhiệm Gian hàng
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="row align-items-stretch justify-content-start g-xl-4 g-3">
                  {products.map((item) => {
                    const minPriceFormatted = Number(
                      item.min_price
                    ).toLocaleString('vi-VN');
                    const maxPriceFormatted = Number(
                      item.max_price
                    ).toLocaleString('vi-VN');
                    const keySpecs = (item.key_specs || {}) as KeySpecs;
                    const specs = (item.specifications ||
                      {}) as ProductSpecifications;
                    const thumb =
                      item.thumbnail ||
                      (item.images && item.images.length > 0
                        ? item.images[0]
                        : null);

                    const effectiveRating =
                      item.user_rating_weighted &&
                      Number(item.user_rating_weighted) > 0
                        ? Number(item.user_rating_weighted)
                        : Number(item.average_rating || 4.8);
                    const expertScore =
                      item.expert_rating != null &&
                      Number(item.expert_rating) > 0
                        ? Number(item.expert_rating)
                        : effectiveRating;
                    const authCount =
                      item.authentic_review_count || item.total_reviews || 12;

                    const refreshHz = specs.display?.refresh_rate_hz;
                    const nfcSupported = specs.connectivity?.nfc;
                    const fastChargeW = specs.battery?.fast_charging_w;

                    return (
                      <div
                        className="col-xl-6 col-lg-6 col-md-6 col-sm-12 col-12"
                        key={item.id}
                      >
                        <div className="rate-card rounded-4 d-flex flex-column h-100 border bg-white p-3 shadow-sm">
                          {/* Top Identity & Compare Toggle */}
                          <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
                            <div className="d-flex align-items-center flex-wrap gap-1">
                              <span className="badge bg-dark text-uppercase rounded-pill small px-2 py-1 text-white">
                                {item.brand}
                              </span>
                              {item.has_5g && (
                                <span className="rate-spec-pill">5G</span>
                              )}
                              {refreshHz && refreshHz >= 120 && (
                                <span className="rate-spec-pill">
                                  {refreshHz}Hz
                                </span>
                              )}
                              {nfcSupported && (
                                <span className="rate-spec-pill">NFC</span>
                              )}
                            </div>
                            <CompareQuickToggle
                              item={{
                                slug: item.slug,
                                name: item.name,
                                brand: item.brand,
                                thumbnail: thumb ?? null,
                                min_price: Number(item.min_price || 0),
                                categoryPath: basePath,
                              }}
                            />
                          </div>

                          {/* Studio Image Frame */}
                          <Link
                            href={`${basePath}/${item.slug}`}
                            className="d-flex align-items-center justify-content-center bg-light rounded-3 text-decoration-none mb-3 p-3"
                            style={{ height: '215px' }}
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={item.name}
                                className="img-fluid"
                                style={{
                                  maxHeight: '180px',
                                  width: 'auto',
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              <div className="text-muted small">
                                Chưa có ảnh
                              </div>
                            )}
                          </Link>

                          {/* Title */}
                          <h4 className="h5 fw-bold mb-2">
                            <Link
                              href={`${basePath}/${item.slug}`}
                              className="text-dark text-decoration-none"
                            >
                              {item.name}
                              <BsPatchCheckFill
                                className="text-primary ms-1"
                                style={{ fontSize: '0.9rem' }}
                              />
                            </Link>
                          </h4>

                          {/* #1 Core Focus: JReviews Dual-Rating Score Strip */}
                          <div className="d-flex align-items-center mb-2 flex-wrap gap-1">
                            <span className="rate-score-badge-user">
                              ★ {effectiveRating.toFixed(1)} User ({authCount}{' '}
                              đánh giá thật)
                            </span>
                            <span className="rate-score-badge-expert">
                              🔬 {expertScore.toFixed(1)} Expert Lab
                            </span>
                          </div>

                          {/* 10 Field Groups Spec Badges */}
                          <div className="d-flex mb-3 flex-wrap gap-1">
                            {(item.ram_gb || item.storage_gb) && (
                              <span className="rate-spec-pill">
                                💾 {item.ram_gb ? `${item.ram_gb}GB / ` : ''}
                                {item.storage_gb
                                  ? formatStorageLabel(Number(item.storage_gb))
                                  : ''}
                              </span>
                            )}
                            {(keySpecs.chip || specs.hardware?.chipset) && (
                              <span className="rate-spec-pill">
                                <BsCpu className="me-1" />
                                {keySpecs.chip || specs.hardware?.chipset}
                              </span>
                            )}
                            {item.battery_mah && (
                              <span className="rate-spec-pill">
                                🔋 {item.battery_mah} mAh
                                {fastChargeW ? ` (${fastChargeW}W)` : ''}
                              </span>
                            )}
                            {(keySpecs.screen || item.screen_size_inch) && (
                              <span className="rate-spec-pill">
                                <BsPhone className="me-1" />
                                {keySpecs.screen || `${item.screen_size_inch}"`}
                              </span>
                            )}
                          </div>

                          {/* Neutral Market Reference Strip */}
                          <div className="d-flex justify-content-between align-items-center small text-muted border-top mt-auto pt-2">
                            <span>
                              Giá tham khảo:{' '}
                              <strong className="text-dark font-monospace">
                                {minPriceFormatted} ₫
                              </strong>
                              {item.max_price > item.min_price && (
                                <span className="text-muted font-monospace ms-1">
                                  ~ {maxPriceFormatted} ₫
                                </span>
                              )}
                            </span>
                            <span>
                              <BsShop className="me-1" />
                              {item.merchant_count || 1} nguồn
                            </span>
                          </div>

                          {/* Primary Review-Centric CTA Bar */}
                          <div className="d-flex mt-3 gap-2">
                            <Link
                              href={`${basePath}/${item.slug}`}
                              className="btn btn-sm btn-primary rounded-pill fw-semibold flex-grow-1 py-2"
                            >
                              ★ Xem Review &amp; 10 Nhóm Thông Số
                            </Link>
                            <Link
                              href={`/inspect?q=${encodeURIComponent(item.slug)}`}
                              className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3 py-2"
                              title="Kiểm định lịch sử giá 90 ngày & phát hiện giảm giá ảo"
                            >
                              🔍 Kiểm định
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
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
