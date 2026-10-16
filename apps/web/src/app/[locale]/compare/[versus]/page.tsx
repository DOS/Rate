import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/navigation';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProducts,
  getMasterProductCategorySlug,
  getMasterProductHref,
} from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { scoreMasterProductForLeaderboard } from '@/lib/leaderboard-engine';
import NavbarDarkDynamic from '../../components/navbar/NavbarDarkDynamic';
import FooterTop from '../../components/footer-top';
import FooterDynamic from '../../components/footer/FooterDynamic';
import BackToTop from '../../components/back-to-top';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import CompareTrayBar from '@/components/compare/CompareTrayBar';

export const revalidate = 60;

interface VersusPageProps {
  params: Promise<{ locale: string; versus: string }>;
}

export function parseVersusSlugs(rawVersus: string): [string, string] | null {
  const cleaned = decodeURIComponent(rawVersus || '')
    .toLowerCase()
    .trim();
  const parts = cleaned.split('-vs-');
  if (parts.length !== 2) return null;
  const slugA = parts[0]?.trim() || '';
  const slugB = parts[1]?.trim() || '';
  if (!slugA || !slugB || slugA === slugB) return null;
  return [slugA, slugB];
}

export async function generateMetadata({
  params,
}: VersusPageProps): Promise<Metadata> {
  const { locale, versus } = await params;
  const lang = normalizeRateLocale(locale);
  const parsed = parseVersusSlugs(versus);
  if (!parsed) {
    return { title: '1v1 Compare | Rate.vn' };
  }

  const compared = await getCachedCompareMasterProducts(parsed.join(','));
  const a = compared[0];
  const b = compared[1];
  if (!a || !b) {
    return { title: '1v1 Compare | Rate.vn' };
  }

  const canonicalUrl = `https://rate.vn/compare/${a.slug}-vs-${b.slug}`;
  const title =
    lang === 'en'
      ? `${a.name} vs ${b.name}: 10-Group Specs & JReviews 1v1 Verdict | Rate.vn`
      : lang === 'cs'
        ? `${a.name} vs ${b.name}: Porovnání 10 skupin parametrů a JReviews | Rate.vn`
        : `So sánh ${a.name} vs ${b.name}: Đối đầu 10 nhóm thông số & Điểm JReviews | Rate.vn`;
  const description =
    lang === 'en'
      ? `Head-to-head comparison between ${a.name} and ${b.name} across 5 JReviews criteria, 10 standardized spec groups, and 90-day verified market prices.`
      : lang === 'cs'
        ? `Přímý souboj ${a.name} vs ${b.name} v 5 kritériích JReviews, 10 skupinách specifikací a ověřených cenách.`
        : `Đặt lên bàn cân đối đầu 1v1 giữa ${a.name} và ${b.name}: Chấm điểm kép JReviews 5 tiêu chí, 10 nhóm thông số kỹ thuật chuẩn GSMArena & PhoneArena và kiểm toán giá thật.`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Rate.vn',
      type: 'website',
    },
  };
}

