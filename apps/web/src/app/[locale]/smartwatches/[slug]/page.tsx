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
  return generateCategoryProductMetadata(params, '/smartwatches');
}

export default async function SmartwatchDetailPage({
  params,
}: {
  params: PageParams;
}) {
  return (
    <ProductDetailView
      params={params}
      categoryBasePath="/smartwatches"
      categoryLabel="Đồng hồ thông minh"
    />
  );
}
