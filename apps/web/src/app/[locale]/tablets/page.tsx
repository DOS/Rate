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
  const facets = await getCachedCategoryDirectoryFacets('tablets');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = catalogCanonicalUrl('/tablets', await searchParams);

  return {
    title:
      totalModels > 0
        ? t('meta.tablets.titleCount', { count: totalModels })
        : t('meta.tablets.titleDefault'),
    description: t('meta.tablets.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function TabletsCatalogPage({
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
      defaultCategorySlug="tablets"
      basePath="/tablets"
    />
  );
}
