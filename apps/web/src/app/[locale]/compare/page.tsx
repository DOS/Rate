import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  getComparePageSelection,
  getRequestedComparison,
  parseCompareSlugs,
} from '@/server/rate/compare-selection';
import { getCachedPopulatedCategorySlugs } from '@/server/rate';
import { getItemSlugsFor } from '@/server/rate/item-directory';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph, fitTitle, fitDescription } from '@/lib/seo';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import PageShell from '../components/page-shell';
import ClientMessages from '@/components/providers/ClientMessages';
import { withScoringSpecs } from '@/lib/hero-products';

// Reads searchParams, so it renders per request. The [locale] layout's
// generateStaticParams would otherwise make it static, and the searchParams
// read would then fail with DYNAMIC_SERVER_USAGE (DOS/Rate#491).
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  const query = await searchParams;
  const requestedSlugs = parseCompareSlugs(query.slugs);

  const canonicalUrl = 'https://rate.vn/compare';

  if (requestedSlugs.length >= 2) {
    const { products: compared } = await getRequestedComparison(
      requestedSlugs,
      query
    );
    if (compared.length >= 2) {
      const names = compared.map((p) => p.name).join(' vs ');
      const fullTitle = t('compareMetaTitleWithNames', { names });
      const description = fitDescription(
        t('compareMetaDescWithNames', { names }),
        lang
      );
      return {
        // The names come first; the fixed text, then the site name, give way
        // to fit a search result (DOS/Rate#777). The share card keeps the
        // full title, as on the versus page.
        title: fitTitle(
          [fullTitle, t('compareMetaTitleWithNamesShort', { names }), names],
          undefined,
          lang
        ),
        description,
        alternates: {
          canonical: canonicalUrl,
        },
        openGraph: {
          ...defaultOpenGraph(lang),
          title: fullTitle,
          description,
        },
      };
    }
  }

  return {
    title: t('compareMetaDefaultTitle'),
    description: t('compareMetaDefaultDesc'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function ComparePhonesPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  const [
    {
      catalogCandidates,
      rawCandidateSlugs,
      activeCategory,
      initialProducts,
      hasExplicitSlugs,
      resolvedSelection,
    },
    populatedCategorySlugs,
  ] = await Promise.all([
    getComparePageSelection(await searchParams),
    getCachedPopulatedCategorySlugs(),
  ]);
  // RATE_ITEM_MODEL on: versus links name Items (DOS/Rate#1290, DOS/Rate#1768); off: null.
  const baseItemSlugBySlug = await getItemSlugsFor(
    [
      ...initialProducts.map((p) => p.slug),
      ...catalogCandidates.map((p) => p.slug),
    ],
    resolvedSelection
  );
  const rawItemSlugBySlug = baseItemSlugBySlug
    ? await getItemSlugsFor(rawCandidateSlugs, resolvedSelection)
    : null;
  const itemSlugBySlug = baseItemSlugBySlug
    ? { ...rawItemSlugBySlug, ...baseItemSlugBySlug }
    : null;

  return (
    <ClientMessages scope="compare">
      <PageShell
        locale={locale}
        populatedCategorySlugs={populatedCategorySlugs}
      >
        <div
          className="min-vh-100 py-md-5 py-4"
          style={{ backgroundColor: 'var(--rate-bg-canvas)' }}
        >
          <div className="container">
            {/* Header & Breadcrumb */}
            <div className="d-flex align-items-end justify-content-between mb-4 flex-wrap gap-3">
              <div>
                <nav aria-label="breadcrumb">
                  <ol className="breadcrumb small mb-2">
                    <li className="breadcrumb-item">
                      <Link href="/" className="text-decoration-none">
                        {t('breadcrumbHome')}
                      </Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link
                        href={`/${activeCategory}`}
                        className="text-decoration-none"
                      >
                        {t('breadcrumbCatalog')}
                      </Link>
                    </li>
                    <li className="breadcrumb-item active" aria-current="page">
                      {t('breadcrumbCompare')}
                    </li>
                  </ol>
                </nav>
                <div className="rate-eyebrow mb-2">{t('pageEyebrow')}</div>
                <h1 className="h2 fw-bold mb-1">{t('pageTitle')}</h1>
                <p className="text-muted mb-0">{t('pageSubtitle')}</p>
              </div>
            </div>

            <CompareWorkspace
              initialProducts={initialProducts}
              // Ranking fields only: an added product gets its full
              // sheet from the page the selection navigates to (#1515).
              catalogCandidates={catalogCandidates.map(withScoringSpecs)}
              initialCategory={activeCategory}
              hasExplicitSlugs={hasExplicitSlugs}
              locale={locale}
              {...(itemSlugBySlug ? { itemSlugBySlug } : {})}
            />
          </div>
        </div>
      </PageShell>
    </ClientMessages>
  );
}
