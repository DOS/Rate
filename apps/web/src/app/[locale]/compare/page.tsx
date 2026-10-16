import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import {
  type CanonicalCategorySlug,
  getCachedCompareMasterProducts,
  getMasterProductCategorySlug,
  getMasterProducts,
} from '@/server/rate';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ slugs?: string; category?: string }>;
};

const VALID_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

function normalizeCategoryParam(raw?: string): CanonicalCategorySlug {
  if (raw && VALID_CATEGORIES.has(raw as CanonicalCategorySlug)) {
    return raw as CanonicalCategorySlug;
  }
  return 'smartphones';
}

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

  const canonicalUrl = 'https://rate.vn/compare';

  if (requestedSlugs.length >= 2) {
    const compared = await getCachedCompareMasterProducts(
      requestedSlugs.join(',')
    );
    if (compared.length >= 2) {
      const names = compared.map((p) => p.name).join(' vs ');
      return {
        title:
          locale === 'vi'
            ? `So sánh ${names} - Điểm Đánh Giá & 10 Nhóm Thông Số | Rate.vn`
            : locale === 'cs'
              ? `Porovnání ${names} - Hodnocení a 10 skupin parametrů | Rate.vn`
              : `Compare ${names} - Ratings & 10 Spec Groups | Rate.vn`,
        description:
          locale === 'vi'
            ? `Đối chiếu điểm đánh giá thực chất (JReviews), 10 nhóm thông số kỹ thuật chuẩn PhoneArena/GSMArena và giá tham khảo giữa ${names} trên Rate.vn.`
            : `Side-by-side comparison across JReviews ratings, 10 standardized technical spec groups, and verified prices for ${names} on Rate.vn.`,
        alternates: {
          canonical: canonicalUrl,
        },
      };
    }
  }

  return {
    title:
      locale === 'vi'
        ? 'So sánh Thiết bị Cùng Danh Mục - Điểm Đánh Giá & 10 Nhóm Thông Số | Rate.vn'
        : locale === 'cs'
          ? 'Porovnání zařízení ve stejné kategorii - 10 skupin parametrů | Rate.vn'
          : 'Same-Category Device Comparison - Ratings & 10 Spec Groups | Rate.vn',
    description:
      locale === 'vi'
        ? 'Đặt lên bàn cân tối đa 4 thiết bị cùng danh mục (Điện thoại, Máy tính bảng, Laptop, Đồng hồ thông minh hoặc Tai nghe) theo điểm JReviews và 10 nhóm thông số kỹ thuật.'
        : 'Compare up to 4 devices within the same category (Smartphones, Tablets, Laptops, Smartwatches, or Earbuds) across JReviews ratings and 10 technical specification groups.',
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
  const { slugs: slugsParam, category: categoryParam } = await searchParams;
  const requestedSlugs = parseSlugsCsv(slugsParam);

  const [catalogCandidates, requestedProducts] = await Promise.all([
    getMasterProducts({ categorySlug: 'all', limit: 50 }),
    requestedSlugs.length > 0
      ? getCachedCompareMasterProducts(requestedSlugs.join(','))
      : Promise.resolve([]),
  ]);

  const activeCategory: CanonicalCategorySlug =
    requestedProducts.length > 0
      ? getMasterProductCategorySlug(requestedProducts[0]!)
      : normalizeCategoryParam(categoryParam);

  // Strictly lock default products to the active category (never mix Smartphones with Earbuds/Laptops)
  const sameCategoryCandidates = catalogCandidates.filter(
    (c) => getMasterProductCategorySlug(c) === activeCategory
  );

  const initialProducts =
    requestedProducts.length > 0
      ? requestedProducts.filter(
          (p) => getMasterProductCategorySlug(p) === activeCategory
        )
      : sameCategoryCandidates.slice(0, 3);

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <div
        className="min-vh-100 py-md-5 py-4"
        style={{ backgroundColor: 'var(--rate-bg-canvas)' }}
      >
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
                    <Link
                      href={`/${activeCategory}`}
                      className="text-decoration-none"
                    >
                      {locale === 'vi'
                        ? 'Danh mục thiết bị'
                        : locale === 'cs'
                          ? 'Katalog zařízení'
                          : 'Device Catalog'}
                    </Link>
                  </li>
                  <li className="breadcrumb-item active" aria-current="page">
                    {locale === 'vi'
                      ? 'Đối chiếu Điểm Đánh Giá & 10 Nhóm Thông Số'
                      : locale === 'cs'
                        ? 'Porovnání hodnocení a 10 skupin parametrů'
                        : 'Rating & 10-Group Spec Comparison'}
                  </li>
                </ol>
              </nav>
              <div className="rate-eyebrow mb-2">
                Chuẩn Đối Chiếu Cùng Danh Mục (Same-Category Lock)
              </div>
              <h1 className="h2 fw-bold mb-1">
                {locale === 'vi'
                  ? 'Bàn Cân Điểm Đánh Giá Đa Chiều & 10 Nhóm Thông Số Kỹ Thuật'
                  : locale === 'cs'
                    ? 'Porovnání hodnocení a 10 skupin technických parametrů'
                    : 'Side-by-Side Rating & 10-Group Technical Specification Matrix'}
              </h1>
              <p className="text-muted mb-0">
                {locale === 'vi'
                  ? 'Hệ thống tự động khóa cùng danh mục thiết bị (chỉ so sánh Điện thoại với Điện thoại, Tai nghe với Tai nghe, Laptop với Laptop) để đảm bảo kết quả chấm điểm và thông số chính xác tuyệt đối.'
                  : 'Strictly locks comparison slots to the same device category so ratings, technical specs, and price floors are compared fairly.'}
              </p>
            </div>
          </div>

          <CompareWorkspace
            initialProducts={initialProducts}
            catalogCandidates={catalogCandidates}
            initialCategory={activeCategory}
            hasExplicitSlugs={requestedSlugs.length > 0}
            locale={locale}
          />
        </div>
      </div>

      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
