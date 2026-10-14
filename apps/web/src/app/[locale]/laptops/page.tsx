import type { Metadata } from 'next';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import { CategoryCatalogContent } from '../smartphones/page';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const facets = await getCachedCategoryDirectoryFacets('laptops');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl =
    locale === 'vi'
      ? 'https://rate.vn/laptops'
      : `https://rate.vn/${locale}/laptops`;

  return {
    title:
      totalModels > 0
        ? `So sánh giá Laptop (${totalModels} mẫu máy chuẩn hóa) | Rate.vn`
        : 'So sánh giá Máy tính xách tay (Laptops) & Kiểm định khuyến mãi AI | Rate.vn',
    description:
      'Tra cứu và lọc laptop (MacBook, ThinkPad, ASUS ROG, Dell XPS) theo 10 nhóm thông số kỹ thuật chuẩn hóa, kiểm tra lịch sử giá thật và lọc đánh giá Seeding trên Rate.vn.',
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function LaptopsCatalogPage({
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
      defaultCategorySlug="laptops"
      basePath="/laptops"
    />
  );
}
