import type { Metadata } from 'next';
import {
  generateCategoryProductMetadata,
  ProductDetailView,
  type PageParams,
} from '../../smartphones/[slug]/page';

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
  return (
    <ProductDetailView
      params={params}
      categoryBasePath="/tablets"
      categoryLabel="Máy tính bảng"
    />
  );
}
