import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import ApiPlaygroundClient from '@/components/developers/ApiPlaygroundClient';
import { getCachedRatePlatformStats } from '@/server/rate';
import {
  BsCodeSquare,
  BsCpu,
  BsDatabaseCheck,
  BsGithub,
  BsLayers,
  BsShieldLock,
} from 'react-icons/bs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'en') {
    return {
      title: 'Open-Core REST API v1 & Developer Portal | Rate.vn',
      description:
        'Official documentation and live interactive playground for Rate.vn Open-Core REST API v1: 10-group standardized product specs, historical price observations, and AI review auditing.',
      alternates: {
        canonical: 'https://rate.vn/developers',
      },
    };
  }
  if (locale === 'cs') {
    return {
      title: 'Open-Core REST API v1 a portál pro vývojáře | Rate.vn',
      description:
        'Oficiální dokumentace a interaktivní pískoviště pro Rate.vn Open-Core REST API v1: 10 skupin parametrů, historie cen a AI audit recenzí.',
      alternates: {
        canonical: 'https://rate.vn/developers',
      },
    };
  }
  return {
    title: 'Tài Liệu Open-Core REST API v1 & Cổng Nhà Phát Triển | Rate.vn',
    description:
      'Tài liệu kỹ thuật và môi trường chạy thử trực tiếp (Playground) cho Rate.vn Open-Core REST API v1: Truy vấn 10 nhóm thông số chuẩn hóa, lịch sử giá thật và kiểm toán đánh giá AI.',
    alternates: {
      canonical: 'https://rate.vn/developers',
    },
  };
}

const API_ENDPOINTS_SPEC = [
  {
    method: 'GET',
    path: '/api/v1/rate/products',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams:
      'category, brand, q, minPrice, maxPrice, ramGb, storageGb, minRating, sort, limit, offset',
    summary:
      'Truy vấn danh sách sản phẩm chuẩn hóa (rate.master_products) với bộ lọc đa chiều theo 10 nhóm thông số kỹ thuật và điểm JReviews.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/products/[slug]',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams: 'slug (Path param)',
    summary:
      'Trả về chi tiết sản phẩm gốc, bảng thông số 10 nhóm, danh sách gian hàng (rate.products), chuỗi lịch sử giá (rate.price_history), phân tích giảm giá ảo (discountAnalysis) và đánh giá đã lọc Seeding AI.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/compare',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams: 'slugs (Danh sách tối đa 4 slug phân cách bằng dấu phẩy)',
    summary:
      'So sánh chéo tối đa 4 sản phẩm gốc trên toàn bộ 10 nhóm thông số kỹ thuật kèm đường dẫn chuẩn hóa đa ngành hàng.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/watchlist',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=30, stale-while-revalidate=120',
    queryParams: 'slugs (Danh sách tối đa 20 slug đang theo dõi)',
    summary:
      'Truy vấn hàng loạt giá thấp nhất hiện tại, trung vị 90 ngày và trạng thái giảm giá thật/ảo cho danh sách sản phẩm trong Watchlist.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/lookup',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=30, stale-while-revalidate=120',
    queryParams: 'q hoặc url (Link Shopee/Lazada/Tiki hoặc từ khóa)',
    summary:
      'Phân tích đường dẫn sản phẩm hoặc gian hàng TMĐT, tự động đối chiếu với cụm sản phẩm chuẩn hóa và hồ sơ tín nhiệm gian hàng.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/inspect',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=30, stale-while-revalidate=120',
    queryParams: 'q (URL hoặc tên máy), price (Giá quan sát tùy chọn)',
    summary:
      'Trình Kiểm Định Giá & Link Sàn (/inspect): chuẩn hóa URL trên 10 sàn/đại lý, chặn phụ kiện/linh kiện, đối chiếu trung vị giá 90 ngày và trả về kết luận giá 5 mức.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/extension/lookup',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=30, stale-while-revalidate=120',
    queryParams: 'url, title, price, originalPrice, skuText',
    summary:
      'Endpoint tốc độ cao chuyên dụng cho Rate Browser Extension MV3 trên 10 sàn/đại lý (Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, TGDĐ, FPT Shop, Hoàng Hà, Di Động Việt, Phong Vũ).',
  },
  {
    method: 'POST',
    path: '/api/v1/rate/extension/ingest',
    auth: 'Zero-Trust Quarantine (Opt-In Consent)',
    cache: 'no-store (Enqueue rate.crawl_jobs)',
    queryParams:
      'Body JSON: { url, platform, title, currentPrice, originalPrice, skuText, consentGranted: true }',
    summary:
      'Cổng tiếp nhận tín hiệu sản phẩm ẩn danh từ Browser Extension MV3: kiểm duyệt cấu trúc, xóa tham số định danh cá nhân (PII) và đẩy vào hàng đợi rate.crawl_jobs.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/merchants',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams: 'platform, officialOnly, q',
    summary:
      'Danh bạ gian hàng TMĐT kèm điểm Tín nhiệm kép (Dual Risk Score): DOSafe Threat Intel Risk + AI Review Seeding Risk.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/merchants/[id]',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams: 'id (UUID, slug hoặc platform_shop_id)',
    summary:
      'Hồ sơ kiểm toán chi tiết của một gian hàng, phân bổ rủi ro đánh giá AI và danh sách các sản phẩm đang niêm yết.',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/stats',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=60, stale-while-revalidate=300',
    queryParams: 'Không yêu cầu tham số',
    summary:
      'Số liệu thống kê trực tiếp toàn nền tảng (số sản phẩm gốc, điểm lịch sử giá, tỷ lệ đánh giá thực chất và danh mục 5 ngành hàng).',
  },
  {
    method: 'GET',
    path: '/api/v1/rate/openapi.json',
    auth: 'Public (CORS Enabled)',
    cache: 's-maxage=3600, stale-while-revalidate=86400',
    queryParams: 'Không yêu cầu tham số',
    summary:
      'Đặc tả kỹ thuật OpenAPI 3.1.0 chuẩn máy đọc (machine-readable JSON) cho toàn bộ các REST API v1 endpoints của Rate.vn.',
  },
  {
    method: 'POST',
    path: '/api/v1/rate/reviews',
    auth: 'Bearer token (Supabase Auth)',
    cache: 'no-store (RPC rate.submit_community_review)',
    queryParams:
      'Header Authorization: Bearer <access token>; Body JSON: { masterProductId, authorName, ratingStar, comment, criteriaRatings }',
    summary:
      'Gửi đánh giá cộng đồng 5 tiêu chí JReviews kèm bộ lọc chống spam/seeding tự động và cập nhật điểm trọng số.',
  },
  {
    method: 'POST',
    path: '/api/reviews/[id]/vote',
    auth: 'Bearer token (Supabase Auth)',
    cache: 'no-store (Real-time In-DB Trigger)',
    queryParams: 'Body JSON: { "action": "helpful" | "report" }',
    summary:
      'Ghi nhận bình chọn Hữu ích hoặc Báo cáo Seeding vào bảng rate.review_votes với cơ chế chống trùng theo voter_hash và kích hoạt trigger cập nhật tức thì.',
  },
];

