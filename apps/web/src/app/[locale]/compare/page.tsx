import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import {
  type CanonicalCategorySlug,
  getCachedCompareMasterProducts,
  getCachedMasterProducts,
  getMasterProductCategorySlug,
} from '@/server/rate';
import { resolveCompareSlugs } from '@/server/rate/item-compare';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph, fitTitle, fitDescription } from '@/lib/seo';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import PageShell from '../components/page-shell';
import ClientMessages from '@/components/providers/ClientMessages';

// Reads searchParams, so it renders per request. The [locale] layout's
// generateStaticParams would otherwise make it static, and the searchParams
// read would then fail with DYNAMIC_SERVER_USAGE (DOS/Rate#491).
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ slugs?: string; category?: string }>;
};

const VALID_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

function normalizeCategoryParam(raw?: string): CanonicalCategorySlug {
  if (raw && VALID_CATEGORIES.has(raw as CanonicalCategorySlug)) {
    return raw as CanonicalCategorySlug;
  }
  return 'smartphones';
}

function parseSlugsCsv(slugsParam?: string): string[] {
  if (!slugsParam) return [];
  return Array.from(
    new Set(
      slugsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, 4);
}

/**
 * The slugs to compare. RATE_ITEM_MODEL on: Item or variant slugs, with
 * `slug@256gb` pinning a size, one per Item (DOS/Rate#1156); off: as sent.
 */
async function comparedSlugs(requested: string[]): Promise<string[]> {
  return (await resolveCompareSlugs(requested)) ?? requested;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  const { slugs: slugsParam } = await searchParams;
  const requestedSlugs = parseSlugsCsv(slugsParam);

  const canonicalUrl = 'https://rate.vn/compare';

  if (requestedSlugs.length >= 2) {
    const compared = await getCachedCompareMasterProducts(
      (await comparedSlugs(requestedSlugs)).join(',')
    );
    if (compared.length >= 2) {
      const names = compared.map((p) => p.name).join(' vs ');
      const fullTitle = t('compareMetaTitleWithNames', { names });
      const description = fitDescription(
        t('compareMetaDescWithNames', { names })
      );
      return {
        // The names come first; the fixed text, then the site name, give way
        // to fit a search result (DOS/Rate#777). The share card keeps the
        // full title, as on the versus page.
        title: fitTitle([
          fullTitle,
          t('compareMetaTitleWithNamesShort', { names }),
          names,
        ]),
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
  const { slugs: slugsParam, category: categoryParam } = await searchParams;
  const requestedSlugs = parseSlugsCsv(slugsParam);

  const [catalogCandidates, requestedProducts] = await Promise.all([
    // Fixed key, so it shares the data cache; only the compared slugs vary.
    getCachedMasterProducts({ categorySlug: 'all', limit: 50 }),
    requestedSlugs.length > 0
      ? comparedSlugs(requestedSlugs).then((slugs) =>
          getCachedCompareMasterProducts(slugs.join(','))
        )
      : Promise.resolve([]),
  ]);

  const activeCategory: CanonicalCategorySlug =
    requestedProducts.length > 0
      ? getMasterProductCategorySlug(requestedProducts[0]!)
      : normalizeCategoryParam(categoryParam);

  // Strictly lock default products to the active category (never mix Smartphones with Earbuds/Laptops)
  const sameCategoryCandidates = catalogCandidates.filter(
    (c) => getMasterProductCategorySlug(c) === activeCategory
  );

  const initialProducts =
    requestedProducts.length > 0
      ? requestedProducts.filter(
          (p) => getMasterProductCategorySlug(p) === activeCategory
        )
      : sameCategoryCandidates.slice(0, 3);

  return (
    <ClientMessages scope="compare">
      <PageShell locale={locale}>
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
              catalogCandidates={catalogCandidates}
              initialCategory={activeCategory}
              hasExplicitSlugs={requestedSlugs.length > 0}
              locale={locale}
            />
          </div>
        </div>
      </PageShell>
    </ClientMessages>
  );
}
