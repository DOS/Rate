import type { Metadata } from 'next';
import {
  MAX_VALID_VND_PRICE,
  isCategoryVisibleInDirectory,
  resolveCompareEffectiveUserRating,
  resolveListingPriceCurrency,
} from '@/lib/rate-domain';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import PageShell from './components/page-shell';
import {
  EMPTY_RATE_PLATFORM_STATS,
  getMasterProductHref,
} from '@/lib/rate-api';
import {
  buildPopular1v1BattlesForCategory,
  rankMasterProductsForLeaderboard,
} from '@/lib/leaderboard-engine';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  itemSlugFromProductAnswer,
  versusHref,
} from '@/lib/item-compare';
import {
  getCachedMasterProducts,
  getCachedMerchantsList,
  getCachedRatePlatformStats,
  getCrossPlatformDealRadar,
  groupCatalogRowsByItem,
  type CrossPlatformDealRadarResponse,
  type ItemCatalogRow,
  type MerchantSummary,
  type RatePlatformStats,
} from '@/server/rate';
import { catalogRowSlug, itemSizeChips } from '@/lib/item-directory';
import { formatStorageLabel } from '@/lib/category-filters';
import type { MasterProduct } from '@repo/shared-data';
import {
  BsArrowLeftRight,
  BsArrowRight,
  BsBank,
  BsBatteryHalf,
  BsBoxSeam,
  BsCheckCircleFill,
  BsCpu,
  BsDroplet,
  BsGraphUpArrow,
  BsHeadphones,
  BsLaptop,
  BsPhone,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsSmartwatch,
  BsSnow,
  BsStarFill,
  BsTabletLandscape,
  BsTrophy,
  BsTv,
  BsWifi,
  BsWind,
  BsGraphDownArrow,
  BsExclamationTriangle,
} from 'react-icons/bs';
import HeroSearchInspector from '@/components/home/HeroSearchInspector';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import ProductCard, {
  type ProductCardSpec,
} from '@/components/product/ProductCard';
import { saleStateOfMaster } from '@/lib/sale-state';
import { buildRadarIndex, getRadarSignal } from '@/lib/deal-radar';
import { isPendingReview } from '@/lib/review-display';
import {
  HERO_MERCHANT_PRELOAD,
  toHeroMerchantSuggestions,
} from '@/lib/hero-merchants';
import { toHeroProductSuggestions } from '@/lib/hero-products';
import ContentText from '@/components/elementary/ContentText';
import { contentLang } from '@/lib/content-lang';
import ClientMessages from '@/components/providers/ClientMessages';
import { siteJsonLd } from '@/lib/seo';
import {
  getMasterProductCategorySlug,
  productImageUrl,
} from '@/lib/rate-domain-core';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
  merchantRiskTone,
} from '@/lib/merchant-risk-tone';
import {
  formatDate,
  formatDecimal,
  formatListingPrice,
  formatNumber,
  formatPlainNumber,
  formatPriceVnd,
  sanitizeCurrencyPriceValue,
} from '@/lib/locale-format';
import StarRating from '@/components/elementary/StarRating';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tSeo = await getTranslations({ locale, namespace: 'rate.seo' });
  return {
    title: tSeo('siteTitle'),
    description: tSeo('siteDescription'),
    alternates: {
      canonical: 'https://rate.vn',
    },
  };
}

const CATEGORY_DESC_KEYS = {
  smartphones: 'catDescSmartphones',
  laptops: 'catDescLaptops',
  tablets: 'catDescTablets',
  smartwatches: 'catDescSmartwatches',
  earbuds: 'catDescEarbuds',
  tvs: 'catDescTvs',
  'air-conditioners': 'catDescAirConditioners',
  refrigerators: 'catDescRefrigerators',
  'washing-machines': 'catDescWashingMachines',
  'air-purifiers': 'catDescAirPurifiers',
  'bank-savings': 'catDescBankSavings',
  'internet-telecom': 'catDescInternetTelecom',
} as const;

type KnownCategorySlug = keyof typeof CATEGORY_DESC_KEYS;

// The trust section is a preview with a link to /merchants; rendering every
// store made the page grow with the directory (DOS/Rate#450). The list comes
// ordered official first, then by followers.
const HOME_MERCHANT_PREVIEW_COUNT = 6;

const isKnownCategory = (slug: string): slug is KnownCategorySlug =>
  Object.hasOwn(CATEGORY_DESC_KEYS, slug);

function getCategoryIcon(slug: string) {
  switch (slug) {
    case 'smartphones':
      return <BsPhone />;
    case 'laptops':
      return <BsLaptop />;
    case 'tablets':
      return <BsTabletLandscape />;
    case 'smartwatches':
      return <BsSmartwatch />;
    case 'earbuds':
      return <BsHeadphones />;
    case 'tvs':
      return <BsTv />;
    case 'air-conditioners':
      return <BsSnow />;
    case 'refrigerators':
      return <BsBoxSeam />;
    case 'washing-machines':
      return <BsDroplet />;
    case 'air-purifiers':
      return <BsWind />;
    case 'bank-savings':
      return <BsBank />;
    case 'internet-telecom':
      return <BsWifi />;
    default:
      return <BsCpu />;
  }
}

function parseStrictFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return null;
    const trimmed = value.trim();
    if (trimmed === '' || /^[+-]?0[xbo]/i.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeNonNegativeInt(value: unknown): number {
  const parsed = parseStrictFiniteNumber(value);
  return parsed != null && parsed > 0 ? Math.floor(parsed) : 0;
}

function sanitizePositiveRadarPct(value: unknown): number | null {
  const parsed = parseStrictFiniteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

export function roundHomeMerchantScore(value: unknown): number | null {
  const parsed = parseStrictFiniteNumber(value);
  if (parsed == null) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
  return clamped === 0 ? 0 : clamped;
}

export type HomeMerchantScoreDisplay = {
  score: number;
  tone: 'good' | 'warn' | 'bad';
  toneClass: 'is-good' | 'is-warn' | 'is-bad';
};

export function homeMerchantDosafeDisplay(
  merchant: Parameters<typeof knownDosafeRiskScore>[0] | null | undefined
): HomeMerchantScoreDisplay | null {
  if (!merchant) return null;
  if (roundHomeMerchantScore(merchant.dosafe_risk_score) == null) return null;
  const known = knownDosafeRiskScore(merchant);
  const score = roundHomeMerchantScore(known);
  if (score == null) return null;
  const tone = merchantRiskTone(score);
  return { score, tone, toneClass: `is-${tone}` };
}

export function homeMerchantReviewRiskDisplay(
  merchant:
    | {
        review_risk_score?: unknown;
        review_risk_breakdown?: Parameters<typeof hasReviewRiskEvidence>[0];
      }
    | null
    | undefined
): HomeMerchantScoreDisplay | null {
  if (!merchant || !hasReviewRiskEvidence(merchant.review_risk_breakdown)) {
    return null;
  }
  const score = roundHomeMerchantScore(merchant.review_risk_score);
  if (score == null) return null;
  const tone = merchantRiskTone(score);
  return { score, tone, toneClass: `is-${tone}` };
}

export function homeMerchantTrustDisplay(
  merchant:
    | {
        trust_score?: unknown;
        risk_score?: unknown;
      }
    | null
    | undefined
): HomeMerchantScoreDisplay | null {
  if (!merchant) return null;
  const score = roundHomeMerchantScore(merchant.trust_score);
  if (score == null) return null;
  const tone = score >= 80 ? 'good' : score > 50 ? 'warn' : 'bad';
  return { score, tone, toneClass: `is-${tone}` };
}

export function sanitizeHomePriceVnd(
  value: unknown,
  currency?: string | null
): number | null {
  const parsed = parseStrictFiniteNumber(value);
  if (parsed == null || parsed <= 0 || parsed > MAX_VALID_VND_PRICE) {
    return null;
  }
  const sanitized = sanitizeCurrencyPriceValue(parsed, currency);
  if (sanitized <= 0 || sanitized > MAX_VALID_VND_PRICE) return null;
  return sanitized;
}

export function resolveHomeRadarOriginalPriceVnd(
  priceCurrent: unknown,
  priceOriginal: unknown,
  currency?: string | null
): number | null {
  const current = sanitizeHomePriceVnd(priceCurrent, currency);
  const original = sanitizeHomePriceVnd(priceOriginal, currency);
  if (current == null || original == null || original <= current) {
    return null;
  }
  return original;
}

export function buildHomeRadarIndex(
  dealRadar: CrossPlatformDealRadarResponse | null | undefined
) {
  return buildRadarIndex(
    dealRadar
      ? {
          ...dealRadar,
          genuineDeals: Array.isArray(dealRadar.genuineDeals)
            ? dealRadar.genuineDeals.filter(
                (g) => sanitizeHomePriceVnd(g.priceCurrent) != null
              )
            : dealRadar.genuineDeals,
        }
      : dealRadar
  );
}

export function buildHomeQuickCompareSlugs(
  products: MasterProduct[],
  catSlugById: Map<string, string>,
  limit = 3
): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const p of products) {
    const slug = catalogRowSlug(p).trim();
    if (!slug || seen.has(slug)) continue;
    if (
      !getMasterProductHref({ ...p, slug }, catSlugById).startsWith(
        '/smartphones/'
      )
    ) {
      continue;
    }
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= limit) break;
  }
  return slugs;
}

export function loadHomeMasterProducts(
  readProducts: typeof getCachedMasterProducts = getCachedMasterProducts
) {
  return readProducts({ categorySlug: 'all', limit: 24 });
}

