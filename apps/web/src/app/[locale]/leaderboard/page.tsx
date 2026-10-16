import React from 'react';
import type { Metadata } from 'next';
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
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import LeaderboardExplorer, {
  type LeaderboardCriterionKey,
} from '@/components/leaderboard/LeaderboardExplorer';

export const revalidate = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://rate.vn'
).replace(/\/$/, '');

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cat?: string;
    criterion?: string;
    brand?: string;
    price?: string;
    q?: string;
  }>;
}

const VALID_CRITERIA = new Set<LeaderboardCriterionKey>([
  'combined',
  'user',
  'expert',
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
]);

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
  const siteUrl = SITE_URL;

  const titleByLocale: Record<SupportedRateLocale, string> = {
    vi: 'Bảng Xếp Hạng Thiết Bị Công Nghệ (JReviews 10.0) | Rate.vn',
    en: 'Tech Device Leaderboard (JReviews 10.0 Dual-Rating) | Rate.vn',
    cs: 'Žebříček Technologií (JReviews 10.0 Dual-Rating) | Rate.vn',
  };

  const descByLocale: Record<SupportedRateLocale, string> = {
    vi: 'Bảng xếp hạng độc lập theo cấu trúc 4 tầng (Directory -> Category -> Master Product -> Listing). Chấm điểm kép Chuyên gia & Người dùng thật kèm 5 tiêu chí kỹ thuật độc lập, không bị thao túng bởi quảng cáo hay Affiliate.',
    en: 'Independent 4-tier tech leaderboard (Directory -> Category -> Master Product -> Listing). Dual Expert & Verified User scores across 5 sub-criteria with zero affiliate bias.',
    cs: 'Nezávislý 4-úrovňový žebříček technologií (Directory -> Category -> Master Product -> Listing). Duální hodnocení expertů a uživatelů v 5 kritériích bez reklamního zkreslení.',
  };

  return {
    title: titleByLocale[resolvedLocale],
    description: descByLocale[resolvedLocale],
    alternates: {
      canonical: `${siteUrl}/leaderboard`,
    },
    openGraph: {
      title: titleByLocale[resolvedLocale],
      description: descByLocale[resolvedLocale],
      url: `${siteUrl}/leaderboard`,
      siteName: 'Rate.vn',
      type: 'website',
    },
  };
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const resolvedLocale: SupportedRateLocale = normalizeRateLocale(locale);
  const siteUrl = SITE_URL;

  const [products, dealRadar] = await Promise.all([
    getCachedMasterProducts({
      categorySlug: 'all',
      limit: 100,
      sort: 'rating_desc',
    }),
    getCrossPlatformDealRadar({
      categorySlug: 'all',
      limit: 36,
    }).catch(() => null),
  ]);

  const rawCategory = (query.cat || 'smartphones')
    .toLowerCase()
    .trim() as CanonicalCategorySlug;
  const initialCategory: CanonicalCategorySlug = VALID_CATEGORIES.has(
    rawCategory
  )
    ? rawCategory
    : 'smartphones';

  const rawCriterion = (query.criterion || 'combined')
    .toLowerCase()
    .trim() as LeaderboardCriterionKey;
  const initialCriterion: LeaderboardCriterionKey = VALID_CRITERIA.has(
    rawCriterion
  )
    ? rawCriterion
    : 'combined';

  const copy = {
    vi: {
      kicker: 'JREVIEWS DUAL-RATING LEADERBOARD • DESIGN.MD V3.0',
      title: 'Bảng Xếp Hạng Thiết Bị Độc Lập 10.0',
      subtitle:
        'Xếp hạng khách quan theo cấu trúc 4 tầng: Directory (Tech & Electronics) -> 5 Categories -> Master Products -> Verified Listings. Tách biệt hoàn toàn điểm Người dùng thật, Chuyên gia Lab và 5 tiêu chí kỹ thuật khỏi bảng giá thương mại.',
      home: 'Trang chủ',
      breadcrumb: 'Bảng xếp hạng',
      compareCta: 'Mở Bàn So Sánh',
      inspectCta: 'Kiểm Tra Seeding AI',
      statProducts: 'Thiết bị chuẩn hóa',
      statCategories: 'Danh mục độc lập',
      statCriteria: 'Tiêu chí chấm điểm',
      statZeroBias: '0% Trọng số Affiliate',
    },
    en: {
      kicker: 'JREVIEWS DUAL-RATING LEADERBOARD • DESIGN.MD V3.0',
      title: 'Independent 10.0 Device Leaderboard',
      subtitle:
        'Objective ranking across our 4-tier taxonomy: Directory (Tech & Electronics) -> 5 Categories -> Master Products -> Verified Listings. Strictly separates Verified User, Lab Expert, and 5 sub-criteria scores from merchant pricing.',
      home: 'Home',
      breadcrumb: 'Leaderboard',
      compareCta: 'Open Compare Matrix',
      inspectCta: 'AI Seeding Inspector',
      statProducts: 'Normalized Devices',
      statCategories: 'Categories',
      statCriteria: 'Scoring Criteria',
      statZeroBias: '0% Affiliate Weight',
    },
    cs: {
      kicker: 'JREVIEWS DUAL-RATING LEADERBOARD • DESIGN.MD V3.0',
      title: 'Nezávislý Žebříček Zařízení 10.0',
      subtitle:
        'Objektivní žebříček dle 4-úrovňové taxonomie: Directory (Tech & Electronics) -> 5 Kategorií -> Master Products -> Ověřené nabídky. Striktně odděluje skóre uživatelů, expertů a 5 kritérií od cen obchodníků.',
      home: 'Domů',
      breadcrumb: 'Žebříček',
      compareCta: 'Porovnat Zařízení',
      inspectCta: 'AI Kontrola Recenzí',
      statProducts: 'Zařízení v databázi',
      statCategories: 'Kategorie',
      statCriteria: 'Kritéria hodnocení',
      statZeroBias: '0% Vliv Affiliate',
    },
  }[resolvedLocale];

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
          : Number(p.user_rating_weighted || p.average_rating || 4.7) * 2;
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          brand: { '@type': 'Brand', name: p.brand },
          url: `${siteUrl}${getMasterProductHref(p)}`,
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(ratingVal.toFixed(1)),
            bestRating: 10,
            worstRating: 1,
            ratingCount: Math.max(p.total_reviews || 1, 1),
          },
        },
      };
    }),
  };

  return (
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
                  className="d-inline-flex align-items-center rounded-pill mb-3 gap-2 px-3 py-1"
                  style={{
                    background: 'rgba(255,46,41,0.14)',
                    border: '1px solid rgba(255,46,41,0.35)',
                    color: '#ff6b66',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  <span>🏆</span>
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
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
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
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
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
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {copy.statCriteria}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top border-secondary border-opacity-25 flex-wrap gap-2 pt-2">
                    <span
                      className="badge rounded-pill"
                      style={{
                        background: 'rgba(16,185,129,0.15)',
                        color: '#34d399',
                        fontSize: '11px',
                      }}
                    >
                      🛡️ {copy.statZeroBias}
                    </span>
                    <div className="d-flex gap-2">
                      <Link
                        href="/compare"
                        className="btn btn-sm btn-outline-light rounded-pill px-3"
                        style={{ fontSize: '12px', fontWeight: 600 }}
                      >
                        ⚖️ {copy.compareCta}
                      </Link>
                      <Link
                        href="/inspect"
                        className="btn btn-sm rounded-pill px-3"
                        style={{
                          background: '#ff2e29',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        🔍 {copy.inspectCta}
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
            initialCategory={initialCategory}
            initialCriterion={initialCriterion}
          />
        </section>
      </main>

      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
