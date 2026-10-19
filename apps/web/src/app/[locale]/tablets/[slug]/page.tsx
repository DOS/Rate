import type { Metadata } from 'next';
import {
  generateCategoryProductMetadata,
  ProductDetailView,
  type PageParams,
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
}: {
  params: PageParams;
}): Promise<Metadata> {
  return generateCategoryProductMetadata(params, '/tablets');
}

export default async function TabletDetailPage({
  params,
}: {
  params: PageParams;
}) {
  return <ProductDetailView params={params} categoryBasePath="/tablets" />;
}
