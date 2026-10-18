import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import { CategoryCatalogContent } from '../smartphones/page';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalog' });
  const facets = await getCachedCategoryDirectoryFacets('earbuds');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = 'https://rate.vn/earbuds';

  return {
    title:
      totalModels > 0
        ? t('meta.earbuds.titleCount', { count: totalModels })
        : t('meta.earbuds.titleDefault'),
    description: t('meta.earbuds.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function EarbudsCatalogPage({
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
      defaultCategorySlug="earbuds"
      basePath="/earbuds"
    />
  );
}
