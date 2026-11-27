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
  const facets = await getCachedCategoryDirectoryFacets('credit-cards');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = catalogCanonicalUrl('/credit-cards', await searchParams);

  return {
    title:
      totalModels > 0
        ? t('meta.credit-cards.titleCount', { count: totalModels })
        : t('meta.credit-cards.titleDefault'),
    description: t('meta.credit-cards.description'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function CreditCardsCatalogPage({
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
      defaultCategorySlug="credit-cards"
      basePath="/credit-cards"
    />
  );
}
