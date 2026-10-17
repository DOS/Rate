import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import { BsQuestionCircleFill, BsShieldCheck } from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = {
    canonical: 'https://rate.vn/faq',
    languages: {
      vi: 'https://rate.vn/faq',
      en: 'https://rate.vn/faq',
      cs: 'https://rate.vn/faq',
    },
  };
  if (locale === 'en') {
    return {
      title: 'Frequently Asked Questions (FAQ) - Methodology & Trust | Rate.vn',
      description:
        'Detailed answers on how Rate.vn standardizes 10 specification groups, calculates JReviews weighted ratings, detects fake discounts, and scores merchant risk.',
      alternates,
    };
  }
  if (locale === 'cs') {
    return {
      title: 'Často kladené otázky (FAQ) - Metodika a důvěra | Rate.vn',
      description:
        'Podrobné odpovědi na to, jak Rate.vn standardizuje 10 skupin parametrů, počítá vážené hodnocení JReviews a odhaluje falešné slevy.',
      alternates,
    };
  }
  return {
    title:
      'Câu Hỏi Thường Gặp (FAQ) - Phương Pháp Chấm Điểm & Kiểm Toán | Rate.vn',
    description:
      'Giải đáp chi tiết cách Rate.vn chuẩn hóa 10 nhóm thông số kỹ thuật, công thức điểm trọng số JReviews, thuật toán phát hiện giảm giá ảo và điểm rủi ro kép.',
    alternates,
  };
}

