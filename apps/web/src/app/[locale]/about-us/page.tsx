import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import { getCachedRatePlatformStats } from '@/server/rate';
import {
  BsCheckCircleFill,
  BsCodeSlash,
  BsCpu,
  BsDatabaseCheck,
  BsGraphUpArrow,
  BsShieldCheck,
  BsShop,
} from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = {
    canonical: 'https://rate.vn/about-us',
    languages: {
      vi: 'https://rate.vn/about-us',
      en: 'https://rate.vn/about-us',
      cs: 'https://rate.vn/about-us',
    },
  };
  if (locale === 'en') {
    return {
      title:
        'About Rate.vn - Open-Core Product Spec & Price Intelligence | Rate.vn',
      description:
        'Learn how Rate.vn standardizes 10 technical specification groups, detects inflated fake discounts, and audits marketplace reviews with AI.',
      alternates,
    };
  }
  if (locale === 'cs') {
    return {
      title:
        'O platformě Rate.vn - Open-Core analýza parametrů a cen | Rate.vn',
      description:
        'Zjistěte, jak Rate.vn standardizuje 10 skupin technických parametrů, odhaluje falešné slevy a provádí AI audit recenzí.',
      alternates,
    };
  }
  return {
    title:
      'Về Kiến Trúc Rate.vn - Nền Tảng Đối Chiếu Thông Số, Giá Thật & Kiểm Toán Đánh Giá | Rate.vn',
    description:
      'Tìm hiểu kiến trúc Open-Core 4 tầng của Rate.vn: Chuẩn hóa 10 nhóm thông số GSMArena & PhoneArena, phát hiện nâng khống giá gốc và lọc bình luận Seeding bằng AI.',
    alternates,
  };
}

