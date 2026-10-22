import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BsArrowLeftRight,
  BsSearch,
  BsShieldCheck,
  BsTrophy,
} from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  getCachedMasterProducts,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import {
  getMasterProductHref,
  type CanonicalCategorySlug,
} from '@/lib/rate-api';
import { normalizeRateLocale, type SupportedRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph } from '@/lib/seo';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import LeaderboardExplorer from '@/components/leaderboard/LeaderboardExplorer';
import ClientMessages from '@/components/providers/ClientMessages';

// Cached: the page renders the default tab, and LeaderboardExplorer applies
// ?cat= / ?criterion= in the browser, so no request data is read here
// (DOS/Rate#508).
export const revalidate = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://rate.vn'
).replace(/\/$/, '');

interface PageProps {
  params: Promise<{ locale: string }>;
}

const VALID_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const resolvedLocale: SupportedRateLocale = normalizeRateLocale(locale);
  const t = await getTranslations({
    locale: resolvedLocale,
    namespace: 'leaderboard',
  });
  const siteUrl = SITE_URL;
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/leaderboard`,
    },
    openGraph: {
      ...defaultOpenGraph(resolvedLocale),
      title,
      description,
      url: `${siteUrl}/leaderboard`,
    },
  };
}

export default async function LeaderboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const resolvedLocale: SupportedRateLocale = normalizeRateLocale(locale);
  const t = await getTranslations({
    locale: resolvedLocale,
    namespace: 'leaderboard',
  });
  const siteUrl = SITE_URL;

  // The 100 best-rated models of each category: one global top 100 could
  // leave a whole category out of its own leaderboard tab (DOS/Rate#473).
  const [productsByCategory, dealRadar] = await Promise.all([
    Promise.all(
      [...VALID_CATEGORIES].map((categorySlug) =>
        getCachedMasterProducts({
          categorySlug,
          limit: 100,
          sort: 'rating_desc',
        })
      )
    ),
    // No fallback: the page is cached, so a null radar would be served for
    // the whole revalidate window (DOS/Rate#491).
    getCrossPlatformDealRadar({
      categorySlug: 'all',
      limit: 36,
    }),
  ]);
  // Back in one best-rated-first list (same key as search_master_products'
  // rating_desc), so the top 15 in the ItemList below stay platform-wide.
  const ratingOf = (p: (typeof productsByCategory)[number][number]) =>
    Number(p.user_rating_weighted || 0) || Number(p.average_rating || 0);
  const products = productsByCategory
    .flat()
    .sort((a, b) => ratingOf(b) - ratingOf(a));

  const copy = {
    kicker: t('kicker'),
    title: t('title'),
    subtitle: t('subtitle'),
    home: t('home'),
    breadcrumb: t('breadcrumb'),
    compareCta: t('compareCta'),
    inspectCta: t('inspectCta'),
    statProducts: t('statProducts'),
    statCategories: t('statCategories'),
    statCriteria: t('statCriteria'),
    statZeroBias: t('statZeroBias'),
  };

  // Build Schema.org ItemList JSON-LD for Top 15 Ranked Master Products
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: copy.title,
    description: copy.subtitle,
    numberOfItems: Math.min(products.length, 15),
    itemListElement: products.slice(0, 15).map((p, index) => {
      const ratingVal =
        Number(p.expert_rating || 0) > 0
          ? Number(p.expert_rating)
          : Number(p.user_rating_weighted || p.average_rating || 0) * 2;
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          brand: { '@type': 'Brand', name: p.brand },
          url: `${siteUrl}${getMasterProductHref(p)}`,
          // Unrated products get no aggregateRating instead of an invented score.
          ...(ratingVal > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: Number(ratingVal.toFixed(1)),
                  bestRating: 10,
                  worstRating: 1,
                  ratingCount: Math.max(p.total_reviews || 1, 1),
                },
              }
            : {}),
        },
      };
    }),
  };

  return (
    <ClientMessages scope="leaderboard">
      <>
        <NavbarDarkDynamic links={[]} />
        <main
          style={{
            background: '#f8fafc',
            minHeight: '100vh',
            paddingBottom: '72px',
          }}
        >
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c'),
            }}
          />

          {/* DESIGN.md v3.0 Dark Obsidian Hero */}
          <section
            className="rate-ink-on-dark"
            style={{
              background:
                'linear-gradient(135deg, #0b0d10 0%, #12151a 60%, #191d24 100%)',
              color: '#f8fafc',
              padding: '40px 0 36px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="container">
              <nav aria-label="breadcrumb" className="mb-3">
                <ol
                  className="breadcrumb mb-0"
                  style={{ fontSize: '13px', background: 'transparent' }}
                >
                  <li className="breadcrumb-item">
                    <Link
                      href="/"
                      className="text-decoration-none"
                      style={{ color: '#94a3b8' }}
                    >
                      {copy.home}
                    </Link>
                  </li>
                  <li
                    className="breadcrumb-item active"
                    aria-current="page"
                    style={{ color: '#f8fafc', fontWeight: 600 }}
                  >
                    {copy.breadcrumb}
                  </li>
                </ol>
              </nav>

              <div className="row align-items-center g-4">
                <div className="col-lg-8">
                  <div
                    className="rate-hero-kicker d-inline-flex align-items-center rounded-pill mb-3 gap-2 px-3 py-1"
                    style={{
                      background: 'rgba(216, 48, 48, 0.14)',
                      border: '1px solid rgba(216, 48, 48, 0.35)',
                      color: '#ff6b66',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                    }}
                  >
                    <BsTrophy aria-hidden="true" />
                    <span>{copy.kicker}</span>
                  </div>

                  <h1
                    className="fw-bold mb-2"
                    style={{
                      fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                      letterSpacing: '-0.02em',
                      color: '#ffffff',
                    }}
                  >
                    {copy.title}
                  </h1>
                  <p
                    className="mb-0"
                    style={{
                      color: '#94a3b8',
                      fontSize: '15px',
                      maxWidth: '740px',
                      lineHeight: 1.6,
                    }}
                  >
                    {copy.subtitle}
                  </p>
                </div>

                <div className="col-lg-4">
                  <div
                    className="rounded-4 p-3"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div className="row g-2 mb-3 text-center">
                      <div className="col-4">
                        <div
                          className="fw-bold"
                          style={{
                            fontSize: '20px',
                            color: '#38bdf8',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {products.length}
                        </div>
                        <div
                          style={{ fontSize: '0.8125rem', color: '#94a3b8' }}
                        >
                          {copy.statProducts}
                        </div>
                      </div>
                      <div className="col-4">
                        <div
                          className="fw-bold"
                          style={{
                            fontSize: '20px',
                            color: '#34d399',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          5
                        </div>
                        <div
                          style={{ fontSize: '0.8125rem', color: '#94a3b8' }}
                        >
                          {copy.statCategories}
                        </div>
                      </div>
                      <div className="col-4">
                        <div
                          className="fw-bold"
                          style={{
                            fontSize: '20px',
                            color: '#fbbf24',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          8
                        </div>
                        <div
                          style={{ fontSize: '0.8125rem', color: '#94a3b8' }}
                        >
                          {copy.statCriteria}
                        </div>
                      </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center border-top border-secondary border-opacity-25 flex-wrap gap-2 pt-2">
                      <span
                        className="badge rounded-pill"
                        style={{
                          background: 'rgba(45, 186, 105, 0.15)',
                          color: '#34d399',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <BsShieldCheck aria-hidden="true" className="me-1" />
                        {copy.statZeroBias}
                      </span>
                      <div className="d-flex gap-2">
                        <Link
                          href="/compare"
                          className="btn btn-sm btn-outline-light rounded-pill px-3"
                          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                          <BsArrowLeftRight
                            aria-hidden="true"
                            className="me-1"
                          />
                          {copy.compareCta}
                        </Link>
                        <Link
                          href="/inspect"
                          className="btn btn-sm rounded-pill px-3"
                          style={{
                            background: '#d83030',
                            color: '#ffffff',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                          }}
                        >
                          <BsSearch aria-hidden="true" className="me-1" />
                          {copy.inspectCta}
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Main Interactive 4-Tier Leaderboard Explorer */}
          <section className="container mt-4">
            <LeaderboardExplorer
              products={products}
              dealRadar={dealRadar}
              locale={resolvedLocale}
            />
          </section>
        </main>

        <CompareTrayBar />
        <FooterTop locale={locale} />
        <FooterDynamic sections={[]} links={[]} locale={locale} />
        <BackToTop />
      </>
    </ClientMessages>
  );
}
