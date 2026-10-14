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
        title: `So sánh ${names} - 10 Nhóm Thông Số & Giá Thật | Rate.vn`,
        description: `Đối chiếu chi tiết 10 nhóm thông số kỹ thuật chuẩn PhoneArena/GSMArena, giá bán thấp nhất và điểm đánh giá thực chất giữa ${names} trên Rate.vn.`,
        alternates: {
          canonical: canonicalUrl,
        },
      };
    }
  }

  return {
    title:
      'So sánh Điện thoại Thông minh - 10 Nhóm Thông Số & Giá Bán | Rate.vn',
    description:
      'Tìm kiếm và đặt lên bàn cân tối đa 4 mẫu điện thoại theo chuẩn 10 nhóm thông số kỹ thuật PhoneArena/GSMArena, lọc điểm khác biệt và so sánh giá thật trên Rate.vn.',
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
    getMasterProducts({ categorySlug: 'smartphones', limit: 24 }),
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
                      Trang chủ
                    </Link>
                  </li>
                  <li className="breadcrumb-item">
                    <Link href="/smartphones" className="text-decoration-none">
                      Điện thoại
                    </Link>
                  </li>
                  <li className="breadcrumb-item active" aria-current="page">
                    So sánh 10 nhóm thông số
                  </li>
                </ol>
              </nav>
              <h1 className="h2 fw-bold mb-1">
                So Sánh Điện Thoại Thông Minh (10 Field Groups)
              </h1>
              <p className="text-muted mb-0">
                Tìm kiếm Autocomplete, thêm tối đa 4 mẫu máy để đối chiếu trực
                quan 10 nhóm thông số chuẩn PhoneArena/GSMArena và giá bán thực
                tế
              </p>
            </div>

            <div>
              <Link
                href="/smartphones"
                className="btn btn-outline-danger rounded-pill fw-medium px-4"
              >
                ← Quay lại Danh mục Điện thoại
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

      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
