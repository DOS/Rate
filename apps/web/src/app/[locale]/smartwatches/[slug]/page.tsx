import type { Metadata } from 'next';
import {
  generateCategoryProductMetadata,
  ProductDetailView,
  type PageParams,
  type PageSearchParams,
} from '../../smartphones/[slug]/page';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

// Nothing is prerendered at build; each slug renders on its first request.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: PageSearchParams;
}): Promise<Metadata> {
  return generateCategoryProductMetadata(params, '/smartwatches', searchParams);
}

export default async function SmartwatchDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: PageSearchParams;
}) {
  return (
    <ProductDetailView
      params={params}
      searchParams={searchParams}
      categoryBasePath="/smartwatches"
    />
  );
}
