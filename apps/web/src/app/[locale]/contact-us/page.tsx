import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import HeroSearchInspector from '@/components/home/HeroSearchInspector';
import CommunityQuarantineSubmitForm from '@/components/contact/CommunityQuarantineSubmitForm';
import { getMasterProducts } from '@/lib/rate-api';
import { getCachedMerchantsList } from '@/server/rate';
import {
  BsCodeSquare,
  BsEnvelopeAt,
  BsGithub,
  BsShieldExclamation,
  BsShop,
} from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'en') {
    return {
      title: 'Contact & Report Suspicious Marketplace Merchant | Rate.vn',
      description:
        'Report fake discounts, review seeding campaigns, or request a merchant trust re-audit on Rate.vn.',
    };
  }
  if (locale === 'cs') {
    return {
      title: 'Kontakt a nahlášení podezřelého obchodu | Rate.vn',
      description:
        'Nahlaste falešné slevy, AI seeding kampaně nebo požádejte o opětovný audit důvěryhodnosti obchodu na Rate.vn.',
    };
  }
  return {
    title: 'Liên Hệ & Báo Cáo Gian Hàng Nghi Vấn Seeding / Giá Ảo | Rate.vn',
    description:
      'Gửi đường dẫn sản phẩm hoặc gian hàng Shopee, Lazada, Tiki có dấu hiệu nâng khống giá gốc hoặc chạy Seeding đánh giá ảo để hệ thống Rate.vn kiểm định.',
  };
}

export default async function ContactUsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [products, merchants] = await Promise.all([
    getMasterProducts({ limit: 6 }),
    getCachedMerchantsList(),
  ]);

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3">
          <div className="row justify-content-center mb-4 text-center">
            <div className="col-lg-9">
              <span className="badge bg-danger rounded-pill fw-semibold mb-3 px-3 py-2">
                <BsShieldExclamation className="me-1" /> Trung Tâm Tiếp Nhận
                Kiểm Toán &amp; Phản Hồi Cộng Đồng
              </span>
              <h1 className="display-6 fw-bold mb-3 text-white">
                Kiểm Định Nhanh &amp; Báo Cáo Gian Hàng Bất Thường
              </h1>
              <p className="lead text-white-50 mb-0">
                Dán trực tiếp đường dẫn sản phẩm hoặc gian hàng Shopee, Lazada,
                Tiki, TikTok Shop, CellphoneS, TGDĐ, FPT Shop, Hoàng Hà, Di Động
                Việt, Phong Vũ vào bộ kiểm định bên dưới để kiểm tra ngay lịch
                sử giá hoặc gửi vào hàng đợi Zero-Trust Quarantine.
              </p>
            </div>
          </div>

          <div className="row justify-content-center">
            <div className="col-xl-9 col-lg-10">
              <HeroSearchInspector
                initialProducts={products}
                initialMerchants={merchants}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-light py-5">
        <div className="container">
          <div className="mb-4">
            <CommunityQuarantineSubmitForm />
          </div>

          <div className="row g-4">
            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsShieldExclamation className="text-danger fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  1. Báo Cáo Khuyến Mãi Ảo &amp; Seeding
                </h4>
                <p className="text-muted small mb-3">
                  Khi phát hiện gian hàng nâng giá gốc đột biến trước ngày sale
                  hoặc dùng tài khoản ảo lặp lại bình luận mẫu để đẩy sao, bạn
                  có thể bấm nút <strong>&ldquo;Báo cáo Seeding&rdquo;</strong>{' '}
                  ngay tại từng đánh giá trên trang chi tiết sản phẩm.
                </p>
                <Link
                  href="/smartphones"
                  className="btn btn-outline-danger rounded-pill fw-medium mt-auto"
                >
                  Tới danh mục sản phẩm →
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsShop className="text-primary fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  2. Xác Minh Gian Hàng Chính Hãng (Official Mall)
                </h4>
                <p className="text-muted small mb-3">
                  Dành cho các đối tác thương hiệu và nhà phân phối ủy quyền
                  muốn đồng bộ danh mục sản phẩm chuẩn hóa 10 nhóm hoặc yêu cầu
                  rà soát lại hồ sơ tín nhiệm trong bảng{' '}
                  <code>rate.merchants</code>.
                </p>
                <Link
                  href="/merchants"
                  className="btn btn-outline-primary rounded-pill fw-medium mt-auto"
                >
                  Tra cứu danh bạ gian hàng →
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 h-100 border bg-white p-4 shadow-sm">
                <BsCodeSquare className="text-success fs-1 mb-3" />
                <h4 className="h5 fw-bold mb-2">
                  3. Đóng Góp Mã Nguồn Mở &amp; Tích Hợp API
                </h4>
                <p className="text-muted small mb-3">
                  Rate.vn phát triển theo mô hình Open-Core thuộc hệ sinh thái
                  DOS. Mọi đề xuất cải tiến schema 10 nhóm thông số, bộ chuẩn
                  hóa <code>ProductNormalizer</code> hoặc báo lỗi kỹ thuật đều
                  được tiếp nhận công khai trên GitHub.
                </p>
                <div className="d-flex mt-auto flex-wrap gap-2">
                  <a
                    href="https://github.com/DOS/Rate/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-dark rounded-pill fw-medium d-inline-flex align-items-center gap-2 px-3"
                  >
                    <BsGithub /> GitHub Issues
                  </a>
                  <Link
                    href="/developers"
                    className="btn btn-outline-success rounded-pill fw-medium px-3"
                  >
                    REST API v1
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="card rounded-4 mt-4 border bg-white p-4 shadow-sm">
            <div className="row align-items-center g-3">
              <div className="col-lg-8">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: '52px', height: '52px' }}
                  >
                    <BsEnvelopeAt className="fs-4" />
                  </div>
                  <div>
                    <h5 className="fw-bold mb-1">
                      Kênh Liên Hệ Chính Thức Hệ Sinh Thái DOS / Rate.vn
                    </h5>
                    <p className="text-muted small mb-0">
                      Email tiếp nhận báo cáo bảo mật, khiếu nại dữ liệu gian
                      hàng và hợp tác kỹ thuật: <code>security@rate.vn</code>{' '}
                      hoặc qua hệ thống Issue Tracker chính thức tại{' '}
                      <code>github.com/DOS/Rate</code>.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-4 text-lg-end">
                <Link
                  href="/faq"
                  className="btn btn-primary rounded-pill fw-medium px-4"
                >
                  Xem Câu Hỏi Thường Gặp (FAQ)
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
