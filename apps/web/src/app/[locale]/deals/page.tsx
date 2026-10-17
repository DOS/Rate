import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import {
  getCachedMasterProducts,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import DealFinderWorkspace from '@/components/deals/DealFinderWorkspace';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  return {
    title:
      lang === 'en'
        ? 'Verified Tech Deals & Price-to-Performance Finder | Rate.vn'
        : lang === 'cs'
          ? 'Ověřené technologické nabídky a nejlepší poměr cena/výkon | Rate.vn'
          : 'Săn Deal Công Nghệ Đã Kiểm Định Giá Thật 10 Sàn | Rate.vn',
    description:
      'Tìm kiếm thiết bị công nghệ đáng tiền nhất theo ngân sách và nhu cầu sử dụng, đã đối chiếu lịch sử giá 60 ngày và lọc khuyến mãi ảo trên 10 sàn TMĐT.',
    alternates: {
      canonical: 'https://rate.vn/deals',
    },
  };
}

export default async function DealsPage({ params }: PageProps) {
  const { locale } = await params;
  normalizeRateLocale(locale);
  const [products, dealRadar] = await Promise.all([
    getCachedMasterProducts({
      categorySlug: 'all',
      limit: 100,
      sort: 'rating_desc',
    }),
    getCrossPlatformDealRadar({
      categorySlug: 'all',
      // Max page size so every ranked card gets its own Radar badge.
      limit: 50,
    }),
  ]);

  return (
    <main className="bg-light min-vh-100">
      <NavbarDarkDynamic links={[]} />
      <section className="py-4">
        <div className="container">
          <div className="rate-scoreboard-dark rounded-4 mb-4 p-4">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <div className="rate-eyebrow text-warning mb-1">
                  VERIFIED DEAL & VALUE DISCOVERY ENGINE
                </div>
                <h1 className="h3 fw-bold mb-1 text-white">
                  Săn Deal Đáng Tiền Nhất Đã Kiểm Chứng Khuyến Mãi Ảo (10 Sàn)
                </h1>
                <p className="text-white-50 small mb-0">
                  Xếp hạng thiết bị theo chỉ số Hiệu suất Giá / Điểm JReviews và
                  biên độ tiết kiệm giữa các sàn chính hãng. Hỗ trợ xuất
                  Markdown, CSV và JSON.
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/leaderboard"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                >
                  🏆 Bảng xếp hạng JReviews
                </Link>
                <Link
                  href="/inspect"
                  className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                >
                  🔬 Kiểm toán link giảm giá ảo
                </Link>
              </div>
            </div>
          </div>

          <DealFinderWorkspace products={products} dealRadar={dealRadar} />
        </div>
      </section>
      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </main>
  );
}