export function buildHomePopularBattles(
  products: MasterProduct[],
  maxPairs = 3
) {
  const itemSlugBySlug = Object.create(null) as Record<string, string>;
  for (const row of products) {
    if (!row || typeof row.slug !== 'string' || !row.slug) continue;
    const itemSlug = (row as ItemCatalogRow).item_slug;
    if (typeof itemSlug === 'string' && itemSlug) {
      itemSlugBySlug[row.slug] = itemSlug;
    }
  }

  const ranked = rankMasterProductsForLeaderboard(products, {
    category: 'smartphones',
    criterion: 'combined',
  });
  const seenSides = new Set<string>();
  const sideByVariantSlug = Object.create(null) as Record<string, string>;
  const uniqueCandidates: MasterProduct[] = [];

  for (const entry of ranked) {
    const slug = entry.slug;
    if (!slug) continue;
    const rawItemSlug = (entry.product as ItemCatalogRow).item_slug;
    if (
      typeof rawItemSlug === 'string' &&
      rawItemSlug.toLowerCase().includes('-vs-')
    ) {
      continue;
    }
    const effectiveSide = rawItemSlug
      ? itemSlugFromProductAnswer(
          { ok: true, data: { item: { slug: rawItemSlug } } },
          slug
        )
      : slug;
    if (!effectiveSide || effectiveSide.toLowerCase().includes('-vs-')) {
      continue;
    }
    const sideKey = effectiveSide.toLowerCase();
    if (seenSides.has(sideKey)) continue;
    seenSides.add(sideKey);
    sideByVariantSlug[slug] = effectiveSide;
    uniqueCandidates.push(entry.product);
  }

  const rawBattles = buildPopular1v1BattlesForCategory(
    uniqueCandidates,
    'smartphones',
    20
  );
  const seenHrefs = new Set<string>();
  const resolved: typeof rawBattles = [];
  for (const battle of rawBattles) {
    const slugA = battle.productA.slug;
    const slugB = battle.productB.slug;
    const sideA = sideByVariantSlug[slugA];
    const sideB = sideByVariantSlug[slugB];
    if (!sideA || !sideB || sideA.toLowerCase() === sideB.toLowerCase()) {
      continue;
    }
    const [first, second] = canonicalVersusOrder(sideA, sideB);
    if (
      !isParseableVersusPair(first, second) ||
      !isParseableVersusPair(first.toLowerCase(), second.toLowerCase())
    ) {
      continue;
    }
    const href = versusHref(slugA, slugB, itemSlugBySlug);
    const hrefKey = href.toLowerCase();
    if (seenHrefs.has(hrefKey)) continue;
    seenHrefs.add(hrefKey);
    resolved.push({
      ...battle,
      versusSlug: href.replace(/^\/compare\//, ''),
      versusHref: href,
    });
    if (resolved.length >= maxPairs) break;
  }
  return resolved;
}

export async function resolveHomeGroupedCatalog(
  masterProducts: MasterProduct[],
  groupByItem: typeof groupCatalogRowsByItem = groupCatalogRowsByItem
) {
  // RATE_ITEM_MODEL on: one grid card and one 1v1 battle slot per Item (DOS/Rate#1155, #1808).
  const gridProducts = await groupByItem(masterProducts).catch(
    () => masterProducts
  );
  const popularHomeBattles = buildHomePopularBattles(gridProducts, 3);
  return { gridProducts, popularHomeBattles };
}

export function sanitizeHomeReviewStars(value: unknown): number | null {
  const parsed = parseStrictFiniteNumber(value);
  if (parsed == null) return null;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

export type HomeDealRadarTranslateKey =
  | 'radarHomeBadge'
  | 'radarHomeAnalyzed'
  | 'radarHomeInspectBtn'
  | 'radarHomeDealHubBtn'
  | 'radarGenuineTitle'
  | 'medianPriceInline'
  | 'medianPriceInlineCurrency'
  | 'vsMedianPctBadge'
  | 'radarFakeTitle'
  | 'inflatedOrigInline'
  | 'fakeMarkupPctBadge'
  | 'spreadLeadersTitle'
  | 'viewAllSpreadBtn'
  | 'spreadPctBadge';

export function HomeDealRadarBlock({
  dealRadar,
  locale,
  tHome,
}: {
  dealRadar: CrossPlatformDealRadarResponse;
  locale: string;
  tHome: (
    key: HomeDealRadarTranslateKey,
    values?: Record<string, string | number>
  ) => string;
}) {
  const genuineDeals = Array.isArray(dealRadar.genuineDeals)
    ? dealRadar.genuineDeals.filter(
        (g) => sanitizeHomePriceVnd(g.priceCurrent, g.currency) != null
      )
    : [];
  const fakeSaleTraps = Array.isArray(dealRadar.fakeSaleTraps)
    ? dealRadar.fakeSaleTraps.filter(
        (t) => sanitizeHomePriceVnd(t.priceCurrent, t.currency) != null
      )
    : [];
  const priceSpreadLeaders = Array.isArray(dealRadar.priceSpreadLeaders)
    ? dealRadar.priceSpreadLeaders.filter(
        (s) => sanitizeHomePriceVnd(s.spreadVnd, s.currency) != null
      )
    : [];

  if (
    genuineDeals.length === 0 &&
    fakeSaleTraps.length === 0 &&
    priceSpreadLeaders.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="rate-card rate-home-radar mt-4"
      data-testid="homepage-deal-radar"
    >
      <div className="rate-section-head">
        <div>
          <span className="rate-eyebrow mb-2">{tHome('radarHomeBadge')}</span>
          <h3 className="rate-home-radar-title">
            {tHome('radarHomeAnalyzed', {
              offers: sanitizeNonNegativeInt(dealRadar.totalOffersAnalyzed),
              merchants: sanitizeNonNegativeInt(
                dealRadar.totalMerchantsAnalyzed
              ),
              clusters: sanitizeNonNegativeInt(dealRadar.totalClustersAnalyzed),
            })}
          </h3>
        </div>
        <div className="rate-section-links">
          <Link href="/inspect">
            <BsShieldCheck aria-hidden="true" />
            {tHome('radarHomeInspectBtn')}
          </Link>
          <Link href="/deals">
            {tHome('radarHomeDealHubBtn')}
            <BsArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      {(genuineDeals.length > 0 || fakeSaleTraps.length > 0) && (
        <div className="row g-4">
          {genuineDeals.length > 0 && (
            <div className="col-lg-6">
              <h4 className="rate-radar-list-title is-good">
                <BsGraphDownArrow aria-hidden="true" />
                {tHome('radarGenuineTitle', {
                  count: genuineDeals.length,
                })}
              </h4>
              <ul className="rate-radar-list">
                {genuineDeals.slice(0, 3).map((g) => {
                  const gCurrency = g.currency;
                  const currentPrice = sanitizeHomePriceVnd(
                    g.priceCurrent,
                    gCurrency
                  )!;
                  const medianPrice = sanitizeHomePriceVnd(
                    g.marketMedianPrice,
                    gCurrency
                  );
                  const savingsPct = sanitizePositiveRadarPct(
                    g.savingsVsMedianPct
                  );
                  return (
                    <li key={g.id}>
                      <div className="rate-radar-item-main">
                        <Link href={g.productHref} className="text-truncate">
                          {g.productName}
                        </Link>
                        <span className="rate-radar-item-meta text-truncate">
                          <span className="rate-radar-platform">
                            {g.platform}
                          </span>
                          <ContentText text={g.merchantName} locale={locale} />
                          {medianPrice != null && (
                            <>
                              {' '}
                              ·{' '}
                              {gCurrency === 'PCT'
                                ? tHome('medianPriceInlineCurrency', {
                                    price: formatListingPrice(
                                      medianPrice,
                                      gCurrency,
                                      locale
                                    ),
                                  })
                                : tHome('medianPriceInline', {
                                    price: formatNumber(medianPrice, locale),
                                  })}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="rate-radar-item-side">
                        <span className="rate-radar-price">
                          {gCurrency === 'PCT'
                            ? formatListingPrice(
                                currentPrice,
                                gCurrency,
                                locale
                              )
                            : formatPriceVnd(currentPrice, locale)}
                        </span>
                        {savingsPct != null && (
                          <span className="rate-radar-tag is-good">
                            {tHome('vsMedianPctBadge', {
                              pct: formatPlainNumber(savingsPct, locale),
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {fakeSaleTraps.length > 0 && (
            <div className="col-lg-6">
              <h4 className="rate-radar-list-title is-bad">
                <BsExclamationTriangle aria-hidden="true" />
                {tHome('radarFakeTitle', {
                  count: fakeSaleTraps.length,
                })}
              </h4>
              <ul className="rate-radar-list">
                {fakeSaleTraps.slice(0, 3).map((t) => {
                  const tCurrency = t.currency;
                  const currentPrice = sanitizeHomePriceVnd(
                    t.priceCurrent,
                    tCurrency
                  )!;
                  const origPrice = resolveHomeRadarOriginalPriceVnd(
                    currentPrice,
                    t.priceOriginal,
                    tCurrency
                  );
                  const markupPct = sanitizePositiveRadarPct(t.fakeMarkupPct);
                  return (
                    <li key={t.id}>
                      <div className="rate-radar-item-main">
                        <Link href={t.productHref} className="text-truncate">
                          {t.productName}
                        </Link>
                        <span className="rate-radar-item-meta text-truncate">
                          <span className="rate-radar-platform">
                            {t.platform}
                          </span>
                          <ContentText text={t.merchantName} locale={locale} />
                          {origPrice != null && (
                            <>
                              {' '}
                              · {tHome('inflatedOrigInline')}{' '}
                              <s>
                                {tCurrency === 'PCT'
                                  ? formatListingPrice(
                                      origPrice,
                                      tCurrency,
                                      locale
                                    )
                                  : formatPriceVnd(origPrice, locale)}
                              </s>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="rate-radar-item-side">
                        <span className="rate-radar-price">
                          {tCurrency === 'PCT'
                            ? formatListingPrice(
                                currentPrice,
                                tCurrency,
                                locale
                              )
                            : formatPriceVnd(currentPrice, locale)}
                        </span>
                        {markupPct != null && (
                          <span className="rate-radar-tag is-bad">
                            {tHome('fakeMarkupPctBadge', {
                              pct: formatPlainNumber(markupPct, locale),
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {priceSpreadLeaders.length > 0 && (
        <div
          data-testid="homepage-price-spread-leaders"
          className="rate-radar-spread"
        >
          <div className="rate-radar-spread-head">
            <h4 className="rate-radar-list-title">
              <BsArrowLeftRight aria-hidden="true" />
              {tHome('spreadLeadersTitle')}
            </h4>
            <Link href="/deals">
              {tHome('viewAllSpreadBtn', {
                count: priceSpreadLeaders.length,
              })}
              <BsArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="row g-2">
            {priceSpreadLeaders.slice(0, 3).map((s) => {
              const sCurrency = s.currency;
              const spreadVnd = sanitizeHomePriceVnd(s.spreadVnd, sCurrency)!;
              const spreadPct = sanitizePositiveRadarPct(s.spreadPct);
              return (
                <div key={s.id} className="col-lg-4 col-md-6">
                  <div className="rate-radar-spread-item">
                    <div className="rate-radar-item-main">
                      <Link href={s.productHref} className="text-truncate">
                        {s.productName}
                      </Link>
                      <span className="rate-radar-item-meta">
                        <span className="rate-radar-platform">
                          {s.cheapestPlatform}
                        </span>
                        vs{' '}
                        <span className="rate-radar-platform">
                          {s.priciestPlatform}
                        </span>
                      </span>
                    </div>
                    <div className="rate-radar-item-side">
                      <span className="rate-radar-price">
                        -
                        {sCurrency === 'PCT'
                          ? formatListingPrice(spreadVnd, sCurrency, locale)
                          : formatPriceVnd(spreadVnd, locale)}
                      </span>
                      {spreadPct != null && (
                        <span className="rate-radar-tag is-warn">
                          {tHome('spreadPctBadge', {
                            pct: formatPlainNumber(spreadPct, locale),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type HomeMerchantCardTranslateKey =
  | 'merchantNoDataLabel'
  | 'merchantTrustedLabel'
  | 'merchantCautionLabel'
  | 'merchantHighRiskLabel'
  | 'shopIdLabel'
  | 'officialMallBadge'
  | 'dosafeRiskLabel'
  | 'dosafeRiskNoData'
  | 'noScamDetected'
  | 'reviewRiskLabel'
  | 'flaggedReviewsRatio'
  | 'reviewRiskNoData'
  | 'reviewRiskNoReviews'
  | 'ratingsAndProductsLabel'
  | 'productsShortUnit'
  | 'followersCountText'
  | 'periodicMonitoring'
  | 'lastUpdatedLabel';

export function HomeMerchantCard({
  merchant,
  locale,
  tHome,
  viewAuditLabel,
}: {
  merchant: MerchantSummary;
  locale: string;
  tHome: (
    key: HomeMerchantCardTranslateKey,
    values?: Record<string, string | number>
  ) => string;
  viewAuditLabel: string;
}) {
  // No data at all: no tone and no number (DOS/Rate#1484).
  const trustDisplay = homeMerchantTrustDisplay(merchant);
  const dosafeDisplay = homeMerchantDosafeDisplay(merchant);
  const reviewDisplay = homeMerchantReviewRiskDisplay(merchant);
  const overallTone = trustDisplay?.toneClass ?? '';
  const trustLabel =
    trustDisplay == null
      ? tHome('merchantNoDataLabel')
      : trustDisplay.tone === 'good'
        ? tHome('merchantTrustedLabel')
        : trustDisplay.tone === 'warn'
          ? tHome('merchantCautionLabel')
          : tHome('merchantHighRiskLabel');
  const breakdown = merchant.review_risk_breakdown;
  const totalRevAnalyzed = sanitizeNonNegativeInt(breakdown?.total_reviews);
  const flaggedRevCount = Math.min(
    totalRevAnalyzed,
    sanitizeNonNegativeInt(breakdown?.seeding_fake_count) +
      sanitizeNonNegativeInt(breakdown?.coin_spam_count) +
      sanitizeNonNegativeInt(breakdown?.sabotage_or_bombing_count)
  );
  const rawRatingStar = parseStrictFiniteNumber(merchant.rating_star);
  const ratingStar =
    rawRatingStar != null && rawRatingStar > 0
      ? Math.min(5, rawRatingStar)
      : null;
  const productCount = sanitizeNonNegativeInt(merchant.product_count);
  const followerCount = sanitizeNonNegativeInt(merchant.follower_count);
  const hasValidUpdatedAt =
    typeof merchant.updated_at === 'string' &&
    merchant.updated_at.trim() !== '' &&
    Number.isFinite(Date.parse(merchant.updated_at));

  return (
    <article
      className="rate-card rate-merchant-card"
      data-merchant-id={merchant.id}
    >
      <div className="rate-merchant-head">
        <span className="rate-category-card-icon" aria-hidden="true">
          <BsShop aria-hidden="true" />
        </span>
        <div className="rate-merchant-id">
          <h3 className="rate-merchant-name">
            <Link href={`/merchants/${merchant.id}`}>
              <ContentText text={merchant.name} locale={locale} />
            </Link>
          </h3>
          <div className="rate-merchant-meta">
            <span className="rate-radar-platform">{merchant.platform}</span>
            {tHome('shopIdLabel')} {merchant.platform_shop_id}
            {merchant.is_official && (
              <span className="rate-merchant-official">
                <BsCheckCircleFill aria-hidden="true" />
                {tHome('officialMallBadge')}
              </span>
            )}
          </div>
        </div>
        <span
          data-testid="home-merchant-trust-badge"
          className={
            overallTone ? `rate-radar-tag ${overallTone}` : 'rate-radar-tag'
          }
        >
          {trustDisplay == null
            ? trustLabel
            : `${trustLabel} · ${trustDisplay.score}/100`}
        </span>
      </div>

      <dl className="rate-merchant-metrics">
        <div>
          <dt>{tHome('dosafeRiskLabel')}</dt>
          {/* No DOSafe score: no number, and no "no scam
              detected" (DOS/Rate#1479). */}
          {dosafeDisplay == null ? (
            <dd data-testid="home-merchant-dosafe-score">
              {tHome('dosafeRiskNoData')}
            </dd>
          ) : (
            <>
              <dd
                data-testid="home-merchant-dosafe-score"
                className={dosafeDisplay.toneClass}
              >
                {dosafeDisplay.score}/100
              </dd>
              {dosafeDisplay.tone === 'good' && (
                <dd className="rate-merchant-note">
                  {tHome('noScamDetected')}
                </dd>
              )}
            </>
          )}
        </div>
        <div>
          <dt>{tHome('reviewRiskLabel')}</dt>
          {/* No analysed reviews: no number (DOS/Rate#1249). */}
          {reviewDisplay != null ? (
            <>
              <dd
                data-testid="home-merchant-review-score"
                className={reviewDisplay.toneClass}
              >
                {reviewDisplay.score}/100
              </dd>
              {totalRevAnalyzed > 0 && (
                <dd className="rate-merchant-note">
                  {tHome('flaggedReviewsRatio', {
                    flagged: flaggedRevCount,
                    total: totalRevAnalyzed,
                  })}
                </dd>
              )}
            </>
          ) : (
            <>
              <dd data-testid="home-merchant-review-score">
                {tHome('reviewRiskNoData')}
              </dd>
              {parseStrictFiniteNumber(breakdown?.total_reviews) === 0 && (
                <dd className="rate-merchant-note">
                  {tHome('reviewRiskNoReviews')}
                </dd>
              )}
            </>
          )}
        </div>
        <div>
          <dt>{tHome('ratingsAndProductsLabel')}</dt>
          <dd>
            {ratingStar != null && (
              <>
                <StarRating value={ratingStar} size="sm" />
                {' · '}
              </>
            )}
            {productCount} {tHome('productsShortUnit')}
          </dd>
          <dd className="rate-merchant-note">
            {followerCount > 0
              ? tHome('followersCountText', {
                  // A number, so the plural picks its form;
                  // the message formats it (DOS/Rate#1398).
                  count: followerCount,
                })
              : tHome('periodicMonitoring')}
          </dd>
        </div>
      </dl>

      <div className="rate-merchant-foot">
        {hasValidUpdatedAt ? (
          <span>
            {tHome('lastUpdatedLabel')}{' '}
            {formatDate(merchant.updated_at!, locale)}
          </span>
        ) : (
          <span />
        )}
        <Link href={`/merchants/${merchant.id}`}>
          {viewAuditLabel}
          <BsArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export type HomeReviewCardTranslateKey =
  | 'starsAria'
  | 'pendingAnalysisBadge'
  | 'coinSpamBadge'
  | 'suspectedSeedingBadge'
  | 'authenticConfidenceBadge'
  | 'authenticBadge';

export function HomeReviewCard({
  rev,
  locale,
  tHome,
}: {
  rev: RatePlatformStats['recentReviewsSample'][number];
  locale: string;
  tHome: (
    key: HomeReviewCardTranslateKey,
    values?: Record<string, string | number>
  ) => string;
}) {
  const isPending = isPendingReview(rev);
  const isFlagged =
    !isPending && (!rev.include_in_rating || rev.flag_category !== 'authentic');
  const rawFakeProb = parseStrictFiniteNumber(rev.fake_probability);
  const confidencePct =
    rawFakeProb != null
      ? Math.max(0, Math.min(100, Math.round((1 - rawFakeProb) * 100)))
      : null;
  const stars = sanitizeHomeReviewStars(rev.rating_star);

  return (
    <article className="rate-card rate-review-card">
      <div className="rate-review-head">
        <div>
          <div className="rate-review-author">
            <ContentText text={rev.author_name} locale={locale} />
          </div>
          {stars != null && (
            <div
              className="rate-review-stars"
              role="img"
              aria-label={tHome('starsAria', { count: stars })}
            >
              {Array.from({ length: stars }).map((_, idx) => (
                <BsStarFill key={idx} aria-hidden="true" />
              ))}
            </div>
          )}
        </div>
        {isPending ? (
          <span className="rate-radar-tag">
            {tHome('pendingAnalysisBadge')}
          </span>
        ) : isFlagged ? (
          <span className="rate-radar-tag is-warn">
            <BsShieldExclamation aria-hidden="true" />
            {rev.flag_category === 'low_value_coin_spam'
              ? tHome('coinSpamBadge')
              : tHome('suspectedSeedingBadge')}
          </span>
        ) : (
          <span className="rate-radar-tag is-good">
            <BsCheckCircleFill aria-hidden="true" />
            {confidencePct != null
              ? tHome('authenticConfidenceBadge', {
                  pct: formatPlainNumber(confidencePct, locale),
                })
              : tHome('authenticBadge')}
          </span>
        )}
      </div>

      {rev.comment?.trim() && (
        <p className="rate-review-body" lang={contentLang(rev.comment, locale)}>
          &ldquo;{rev.comment.trim()}&rdquo;
        </p>
      )}

      <div className="rate-review-foot">
        <BsPhone aria-hidden="true" />
        {rev.masterRouteHref ? (
          <Link href={rev.masterRouteHref} className="text-truncate">
            <ContentText text={rev.productTitle} locale={locale} />
          </Link>
        ) : (
          <span className="text-truncate">
            <ContentText text={rev.productTitle} locale={locale} />
          </span>
        )}
      </div>
    </article>
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tRate = await getTranslations({ locale, namespace: 'rate' });
  const tHome = await getTranslations({ locale, namespace: 'homePage' });

  let masterProducts: MasterProduct[] = [];
  let merchants: MerchantSummary[] = [];
  let dealRadar: CrossPlatformDealRadarResponse | null = null;
  let platformStats: RatePlatformStats = EMPTY_RATE_PLATFORM_STATS;

  // Each section degrades on its own: one failed read (nothing is cached for
  // it) must not blank the sections that did load.
  const [productsRes, merchantsRes, statsRes, radarRes] =
    await Promise.allSettled([
      loadHomeMasterProducts(),
      getCachedMerchantsList(),
      getCachedRatePlatformStats(),
      getCrossPlatformDealRadar({ categorySlug: 'all', limit: 50 }),
    ]);
  if (productsRes.status === 'fulfilled') masterProducts = productsRes.value;
  if (merchantsRes.status === 'fulfilled') merchants = merchantsRes.value;
  if (statsRes.status === 'fulfilled') platformStats = statsRes.value;
  if (radarRes.status === 'fulfilled') dealRadar = radarRes.value;
  for (const res of [productsRes, merchantsRes, statsRes, radarRes]) {
    if (res.status === 'rejected') {
      console.error(
        'Error fetching homepage data from Supabase rate schema:',
        res.reason
      );
    }
  }

  const radarIndex = buildHomeRadarIndex(dealRadar);

  const catSlugById = new Map<string, string>();
  for (const c of platformStats.categoriesWithCounts) {
    catSlugById.set(c.id, c.slug);
  }

  // RATE_ITEM_MODEL on: one grid card and one 1v1 battle slot per Item (DOS/Rate#1155, #1808).
  const { gridProducts, popularHomeBattles } =
    await resolveHomeGroupedCatalog(masterProducts);
  const quickCompareSlugs = buildHomeQuickCompareSlugs(
    gridProducts,
    catSlugById
  );

  const populatedExtraCategories = platformStats.categoriesWithCounts
    .filter((cat) => cat.productCount > 0)
    .map((cat) => cat.slug);

  return (
    <ClientMessages scope="home">
      <PageShell
        locale={locale}
        populatedCategorySlugs={populatedExtraCategories}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              siteJsonLd(locale, tRate('seo.siteDescription'))
            ).replace(/</g, '\\u003c'),
          }}
        />

        {/* Hero Section with Interactive Autocomplete & E-commerce Link Inspector (DESIGN.md v2.0 Dark Obsidian + DOS Crimson Glow) */}
        <div
          className="hero-header rate-surface-dark rate-ink-on-dark position-relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(216, 48, 48, 0.16), transparent 45%), radial-gradient(circle at 80% 15%, rgba(99, 102, 241, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
            paddingTop: '4.5rem',
            paddingBottom: '5rem',
            borderBottom: '1px solid var(--rate-glass-border)',
          }}
        >
          <div className="position-relative z-1 container">
            <div className="row justify-content-center align-items-center">
              <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                <div className="position-relative mb-4 pt-2 pb-2 text-center">
                  <div
                    className="d-inline-flex align-items-center rounded-pill small fw-semibold mb-3 gap-2 px-3 py-2"
                    style={{
                      backgroundColor: 'var(--rate-glass-bg)',
                      border: '1px solid var(--rate-glass-border)',
                      color: 'var(--rate-fg-primary)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <BsShieldCheck
                      className="text-success"
                      aria-hidden="true"
                    />
                    <span>{tRate('home.heroBadge')}</span>
                  </div>
                  <h1
                    className="fw-bold mb-3 text-white"
                    style={{
                      fontSize: 'clamp(2rem, 4.2vw, 3.25rem)',
                      letterSpacing: '-0.03em',
                      lineHeight: 1.15,
                    }}
                  >
                    {tRate('home.heroTitlePrefix')}{' '}
                    <span
                      className="rounded-3 d-inline-block px-3 py-1"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(216, 48, 48, 0.22), rgba(225, 29, 72, 0.12))',
                        border: '1px solid rgba(216, 48, 48, 0.45)',
                        color: 'var(--rate-crimson-text)',
                      }}
                    >
                      {tRate('home.heroTitleHighlight')}
                    </span>{' '}
                    {tRate('home.heroTitleSuffix')}
                  </h1>
                  <p
                    className="fs-5 mb-0"
                    style={{
                      color: 'var(--rate-fg-secondary)',
                      maxWidth: '780px',
                      margin: '0 auto',
                    }}
                  >
                    {tRate('home.heroSubtitle')}
                  </p>
                </div>
              </div>
            </div>

            <div className="row justify-content-center align-items-center">
              <div className="col-xl-9 col-lg-10 col-md-12 col-sm-12">
                <HeroSearchInspector
                  initialProducts={toHeroProductSuggestions(
                    // One suggestion per Item (#1155). Its slug stays the
                    // variant's: compare, watchlist and radar are keyed by it.
                    gridProducts
                  )}
                  initialMerchants={toHeroMerchantSuggestions(
                    merchants.slice(0, HERO_MERCHANT_PRELOAD)
                  )}
                />
              </div>
            </div>

            {/* Live Platform Telemetry Strip */}
            <div className="row justify-content-center mt-4 pt-2">
              <div className="col-xl-9 col-lg-10 col-12">
                <div className="row g-3 text-center">
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'var(--rate-glass-bg)',
                        border: '1px solid var(--rate-glass-border)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{
                          color: 'var(--rate-crimson-text)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {platformStats.masterProductsCount}
                      </div>
                      <div
                        className="small"
                        style={{ color: 'var(--rate-fg-secondary)' }}
                      >
                        {tRate('home.statProducts')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'var(--rate-glass-bg)',
                        border: '1px solid var(--rate-glass-border)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{
                          color: 'var(--rate-ink-info)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {platformStats.priceObservationsCount}
                      </div>
                      <div
                        className="small"
                        style={{ color: 'var(--rate-fg-secondary)' }}
                      >
                        {tRate('home.statPricePoints')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'var(--rate-glass-bg)',
                        border: '1px solid var(--rate-glass-border)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{
                          color: 'var(--rate-ink-success)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {platformStats.totalReviewsCount}
                      </div>
                      <div
                        className="small"
                        style={{ color: 'var(--rate-fg-secondary)' }}
                      >
                        {tRate('home.statReviews')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'var(--rate-glass-bg)',
                        border: '1px solid var(--rate-glass-border)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{
                          color: 'var(--rate-fg-primary)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {platformStats.merchantsCount}
                      </div>
                      <div
                        className="small"
                        style={{ color: 'var(--rate-fg-secondary)' }}
                      >
                        {tRate('home.statMerchants')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Live Categories from rate.categories */}
        <section className="rate-home-categories py-5" id="mains">
          <div className="container">
            <div className="rate-section-head">
              <div>
                <span className="rate-eyebrow mb-2">
                  {tRate('home.catBadge')}
                </span>
                <h2 className="sectionHeading h3 fw-semibold mb-1">
                  {tRate('home.catTitlePrefix')}{' '}
                  <span className="text-primary">
                    {tRate('home.catTitleHighlight')}
                  </span>
                </h2>
                <p className="text-muted mb-0">{tRate('home.catSubtitle')}</p>
              </div>
              <div className="rate-section-links">
                <Link href="/inspect">
                  <BsShieldCheck aria-hidden="true" />
                  {tRate('nav.inspect')}
                </Link>
                <Link href="/merchants">
                  <BsShop aria-hidden="true" />
                  {tRate('nav.merchants')}
                </Link>
              </div>
            </div>

            <div className="row g-3">
              {platformStats.categoriesWithCounts
                .filter((cat) =>
                  isCategoryVisibleInDirectory(cat.slug, cat.productCount)
                )
                .map((cat) => {
                  const known = isKnownCategory(cat.slug);
                  return (
                    <div
                      key={cat.id}
                      className="col-xl col-lg-4 col-sm-6 col-12"
                    >
                      <Link
                        href={cat.routeHref}
                        className="rate-card rate-card-interactive rate-category-card"
                      >
                        <div className="rate-category-card-top">
                          <span
                            className="rate-category-card-icon"
                            aria-hidden="true"
                          >
                            {getCategoryIcon(cat.slug)}
                          </span>
                          <span
                            className={`rate-category-card-count${
                              cat.productCount > 0 ? '' : ' is-empty'
                            }`}
                          >
                            {cat.productCount > 0
                              ? tRate('home.catModelCount', {
                                  count: cat.productCount,
                                })
                              : tRate('home.catExpanding')}
                          </span>
                        </div>
                        <h3 className="rate-category-card-title">
                          {known ? tRate(`nav.${cat.slug}`) : cat.name}
                        </h3>
                        {isKnownCategory(cat.slug) && (
                          <p className="rate-category-card-desc">
                            {tHome(CATEGORY_DESC_KEYS[cat.slug])}
                          </p>
                        )}
                        <span className="rate-category-card-cta">
                          {tRate('home.catViewLink')}
                          <BsArrowRight aria-hidden="true" />
                        </span>
                      </Link>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>

        {/* Section 2: Featured Master Products from rate.master_products */}
        {masterProducts.length > 0 && (
          <section className="border-top border-bottom bg-white py-5">
            <div className="container">
              <div className="rate-section-head">
                <div>
                  <span className="rate-eyebrow mb-2">
                    {tRate('home.featuredBadge')}
                  </span>
                  <h2 className="sectionHeading h3 fw-semibold mb-1">
                    {tRate('home.featuredTitlePrefix')}{' '}
                    <span className="text-primary">
                      {tRate('home.featuredTitleHighlight')}
                    </span>
                  </h2>
                  <p className="text-muted mb-0">
                    {tRate('home.featuredSubtitle')}
                  </p>
                </div>
                <div className="rate-section-links">
                  {quickCompareSlugs.length >= 2 && (
                    <Link
                      href={`/compare?cat=smartphones&slugs=${quickCompareSlugs.join(',')}`}
                    >
                      <BsArrowLeftRight aria-hidden="true" />
                      {tRate('home.compareSpecsBtn', {
                        count: quickCompareSlugs.length,
                      })}
                    </Link>
                  )}
                  <Link href="/smartphones">
                    {tRate('home.viewAllCatalog')} (
                    {platformStats.masterProductsCount})
                    <BsArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="row g-4">
                {gridProducts.slice(0, 6).map((storedItem) => {
                  // An earbud card carries no RAM, storage or screen chip
                  // (DOS/Rate#1142).
                  const item = applyCategorySpecTemplate(
                    getMasterProductCategorySlug(storedItem, catSlugById),
                    storedItem
                  );
                  const thumb = productImageUrl(item);
                  const keySpecs = item.key_specs || {};
                  const productHref = getMasterProductHref(
                    { ...item, slug: catalogRowSlug(item) },
                    catSlugById
                  );
                  const rawUser = resolveCompareEffectiveUserRating(item);
                  const expertScore =
                    item.expert_rating != null && Number(item.expert_rating) > 0
                      ? Number(item.expert_rating)
                      : null;
                  const specs: ProductCardSpec[] = [];
                  if (keySpecs.screen) {
                    specs.push({
                      key: 'screen',
                      icon: <BsPhone />,
                      label: String(keySpecs.screen),
                    });
                  }
                  if (keySpecs.chip) {
                    specs.push({
                      key: 'chip',
                      icon: <BsCpu />,
                      label: String(keySpecs.chip),
                    });
                  }
                  if (keySpecs.battery) {
                    specs.push({
                      key: 'battery',
                      icon: <BsBatteryHalf />,
                      label: String(keySpecs.battery),
                    });
                  }

                  return (
                    <div key={item.id} className="col-lg-4 col-md-6 col-12">
                      <ProductCard
                        slug={item.slug}
                        href={productHref}
                        sizeChips={itemSizeChips(
                          storedItem,
                          productHref,
                          formatStorageLabel
                        )}
                        categoryPath={
                          productHref.replace(`/${catalogRowSlug(item)}`, '') ||
                          '/smartphones'
                        }
                        name={item.name}
                        brand={item.brand}
                        thumbnail={thumb ?? null}
                        tags={[
                          item.ram_gb ? `${item.ram_gb}GB RAM` : '',
                          item.storage_gb ? `${item.storage_gb}GB` : '',
                        ].filter(Boolean)}
                        specs={specs}
                        userScore={rawUser > 0 ? rawUser : null}
                        reviewCount={Number(
                          item.authentic_review_count || item.total_reviews || 0
                        )}
                        expertScore={expertScore}
                        radarSignal={getRadarSignal(radarIndex, item.slug)}
                        minPrice={Number(item.min_price || 0)}
                        maxPrice={Number(item.max_price || 0)}
                        currency={resolveListingPriceCurrency({
                          categorySlug: getMasterProductCategorySlug(item),
                          metadata: item.metadata,
                        })}
                        merchantCount={item.merchant_count || 0}
                        saleState={saleStateOfMaster(item)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Section 2.5: Popular 1v1 Head-to-Head Flagship Showdowns (#58) */}
              {popularHomeBattles.length > 0 && (
                <div className="rate-scoreboard-dark rate-surface-dark rate-battles mt-5">
                  <div className="rate-section-head">
                    <div>
                      <span className="rate-eyebrow mb-2">
                        {tHome('popularBattlesBadge')}
                      </span>
                      <h3 className="rate-battles-title">
                        {tHome('popularBattlesTitle')}
                      </h3>
                    </div>
                    <div className="rate-section-links">
                      <Link href="/leaderboard">
                        <BsTrophy aria-hidden="true" />
                        {tHome('leaderboard5CatsBtn')}
                      </Link>
                      <Link href="/compare">
                        <BsArrowLeftRight aria-hidden="true" />
                        {tHome('compare10GroupsBtn')}
                      </Link>
                    </div>
                  </div>

                  <div className="row g-3">
                    {popularHomeBattles.map((battle) => (
                      <div
                        key={battle.versusSlug}
                        className="col-lg-4 col-md-6"
                      >
                        <Link
                          href={battle.versusHref}
                          className="rate-battle-card"
                        >
                          <div className="rate-battle-meta">
                            <span>
                              #{battle.productA.rank} vs #{battle.productB.rank}
                            </span>
                            <span>
                              {battle.scoreDelta5 > 0.05
                                ? tHome('scoreDeltaLabel', {
                                    delta: formatDecimal(
                                      battle.scoreDelta5,
                                      locale,
                                      1
                                    ),
                                  })
                                : tHome('scoreTieLabel')}
                            </span>
                          </div>

                          <div className="rate-battle-sides">
                            <div className="rate-battle-side">
                              <div className="rate-battle-name">
                                {battle.productA.name}
                              </div>
                              <div className="rate-battle-score">
                                <StarRating
                                  value={battle.productA.userScore5}
                                  digits={1}
                                  size="sm"
                                />
                              </div>
                            </div>
                            <span className="rate-battle-vs" aria-hidden="true">
                              VS
                            </span>
                            <div className="rate-battle-side text-end">
                              <div className="rate-battle-name">
                                {battle.productB.name}
                              </div>
                              <div className="rate-battle-score">
                                <StarRating
                                  value={battle.productB.userScore5}
                                  digits={1}
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>

                          <span className="rate-battle-cta">
                            {tHome('view1v1ScoreBtn')}
                            <BsArrowRight aria-hidden="true" />
                          </span>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 2.6: Live Cross-Platform Deal & Fake-Sale Trap Radar (#87) */}
              {dealRadar && (
                <HomeDealRadarBlock
                  dealRadar={dealRadar}
                  locale={locale}
                  tHome={(key, values) => tHome(key, values)}
                />
              )}
            </div>
          </section>
        )}

        {/* Section 3: Merchant Trust Directory Preview (Dual Risk Score) */}
        <section className="bg-light py-5">
          <div className="container">
            <div className="rate-section-head">
              <div>
                <span className="rate-eyebrow mb-2">
                  {tRate('home.merchantBadge')}
                </span>
                <h2 className="sectionHeading h3 fw-semibold mb-1">
                  {tRate('home.merchantTitlePrefix')}{' '}
                  <span className="text-primary">
                    {tRate('home.merchantTitleHighlight')}
                  </span>
                </h2>
                <p className="text-muted mb-0">
                  {tRate('home.merchantSubtitle')}
                </p>
              </div>
              <div className="rate-section-links">
                <Link href="/merchants">
                  {tRate('home.viewAllMerchants')} (
                  {platformStats.merchantsCount}
                  )
                  <BsArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="row g-4">
              {merchants
                .slice(0, HOME_MERCHANT_PREVIEW_COUNT)
                .map((merchant) => (
                  <div key={merchant.id} className="col-lg-6 col-12">
                    <HomeMerchantCard
                      merchant={merchant}
                      locale={locale}
                      tHome={(key, values) => tHome(key, values)}
                      viewAuditLabel={tRate('home.viewMerchantAuditBtn')}
                    />
                  </div>
                ))}
            </div>
          </div>
        </section>

        {/* Section 4: Real Buyer Reviews Audited by AI (Replaces fake ClientOne) */}
        {platformStats.recentReviewsSample.length > 0 && (
          <section className="bg-white py-5">
            <div className="container">
              <div className="rate-section-head">
                <div>
                  <span className="rate-eyebrow mb-2">
                    {tRate('home.reviewsBadge')}
                  </span>
                  <h2 className="sectionHeading h3 fw-semibold mb-1">
                    {tRate('home.reviewsTitlePrefix')}{' '}
                    <span className="text-primary">
                      {tRate('home.reviewsTitleHighlight')}
                    </span>
                  </h2>
                  <p className="text-muted mb-0">
                    {tRate('home.reviewsSubtitle')}
                  </p>
                </div>
                <div className="rate-review-stats">
                  <span className="rate-radar-tag is-good">
                    <BsCheckCircleFill aria-hidden="true" />
                    {tHome('authenticReviewsStatBadge', {
                      count: platformStats.authenticReviewsCount,
                      pct: formatPlainNumber(
                        platformStats.authenticRatioPct,
                        locale
                      ),
                    })}
                  </span>
                  {platformStats.filteredSeedingCount > 0 && (
                    <span className="rate-radar-tag is-warn">
                      <BsShieldExclamation aria-hidden="true" />
                      {tHome('filteredSeedingStatBadge', {
                        count: platformStats.filteredSeedingCount,
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="row g-4">
                {platformStats.recentReviewsSample.map((rev) => (
                  <div key={rev.id} className="col-lg-4 col-md-6 col-12">
                    <HomeReviewCard
                      rev={rev}
                      locale={locale}
                      tHome={(key, values) => tHome(key, values)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Section 5: Core Platform Capabilities (Replaces fake BlogOne) */}
        <section className="bg-light border-top py-5">
          <div className="container">
            <div className="row justify-content-center mb-4">
              <div className="col-xl-8 col-lg-9 text-center">
                <span className="rate-eyebrow mb-2">
                  {tRate('home.whyBadge')}
                </span>
                <h2 className="sectionHeading h3 fw-semibold mb-2">
                  {tRate('home.whyTitlePrefix')}{' '}
                  <span className="text-primary">
                    {tRate('home.whyTitleHighlight')}
                  </span>
                  ?
                </h2>
                <p className="text-muted mb-0">{tRate('home.whySubtitle')}</p>
              </div>
            </div>

            <div className="row g-4">
              {(
                [
                  { n: 1, href: '/compare', icon: <BsCpu /> },
                  { n: 2, href: '/smartphones', icon: <BsGraphUpArrow /> },
                  { n: 3, href: '/merchants', icon: <BsShieldCheck /> },
                ] as const
              ).map(({ n, href, icon }) => (
                <div key={n} className="col-lg-4 col-md-6 col-12">
                  <Link
                    href={href}
                    className="rate-card rate-card-interactive rate-category-card"
                  >
                    <span
                      className="rate-category-card-icon mb-3"
                      aria-hidden="true"
                    >
                      {icon}
                    </span>
                    <h3 className="rate-category-card-title">
                      {tHome(`whyCard${n}Title`)}
                    </h3>
                    <p className="rate-category-card-desc">
                      {tHome(`whyCard${n}Desc`)}
                    </p>
                    <span className="rate-category-card-cta">
                      {tHome(`whyCard${n}Link`)}
                      <BsArrowRight aria-hidden="true" />
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}
