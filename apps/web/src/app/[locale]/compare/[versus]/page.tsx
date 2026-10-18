import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProducts,
  getMasterProductCategorySlug,
  getMasterProductHref,
} from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph } from '@/lib/seo';
import { scoreMasterProductForLeaderboard } from '@/lib/leaderboard-engine';
import NavbarDarkDynamic from '../../components/navbar/NavbarDarkDynamic';
import FooterTop from '../../components/footer-top';
import FooterDynamic from '../../components/footer/FooterDynamic';
import BackToTop from '../../components/back-to-top';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import VersusInteractiveScoreboard from '@/components/compare/VersusInteractiveScoreboard';
import VersusMatchupSwitcher from '@/components/compare/VersusMatchupSwitcher';

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
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  const parsed = parseVersusSlugs(versus);
  if (!parsed) {
    return { title: t('versusMetaFallbackTitle') };
  }

  const compared = await getCachedCompareMasterProducts(parsed.join(','));
  const a = compared[0];
  const b = compared[1];
  if (!a || !b) {
    return { title: t('versusMetaFallbackTitle') };
  }

  const canonicalUrl = `https://rate.vn/compare/${a.slug}-vs-${b.slug}`;
  const title = t('versusMetaTitle', { nameA: a.name, nameB: b.name });
  const description = t('versusMetaDescription', {
    nameA: a.name,
    nameB: b.name,
  });

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(lang),
      title,
      description,
      url: canonicalUrl,
    },
  };
}

export default async function VersusComparePage({ params }: VersusPageProps) {
  const { locale, versus } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
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
        ...(entry.expertScore10 != null && entry.authenticReviewCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: entry.expertScore10,
                bestRating: 10,
                worstRating: 1,
                ratingCount: entry.authenticReviewCount,
              },
            }
          : entry.userScore5 > 0 && entry.authenticReviewCount > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: entry.userScore5,
                  bestRating: 5,
                  worstRating: 1,
                  ratingCount: entry.authenticReviewCount,
                },
              }
            : {}),
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
                fontSize: '0.8125rem',
                fontWeight: 700,
              }}
            >
              {/* 1V1 HEAD-TO-HEAD AUDIT */}
              {t('versusHeroBadge', { category: catSlug.toUpperCase() })}
            </span>
            <Link
              href={`/leaderboard?cat=${catSlug}`}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
            >
              🏆 {t('viewCategoryLeaderboard')}
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
            {t('versusAutoVerdict', {
              winner: overallWinner.name,
              score: overallWinner.combinedScore5.toFixed(2),
              expertSuffix:
                overallWinner.expertScore10 != null
                  ? ` (${overallWinner.expertScore10.toFixed(1)}/10 Lab)`
                  : '',
            })}
          </p>

          <VersusInteractiveScoreboard
            scoreA={scoreA}
            scoreB={scoreB}
            locale={locale}
          />

          <VersusMatchupSwitcher
            currentSlugA={scoreA.slug}
            currentSlugB={scoreB.slug}
            categorySlug={catSlug}
            catalogCandidates={directory}
            locale={locale}
          />
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
