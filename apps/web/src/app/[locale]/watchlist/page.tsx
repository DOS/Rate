import type { Metadata } from 'next';
import { getMasterProducts } from '@/lib/rate-api';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import WatchlistWorkspace from '@/components/watchlist/WatchlistWorkspace';

export const metadata: Metadata = {
  title: 'Danh Sách Canh Giá Thật & Cảnh Báo Giảm Giá | Rate.vn',
  description:
    'Theo dõi biến động giá theo thời gian thực, đặt mức giá mục tiêu và chống chiêu trò nâng giá gốc giảm ảo trên Shopee, Lazada, Tiki.',
};

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const catalogProducts = await getMasterProducts({ limit: 50 }).catch(() => []);

  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <WatchlistWorkspace catalogProducts={catalogProducts} />
      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
