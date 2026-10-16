import type { Metadata } from 'next';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import { CategoryCatalogContent } from '../smartphones/page';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const facets = await getCachedCategoryDirectoryFacets('earbuds');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = 'https://rate.vn/earbuds';

  return {
    title:
      totalModels > 0
        ? `So sánh giá Tai nghe không dây ANC (${totalModels} mẫu chuẩn hóa) | Rate.vn`
        : 'So sánh giá Tai nghe chống ồn ANC (Earbuds) & Kiểm định khuyến mãi AI | Rate.vn',
    description:
      'Tra cứu và lọc tai nghe không dây chống ồn chủ động ANC (AirPods Pro, Sony WF-1000XM5, Galaxy Buds, Bose, Sennheiser) theo 10 nhóm thông số chuẩn hóa, lịch sử giá thật và đánh giá AI trên Rate.vn.',
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
