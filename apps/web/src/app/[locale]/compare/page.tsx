import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import {
  getCachedCompareMasterProducts,
  getMasterProducts,
} from '@/server/rate';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ slugs?: string }>;
};

function parseSlugsCsv(slugsParam?: string): string[] {
  if (!slugsParam) return [];
  return Array.from(
    new Set(
      slugsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, 4);
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { slugs: slugsParam } = await searchParams;
  const requestedSlugs = parseSlugsCsv(slugsParam);

  const canonicalUrl =
    locale === 'vi'
      ? 'https://rate.vn/compare'
      : `https://rate.vn/${locale}/compare`;

  if (requestedSlugs.length >= 2) {
    const compared = await getCachedCompareMasterProducts(
      requestedSlugs.join(',')
    );
    if (compared.length >= 2) {
      const names = compared.map((p) => p.name).join(' vs ');
      return {
        title:
          locale === 'vi'
            ? `So sánh ${names} - 10 Nhóm Thông Số & Giá Thật | Rate.vn`
            : locale === 'cs'
              ? `Porovnání ${names} - 10 skupin parametrů a ceny | Rate.vn`
              : `Compare ${names} - 10 Spec Groups & True Price | Rate.vn`,
        description:
          locale === 'vi'
            ? `Đối chiếu chi tiết 10 nhóm thông số kỹ thuật chuẩn PhoneArena/GSMArena, giá bán thấp nhất và điểm đánh giá thực chất giữa ${names} trên Rate.vn.`
            : `Side-by-side comparison across 10 standardized technical spec groups, lowest verified price, and JReviews rating for ${names} on Rate.vn.`,
        alternates: {
          canonical: canonicalUrl,
        },
      };
    }
  }

  return {
    title:
      locale === 'vi'
        ? 'So sánh Thiết bị Công nghệ - 10 Nhóm Thông Số & Giá Thật | Rate.vn'
        : locale === 'cs'
          ? 'Porovnání zařízení - 10 skupin parametrů a skutečné ceny | Rate.vn'
          : 'Compare Tech Devices - 10 Spec Groups & True Price | Rate.vn',
    description:
      locale === 'vi'
        ? 'Tìm kiếm và đặt lên bàn cân tối đa 4 mẫu điện thoại, laptop, máy tính bảng theo chuẩn 10 nhóm thông số kỹ thuật PhoneArena/GSMArena và so sánh giá thật trên Rate.vn.'
        : 'Compare up to 4 smartphones, laptops, or tablets side by side across 10 standardized technical specification groups and true historical prices on Rate.vn.',
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function ComparePhonesPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const { slugs: slugsParam } = await searchParams;
  const requestedSlugs = parseSlugsCsv(slugsParam);

  const [catalogCandidates, requestedProducts] = await Promise.all([
    getMasterProducts({ limit: 36 }),
    requestedSlugs.length > 0
      ? getCachedCompareMasterProducts(requestedSlugs.join(','))
      : Promise.resolve([]),
  ]);

  const initialProducts =
    requestedProducts.length > 0
      ? requestedProducts
      : catalogCandidates.slice(0, 3);

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <div className="bg-light min-vh-100 py-md-5 py-4">
        <div className="container">
          {/* Header & Breadcrumb */}
          <div className="d-flex align-items-end justify-content-between mb-4 flex-wrap gap-3">
            <div>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb small mb-2">
                  <li className="breadcrumb-item">
                    <Link href="/" className="text-decoration-none">
                      {locale === 'vi'
                        ? 'Trang chủ'
                        : locale === 'cs'
                          ? 'Domů'
                          : 'Home'}
                    </Link>
                  </li>
                  <li className="breadcrumb-item">
                    <Link href="/smartphones" className="text-decoration-none">
                      {locale === 'vi'
                        ? 'Danh mục thiết bị'
                        : locale === 'cs'
                          ? 'Katalog zařízení'
                          : 'Device Catalog'}
                    </Link>
                  </li>
                  <li className="breadcrumb-item active" aria-current="page">
                    {locale === 'vi'
                      ? 'So sánh 10 nhóm thông số'
                      : locale === 'cs'
                        ? 'Porovnání 10 skupin parametrů'
                        : '10-Group Spec Comparison'}
                  </li>
                </ol>
              </nav>
              <h1 className="h2 fw-bold mb-1">
                {locale === 'vi'
                  ? 'Bàn Cân Đối Chiếu 10 Nhóm Thông Số Kỹ Thuật (10 Field Groups)'
                  : locale === 'cs'
                    ? 'Porovnání 10 skupin technických parametrů (10 Field Groups)'
                    : 'Side-by-Side 10-Group Specification Comparison'}
              </h1>
              <p className="text-muted mb-0">
                {locale === 'vi'
                  ? 'Tìm kiếm Autocomplete, thêm tối đa 4 mẫu Điện thoại, Laptop hoặc Máy tính bảng để đối chiếu trực quan 10 nhóm thông số chuẩn PhoneArena/GSMArena và giá bán thực tế'
                  : locale === 'cs'
                    ? 'Vyhledejte a porovnejte až 4 telefony, notebooky nebo tablety podle 10 standardizovaných skupin parametrů a skutečných cen'
                    : 'Search and compare up to 4 Smartphones, Laptops, or Tablets across 10 standardized PhoneArena/GSMArena spec groups and verified marketplace prices'}
              </p>
            </div>

            <div className="d-flex flex-wrap gap-2">
              <Link
                href="/smartphones"
                className="btn btn-outline-primary rounded-pill fw-medium px-3"
              >
                📱 {locale === 'vi' ? 'Điện thoại' : 'Smartphones'}
              </Link>
              <Link
                href="/laptops"
                className="btn btn-outline-primary rounded-pill fw-medium px-3"
              >
                💻 Laptop
              </Link>
              <Link
                href="/tablets"
                className="btn btn-outline-primary rounded-pill fw-medium px-3"
              >
                📟 {locale === 'vi' ? 'Máy tính bảng' : 'Tablets'}
              </Link>
            </div>
          </div>

          <CompareWorkspace
            initialProducts={initialProducts}
            catalogCandidates={catalogCandidates}
            hasExplicitSlugs={requestedSlugs.length > 0}
          />
        </div>
      </div>

      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
