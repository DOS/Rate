'use client';
import React, { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { BsFunnel, BsStarFill } from 'react-icons/bs';
import { Link, usePathname, useRouter } from '@/lib/navigation';
import RangeSlider from './range-slider';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
  RATING_FILTER_OPTIONS,
} from '@/lib/category-filters';
import type { RateCategoryItem } from '@/lib/rate-domain';

export interface ListSidebarOneProps {
  categorySlug?: string;
  categories?: RateCategoryItem[];
  brandFacets?: { name: string; count: number }[];
}

export default function ListSidebarOne({
  categorySlug = 'smartphones',
  categories = [],
  brandFacets = [],
}: ListSidebarOneProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const schema = getCategoryFilterSchema(
    categorySlug,
    brandFacets.map((b) => b.name)
  );
  const brandCountMap = new Map(
    brandFacets.map((b) => [b.name.toLowerCase(), b.count])
  );

  // Parse active filter state from URL query params
  const currentQ = searchParams?.get('q') || '';
  const currentMinRating = Number(searchParams?.get('rating') || 0);
  const currentBrands = (searchParams?.get('brands') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const currentRams = (searchParams?.get('ram') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);
  const currentStorages = (searchParams?.get('storage') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);

  const sliderMin = schema.priceRangeMillion.min;
  const sliderMax = schema.priceRangeMillion.max;
  const rawMinMillion = searchParams?.get('minPrice')
    ? Math.min(
        sliderMax,
        Math.max(
          sliderMin,
          Math.round(Number(searchParams.get('minPrice')) / 1_000_000) ||
            sliderMin
        )
      )
    : sliderMin;
  const rawMaxMillion = searchParams?.get('maxPrice')
    ? Math.max(
        sliderMin,
        Math.min(
          sliderMax,
          Math.round(Number(searchParams.get('maxPrice')) / 1_000_000) ||
            sliderMax
        )
      )
    : sliderMax;
  const urlMinMillion = Math.min(rawMinMillion, rawMaxMillion);
  const urlMaxMillion = Math.max(rawMinMillion, rawMaxMillion);

  const [keyword, setKeyword] = useState(currentQ);
  const [priceRange, setPriceRange] = useState<[number, number]>([
    urlMinMillion,
    urlMaxMillion,
  ]);

  useEffect(() => {
    setKeyword(currentQ);
  }, [currentQ]);

  useEffect(() => {
    setPriceRange([urlMinMillion, urlMaxMillion]);
  }, [urlMinMillion, urlMaxMillion]);

  const updateUrlParams = (updater: (params: URLSearchParams) => void) => {
    const nextParams = new URLSearchParams(searchParams?.toString() || '');
    updater(nextParams);
    const qs = nextParams.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const toggleMultiString = (paramKey: string, val: string) => {
    updateUrlParams((params) => {
      const existing = (params.get(paramKey) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const lower = val.toLowerCase();
      const has = existing.some((x) => x.toLowerCase() === lower);
      const next = has
        ? existing.filter((x) => x.toLowerCase() !== lower)
        : [...existing, val];
      if (next.length > 0) {
        params.set(paramKey, next.join(','));
      } else {
        params.delete(paramKey);
      }
    });
  };

  const toggleMultiNumber = (paramKey: string, val: number) => {
    updateUrlParams((params) => {
      const existing = (params.get(paramKey) || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n) && n > 0);
      const has = existing.includes(val);
      const next = has ? existing.filter((x) => x !== val) : [...existing, val];
      if (next.length > 0) {
        params.set(paramKey, next.join(','));
      } else {
        params.delete(paramKey);
      }
    });
  };

  const handleRatingChange = (ratingVal: number) => {
    updateUrlParams((params) => {
      if (ratingVal > 0) {
        params.set('rating', String(ratingVal));
      } else {
        params.delete('rating');
      }
    });
  };

  const handlePriceSliderComplete = (values: [number, number]) => {
    updateUrlParams((params) => {
      if (values[0] > sliderMin) {
        params.set('minPrice', String(values[0] * 1_000_000));
      } else {
        params.delete('minPrice');
      }
      if (values[1] < sliderMax) {
        params.set('maxPrice', String(values[1] * 1_000_000));
      } else {
        params.delete('maxPrice');
      }
    });
  };

  const handlePricePresetClick = (minVnd?: number, maxVnd?: number) => {
    const isCurrentlySelected =
      (minVnd
        ? Number(searchParams?.get('minPrice') || 0) === minVnd
        : !searchParams?.get('minPrice')) &&
      (maxVnd && maxVnd < sliderMax * 1_000_000
        ? Number(searchParams?.get('maxPrice') || 0) === maxVnd
        : !searchParams?.get('maxPrice'));

    updateUrlParams((params) => {
      if (isCurrentlySelected) {
        params.delete('minPrice');
        params.delete('maxPrice');
      } else {
        if (minVnd && minVnd > 0) {
          params.set('minPrice', String(minVnd));
        } else {
          params.delete('minPrice');
        }
        if (maxVnd && maxVnd < sliderMax * 1_000_000) {
          params.set('maxPrice', String(maxVnd));
        } else {
          params.delete('maxPrice');
        }
      }
    });
  };

  const toggleFeatureCheckbox = (key: string) => {
    updateUrlParams((params) => {
      if (params.get(key) === '1') {
        params.delete(key);
      } else {
        params.set(key, '1');
      }
    });
  };

  const handleApplyForm = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams((params) => {
      if (keyword.trim()) {
        params.set('q', keyword.trim());
      } else {
        params.delete('q');
      }
      if (priceRange[0] > sliderMin) {
        params.set('minPrice', String(priceRange[0] * 1_000_000));
      } else {
        params.delete('minPrice');
      }
      if (priceRange[1] < sliderMax) {
        params.set('maxPrice', String(priceRange[1] * 1_000_000));
      } else {
        params.delete('maxPrice');
      }
    });
  };

  const handleResetAll = () => {
    setKeyword('');
    setPriceRange([sliderMin, sliderMax]);
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  return (
    <>
      <div className="searchingSidebar pe-xl-5">
        <div
          className="offcanvas offcanvas-start largeshow"
          data-bs-scroll="true"
          tabIndex={-1}
          id="filterSlider"
          aria-labelledby="filterSliderLabel"
        >
          <div className="offcanvas-header border-bottom py-3">
            <h3 className="h5 mb-0">Bộ lọc thông số</h3>
            <button
              type="button"
              className="btn-close d-lg-none text-sm"
              data-bs-dismiss="offcanvas"
              data-bs-target="#filterSlider"
              aria-label="Close"
            ></button>
          </div>
          <div
            className="offcanvas-body p-lg-0 overflow-x-hidden p-4"
            id="filterSliderLabel"
          >
            <div className="searchInner">
              <form className="search-inner" onSubmit={handleApplyForm}>
                {/* 1. Keyword Search Box */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title d-flex justify-content-between align-items-center">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Từ khóa &amp; Chipset
                    </h6>
                    <span className="badge bg-light text-muted small border">
                      {schema.directoryName}
                    </span>
                  </div>
                  <div className="form-group form-border mb-0">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={schema.searchPlaceholder}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </div>
                </div>

                {/* 2. Rating Filter (JReviews Weighted Score) */}
                <div className="prtsTypes mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Điểm đánh giá (JReviews)
                    </h6>
                  </div>
                  <div className="filterButton">
                    {RATING_FILTER_OPTIONS.map((opt) => {
                      const checked = currentMinRating === opt.value;
                      return (
                        <div className="filterFlex" key={opt.id}>
                          <input
                            type="radio"
                            className="btn-check"
                            name="ratingsfilter"
                            id={opt.id}
                            checked={checked}
                            onChange={() => handleRatingChange(opt.value)}
                          />
                          <label className="btn" htmlFor={opt.id}>
                            <BsStarFill className="me-1" />
                            {opt.label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Directory Categories Switcher (if multiple categories in Directory) */}
                {categories.length > 0 && (
                  <div className="filter-search-box mb-4">
                    <div className="filtersearch-title">
                      <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                        Danh mục thiết bị (Category)
                      </h6>
                    </div>
                    <div className="row align-items-center justify-content-between gy-2">
                      <div className="col-xl-12 col-lg-12 col-md-12">
                        <div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
                          {categories.map((cat) => {
                            const active = cat.slug === categorySlug;
                            return (
                              <div
                                className="form-checks flex-fill"
                                key={cat.id}
                              >
                                <input
                                  type="radio"
                                  className="btn-check"
                                  name="categorySwitcher"
                                  id={`cat-${cat.slug}`}
                                  checked={active}
                                  onChange={() => {
                                    startTransition(() => {
                                      if (
                                        cat.slug === 'smartphones' ||
                                        cat.slug === 'tablets' ||
                                        cat.slug === 'laptops' ||
                                        cat.slug === 'smartwatches' ||
                                        cat.slug === 'earbuds'
                                      ) {
                                        router.push(`/${cat.slug}`);
                                      } else {
                                        router.push(
                                          `/smartphones?category=${encodeURIComponent(cat.slug)}`
                                        );
                                      }
                                    });
                                  }}
                                />
                                <label
                                  className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                                  htmlFor={`cat-${cat.slug}`}
                                >
                                  {cat.name}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Brands Filter (Multi-select pills) */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Hãng sản xuất (Brand)
                    </h6>
                  </div>
                  <div className="row align-items-center justify-content-between gy-2">
                    <div className="col-xl-12 col-lg-12 col-md-12">
                      <div className="d-flex align-items-center justify-content-center mb-1 flex-wrap gap-2">
                        {schema.defaultBrands.map((brand) => {
                          const checked = currentBrands.some(
                            (b) => b.toLowerCase() === brand.toLowerCase()
                          );
                          const count = brandCountMap.get(brand.toLowerCase());
                          const inputId = `brand-${brand.toLowerCase().replace(/\s+/g, '-')}`;
                          return (
                            <div className="form-checks flex-fill" key={brand}>
                              <input
                                type="checkbox"
                                className="btn-check"
                                id={inputId}
                                checked={checked}
                                onChange={() =>
                                  toggleMultiString('brands', brand)
                                }
                              />
                              <label
                                className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                                htmlFor={inputId}
                              >
                                {brand}
                                {typeof count === 'number' && count > 0
                                  ? ` (${count})`
                                  : ''}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Price Range in Million VND (Presets + rc-slider RangeSlider) */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Khoảng giá (Triệu VNĐ)
                    </h6>
                  </div>
                  <div className="d-flex align-items-center justify-content-center mb-3 flex-wrap gap-2">
                    {schema.pricePresets.map((preset) => {
                      const active =
                        (preset.minVnd
                          ? Number(searchParams?.get('minPrice') || 0) ===
                            preset.minVnd
                          : !searchParams?.get('minPrice')) &&
                        (preset.maxVnd && preset.maxVnd < sliderMax * 1_000_000
                          ? Number(searchParams?.get('maxPrice') || 0) ===
                            preset.maxVnd
                          : !searchParams?.get('maxPrice') &&
                            Boolean(preset.minVnd));
                      return (
                        <div className="form-checks flex-fill" key={preset.id}>
                          <input
                            type="checkbox"
                            className="btn-check"
                            id={`price-${preset.id}`}
                            checked={active}
                            onChange={() =>
                              handlePricePresetClick(
                                preset.minVnd,
                                preset.maxVnd
                              )
                            }
                          />
                          <label
                            className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                            htmlFor={`price-${preset.id}`}
                          >
                            {preset.label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row align-items-center justify-content-between">
                    <div className="col-12">
                      <RangeSlider
                        min={sliderMin}
                        max={sliderMax}
                        step={schema.priceRangeMillion.step}
                        value={priceRange}
                        unitSuffix="tr ₫"
                        onChange={setPriceRange}
                        onChangeComplete={handlePriceSliderComplete}
                      />
                    </div>
                  </div>
                </div>

                {/* 6. Hardware: RAM Filter */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Dung lượng RAM (Hardware)
                    </h6>
                  </div>
                  <div className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                    {schema.ramOptionsGb.map((ram) => {
                      const checked = currentRams.includes(ram);
                      const id = `ram-${ram}gb`;
                      return (
                        <div className="form-checks flex-fill" key={id}>
                          <input
                            type="checkbox"
                            className="btn-check"
                            id={id}
                            checked={checked}
                            onChange={() => toggleMultiNumber('ram', ram)}
                          />
                          <label
                            className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                            htmlFor={id}
                          >
                            {ram}GB
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 7. Hardware: Storage (ROM) Filter */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Bộ nhớ trong (ROM)
                    </h6>
                  </div>
                  <div className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                    {schema.storageOptionsGb.map((rom) => {
                      const checked = currentStorages.includes(rom);
                      const id = `rom-${rom}gb`;
                      return (
                        <div className="form-checks flex-fill" key={id}>
                          <input
                            type="checkbox"
                            className="btn-check"
                            id={id}
                            checked={checked}
                            onChange={() => toggleMultiNumber('storage', rom)}
                          />
                          <label
                            className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                            htmlFor={id}
                          >
                            {formatStorageLabel(rom)}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 8. 10 Field Groups Feature Checkboxes (Display, Battery, Cellular, Connectivity) */}
                <div className="filter-search-box mb-4">
                  <div className="filtersearch-title">
                    <h6 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      Tính năng nổi bật (10 Field Groups)
                    </h6>
                  </div>
                  <div className="row align-items-center justify-content-between gy-2">
                    {schema.featureCheckboxes.map((feat) => {
                      const checked = searchParams?.get(feat.key) === '1';
                      const id = `feat-${feat.key}`;
                      return (
                        <div className="col-6" key={feat.key}>
                          <div className="form-check" title={feat.description}>
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={id}
                              checked={checked}
                              onChange={() => toggleFeatureCheckbox(feat.key)}
                            />
                            <label className="form-check-label" htmlFor={id}>
                              {feat.label}
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 9. Submit / Reset Actions */}
                <div className="form-group filter_button d-grid mb-0 gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary fw-medium full-width"
                    disabled={isPending}
                  >
                    {isPending ? 'Đang lọc dữ liệu...' : 'Áp dụng bộ lọc'}
                  </button>
                  {searchParams && searchParams.toString().length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="btn btn-light fw-medium full-width text-muted border"
                    >
                      Xóa tất cả bộ lọc
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Link
        href="#filterSlider"
        data-bs-toggle="offcanvas"
        data-bs-target="#filterSlider"
        aria-controls="filterSlider"
        className="fixed-bottom z-sticky d-lg-none filterButtons"
      >
        <BsFunnel className="me-1" />
        Bộ lọc thông số
      </Link>
    </>
  );
}