const TEN_FIELD_GROUPS = [
  {
    order: 1,
    key: 'launch',
    title: 'Launch & Availability',
    fields: 'announced, status, release_date, model_variants',
  },
  {
    order: 2,
    key: 'body',
    title: 'Body & Durability',
    fields:
      'dimensions, weight_g, build_materials, sim_type, ip_rating, colors',
  },
  {
    order: 3,
    key: 'display',
    title: 'Display & Panel',
    fields:
      'type, size_inches, resolution, refresh_rate_hz, peak_brightness_nits, protection_glass',
  },
  {
    order: 4,
    key: 'platform',
    title: 'Platform & Chipset',
    fields: 'os, chipset, cpu_cores, gpu, antutu_score, geekbench_score',
  },
  {
    order: 5,
    key: 'memory',
    title: 'Memory & Storage',
    fields: 'ram_options_gb, storage_options_gb, storage_type, card_slot',
  },
  {
    order: 6,
    key: 'cameras',
    title: 'Multi-Camera System (PhoneArena Split)',
    fields:
      'main_camera, second_camera (Ultrawide), third_camera (Telephoto), fourth_camera, front_camera',
  },
  {
    order: 7,
    key: 'audio',
    title: 'Sound & Acoustics',
    fields: 'loudspeaker_type, jack_3_5mm, hi_res_audio, spatial_audio',
  },
  {
    order: 8,
    key: 'connectivity',
    title: 'Comms & Connectivity',
    fields: 'wlan_wifi, bluetooth, gps_positioning, nfc, usb_type, uwb_support',
  },
  {
    order: 9,
    key: 'battery',
    title: 'Battery & Charging',
    fields:
      'capacity_mah, wired_charging_w, wireless_charging_w, reverse_charging, battery_life_endurance',
  },
  {
    order: 10,
    key: 'misc',
    title: 'Sensors, SAR & Regulatory',
    fields: 'sensors_list, sar_eu_w_kg, energy_label, price_launch_reference',
  },
];

