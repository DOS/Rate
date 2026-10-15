import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import { BsDatabaseLock, BsShieldCheck, BsShieldLock } from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'en') {
    return {
      title: 'Privacy Policy & Data Governance | Rate.vn',
      description:
        'Rate.vn privacy policy and data governance: database-level PII protection, SHA-256 anonymous voter hashing, and local browser watchlist storage.',
    };
  }
  if (locale === 'cs') {
    return {
      title: 'Ochrana soukromí a správa dat | Rate.vn',
      description:
        'Zásady ochrany osobních údajů Rate.vn: ochrana PII na úrovni databáze, anonymní SHA-256 hashování hlasů a lokální ukládání sledovaných cen.',
    };
  }
  return {
    title: 'Chính Sách Bảo Mật & Quản Trị Dữ Liệu | Rate.vn',
    description:
      'Cam kết bảo mật và quản trị dữ liệu của Rate.vn: Bảo vệ thông tin định danh (PII) bằng Row-Level Security, ẩn danh hóa bình chọn bằng SHA-256 và lưu trữ canh giá cục bộ.',
  };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3">
          <span className="badge bg-success rounded-pill fw-semibold mb-3 px-3 py-2">
            <BsShieldLock className="me-1" /> Quản Trị Dữ Liệu Chuẩn Open-Core
            2026
          </span>
          <h1 className="display-6 fw-bold mb-3 text-white">
            Chính Sách Bảo Mật &amp; Bảo Vệ Quyền Riêng Tư
          </h1>
          <p className="lead text-white-50 mb-0">
            Rate.vn được thiết kế theo nguyên tắc Privacy-by-Design: người mua
            có thể tra cứu thông số, kiểm định link sàn TMĐT, so sánh máy và
            canh giá giảm mà không cần cung cấp thông tin định danh cá nhân.
          </p>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="card rounded-4 border bg-white p-4 p-md-5 shadow-sm">
                <h3 className="h5 fw-bold mb-3">
                  1. Nguyên Tắc Không Thu Thập Thông Tin Định Danh Người Mua
                </h3>
                <p className="text-secondary mb-4">
                  Khi bạn truy cập <code>rate.vn</code> để tra cứu sản phẩm,
                  dán link kiểm định hoặc sử dụng Open-Core REST API v1, hệ
                  thống không yêu cầu tạo tài khoản và không gắn cookie theo dõi
                  quảng cáo của bên thứ ba.
                </p>

                <h3 className="h5 fw-bold mb-3">
                  2. Lưu Trữ Cục Bộ Cho Khay So Sánh &amp; Danh Sách Canh Giá
                </h3>
                <p className="text-secondary mb-4">
                  Các sản phẩm bạn ghim vào khay so sánh (<code>/compare</code>)
                  hoặc đặt ngưỡng cảnh báo giảm giá (<code>/watchlist</code>)
                  được lưu trữ hoàn toàn trên trình duyệt của bạn thông qua{' '}
                  <code>localStorage</code>. Trình duyệt chỉ gửi truy vấn đọc dữ
                  liệu công khai để cập nhật mức giá thấp nhất hiện tại.
                </p>

                <h3 className="h5 fw-bold mb-3">
                  3. Ẩn Danh Hóa Bình Chọn Đánh Giá Bằng Hàm Băm SHA-256
                </h3>
                <p className="text-secondary mb-4">
                  Khi bạn bấm nút <strong>&ldquo;Hữu ích&rdquo;</strong> hoặc{' '}
                  <strong>&ldquo;Báo cáo Seeding&rdquo;</strong> trên một đánh
                  giá tại trang chi tiết sản phẩm, địa chỉ IP và chuỗi User-Agent
                  của bạn không bao giờ được lưu dưới dạng văn bản thuần. Tầng
                  BFF biến đổi thông tin này thành chuỗi băm một chiều{' '}
                  <code>SHA-256 (voter_hash)</code> kèm muối bảo mật chỉ để
                  chống spam bình chọn trùng lặp trong bảng{' '}
                  <code>rate.review_votes</code>.
                </p>

                <h3 className="h5 fw-bold mb-3">
                  4. Phân Tách Dữ Liệu Nhạy Cảm (PII) Cấp Cơ Sở Dữ Liệu
                </h3>
                <p className="text-secondary mb-0">
                  Trong cơ sở dữ liệu PostgreSQL 17 trên Supabase Cloud, bảng{' '}
                  <code>rate.merchants</code> đã được thu hồi quyền đọc trực
                  tiếp đối với các cột thông tin liên hệ cá nhân (số điện thoại,
                  email nội bộ, mã số thuế cá nhân). Mọi truy vấn từ giao diện
                  Web và REST API đều đi qua view công khai{' '}
                  <code>rate.merchants_public</code> với cơ chế{' '}
                  <code>security_invoker = true</code>.
                </p>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 border bg-white p-4 shadow-sm mb-4">
                <BsDatabaseLock className="text-primary fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  Kiểm Chứng Mã Nguồn Công Khai
                </h4>
                <p className="text-muted small mb-3">
                  Toàn bộ chính sách Row-Level Security (RLS), định nghĩa view{' '}
                  <code>rate.merchants_public</code> và logic tạo{' '}
                  <code>voter_hash</code> đều được công khai minh bạch trong
                  repository mã nguồn mở.
                </p>
                <Link
                  href="/developers"
                  className="btn btn-outline-primary rounded-pill fw-medium w-100"
                >
                  Xem Tài Liệu Kỹ Thuật &amp; API
                </Link>
              </div>

              <div className="card rounded-4 bg-dark border-0 p-4 text-white shadow-sm">
                <BsShieldCheck className="text-success fs-2 mb-2" />
                <h5 className="fw-bold text-white mb-2">
                  Yêu Cầu Đính Chính Dữ Liệu Gian Hàng
                </h5>
                <p className="small text-white-50 mb-3">
                  Nếu bạn là chủ sở hữu gian hàng chính hãng (Official Mall) và
                  cần cập nhật thông tin chuẩn hóa hoặc yêu cầu kiểm toán lại
                  điểm rủi ro, vui lòng gửi yêu cầu qua trang Liên hệ.
                </p>
                <Link
                  href="/contact-us"
                  className="btn btn-danger rounded-pill fw-semibold w-100"
                >
                  Liên Hệ Đội Ngũ Kiểm Toán
                </Link>
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
