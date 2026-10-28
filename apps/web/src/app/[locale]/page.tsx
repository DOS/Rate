import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import PageShell from './components/page-shell';
import {
  EMPTY_RATE_PLATFORM_STATS,
  getMasterProductHref,
  getMasterProducts,
} from '@/lib/rate-api';
import { buildPopular1v1BattlesForCategory } from '@/lib/leaderboard-engine';
import {
  getCachedMerchantsList,
  getCachedRatePlatformStats,
  getCrossPlatformDealRadar,
  groupCatalogRowsByItem,
  type CrossPlatformDealRadarResponse,
  type MerchantSummary,
  type RatePlatformStats,
} from '@/server/rate';
import { catalogRowSlug, itemSizeChips } from '@/lib/item-directory';
import { formatStorageLabel } from '@/lib/category-filters';
import type { MasterProduct } from '@repo/shared-data';
import {
  BsArrowLeftRight,
  BsArrowRight,
  BsBatteryHalf,
  BsCheckCircleFill,
  BsCpu,
  BsGraphUpArrow,
  BsHeadphones,
  BsLaptop,
  BsPhone,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsSmartwatch,
  BsStarFill,
  BsTabletLandscape,
  BsTrophy,
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
  merchantRiskTone,
} from '@/lib/merchant-risk-tone';

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
    default:
      return <BsCpu />;
  }
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
      getMasterProducts({ categorySlug: 'all', limit: 24 }),
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

  const popularHomeBattles = buildPopular1v1BattlesForCategory(
    masterProducts,
    'smartphones',
    3
  );
  const radarIndex = buildRadarIndex(dealRadar);

  const catSlugById = new Map<string, string>();
  for (const c of platformStats.categoriesWithCounts) {
    catSlugById.set(c.id, c.slug);
  }

  // RATE_ITEM_MODEL on: one grid card per Item (DOS/Rate#1155).
  const gridProducts = await groupCatalogRowsByItem(masterProducts).catch(
    () => masterProducts
  );
  const quickCompareSlugs = masterProducts
    .filter((p) =>
      getMasterProductHref(p, catSlugById).startsWith('/smartphones/')
    )
    .map((p) => p.slug)
    .slice(0, 3);

  return (
    <ClientMessages scope="home">
      <PageShell locale={locale}>
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
          className="hero-header rate-ink-on-dark position-relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(216, 48, 48, 0.16), transparent 45%), radial-gradient(circle at 80% 15%, rgba(99, 102, 241, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
            paddingTop: '4.5rem',
            paddingBottom: '5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="position-relative z-1 container">
            <div className="row justify-content-center align-items-center">
              <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                <div className="position-relative mb-4 pt-2 pb-2 text-center">
                  <div
                    className="d-inline-flex align-items-center rounded-pill small fw-semibold mb-3 gap-2 px-3 py-2"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#f8fafc',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <BsShieldCheck className="text-success" />
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
                        color: '#ff6b6b',
                      }}
                    >
                      {tRate('home.heroTitleHighlight')}
                    </span>{' '}
                    {tRate('home.heroTitleSuffix')}
                  </h1>
                  <p
                    className="fs-5 mb-0"
                    style={{
                      color: '#94a3b8',
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
                        backgroundColor: 'rgba(22, 25, 30, 0.78)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{ color: '#ff6b6b', letterSpacing: '-0.02em' }}
                      >
                        {platformStats.masterProductsCount}
                      </div>
                      <div className="small" style={{ color: '#94a3b8' }}>
                        {tRate('home.statProducts')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'rgba(22, 25, 30, 0.78)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{ color: '#38bdf8', letterSpacing: '-0.02em' }}
                      >
                        {platformStats.priceObservationsCount}
                      </div>
                      <div className="small" style={{ color: '#94a3b8' }}>
                        {tRate('home.statPricePoints')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'rgba(22, 25, 30, 0.78)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{ color: '#2dba69', letterSpacing: '-0.02em' }}
                      >
                        {platformStats.totalReviewsCount}
                      </div>
                      <div className="small" style={{ color: '#94a3b8' }}>
                        {tRate('home.statReviews')}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div
                      className="rounded-4 h-100 p-3 text-white"
                      style={{
                        backgroundColor: 'rgba(22, 25, 30, 0.78)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(12px)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div
                        className="fw-bold fs-4"
                        style={{ color: '#f8fafc', letterSpacing: '-0.02em' }}
                      >
                        {platformStats.merchantsCount}
                      </div>
                      <div className="small" style={{ color: '#94a3b8' }}>
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
              {platformStats.categoriesWithCounts.map((cat) => {
                const known = isKnownCategory(cat.slug);
                const titleId = `home-cat-${cat.slug}-title`;
                const descId = `home-cat-${cat.slug}-desc`;
                return (
                  <div key={cat.id} className="col-xl col-lg-4 col-sm-6 col-12">
                    <Link
                      href={cat.routeHref}
                      className="rate-card rate-card-interactive rate-category-card"
                      aria-labelledby={titleId}
                      aria-describedby={known ? descId : undefined}
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
                      <h3 id={titleId} className="rate-category-card-title">
                        {known ? tRate(`nav.${cat.slug}`) : cat.name}
                      </h3>
                      {isKnownCategory(cat.slug) && (
                        <p id={descId} className="rate-category-card-desc">
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
                  const rawUser = Number(
                    item.user_rating_weighted || item.average_rating || 0
                  );
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
                              {battle.scoreDelta5 > 0.005
                                ? tHome('scoreDeltaLabel', {
                                    delta: battle.scoreDelta5.toFixed(2),
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
                                ★ {battle.productA.combinedScore5.toFixed(2)}
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
                                ★ {battle.productB.combinedScore5.toFixed(2)}
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
              {dealRadar &&
                (dealRadar.genuineDeals.length > 0 ||
                  dealRadar.fakeSaleTraps.length > 0) && (
                  <div
                    className="rate-card rate-home-radar mt-4"
                    data-testid="homepage-deal-radar"
                  >
                    <div className="rate-section-head">
                      <div>
                        <span className="rate-eyebrow mb-2">
                          {tHome('radarHomeBadge')}
                        </span>
                        <h3 className="rate-home-radar-title">
                          {tHome('radarHomeAnalyzed', {
                            offers: dealRadar.totalOffersAnalyzed,
                            merchants: dealRadar.totalMerchantsAnalyzed,
                            clusters: dealRadar.totalClustersAnalyzed,
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

                    <div className="row g-4">
                      {dealRadar.genuineDeals.length > 0 && (
                        <div className="col-lg-6">
                          <h4 className="rate-radar-list-title is-good">
                            <BsGraphDownArrow aria-hidden="true" />
                            {tHome('radarGenuineTitle', {
                              count: dealRadar.genuineDeals.length,
                            })}
                          </h4>
                          <ul className="rate-radar-list">
                            {dealRadar.genuineDeals.slice(0, 3).map((g) => (
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
                                    />{' '}
                                    ·{' '}
                                    {tHome('medianPriceInline', {
                                      price:
                                        g.marketMedianPrice.toLocaleString(
                                          'vi-VN'
                                        ),
                                    })}
                                  </span>
                                </div>
                                <div className="rate-radar-item-side">
                                  <span className="rate-radar-price">
                                    {g.priceCurrent.toLocaleString('vi-VN')} ₫
                                  </span>
                                  <span className="rate-radar-tag is-good">
                                    {tHome('vsMedianPctBadge', {
                                      pct: g.savingsVsMedianPct,
                                    })}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {dealRadar.fakeSaleTraps.length > 0 && (
                        <div className="col-lg-6">
                          <h4 className="rate-radar-list-title is-bad">
                            <BsExclamationTriangle aria-hidden="true" />
                            {tHome('radarFakeTitle', {
                              count: dealRadar.fakeSaleTraps.length,
                            })}
                          </h4>
                          <ul className="rate-radar-list">
                            {dealRadar.fakeSaleTraps.slice(0, 3).map((t) => (
                              <li key={t.id}>
                                <div className="rate-radar-item-main">
                                  <Link
                                    href={t.productHref}
                                    className="text-truncate"
                                  >
                                    {t.productName}
                                  </Link>
                                  <span className="rate-radar-item-meta text-truncate">
                                    <span className="rate-radar-platform">
                                      {t.platform}
                                    </span>
                                    <ContentText
                                      text={t.merchantName}
                                      locale={locale}
                                    />{' '}
                                    · {tHome('inflatedOrigInline')}{' '}
                                    <s>
                                      {(
                                        t.priceOriginal || t.priceCurrent
                                      ).toLocaleString('vi-VN')}{' '}
                                      ₫
                                    </s>
                                  </span>
                                </div>
                                <div className="rate-radar-item-side">
                                  <span className="rate-radar-price">
                                    {t.priceCurrent.toLocaleString('vi-VN')} ₫
                                  </span>
                                  <span className="rate-radar-tag is-bad">
                                    {tHome('fakeMarkupPctBadge', {
                                      pct: t.fakeMarkupPct,
                                    })}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {Array.isArray(dealRadar.priceSpreadLeaders) &&
                      dealRadar.priceSpreadLeaders.length > 0 && (
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
                                count: dealRadar.priceSpreadLeaders.length,
                              })}
                              <BsArrowRight aria-hidden="true" />
                            </Link>
                          </div>
                          <div className="row g-2">
                            {dealRadar.priceSpreadLeaders
                              .slice(0, 3)
                              .map((s) => (
                                <div key={s.id} className="col-lg-4 col-md-6">
                                  <div className="rate-radar-spread-item">
                                    <div className="rate-radar-item-main">
                                      <Link
                                        href={s.productHref}
                                        className="text-truncate"
                                      >
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
                                        -{s.spreadVnd.toLocaleString('vi-VN')} ₫
                                      </span>
                                      <span className="rate-radar-tag is-warn">
                                        {tHome('spreadPctBadge', {
                                          pct: s.spreadPct,
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
                .map((merchant) => {
                  const tone = (risk: number) => `is-${merchantRiskTone(risk)}`;
                  const overallTone = tone(merchant.risk_score);
                  const trustLabel =
                    overallTone === 'is-good'
                      ? tHome('merchantTrustedLabel')
                      : overallTone === 'is-warn'
                        ? tHome('merchantCautionLabel')
                        : tHome('merchantHighRiskLabel');
                  const breakdown = merchant.review_risk_breakdown;
                  const totalRevAnalyzed = breakdown?.total_reviews ?? 0;
                  const flaggedRevCount =
                    (breakdown?.seeding_fake_count ?? 0) +
                    (breakdown?.coin_spam_count ?? 0) +
                    (breakdown?.sabotage_or_bombing_count ?? 0);

                  return (
                    <div key={merchant.id} className="col-lg-6 col-12">
                      <article className="rate-card rate-merchant-card">
                        <div className="rate-merchant-head">
                          <span
                            className="rate-category-card-icon"
                            aria-hidden="true"
                          >
                            <BsShop />
                          </span>
                          <div className="rate-merchant-id">
                            <h3 className="rate-merchant-name">
                              <Link href={`/merchants/${merchant.id}`}>
                                <ContentText
                                  text={merchant.name}
                                  locale={locale}
                                />
                              </Link>
                            </h3>
                            <div className="rate-merchant-meta">
                              <span className="rate-radar-platform">
                                {merchant.platform}
                              </span>
                              {tHome('shopIdLabel')} {merchant.platform_shop_id}
                              {merchant.is_official && (
                                <span className="rate-merchant-official">
                                  <BsCheckCircleFill aria-hidden="true" />
                                  {tHome('officialMallBadge')}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`rate-radar-tag ${overallTone}`}>
                            {trustLabel} · {merchant.trust_score}/100
                          </span>
                        </div>

                        <dl className="rate-merchant-metrics">
                          <div>
                            <dt>{tHome('dosafeRiskLabel')}</dt>
                            <dd className={tone(merchant.dosafe_risk_score)}>
                              {merchant.dosafe_risk_score}/100
                            </dd>
                            {merchantRiskTone(merchant.dosafe_risk_score) ===
                              'good' && (
                              <dd className="rate-merchant-note">
                                {tHome('noScamDetected')}
                              </dd>
                            )}
                          </div>
                          <div>
                            <dt>{tHome('reviewRiskLabel')}</dt>
                            {/* No analysed reviews: no number (DOS/Rate#1249). */}
                            {hasReviewRiskEvidence(breakdown) ? (
                              <>
                                <dd
                                  className={tone(merchant.review_risk_score)}
                                >
                                  {merchant.review_risk_score}/100
                                </dd>
                                <dd className="rate-merchant-note">
                                  {tHome('flaggedReviewsRatio', {
                                    flagged: flaggedRevCount,
                                    total: totalRevAnalyzed,
                                  })}
                                </dd>
                              </>
                            ) : (
                              <>
                                <dd>{tHome('reviewRiskNoData')}</dd>
                                <dd className="rate-merchant-note">
                                  {tHome('reviewRiskNoReviews')}
                                </dd>
                              </>
                            )}
                          </div>
                          <div>
                            <dt>{tHome('ratingsAndProductsLabel')}</dt>
                            <dd>
                              {merchant.rating_star != null
                                ? `★ ${merchant.rating_star.toFixed(1)} · `
                                : ''}
                              {merchant.product_count}{' '}
                              {tHome('productsShortUnit')}
                            </dd>
                            <dd className="rate-merchant-note">
                              {merchant.follower_count > 0
                                ? tHome('followersCountText', {
                                    count:
                                      merchant.follower_count.toLocaleString(
                                        'vi-VN'
                                      ),
                                  })
                                : tHome('periodicMonitoring')}
                            </dd>
                          </div>
                        </dl>

                        <div className="rate-merchant-foot">
                          {merchant.updated_at ? (
                            <span>
                              {tHome('lastUpdatedLabel')}{' '}
                              {new Date(merchant.updated_at).toLocaleDateString(
                                'vi-VN'
                              )}
                            </span>
                          ) : (
                            <span />
                          )}
                          <Link href={`/merchants/${merchant.id}`}>
                            {tRate('home.viewMerchantAuditBtn')}
                            <BsArrowRight aria-hidden="true" />
                          </Link>
                        </div>
                      </article>
                    </div>
                  );
                })}
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
                      pct: platformStats.authenticRatioPct,
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
                {platformStats.recentReviewsSample.map((rev) => {
                  const isPending = isPendingReview(rev);
                  const isFlagged =
                    !isPending &&
                    (!rev.include_in_rating ||
                      rev.flag_category !== 'authentic');
                  const confidencePct =
                    rev.fake_probability != null
                      ? Math.round((1 - Number(rev.fake_probability)) * 100)
                      : null;
                  const stars = Math.max(1, Math.min(5, rev.rating_star));

                  return (
                    <div key={rev.id} className="col-lg-4 col-md-6 col-12">
                      <article className="rate-card rate-review-card">
                        <div className="rate-review-head">
                          <div>
                            <div className="rate-review-author">
                              <ContentText
                                text={rev.author_name}
                                locale={locale}
                              />
                            </div>
                            <div
                              className="rate-review-stars"
                              role="img"
                              aria-label={tHome('starsAria', { count: stars })}
                            >
                              {Array.from({ length: stars }).map((_, idx) => (
                                <BsStarFill key={idx} aria-hidden="true" />
                              ))}
                            </div>
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
                                    pct: confidencePct,
                                  })
                                : tHome('authenticBadge')}
                            </span>
                          )}
                        </div>

                        {rev.comment?.trim() && (
                          <p
                            className="rate-review-body"
                            lang={contentLang(rev.comment, locale)}
                          >
                            &ldquo;{rev.comment.trim()}&rdquo;
                          </p>
                        )}

                        <div className="rate-review-foot">
                          <BsPhone aria-hidden="true" />
                          {rev.masterRouteHref ? (
                            <Link
                              href={rev.masterRouteHref}
                              className="text-truncate"
                            >
                              <ContentText
                                text={rev.productTitle}
                                locale={locale}
                              />
                            </Link>
                          ) : (
                            <span className="text-truncate">
                              <ContentText
                                text={rev.productTitle}
                                locale={locale}
                              />
                            </span>
                          )}
                        </div>
                      </article>
                    </div>
                  );
                })}
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
