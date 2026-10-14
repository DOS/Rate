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
  return generateCategoryProductMetadata(params, '/laptops');
}

export default async function LaptopDetailPage({
  params,
}: {
  params: PageParams;
}) {
  return (
    <ProductDetailView
      params={params}
      categoryBasePath="/laptops"
      categoryLabel="Laptop"
    />
  );
}
