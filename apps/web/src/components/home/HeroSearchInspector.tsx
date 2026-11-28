'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  merchantRiskTone,
  type MerchantRiskTone,
} from '@/lib/merchant-risk-tone';
import { discountVerdictCopy } from '@/lib/discount-verdict-copy';
import { Link, useRouter } from '@/lib/navigation';
import { startNavigationProgress } from '@/components/elementary/NavigationProgress';
import type { KeySpecs } from '@repo/shared-data';
import {
  IMPLAUSIBLY_LOW_RATIO,
  MINIMUM_DEVICE_PRICE_FLOOR_VND,
  MINIMUM_EARBUDS_PRICE_FLOOR_VND,
  implausiblyLowOfferIds,
  isImplausiblyLowPrice,
  isOfferImplausiblyLowAgainstInStock,
  minimumListingPriceVnd,
  normalizeOfferId,
  plausibleMinPrice,
  plausibleOffers,
} from '@repo/shared-data/rules';
import type { HeroProductSuggestion } from '@/lib/hero-products';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from '@/lib/product-market-stats';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveListingPriceCurrency,
  type OfferDiscountAnalysis,
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
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
} from '@/lib/locale-format';
import StarRating from '@/components/elementary/StarRating';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface HeroSearchInspectorProps {
  initialProducts: HeroProductSuggestion[];
  initialMerchants: HeroMerchantSuggestion[];
  initialMode?: 'search' | 'inspect';
  initialDropdownOpen?: boolean;
  initialInspectResult?: UrlInspectionResult | null;
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
    /(?:^|\/\/|\.)(?:shopee\.vn|lazada\.vn|tiki\.vn|tiktok\.com|cellphones\.com\.vn|thegioididong\.com|dienmayxanh\.com|topzone\.vn|fptshop\.com\.vn|hoanghamobile\.com|didongviet\.vn|phongvu\.vn|gearvn\.com|nguyenkim\.com|shopdunk\.com|hacom\.vn|clickbuy\.com\.vn|viettelstore\.vn|pico\.vn|mediamart\.vn|memoryzone\.com\.vn|anphatpc\.com\.vn)\/|i\.\d+\.\d+/i.test(
      s
    )
  );
}

