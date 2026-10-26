'use client';
import React, { useEffect, useId, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { BsFunnel, BsStarFill } from 'react-icons/bs';
import { Link, usePathname, useRouter } from '@/lib/navigation';
import { startNavigationProgress } from '@/components/elementary/NavigationProgress';
import RangeSlider from './range-slider';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
  RATING_FILTER_OPTIONS,
} from '@/lib/category-filters';
import {
  isCanonicalCategorySlug,
  type RateCategoryItem,
} from '@/lib/rate-domain';

export interface ListSidebarOneProps {
  categorySlug?: string;
  categories?: RateCategoryItem[];
  brandFacets?: { name: string; count: number }[];
}

export function sanitizeSidebarRating(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number(Math.min(5, num).toFixed(1));
}

export function sanitizeSidebarPositiveInts(
  csvOrValue: unknown,
  maxItemValue = 65_536
): number[] {
  if (typeof csvOrValue !== 'string' || !csvOrValue.trim()) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of csvOrValue.split(',')) {
    const cleaned = part.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned) continue;
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num <= 0) continue;
    const rounded = Math.round(num);
    if (rounded <= 0 || rounded > maxItemValue || seen.has(rounded)) continue;
    seen.add(rounded);
    out.push(rounded);
    if (out.length >= 20) break;
  }
  return out;
}

export function sanitizeSidebarBrands(csvOrValue: unknown): string[] {
  if (typeof csvOrValue !== 'string' || !csvOrValue.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of csvOrValue.split(',')) {
    const cleaned = part
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .slice(0, 64);
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(cleaned);
    if (out.length >= 25) break;
  }
  return out;
}

export function sanitizeSidebarPriceMillion(
  rawPriceVnd: unknown,
  sliderMin: number,
  sliderMax: number,
  fallbackMillion: number
): number {
  const safeMin = Number.isFinite(sliderMin) && sliderMin >= 0 ? sliderMin : 0;
  const safeMax =
    Number.isFinite(sliderMax) && sliderMax >= safeMin ? sliderMax : safeMin;
  const safeFallback = Math.min(
    safeMax,
    Math.max(
      safeMin,
      Number.isFinite(fallbackMillion) ? fallbackMillion : safeMin
    )
  );
  if (rawPriceVnd === null || rawPriceVnd === undefined || rawPriceVnd === '') {
    return safeFallback;
  }
  const num =
    typeof rawPriceVnd === 'number' ? rawPriceVnd : Number(rawPriceVnd);
  if (!Number.isFinite(num) || num <= 0) return safeFallback;
  const million = Math.round(num / 1_000_000);
  if (!Number.isFinite(million) || million <= 0) return safeFallback;
  return Math.min(safeMax, Math.max(safeMin, million));
}