export default async function AboutUsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const stats = await getCachedRatePlatformStats();

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3">
          <div className="row align-items-center g-4">
            <div className="col-lg-8">
              <span className="badge bg-danger rounded-pill fw-semibold mb-3 px-3 py-2">
                🔬 Hệ Sinh Thái Bảo Vệ Người Mua DOS (Open-Core 2026)
              </span>
              <h1 className="display-6 fw-bold mb-3 text-white">
                Về Kiến Trúc Minh Bạch Của{' '}
                <span className="text-danger">Rate.vn</span>
              </h1>
              <p className="lead text-white-50 mb-4">
                Rate.vn ra đời để giải quyết 3 vấn đề nhức nhối nhất khi mua đồ
                công nghệ trên các sàn thương mại điện tử: thông số kỹ thuật ghi
                mập mờ giữa các biến thể, chiêu trò nâng giá gốc trước ngày sale
                để tạo mức giảm ảo, và hàng nghìn bình luận seeding hoặc cày xu
                làm sai lệch điểm sao.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  href="/smartphones"
                  className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                >
                  Khám phá danh mục chuẩn hóa
                </Link>
                <Link
                  href="/developers"
                  className="btn btn-outline-light rounded-pill fw-medium px-4 py-2"
                >
                  Tài liệu Open-Core REST API v1
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 bg-opacity-50 border-secondary border-opacity-25 border bg-black p-4 text-white">
                <div className="small text-uppercase text-white-50 fw-bold mb-3">
                  Số Liệu Kiểm Toán Thực Tế (Live DB)
                </div>
                <div className="row g-3">
                  <div className="col-6">
                    <div className="h3 fw-bold text-warning mb-0">
                      {stats.masterProductsCount}
                    </div>
                    <div className="small text-white-50">
                      Sản phẩm gốc chuẩn hóa
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-info mb-0">
                      {stats.priceObservationsCount}
                    </div>
                    <div className="small text-white-50">
                      Bản ghi lịch sử giá
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-success mb-0">
                      {stats.authenticRatioPct}%
                    </div>
                    <div className="small text-white-50">
                      Tỷ lệ đánh giá thực chất
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="h3 fw-bold text-light mb-0">
                      {stats.merchantsCount}
                    </div>
                    <div className="small text-white-50">
                      Gian hàng được giám sát
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Pillars of Verification */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="mb-5 text-center">
            <h2 className="h3 fw-bold mb-2">
              Ba Trụ Cột Kỹ Thuật Cốt Lõi Của Rate.vn
            </h2>
            <p className="text-muted mb-0">
              Toàn bộ thuật toán chuẩn hóa và tính điểm đều được công khai mã
              nguồn mở tại repository <code>DOS/Rate</code> để cộng đồng kiểm
              chứng độc lập.
            </p>
          </div>

          <div className="row g-4">
            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsCpu className="text-primary fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  1. Chuẩn Hóa 10 Nhóm Thông Số &amp; Dedupe 3 Tầng
                </h4>
                <p className="text-muted small mb-3">
                  Hệ thống <code>ProductNormalizer</code> và{' '}
                  <code>EntityMatcher</code> tự động gom nhóm hàng chục gian
                  hàng bán cùng một mẫu máy về một thực thể gốc duy nhất (
                  <code>rate.master_products</code>) thông qua khóa chuẩn hóa{' '}
                  <code>model_key</code>, độ tương đồng <code>pg_trgm</code> và
                  trích xuất AI theo chuẩn 10 nhóm của GSMArena &amp;
                  PhoneArena.
                </p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/compare"
                    className="text-primary small fw-semibold text-decoration-none"
                  >
                    Trải nghiệm bàn cân 10 nhóm thông số →
                  </Link>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsGraphUpArrow className="text-success fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  2. Chống Giảm Giá Ảo Bằng Trung Vị 90 Ngày
                </h4>
                <p className="text-muted small mb-3">
                  Thay vì tin vào mức &ldquo;giá gạch ngang&rdquo; tự điền của
                  người bán, Rate.vn lưu trữ chuỗi thời gian thực tế trong bảng{' '}
                  <code>rate.price_history</code> (chống trùng theo{' '}
                  <code>observation_id</code>) và đối chiếu giá hiện tại với
                  trung vị lịch sử 30-90 ngày để phát hiện hành vi nâng giá gốc
                  trước ngày sale.
                </p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/watchlist"
                    className="text-success small fw-semibold text-decoration-none"
                  >
                    Mở công cụ canh giá thật →
                  </Link>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsShieldCheck className="text-danger fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  3. Điểm Tín Nhiệm Kép &amp; Trọng Số JReviews
                </h4>
                <p className="text-muted small mb-3">
                  Mỗi đánh giá được <code>AiReviewAnalyzer</code> phân loại vào
                  5 nhóm (<code>authentic</code>,{' '}
                  <code>low_value_coin_spam</code>, <code>seeding_fake</code>,{' '}
                  <code>repetitive_template</code>,{' '}
                  <code>sabotage_or_bombing</code>). Chỉ những đánh giá thực
                  chất mới được đưa vào công thức logarit JReviews{' '}
                  <code>1 + ln(1 + helpful_votes)</code>.
                </p>
                <div className="mt-auto pt-2">
                  <Link
                    href="/merchants"
                    className="text-danger small fw-semibold text-decoration-none"
                  >
                    Xem danh bạ tín nhiệm gian hàng →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open-Core Transparency Section */}
      <section className="border-top bg-white py-5">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-7">
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                🌍 Triết Lý Open-Core Minh Bạch
              </span>
              <h3 className="fw-bold mb-3">
                Không Nhận Quảng Cáo Nâng Hạng Gian Hàng
              </h3>
              <p className="text-muted mb-3">
                Điểm tín nhiệm gian hàng (<code>trust_score</code>) và điểm đánh
                giá sản phẩm có trọng số (<code>user_rating_weighted</code>)
                được tính toán hoàn toàn tự động bởi các hàm và trigger{' '}
                <code>SECURITY DEFINER</code> bên trong cơ sở dữ liệu PostgreSQL
                17. Không một cá nhân hay nhà tài trợ nào có thể can thiệp thủ
                công để làm đẹp điểm số.
              </p>
              <ul className="list-unstyled d-flex flex-column mb-0 gap-2">
                <li className="d-flex align-items-center small gap-2">
                  <BsCheckCircleFill className="text-success flex-shrink-0" />
                  <span>
                    <strong>Schema công khai:</strong> Toàn bộ định nghĩa bảng,
                    công thức tính điểm JReviews và hàm phát hiện giảm giá ảo
                    đều mở tại <code>supabase/migrations</code>.
                  </span>
                </li>
                <li className="d-flex align-items-center small gap-2">
                  <BsDatabaseCheck className="text-primary flex-shrink-0" />
                  <span>
                    <strong>Bảo vệ quyền riêng tư:</strong> Tách biệt hoàn toàn
                    thông tin định danh nhạy cảm (PII) khỏi các view tra cứu
                    công khai thông qua Row-Level Security (RLS).
                  </span>
                </li>
                <li className="d-flex align-items-center small gap-2">
                  <BsCodeSlash className="text-danger flex-shrink-0" />
                  <span>
                    <strong>REST API v1 miễn phí:</strong> Cung cấp chuẩn JSON
                    mở cho trình duyệt, tiện ích mở rộng MV3 và các nhà nghiên
                    cứu thị trường.
                  </span>
                </li>
              </ul>
            </div>

            <div className="col-lg-5">
              <div className="card rounded-4 bg-light border p-4">
                <h5 className="fw-bold mb-3">
                  <BsShop className="text-primary me-2" />
                  Liên Kết Nhanh Trên Hệ Thống
                </h5>
                <div className="d-grid gap-2">
                  <Link
                    href="/smartphones"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    📱 Danh mục Điện thoại thông minh
                  </Link>
                  <Link
                    href="/laptops"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    💻 Danh mục Laptop &amp; Ultrabook
                  </Link>
                  <Link
                    href="/tablets"
                    className="btn btn-outline-dark rounded-3 px-3 py-2 text-start"
                  >
                    📟 Danh mục Máy tính bảng (Tablet)
                  </Link>
                  <Link
                    href="/faq"
                    className="btn btn-outline-primary rounded-3 px-3 py-2 text-start"
                  >
                    ❓ Câu hỏi thường gặp về phương pháp tính điểm
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FooterTop locale={locale} />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