export default async function DevelopersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const stats = await getCachedRatePlatformStats();

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      {/* Hero Header */}
      <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
        <div className="container py-3">
          <div className="row align-items-center g-4">
            <div className="col-lg-8">
              <div className="d-inline-flex align-items-center rounded-pill bg-danger bg-opacity-25 border-danger text-light small fw-semibold mb-3 gap-2 border px-3 py-1">
                <BsCodeSquare className="text-danger" />
                <span>
                  Open-Core Composable Backend Architecture (Zero-Strapi 2026)
                </span>
              </div>
              <h1 className="display-6 fw-bold mb-3 text-white">
                Cổng Nhà Phát Triển &amp;{' '}
                <span className="text-danger">Open-Core REST API v1</span>
              </h1>
              <p className="lead text-white-50 mb-4">
                Truy cập mở vào dữ liệu chuẩn hóa 10 nhóm thông số kỹ thuật,
                chuỗi thời gian lịch sử giá 90 ngày và kết quả kiểm toán đánh
                giá AI trên schema <code>rate.*</code>. Phục vụ đồng thời Web
                Client Islands, Browser Extension MV3 trên 10 sàn/đại lý và cộng
                đồng nghiên cứu dữ liệu TMĐT.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <a
                  href="#playground"
                  className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                >
                  ⚡ Chạy thử API Playground
                </a>
                <a
                  href="/api/v1/rate/openapi.json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-info rounded-pill fw-semibold px-4 py-2"
                >
                  📄 Tải OpenAPI 3.1.0 Spec (.json)
                </a>
                <a
                  href="https://github.com/DOS/Rate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-light rounded-pill fw-medium d-inline-flex align-items-center gap-2 px-4 py-2"
                >
                  <BsGithub /> Mã nguồn DOS/Rate (Open-Core)
                </a>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card rounded-4 bg-opacity-50 border-secondary border-opacity-25 border bg-black p-4 text-white">
                <div className="small text-uppercase text-white-50 fw-bold mb-3">
                  Trạng thái Dữ liệu Trực tiếp (Supabase Cloud)
                </div>
                <div className="row g-3">
                  <div className="col-6">
                    <div className="small text-white-50">Master Products</div>
                    <div className="h4 fw-bold text-warning mb-0">
                      {stats.masterProductsCount}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="small text-white-50">Điểm Lịch sử Giá</div>
                    <div className="h4 fw-bold text-info mb-0">
                      {stats.priceObservationsCount}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="small text-white-50">Review Đã Lọc AI</div>
                    <div className="h4 fw-bold text-success mb-0">
                      {stats.totalReviewsCount}
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="small text-white-50">Gian hàng TMĐT</div>
                    <div className="h4 fw-bold text-light mb-0">
                      {stats.merchantsCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Playground Section */}
      <section className="bg-light py-5" id="playground">
        <div className="container">
          <div className="mb-4">
            <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
              🧪 Live API Sandbox
            </span>
            <h2 className="h3 fw-bold mb-1">
              Môi Trường Thử Nghiệm Trực Tiếp (Interactive Playground)
            </h2>
            <p className="text-muted mb-0">
              Gửi truy vấn thật tới tầng BFF `/api/v1/rate/*` ngay trên trình
              duyệt và kiểm tra cấu trúc JSON trả về.
            </p>
          </div>

          <ApiPlaygroundClient />
        </div>
      </section>

      {/* Endpoint Reference Table */}
      <section className="border-top border-bottom bg-white py-5">
        <div className="container">
          <div className="mb-4">
            <span className="badge bg-success bg-opacity-10 text-success rounded-pill fw-semibold mb-2 px-3 py-2">
              📡 Đặc Tả Giao Thức REST API v1
            </span>
            <h2 className="h3 fw-bold mb-1">Danh Sách Endpoints Chuẩn Hóa</h2>
            <p className="text-muted mb-0">
              Tất cả các endpoint đọc dữ liệu đều hỗ trợ CORS
              (`Access-Control-Allow-Origin: *`) và bộ nhớ đệm biên
              (`Stale-While-Revalidate`).
            </p>
          </div>

          <div className="table-responsive rounded-4 border shadow-sm">
            <table className="table-hover mb-0 table align-middle">
              <thead className="table-dark">
                <tr>
                  <th style={{ width: '90px' }}>Method</th>
                  <th style={{ minWidth: '250px' }}>Endpoint Path</th>
                  <th style={{ minWidth: '210px' }}>Tham số (Query / Body)</th>
                  <th>Mô tả &amp; Nguồn bảng dữ liệu</th>
                  <th style={{ minWidth: '180px' }}>
                    Cơ chế Cache &amp; Bảo mật
                  </th>
                </tr>
              </thead>
              <tbody>
                {API_ENDPOINTS_SPEC.map((ep) => (
                  <tr key={ep.path}>
                    <td>
                      <span
                        className={`badge rounded-pill px-3 py-2 ${
                          ep.method === 'GET' ? 'bg-primary' : 'bg-danger'
                        }`}
                      >
                        {ep.method}
                      </span>
                    </td>
                    <td className="font-monospace fw-bold text-dark small">
                      {ep.path}
                    </td>
                    <td className="font-monospace text-muted small">
                      {ep.queryParams}
                    </td>
                    <td className="small text-secondary">{ep.summary}</td>
                    <td>
                      <div className="small fw-semibold text-dark">
                        {ep.auth}
                      </div>
                      <div
                        className="font-monospace text-muted"
                        style={{ fontSize: '0.72rem' }}
                      >
                        {ep.cache}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 10 Field Groups Zod Specification Reference */}
      <section className="bg-light py-5">
        <div className="container">
          <div className="row align-items-end g-3 mb-4">
            <div className="col-lg-8">
              <span className="badge bg-info bg-opacity-10 text-info rounded-pill fw-semibold mb-2 px-3 py-2">
                📐 @repo/shared-data Zod Schema
              </span>
              <h2 className="h3 fw-bold mb-1">
                Chuẩn Hóa 10 Nhóm Thông Số Kỹ Thuật (GSMArena + PhoneArena)
              </h2>
              <p className="text-muted mb-0">
                Trường <code>specifications</code> (JSONB) trong bảng{' '}
                <code>rate.master_products</code> tuân thủ nghiêm ngặt schema 10
                nhóm dưới đây, cho phép so sánh chéo giữa các sàn mà không bị
                nhiễu bởi cách đặt tên tự do của người bán.
              </p>
            </div>
            <div className="col-lg-4 text-lg-end">
              <Link
                href="/compare"
                className="btn btn-outline-primary rounded-pill fw-medium px-4"
              >
                ⚖️ Xem Bàn Cân 10 Nhóm Thông Số →
              </Link>
            </div>
          </div>

          <div className="row g-3">
            {TEN_FIELD_GROUPS.map((group) => (
              <div key={group.key} className="col-lg-6 col-12">
                <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge bg-dark rounded-pill">
                        Nhóm #{group.order}
                      </span>
                      <span className="fw-bold text-dark">{group.title}</span>
                    </div>
                    <code className="small text-primary fw-semibold">
                      specifications.{group.key}
                    </code>
                  </div>
                  <div className="small text-muted font-monospace">
                    Trường chuẩn: {group.fields}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4-Layer Architecture Overview */}
      <section className="border-top bg-white py-5">
        <div className="container">
          <div className="mb-4 text-center">
            <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
              🏛️ Kiến Trúc 4 Tầng Độc Lập (4-Layer Composable Architecture)
            </span>
            <h2 className="h3 fw-bold mb-2">
              Ranh Giới Rõ Ràng Giữa Open-Core &amp; Bảo Mật Hạ Tầng
            </h2>
          </div>

          <div className="row g-4">
            <div className="col-lg-3 col-md-6">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <BsLayers className="text-primary fs-2 mb-3" />
                <h5 className="fw-bold">Layer 1: Web BFF &amp; REST API v1</h5>
                <p className="small text-muted mb-0">
                  Next.js 16.3.8 Server Data Layer bọc{' '}
                  <code>React.cache()</code> cùng hệ thống JSON REST API v1 phục
                  vụ Web Client và Browser Extension MV3.
                </p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <BsCpu className="text-success fs-2 mb-3" />
                <h5 className="fw-bold">Layer 2: Open-Core Intelligence</h5>
                <p className="small text-muted mb-0">
                  Bộ chuẩn hóa <code>ProductNormalizer</code>, đối sánh thực thể
                  3 tầng <code>EntityMatcher</code>, <code>AiSpecEnricher</code>{' '}
                  và <code>AiReviewAnalyzer</code> công khai minh bạch.
                </p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <BsShieldLock className="text-warning fs-2 mb-3" />
                <h5 className="fw-bold">Layer 3: Anti-Detect Queue Workers</h5>
                <p className="small text-muted mb-0">
                  Xử lý hàng đợi bất đồng bộ qua cơ chế khóa nguyên tử
                  PostgreSQL <code>FOR UPDATE SKIP LOCKED</code> tại repo
                  Enterprise riêng biệt.
                </p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6">
              <div className="card rounded-4 h-100 border p-4 shadow-sm">
                <BsDatabaseCheck className="text-danger fs-2 mb-3" />
                <h5 className="fw-bold">Layer 4: In-DB Trigger Engine</h5>
                <p className="small text-muted mb-0">
                  PostgreSQL 17 trên Supabase Cloud với RLS bảo vệ PII, hàm
                  trung vị giá 90 ngày và trigger tự động tính điểm JReviews.
                </p>
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