const FAQ_ITEMS = [
  {
    q: '1. Chuẩn 10 nhóm thông số kỹ thuật (10 Field Groups) của Rate.vn khác gì thông số trên sàn TMĐT?',
    a: 'Trên các sàn TMĐT, mỗi người bán tự điền thông số theo định dạng tự do hoặc bỏ trống các thông số quan trọng như chuẩn bộ nhớ (UFS 4.0 vs NVMe), độ sáng màn hình (nits), hay công suất sạc thực tế. Rate.vn chuẩn hóa toàn bộ sản phẩm gốc vào 10 nhóm cố định (Launch, Body, Display, Platform, Memory, Multi-Camera tách độc lập theo chuẩn PhoneArena, Audio, Connectivity, Battery, Misc) được kiểm chứng bằng Zod schema, giúp bạn lọc và đặt lên bàn cân so sánh chính xác tuyệt đối.',
  },
  {
    q: '2. Làm thế nào Rate.vn phát hiện được chiêu trò "Nâng giá gốc để giảm giá ảo" (Fake Discount)?',
    a: 'Rate.vn không dựa vào mức "giá gốc gạch ngang" (original_price) do gian hàng tự khai báo khi tính khuyến mãi thực. Thay vào đó, hệ thống thu thập chuỗi thời gian giá thực tế trong bảng rate.price_history và tính trung vị giá 30-90 ngày qua hàm rate.detect_fake_discount(). Nếu gian hàng vừa nâng giá gốc cao vọt so với trung vị lịch sử để treo biển giảm 40-50% nhưng giá bán thực tế không thấp hơn trung vị 90 ngày, hệ thống sẽ gắn cảnh báo Giảm giá ảo (fake_discount).',
  },
  {
    q: '3. Công thức tính điểm đánh giá có trọng số JReviews hoạt động như thế nào?',
    a: 'Khác với trung bình cộng đơn thuần dễ bị thao túng bởi hàng loạt đánh giá 5 sao rác nhận xu, Rate.vn áp dụng công thức trọng số kết hợp: Trọng số của mỗi đánh giá = (1 - fake_probability) * (1 + ln(1 + helpful_votes)). Những bình luận bị AI phát hiện là spam cày xu (low_value_coin_spam) hoặc seeding trả tiền (seeding_fake) có include_in_rating = false và bị loại hoàn toàn khỏi điểm trung bình.',
  },
  {
    q: '4. Điểm Tín Nhiệm Kép (Dual Risk Score) của gian hàng bao gồm những gì?',
    a: 'Mỗi gian hàng trong bảng rate.merchants được đánh giá trên 2 trục độc lập: (1) DOSafe Threat Intel Risk (0-100): kiểm tra lịch sử tên miền, cảnh báo lừa đảo trực tuyến và dấu hiệu giả mạo thương hiệu; (2) AI Review Seeding Risk (0-100): tỷ lệ phần trăm đánh giá bị gắn cờ seeding/spam trong tổng số đánh giá đã kiểm toán. Điểm Trust Score tổng hợp = 100 - max(dosafe_risk_score, review_risk_score).',
  },
  {
    q: '5. Tôi có thể dùng thử công cụ Kiểm định Link (URL Inspector) cho sản phẩm bất kỳ không?',
    a: 'Có. Ngay tại thanh tìm kiếm ở Trang chủ (chế độ "Dán link Shopee / Lazada kiểm định") hoặc qua endpoint GET /api/v1/rate/inspect?url=..., bạn có thể dán đường dẫn sản phẩm hoặc gian hàng Shopee, Lazada, Tiki để xem ngay đáy lịch sử giá, cảnh báo giảm giá ảo và tỷ lệ review thực chất.',
  },
  {
    q: '6. Danh sách Canh giá thật (/watchlist) và Bàn cân so sánh (/compare) lưu dữ liệu của tôi ở đâu?',
    a: 'Để bảo vệ quyền riêng tư tối đa và không bắt buộc đăng nhập tài khoản, danh sách sản phẩm bạn đang canh giá và khay so sánh nhanh được lưu trực tiếp trên trình duyệt của bạn (localStorage) và tự động đối chiếu với giá mới nhất từ máy chủ mỗi khi bạn mở trang.',
  },
  {
    q: '7. Lập trình viên có thể truy cập dữ liệu của Rate.vn qua API không?',
    a: 'Có. Rate.vn cung cấp hệ thống Open-Core REST API v1 hoàn toàn mở tại /api/v1/rate/* (hỗ trợ CORS và bộ nhớ đệm biên). Bạn có thể xem tài liệu chi tiết và chạy thử truy vấn trực tiếp tại trang Cổng Nhà Phát Triển (/developers).',
  },
];

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3 text-center">
          <span className="badge bg-primary rounded-pill fw-semibold mb-3 px-3 py-2">
            <BsQuestionCircleFill className="me-1" /> Minh Bạch Thuật Toán &amp;
            Dữ Liệu
          </span>
          <h1 className="display-6 fw-bold mb-3 text-white">
            Câu Hỏi Thường Gặp (FAQ)
          </h1>
          <p
            className="lead text-white-50 mx-auto mb-0"
            style={{ maxWidth: '720px' }}
          >
            Giải thích chi tiết về cơ chế chuẩn hóa 10 nhóm thông số kỹ thuật,
            thuật toán chống giảm giá ảo 90 ngày và bộ lọc Seeding AI trên
            Rate.vn.
          </p>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-10">
              <div className="d-flex flex-column gap-3">
                {FAQ_ITEMS.map((item) => (
                  <div
                    key={item.q}
                    className="card rounded-4 border bg-white p-4 shadow-sm"
                  >
                    <h3 className="h5 fw-bold text-dark mb-2">{item.q}</h3>
                    <p className="text-secondary mb-0">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="card rounded-4 border-primary border-opacity-25 mt-4 border bg-white p-4 shadow-sm">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <div>
                    <h4 className="h5 fw-bold mb-1">
                      <BsShieldCheck className="text-primary me-2" />
                      Cần kiểm tra mã nguồn hoặc báo cáo gian hàng bất thường?
                    </h4>
                    <p className="text-muted small mb-0">
                      Bạn có thể thử nghiệm trực tiếp REST API v1 hoặc gửi báo
                      cáo kiểm toán gian hàng cho đội ngũ kỹ thuật.
                    </p>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Link
                      href="/developers"
                      className="btn btn-outline-primary rounded-pill fw-medium px-4"
                    >
                      Mở API Playground
                    </Link>
                    <Link
                      href="/contact-us"
                      className="btn btn-primary rounded-pill fw-medium px-4"
                    >
                      Gửi báo cáo kiểm toán
                    </Link>
                  </div>
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