function toOptionalFiniteScore(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(HERO_INSPECTOR_CONTROL_CHARS_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function sanitizeHeroInspectorPriceVnd(value: unknown): number {
  const num = toOptionalFiniteScore(value);
  if (num == null || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function formatHeroInspectorPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  const safePrice = sanitizeHeroInspectorPriceVnd(value);
  return safePrice > 0 ? formatPriceVnd(safePrice, locale) : '-';
}

export function resolveHeroMerchantTrustBadge(
  merchant:
    | {
        trust_score?: number | string | null;
        risk_score?: number | string | null;
      }
    | null
    | undefined
): {
  score: number;
  tone: MerchantRiskTone;
  variant: NonNullable<BadgeProps['variant']>;
} | null {
  const rawTrust = toOptionalFiniteScore(merchant?.trust_score);
  if (rawTrust == null) return null;
  const clampedTrust = Math.min(100, Math.max(0, rawTrust));
  const rawRisk = toOptionalFiniteScore(merchant?.risk_score);
  const riskScore =
    rawRisk == null ? null : Math.min(100, Math.max(0, rawRisk));
  const tone = merchantRiskTone(riskScore ?? 100 - clampedTrust);
  const variant: NonNullable<BadgeProps['variant']> =
    tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'danger';
  return {
    score: Math.round(clampedTrust),
    tone,
    variant,
  };
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

export function resolveHeroReviewAuthenticityDisplay(
  reviewSummary:
    | {
        authentic_pct?: number | string | null;
        total_analyzed?: number | string | null;
      }
    | null
    | undefined,
  locale: string,
  copy: {
    formatAuthentic: (values: { pct: string; total: number }) => string;
    emptyLabel: string;
  }
): {
  hasAnalyzedReviews: boolean;
  text: string;
  className: string;
} | null {
  if (!reviewSummary) return null;
  const rawTotal = toOptionalFiniteScore(reviewSummary.total_analyzed);
  const total = rawTotal != null && rawTotal > 0 ? Math.floor(rawTotal) : 0;
  if (total <= 0) {
    return {
      hasAnalyzedReviews: false,
      text: copy.emptyLabel,
      className: 'text-muted',
    };
  }
  const rawPct = toOptionalFiniteScore(reviewSummary.authentic_pct);
  const safePct = rawPct != null ? Math.min(100, Math.max(0, rawPct)) : 0;
  return {
    hasAnalyzedReviews: true,
    text: copy.formatAuthentic({
      pct: formatPlainNumber(safePct, locale),
      total,
    }),
    className: 'fw-bold text-success',
  };
}

export function buildHeroCompareItem(
  item: HeroProductSuggestion,
  thumb?: string | null
) {
  const resolvedThumb = thumb === undefined ? productImageUrl(item) : thumb;
  const categorySlug = getMasterProductCategorySlug(item);
  return {
    slug: item.slug,
    name: item.name,
    brand: item.brand,
    thumbnail: resolvedThumb ?? null,
    min_price: sanitizeHeroInspectorPriceVnd(item.min_price),
    categorySlug,
    categoryPath: `/${categorySlug}`,
  };
}

function resolveHeroListingPriceFloorVnd(params: {
  masterProduct?: {
    name?: string | null;
    slug?: string | null;
    category_id?: string | null;
    metadata?: Record<string, unknown> | null;
    specifications?: Record<string, unknown> | null;
  } | null;
  offerTitle?: string | null;
  offerUrl?: string | null;
}): number {
  const { masterProduct, offerTitle, offerUrl } = params;
  if (!masterProduct) {
    return MINIMUM_EARBUDS_PRICE_FLOOR_VND;
  }
  const categorySlug = getMasterProductCategorySlug(
    masterProduct as Parameters<typeof getMasterProductCategorySlug>[0]
  );
  if (categorySlug === 'earbuds') {
    return MINIMUM_EARBUDS_PRICE_FLOOR_VND;
  }
  const texts = [
    masterProduct.name ?? '',
    masterProduct.slug ?? '',
    offerTitle ?? '',
    offerUrl ?? '',
  ].filter(Boolean);
  return texts.length > 0
    ? minimumListingPriceVnd(texts, {
        categorySlug,
        currency: resolveListingPriceCurrency({
          categorySlug,
          metadata: masterProduct.metadata,
        }),
      })
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;
}

export function resolveHeroInspectBestPriceVnd(
  inspectResult:
    | {
        masterProduct?: {
          min_price?: unknown;
          name?: string | null;
          slug?: string | null;
          category_id?: string | null;
          metadata?: Record<string, unknown> | null;
          specifications?: Record<string, unknown> | null;
        } | null;
        allOffers?:
          | readonly {
              id: string;
              price_current: number;
              availability?: OfferAvailability | null;
              implausiblyLow?: boolean | null;
              title?: string | null;
              url?: string | null;
            }[]
          | null;
      }
    | null
    | undefined
): number {
  const minFloor = resolveHeroListingPriceFloorVnd({
    masterProduct: inspectResult?.masterProduct,
  });
  const rawMasterMin = sanitizeHeroInspectorPriceVnd(
    inspectResult?.masterProduct?.min_price
  );
  const safeOffers = Array.isArray(inspectResult?.allOffers)
    ? inspectResult.allOffers
    : [];
  if (safeOffers.length === 0) {
    return rawMasterMin >= minFloor ? rawMasterMin : 0;
  }
  const pricedInStockOffers = safeOffers.filter((o) => {
    if (isOfferUnavailable(o) || o.implausiblyLow === true) return false;
    const price = sanitizeHeroInspectorPriceVnd(o.price_current);
    return price >= minFloor;
  });
  if (pricedInStockOffers.length === 0) {
    return 0;
  }
  return plausibleMinPrice(0, pricedInStockOffers);
}

export function resolveHeroInspectDiscountAnalysis(
  inspectResult:
    | {
        masterProduct?: {
          min_price?: unknown;
          name?: string | null;
          slug?: string | null;
          category_id?: string | null;
          metadata?: Record<string, unknown> | null;
          specifications?: Record<string, unknown> | null;
        } | null;
        matchedOffer?: {
          id?: string | null;
          price_current?: unknown;
          availability?: OfferAvailability | null;
          implausiblyLow?: boolean | null;
          title?: string | null;
          url?: string | null;
        } | null;
        allOffers?:
          | readonly {
              id: string;
              price_current: number;
              availability?: OfferAvailability | null;
              implausiblyLow?: boolean | null;
              title?: string | null;
              url?: string | null;
            }[]
          | null;
        discountAnalysis?: OfferDiscountAnalysis | null;
      }
    | null
    | undefined
): OfferDiscountAnalysis | null {
  const analysis = inspectResult?.discountAnalysis ?? null;
  if (!analysis) return null;

  const matchedOffer = inspectResult?.matchedOffer ?? null;
  const minFloor = resolveHeroListingPriceFloorVnd({
    masterProduct: inspectResult?.masterProduct,
    offerTitle: matchedOffer?.title,
    offerUrl: matchedOffer?.url,
  });
  const safeAnalysisPrice = sanitizeHeroInspectorPriceVnd(
    analysis.price_current
  );
  if (safeAnalysisPrice < minFloor) {
    return null;
  }

  const safeOffers = Array.isArray(inspectResult?.allOffers)
    ? inspectResult.allOffers
    : [];
  const inStockOffers = safeOffers.filter((o) => !isOfferUnavailable(o));
  const plausibilityOffers =
    inStockOffers.length > 0 ? inStockOffers : safeOffers;
  const implausibleOfferIds = implausiblyLowOfferIds(plausibilityOffers);

  const safeBestPrice = resolveHeroInspectBestPriceVnd(inspectResult);
  if (
    safeBestPrice >= MINIMUM_EARBUDS_PRICE_FLOOR_VND &&
    safeAnalysisPrice < safeBestPrice * IMPLAUSIBLY_LOW_RATIO
  ) {
    return null;
  }
  if (
    isOfferImplausiblyLowAgainstInStock(
      {
        id: typeof analysis.product_id === 'string' ? analysis.product_id : '',
        price_current: safeAnalysisPrice,
      },
      plausibilityOffers,
      implausibleOfferIds
    )
  ) {
    return null;
  }

  if (!matchedOffer) {
    const pricedPlausibleInStock = plausibleOffers(inStockOffers).filter(
      (o) =>
        o.implausiblyLow !== true &&
        sanitizeHeroInspectorPriceVnd(o.price_current) >= minFloor
    );
    if (safeOffers.length > 0 && pricedPlausibleInStock.length === 0) {
      return null;
    }
    const analysisCanonicalId = normalizeOfferId(analysis.product_id);
    const linkedOffer = safeOffers.find(
      (o) =>
        o.id === analysis.product_id ||
        (analysisCanonicalId !== '' &&
          normalizeOfferId(o.id) === analysisCanonicalId)
    );
    if (
      linkedOffer &&
      (isOfferUnavailable(linkedOffer) ||
        linkedOffer.implausiblyLow === true ||
        sanitizeHeroInspectorPriceVnd(linkedOffer.price_current) < minFloor ||
        isOfferImplausiblyLowAgainstInStock(
          linkedOffer,
          plausibilityOffers,
          implausibleOfferIds
        ))
    ) {
      return null;
    }
    return analysis;
  }

  if (isOfferUnavailable(matchedOffer)) {
    return null;
  }
  const safeOfferPrice = sanitizeHeroInspectorPriceVnd(
    matchedOffer.price_current
  );
  if (safeOfferPrice < minFloor) {
    return null;
  }
  if (matchedOffer.implausiblyLow === true) {
    return null;
  }
  if (
    safeBestPrice >= MINIMUM_EARBUDS_PRICE_FLOOR_VND &&
    safeOfferPrice < safeBestPrice * IMPLAUSIBLY_LOW_RATIO
  ) {
    return null;
  }

  const candidate =
    typeof matchedOffer.price_current === 'number'
      ? (matchedOffer as {
          id?: string | null;
          price_current: number;
          availability?: string | null;
        })
      : {
          id: typeof matchedOffer.id === 'string' ? matchedOffer.id : '',
          price_current: safeOfferPrice,
          availability: matchedOffer.availability ?? null,
        };
  if (
    isOfferImplausiblyLowAgainstInStock(
      candidate,
      plausibilityOffers,
      implausibleOfferIds
    )
  ) {
    return null;
  }

  const matchedCanonicalId = normalizeOfferId(matchedOffer.id);
  const peerReferenceOffers = plausibleOffers(
    plausibilityOffers.filter((o) => {
      if (o === matchedOffer) return false;
      if (
        (o.id === matchedOffer.id ||
          (matchedCanonicalId !== '' &&
            normalizeOfferId(o.id) === matchedCanonicalId)) &&
        sanitizeHeroInspectorPriceVnd(o.price_current) === safeOfferPrice
      ) {
        return false;
      }
      return true;
    })
  );
  if (isImplausiblyLowPrice(safeOfferPrice, peerReferenceOffers)) {
    return null;
  }

  return analysis;
}

export default function HeroSearchInspector({
  initialProducts,
  initialMerchants,
  initialMode = 'search',
  initialDropdownOpen = false,
  initialInspectResult = null,
}: HeroSearchInspectorProps) {
  const router = useRouter();
  const t = useTranslations('heroSearch');
  const tVerdict = useTranslations('priceVerdict');
  const tStarRating = useTranslations('starRating');
  const locale = useLocale();
  const radarIndex = useDealRadarIndex();
  const [mode, setMode] = useState<'search' | 'inspect'>(initialMode);
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(initialDropdownOpen);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [inspectQuery, setInspectQuery] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] =
    useState<UrlInspectionResult | null>(initialInspectResult);
  const heroDiscountAnalysis =
    resolveHeroInspectDiscountAnalysis(inspectResult);

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
      {/* Mode Switcher */}
      <div className="d-flex justify-content-center mb-3 flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === 'search' ? 'primary' : 'outline'}
          size="sm"
          wrap
          aria-pressed={mode === 'search'}
          onClick={() => setMode('search')}
        >
          <BsSearch aria-hidden="true" />
          {t('modeSearchBtn')}
        </Button>
        <Button
          type="button"
          variant={mode === 'inspect' ? 'primary' : 'outline'}
          size="sm"
          wrap
          aria-pressed={mode === 'inspect'}
          onClick={() => setMode('inspect')}
        >
          <BsShieldCheck aria-hidden="true" />
          {t('modeInspectBtn')}
        </Button>
      </div>

      {/* Mode 1: Autocomplete Product & Spec Search */}
      {mode === 'search' ? (
        <div className="position-relative">
          <form
            onSubmit={handleSearchSubmit}
            className="search-wrap border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsSearch aria-hidden="true" className="text-primary fs-5" />
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
                  className="form-control fw-medium rounded-3 border-0 ps-2 shadow-none"
                  placeholder={t(
                    narrowHint ? 'searchPlaceholderShort' : 'searchPlaceholder'
                  )}
                  aria-label={t('searchAriaLabel')}
                  autoComplete="off"
                />
              </div>
              {query && (
                <div className="col-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setQuery('');
                      setActiveIndex(-1);
                    }}
                    aria-label={t('clearKeywordAria')}
                  >
                    <BsXLg aria-hidden="true" />
                  </Button>
                </div>
              )}
              <div className="col-auto">
                <Button type="submit" variant="primary" size="default">
                  {t('searchSubmitBtn')}
                </Button>
              </div>
            </div>
          </form>

          {/* Autocomplete Dropdown Panel */}
          {isDropdownOpen && (
            <Card
              className="position-absolute start-0 end-0 mt-2 overflow-hidden shadow-lg"
              style={{ zIndex: 1050 }}
            >
              <CardContent>
                {isLikelyEcommerceUrl(query) && (
                  <div className="alert alert-danger d-flex align-items-center justify-content-between rounded-3 mb-3 flex-wrap gap-2 px-3 py-2">
                    <div className="small">
                      <strong>{t('urlDetectedStrong')}</strong>{' '}
                      {t('urlDetectedSub')}
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      wrap
                      onClick={() => {
                        setIsDropdownOpen(false);
                        void runUrlInspection(query);
                      }}
                      className="flex-shrink-0"
                    >
                      {t('inspectLinkBtn')}
                    </Button>
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
                    <div>{t('noMatchPrefix', { query })}</div>
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline-primary"
                        size="sm"
                        wrap
                        onClick={() => {
                          setIsDropdownOpen(false);
                          void runUrlInspection(query);
                        }}
                      >
                        {t('inspectTabLinkBtn')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {filteredProducts.map((item, idx) => {
                      const keySpecs = (item.key_specs || {}) as KeySpecs;
                      const thumb = productImageUrl(item);
                      const safeMinPrice = sanitizeHeroInspectorPriceVnd(
                        item.min_price
                      );
                      const minPriceLabel = formatHeroInspectorPriceVnd(
                        safeMinPrice,
                        locale
                      );
                      const rating = sanitizeHeroInspectorRating(
                        item.rating_score || item.user_rating_weighted,
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
                                <Badge variant="secondary">{item.brand}</Badge>
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
                                  <StarRating value={rating} size="sm" />
                                )}
                                <RadarBadge
                                  signal={getRadarSignal(radarIndex, item.slug)}
                                />
                              </div>
                            </div>
                          </Link>

                          <div className="d-flex align-items-center flex-shrink-0 gap-2">
                            <div className="me-1 text-end">
                              <div
                                className={`fw-bold small ${
                                  safeMinPrice > 0
                                    ? 'text-danger'
                                    : 'text-muted'
                                }`}
                              >
                                {minPriceLabel}
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
                              item={buildHeroCompareItem(item, thumb)}
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
                    {filteredMerchants.map((m) => {
                      const trustBadge = resolveHeroMerchantTrustBadge(m);
                      return (
                        <Link
                          key={m.id}
                          href={`/merchants/${m.id}`}
                          onClick={() => setIsDropdownOpen(false)}
                          className="d-flex align-items-center justify-content-between rounded-3 text-decoration-none text-dark hover-bg-light px-2 py-2"
                        >
                          <div className="d-flex align-items-center gap-2">
                            <Badge variant="brand" className="text-uppercase">
                              {m.platform}
                            </Badge>
                            <span className="fw-semibold small">
                              <ContentText text={m.name} locale={locale} />
                            </span>
                            {m.is_official && (
                              <Badge variant="success">
                                {t('officialMallBadge')}
                              </Badge>
                            )}
                          </div>
                          <div className="d-flex align-items-center small gap-2">
                            {trustBadge == null ? (
                              <Badge variant="secondary">
                                {t('trustBadgeNoData')}
                              </Badge>
                            ) : (
                              <Badge variant={trustBadge.variant}>
                                {t('trustBadge', { score: trustBadge.score })}
                              </Badge>
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
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* Mode 2: URL / Link Inspector */
        <div>
          <form
            onSubmit={handleInspectSubmit}
            className="search-wrap border-danger border bg-white p-2 shadow"
          >
            <div className="row gx-2 align-items-center m-0">
              <div className="d-none d-sm-flex align-items-center col-auto ps-2">
                <BsLink45Deg aria-hidden="true" className="text-danger fs-4" />
              </div>
              <div className="col">
                <input
                  type="text"
                  value={inspectQuery}
                  onChange={(e) => setInspectQuery(e.target.value)}
                  className="form-control fw-medium rounded-3 border-0 ps-2 shadow-none"
                  placeholder={t('inspectPlaceholder')}
                  aria-label={t('inspectAriaLabel')}
                />
              </div>
              {inspectQuery && (
                <div className="col-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setInspectQuery('');
                      setInspectResult(null);
                      setInspectError(null);
                    }}
                    aria-label={t('clearUrlAria')}
                  >
                    <BsXLg aria-hidden="true" />
                  </Button>
                </div>
              )}
              <div className="col-auto">
                <Button
                  type="submit"
                  variant="primary"
                  size="default"
                  disabled={isInspecting}
                >
                  {isInspecting ? t('inspectingBtn') : t('inspectNowBtn')}
                </Button>
              </div>
            </div>
          </form>

          {/* Sample One-Click Inspection Chips */}
          <div className="d-flex align-items-center justify-content-center mt-2 flex-wrap gap-2">
            <span
              className="small"
              style={{ color: 'var(--rate-fg-secondary)' }}
            >
              {t('sampleLinksLabel')}
            </span>
            {SAMPLE_INSPECT_LINKS.map((sample) => (
              <Button
                key={sample.label}
                type="button"
                variant="outline"
                size="sm"
                wrap
                onClick={() => void runUrlInspection(sample.value)}
              >
                <BsLightningChargeFill
                  aria-hidden="true"
                  className="text-warning"
                />
                {sample.label}
              </Button>
            ))}
          </div>

          {inspectError && (
            <div className="alert alert-danger rounded-4 mt-3 mb-0">
              {inspectError}
            </div>
          )}

          {/* Instant URL Inspection Result Card */}
          {inspectResult && (
            <Card className="mt-3 overflow-hidden shadow-lg">
              <div
                className="border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2 px-4 py-3"
                style={{ backgroundColor: 'var(--rate-bg-elevated)' }}
              >
                <div className="d-flex align-items-center gap-2">
                  <BsShieldCheck
                    aria-hidden="true"
                    className="text-success fs-5"
                  />
                  <span className="fw-bold">{t('resultCardHeader')}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectResult(null)}
                >
                  {t('closeBtn')}
                </Button>
              </div>

              <div className="p-4">
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
                            <Badge variant="brand">
                              {inspectResult.masterProduct.brand}
                            </Badge>
                            {inspectResult.parsedUrl.platform && (
                              <Badge
                                variant="danger"
                                className="text-uppercase"
                              >
                                {inspectResult.parsedUrl.platform}
                              </Badge>
                            )}
                            {heroDiscountAnalysis && (
                              <Badge
                                variant={
                                  heroDiscountAnalysis.verdict ===
                                  'fake_discount'
                                    ? 'danger'
                                    : heroDiscountAnalysis.verdict ===
                                        'suspicious_discount'
                                      ? 'warning'
                                      : heroDiscountAnalysis.verdict ===
                                          'genuine_deal'
                                        ? 'success'
                                        : 'secondary'
                                }
                              >
                                {
                                  discountVerdictCopy(
                                    tVerdict,
                                    heroDiscountAnalysis,
                                    locale
                                  ).label
                                }
                              </Badge>
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

                          {(() => {
                            const safeBestPrice =
                              resolveHeroInspectBestPriceVnd(inspectResult);
                            const safeLowestEver =
                              sanitizeHeroInspectorPriceVnd(
                                inspectResult.priceHistory?.lowestEverPrice
                              );
                            return (
                              <div
                                className={`${
                                  safeBestPrice > 0
                                    ? 'text-danger'
                                    : 'text-muted'
                                } fw-bold fs-5 mb-1`}
                              >
                                {t('bestPriceLabel')}{' '}
                                {formatHeroInspectorPriceVnd(
                                  safeBestPrice,
                                  locale
                                )}
                                {safeLowestEver > 0 && (
                                  <span className="text-success small fw-semibold ms-2">
                                    {t('lowestEverPriceLabel', {
                                      price: formatNumber(
                                        safeLowestEver,
                                        locale
                                      ),
                                    })}
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {heroDiscountAnalysis && (
                            <p className="text-muted small mb-0">
                              {
                                discountVerdictCopy(
                                  tVerdict,
                                  heroDiscountAnalysis,
                                  locale
                                ).explanation
                              }
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-5">
                      <Card tone="elevated" className="p-3">
                        {inspectResult.merchantProfile &&
                          (() => {
                            const trustBadge = resolveHeroMerchantTrustBadge(
                              inspectResult.merchantProfile
                            );
                            return (
                              <div className="d-flex justify-content-between align-items-center border-bottom mb-2 flex-wrap gap-2 pb-2">
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
                                  {inspectResult.merchantProfile
                                    .is_official && (
                                    <BsCheckCircleFill
                                      role="img"
                                      aria-label={t('officialMallBadge')}
                                      className="text-success ms-1"
                                    />
                                  )}
                                </div>
                                {trustBadge == null ? (
                                  <Badge variant="secondary">
                                    {t('trustBadgeNoData')}
                                  </Badge>
                                ) : (
                                  <Badge variant={trustBadge.variant}>
                                    {t('trustBadge', {
                                      score: trustBadge.score,
                                    })}
                                  </Badge>
                                )}
                              </div>
                            );
                          })()}

                        {inspectResult.reviewSummary &&
                          (() => {
                            const reviewAuth =
                              resolveHeroReviewAuthenticityDisplay(
                                inspectResult.reviewSummary,
                                locale,
                                {
                                  formatAuthentic: (values) =>
                                    t('aiReviewAuthValue', values),
                                  emptyLabel: tStarRating('empty'),
                                }
                              );
                            if (!reviewAuth) return null;
                            return (
                              <div className="d-flex justify-content-between align-items-center small mb-3 flex-wrap gap-2">
                                <span className="text-muted">
                                  {t('aiReviewAuthLabel')}
                                </span>
                                <span className={reviewAuth.className}>
                                  {reviewAuth.text}
                                </span>
                              </div>
                            );
                          })()}

                        <div className="d-flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            wrap
                            asChild
                            className="flex-grow-1"
                          >
                            <Link
                              href={getMasterProductHref(
                                inspectResult.masterProduct
                              )}
                            >
                              {t('viewSpecsAndHistoryBtn')}
                              <BsArrowRight aria-hidden="true" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            wrap
                            asChild
                          >
                            <Link
                              href={`/inspect?q=${encodeURIComponent(inspectQuery)}`}
                            >
                              {t('auditReportBtn')}
                            </Link>
                          </Button>
                          {inspectResult.merchantProfile && (
                            <Button variant="outline" size="sm" wrap asChild>
                              <Link
                                href={`/merchants/${inspectResult.merchantProfile.id}`}
                              >
                                {t('shopProfileBtn')}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : inspectResult.merchantProfile ? (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                        <Badge variant="brand" className="text-uppercase">
                          {inspectResult.merchantProfile.platform}
                        </Badge>
                        {inspectResult.merchantProfile.is_official && (
                          <Badge variant="success">
                            {t('officialMallBadge')}
                          </Badge>
                        )}
                        {(() => {
                          const trustBadge = resolveHeroMerchantTrustBadge(
                            inspectResult.merchantProfile
                          );
                          return trustBadge == null ? (
                            <Badge variant="secondary">
                              {t('trustBadgeNoData')}
                            </Badge>
                          ) : (
                            <Badge variant={trustBadge.variant}>
                              {t('trustBadge', { score: trustBadge.score })}
                            </Badge>
                          );
                        })()}
                      </div>
                      <h2 className="h5 fw-bold mb-1">
                        <BsShop
                          aria-hidden="true"
                          className="text-primary me-2"
                        />
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
                    <Button variant="primary" size="default" wrap asChild>
                      <Link
                        href={`/merchants/${inspectResult.merchantProfile.id}`}
                      >
                        {t('openMerchantProfileBtn')}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <h5 className="fw-bold d-flex align-items-center mb-1 gap-2">
                        <BsExclamationTriangleFill
                          aria-hidden="true"
                          className="text-warning"
                        />
                        {t('unmatchedHeading')}
                      </h5>
                      <p className="text-muted small mb-0">
                        {t('unmatchedDesc')}
                      </p>
                    </div>
                    <Button
                      variant="outline-primary"
                      size="default"
                      wrap
                      asChild
                    >
                      <Link
                        href={`/smartphones?q=${encodeURIComponent(inspectResult.query)}`}
                      >
                        {t('searchInSmartphonesBtn')}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