export function sanitizeSidebarKeyword(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
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
  const t = useTranslations('catalog');
  const tNav = useTranslations('rate.nav');
  const locale = useLocale();
  // Category names come from the database in Vietnamese; other locales use
  // the navbar labels for the canonical categories (DOS/Rate#646).
  const categoryLabel = (cat: RateCategoryItem) =>
    locale !== 'vi' && isCanonicalCategorySlug(cat.slug)
      ? tNav(cat.slug)
      : cat.name;

  const baseSchema = getCategoryFilterSchema(
    categorySlug,
    brandFacets.map((b) => b.name)
  );
  const schema = localizeCategoryFilterSchema(baseSchema, t);
  const brandCountMap = new Map(
    brandFacets.map((b) => [b.name.toLowerCase(), b.count])
  );

  // Parse active filter state from URL query params
  const currentQ = sanitizeSidebarKeyword(searchParams?.get('q'));
  const currentMinRating = sanitizeSidebarRating(searchParams?.get('rating'));
  const currentBrands = sanitizeSidebarBrands(searchParams?.get('brands'));
  const currentRams = sanitizeSidebarPositiveInts(
    searchParams?.get('ram'),
    1024
  );
  const currentStorages = sanitizeSidebarPositiveInts(
    searchParams?.get('storage'),
    16_384
  );

  const sliderMin = schema.priceRangeMillion.min;
  const sliderMax = schema.priceRangeMillion.max;
  const rawMinMillion = sanitizeSidebarPriceMillion(
    searchParams?.get('minPrice'),
    sliderMin,
    sliderMax,
    sliderMin
  );
  const rawMaxMillion = sanitizeSidebarPriceMillion(
    searchParams?.get('maxPrice'),
    sliderMin,
    sliderMax,
    sliderMax
  );
  const urlMinMillion = Math.min(rawMinMillion, rawMaxMillion);
  const urlMaxMillion = Math.max(rawMinMillion, rawMaxMillion);

  const [keyword, setKeyword] = useState(currentQ);
  const keywordHeaderId = useId();
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
    // A changed filter starts again from the first catalogue page (#466).
    nextParams.delete('page');
    updater(nextParams);
    const qs = nextParams.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const toggleMultiString = (paramKey: string, val: string) => {
    const cleanVal = val
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .slice(0, 64);
    if (!cleanVal) return;
    updateUrlParams((params) => {
      const existing = sanitizeSidebarBrands(params.get(paramKey));
      const lower = cleanVal.toLowerCase();
      const has = existing.some((x) => x.toLowerCase() === lower);
      const next = has
        ? existing.filter((x) => x.toLowerCase() !== lower)
        : [...existing, cleanVal];
      if (next.length > 0) {
        params.set(paramKey, next.join(','));
      } else {
        params.delete(paramKey);
      }
    });
  };

  const toggleMultiNumber = (paramKey: string, val: number) => {
    if (!Number.isFinite(val) || val <= 0) return;
    const cleanVal = Math.round(val);
    updateUrlParams((params) => {
      const existing = sanitizeSidebarPositiveInts(params.get(paramKey));
      const has = existing.includes(cleanVal);
      const next = has
        ? existing.filter((x) => x !== cleanVal)
        : [...existing, cleanVal];
      if (next.length > 0) {
        params.set(paramKey, next.join(','));
      } else {
        params.delete(paramKey);
      }
    });
  };

  const handleRatingChange = (ratingVal: number) => {
    const safeRating = sanitizeSidebarRating(ratingVal);
    updateUrlParams((params) => {
      if (safeRating > 0) {
        params.set('rating', String(safeRating));
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
      const cleanQ = sanitizeSidebarKeyword(keyword);
      if (cleanQ) {
        params.set('q', cleanQ);
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
            <h2 className="h5 mb-0">{t('sidebar.filterTitle')}</h2>
            <button
              type="button"
              className="btn-close d-lg-none text-sm"
              data-bs-dismiss="offcanvas"
              data-bs-target="#filterSlider"
              aria-label={t('sidebar.closeAria')}
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
                    <h3
                      id={keywordHeaderId}
                      className="lh-base text-uppercase fw-medium mb-2 text-sm"
                    >
                      {t('sidebar.keywordChipsetHeader')}
                    </h3>
                    <span className="badge bg-light text-muted small border">
                      {schema.directoryName}
                    </span>
                  </div>
                  <div className="form-group form-border mb-0">
                    {/* Named by the heading above, not only by the
                        placeholder (DOS/Rate#1077). */}
                    <input
                      type="text"
                      className="form-control"
                      aria-labelledby={keywordHeaderId}
                      placeholder={schema.searchPlaceholder}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </div>
                </div>

                {/* 2. Rating Filter (JReviews Weighted Score) */}
                <div className="prtsTypes mb-4">
                  <div className="filtersearch-title">
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.jreviewsRatingHeader')}
                    </h3>
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
                            {opt.value === 0
                              ? t('sidebar.ratingAll')
                              : opt.label}
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
                      <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                        {t('sidebar.categoryHeader')}
                      </h3>
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
                                    const href =
                                      cat.slug === 'smartphones' ||
                                      cat.slug === 'tablets' ||
                                      cat.slug === 'laptops' ||
                                      cat.slug === 'smartwatches' ||
                                      cat.slug === 'earbuds'
                                        ? `/${cat.slug}`
                                        : `/smartphones?category=${encodeURIComponent(cat.slug)}`;
                                    // Outside the transition: inside it the bar's
                                    // update would wait for the navigation and never show.
                                    startNavigationProgress(href);
                                    startTransition(() => {
                                      router.push(href);
                                    });
                                  }}
                                />
                                <label
                                  className="btn btn-sm btn-secondary rounded-1 fw-medium full-width"
                                  htmlFor={`cat-${cat.slug}`}
                                >
                                  {categoryLabel(cat)}
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
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.brandHeader')}
                    </h3>
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
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.priceRangeHeader')}
                    </h3>
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
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.ramHeader')}
                    </h3>
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
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.storageHeader')}
                    </h3>
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
                    <h3 className="lh-base text-uppercase fw-medium mb-2 text-sm">
                      {t('sidebar.featuresHeader')}
                    </h3>
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
                    {isPending
                      ? t('sidebar.filteringBtn')
                      : t('sidebar.applyFiltersBtn')}
                  </button>
                  {searchParams && searchParams.toString().length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="btn btn-light fw-medium full-width text-muted border"
                    >
                      {t('sidebar.clearAllFiltersBtn')}
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
        {t('sidebar.filterTitle')}
      </Link>
    </>
  );
}
