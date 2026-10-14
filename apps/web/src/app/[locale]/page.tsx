import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from './components/navbar/NavbarDarkDynamic';
import { getMasterProducts } from '@/lib/rate-api';
import {
  getCachedMerchantsList,
  getCachedRatePlatformStats,
  type MerchantSummary,
  type RatePlatformStats,
} from '@/server/rate';
import type { MasterProduct } from '@repo/shared-data';
import {
  BsCheckCircleFill,
  BsCpu,
  BsGraphUpArrow,
  BsHeadphones,
  BsLaptop,
  BsMouse,
  BsPhone,
  BsShieldCheck,
  BsShieldExclamation,
  BsShop,
  BsSmartwatch,
  BsStarFill,
  BsTabletLandscape,
} from 'react-icons/bs';
import BrandImage from './components/brand-image';
import FooterTop from './components/footer-top';
import FooterDynamic from './components/footer/FooterDynamic';
import BackToTop from './components/back-to-top';
import HeroSearchInspector from '@/components/home/HeroSearchInspector';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import CompareTrayBar from '@/components/compare/CompareTrayBar';

function getCategoryIcon(slug: string) {
  switch (slug) {
    case 'smartphones':
      return <BsPhone className="fs-2 text-primary" />;
    case 'laptops':
      return <BsLaptop className="fs-2 text-primary" />;
    case 'tablets':
      return <BsTabletLandscape className="fs-2 text-primary" />;
    case 'smartwatches':
      return <BsSmartwatch className="fs-2 text-primary" />;
    case 'earbuds':
      return <BsHeadphones className="fs-2 text-primary" />;
    default:
      return <BsCpu className="fs-2 text-primary" />;
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let masterProducts: MasterProduct[] = [];
  let merchants: MerchantSummary[] = [];
  let platformStats: RatePlatformStats = {
    masterProductsCount: 0,
    listingsCount: 0,
    merchantsCount: 0,
    priceObservationsCount: 0,
    totalReviewsCount: 0,
    authenticReviewsCount: 0,
    filteredSeedingCount: 0,
    authenticRatioPct: 100,
    categoriesWithCounts: [],
    recentReviewsSample: [],
  };

  try {
    const [productsRes, merchantsRes, statsRes] = await Promise.all([
      getMasterProducts({ limit: 6 }),
      getCachedMerchantsList(),
      getCachedRatePlatformStats(),
    ]);
    masterProducts = productsRes;
    merchants = merchantsRes;
    platformStats = statsRes;
  } catch (err) {
    console.error(
      'Error fetching homepage data from Supabase rate schema:',
      err
    );
  }

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      {/* Hero Section with Interactive Autocomplete & E-commerce Link Inspector */}
      <div
        className="image-cover hero-header position-relative overflow-hidden"
        style={{
          backgroundImage: `url('/img/banner-6.jpg')`,
          paddingBottom: '5.5rem',
        }}
        data-overlay="7"
      >
        <div className="container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
              <div className="position-relative mb-4 pt-3 pb-2 text-center">
                <div className="d-inline-flex align-items-center rounded-pill bg-dark bg-opacity-75 border-light border-opacity-25 text-light small fw-semibold mb-3 gap-2 border px-3 py-1">
                  <BsShieldCheck className="text-success" />
                  <span>
                    {locale === 'vi'
                      ? 'Nền Tảng Đối Chiếu Thông Số, Lịch Sử Giá Thật & Kiểm Toán Đánh Giá Đa Sàn'
                      : 'Cross-Platform Spec Intelligence, True Price History & AI Review Auditing'}
                  </span>
                </div>
                <h1 className="fw-bold mb-3 text-white">
                  {locale === 'vi' ? (
                    <>
                      Tra Cứu{' '}
                      <span className="text-light border-light rounded-pill br-dashed border border-2 px-3">
                        Giá Thật &amp; Điểm Tín Nhiệm
                      </span>{' '}
                      Trước Khi Mua
                    </>
                  ) : (
                    <>
                      Verify{' '}
                      <span className="text-light border-light rounded-pill br-dashed border border-2 px-3">
                        True Price &amp; Shop Trust
                      </span>{' '}
                      Before Buying
                    </>
                  )}
                </h1>
                <p className="fs-5 fw-light text-opacity-75 mb-0 text-white">
                  {locale === 'vi'
                    ? 'Chuẩn hóa 10 nhóm thông số GSMArena & PhoneArena, phát hiện nâng khống giá gốc và lọc bình luận Seeding bằng AI.'
                    : 'Standardized 10-group technical specs, fake discount detection, and AI-powered review seeding protection.'}
                </p>
              </div>
            </div>
          </div>

          <div className="row justify-content-center align-items-center">
            <div className="col-xl-9 col-lg-10 col-md-12 col-sm-12">
              <HeroSearchInspector
                initialProducts={masterProducts}
                initialMerchants={merchants}
              />
            </div>
          </div>

          {/* Live Platform Telemetry Strip */}
          <div className="row justify-content-center mt-4 pt-2">
            <div className="col-xl-9 col-lg-10 col-12">
              <div className="row g-2 text-center">
                <div className="col-md-3 col-6">
                  <div className="rounded-3 bg-dark bg-opacity-50 border-light border-opacity-10 border p-2 text-white">
                    <div className="fw-bold fs-5 text-warning">
                      {platformStats.masterProductsCount}
                    </div>
                    <div className="small text-white-50">
                      Sản phẩm chuẩn hóa 10 nhóm
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-6">
                  <div className="rounded-3 bg-dark bg-opacity-50 border-light border-opacity-10 border p-2 text-white">
                    <div className="fw-bold fs-5 text-info">
                      {platformStats.priceObservationsCount}
                    </div>
                    <div className="small text-white-50">
                      Điểm đối chiếu lịch sử giá
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-6">
                  <div className="rounded-3 bg-dark bg-opacity-50 border-light border-opacity-10 border p-2 text-white">
                    <div className="fw-bold fs-5 text-success">
                      {platformStats.totalReviewsCount}
                    </div>
                    <div className="small text-white-50">
                      Đánh giá đã kiểm duyệt AI
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-6">
                  <div className="rounded-3 bg-dark bg-opacity-50 border-light border-opacity-10 border p-2 text-white">
                    <div className="fw-bold fs-5 text-light">
                      {platformStats.merchantsCount}
                    </div>
                    <div className="small text-white-50">
                      Gian hàng chấm điểm rủi ro kép
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mousedrop d-none d-lg-block z-1">
          <Link
            href="#mains"
            className="mousewheel center"
            style={{
              bottom: '24px',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            <BsMouse className="" />
          </Link>
        </div>
      </div>

      <section className="py-4 pb-0">
        <div className="container">
          <BrandImage />
        </div>
      </section>

      {/* Section 1: Live Categories from rate.categories */}
      <section className="py-5 pb-4" id="mains">
        <div className="container">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-end mb-4 gap-3">
            <div>
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                🗂️ Danh Mục Thiết Bị Công Nghệ Đa Sàn
              </span>
              <h3 className="sectionHeading mb-1">
                Khám Phá Theo{' '}
                <span className="text-primary">Ngành Hàng Chuẩn Hóa</span>
              </h3>
              <p className="text-muted mb-0">
                Mọi danh mục đều hỗ trợ bộ lọc chuyên sâu theo 10 nhóm thông số
                kỹ thuật và đối chiếu giá theo thời gian thực
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link
                href="/smartphones"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                📱 Điện thoại
              </Link>
              <Link
                href="/laptops"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                💻 Laptop
              </Link>
              <Link
                href="/tablets"
                className="btn btn-sm btn-outline-primary rounded-pill px-3"
              >
                📟 Máy tính bảng
              </Link>
              <Link
                href="/merchants"
                className="btn btn-sm btn-outline-dark rounded-pill px-3"
              >
                🏪 Hồ sơ gian hàng
              </Link>
            </div>
          </div>

          <div className="row g-3">
            {platformStats.categoriesWithCounts.map((cat) => (
              <div key={cat.id} className="col-xl col-lg-4 col-md-6 col-12">
                <Link href={cat.routeHref} className="text-decoration-none">
                  <div className="card rounded-4 hover-shadow h-100 border bg-white p-3 shadow-sm transition">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div className="rounded-3 bg-primary bg-opacity-10 d-inline-flex align-items-center justify-content-center p-3">
                        {getCategoryIcon(cat.slug)}
                      </div>
                      <span
                        className={`badge rounded-pill px-3 py-2 ${
                          cat.productCount > 0
                            ? 'bg-success bg-opacity-10 text-success border-success border-opacity-25 border'
                            : 'bg-secondary bg-opacity-10 text-secondary'
                        }`}
                      >
                        {cat.productCount > 0
                          ? `${cat.productCount} mẫu sẵn sàng`
                          : 'Đang mở rộng'}
                      </span>
                    </div>
                    <h5 className="fw-bold text-dark mb-1">{cat.name}</h5>
                    <p className="text-muted small mb-0">
                      {cat.slug === 'smartphones' &&
                        'Lọc theo Chipset, RAM/ROM, tần số quét Hz, pin mAh & sạc nhanh W'}
                      {cat.slug === 'laptops' &&
                        'Lọc theo CPU, RAM, SSD, tấm nền màn hình & trọng lượng chuẩn hóa'}
                      {cat.slug === 'tablets' &&
                        'Lọc theo kích thước màn hình, dung lượng lưu trữ, kết nối 5G/Wi-Fi'}
                      {cat.slug === 'smartwatches' &&
                        'Đồng hồ thông minh theo dõi sức khỏe, GPS & thời lượng pin'}
                      {cat.slug === 'earbuds' &&
                        'Tai nghe chống ồn chủ động ANC, chuẩn codec Hi-Res & pin'}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Featured Master Products from rate.master_products */}
      {masterProducts.length > 0 && (
        <section className="border-top border-bottom bg-white py-5">
          <div className="container">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
              <div>
                <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                  ⚡ Chuẩn Hóa 10 Nhóm Thông Số GSMArena &amp; PhoneArena
                </span>
                <h3 className="sectionHeading mb-1">
                  Sản Phẩm{' '}
                  <span className="text-primary">
                    Đã Kiểm Chứng Thông Số &amp; Lịch Sử Giá
                  </span>
                </h3>
                <p className="text-muted mb-0">
                  Dữ liệu chuẩn hóa từ hệ thống `rate.master_products` trên
                  Supabase Cloud, kèm kiểm toán giá thật và đánh giá JReviews
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/smartphones"
                  className="btn btn-outline-primary rounded-pill fw-medium px-3 py-2"
                >
                  Xem toàn bộ danh mục ({platformStats.masterProductsCount}) →
                </Link>
                {masterProducts.length >= 2 && (
                  <Link
                    href={`/compare?slugs=${masterProducts
                      .map((p) => p.slug)
                      .slice(0, 3)
                      .join(',')}`}
                    className="btn btn-primary rounded-pill fw-medium px-3 py-2"
                  >
                    ⚖️ So sánh thông số ({Math.min(3, masterProducts.length)}{' '}
                    máy)
                  </Link>
                )}
              </div>
            </div>

            <div className="row g-4">
              {masterProducts.map((item) => {
                const minPrice = Number(item.min_price).toLocaleString('vi-VN');
                const maxPrice = Number(item.max_price).toLocaleString('vi-VN');
                const priceText =
                  item.min_price === item.max_price
                    ? `${minPrice} ₫`
                    : `${minPrice} ₫ - ${maxPrice} ₫`;
                const thumb =
                  item.thumbnail ||
                  (item.images && item.images.length > 0
                    ? item.images[0]
                    : '/img/placeholder.png');
                const keySpecs = item.key_specs || {};

                return (
                  <div key={item.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card rounded-4 h-100 border p-3 shadow-sm transition">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex flex-wrap gap-1">
                          <span className="badge bg-secondary bg-opacity-10 text-secondary">
                            {item.brand}
                          </span>
                          {item.ram_gb ? (
                            <span className="badge bg-info bg-opacity-10 text-info">
                              {item.ram_gb}GB RAM
                            </span>
                          ) : null}
                          {item.storage_gb ? (
                            <span className="badge bg-primary bg-opacity-10 text-primary">
                              {item.storage_gb}GB
                            </span>
                          ) : null}
                        </div>
                        <CompareQuickToggle
                          item={{
                            slug: item.slug,
                            name: item.name,
                            brand: item.brand,
                            thumbnail: thumb ?? null,
                            min_price: Number(item.min_price),
                          }}
                        />
                      </div>

                      <div
                        className="d-flex justify-content-center align-items-center bg-light rounded-3 mb-3 p-3"
                        style={{ minHeight: '195px' }}
                      >
                        <img
                          src={thumb}
                          alt={item.name}
                          className="img-fluid object-fit-contain rounded"
                          style={{ maxHeight: '165px' }}
                        />
                      </div>

                      <h5 className="fw-bold mb-2">
                        <Link
                          href={`/smartphones/${item.slug}`}
                          className="text-dark text-decoration-none"
                        >
                          {item.name}
                        </Link>
                      </h5>

                      <div className="text-primary fw-bold fs-5 mb-2">
                        {priceText}
                      </div>

                      {/* Quick Key Specs pills */}
                      <div className="d-flex mb-3 flex-wrap gap-1">
                        {keySpecs.screen && (
                          <span className="badge bg-light text-dark fw-normal border">
                            📱 {String(keySpecs.screen)}
                          </span>
                        )}
                        {keySpecs.chip && (
                          <span className="badge bg-light text-dark fw-normal border">
                            ⚙️ {String(keySpecs.chip)}
                          </span>
                        )}
                        {keySpecs.battery && (
                          <span className="badge bg-light text-dark fw-normal border">
                            🔋 {String(keySpecs.battery)}
                          </span>
                        )}
                      </div>

                      <div className="d-flex justify-content-between align-items-center text-muted small border-top mt-auto pt-3">
                        <span>🏪 {item.merchant_count || 1} gian hàng</span>
                        <span>
                          ⭐ {Number(item.average_rating || 5).toFixed(1)} (
                          {item.total_reviews || 0} đánh giá thật)
                        </span>
                      </div>
                      <div className="d-grid mt-3">
                        <Link
                          href={`/smartphones/${item.slug}`}
                          className="btn btn-primary rounded-pill fw-medium"
                        >
                          Xem 10 nhóm thông số &amp; lịch sử giá →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Section 3: Merchant Trust Directory Preview (Dual Risk Score) */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
            <div>
              <span className="badge bg-success bg-opacity-10 text-success rounded-pill fw-semibold mb-2 px-3 py-2">
                🛡️ Hệ Thống Chấm Điểm Tín Nhiệm Kép (Dual Risk Score)
              </span>
              <h3 className="sectionHeading mb-1">
                Hồ Sơ Tín Nhiệm{' '}
                <span className="text-primary">Gian Hàng TMĐT</span>
              </h3>
              <p className="text-muted mb-0">
                Tách bạch rõ ràng điểm rủi ro an ninh mạng (`DOSafe Threat
                Intel`) và điểm rủi ro gian lận đánh giá (`AI Review Seeding
                Risk`)
              </p>
            </div>
            <div>
              <Link
                href="/merchants"
                className="btn btn-outline-primary rounded-pill fw-medium px-4 py-2"
              >
                Tra cứu tất cả gian hàng ({platformStats.merchantsCount}) →
              </Link>
            </div>
          </div>

          <div className="row g-4">
            {merchants.map((merchant) => {
              const isTrusted = merchant.risk_score < 20;
              const isCaution =
                merchant.risk_score >= 20 && merchant.risk_score < 50;
              const badgeClass = isTrusted
                ? 'bg-success bg-opacity-10 text-success border-success'
                : isCaution
                  ? 'bg-warning bg-opacity-10 text-warning border-warning'
                  : 'bg-danger bg-opacity-10 text-danger border-danger';
              const trustLabel = isTrusted
                ? 'Gian Hàng Uy Tín Cao'
                : isCaution
                  ? 'Cần Lưu Ý Kiểm Tra'
                  : 'Rủi Ro Cao';
              const breakdown = merchant.review_risk_breakdown;
              const totalRevAnalyzed = breakdown?.total_reviews ?? 0;
              const flaggedRevCount =
                (breakdown?.seeding_fake_count ?? 0) +
                (breakdown?.coin_spam_count ?? 0) +
                (breakdown?.sabotage_or_bombing_count ?? 0);

              return (
                <div key={merchant.id} className="col-lg-6 col-12">
                  <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                    <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold fs-4"
                          style={{ width: '54px', height: '54px' }}
                        >
                          <BsShop />
                        </div>
                        <div>
                          <div className="d-flex align-items-center flex-wrap gap-2">
                            <h5 className="fw-bold mb-0">
                              <Link
                                href={`/merchants/${merchant.id}`}
                                className="text-dark text-decoration-none"
                              >
                                {merchant.name}
                              </Link>
                            </h5>
                            {merchant.is_official && (
                              <span className="badge bg-danger rounded-pill small px-2 py-1 text-white">
                                <BsCheckCircleFill className="me-1" />
                                Official Mall
                              </span>
                            )}
                          </div>
                          <div className="text-muted small mt-1">
                            Sàn:{' '}
                            <span className="text-uppercase fw-semibold text-dark">
                              {merchant.platform}
                            </span>{' '}
                            • Mã Shop: <code>{merchant.platform_shop_id}</code>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`badge rounded-pill fw-semibold border px-3 py-2 ${badgeClass}`}
                      >
                        🛡️ {trustLabel} (Trust: {merchant.trust_score}/100)
                      </span>
                    </div>

                    <div className="row g-2 mb-3">
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            DOSafe Threat Risk
                          </div>
                          <div className="fw-bold text-success">
                            {merchant.dosafe_risk_score}/100
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            Không phát hiện lừa đảo
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            AI Review Seeding Risk
                          </div>
                          <div className="fw-bold text-primary">
                            {merchant.review_risk_score}/100
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            {flaggedRevCount}/{totalRevAnalyzed} review bị gắn
                            cờ
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-12">
                        <div className="rounded-3 bg-light border p-2 text-center">
                          <div className="small text-muted">
                            Đánh giá &amp; Sản phẩm
                          </div>
                          <div className="fw-bold text-dark">
                            ⭐ {(merchant.rating_star ?? 5).toFixed(1)} •{' '}
                            {merchant.product_count} SP
                          </div>
                          <div
                            className="text-muted"
                            style={{ fontSize: '11px' }}
                          >
                            {merchant.follower_count > 0
                              ? `${merchant.follower_count.toLocaleString('vi-VN')} người theo dõi`
                              : 'Đang theo dõi định kỳ'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center border-top pt-2">
                      <span className="small text-muted">
                        Cập nhật lần cuối:{' '}
                        {merchant.updated_at
                          ? new Date(merchant.updated_at).toLocaleDateString(
                              'vi-VN'
                            )
                          : '14/10/2026'}
                      </span>
                      <Link
                        href={`/merchants/${merchant.id}`}
                        className="btn btn-sm btn-primary rounded-pill fw-medium px-3"
                      >
                        Xem hồ sơ kiểm toán chi tiết →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 4: Real Buyer Reviews Audited by AI (Replaces fake ClientOne) */}
      {platformStats.recentReviewsSample.length > 0 && (
        <section className="bg-white py-5">
          <div className="container">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
              <div>
                <span className="badge bg-info bg-opacity-10 text-info rounded-pill fw-semibold mb-2 px-3 py-2">
                  🤖 Kiểm Duyệt Bởi AI Review Analyzer (5 Tầng Phân Loại)
                </span>
                <h3 className="sectionHeading mb-1">
                  Đánh Giá Thực Tế{' '}
                  <span className="text-primary">Đã Qua Sàng Lọc Seeding</span>
                </h3>
                <p className="text-muted mb-0">
                  Mỗi đánh giá từ sàn TMĐT đều được AI chấm điểm độ tin cậy, tự
                  động tách biệt bình luận rác cày xu (`low_value_coin_spam`) và
                  bình luận ảo (`seeding_fake`)
                </p>
              </div>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-3 py-2">
                  ✅ {platformStats.authenticReviewsCount} Đánh giá thực chất (
                  {platformStats.authenticRatioPct}%)
                </span>
                {platformStats.filteredSeedingCount > 0 && (
                  <span className="badge bg-warning bg-opacity-10 text-warning rounded-pill px-3 py-2">
                    ⚠️ {platformStats.filteredSeedingCount} Bình luận cày xu /
                    seeding đã lọc
                  </span>
                )}
              </div>
            </div>

            <div className="row g-4">
              {platformStats.recentReviewsSample.map((rev) => {
                const isFlagged =
                  !rev.include_in_rating || rev.flag_category !== 'authentic';
                const confidencePct =
                  rev.fake_probability != null
                    ? Math.round((1 - Number(rev.fake_probability)) * 100)
                    : 95;

                return (
                  <div key={rev.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card rounded-4 d-flex flex-column h-100 border bg-white p-3 shadow-sm">
                      <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <div>
                          <div className="fw-bold text-dark">
                            {rev.author_name}
                          </div>
                          <div className="d-flex align-items-center text-warning small gap-1">
                            {Array.from({
                              length: Math.max(1, Math.min(5, rev.rating_star)),
                            }).map((_, idx) => (
                              <BsStarFill key={idx} />
                            ))}
                          </div>
                        </div>
                        {isFlagged ? (
                          <span className="badge bg-warning bg-opacity-10 text-warning border-warning rounded-pill small border px-2 py-1">
                            <BsShieldExclamation className="me-1" />
                            {rev.flag_category === 'low_value_coin_spam'
                              ? 'Spam cày xu'
                              : 'Nghi vấn Seeding'}
                          </span>
                        ) : (
                          <span className="badge bg-success bg-opacity-10 text-success border-success rounded-pill small border px-2 py-1">
                            <BsCheckCircleFill className="me-1" />
                            Đánh giá thực chất ({confidencePct}%)
                          </span>
                        )}
                      </div>

                      <p
                        className="text-secondary small mb-3 flex-grow-1"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        &ldquo;{rev.comment}&rdquo;
                      </p>

                      <div className="border-top d-flex justify-content-between align-items-center small mt-auto pt-2">
                        {rev.masterSlug ? (
                          <Link
                            href={`/smartphones/${rev.masterSlug}`}
                            className="text-primary fw-semibold text-decoration-none text-truncate"
                            style={{ maxWidth: '70%' }}
                          >
                            📱 {rev.productTitle}
                          </Link>
                        ) : (
                          <span
                            className="text-muted text-truncate"
                            style={{ maxWidth: '70%' }}
                          >
                            📱 {rev.productTitle}
                          </span>
                        )}
                        <span className="text-muted">Shopee Mall</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Section 5: Core Platform Capabilities (Replaces fake BlogOne) */}
      <section className="bg-light border-top py-5">
        <div className="container">
          <div className="row justify-content-center mb-4">
            <div className="col-xl-8 col-lg-9 text-center">
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                🔬 Kiến Trúc Minh Bạch Open-Core 2026
              </span>
              <h3 className="sectionHeading mb-2">
                Vì Sao Người Mua Tin Dùng{' '}
                <span className="text-primary">Rate.vn</span>?
              </h3>
              <p className="text-muted mb-0">
                Ba lớp bảo vệ độc lập giúp bạn không bao giờ mua nhầm hàng nâng
                giá ảo hoặc tin nhầm bình luận Seeding
              </p>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-4 col-md-6 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-primary bg-opacity-10 text-primary d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsCpu className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">
                  1. Chuẩn Hóa 10 Nhóm Thông Số Kỹ Thuật
                </h5>
                <p className="text-muted small mb-3">
                  Mọi biến thể RAM/ROM rắc rối trên các sàn TMĐT đều được chuẩn
                  hóa theo cấu trúc 10 Field Groups kết hợp độ sâu của GSMArena
                  và bố cục trực quan của PhoneArena.
                </p>
                <Link
                  href="/compare"
                  className="text-primary small fw-semibold text-decoration-none mt-auto"
                >
                  Mở bàn cân so sánh tối đa 4 máy →
                </Link>
              </div>
            </div>

            <div className="col-lg-4 col-md-6 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-success bg-opacity-10 text-success d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsGraphUpArrow className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">
                  2. Phát Hiện Chiêu Trò Nâng Giá Gốc Để Giảm Ảo
                </h5>
                <p className="text-muted small mb-3">
                  Hệ thống lưu vết chuỗi thời gian trên `rate.price_history`
                  chống trùng theo `observation_id`, tự động bóc trần mức giảm
                  giá thực tế so với trung vị lịch sử 30-90 ngày.
                </p>
                <Link
                  href="/smartphones"
                  className="text-success small fw-semibold text-decoration-none mt-auto"
                >
                  Xem biểu đồ lịch sử giá sản phẩm →
                </Link>
              </div>
            </div>

            <div className="col-lg-4 col-md-12 col-12">
              <div className="card rounded-4 h-100 border-0 bg-white p-4 shadow-sm">
                <div
                  className="rounded-3 bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '48px', height: '48px' }}
                >
                  <BsShieldCheck className="fs-4" />
                </div>
                <h5 className="fw-bold mb-2">
                  3. Điểm Tín Nhiệm Kép &amp; Lọc Seeding AI
                </h5>
                <p className="text-muted small mb-3">
                  Kết hợp dữ liệu an ninh mạng `DOSafe` và bộ phân tích ngữ
                  nghĩa AI 5 hạng mục để loại bỏ bình luận rác nhận xu khỏi điểm
                  trung bình JReviews.
                </p>
                <Link
                  href="/merchants"
                  className="text-warning small fw-semibold text-decoration-none mt-auto"
                >
                  Tra cứu hồ sơ tín nhiệm gian hàng →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
