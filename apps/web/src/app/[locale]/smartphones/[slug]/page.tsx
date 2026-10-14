import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import { notFound } from 'next/navigation';
import {
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
  getCachedMasterProductReviews,
  getCachedMasterProductReviewSummary,
} from '@/server/rate';
import JReviewsSection from '@/components/reviews/JReviewsSection';
import PriceHistorySection from '@/components/price-history/PriceHistorySection';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import NavbarDarkDynamic from '../../components/navbar/NavbarDarkDynamic';
import FooterTop from '../../components/footer-top';
import FooterDynamic from '../../components/footer/FooterDynamic';
import BackToTop from '../../components/back-to-top';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';

import { normalizeRateLocale } from '@/lib/rate-i18n';

export type PageParams = Promise<{ locale: string; slug: string }>;

export async function generateCategoryProductMetadata(
  params: PageParams,
  categoryBasePath = '/smartphones'
): Promise<Metadata> {
  const { locale, slug } = await params;
  const lang = normalizeRateLocale(locale);
  const product = await getCachedMasterProductBySlug(slug);
  if (!product) {
    return {
      title:
        lang === 'en'
          ? 'Product Not Found | Rate.vn'
          : lang === 'cs'
            ? 'Produkt nenalezen | Rate.vn'
            : 'Không tìm thấy sản phẩm | Rate.vn',
    };
  }
  const minPrice = Number(product.min_price || 0).toLocaleString('vi-VN');
  const canonicalUrl =
    lang === 'vi'
      ? `https://rate.vn${categoryBasePath}/${product.slug}`
      : `https://rate.vn/${lang}${categoryBasePath}/${product.slug}`;

  return {
    title:
      lang === 'en'
        ? `${product.name} - From ${minPrice} ₫, 10-Group Specs & AI Review Audit | Rate.vn`
        : lang === 'cs'
          ? `${product.name} - Od ${minPrice} ₫, 10 skupin parametrů a AI audit recenzí | Rate.vn`
          : `${product.name} - Giá từ ${minPrice} ₫, Thông số 10 nhóm & Đánh giá thực chất | Rate.vn`,
    description:
      lang === 'en'
        ? `Compare ${product.name} (${product.brand}) prices across ${product.merchant_count || 1} merchants, inspect historical price charts for fake discounts, and read AI-verified buyer reviews on Rate.vn.`
        : lang === 'cs'
          ? `Porovnejte ceny ${product.name} (${product.brand}) z ${product.merchant_count || 1} obchodů, zkontrolujte historii cen a přečtěte si AI ověřené recenze na Rate.vn.`
          : `So sánh giá ${product.name} (${product.brand}) từ ${product.merchant_count || 1} gian hàng, biểu đồ lịch sử giá phát hiện giảm giá ảo và đánh giá thực chất đã lọc Seeding bằng AI trên Rate.vn.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title:
        lang === 'en'
          ? `${product.name} - 10-Group Specs & True Price History | Rate.vn`
          : lang === 'cs'
            ? `${product.name} - 10 skupin parametrů a historie cen | Rate.vn`
            : `${product.name} - So sánh giá & Kiểm định khuyến mãi AI | Rate.vn`,
      description: `Giá tốt nhất từ ${minPrice} ₫. Xem 10 nhóm thông số kỹ thuật chuẩn GSMArena/PhoneArena và biểu đồ lịch sử giá.`,
      url: canonicalUrl,
      images:
        product.images && product.images.length > 0 ? [product.images[0]!] : [],
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  return generateCategoryProductMetadata(params, '/smartphones');
}

export async function ProductDetailView({
  params,
  categoryBasePath = '/smartphones',
  categoryLabel = 'Điện thoại',
}: {
  params: PageParams;
  categoryBasePath?: string;
  categoryLabel?: string;
}) {
  const { locale, slug } = await params;
  const product = await getCachedMasterProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [offers, reviews] = await Promise.all([
    getCachedMasterProductOffers(product.id),
    getCachedMasterProductReviews(product.id),
  ]);
  const [reviewSummary, priceHistory] = await Promise.all([
    getCachedMasterProductReviewSummary(product.id, reviews),
    getCachedMasterProductPriceHistory(product.id, offers),
  ]);

  const specs = product.specifications as ProductSpecifications;
  const keySpecs = product.key_specs as KeySpecs;
  const minPriceFormatted = Number(product.min_price).toLocaleString('vi-VN');
  const maxPriceFormatted = Number(product.max_price).toLocaleString('vi-VN');

  const authenticCount =
    product.authentic_review_count && product.authentic_review_count > 0
      ? product.authentic_review_count
      : reviews.filter((r) => r.include_in_rating && r.helpfulness_weight > 0)
          .length;
  const ignoredCount = reviews.filter(
    (r) => !r.include_in_rating || r.helpfulness_weight === 0
  ).length;
  const displayUserRating =
    product.user_rating_weighted && Number(product.user_rating_weighted) > 0
      ? Number(product.user_rating_weighted)
      : Number(product.average_rating || 0);

  const canonicalUrl =
    locale === 'vi'
      ? `https://rate.vn${categoryBasePath}/${product.slug}`
      : `https://rate.vn/${locale}${categoryBasePath}/${product.slug}`;

  const structuredDataGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Trang chủ',
            item: 'https://rate.vn',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: categoryLabel,
            item: `https://rate.vn${categoryBasePath}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: product.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'Product',
        name: product.name,
        brand: {
          '@type': 'Brand',
          name: product.brand,
        },
        sku: product.model_key,
        image: product.images || [],
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'VND',
          lowPrice: Number(product.min_price || 0),
          highPrice: Number(product.max_price || product.min_price || 0),
          offerCount: offers.length || product.merchant_count || 1,
        },
        ...(displayUserRating > 0 && authenticCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(displayUserRating.toFixed(2)),
                reviewCount: authenticCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredDataGraph).replace(/</g, '\\u003c'),
        }}
      />
      <NavbarDarkDynamic links={[]} />
      <div className="container py-5">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-4">
          <ol className="breadcrumb small">
            <li className="breadcrumb-item">
              <Link href="/" className="text-decoration-none">
                Trang chủ
              </Link>
            </li>
            <li className="breadcrumb-item">
              <Link href={categoryBasePath} className="text-decoration-none">
                {categoryLabel}
              </Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {product.name}
            </li>
          </ol>
        </nav>

        {/* Main Info Section */}
        <div className="row g-4 mb-5">
          {/* Left: Images */}
          <div className="col-lg-5 col-12">
            <div className="card rounded-4 bg-light border-0 p-4 text-center shadow-sm">
              <div
                className="d-flex align-items-center justify-content-center"
                style={{ minHeight: '380px' }}
              >
                {product.images && product.images.length > 0 ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="img-fluid rounded-3"
                    style={{ maxHeight: '350px', objectFit: 'contain' }}
                  />
                ) : (
                  <div className="text-muted">Chưa có ảnh sản phẩm</div>
                )}
              </div>

              {/* Colors */}
              {product.colors && product.colors.length > 0 && (
                <div className="border-top mt-3 pt-3 text-start">
                  <div className="small text-muted mb-2">Màu sắc có sẵn:</div>
                  <div className="d-flex flex-wrap gap-2">
                    {product.colors.map((c, i) => (
                      <span
                        key={i}
                        className="badge text-dark rounded-pill small border bg-white px-3 py-2"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Overview & Offers Highlights */}
          <div className="col-lg-7 d-flex flex-column col-12">
            <div className="d-flex align-items-center mb-2 gap-2">
              <span className="badge bg-primary-subtle text-primary fw-semibold rounded-pill px-3 py-1">
                {product.brand}
              </span>
              {product.has_5g && (
                <span className="badge bg-dark rounded-pill px-2 py-1">5G</span>
              )}
              {product.variant_name && (
                <span className="badge bg-light text-muted rounded-pill border px-2 py-1">
                  {product.variant_name}
                </span>
              )}
            </div>

            <h1 className="h2 fw-bold text-dark mb-2">{product.name}</h1>

            {/* JReviews Dual Rating Quick Pill Strip */}
            <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
              <a
                href="#jreviews-section"
                className="badge bg-warning text-dark text-decoration-none rounded-pill small px-3 py-2"
              >
                ★ {displayUserRating.toFixed(1)} / 5.0 (User thực chất)
              </a>
              {product.expert_rating != null && (
                <a
                  href="#jreviews-section"
                  className="badge bg-dark text-decoration-none rounded-pill small px-3 py-2 text-white"
                >
                  🔬 Expert: {Number(product.expert_rating).toFixed(1)} / 5.0
                </a>
              )}
              <a
                href="#jreviews-section"
                className="badge bg-success-subtle text-success text-decoration-none rounded-pill small px-3 py-2"
              >
                ✓ {authenticCount} đánh giá thực chất
              </a>
              {ignoredCount > 0 && (
                <a
                  href="#jreviews-section"
                  className="badge bg-danger-subtle text-danger text-decoration-none rounded-pill small px-3 py-2"
                >
                  🛡️ Đã lọc {ignoredCount} Seeding / Spam xu
                </a>
              )}
              <a
                href="#price-history-section"
                className={`badge text-decoration-none rounded-pill small px-3 py-2 ${
                  priceHistory.fakeDiscountCount > 0
                    ? 'bg-danger text-white'
                    : 'bg-info-subtle text-info-emphasis'
                }`}
              >
                {priceHistory.fakeDiscountCount > 0
                  ? `🚨 Cảnh báo ${priceHistory.fakeDiscountCount} nơi nâng giá gốc`
                  : '📈 Lịch sử giá & Kiểm định Sale'}
              </a>
            </div>

            {/* Quick specs grid */}
            <div className="row g-2 mb-4">
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Màn hình</div>
                  <div className="fw-semibold">
                    {keySpecs?.screen || 'OLED'}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Vi xử lý</div>
                  <div className="fw-semibold">
                    {keySpecs?.chip || 'Apple A-Series'}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Camera chính</div>
                  <div className="fw-semibold">
                    {keySpecs?.camera || '48 MP'}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Bộ nhớ (RAM/ROM)</div>
                  <div className="fw-semibold">
                    {product.ram_gb ? `${product.ram_gb}GB / ` : ''}
                    {product.storage_gb ? `${product.storage_gb}GB` : ''}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Pin &amp; Sạc</div>
                  <div className="fw-semibold">
                    {keySpecs?.battery || '3500 mAh'}
                  </div>
                </div>
              </div>
              <div className="col-sm-4 col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="text-muted small">Kháng nước/bụi</div>
                  <div className="fw-semibold">
                    {specs?.design?.resistance?.split(' ')[0] || 'IP68'}
                  </div>
                </div>
              </div>
            </div>

            {/* Price Range Box */}
            <div className="card bg-danger-subtle rounded-4 mb-4 border-0 p-4">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
                <div>
                  <div className="text-danger-emphasis small fw-medium">
                    Giá bán tốt nhất thị trường:
                  </div>
                  <div className="h3 fw-bold text-danger mb-0">
                    {minPriceFormatted} ₫
                    {product.min_price !== product.max_price && (
                      <span className="fs-6 fw-normal text-muted ms-2">
                        ~ {maxPriceFormatted} ₫
                      </span>
                    )}
                  </div>
                  {priceHistory.lowestEverPrice != null && (
                    <div className="small text-muted mt-1">
                      Đáy lịch sử:{' '}
                      <strong className="text-success">
                        {priceHistory.lowestEverPrice.toLocaleString('vi-VN')} ₫
                      </strong>
                      {priceHistory.lowestEverMerchant
                        ? ` (${priceHistory.lowestEverMerchant})`
                        : ''}
                    </div>
                  )}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <a
                    href="#offers-table"
                    className="btn btn-danger rounded-pill fw-medium px-4"
                  >
                    Xem {offers.length} nơi bán
                  </a>
                  <a
                    href="#price-history-section"
                    className="btn btn-outline-danger rounded-pill px-3"
                  >
                    📈 Biểu đồ giá
                  </a>
                  <Link
                    href={`/compare?slugs=${product.slug}`}
                    className="btn btn-outline-dark rounded-pill px-3"
                  >
                    Bảng đối chiếu
                  </Link>
                  <PriceWatchButton
                    slug={product.slug}
                    name={product.name}
                    brand={product.brand}
                    categoryPath={categoryBasePath}
                    thumbnail={
                      product.thumbnail ||
                      (product.images && product.images.length > 0
                        ? product.images[0] || null
                        : null)
                    }
                    currentMinPrice={Number(product.min_price || 0)}
                    size="md"
                  />
                  <CompareQuickToggle
                    size="md"
                    item={{
                      slug: product.slug,
                      name: product.name,
                      brand: product.brand,
                      thumbnail:
                        product.thumbnail ||
                        (product.images && product.images.length > 0
                          ? product.images[0] || null
                          : null),
                      min_price: Number(product.min_price || 0),
                    }}
                  />
                </div>
              </div>
            </div>

            <p className="text-muted small lh-base">
              Mã định danh dữ liệu chuẩn (Canonical Model Key):{' '}
              <code>{product.model_key}</code>
            </p>
          </div>
        </div>

        {/* 10 Field Groups Specifications */}
        <div className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm">
          <h2 className="h4 fw-bold d-flex align-items-center mb-4 gap-2">
            <span>📋</span> Bảng Thông Số Kỹ Thuật Chi Tiết (10 Nhóm Chuẩn Hóa)
          </h2>

          <div className="row g-4">
            {/* 1. Màn hình */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  1. Màn hình (Display)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Kích thước</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.size_inch
                      ? `${specs.display.size_inch} inch`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Công nghệ</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.type || '-'}
                  </dd>
                  <dt className="text-muted col-5">Độ phân giải</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.resolution || '-'}
                  </dd>
                  <dt className="text-muted col-5">Tần số quét</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.refresh_rate_hz
                      ? `${specs.display.refresh_rate_hz} Hz`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Mật độ điểm ảnh</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.ppi ? `${specs.display.ppi} ppi` : '-'}
                  </dd>
                  <dt className="text-muted col-5">Kính bảo vệ</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.protection || '-'}
                  </dd>
                  <dt className="text-muted col-5">Tính năng</dt>
                  <dd className="fw-medium col-7">
                    {specs?.display?.features || '-'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 2. Phần cứng */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  2. Phần cứng &amp; Hiệu năng (Hardware)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Chipset</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.chipset || '-'}
                  </dd>
                  <dt className="text-muted col-5">CPU</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.cpu || '-'}
                  </dd>
                  <dt className="text-muted col-5">GPU</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.gpu || '-'}
                  </dd>
                  <dt className="text-muted col-5">RAM</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.ram_gb
                      ? `${specs.hardware.ram_gb} GB`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Bộ nhớ trong</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.storage_gb
                      ? `${specs.hardware.storage_gb} GB`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Thẻ nhớ ngoài</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.storage_expansion || '-'}
                  </dd>
                  <dt className="text-muted col-5">Hệ điều hành</dt>
                  <dd className="fw-medium col-7">
                    {specs?.hardware?.os || '-'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 3. Camera */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  3. Máy ảnh (Camera)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Cụm sau</dt>
                  <dd className="fw-medium col-7">
                    {specs?.camera?.rear_setup || '-'}
                  </dd>
                  <dt className="text-muted col-5">Camera chính</dt>
                  <dd className="fw-medium col-7">
                    {specs?.camera?.main_camera || '-'}
                  </dd>
                  <dt className="text-muted col-5">Camera trước</dt>
                  <dd className="fw-medium col-7">
                    {specs?.camera?.front_camera || '-'}
                  </dd>
                  <dt className="text-muted col-5">Đèn Flash</dt>
                  <dd className="fw-medium col-7">
                    {specs?.camera?.flash || '-'}
                  </dd>
                  <dt className="text-muted col-5">Quay video</dt>
                  <dd className="fw-medium col-7">
                    {specs?.camera?.video_recording || '-'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 4. Pin & Sạc */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  4. Pin &amp; Sạc (Battery)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Dung lượng pin</dt>
                  <dd className="fw-medium col-7">
                    {specs?.battery?.capacity_mah
                      ? `${specs.battery.capacity_mah} mAh`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Loại pin</dt>
                  <dd className="fw-medium col-7">
                    {specs?.battery?.type || '-'}
                  </dd>
                  <dt className="text-muted col-5">Công nghệ sạc</dt>
                  <dd className="fw-medium col-7">
                    {specs?.battery?.charging || '-'}
                  </dd>
                  <dt className="text-muted col-5">Công suất sạc nhanh</dt>
                  <dd className="fw-medium col-7">
                    {specs?.battery?.fast_charging_w
                      ? `${specs.battery.fast_charging_w} W`
                      : '-'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 5. Thiết kế */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  5. Thiết kế &amp; Độ bền (Design)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Kích thước</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.dimensions || '-'}
                  </dd>
                  <dt className="text-muted col-5">Trọng lượng</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.weight_g
                      ? `${specs.design.weight_g} g`
                      : '-'}
                  </dd>
                  <dt className="text-muted col-5">Chất liệu</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.materials || '-'}
                  </dd>
                  <dt className="text-muted col-5">Kháng nước, bụi</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.resistance || '-'}
                  </dd>
                  <dt className="text-muted col-5">Bảo mật</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.biometrics || '-'}
                  </dd>
                  <dt className="text-muted col-5">Phím chức năng</dt>
                  <dd className="fw-medium col-7">
                    {specs?.design?.keys || '-'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 6. Kết nối & Mạng */}
            <div className="col-md-6 col-12">
              <div className="rounded-4 h-100 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  6. Kết nối &amp; 5G (Cellular &amp; Connectivity)
                </h3>
                <dl className="row small mb-0">
                  <dt className="text-muted col-5">Hỗ trợ 5G</dt>
                  <dd className="fw-medium col-7">
                    {specs?.cellular?.has_5g ? 'Có (Sub-6 / mmWave)' : 'Không'}
                  </dd>
                  <dt className="text-muted col-5">SIM</dt>
                  <dd className="fw-medium col-7">
                    {specs?.cellular?.sim_type || '-'}
                  </dd>
                  <dt className="text-muted col-5">Wi-Fi</dt>
                  <dd className="fw-medium col-7">
                    {specs?.connectivity?.wlan || '-'}
                  </dd>
                  <dt className="text-muted col-5">Bluetooth</dt>
                  <dd className="fw-medium col-7">
                    {specs?.connectivity?.bluetooth || '-'}
                  </dd>
                  <dt className="text-muted col-5">Cổng kết nối</dt>
                  <dd className="fw-medium col-7">
                    {specs?.connectivity?.usb || '-'}
                  </dd>
                  <dt className="text-muted col-5">NFC</dt>
                  <dd className="fw-medium col-7">
                    {specs?.connectivity?.nfc ? 'Có' : 'Không'}
                  </dd>
                </dl>
              </div>
            </div>

            {/* 7. Đa phương tiện & Quy chuẩn */}
            <div className="col-12">
              <div className="rounded-4 border bg-white p-4">
                <h3 className="h6 fw-bold text-primary mb-3">
                  7. Âm thanh, Pháp lý &amp; Phát hành (Misc &amp; Regulatory)
                </h3>
                <div className="row g-3 small">
                  <div className="col-md-6 col-12">
                    <div className="text-muted">Âm thanh:</div>
                    <div className="fw-medium">
                      {specs?.multimedia?.loudspeaker || '-'} |{' '}
                      {specs?.multimedia?.audio_features || '-'}
                    </div>
                  </div>
                  <div className="col-md-6 col-12">
                    <div className="text-muted">
                      Ngày phát hành &amp; Chứng nhận:
                    </div>
                    <div className="fw-medium">
                      {specs?.availability?.announced || '-'} |{' '}
                      {specs?.regulatory?.certifications || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Offers Table */}
        <div
          id="offers-table"
          className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm"
        >
          <h2 className="h4 fw-bold d-flex align-items-center mb-4 gap-2">
            <span>🛒</span> So Sánh Nơi Bán &amp; Độ Tin Cậy Gian Hàng (
            {offers.length} sàn)
          </h2>

          {offers.length === 0 ? (
            <p className="text-muted mb-0">
              Hiện chưa có sàn bán nào liên kết với mẫu máy này.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table-hover mb-0 table align-middle">
                <thead className="table-light small">
                  <tr>
                    <th scope="col" style={{ width: '25%' }}>
                      Sàn &amp; Gian Hàng
                    </th>
                    <th scope="col">Tiêu đề niêm yết</th>
                    <th scope="col">Độ tin cậy (DOSafe + AI Review)</th>
                    <th scope="col">Giá bán</th>
                    <th scope="col" className="text-end">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((offer) => {
                    const price = offer.price_current.toLocaleString('vi-VN');
                    const origPrice = offer.price_original
                      ? offer.price_original.toLocaleString('vi-VN')
                      : null;
                    const trustScore = Math.max(
                      0,
                      100 - (offer.merchant.risk_score || 0)
                    );
                    const trustBadgeClass =
                      trustScore >= 80
                        ? 'bg-success-subtle text-success'
                        : trustScore >= 50
                          ? 'bg-warning-subtle text-warning-emphasis'
                          : 'bg-danger-subtle text-danger';

                    const discountAnalysis = priceHistory.byOffer[offer.id];
                    const discountBadgeClass =
                      discountAnalysis?.verdict === 'fake_discount'
                        ? 'bg-danger text-white'
                        : discountAnalysis?.verdict === 'suspicious_discount'
                          ? 'bg-warning text-dark'
                          : discountAnalysis?.verdict === 'genuine_deal'
                            ? 'bg-success text-white'
                            : 'bg-light text-secondary border';
                    const discountIcon =
                      discountAnalysis?.verdict === 'fake_discount'
                        ? '🚨'
                        : discountAnalysis?.verdict === 'suspicious_discount'
                          ? '⚠️'
                          : discountAnalysis?.verdict === 'genuine_deal'
                            ? '✅'
                            : '📊';

                    return (
                      <tr key={offer.id}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-danger text-uppercase small">
                              {offer.platform}
                            </span>
                            <div>
                              <div className="fw-semibold small">
                                {offer.merchant.id ? (
                                  <Link
                                    href={`/merchants/${offer.merchant.id}`}
                                    className="text-dark text-decoration-none"
                                  >
                                    {offer.merchant.name}
                                  </Link>
                                ) : (
                                  offer.merchant.name
                                )}
                              </div>
                              {offer.merchant.is_official && (
                                <span className="badge bg-success-subtle text-success small">
                                  Chính hãng (Mall)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className="small text-truncate"
                          style={{ maxWidth: '280px' }}
                        >
                          {offer.title}
                        </td>
                        <td>
                          <div className="d-flex flex-column gap-1">
                            <div>
                              {offer.merchant.id ? (
                                <Link
                                  href={`/merchants/${offer.merchant.id}`}
                                  className={`badge ${trustBadgeClass} text-decoration-none small`}
                                  title="Xem hồ sơ tín nhiệm gian hàng"
                                >
                                  Trust: {trustScore}% ↗
                                </Link>
                              ) : (
                                <span
                                  className={`badge ${trustBadgeClass} small`}
                                >
                                  Trust: {trustScore}%
                                </span>
                              )}
                            </div>
                            <div
                              className="text-muted"
                              style={{ fontSize: '0.72rem' }}
                            >
                              DOSafe: {offer.merchant.dosafe_risk_score}/100 |
                              Review Risk: {offer.merchant.review_risk_score}
                              /100
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="fw-bold text-danger">{price} ₫</div>
                          {origPrice && (
                            <div className="text-muted small text-decoration-line-through">
                              {origPrice} ₫
                            </div>
                          )}
                          {discountAnalysis && (
                            <div className="mt-1">
                              <a
                                href="#price-history-section"
                                title={discountAnalysis.explanation}
                                className={`badge ${discountBadgeClass} text-decoration-none rounded-pill small`}
                                style={{ fontSize: '0.7rem' }}
                              >
                                {discountIcon} {discountAnalysis.badge_label}
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="text-end">
                          <a
                            href={offer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-primary rounded-pill px-3"
                          >
                            Tới nơi bán ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Time-Series Price History Chart & Fake Discount Detector */}
        <PriceHistorySection
          productName={product.name}
          history={priceHistory}
        />

        {/* JReviews Dual-Rating, AI Review Synthesis & Interactive Voting */}
        <JReviewsSection
          masterProductId={product.id}
          productSlug={product.slug}
          productName={product.name}
          averageRating={Number(product.average_rating || 0)}
          userRatingWeighted={
            product.user_rating_weighted &&
            Number(product.user_rating_weighted) > 0
              ? Number(product.user_rating_weighted)
              : null
          }
          expertRating={
            product.expert_rating != null ? Number(product.expert_rating) : null
          }
          expertReviewSummary={product.expert_review_summary || null}
          authenticReviewCount={authenticCount}
          ignoredReviewCount={ignoredCount}
          reviews={reviews}
          summary={reviewSummary}
        />
      </div>
      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}

export default async function SmartphoneDetailPage({
  params,
}: {
  params: PageParams;
}) {
  return (
    <ProductDetailView
      params={params}
      categoryBasePath="/smartphones"
      categoryLabel="Điện thoại"
    />
  );
}
