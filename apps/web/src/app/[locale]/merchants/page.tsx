import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import { getCachedMerchantsList } from '@/server/rate';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import {
  BsBoxSeam,
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsPeopleFill,
  BsShieldCheck,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl =
    locale === 'vi'
      ? 'https://rate.vn/merchants'
      : `https://rate.vn/${locale}/merchants`;

  return {
    title: 'Hồ Sơ Tín Nhiệm Gian Hàng (DOSafe + AI Review Risk) | Rate.vn',
    description:
      'Tra cứu độ tin cậy gian hàng Shopee, Lazada, Tiki với hệ thống chấm điểm rủi ro kép: dữ liệu chống lừa đảo DOSafe và AI lọc đánh giá Seeding trên Rate.vn.',
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function MerchantsDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const merchants = await getCachedMerchantsList();

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <div
        className="image-cover hero-banner bg-primary"
        style={{ backgroundImage: `url(/img/banner-6.jpg)` }}
        data-overlay="6"
      >
        <div className="container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
              <div className="position-relative mt-4 text-start">
                <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                  <span className="badge badge-xs badge-transparent rounded-pill px-3 py-1">
                    🛡️ DOSafe Threat Intel + JReviews AI
                  </span>
                  <span className="badge badge-xs listOpen rounded-pill px-3 py-1">
                    Dual Merchant Risk Score
                  </span>
                </div>
                <h1 className="text-light fw-bold mb-2">
                  Hồ Sơ Tín Nhiệm Gian Hàng Đa Sàn
                </h1>
                <p className="fs-5 fw-light text-light mb-0 opacity-90">
                  Đối chiếu điểm rủi ro lừa đảo DOSafe, tỷ lệ đánh giá
                  Seeding/Spam xu và lịch sử niêm yết giá của từng gian hàng
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="py-5">
        <div className="container">
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="breadcrumb small mb-0">
              <li className="breadcrumb-item">
                <Link href="/" className="text-decoration-none">
                  Trang chủ
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                Gian hàng &amp; Hồ sơ tín nhiệm
              </li>
            </ol>
          </nav>

          {/* Dual Risk Score Explanation Banner */}
          <div className="card rounded-4 bg-light mb-4 border-0 p-4 shadow-sm">
            <div className="row g-3 align-items-center">
              <div className="col-lg-8">
                <h2 className="h5 fw-bold d-flex align-items-center mb-1 gap-2">
                  <BsShieldCheck className="text-primary" />
                  Cơ chế Chấm Điểm Rủi Ro Kép (Dual Risk Scoring Engine)
                </h2>
                <p className="text-muted small mb-0">
                  Rate.vn tách bạch hoàn toàn 2 nguồn tín hiệu độc lập: (1){' '}
                  <strong>DOSafe Threat Risk</strong> đối chiếu danh sách cảnh
                  báo lừa đảo từ <code>dosafe.threat_intel</code> và (2){' '}
                  <strong>AI Review Risk</strong> đo lường tỷ lệ đánh giá ảo
                  Seeding, bình luận rác nhận xu và hành vi nâng khống giá gốc
                  trên các sản phẩm của shop.
                </p>
              </div>
              <div className="col-lg-4 text-lg-end">
                <Link
                  href="/smartphones"
                  className="btn btn-outline-primary rounded-pill fw-medium px-4"
                >
                  Tra cứu theo Sản phẩm →
                </Link>
              </div>
            </div>
          </div>

          <div className="row g-4">
            {merchants.map((merchant) => {
              const trustBadgeClass =
                merchant.trust_score >= 80
                  ? 'bg-success text-white'
                  : merchant.trust_score >= 50
                    ? 'bg-warning text-dark'
                    : 'bg-danger text-white';

              const minPriceText = merchant.min_price
                ? `${merchant.min_price.toLocaleString('vi-VN')} ₫`
                : null;
              const maxPriceText =
                merchant.max_price && merchant.max_price !== merchant.min_price
                  ? `${merchant.max_price.toLocaleString('vi-VN')} ₫`
                  : null;

              return (
                <div className="col-lg-6 col-12" key={merchant.id}>
                  <div className="card rounded-4 h-100 border p-4 shadow-sm">
                    <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold fs-4 flex-shrink-0"
                          style={{ width: '56px', height: '56px' }}
                        >
                          <BsShop />
                        </div>
                        <div>
                          <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                            <span className="badge bg-danger text-uppercase small">
                              {merchant.platform}
                            </span>
                            {merchant.is_official && (
                              <span className="badge bg-success-subtle text-success small d-inline-flex align-items-center gap-1">
                                <BsCheckCircleFill /> Chính hãng (Official Mall)
                              </span>
                            )}
                            <span className="text-muted small">
                              ID: <code>{merchant.platform_shop_id}</code>
                            </span>
                          </div>
                          <h3 className="h5 fw-bold mb-0">
                            <Link
                              href={`/merchants/${merchant.id}`}
                              className="text-dark text-decoration-none"
                            >
                              {merchant.name}
                            </Link>
                          </h3>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-end">
                        <span
                          className={`badge ${trustBadgeClass} rounded-pill fs-6 px-3 py-2`}
                        >
                          Trust: {merchant.trust_score}/100
                        </span>
                      </div>
                    </div>

                    {/* Shop Quick Metrics */}
                    <div className="row g-2 mb-3">
                      <div className="col-sm-4 col-6">
                        <div className="bg-light rounded-3 p-2 px-3">
                          <div
                            className="text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Đánh giá sàn
                          </div>
                          <div className="fw-bold small d-flex align-items-center gap-1">
                            <BsStarFill className="text-warning" />
                            {merchant.rating_star
                              ? `${merchant.rating_star.toFixed(2)} / 5.0`
                              : 'Chưa có'}
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-6">
                        <div className="bg-light rounded-3 p-2 px-3">
                          <div
                            className="text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Người theo dõi
                          </div>
                          <div className="fw-bold small d-flex align-items-center gap-1">
                            <BsPeopleFill className="text-primary" />
                            {merchant.follower_count > 0
                              ? merchant.follower_count.toLocaleString('vi-VN')
                              : '-'}
                          </div>
                        </div>
                      </div>
                      <div className="col-sm-4 col-12">
                        <div className="bg-light rounded-3 p-2 px-3">
                          <div
                            className="text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Sản phẩm đang theo dõi
                          </div>
                          <div className="fw-bold small d-flex align-items-center gap-1">
                            <BsBoxSeam className="text-success" />
                            {merchant.product_count} sản phẩm
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dual Risk Score Breakdown */}
                    <div className="rounded-3 mb-3 border bg-white p-3">
                      <div className="row g-3">
                        <div className="border-end col-6">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="small text-muted fw-medium">
                              🛡️ DOSafe Threat Risk
                            </span>
                            <span
                              className={`badge rounded-pill ${
                                merchant.dosafe_risk_score === 0
                                  ? 'bg-success-subtle text-success'
                                  : 'bg-danger-subtle text-danger'
                              }`}
                            >
                              {merchant.dosafe_risk_score}/100
                            </span>
                          </div>
                          <div
                            className="small text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {merchant.dosafe_risk_score === 0
                              ? 'Không có cảnh báo lừa đảo trong DOSafe'
                              : 'Có cảnh báo rủi ro trên hệ thống DOSafe'}
                          </div>
                        </div>

                        <div className="col-6">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="small text-muted fw-medium">
                              🤖 AI Review Risk
                            </span>
                            <span
                              className={`badge rounded-pill ${
                                merchant.review_risk_score <= 15
                                  ? 'bg-success-subtle text-success'
                                  : merchant.review_risk_score <= 40
                                    ? 'bg-warning-subtle text-warning-emphasis'
                                    : 'bg-danger-subtle text-danger'
                              }`}
                            >
                              {merchant.review_risk_score}/100
                            </span>
                          </div>
                          <div
                            className="small text-muted"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {merchant.review_risk_breakdown.total_reviews >
                            0 ? (
                              <>
                                Thực chất:{' '}
                                <strong>
                                  {
                                    merchant.review_risk_breakdown
                                      .authentic_count
                                  }
                                </strong>
                                /{merchant.review_risk_breakdown.total_reviews}{' '}
                                (Lọc{' '}
                                {merchant.review_risk_breakdown
                                  .coin_spam_count +
                                  merchant.review_risk_breakdown
                                    .seeding_fake_count}{' '}
                                spam/seeding)
                              </>
                            ) : (
                              'Chưa phát hiện đánh giá bất thường'
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {minPriceText && (
                      <div className="small text-muted mb-3">
                        Khoảng giá niêm yết:{' '}
                        <strong className="text-danger">
                          {minPriceText}
                          {maxPriceText ? ` - ${maxPriceText}` : ''}
                        </strong>
                      </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                      <Link
                        href={`/merchants/${merchant.id}`}
                        className="btn btn-primary rounded-pill fw-medium px-4"
                      >
                        Xem Hồ sơ Tín nhiệm &amp; Giá bán →
                      </Link>
                      {merchant.url && (
                        <a
                          href={merchant.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                        >
                          Mở gian hàng gốc ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
