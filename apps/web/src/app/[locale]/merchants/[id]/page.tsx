import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/navigation';
import {
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  resolveProductImageUrl,
} from '@/lib/rate-api';
import {
  getCachedMerchantProfileById,
  getCrossPlatformDealRadar,
} from '@/server/rate';
import { selectMerchantRadar } from '@/lib/deal-radar';
import NavbarDarkDynamic from '../../components/navbar/NavbarDarkDynamic';
import FooterTop from '../../components/footer-top';
import FooterDynamic from '../../components/footer/FooterDynamic';
import BackToTop from '../../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import MerchantShareAuditButton from '@/components/merchants/MerchantShareAuditButton';
import {
  BsBoxSeam,
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsGraphUpArrow,
  BsPeopleFill,
  BsShieldCheck,
  BsShop,
  BsStarFill,
} from 'react-icons/bs';

import { normalizeRateLocale } from '@/lib/rate-i18n';

type PageParams = Promise<{ locale: string; id: string }>;

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const lang = normalizeRateLocale(locale);
  const merchant = await getCachedMerchantProfileById(id);
  if (!merchant) {
    return {
      title:
        lang === 'en'
          ? 'Merchant Not Found | Rate.vn'
          : lang === 'cs'
            ? 'Obchod nenalezen | Rate.vn'
            : 'Không tìm thấy gian hàng | Rate.vn',
    };
  }
  const canonicalUrl = `https://rate.vn/merchants/${merchant.id}`;

  return {
    title:
      lang === 'en'
        ? `${merchant.name} (${merchant.platform.toUpperCase()}) - Trust ${merchant.trust_score}/100 & Price Audit | Rate.vn`
        : lang === 'cs'
          ? `${merchant.name} (${merchant.platform.toUpperCase()}) - Důvěra ${merchant.trust_score}/100 a Audit Cen | Rate.vn`
          : `${merchant.name} (${merchant.platform.toUpperCase()}) - Trust ${merchant.trust_score}/100 & Kiểm định Giá | Rate.vn`,
    description:
      lang === 'en'
        ? `Merchant trust profile for ${merchant.name}: DOSafe Threat Score (${merchant.dosafe_risk_score}/100), AI Review Seeding Risk (${merchant.review_risk_score}/100), and historical price audit across ${merchant.product_count} products.`
        : lang === 'cs'
          ? `Profil důvěryhodnosti obchodu ${merchant.name}: DOSafe riziko (${merchant.dosafe_risk_score}/100), AI riziko recenzí (${merchant.review_risk_score}/100) a audit cen ${merchant.product_count} produktů.`
          : `Hồ sơ tín nhiệm gian hàng ${merchant.name}: Điểm an toàn DOSafe (${merchant.dosafe_risk_score}/100), Điểm rủi ro đánh giá AI (${merchant.review_risk_score}/100) và kiểm định lịch sử giá ${merchant.product_count} sản phẩm trên Rate.vn.`,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function MerchantProfilePage({
  params,
}: {
  params: PageParams;
}) {
  const { locale, id } = await params;
  const lang = normalizeRateLocale(locale);
  const [merchant, dealRadar] = await Promise.all([
    getCachedMerchantProfileById(id),
    getCrossPlatformDealRadar({ categorySlug: 'all', limit: 36 }),
  ]);

  if (!merchant) {
    notFound();
  }

  const merchantRadar = selectMerchantRadar(dealRadar, merchant);
  const merchantGenuineDeals = merchantRadar.genuineDeals;
  const merchantFakeTraps = merchantRadar.fakeSaleTraps;

  const trustLevelLabel =
    merchant.trust_score >= 80
      ? lang === 'en'
        ? 'High Trust (Verified Safe)'
        : lang === 'cs'
          ? 'Vysoká důvěryhodnost (Bezpečný)'
          : 'Độ tin cậy cao (An toàn)'
      : merchant.trust_score >= 50
        ? lang === 'en'
          ? 'Moderate Trust (Monitor)'
          : lang === 'cs'
            ? 'Střední důvěryhodnost'
            : 'Độ tin cậy trung bình (Cần lưu ý)'
        : lang === 'en'
          ? 'High Risk Alert'
          : lang === 'cs'
            ? 'Varování: Vysoké riziko'
            : 'Cảnh báo rủi ro cao';

  const trustBadgeClass =
    merchant.trust_score >= 80
      ? 'bg-success text-white'
      : merchant.trust_score >= 50
        ? 'bg-warning text-dark'
        : 'bg-danger text-white';

  const brk = merchant.review_risk_breakdown;
  const authenticPct =
    brk.total_reviews > 0
      ? Math.round((brk.authentic_count / brk.total_reviews) * 1000) / 10
      : 100;

  const canonicalUrl = `https://rate.vn/merchants/${merchant.id}`;

  const merchantJsonLd = {
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
            name: 'Gian hàng',
            item: 'https://rate.vn/merchants',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: merchant.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'OnlineStore',
        name: merchant.name,
        url: canonicalUrl,
        ...(merchant.url ? { sameAs: [merchant.url] } : {}),
        ...(merchant.rating_star &&
        merchant.rating_star > 0 &&
        brk.total_reviews > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(merchant.rating_star.toFixed(2)),
                reviewCount: brk.total_reviews,
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
          __html: JSON.stringify(merchantJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <NavbarDarkDynamic links={[]} />

      <div className="container py-5">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-4">
          <ol className="breadcrumb small mb-0">
            <li className="breadcrumb-item">
              <Link href="/" className="text-decoration-none">
                Trang chủ
              </Link>
            </li>
            <li className="breadcrumb-item">
              <Link href="/merchants" className="text-decoration-none">
                Gian hàng
              </Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {merchant.name}
            </li>
          </ol>
        </nav>

        {/* Merchant Header Card (DESIGN.md v3.0 Dark Obsidian Command Header) */}
        <div className="rate-scoreboard-dark p-md-5 mb-4 p-4">
          <div className="row g-4 align-items-center">
            <div className="col-lg-8">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-4 d-flex align-items-center justify-content-center fs-2 flex-shrink-0 text-white shadow-sm"
                  style={{
                    width: '72px',
                    height: '72px',
                    background:
                      'linear-gradient(135deg, rgba(255, 46, 41, 0.25), rgba(99, 102, 241, 0.25))',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                  }}
                >
                  <BsShop />
                </div>
                <div>
                  <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                    <span className="badge bg-danger text-uppercase rounded-pill px-3 py-1">
                      {merchant.platform}
                    </span>
                    {merchant.is_official && (
                      <span
                        className="badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-1"
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.16)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                        }}
                      >
                        <BsCheckCircleFill /> Gian hàng Chính hãng (Official
                        Mall)
                      </span>
                    )}
                    <span
                      className="badge rounded-pill px-3 py-1"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                      }}
                    >
                      Shop ID: <code>{merchant.platform_shop_id}</code>
                    </span>
                  </div>
                  <h1 className="h2 fw-bold mb-2 text-white">
                    {merchant.name}
                  </h1>
                  <div
                    className="d-flex align-items-center small flex-wrap gap-3"
                    style={{ color: '#94a3b8' }}
                  >
                    <span className="d-inline-flex align-items-center gap-1">
                      <BsStarFill className="text-warning" />
                      Điểm sàn:{' '}
                      <strong className="font-monospace text-white">
                        {merchant.rating_star
                          ? `${merchant.rating_star.toFixed(2)} / 5.0`
                          : 'Chưa cập nhật'}
                      </strong>
                    </span>
                    <span className="d-inline-flex align-items-center gap-1">
                      <BsPeopleFill className="text-info" />
                      Người theo dõi:{' '}
                      <strong className="font-monospace text-white">
                        {merchant.follower_count > 0
                          ? merchant.follower_count.toLocaleString('vi-VN')
                          : '-'}
                      </strong>
                    </span>
                    <span className="d-inline-flex align-items-center gap-1">
                      <BsBoxSeam className="text-success" />
                      Sản phẩm đang theo dõi:{' '}
                      <strong className="font-monospace text-white">
                        {merchant.product_count} mẫu
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-4 text-lg-end">
              <div
                className="rounded-4 p-3 text-center"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                <div className="small mb-1" style={{ color: '#94a3b8' }}>
                  Chỉ số Tín nhiệm Tổng hợp (Rate Trust Score)
                </div>
                <div className="display-6 fw-bold font-monospace mb-1 text-white">
                  {merchant.trust_score}
                  <span className="fs-5 fw-normal" style={{ color: '#94a3b8' }}>
                    /100
                  </span>
                </div>
                <div className="mb-3">
                  <span
                    className={`badge ${trustBadgeClass} rounded-pill px-3 py-2`}
                  >
                    {trustLevelLabel}
                  </span>
                </div>
                {merchant.url && (
                  <a
                    href={merchant.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-light btn-sm rounded-pill fw-medium"
                  >
                    Đối chiếu nguồn trên {merchant.platform.toUpperCase()} ↗
                  </a>
                )}
                <MerchantShareAuditButton
                  merchantName={merchant.name}
                  platform={merchant.platform}
                  platformShopId={merchant.platform_shop_id}
                  isOfficial={merchant.is_official}
                  trustScore={merchant.trust_score}
                  trustLevelLabel={trustLevelLabel}
                  dosafeRiskScore={merchant.dosafe_risk_score}
                  reviewSeedingRiskScore={merchant.review_risk_score}
                  authenticReviews={brk.authentic_count}
                  totalReviews={brk.total_reviews}
                  flaggedReviews={Math.max(
                    0,
                    brk.total_reviews - brk.authentic_count
                  )}
                  productCount={merchant.product_count}
                  genuineDealCount={merchantGenuineDeals.length}
                  fakeSaleTrapCount={merchantFakeTraps.length}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dual Risk Breakdown Section */}
        <div className="row g-4 mb-4">
          {/* 1. DOSafe Threat Intelligence Card */}
          <div className="col-lg-6 col-12">
            <div className="card rounded-4 h-100 border p-4 shadow-sm">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <span className="badge bg-primary-subtle text-primary rounded-pill small mb-2 px-3 py-1">
                    Tầng bảo vệ 1: DOSafe Threat Intelligence
                  </span>
                  <h2 className="h5 fw-bold d-flex align-items-center mb-0 gap-2">
                    <BsShieldCheck className="text-success" />
                    Hồ sơ Chống Lừa Đảo DOSafe
                  </h2>
                </div>
                <span
                  className={`badge rounded-pill fs-6 px-3 py-2 ${
                    merchant.dosafe_risk_score === 0
                      ? 'bg-success-subtle text-success'
                      : 'bg-danger text-white'
                  }`}
                >
                  Risk: {merchant.dosafe_risk_score}/100
                </span>
              </div>

              <p className="text-muted small mb-3">
                Đối chiếu tự động qua mã băm định danh (<code>entity_hash</code>
                ) với cơ sở dữ liệu cảnh báo lừa đảo liên thông{' '}
                <code>dosafe.threat_intel</code>.
              </p>

              <div className="rounded-3 bg-light mt-auto p-3">
                <div className="d-flex align-items-center justify-content-between small mb-2">
                  <span className="text-muted">
                    Trạng thái cảnh báo lừa đảo:
                  </span>
                  <span className="fw-semibold text-success">
                    {merchant.dosafe_risk_score === 0
                      ? '✓ Không ghi nhận phốt / cảnh báo'
                      : '⚠️ Có cảnh báo rủi ro'}
                  </span>
                </div>
                <div className="d-flex align-items-center justify-content-between small mb-2">
                  <span className="text-muted">Xác thực pháp nhân sàn:</span>
                  <span className="fw-semibold">
                    {merchant.is_official
                      ? '✓ Gian hàng Chính hãng (Official Mall)'
                      : 'Gian hàng tiêu chuẩn'}
                  </span>
                </div>
                <div className="d-flex align-items-center justify-content-between small">
                  <span className="text-muted">Bảo mật dữ liệu PII:</span>
                  <span className="fw-semibold text-secondary">
                    Đã ẩn thông tin nhạy cảm (SĐT/Ngân hàng)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. AI Review & Seeding Risk Card */}
          <div className="col-lg-6 col-12">
            <div className="card rounded-4 h-100 border p-4 shadow-sm">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <span className="badge bg-warning-subtle text-warning-emphasis rounded-pill small mb-2 px-3 py-1">
                    Tầng bảo vệ 2: JReviews AI Seeding Detector
                  </span>
                  <h2 className="h5 fw-bold d-flex align-items-center mb-0 gap-2">
                    <BsGraphUpArrow className="text-primary" />
                    Phân Tích Độ Trung Thực Đánh Giá
                  </h2>
                </div>
                <span
                  className={`badge rounded-pill fs-6 px-3 py-2 ${
                    merchant.review_risk_score <= 15
                      ? 'bg-success-subtle text-success'
                      : merchant.review_risk_score <= 40
                        ? 'bg-warning-subtle text-warning-emphasis'
                        : 'bg-danger text-white'
                  }`}
                >
                  Review Risk: {merchant.review_risk_score}/100
                </span>
              </div>

              <p className="text-muted small mb-3">
                Tổng hợp từ <strong>{brk.total_reviews}</strong> đánh giá đã
                được AI phân loại trên các sản phẩm thuộc gian hàng này (tỷ lệ
                đánh giá thực chất đạt <strong>{authenticPct}%</strong>).
              </p>

              <div className="row g-2 mt-auto">
                <div className="col-sm-3 col-6">
                  <div className="rounded-3 bg-success-subtle p-2 text-center">
                    <div className="fw-bold text-success fs-5 font-monospace">
                      {brk.authentic_count}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      Thực chất
                    </div>
                  </div>
                </div>
                <div className="col-sm-3 col-6">
                  <div className="rounded-3 bg-warning-subtle p-2 text-center">
                    <div className="fw-bold text-warning-emphasis fs-5 font-monospace">
                      {brk.coin_spam_count}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      Spam nhận xu
                    </div>
                  </div>
                </div>
                <div className="col-sm-3 col-6">
                  <div className="rounded-3 bg-danger-subtle p-2 text-center">
                    <div className="fw-bold text-danger fs-5 font-monospace">
                      {brk.seeding_fake_count}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      Seeding ảo
                    </div>
                  </div>
                </div>
                <div className="col-sm-3 col-6">
                  <div className="rounded-3 bg-secondary-subtle p-2 text-center">
                    <div className="fw-bold text-secondary fs-5 font-monospace">
                      {brk.sabotage_or_bombing_count}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      Phá hoại/Bomb
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 10-Platform Deal Radar & Fake-Sale Trap Audit Card (#99) */}
        <div
          className="card rounded-4 mb-5 border bg-white p-4 shadow-sm"
          data-testid="merchant-profile-deal-radar"
        >
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <span className="badge bg-dark rounded-pill text-warning me-2">
                🔥 TÍN HIỆU RADAR KÈO ĐÁY &amp; KIỂM TOÁN GIÁ ẢO 60 NGÀY
              </span>
              <span className="small text-muted">
                Đối chiếu tự động trên {dealRadar.totalOffersAnalyzed} gian hàng
                đa sàn
              </span>
            </div>
            <div className="d-flex align-items-center flex-wrap gap-2">
              <span className="badge bg-success-subtle text-success border-success-subtle rounded-pill border px-3 py-1">
                🟢 {merchantGenuineDeals.length} kèo đáy lịch sử 60N
              </span>
              <span
                className={`badge rounded-pill border px-3 py-1 ${
                  merchantFakeTraps.length > 0
                    ? 'bg-danger-subtle text-danger border-danger-subtle'
                    : 'bg-light text-secondary'
                }`}
              >
                {merchantFakeTraps.length > 0
                  ? `🚨 ${merchantFakeTraps.length} cảnh báo kê khống giá gốc`
                  : '🛡️ 0 cảnh báo nâng khống giá gốc'}
              </span>
              <Link
                href="/deals"
                className="btn btn-sm btn-outline-danger rounded-pill fw-semibold px-3"
              >
                Mở Radar 10 sàn →
              </Link>
            </div>
          </div>
          {merchantGenuineDeals.length > 0 || merchantFakeTraps.length > 0 ? (
            <div className="row g-2">
              {merchantGenuineDeals.slice(0, 4).map((g) => (
                <div key={g.id} className="col-md-6">
                  <div className="rounded-3 border-success-subtle bg-success-subtle bg-opacity-10 d-flex justify-content-between align-items-center border p-2">
                    <div className="overflow-hidden pe-2">
                      <Link
                        href={g.productHref}
                        className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                      >
                        🟢 {g.productName}
                      </Link>
                      <div className="text-secondary small">
                        Đáy 60N: {g.marketMinPrice.toLocaleString('vi-VN')} ₫ •
                        Trung vị: {g.marketMedianPrice.toLocaleString('vi-VN')}{' '}
                        ₫
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-end">
                      <div className="fw-bold text-success font-monospace small">
                        {g.priceCurrent.toLocaleString('vi-VN')} ₫
                      </div>
                      <span className="badge bg-success rounded-pill">
                        -{g.savingsVsMedianPct}% so trung vị
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {merchantFakeTraps.slice(0, 4).map((t) => (
                <div key={t.id} className="col-md-6">
                  <div className="rounded-3 border-danger-subtle bg-danger-subtle bg-opacity-10 d-flex justify-content-between align-items-center border p-2">
                    <div className="overflow-hidden pe-2">
                      <Link
                        href={t.productHref}
                        className="fw-bold text-dark text-decoration-none d-block text-truncate small"
                      >
                        🚨 {t.productName}
                      </Link>
                      <div className="text-secondary small">
                        Giá gạch ngang kê khống:{' '}
                        {(t.priceOriginal || 0).toLocaleString('vi-VN')} ₫
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-end">
                      <div className="fw-bold text-danger font-monospace small">
                        {t.priceCurrent.toLocaleString('vi-VN')} ₫
                      </div>
                      <span className="badge bg-danger rounded-pill">
                        Kê khống +{t.fakeMarkupPct}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="small text-muted">
              Gian hàng này hiện duy trì mức giá niêm yết ổn định quanh trung vị
              thị trường 60 ngày, không có bản ghi nâng khống giá gốc bất
              thường.
            </div>
          )}
        </div>

        {/* SECTION #1: Recent Buyer Reviews & AI Flags Section (Rating-First Priority) */}
        <div className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm">
          <span className="rate-eyebrow text-primary d-block mb-1">
            KIỂM TOÁN BÌNH LUẬN &amp; CHỐNG SEEDING BẰNG AI (JREVIEWS WEIGHTED)
          </span>
          <h2 className="h4 fw-bold mb-1">
            💬 Nhật Ký Kiểm Định Đánh Giá Người Mua Tại Gian Hàng (
            {merchant.recent_reviews.length})
          </h2>
          <p className="text-muted small mb-4">
            Toàn bộ đánh giá được chấm trọng số JReviews và gắn nhãn tự động bởi
            AI Review Analyzer trước khi tính vào điểm tín nhiệm
          </p>

          {merchant.recent_reviews.length === 0 ? (
            <div className="text-muted py-4 text-center">
              Chưa có đánh giá nào được ghi nhận cho gian hàng này.
            </div>
          ) : (
            <div className="row g-3">
              {merchant.recent_reviews.slice(0, 12).map((rev) => {
                const isAuthentic = rev.include_in_rating;
                const revCatSlug = rev.master_slug
                  ? getMasterProductCategorySlug({
                      slug: rev.master_slug,
                      name: rev.product_title,
                    })
                  : 'smartphones';
                const revCatBase = getCategoryRouteHref(revCatSlug);
                const flagBadge =
                  rev.flag_category === 'low_value_coin_spam'
                    ? {
                        label: '🪙 Bình luận rác nhận xu (Trọng số 0.0)',
                        cls: 'bg-warning-subtle text-warning-emphasis',
                      }
                    : rev.flag_category === 'seeding_fake'
                      ? {
                          label: '🚨 Nghi vấn Seeding ảo (Trọng số 0.0)',
                          cls: 'bg-danger-subtle text-danger',
                        }
                      : {
                          label: `✓ Đánh giá thực chất (Trọng số ${rev.helpfulness_weight.toFixed(2)})`,
                          cls: 'bg-success-subtle text-success',
                        };

                return (
                  <div className="col-md-6 col-12" key={rev.id}>
                    <div
                      className={`rounded-4 h-100 border p-3 ${
                        isAuthentic ? 'bg-white' : 'bg-light opacity-75'
                      }`}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                        <div>
                          <div className="fw-bold small">{rev.author_name}</div>
                          {rev.master_slug ? (
                            <Link
                              href={`${revCatBase}/${rev.master_slug}#jreviews-section`}
                              className="text-primary text-decoration-none"
                              style={{ fontSize: '0.75rem' }}
                            >
                              {rev.product_title}
                            </Link>
                          ) : (
                            <div
                              className="text-muted"
                              style={{ fontSize: '0.75rem' }}
                            >
                              {rev.product_title}
                            </div>
                          )}
                        </div>
                        <span className="rate-score-badge-user">
                          ★ {rev.rating_star}/5
                        </span>
                      </div>

                      <p className="small text-dark mb-2">
                        {rev.comment || '(Không có nội dung bình luận)'}
                      </p>

                      <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                        <span
                          className={`badge ${flagBadge.cls} rounded-pill`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {flagBadge.label}
                        </span>
                        {rev.reason && (
                          <span
                            className="text-muted"
                            style={{ fontSize: '0.72rem' }}
                          >
                            {rev.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION #2: Active Product Listings & Neutral Price Audit Table */}
        <div className="card rounded-4 p-md-5 mb-5 border-0 p-4 shadow-sm">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-2">
            <div>
              <span className="rate-eyebrow text-muted d-block mb-1">
                KIỂM ĐỊNH BIÊN ĐỘ GIÁ &amp; PHÁT HIỆN NÂNG KHỐNG GIÁ GỐC
              </span>
              <h2 className="h4 fw-bold mb-1">
                🛡️ Danh Sách Niêm Yết &amp; Đối Chiếu Lịch Sử Giá (
                {merchant.listings.length})
              </h2>
              <p className="text-muted small mb-0">
                Đối chiếu giá ghi nhận tại {merchant.name} với mức giá thấp nhất
                thị trường và trung vị lịch sử 90 ngày
              </p>
            </div>
          </div>

          {merchant.listings.length === 0 ? (
            <div className="text-muted py-4 text-center">
              Chưa có sản phẩm nào được liên kết với gian hàng này.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table-hover mb-0 table align-middle">
                <thead className="table-light small">
                  <tr>
                    <th scope="col">Sản phẩm niêm yết</th>
                    <th scope="col">Dòng máy chuẩn hóa (Master Product)</th>
                    <th scope="col">Giá ghi nhận</th>
                    <th scope="col">Kiểm định Khuyến mãi (Price History)</th>
                    <th scope="col" className="text-end">
                      Kiểm định &amp; Nguồn
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merchant.listings.map((item) => {
                    const priceText =
                      item.price_current.toLocaleString('vi-VN');
                    const origText = item.price_original
                      ? item.price_original.toLocaleString('vi-VN')
                      : null;
                    const da = item.discount_analysis;
                    const badgeClass =
                      da?.verdict === 'fake_discount'
                        ? 'bg-danger text-white'
                        : da?.verdict === 'suspicious_discount'
                          ? 'bg-warning text-dark'
                          : da?.verdict === 'genuine_deal'
                            ? 'bg-success text-white'
                            : 'bg-light text-secondary border';
                    const resolvedImg = resolveProductImageUrl(
                      item.master_product?.slug,
                      item.image
                    );
                    const masterCatSlug = item.master_product
                      ? getMasterProductCategorySlug({
                          slug: item.master_product.slug,
                          name: item.master_product.name,
                        })
                      : 'smartphones';
                    const masterBaseHref = getCategoryRouteHref(masterCatSlug);

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="d-flex align-items-center gap-3">
                            {resolvedImg && (
                              <img
                                src={resolvedImg}
                                alt={item.title}
                                className="rounded border bg-white p-1"
                                style={{
                                  width: '52px',
                                  height: '52px',
                                  objectFit: 'contain',
                                }}
                              />
                            )}
                            <div>
                              <div className="fw-semibold small text-dark">
                                {item.title}
                              </div>
                              <div
                                className="text-muted"
                                style={{ fontSize: '0.75rem' }}
                              >
                                Mã sàn: <code>{item.platform_item_id}</code> •
                                Đã bán:{' '}
                                {item.historical_sold.toLocaleString('vi-VN')} •
                                ★ {item.rating_star.toFixed(1)} (
                                {item.rating_count})
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {item.master_product ? (
                            <div>
                              <Link
                                href={`${masterBaseHref}/${item.master_product.slug}`}
                                className="fw-semibold text-primary text-decoration-none small"
                              >
                                {item.master_product.name}
                              </Link>
                              <div
                                className="text-muted"
                                style={{ fontSize: '0.75rem' }}
                              >
                                Giá thấp nhất thị trường:{' '}
                                <strong className="font-monospace">
                                  {item.master_product.market_min_price.toLocaleString(
                                    'vi-VN'
                                  )}{' '}
                                  ₫
                                </strong>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted small">
                              Chưa gom cụm
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="fw-bold text-dark font-monospace">
                            {priceText} ₫
                          </div>
                          {origText && (
                            <div className="text-muted small text-decoration-line-through font-monospace">
                              {origText} ₫
                            </div>
                          )}
                        </td>
                        <td>
                          {da ? (
                            <div>
                              <span
                                className={`badge ${badgeClass} rounded-pill small px-3 py-1`}
                                title={da.explanation}
                              >
                                {da.badge_label}
                              </span>
                              <div
                                className="text-muted mt-1"
                                style={{
                                  fontSize: '0.73rem',
                                  maxWidth: '280px',
                                }}
                              >
                                Đáy lịch sử:{' '}
                                {da.historical_min_price.toLocaleString(
                                  'vi-VN'
                                )}{' '}
                                ₫ ({da.observation_count} mốc đo)
                              </div>
                            </div>
                          ) : (
                            <span className="badge bg-light text-muted small border">
                              Đang thu thập lịch sử giá
                            </span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-2">
                            {item.master_product && (
                              <Link
                                href={`${masterBaseHref}/${item.master_product.slug}#jreviews-section`}
                                className="btn btn-sm btn-outline-primary rounded-pill px-3"
                              >
                                ★ Xem Review &amp; Giá
                              </Link>
                            )}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                            >
                              Đối chiếu nguồn ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <CompareTrayBar />
      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
