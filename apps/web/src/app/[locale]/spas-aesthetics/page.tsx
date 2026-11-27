import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import {
  CategoryCatalogContent,
  catalogCanonicalUrl,
} from '../smartphones/page';

// Reads searchParams, so it renders per request. The [locale] layout's
// generateStaticParams would otherwise make it static, and the searchParams
// read would then fail with DYNAMIC_SERVER_USAGE (DOS/Rate#491).
export const dynamic = 'force-dynamic';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const facets = await getCachedCategoryDirectoryFacets('spas-aesthetics');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = catalogCanonicalUrl(
    '/spas-aesthetics',
    await searchParams
  );

  return {
    title:
      totalModels > 0
        ? t('meta.spas-aesthetics.titleCount', { count: totalModels })
        : t('meta.spas-aesthetics.titleDefault'),
    description: t('meta.spas-aesthetics.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function SpasAestheticsCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const rawSearch = await searchParams;
  return (
    <CategoryCatalogContent
      locale={locale}
      rawSearch={rawSearch}
      defaultCategorySlug="spas-aesthetics"
      basePath="/spas-aesthetics"
    />
  );
}
