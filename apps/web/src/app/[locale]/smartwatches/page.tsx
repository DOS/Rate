import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import {
  CategoryCatalogContent,
  catalogCanonicalUrl,
} from '../smartphones/page';

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
  const facets = await getCachedCategoryDirectoryFacets('smartwatches');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = catalogCanonicalUrl('/smartwatches', await searchParams);

  return {
    title:
      totalModels > 0
        ? t('meta.smartwatches.titleCount', { count: totalModels })
        : t('meta.smartwatches.titleDefault'),
    description: t('meta.smartwatches.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function SmartwatchesCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { locale } = await params;
  const rawSearch = await searchParams;
  return (
    <CategoryCatalogContent
      locale={locale}
      rawSearch={rawSearch}
      defaultCategorySlug="smartwatches"
      basePath="/smartwatches"
    />
  );
}
