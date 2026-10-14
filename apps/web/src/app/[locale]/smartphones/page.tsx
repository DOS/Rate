import React, { Suspense } from 'react';
import { Link } from '@/lib/navigation';
import {
  getCategoryDirectoryFacets,
  getMasterProducts,
  type MasterProductFilterParams,
} from '@/lib/rate-api';
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

type SearchParamsInput = Record<string, string | string[] | undefined>;

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
  return qs ? `/smartphones?${qs}` : '/smartphones';
}

interface ActiveFilterChip {
  id: string;
  label: string;
  removeHref: string;
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

  const categorySlug = getSingleParam(rawSearch.category) || 'smartphones';
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

  const sortParam = (getSingleParam(rawSearch.sort) || 'default') as ProductSortOption;
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
    minBatteryMah: bigBattery ? 5000 : undefined,
    minRefreshRateHz: highRefresh ? 120 : undefined,
    minFastChargingW: fastCharge ? 45 : undefined,
    has5g: has5g ? true : undefined,
    hasNfc: hasNfc ? true : undefined,
    maxScreenSizeInch: compactScreen ? 6.2 : undefined,
    sort: currentSortOption.value,
  };

  const [facets, products] = await Promise.all([
    getCategoryDirectoryFacets(categorySlug),
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
      removeHref: buildFilterHref(rawSearch, { q: null }),
    });
  }

  for (const b of activeBrands) {
    const nextBrands = activeBrands.filter(
      (item) => item.toLowerCase() !== b.toLowerCase()
    );
    activeChips.push({
      id: `brand-${b}`,
      label: `Hãng: ${b}`,
      removeHref: buildFilterHref(rawSearch, {
        brands: nextBrands.length > 0 ? nextBrands.join(',') : null,
        brand: null,
      }),
    });
  }

  if (minRating > 0) {
    activeChips.push({
      id: 'rating',
      label: `★ ${minRating.toFixed(1)}+`,
      removeHref: buildFilterHref(rawSearch, { rating: null }),
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
      removeHref: buildFilterHref(rawSearch, { minPrice: null, maxPrice: null }),
    });
  }

  for (const r of ramGb) {
    const nextRam = ramGb.filter((x) => x !== r);
    activeChips.push({
      id: `ram-${r}`,
      label: `RAM ${r}GB`,
      removeHref: buildFilterHref(rawSearch, {
        ram: nextRam.length > 0 ? nextRam.join(',') : null,
      }),
    });
  }

  for (const s of storageGb) {
    const nextStorage = storageGb.filter((x) => x !== s);
    activeChips.push({
      id: `rom-${s}`,
      label: `ROM ${formatStorageLabel(s)}`,
      removeHref: buildFilterHref(rawSearch, {
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
      removeHref: buildFilterHref(rawSearch, { [flag.key]: null }),
    });
  }

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      {/* Hero Banner matching grid-layout-01 */}
      <div
        className="image-cover hero-banner bg-primary"
        style={{ backgroundImage: `url(/img/banner-6.jpg)` }}
        data-overlay="5"
      >
        <div className="container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
              <div className="position-relative text-start mt-4">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <span className="badge badge-xs badge-transparent rounded-pill px-3 py-1">
                    📂 Directory: {schema.directoryName}
                  </span>
                  <span className="badge badge-xs listOpen rounded-pill px-3 py-1">
                    Category: {facets.currentCategory?.name || schema.categoryTitle}
                  </span>
                </div>
                <h1 className="text-light fw-bold mb-2">{schema.categoryTitle}</h1>
                <p className="fs-5 fw-light text-light opacity-90 mb-0">
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
                action={locale === 'vi' ? '/smartphones' : `/${locale}/smartphones`}
                className="heroSearch style-01 shadow-sm"
              >
                {categorySlug !== 'smartphones' && (
                  <input type="hidden" name="category" value={categorySlug} />
                )}
                {sortParam !== 'default' && (
                  <input type="hidden" name="sort" value={sortParam} />
                )}
                {minRating > 0 && (
                  <input type="hidden" name="rating" value={String(minRating)} />
                )}
                {minPrice > 0 && (
                  <input type="hidden" name="minPrice" value={String(minPrice)} />
                )}
                {maxPrice > 0 && (
                  <input type="hidden" name="maxPrice" value={String(maxPrice)} />
                )}
                {ramGb.length > 0 && (
                  <input type="hidden" name="ram" value={ramGb.join(',')} />
                )}
                {storageGb.length > 0 && (
                  <input type="hidden" name="storage" value={storageGb.join(',')} />
                )}
                {has5g && <input type="hidden" name="has5g" value="1" />}
                {highRefresh && <input type="hidden" name="highRefresh" value="1" />}
                {bigBattery && <input type="hidden" name="bigBattery" value="1" />}
                {fastCharge && <input type="hidden" name="fastCharge" value="1" />}
                {hasNfc && <input type="hidden" name="hasNfc" value="1" />}
                {compactScreen && <input type="hidden" name="compactScreen" value="1" />}
                <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2 align-items-center">
                  <div className="col-xl-9 col-lg-8 col-md-12">
                    <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                      <div className="col-xl-7 col-lg-7 col-md-12 col-sm-12">
                        <div className="form-group mb-0">
                          <div className="mobSearch d-flex align-items-center justify-content-start">
                            <div className="flexStart ps-2">
                              <span className="fw-semibold text-dark">Tìm máy</span>
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
                              <span className="fw-semibold text-dark">Hãng</span>
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
                    <div className="form-group mb-0 d-flex gap-2">
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
                  <div className="p-4 bg-light rounded-4 text-muted small">
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
                    <div className="d-flex align-items-center justify-content-start gap-2 flex-wrap">
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
                            categorySlug !== 'smartphones'
                              ? `/smartphones?category=${categorySlug}`
                              : '/smartphones'
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
              <div className="row align-items-center justify-content-between mb-4 g-2">
                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-12">
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <h6 className="m-0">
                      Tìm thấy <span className="text-primary fw-bold">{products.length}</span>{' '}
                      / {facets.totalUnfiltered} sản phẩm chuẩn hóa
                    </h6>
                    {products.length >= 2 && (
                      <Link
                        href={`/compare?slugs=${products
                          .map((p) => p.slug)
                          .slice(0, 3)
                          .join(',')}`}
                        className="badge bg-primary-subtle text-primary text-decoration-none px-3 py-2 rounded-pill fw-semibold"
                      >
                        <BsLightningCharge className="me-1" />
                        So sánh nhanh {products.length >= 3 ? '3 máy' : '2 máy'}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-12">
                  <div className="text-md-end">
                    <div className="dropdown d-inline-flex p-0">
                      <a
                        href="#shortfilter"
                        className="py-2 px-3 dropdown-toggle toogleDrops"
                        id="shortfilter"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        Sắp xếp: {currentSortOption.label}
                      </a>
                      <div className="dropdown-menu dropdown-menu-end border shadow-sm">
                        <ul className="card rounded-0 p-0 mb-0 list-unstyled">
                          {SORT_OPTIONS.map((opt) => (
                            <li key={opt.value}>
                              <Link
                                href={buildFilterHref(rawSearch, {
                                  sort: opt.value === 'default' ? null : opt.value,
                                })}
                                className={`dropdown-item ${
                                  currentSortOption.value === opt.value ? 'active' : ''
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

              {/* Product Cards Grid matching `.singlelisting-item` in grid-layout-01 */}
              {products.length === 0 ? (
                <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-light">
                  <h5 className="fw-bold mb-2">
                    Không tìm thấy sản phẩm khớp với bộ lọc hiện tại
                  </h5>
                  <p className="text-muted mb-3">
                    Hãy thử nới lỏng khoảng giá hoặc bỏ bớt một vài tiêu chí phần cứng để xem thêm các dòng máy khác.
                  </p>
                  <div>
                    <Link
                      href="/smartphones"
                      className="btn btn-primary rounded-pill px-4 fw-medium"
                    >
                      Đặt lại bộ lọc
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="row align-items-stretch justify-content-start g-xl-4 g-3">
                  {products.map((item) => {
                    const minPriceFormatted = Number(item.min_price).toLocaleString('vi-VN');
                    const maxPriceFormatted = Number(item.max_price).toLocaleString('vi-VN');
                    const keySpecs = (item.key_specs || {}) as KeySpecs;
                    const specs = (item.specifications || {}) as ProductSpecifications;
                    const thumb =
                      item.thumbnail ||
                      (item.images && item.images.length > 0 ? item.images[0] : null);

                    const effectiveRating =
                      item.user_rating_weighted && Number(item.user_rating_weighted) > 0
                        ? Number(item.user_rating_weighted)
                        : Number(item.average_rating || 0);

                    const ratingColorClass =
                      effectiveRating >= 4.2
                        ? 'good'
                        : effectiveRating >= 3.2
                          ? 'mid'
                          : effectiveRating > 0
                            ? 'poor'
                            : 'good';

                    const refreshHz = specs.display?.refresh_rate_hz;
                    const nfcSupported = specs.connectivity?.nfc;
                    const fastChargeW = specs.battery?.fast_charging_w;

                    return (
                      <div
                        className="col-xl-6 col-lg-6 col-md-6 col-sm-12 col-12"
                        key={item.id}
                      >
                        <div className="listingitem-container h-100">
                          <div className="singlelisting-item h-100 d-flex flex-column">
                            {/* Top Image Area */}
                            <div className="listing-top-item">
                              <Link
                                href={`/smartphones/${item.slug}`}
                                className="topLink d-flex align-items-center justify-content-center bg-light"
                                style={{ height: '250px', padding: '20px' }}
                              >
                                <div className="position-absolute start-0 top-0 ms-3 mt-3 z-2">
                                  <div className="d-flex align-items-center justify-content-start gap-2 flex-wrap">
                                    <span className="badge badge-xs text-uppercase listOpen">
                                      {item.brand}
                                    </span>

                                    {item.has_5g && (
                                      <span className="badge badge-xs badge-transparent">
                                        5G
                                      </span>
                                    )}

                                    {refreshHz && refreshHz >= 120 && (
                                      <span className="badge badge-xs badge-transparent">
                                        {refreshHz}Hz
                                      </span>
                                    )}

                                    {nfcSupported && (
                                      <span className="badge badge-xs badge-transparent">
                                        NFC
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={item.name}
                                    className="img-fluid"
                                    style={{
                                      maxHeight: '200px',
                                      width: 'auto',
                                      objectFit: 'contain',
                                    }}
                                  />
                                ) : (
                                  <div className="text-muted small">Chưa có ảnh</div>
                                )}
                              </Link>
                              <div className="position-absolute end-0 bottom-0 me-3 mb-3 z-2">
                                <span className="badge bg-dark bg-opacity-75 text-white px-3 py-2 rounded-pill small">
                                  <BsShop className="me-1" />
                                  {item.merchant_count || 1} nơi bán
                                </span>
                              </div>
                            </div>

                            {/* Middle Spec & Price Area */}
                            <div className="listing-middle-item flex-grow-1 d-flex flex-column">
                              <div className="listing-details">
                                <h4 className="listingTitle mb-1">
                                  <Link
                                    href={`/smartphones/${item.slug}`}
                                    className="titleLink"
                                  >
                                    {item.name}
                                    <span className="verified ms-1">
                                      <BsPatchCheckFill className="bi bi-patch-check-fill m-0" />
                                    </span>
                                  </Link>
                                </h4>
                                <div className="text-danger fw-bold fs-5 mb-2">
                                  {minPriceFormatted} ₫
                                  {item.max_price > item.min_price && (
                                    <span className="text-muted fw-normal small ms-2">
                                      - {maxPriceFormatted} ₫
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* 10 Field Groups Spec Badges */}
                              <div className="listing-info-details mt-auto pt-2">
                                <div className="d-flex flex-wrap gap-1">
                                  {(item.ram_gb || item.storage_gb) && (
                                    <span className="badge bg-light text-dark border small fw-normal">
                                      💾 {item.ram_gb ? `${item.ram_gb}GB / ` : ''}
                                      {item.storage_gb
                                        ? formatStorageLabel(Number(item.storage_gb))
                                        : ''}
                                    </span>
                                  )}
                                  {(keySpecs.chip || specs.hardware?.chipset) && (
                                    <span className="badge bg-light text-dark border small fw-normal">
                                      <BsCpu className="me-1" />
                                      {keySpecs.chip || specs.hardware?.chipset}
                                    </span>
                                  )}
                                  {item.battery_mah && (
                                    <span className="badge bg-light text-dark border small fw-normal">
                                      🔋 {item.battery_mah} mAh
                                      {fastChargeW ? ` (${fastChargeW}W)` : ''}
                                    </span>
                                  )}
                                  {(keySpecs.screen || item.screen_size_inch) && (
                                    <span className="badge bg-light text-dark border small fw-normal">
                                      <BsPhone className="me-1" />
                                      {keySpecs.screen || `${item.screen_size_inch}"`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Footer Rating & Action matching `.listing-footer-item` */}
                            <div className="listing-footer-item">
                              <div className="d-flex align-items-center justify-content-between gap-2">
                                <div className="catdWraps">
                                  <div className="flex-start">
                                    <Link
                                      href={`/smartphones/${item.slug}`}
                                      className="d-flex align-items-center justify-content-start gap-2"
                                    >
                                      <span className="catIcon cats-1">
                                        <BsPhone className="" />
                                      </span>
                                      <span className="catTitle">
                                        Xem 10 nhóm thông số
                                      </span>
                                    </Link>
                                  </div>
                                </div>
                                <div className="listing-rates">
                                  <div className="d-flex align-items-center justify-content-start gap-1">
                                    {item.expert_rating && Number(item.expert_rating) > 0 && (
                                      <span
                                        className="badge bg-dark text-warning border border-warning small me-1"
                                        title="Điểm chuyên gia Rate.vn"
                                      >
                                        Expert {Number(item.expert_rating).toFixed(1)}
                                      </span>
                                    )}
                                    <span className={`ratingAvarage ${ratingColorClass}`}>
                                      <BsStarFill className="me-1" />
                                      {effectiveRating > 0
                                        ? effectiveRating.toFixed(1)
                                        : 'Mới'}
                                    </span>
                                    <span className="overallrates">
                                      ({item.authentic_review_count || item.total_reviews || 0})
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
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

      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
