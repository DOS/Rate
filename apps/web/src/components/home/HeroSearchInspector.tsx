'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
} from '@/lib/merchant-risk-tone';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import { Link, useRouter } from '@/lib/navigation';
import { startNavigationProgress } from '@/components/elementary/NavigationProgress';
import type { KeySpecs } from '@repo/shared-data';
import type { HeroProductSuggestion } from '@/lib/hero-products';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductHref,
  type UrlInspectionResult,
} from '@/lib/rate-domain';
import {
  toHeroMerchantSuggestions,
  type HeroMerchantSuggestion,
} from '@/lib/hero-merchants';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import { getRadarSignal } from '@/lib/deal-radar';
import {
  BsArrowRight,
  BsCheckCircleFill,
  BsCpu,
  BsDeviceSsd,
  BsExclamationTriangleFill,
  BsLightningChargeFill,
  BsLink45Deg,
  BsPhone,
  BsSearch,
  BsShieldCheck,
  BsShop,
  BsXLg,
} from 'react-icons/bs';
import ContentText from '@/components/elementary/ContentText';
import { firstImageUrl, productImageUrl } from '@/lib/rate-domain-core';
import {
  formatDecimal,
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';

interface HeroSearchInspectorProps {
  initialProducts: HeroProductSuggestion[];
  initialMerchants: HeroMerchantSuggestion[];
}

const SAMPLE_INSPECT_LINKS = [
  {
    label: 'iPhone 16 128GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-128GB-i.88201679.27110898667',
  },
  {
    label: 'iPhone 16 Plus 256GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-Plus-256GB-i.88201679.29410893286',
  },
  {
    label: 'iPhone 15 128GB (Shopee)',
    value:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-15-128GB-i.88201679.18093055535',
  },
  {
    label: 'Shop: Apple Flagship Store',
    value: 'https://shopee.vn/shop/88201679',
  },
];

const HERO_INSPECTOR_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function isLikelyEcommerceUrl(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const s = input.replace(HERO_INSPECTOR_CONTROL_CHARS_RE, '').trim();
  return (
    /^https?:\/\//i.test(s) ||
    /shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|i\.\d+\.\d+/i.test(s)
  );
}

export function sanitizeHeroInspectorPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function sanitizeHeroInspectorRating(
  userRatingWeighted: unknown,
  averageRating: unknown
): number {
  const w = Number(userRatingWeighted);
  if (Number.isFinite(w) && w > 0) {
    return Math.min(5, w);
  }
  const avg = Number(averageRating);
  if (Number.isFinite(avg) && avg > 0) {
    return Math.min(5, avg);
  }
  return 0;
}

export default function HeroSearchInspector({
  initialProducts,
  initialMerchants,
}: HeroSearchInspectorProps) {
  const router = useRouter();
  const t = useTranslations('heroSearch');
  const tVerdict = useTranslations('priceVerdict');
  const locale = useLocale();
  const radarIndex = useDealRadarIndex();
  const [mode, setMode] = useState<'search' | 'inspect'>('search');
  // Phones get a hint short enough to read whole: the long one needs about
  // 460px and the input has about 160px at 360 (DOS/Rate#1488). Wider
  // screens, and the server render, keep the long hint with its examples.
  const [narrowHint, setNarrowHint] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 575.98px)');
    const sync = () => setNarrowHint(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [inspectQuery, setInspectQuery] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] =
    useState<UrlInspectionResult | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialProducts.slice(0, 5);
    return initialProducts
      .filter((item) => {
        const keySpecs = (item.key_specs || {}) as KeySpecs;
        const haystacks = [
          item.name,
          item.brand,
          item.model,
          item.variant_name || '',
          item.model_key,
          keySpecs.chip || '',
          keySpecs.screen || '',
        ];
        return haystacks.some((h) => h && h.toLowerCase().includes(q));
      })
      .slice(0, 6);
  }, [query, initialProducts]);

  // Merchant suggestions come from the merchants API as the user types: the
  // page ships only the first few stores, not the whole directory (#452).
  const [merchantMatches, setMerchantMatches] = useState<{
    q: string;
    items: HeroMerchantSuggestion[];
  } | null>(null);
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (!trimmedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(
          `/api/v1/rate/merchants?q=${encodeURIComponent(trimmedQuery)}&limit=3`,
          { signal: controller.signal }
        );
        if (!resp.ok) return;
        const body = (await resp.json()) as {
          data?: HeroMerchantSuggestion[];
        };
        setMerchantMatches({
          q: trimmedQuery,
          items: toHeroMerchantSuggestions(body.data ?? []),
        });
      } catch {
        // Aborted or offline: keep the previous suggestions.
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);
  const filteredMerchants = useMemo(() => {
    if (!trimmedQuery) return initialMerchants.slice(0, 2);
    // Until the current query's answer arrives, keep the last list so the
    // dropdown does not flash empty on every keystroke.
    return merchantMatches?.items ?? [];
  }, [trimmedQuery, initialMerchants, merchantMatches]);

  const runUrlInspection = async (targetInput: string) => {
    const cleaned = targetInput.trim();
    if (!cleaned) return;
    setMode('inspect');
    setInspectQuery(cleaned);
    setIsInspecting(true);
    setInspectError(null);

    try {
      const resp = await fetch(
        `/api/v1/rate/lookup?q=${encodeURIComponent(cleaned)}`
      );
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || t('errLookupFailed'));
      }
      setInspectResult(json.data as UrlInspectionResult);
    } catch (err) {
      setInspectError(
        err instanceof Error ? err.message : t('errServerConnection')
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      startNavigationProgress('/smartphones');
      router.push('/smartphones');
      return;
    }
    // If user pasted a Shopee/Lazada URL directly into the search box, switch to URL Inspector automatically!
    if (isLikelyEcommerceUrl(trimmed)) {
      setIsDropdownOpen(false);
      void runUrlInspection(trimmed);
      return;
    }
    if (activeIndex >= 0 && activeIndex < filteredProducts.length) {
      const target = filteredProducts[activeIndex];
      if (target) {
        setIsDropdownOpen(false);
        startNavigationProgress(getMasterProductHref(target));
        router.push(getMasterProductHref(target));
        return;
      }
    }
    setIsDropdownOpen(false);
    startNavigationProgress(`/smartphones?q=${encodeURIComponent(trimmed)}`);
    router.push(`/smartphones?q=${encodeURIComponent(trimmed)}`);
  };

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runUrlInspection(inspectQuery);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredProducts.length - 1
      );
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="position-relative text-start">
      {/* Mode Switcher Pills */}
      <div className="d-flex justify-content-center mb-3 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`btn btn-sm rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2 ${
            mode === 'search'
              ? 'btn-primary shadow-sm'
              : 'btn-dark bg-opacity-75 text-light border-secondary'
          }`}
        >
          <BsSearch />
          {t('modeSearchBtn')}
        </button>
        <button
          type="button"
          onClick={() => setMode('inspect')}
          className={`btn btn-sm rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2 ${
            mode === 'inspect'
              ? 'btn-danger shadow-sm'
              : 'btn-dark bg-opacity-75 text-light border-secondary'
          }`}
        >
          <BsShieldCheck />
          {t('modeInspectBtn')}
        </button>
      </div>

      {/* Mode 1: Autocomplete Product & Spec Search */}
      {mode === 'search' ? (
        <div className="position-relative">
          <form
            onSubmit={handleSearchSubmit}
            className="search-wrap rounded-pill border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsSearch className="text-primary fs-5" />
              </div>
              <div className="col">
                <input
                  type="text"
                  value={query}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(-1);
                    setIsDropdownOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  className="form-control fw-medium rounded-pill border-0 ps-2 shadow-none"
                  placeholder={t(
                    narrowHint ? 'searchPlaceholderShort' : 'searchPlaceholder'
                  )}
                  aria-label={t('searchAriaLabel')}
                  autoComplete="off"
                />
              </div>
              {query && (
                <div className="col-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setActiveIndex(-1);
                    }}
                    className="btn btn-sm btn-light rounded-circle text-muted"
                    aria-label={t('clearKeywordAria')}
                  >
                    <BsXLg />
                  </button>
                </div>
              )}
              <div className="col-auto">
                <button
                  type="submit"
                  className="btn btn-primary rounded-pill fw-semibold px-4 py-2"
                >
                  {t('searchSubmitBtn')}
                </button>
              </div>
            </div>
          </form>

          {/* Autocomplete Dropdown Panel */}
          {isDropdownOpen && (
            <div
              className="card rounded-4 position-absolute start-0 end-0 mt-2 overflow-hidden border shadow-lg"
              style={{ zIndex: 1050 }}
            >
              <div className="card-body p-3">
                {isLikelyEcommerceUrl(query) && (
                  <div className="alert alert-danger d-flex align-items-center justify-content-between rounded-3 mb-3 px-3 py-2">
                    <div className="small">
                      <strong>{t('urlDetectedStrong')}</strong>{' '}
                      {t('urlDetectedSub')}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        void runUrlInspection(query);
                      }}
                      className="btn btn-sm btn-danger rounded-pill fw-semibold ms-2 flex-shrink-0"
                    >
                      {t('inspectLinkBtn')}
                    </button>
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-center mb-2 px-2">
                  <span
                    className="text-muted text-uppercase fw-bold"
                    style={{ fontSize: '0.8125rem' }}
                  >
                    {t('normalizedProductsHeader', {
                      count: filteredProducts.length,
                    })}
                  </span>
                  <Link
                    href="/smartphones"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-primary text-decoration-none small fw-semibold"
                  >
                    {t('specFilterLink')}
                  </Link>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-muted small px-2 py-3">
                    {t('noMatchPrefix', { query })}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        void runUrlInspection(query);
                      }}
                      className="btn btn-link btn-sm p-0 align-baseline"
                    >
                      {t('inspectTabLinkBtn')}
                    </button>
                    .
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {filteredProducts.map((item, idx) => {
                      const keySpecs = (item.key_specs || {}) as KeySpecs;
                      const thumb = productImageUrl(item);
                      const safeMinPrice = sanitizeHeroInspectorPriceVnd(
                        item.min_price
                      );
                      const minPrice = formatNumber(safeMinPrice, locale);
                      const rating = sanitizeHeroInspectorRating(
                        item.user_rating_weighted,
                        item.average_rating
                      );

                      return (
                        <div
                          key={item.id}
                          className={`list-group-item list-group-item-action rounded-3 d-flex align-items-center justify-content-between gap-2 border-0 px-2 py-2 ${
                            idx === activeIndex ? 'bg-primary-subtle' : ''
                          }`}
                        >
                          <Link
                            href={getMasterProductHref(item)}
                            onClick={() => setIsDropdownOpen(false)}
                            className="d-flex align-items-center text-decoration-none text-dark flex-grow-1 gap-3"
                          >
                            <div
                              className="rounded-3 bg-light d-flex align-items-center justify-content-center flex-shrink-0 border"
                              style={{ width: '48px', height: '48px' }}
                            >
                              {thumb ? (
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={thumb}
                                  alt={item.name}
                                  style={{
                                    maxWidth: '40px',
                                    maxHeight: '40px',
                                    objectFit: 'contain',
                                  }}
                                />
                              ) : (
                                <BsPhone
                                  aria-hidden="true"
                                  className="text-muted"
                                />
                              )}
                            </div>
                            <div>
                              <div className="fw-bold small text-dark">
                                {item.name}
                              </div>
                              <div
                                className="text-muted d-flex align-items-center flex-wrap gap-2"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                <span className="badge bg-light text-secondary border">
                                  {item.brand}
                                </span>
                                {keySpecs.chip && (
                                  <span>
                                    <BsCpu
                                      aria-hidden="true"
                                      className="me-1"
                                    />
                                    <ContentText
                                      text={keySpecs.chip}
                                      locale={locale}
                                    />
                                  </span>
                                )}
                                {item.storage_gb && (
                                  <span>
                                    <BsDeviceSsd
                                      aria-hidden="true"
                                      className="me-1"
                                    />
                                    {item.storage_gb}GB
                                  </span>
                                )}
                                {rating > 0 && (
                                  <span className="text-warning-emphasis fw-semibold">
                                    ★ {formatDecimal(rating, locale, 1)}
                                  </span>
                                )}
                                <RadarBadge
                                  signal={getRadarSignal(radarIndex, item.slug)}
                                />
                              </div>
                            </div>
                          </Link>

                          <div className="d-flex align-items-center flex-shrink-0 gap-2">
                            <div className="me-1 text-end">
                              <div className="fw-bold text-danger small">
                                {minPrice} ₫
                              </div>
                              <div
                                className="text-muted"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                {t('merchantsCount', {
                                  count: item.merchant_count || 0,
                                })}
                              </div>
                            </div>
                            <CompareQuickToggle
                              item={{
                                slug: item.slug,
                                name: item.name,
                                brand: item.brand,
                                thumbnail: thumb ?? null,
                                min_price: safeMinPrice,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredMerchants.length > 0 && (
                  <div className="border-top mt-2 pt-2">
                    <div className="d-flex justify-content-between align-items-center mb-1 px-2">
                      <span
                        className="text-muted text-uppercase fw-bold"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t('merchantsHeader', {
                          count: filteredMerchants.length,
                        })}
                      </span>
                      <Link
                        href="/merchants"
                        onClick={() => setIsDropdownOpen(false)}
                        className="text-primary text-decoration-none small"
                      >
                        {t('viewAllMerchantsLink')}
                      </Link>
                    </div>
                    {filteredMerchants.map((m) => (
                      <Link
                        key={m.id}
                        href={`/merchants/${m.id}`}
                        onClick={() => setIsDropdownOpen(false)}
                        className="d-flex align-items-center justify-content-between rounded-3 text-decoration-none text-dark hover-bg-light px-2 py-2"
                      >
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-danger text-uppercase small">
                            {m.platform}
                          </span>
                          <span className="fw-semibold small">
                            <ContentText text={m.name} locale={locale} />
                          </span>
                          {m.is_official && (
                            <span className="badge bg-success-subtle text-success small">
                              {t('officialMallBadge')}
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center small gap-2">
                          {m.trust_score == null ? (
                            <span className="badge bg-light text-muted border rounded-pill">
                              {t('trustBadgeNoData')}
                            </span>
                          ) : (
                            <span className="badge bg-success-subtle text-success rounded-pill">
                              {t('trustBadge', { score: m.trust_score })}
                            </span>
                          )}
                          <span
                            className="text-muted"
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {knownDosafeRiskScore(m) == null
                              ? t('scamRiskShortNoData')
                              : t('scamRiskShort', {
                                  score: knownDosafeRiskScore(m) ?? 0,
                                })}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Mode 2: URL / Link Inspector */
        <div>
          <form
            onSubmit={handleInspectSubmit}
            className="search-wrap rounded-pill border-danger border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsLink45Deg className="text-danger fs-4" />
              </div>
              <div className="col">
                <input
                  type="text"
                  value={inspectQuery}
                  onChange={(e) => setInspectQuery(e.target.value)}
                  className="form-control fw-medium rounded-pill border-0 ps-2 shadow-none"
                  placeholder={t('inspectPlaceholder')}
                  aria-label={t('inspectAriaLabel')}
                />
              </div>
              {inspectQuery && (
                <div className="col-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectQuery('');
                      setInspectResult(null);
                      setInspectError(null);
                    }}
                    className="btn btn-sm btn-light rounded-circle text-muted"
                    aria-label={t('clearUrlAria')}
                  >
                    <BsXLg />
                  </button>
                </div>
              )}
              <div className="col-auto">
                <button
                  type="submit"
                  disabled={isInspecting}
                  className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                >
                  {isInspecting ? t('inspectingBtn') : t('inspectNowBtn')}
                </button>
              </div>
            </div>
          </form>

          {/* Sample One-Click Inspection Pills */}
          <div className="d-flex align-items-center justify-content-center mt-2 flex-wrap gap-2">
            <span className="text-light small opacity-75">
              {t('sampleLinksLabel')}
            </span>
            {SAMPLE_INSPECT_LINKS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => void runUrlInspection(sample.value)}
                className="badge bg-dark bg-opacity-75 text-light border-light border-opacity-25 rounded-pill fw-normal border px-3 py-2"
                style={{ cursor: 'pointer' }}
              >
                <BsLightningChargeFill className="text-warning me-1" />
                {sample.label}
              </button>
            ))}
          </div>

          {inspectError && (
            <div className="alert alert-danger rounded-4 mt-3 mb-0">
              {inspectError}
            </div>
          )}

          {/* Instant URL Inspection Result Card */}
          {inspectResult && (
            <div className="card rounded-4 text-dark mt-3 overflow-hidden border-0 shadow-lg">
              <div className="card-header bg-dark d-flex justify-content-between align-items-center flex-wrap gap-2 px-4 py-3 text-white">
                <div className="d-flex align-items-center gap-2">
                  <BsShieldCheck className="text-success fs-5" />
                  <span className="fw-bold">{t('resultCardHeader')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectResult(null)}
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  {t('closeBtn')}
                </button>
              </div>

              <div className="card-body p-4">
                {inspectResult.masterProduct ? (
                  <div className="row g-4 align-items-center">
                    <div className="col-lg-7">
                      <div className="d-flex align-items-start gap-3">
                        {firstImageUrl(inspectResult.masterProduct.images) && (
                          <img
                            src={
                              firstImageUrl(
                                inspectResult.masterProduct.images
                              ) ?? undefined
                            }
                            alt={inspectResult.masterProduct.name}
                            className="rounded-3 bg-light flex-shrink-0 border p-2"
                            style={{
                              width: '84px',
                              height: '84px',
                              objectFit: 'contain',
                            }}
                          />
                        )}
                        <div>
                          <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                            <span className="badge bg-primary-subtle text-primary rounded-pill">
                              {inspectResult.masterProduct.brand}
                            </span>
                            {inspectResult.parsedUrl.platform && (
                              <span className="badge bg-danger text-uppercase rounded-pill">
                                {inspectResult.parsedUrl.platform}
                              </span>
                            )}
                            {inspectResult.discountAnalysis && (
                              <span
                                className={`badge rounded-pill ${
                                  inspectResult.discountAnalysis.verdict ===
                                  'fake_discount'
                                    ? 'bg-danger text-white'
                                    : inspectResult.discountAnalysis.verdict ===
                                        'genuine_deal'
                                      ? 'bg-success text-white'
                                      : 'bg-secondary-subtle text-secondary'
                                }`}
                              >
                                {
                                  discountVerdictCopy(
                                    tVerdict,
                                    inspectResult.discountAnalysis,
                                    locale
                                  ).label
                                }
                              </span>
                            )}
                            <RadarBadge
                              signal={
                                inspectResult.radarSignal ??
                                getRadarSignal(
                                  radarIndex,
                                  inspectResult.masterProduct.slug
                                )
                              }
                            />
                          </div>

                          <h2 className="h5 fw-bold mb-1">
                            <Link
                              href={getMasterProductHref(
                                inspectResult.masterProduct
                              )}
                              className="text-dark text-decoration-none"
                            >
                              {inspectResult.masterProduct.name}
                            </Link>
                          </h2>

                          <div className="text-danger fw-bold fs-5 mb-1">
                            {t('bestPriceLabel')}{' '}
                            {formatPriceVnd(
                              Number(inspectResult.masterProduct.min_price),
                              locale
                            )}
                            {inspectResult.priceHistory?.lowestEverPrice && (
                              <span className="text-success small fw-semibold ms-2">
                                {t('lowestEverPriceLabel', {
                                  price: formatNumber(
                                    inspectResult.priceHistory.lowestEverPrice,
                                    locale
                                  ),
                                })}
                              </span>
                            )}
                          </div>

                          {inspectResult.discountAnalysis && (
                            <p className="text-muted small mb-0">
                              {
                                discountVerdictCopy(
                                  tVerdict,
                                  inspectResult.discountAnalysis,
                                  locale
                                ).explanation
                              }
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-5">
                      <div className="rounded-4 bg-light border p-3">
                        {inspectResult.merchantProfile && (
                          <div className="d-flex justify-content-between align-items-center border-bottom mb-2 pb-2">
                            <div className="small">
                              <span className="text-muted">
                                {t('merchantLabel')}{' '}
                              </span>
                              <Link
                                href={`/merchants/${inspectResult.merchantProfile.id}`}
                                className="fw-bold text-dark text-decoration-none"
                              >
                                <ContentText
                                  text={inspectResult.merchantProfile.name}
                                  locale={locale}
                                />
                              </Link>
                              {inspectResult.merchantProfile.is_official && (
                                <BsCheckCircleFill className="text-success ms-1" />
                              )}
                            </div>
                            {inspectResult.merchantProfile.trust_score ==
                            null ? (
                              <span className="badge bg-light text-muted border rounded-pill">
                                {t('trustBadgeNoData')}
                              </span>
                            ) : (
                              <span className="badge bg-success rounded-pill text-white">
                                {t('trustBadge', {
                                  score:
                                    inspectResult.merchantProfile.trust_score,
                                })}
                              </span>
                            )}
                          </div>
                        )}

                        {inspectResult.reviewSummary && (
                          <div className="d-flex justify-content-between align-items-center small mb-3">
                            <span className="text-muted">
                              {t('aiReviewAuthLabel')}
                            </span>
                            <span className="fw-bold text-success">
                              {t('aiReviewAuthValue', {
                                pct: formatPlainNumber(
                                  inspectResult.reviewSummary.authentic_pct,
                                  locale
                                ),
                                total:
                                  inspectResult.reviewSummary.total_analyzed,
                              })}
                            </span>
                          </div>
                        )}

                        <div className="d-flex flex-wrap gap-2">
                          <Link
                            href={getMasterProductHref(
                              inspectResult.masterProduct
                            )}
                            className="btn btn-primary btn-sm rounded-pill fw-semibold flex-grow-1 px-3"
                          >
                            {t('viewSpecsAndHistoryBtn')}{' '}
                            <BsArrowRight className="ms-1" />
                          </Link>
                          <Link
                            href={`/inspect?q=${encodeURIComponent(inspectQuery)}`}
                            className="btn btn-outline-danger btn-sm rounded-pill fw-medium px-3"
                          >
                            {t('auditReportBtn')}
                          </Link>
                          {inspectResult.merchantProfile && (
                            <Link
                              href={`/merchants/${inspectResult.merchantProfile.id}`}
                              className="btn btn-outline-dark btn-sm rounded-pill px-3"
                            >
                              {t('shopProfileBtn')}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : inspectResult.merchantProfile ? (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <div className="d-flex align-items-center mb-1 gap-2">
                        <span className="badge bg-danger text-uppercase">
                          {inspectResult.merchantProfile.platform}
                        </span>
                        {inspectResult.merchantProfile.is_official && (
                          <span className="badge bg-success-subtle text-success">
                            {t('officialMallBadge')}
                          </span>
                        )}
                        {inspectResult.merchantProfile.trust_score == null ? (
                          <span className="badge bg-light text-muted border rounded-pill">
                            {t('trustBadgeNoData')}
                          </span>
                        ) : (
                          <span className="badge bg-success rounded-pill text-white">
                            {t('trustBadge', {
                              score: inspectResult.merchantProfile.trust_score,
                            })}
                          </span>
                        )}
                      </div>
                      <h2 className="h5 fw-bold mb-1">
                        <BsShop className="text-primary me-2" />
                        <ContentText
                          text={inspectResult.merchantProfile.name}
                          locale={locale}
                        />
                      </h2>
                      <div className="text-muted small">
                        {/* No analysed reviews: no review risk number
                            (DOS/Rate#1258). */}
                        {/* No DOSafe score: no number either (DOS/Rate#1465). */}
                        {(() => {
                          const profile = inspectResult.merchantProfile;
                          const scam = knownDosafeRiskScore(profile);
                          const b = (chunks: React.ReactNode) => (
                            <strong>{chunks}</strong>
                          );
                          if (
                            hasReviewRiskEvidence(profile.review_risk_breakdown)
                          ) {
                            return scam == null
                              ? t.rich('merchantRiskLineNoScam', {
                                  review: profile.review_risk_score,
                                  b,
                                })
                              : t.rich('merchantRiskLine', {
                                  scam,
                                  review: profile.review_risk_score,
                                  b,
                                });
                          }
                          return scam == null
                            ? t.rich('merchantRiskLineNoData', { b })
                            : t.rich('merchantRiskLineNoReviews', { scam, b });
                        })()}{' '}
                        •{' '}
                        <strong>
                          {t('trackingProductsCount', {
                            count: inspectResult.merchantProfile.product_count,
                          })}
                        </strong>
                      </div>
                    </div>
                    <Link
                      href={`/merchants/${inspectResult.merchantProfile.id}`}
                      className="btn btn-primary rounded-pill fw-semibold px-4"
                    >
                      {t('openMerchantProfileBtn')}
                    </Link>
                  </div>
                ) : (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <h5 className="fw-bold d-flex align-items-center mb-1 gap-2">
                        <BsExclamationTriangleFill className="text-warning" />
                        {t('unmatchedHeading')}
                      </h5>
                      <p className="text-muted small mb-0">
                        {t('unmatchedDesc')}
                      </p>
                    </div>
                    <Link
                      href={`/smartphones?q=${encodeURIComponent(inspectResult.query)}`}
                      className="btn btn-outline-primary rounded-pill fw-semibold px-4"
                    >
                      {t('searchInSmartphonesBtn')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
