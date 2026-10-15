import type { Metadata } from 'next';
import { getMasterProducts } from '@/lib/rate-api';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import WatchlistWorkspace from '@/components/watchlist/WatchlistWorkspace';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  return {
    title:
      lang === 'en'
        ? 'True Price Watchlist & Target Drop Alerts | Rate.vn'
        : lang === 'cs'
        ? 'Seznam hlídaných cen a upozornění na slevy | Rate.vn'
        : 'Danh Sách Canh Giá Thật & Cảnh Báo Giảm Giá Đa Ngành | Rate.vn',
    description:
      lang === 'en'
        ? 'Track real-time historical price drops across all 5 tech categories, set target price alerts, and avoid inflated fake discounts on Shopee, Lazada, and Tiki.'
        : lang === 'cs'
        ? 'Sledujte vývoj skutečných cen v reálném čase, nastavte si cílovou cenu a vyhněte se falešným slevám.'
        : 'Theo dõi biến động giá theo thời gian thực trên cả 5 ngành hàng, đặt mức giá mục tiêu và chống chiêu trò nâng giá gốc giảm ảo trên Shopee, Lazada, Tiki.',
  };
}

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const catalogProducts = await getMasterProducts({
    categorySlug: 'all',
    limit: 100,
  }).catch(() => []);

  return (
    <>
      <NavbarDarkDynamic links={[]} />
      <WatchlistWorkspace catalogProducts={catalogProducts} locale={locale} />
      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
