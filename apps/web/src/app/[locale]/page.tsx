import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from './components/navbar/NavbarDarkDynamic';
import { getMasterProductHref, getMasterProducts } from '@/lib/rate-api';
import { getRateCopy } from '@/lib/rate-i18n';
import { buildPopular1v1BattlesForCategory } from '@/lib/leaderboard-engine';
import {
  getCachedMerchantsList,
  getCachedRatePlatformStats,
  getCrossPlatformDealRadar,
  type CrossPlatformDealRadarResponse,
  type MerchantSummary,
  type RatePlatformStats,
} from '@/server/rate';
import type { MasterProduct } from '@repo/shared-data';
import {
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
} from 'react-icons/bs';
import FooterTop from './components/footer-top';
import FooterDynamic from './components/footer/FooterDynamic';
import BackToTop from './components/back-to-top';
import HeroSearchInspector from '@/components/home/HeroSearchInspector';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import RadarBadge from '@/components/radar/RadarBadge';
import { buildRadarIndex, getRadarSignal } from '@/lib/deal-radar';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getRateCopy(locale);
  return {
    title: copy.seo.siteTitle,
    description: copy.seo.siteDescription,
    alternates: {
      canonical: 'https://rate.vn',
    },
  };
}

function getCategoryIcon(slug: string) {
  switch (slug) {
    case 'smartphones':
      return <BsPhone className="fs-2 text-primary" />;
    case 'laptops':
      return <BsLaptop className="fs-2 text-primary" />;
    case 'tablets':
      return <BsTabletLandscape className="fs-2 text-primary" />;
    case 'smartwatches':
      return <BsSmartwatch className="fs-2 text-primary" />;
    case 'earbuds':
      return <BsHeadphones className="fs-2 text-primary" />;
    default:
      return <BsCpu className="fs-2 text-primary" />;
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const copy = getRateCopy(locale);
  const tHome = await getTranslations({ locale, namespace: 'homePage' });

  let masterProducts: MasterProduct[] = [];
  let merchants: MerchantSummary[] = [];
  let dealRadar: CrossPlatformDealRadarResponse | null = null;
  let platformStats: RatePlatformStats = {
    masterProductsCount: 0,
    listingsCount: 0,
    merchantsCount: 0,
    priceObservationsCount: 0,
    totalReviewsCount: 0,
    authenticReviewsCount: 0,
    filteredSeedingCount: 0,
    authenticRatioPct: 100,
    categoriesWithCounts: [],
    recentReviewsSample: [],
  };

  try {
    const [productsRes, merchantsRes, statsRes, radarRes] = await Promise.all([
      getMasterProducts({ categorySlug: 'all', limit: 24 }),
      getCachedMerchantsList(),
      getCachedRatePlatformStats(),
      getCrossPlatformDealRadar({ categorySlug: 'all', limit: 50 }),
    ]);
    masterProducts = productsRes;
    merchants = merchantsRes;
    platformStats = statsRes;
    dealRadar = radarRes;
  } catch (err) {
    console.error(
      'Error fetching homepage data from Supabase rate schema:',
      err
    );
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

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      {/* Hero Section with Interactive Autocomplete & E-commerce Link Inspector (DESIGN.md v2.0 Dark Obsidian + DOS Crimson Glow) */}
      <div
        className="hero-header position-relative overflow-hidden"
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
                  <span>{copy.home.heroBadge}</span>
                </div>
                <h1
                  className="fw-bold mb-3 text-white"
                  style={{
                    fontSize: 'clamp(2rem, 4.2vw, 3.25rem)',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                  }}
                >
                  {copy.home.heroTitlePrefix}{' '}
                  <span
                    className="rounded-3 d-inline-block px-3 py-1"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(216, 48, 48, 0.22), rgba(225, 29, 72, 0.12))',
                      border: '1px solid rgba(216, 48, 48, 0.45)',
                      color: '#ff6b6b',
                    }}
                  >
                    {copy.home.heroTitleHighlight}
                  </span>{' '}
                  {copy.home.heroTitleSuffix}
                </h1>
                <p
                  className="fs-5 mb-0"
                  style={{
                    color: '#94a3b8',
                    maxWidth: '780px',
                    margin: '0 auto',
                  }}
                >
                  {copy.home.heroSubtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="row justify-content-center align-items-center">
            <div className="col-xl-9 col-lg-10 col-md-12 col-sm-12">
              <HeroSearchInspector
                initialProducts={masterProducts}
                initialMerchants={merchants}
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
                      {copy.home.statProducts}
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
                      {copy.home.statPricePoints}
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
                      {copy.home.statReviews}
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
                      {copy.home.statMerchants}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Live Categories from rate.categories */}
      <section className="py-5 pb-4" id="mains">
        <div className="container">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-end mb-4 gap-3">
            <div>
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                {copy.home.catBadge}
              </span>
              <h3 className="sectionHeading mb-1">
                {copy.home.catTitlePrefix}{' '}
                <span className="text-primary">
                  {copy.home.catTitleHighlight}
                </span>
              </h3>
              <p className="text-muted mb-0">{copy.home.catSubtitle}</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link
                href="/smartphones"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                📱 {copy.nav.smartphones}
              </Link>
              <Link
                href="/laptops"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                💻 {copy.nav.laptops}
              </Link>
              <Link
                href="/tablets"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                📟 {copy.nav.tablets}
              </Link>
              <Link
                href="/smartwatches"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                ⌚ {copy.nav.smartwatches}
              </Link>
              <Link
                href="/earbuds"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                🎧 {copy.nav.earbuds}
              </Link>
              <Link
                href="/inspect"
                className="btn btn-sm btn-outline-danger rounded-pill px-3"
              >
                🔍 {copy.nav.inspect}
              </Link>
              <Link
                href="/merchants"
                className="btn btn-sm btn-outline-dark rounded-pill px-3"
              >
                🏪 {copy.nav.merchants}
              </Link>
            </div>
          </div>

          <div className="row g-3">
            {platformStats.categoriesWithCounts.map((cat) => (
              <div key={cat.id} className="col-xl col-lg-4 col-md-6 col-12">
                <Link href={cat.routeHref} className="text-decoration-none">
                  <div className="card rounded-4 hover-shadow h-100 border bg-white p-3 shadow-sm transition">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div className="rounded-3 bg-primary bg-opacity-10 d-inline-flex align-items-center justify-content-center p-3">
                        {getCategoryIcon(cat.slug)}
                      </div>
                      <span
                        className={`badge rounded-pill px-3 py-2 ${
                          cat.productCount > 0
                            ? 'bg-success bg-opacity-10 text-success border-success border-opacity-25 border'
                            : 'bg-secondary bg-opacity-10 text-secondary'
                        }`}
                      >
                        {cat.productCount > 0
                          ? `${cat.productCount} ${copy.home.catReadySuffix}`
                          : copy.home.catExpanding}
                      </span>
                    </div>
                    <h5 className="fw-bold text-dark mb-1">
                      {cat.slug === 'smartphones' ||
                      cat.slug === 'laptops' ||
                      cat.slug === 'tablets' ||
                      cat.slug === 'smartwatches' ||
                      cat.slug === 'earbuds'
                        ? copy.nav[cat.slug]
                        : cat.name}
                    </h5>
                    <p className="text-muted small mb-0">
                      {cat.slug === 'smartphones' &&
                        tHome('catDescSmartphones')}
                      {cat.slug === 'laptops' && tHome('catDescLaptops')}
                      {cat.slug === 'tablets' && tHome('catDescTablets')}
                      {cat.slug === 'smartwatches' &&
                        tHome('catDescSmartwatches')}
                      {cat.slug === 'earbuds' && tHome('catDescEarbuds')}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Featured Master Products from rate.master_products */}
      {masterProducts.length > 0 && (
        <section className="border-top border-bottom bg-white py-5">
          <div className="container">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
              <div>
                <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                  {copy.home.featuredBadge}
                </span>
                <h3 className="sectionHeading mb-1">
                  {copy.home.featuredTitlePrefix}{' '}
                  <span className="text-primary">
                    {copy.home.featuredTitleHighlight}
                  </span>
                </h3>
                <p className="text-muted mb-0">{copy.home.featuredSubtitle}</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/smartphones"
                  className="btn btn-outline-primary rounded-pill fw-medium px-3 py-2"
                >
                  {copy.home.viewAllCatalog} (
                  {platformStats.masterProductsCount}) →
                </Link>
                {masterProducts.length >= 2 && (
                  <Link
                    href={`/compare?cat=smartphones&slugs=${masterProducts
                      .filter((p) =>
                        getMasterProductHref(p, catSlugById).startsWith(
                          '/smartphones/'
                        )
                      )
                      .map((p) => p.slug)
                      .slice(0, 3)
                      .join(',')}`}
                    className="btn btn-primary rounded-pill fw-medium px-3 py-2"
                  >
                    {copy.home.compareSpecsBtn} (3)
                  </Link>
                )}
              </div>
            </div>

            <div className="row g-4">
              {masterProducts.slice(0, 6).map((item) => {
                const minPrice = Number(item.min_price).toLocaleString('vi-VN');
                const maxPrice = Number(item.max_price).toLocaleString('vi-VN');
                const priceText =
                  item.min_price === item.max_price
                    ? `${minPrice} ₫`
                    : `${minPrice} ₫ - ${maxPrice} ₫`;
                const thumb =
                  item.thumbnail ||
                  (item.images && item.images.length > 0
                    ? item.images[0]
                    : '/img/placeholder.png');
                const keySpecs = item.key_specs || {};
                const productHref = getMasterProductHref(item, catSlugById);
                const rawUser = Number(
                  item.user_rating_weighted || item.average_rating || 0
                );
                const userScore = rawUser > 0 ? rawUser : null;
                const expertScore =
                  item.expert_rating != null && Number(item.expert_rating) > 0
                    ? Number(item.expert_rating)
                    : null;
                const authCount = Number(
                  item.authentic_review_count || item.total_reviews || 0
                );

                return (
                  <div key={item.id} className="col-lg-4 col-md-6 col-12">
                    <div className="rate-card rounded-4 d-flex flex-column h-100 border bg-white p-3 shadow-sm transition">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex flex-wrap gap-1">
                          <span className="badge bg-secondary bg-opacity-10 text-secondary">
                            {item.brand}
                          </span>
                          {item.ram_gb ? (
                            <span className="rate-spec-pill">
                              {item.ram_gb}GB RAM
                            </span>
                          ) : null}
                          {item.storage_gb ? (
                            <span className="rate-spec-pill">
                              {item.storage_gb}GB
                            </span>
                          ) : null}
                        </div>
                        <CompareQuickToggle
                          item={{
                            slug: item.slug,
                            name: item.name,
                            brand: item.brand,
                            thumbnail: thumb ?? null,
                            min_price: Number(item.min_price),
                            categoryPath:
                              productHref.replace(`/${item.slug}`, '') ||
                              '/smartphones',
                          }}
                        />
                      </div>

                      <div
                        className="d-flex justify-content-center align-items-center bg-light rounded-3 mb-3 p-3"
                        style={{ minHeight: '195px' }}
                      >
                        <img
                          src={thumb}
                          alt={item.name}
                          className="img-fluid object-fit-contain rounded"
                          style={{ maxHeight: '165px' }}
                        />
                      </div>

                      <h5 className="fw-bold mb-2">
                        <Link
                          href={productHref}
                          className="text-dark text-decoration-none"
                        >
                          {item.name}
                        </Link>
                      </h5>

                      {/* #1 Core Focus: JReviews Dual Rating Badges + Product Deal Radar */}
                      <div className="d-flex align-items-center mb-2 flex-wrap gap-1">
                        <span className="rate-score-badge-user">
                          ★{' '}
                          {userScore != null
                            ? `${userScore.toFixed(1)} User (${authCount})`
                            : tHome('userNoScore')}
                        </span>
                        <span className="rate-score-badge-expert">
                          🔬{' '}
                          {expertScore != null
                            ? `${expertScore.toFixed(1)} Expert`
                            : tHome('expertNoScore')}
                        </span>
                        <RadarBadge
                          signal={getRadarSignal(radarIndex, item.slug)}
                        />
                      </div>

                      {/* Quick Key Specs pills */}
                      <div className="d-flex mb-3 flex-wrap gap-1">
                        {keySpecs.screen && (
                          <span className="rate-spec-pill">
                            📱 {String(keySpecs.screen)}
                          </span>
                        )}
                        {keySpecs.chip && (
                          <span className="rate-spec-pill">
                            ⚙️ {String(keySpecs.chip)}
                          </span>
                        )}
                        {keySpecs.battery && (
                          <span className="rate-spec-pill">
                            🔋 {String(keySpecs.battery)}
                          </span>
                        )}
                      </div>

                      <div className="d-flex justify-content-between align-items-center text-muted small border-top mt-auto pt-3">
                        <span>
                          {tHome('refPriceLabel')}{' '}
                          <strong className="text-dark font-monospace">
                            {priceText}
                          </strong>
                        </span>
                        <span>
                          {tHome('sourcesCount', {
                            count: item.merchant_count || 0,
                          })}
                        </span>
                      </div>
                      <div className="d-flex mt-3 gap-2">
                        <Link
                          href={productHref}
                          className="btn btn-primary rounded-pill fw-medium flex-grow-1"
                        >
                          {tHome('viewReviewsAndSpecsBtn')}
                        </Link>
                        <Link
                          href={`/inspect?q=${encodeURIComponent(item.slug)}`}
                          className="btn btn-outline-secondary rounded-pill fw-medium px-3"
                          title={tHome('inspectPriceHistoryTitle')}
                        >
                          🔍
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section 2.5: Popular 1v1 Head-to-Head Flagship Showdowns (#58) */}
            {popularHomeBattles.length > 0 && (
              <div className="rate-scoreboard-dark rounded-4 p-md-4 mt-5 p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <span className="badge bg-danger rounded-pill fw-semibold mb-1 px-3 py-1">
                      {tHome('popularBattlesBadge')}
                    </span>
                    <h4 className="h5 fw-bold mb-0 text-white">
                      {tHome('popularBattlesTitle')}
                    </h4>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Link
                      href="/leaderboard"
                      className="btn btn-sm btn-outline-warning rounded-pill px-3"
                    >
                      {tHome('leaderboard5CatsBtn')}
                    </Link>
                    <Link
                      href="/compare"
                      className="btn btn-sm btn-outline-light rounded-pill px-3"
                    >
                      {tHome('compare10GroupsBtn')}
                    </Link>
                  </div>
                </div>

                <div className="row g-3">
                  {popularHomeBattles.map((battle) => (
                    <div key={battle.versusSlug} className="col-lg-4 col-md-6">
                      <div
                        className="rounded-4 d-flex flex-column justify-content-between h-100 p-3"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.12)',
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="badge bg-warning text-dark rounded-pill small fw-bold">
                            #{battle.productA.rank} vs #{battle.productB.rank}
                          </span>
                          <span className="small text-white-50 font-monospace">
                            {tHome('scoreDeltaLabel', {
                              delta: battle.scoreDelta5.toFixed(2),
                            })}
                          </span>
                        </div>

                        <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                          <div className="overflow-hidden">
                            <div className="small fw-bold text-truncate text-white">
                              {battle.productA.name}
                            </div>
                            <div className="small text-warning font-monospace">
                              ★ {battle.productA.combinedScore5.toFixed(2)}/5.0
                            </div>
                          </div>
                          <span className="badge bg-danger rounded-pill flex-shrink-0">
                            VS
                          </span>
                          <div className="overflow-hidden text-end">
                            <div className="small fw-bold text-truncate text-white">
                              {battle.productB.name}
                            </div>
                            <div className="small text-warning font-monospace">
                              ★ {battle.productB.combinedScore5.toFixed(2)}/5.0
                            </div>
                          </div>
                        </div>

                        <div className="border-top border-secondary border-opacity-25 mt-2 pt-2 text-end">
                          <Link
                            href={battle.versusHref}
                            className="btn btn-sm btn-danger rounded-pill fw-semibold w-100"
                          >
                            {tHome('view1v1ScoreBtn')}
                          </Link>
                        </div>
                      </div>
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
                  className="rate-card p-md-4 mt-4 p-3"
                  data-testid="homepage-deal-radar"
                >
                  <div className="d-flex justify-content-between align-items-center border-bottom mb-3 flex-wrap gap-2 pb-3">
                    <div>
                      <span className="badge bg-dark rounded-pill text-warning me-2">
                        {tHome('radarHomeBadge')}
                      </span>
                      <strong className="text-dark">
                        {tHome('radarHomeAnalyzed', {
                          offers: dealRadar.totalOffersAnalyzed,
                          clusters: dealRadar.totalClustersAnalyzed,
                        })}
                      </strong>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <Link
                        href="/deals"
                        className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                      >
                        {tHome('radarHomeDealHubBtn')}
                      </Link>
                      <Link
                        href="/inspect"
                        className="btn btn-sm btn-outline-dark rounded-pill px-3"
                      >
                        {tHome('radarHomeInspectBtn')}
                      </Link>
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-lg-6">
                      <div className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 h-100 border p-3">
                        <div className="fw-bold text-success mb-2">
                          {tHome('radarGenuineTitle', {
                            count: dealRadar.genuineDeals.length,
                          })}
                        </div>
                        <div className="d-flex flex-column gap-2">
                          {dealRadar.genuineDeals.slice(0, 3).map((g) => (
                            <div
                              key={g.id}
                              className="rounded-3 d-flex justify-content-between align-items-center border bg-white p-2"
                            >
                              <div className="overflow-hidden pe-2">
                                <Link
                                  href={g.productHref}
                                  className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                                >
                                  {g.productName}
                                </Link>
                                <div className="text-secondary small">
                                  <span className="badge bg-dark text-uppercase me-1">
                                    {g.platform}
                                  </span>
                                  {g.merchantName} •{' '}
                                  {tHome('medianPriceInline', {
                                    price:
                                      g.marketMedianPrice.toLocaleString(
                                        'vi-VN'
                                      ),
                                  })}
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-end">
                                <div className="fw-bold text-success font-monospace small">
                                  {g.priceCurrent.toLocaleString('vi-VN')} ₫
                                </div>
                                <span className="badge bg-success rounded-pill">
                                  {tHome('vsMedianPctBadge', {
                                    pct: g.savingsVsMedianPct,
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="rounded-3 border-danger-subtle bg-danger-subtle bg-opacity-10 h-100 border p-3">
                        <div className="fw-bold text-danger mb-2">
                          {tHome('radarFakeTitle', {
                            count: dealRadar.fakeSaleTraps.length,
                          })}
                        </div>
                        <div className="d-flex flex-column gap-2">
                          {dealRadar.fakeSaleTraps.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              className="rounded-3 d-flex justify-content-between align-items-center border bg-white p-2"
                            >
                              <div className="overflow-hidden pe-2">
                                <Link
                                  href={t.productHref}
                                  className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                                >
                                  {t.productName}
                                </Link>
                                <div className="text-secondary small">
                                  <span className="badge bg-secondary text-uppercase me-1">
                                    {t.platform}
                                  </span>
                                  {t.merchantName} •{' '}
                                  {tHome('inflatedOrigInline')}{' '}
                                  <span className="text-decoration-line-through">
                                    {(
                                      t.priceOriginal || t.priceCurrent
                                    ).toLocaleString('vi-VN')}{' '}
                                    ₫
                                  </span>
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-end">
                                <div className="fw-bold text-danger font-monospace small">
                                  {t.priceCurrent.toLocaleString('vi-VN')} ₫
                                </div>
                                <span className="badge bg-danger rounded-pill">
                                  {tHome('fakeMarkupPctBadge', {
                                    pct: t.fakeMarkupPct,
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {Array.isArray(dealRadar.priceSpreadLeaders) &&
                    dealRadar.priceSpreadLeaders.length > 0 && (
                      <div
                        data-testid="homepage-price-spread-leaders"
                        className="rounded-3 bg-light mt-3 border p-3"
                      >
                        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                          <div className="fw-bold text-dark small">
                            {tHome('spreadLeadersTitle')}
                          </div>
                          <Link
                            href="/deals"
                            className="small fw-semibold text-danger text-decoration-none"
                          >
                            {tHome('viewAllSpreadBtn', {
                              count: dealRadar.priceSpreadLeaders.length,
                            })}
                          </Link>
                        </div>
                        <div className="row g-2">
                          {dealRadar.priceSpreadLeaders.slice(0, 3).map((s) => (
                            <div key={s.id} className="col-lg-4 col-md-6">
                              <div className="rounded-3 d-flex justify-content-between align-items-center h-100 border bg-white p-2">
                                <div className="overflow-hidden pe-2">
                                  <Link
                                    href={s.productHref}
                                    className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                                  >
                                    {s.productName}
                                  </Link>
                                  <div className="text-secondary small">
                                    <span className="badge bg-success text-uppercase me-1">
                                      {s.cheapestPlatform}
                                    </span>
                                    vs{' '}
                                    <span className="badge bg-secondary text-uppercase">
                                      {s.priciestPlatform}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 text-end">
                                  <div className="fw-bold text-success font-monospace small">
                                    -{s.spreadVnd.toLocaleString('vi-VN')} ₫
                                  </div>
                                  <span className="badge bg-warning text-dark rounded-pill">
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
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
            <div>
              <span className="badge bg-success bg-opacity-10 text-success rounded-pill fw-semibold mb-2 px-3 py-2">
                {copy.home.merchantBadge}
              </span>
              <h3 className="sectionHeading mb-1">
                {copy.home.merchantTitlePrefix}{' '}
                <span className="text-primary">
                  {copy.home.merchantTitleHighlight}
                </span>
              </h3>
              <p className="text-muted mb-0">{copy.home.merchantSubtitle}</p>
            </div>
            <div>
              <Link
                href="/merchants"
                className="btn btn-outline-primary rounded-pill fw-medium px-4 py-2"
              >
                {copy.home.viewAllMerchants} ({platformStats.merchantsCount}) →
              </Link>
            </div>
          </div>

          <div className="row g-4">
            {merchants.map((merchant) => {
              const isTrusted = merchant.risk_score < 20;
              const isCaution =
                merchant.risk_score >= 20 && merchant.risk_score < 50;
              const badgeClass = isTrusted
                ? 'bg-success bg-opacity-10 text-success border-success'
                : isCaution
                  ? 'bg-warning bg-opacity-10 text-warning border-warning'
                  : 'bg-danger bg-opacity-10 text-danger border-danger';
              const trustLabel = isTrusted
                ? tHome('merchantTrustedLabel')
                : isCaution
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
                  <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                    <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold fs-4"
                          style={{ width: '54px', height: '54px' }}
                        >
                          <BsShop />
                        </div>
                        <div>
                          <div className="d-flex align-items-center flex-wrap gap-2">
                            <h5 className="fw-bold mb-0">
                              <Link
                                href={`/merchants/${merchant.id}`}
                                className="text-dark text-decoration-none"
                              >
                                {merchant.name}
                              </Link>
                            </h5>
                            {merchant.is_official && (
                              <span className="badge bg-danger rounded-pill small px-2 py-1 text-white">
                                <BsCheckCircleFill className="me-1" />
                                Official Mall
                              </span>
                            )}
                          </div>
                          <div className="text-muted small mt-1">
                            {tHome('platformLabel')}{' '}
                            <span className="text-uppercase fw-semibold text-dark">
                              {merchant.platform}
                            </span>{' '}
                            • {tHome('shopIdLabel')}{' '}
                            <code>{merchant.platform_shop_id}</code>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`badge rounded-pill fw-semibold border px-3 py-2 ${badgeClass}`}
                      >
                        🛡️ {trustLabel} (Trust: {merchant.trust_score}/100)
                      </span>
                    </div>

                    <div className="row g-2 mb-3">
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            DOSafe Threat Risk
                          </div>
                          <div className="fw-bold text-success">
                            {merchant.dosafe_risk_score}/100
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            {tHome('noScamDetected')}
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            AI Review Seeding Risk
                          </div>
                          <div className="fw-bold text-primary">
                            {merchant.review_risk_score}/100
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            {tHome('flaggedReviewsRatio', {
                              flagged: flaggedRevCount,
                              total: totalRevAnalyzed,
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            {tHome('ratingsAndProductsLabel')}
                          </div>
                          <div className="fw-bold text-dark">
                            ⭐ {(merchant.rating_star ?? 5).toFixed(1)} •{' '}
                            {merchant.product_count}{' '}
                            {tHome('productsShortUnit')}
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            {merchant.follower_count > 0
                              ? tHome('followersCountText', {
                                  count:
                                    merchant.follower_count.toLocaleString(
                                      'vi-VN'
                                    ),
                                })
                              : tHome('periodicMonitoring')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center border-top pt-2">
                      <span className="small text-muted">
                        {tHome('lastUpdatedLabel')}{' '}
                        {merchant.updated_at
                          ? new Date(merchant.updated_at).toLocaleDateString(
                              'vi-VN'
                            )
                          : '14/10/2026'}
                      </span>
                      <Link
                        href={`/merchants/${merchant.id}`}
                        className="btn btn-sm btn-primary rounded-pill fw-medium px-3"
                      >
                        {copy.home.viewMerchantAuditBtn}
                      </Link>
                    </div>
                  </div>
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
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
              <div>
                <span className="badge bg-info bg-opacity-10 text-info rounded-pill fw-semibold mb-2 px-3 py-2">
                  {copy.home.reviewsBadge}
                </span>
                <h3 className="sectionHeading mb-1">
                  {copy.home.reviewsTitlePrefix}{' '}
                  <span className="text-primary">
                    {copy.home.reviewsTitleHighlight}
                  </span>
                </h3>
                <p className="text-muted mb-0">{copy.home.reviewsSubtitle}</p>
              </div>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-3 py-2">
                  {tHome('authenticReviewsStatBadge', {
                    count: platformStats.authenticReviewsCount,
                    pct: platformStats.authenticRatioPct,
                  })}
                </span>
                {platformStats.filteredSeedingCount > 0 && (
                  <span className="badge bg-warning bg-opacity-10 text-warning rounded-pill px-3 py-2">
                    {tHome('filteredSeedingStatBadge', {
                      count: platformStats.filteredSeedingCount,
                    })}
                  </span>
                )}
              </div>
            </div>

            <div className="row g-4">
              {platformStats.recentReviewsSample.map((rev) => {
                const isFlagged =
                  !rev.include_in_rating || rev.flag_category !== 'authentic';
                const confidencePct =
                  rev.fake_probability != null
                    ? Math.round((1 - Number(rev.fake_probability)) * 100)
                    : 95;

                return (
                  <div key={rev.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card rounded-4 d-flex flex-column h-100 border bg-white p-3 shadow-sm">
                      <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <div>
                          <div className="fw-bold text-dark">
                            {rev.author_name}
                          </div>
                          <div className="d-flex align-items-center text-warning small gap-1">
                            {Array.from({
                              length: Math.max(1, Math.min(5, rev.rating_star)),
                            }).map((_, idx) => (
                              <BsStarFill key={idx} />
                            ))}
                          </div>
                        </div>
                        {isFlagged ? (
                          <span className="badge bg-warning bg-opacity-10 text-warning border-warning rounded-pill small border px-2 py-1">
                            <BsShieldExclamation className="me-1" />
                            {rev.flag_category === 'low_value_coin_spam'
                              ? tHome('coinSpamBadge')
                              : tHome('suspectedSeedingBadge')}
                          </span>
                        ) : (
                          <span className="badge bg-success bg-opacity-10 text-success border-success rounded-pill small border px-2 py-1">
                            <BsCheckCircleFill className="me-1" />
                            {tHome('authenticConfidenceBadge', {
                              pct: confidencePct,
                            })}
                          </span>
                        )}
                      </div>

                      <p
                        className="text-secondary small mb-3 flex-grow-1"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        &ldquo;{rev.comment}&rdquo;
                      </p>

                      <div className="border-top d-flex justify-content-between align-items-center small mt-auto pt-2">
                        {rev.masterRouteHref ? (
                          <Link
                            href={rev.masterRouteHref}
                            className="text-primary fw-semibold text-decoration-none text-truncate"
                            style={{ maxWidth: '70%' }}
                          >
                            📱 {rev.productTitle}
                          </Link>
                        ) : (
                          <span
                            className="text-muted text-truncate"
                            style={{ maxWidth: '70%' }}
                          >
                            📱 {rev.productTitle}
                          </span>
                        )}
                        <span className="text-muted">Shopee Mall</span>
                      </div>
                    </div>
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
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                {copy.home.whyBadge}
              </span>
              <h3 className="sectionHeading mb-2">
                {copy.home.whyTitlePrefix}{' '}
                <span className="text-primary">
                  {copy.home.whyTitleHighlight}
                </span>
                ?
              </h3>
              <p className="text-muted mb-0">{copy.home.whySubtitle}</p>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-4 col-md-6 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-primary bg-opacity-10 text-primary d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsCpu className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">{tHome('whyCard1Title')}</h5>
                <p className="text-muted small mb-3">{tHome('whyCard1Desc')}</p>
                <Link
                  href="/compare"
                  className="text-primary small fw-semibold text-decoration-none mt-auto"
                >
                  {tHome('whyCard1Link')}
                </Link>
              </div>
            </div>

            <div className="col-lg-4 col-md-6 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-success bg-opacity-10 text-success d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsGraphUpArrow className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">{tHome('whyCard2Title')}</h5>
                <p className="text-muted small mb-3">{tHome('whyCard2Desc')}</p>
                <Link
                  href="/smartphones"
                  className="text-success small fw-semibold text-decoration-none mt-auto"
                >
                  {tHome('whyCard2Link')}
                </Link>
              </div>
            </div>

            <div className="col-lg-4 col-md-12 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsShieldCheck className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">{tHome('whyCard3Title')}</h5>
                <p className="text-muted small mb-3">{tHome('whyCard3Desc')}</p>
                <Link
                  href="/merchants"
                  className="text-warning small fw-semibold text-decoration-none mt-auto"
                >
                  {tHome('whyCard3Link')}
                </Link>
              </div>
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
