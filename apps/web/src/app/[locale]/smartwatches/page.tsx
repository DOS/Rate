import type { Metadata } from 'next';
import { getCachedCategoryDirectoryFacets } from '@/server/rate';
import { CategoryCatalogContent } from '../smartphones/page';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const facets = await getCachedCategoryDirectoryFacets('smartwatches');
  const totalModels = facets.totalUnfiltered;
  const canonicalUrl = 'https://rate.vn/smartwatches';

  return {
    title:
      totalModels > 0
        ? `So sánh giá Đồng hồ thông minh (${totalModels} mẫu chuẩn hóa) | Rate.vn`
        : 'So sánh giá Đồng hồ thông minh (Smartwatches) & Kiểm định khuyến mãi AI | Rate.vn',
    description:
      'Tra cứu và lọc đồng hồ thông minh (Apple Watch, Galaxy Watch, Garmin, Xiaomi Watch, Huawei Watch) theo 10 nhóm thông số kỹ thuật chuẩn hóa, kiểm tra lịch sử giá thật và lọc đánh giá Seeding trên Rate.vn.',
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