export default async function VersusComparePage({ params }: VersusPageProps) {
  const { locale, versus } = await params;
  const lang = normalizeRateLocale(locale);
  const parsed = parseVersusSlugs(versus);
  if (!parsed) {
    notFound();
  }

  const [compared, directory] = await Promise.all([
    getCachedCompareMasterProducts(parsed.join(',')),
    getCachedMasterProducts({
      categorySlug: 'all',
      limit: 60,
      sort: 'rating_desc',
    }),
  ]);

  if (compared.length < 2 || !compared[0] || !compared[1]) {
    notFound();
  }

  const prodA = compared[0];
  const prodB = compared[1];
  const catSlug = getMasterProductCategorySlug(prodA);
  const scoreA = scoreMasterProductForLeaderboard(prodA, 'combined');
  const scoreB = scoreMasterProductForLeaderboard(prodB, 'combined');

  const criteriaRows = [
    {
      key: 'screen',
      label:
        lang === 'en'
          ? 'Display & Visuals'
          : lang === 'cs'
            ? 'Displej a obraz'
            : 'Màn hình & Hiển thị',
      aVal: scoreA.criteria.screen,
      bVal: scoreB.criteria.screen,
    },
    {
      key: 'performance',
      label:
        lang === 'en'
          ? 'Performance & SoC'
          : lang === 'cs'
            ? 'Výkon a čipset'
            : 'Hiệu năng & Nhiệt độ',
      aVal: scoreA.criteria.performance,
      bVal: scoreB.criteria.performance,
    },
    {
      key: 'camera',
      label:
        lang === 'en'
          ? 'Camera / Audio'
          : lang === 'cs'
            ? 'Fotoaparát / Zvuk'
            : 'Camera / Âm thanh',
      aVal: scoreA.criteria.camera,
      bVal: scoreB.criteria.camera,
    },
    {
      key: 'battery',
      label:
        lang === 'en'
          ? 'Battery & Fast Charge'
          : lang === 'cs'
            ? 'Baterie a nabíjení'
            : 'Pin & Sạc nhanh',
      aVal: scoreA.criteria.battery,
      bVal: scoreB.criteria.battery,
    },
    {
      key: 'value',
      label:
        lang === 'en'
          ? 'Value for Money (P/P)'
          : lang === 'cs'
            ? 'Poměr cena / výkon'
            : 'Đáng đồng tiền (P/P)',
      aVal: scoreA.criteria.value,
      bVal: scoreB.criteria.value,
    },
  ] as const;

  const overallWinner =
    scoreA.combinedScore5 > scoreB.combinedScore5
      ? scoreA
      : scoreB.combinedScore5 > scoreA.combinedScore5
        ? scoreB
        : scoreA.minPrice <= scoreB.minPrice
          ? scoreA
          : scoreB;

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${prodA.name} vs ${prodB.name}`,
    numberOfItems: 2,
    itemListElement: [scoreA, scoreB].map((entry, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'Product',
        name: entry.name,
        brand: { '@type': 'Brand', name: entry.brand },
        url: `https://rate.vn${getMasterProductHref(entry.product)}`,
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: entry.expertScore10,
          bestRating: 10,
          worstRating: 1,
          ratingCount: Math.max(entry.authenticReviewCount, 1),
        },
      },
    })),
  };

  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c'),
        }}
      />

      {/* DESIGN.md v3.0 1v1 Head-to-Head Hero Scoreboard */}
      <section
        style={{
          background:
            'linear-gradient(135deg, #0b0d10 0%, #12161f 55%, #181c26 100%)',
          color: '#f8fafc',
          padding: '40px 0 36px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="container">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <span
              className="badge rounded-pill px-3 py-2"
              style={{
                background: 'rgba(255,46,41,0.16)',
                border: '1px solid rgba(255,46,41,0.4)',
                color: '#ff6b66',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              ⚔️ 1V1 HEAD-TO-HEAD AUDIT • SAME-CATEGORY LOCK (
              {catSlug.toUpperCase()})
            </span>
            <Link
              href={`/leaderboard?cat=${catSlug}`}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
            >
              🏆{' '}
              {lang === 'en'
                ? 'View Category Leaderboard'
                : lang === 'cs'
                  ? 'Zobrazit žebříček kategorie'
                  : 'Xem Bảng xếp hạng cùng ngành'}
            </Link>
          </div>

          <h1
            className="fw-bold mb-2 text-white"
            style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.25rem)' }}
          >
            {scoreA.name} <span className="text-danger mx-1">vs</span>{' '}
            {scoreB.name}
          </h1>

          <p className="text-white-50 small mb-4">
            {lang === 'en'
              ? `Automated 1v1 JReviews verdict: ${overallWinner.name} leads overall with ${overallWinner.combinedScore5.toFixed(2)}/5.0 Combined Score.`
              : lang === 'cs'
                ? `Automatický verdikt 1v1 JReviews: ${overallWinner.name} vede s celkovým skóre ${overallWinner.combinedScore5.toFixed(2)}/5.0.`
                : `Kết luận đối đầu 1v1 tự động: ${overallWinner.name} dẫn trước với điểm tổng hợp JReviews ${overallWinner.combinedScore5.toFixed(2)}/5.0 (${overallWinner.expertScore10.toFixed(1)}/10 Lab).`}
          </p>

          {/* 5-Criteria 1v1 Head-to-Head Comparison Matrix */}
          <div className="rate-scoreboard-dark rounded-4 p-4">
            <div className="row g-3 align-items-center border-bottom border-secondary border-opacity-25 mb-3 pb-3">
              <div className="col-5">
                <Link
                  href={scoreA.productHref}
                  className="fw-bold text-decoration-none d-block text-white"
                >
                  {scoreA.name}
                </Link>
                <div className="d-flex mt-1 flex-wrap gap-2">
                  <span className="rate-score-badge-user">
                    ★ {scoreA.userScore5.toFixed(2)}/5.0
                  </span>
                  <span className="rate-score-badge-expert">
                    Lab {scoreA.expertScore10.toFixed(1)}/10
                  </span>
                </div>
              </div>
              <div className="col-2 text-center">
                <span className="badge bg-danger rounded-pill fw-bold px-3 py-2">
                  VS
                </span>
              </div>
              <div className="col-5 text-end">
                <Link
                  href={scoreB.productHref}
                  className="fw-bold text-decoration-none d-block text-white"
                >
                  {scoreB.name}
                </Link>
                <div className="d-flex justify-content-end mt-1 flex-wrap gap-2">
                  <span className="rate-score-badge-user">
                    ★ {scoreB.userScore5.toFixed(2)}/5.0
                  </span>
                  <span className="rate-score-badge-expert">
                    Lab {scoreB.expertScore10.toFixed(1)}/10
                  </span>
                </div>
              </div>
            </div>

            {criteriaRows.map((row) => {
              const aWins = row.aVal > row.bVal;
              const bWins = row.bVal > row.aVal;
              return (
                <div
                  key={row.key}
                  className="row align-items-center g-2 border-bottom border-secondary border-opacity-10 py-2"
                >
                  <div className="col-4">
                    <span
                      className={`font-monospace fw-bold ${
                        aWins ? 'text-success' : 'text-white-50'
                      }`}
                    >
                      {row.aVal.toFixed(2)}/5.0 {aWins ? '✓' : ''}
                    </span>
                  </div>
                  <div className="small text-light fw-semibold col-4 text-center">
                    {row.label}
                  </div>
                  <div className="col-4 text-end">
                    <span
                      className={`font-monospace fw-bold ${
                        bWins ? 'text-success' : 'text-white-50'
                      }`}
                    >
                      {bWins ? '✓ ' : ''}
                      {row.bVal.toFixed(2)}/5.0
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <CompareWorkspace
            initialProducts={compared}
            catalogCandidates={directory}
            initialCategory={catSlug}
            hasExplicitSlugs={true}
            locale={locale}
          />
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
