# 🗺️ Rate Platform Roadmap - Kiến Trúc Zero-Strapi & Open-Core 2026

> **Cập nhật lần cuối:** 18/10/2026  
> **Tech Stack chuẩn hóa:** TypeScript 7.0.2 + Next.js 16.3.8 + React 19.3 + Pure PostgreSQL 17 (Supabase Cloud `rate` schema) + Open-Core 2 Repositories (`DOS/Rate` & `DOS/Rate-Services`)  
> **GitHub Project Board (Multi-Agent Queue):** [https://github.com/orgs/DOS/projects/9](https://github.com/orgs/DOS/projects/9)  
> **Nhật ký hoàn thành chi tiết (Phases 1 -> 5):** Xem [`Docs/Resources/CHANGELOG.md`](./CHANGELOG.md)  
> **Đặc tả Mô hình Tin cậy Đánh giá (Review Trust Model v2):** Xem [`Docs/Platform/review-trust-model.html`](../Platform/review-trust-model.html)

---

## 1. Kiến Trúc 4 Tầng Chuyên Biệt (Composable 4-Layer Architecture)

Hệ thống **Rate Platform (`rate.vn`)** vận hành trên kiến trúc 4 tầng không phụ thuộc Strapi CMS hay Redis:

1. **Tầng 1 - Web BFF, Pure Domain & REST API v1 (`apps/web` trong `DOS/Rate`):**
   - Giao diện **Next.js 16.3.8** (App Router + Turbopack) + **React 19.3** + **Bootstrap 5.3.8** + **`next-intl`** (`vi` mặc định tại `/`, `en`, `cs`).
   - Tách biệt rõ ràng giữa **Pure Domain Module (`apps/web/src/lib/rate-domain.ts`)** cho Client Components và **Server Data Layer (`apps/web/src/server/rate/`)** bọc `React.cache()` + `server-only`.
   - Cung cấp 14 REST API v1 endpoints chuẩn OpenAPI 3.1.0 (`/api/v1/rate/openapi`) với bộ chuẩn hóa lỗi `api-errors.ts` và kiểm tra đầu vào chặt chẽ.
2. **Tầng 2 - Open-Core Intelligence Engine (`apps/importer` & `packages/shared-data` trong `DOS/Rate`):**
   - Chuẩn hóa **10 Field Groups** (`specs.schema.ts`) cho 5 ngành hàng (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`).
   - `ProductNormalizer` (phân biệt `listing_condition`, `market_region`, `ram_gb`, `storage_gb`), `EntityMatcher` (Dedupe 3 tầng fail-closed), `AiSpecEnricher` (gắn nhãn nguồn `spec_source`, khởi tạo `draft` khi chưa kiểm chứng) và `AiReviewAnalyzer` (chấm điểm 6 trục, làm mượt Bayesian $k=3, \mu_0=3.80$, phát hiện sao chép 3-shingle và tách rủi ro kép gian hàng).
3. **Tầng 3 - Private Anti-Detect Scraper & Queue Worker (`DOS/Rate-Services`):**
   - Bộ định tuyến cào đa sàn **10/10 nền tảng** (`MultiPlatformScraper`), `SmartJobSeeder`, `MultiPlatformSearchDiscovery`, `PriceAlertEvaluator`, `PriceAnomalyAuditor`, `MerchantRiskAuditor`, `ReviewBurstAuditor` và `PriceSpreadAuditor` dùng chung `@repo/crawlers` qua submodule `vendor/rate`.
4. **Tầng 4 - Database, Atomic Queue & In-DB Trigger Engine (`Supabase Cloud PostgreSQL 17` - Schema `rate`):**
   - Sổ cái migration duy nhất tại `DOS-Me/supabase/migrations/` (bản sao tham chiếu Open-Core đặt tại `supabase/migrations/`).
   - Hàng đợi nguyên tử `FOR UPDATE SKIP LOCKED` kèm `claim_token`, RPC cách ly quyền tối thiểu (`enqueue_crowd_verify_signal`, `refresh_master_market_stats`, `refresh_master_product_rating`, `search_master_products`, `get_category_brand_facets`).

---

## 2. Tóm Tắt Các Giai Đoạn Đã Hoàn Thành (Xem Chi Tiết Tại [`CHANGELOG.md`](./CHANGELOG.md))

- [x] **Phase 1 - Nền Tảng Database PostgreSQL 17 & Schema 2 Tầng:** Khởi tạo `rate` schema, hàng đợi `crawl_jobs`, schema Zod 10 nhóm thông số và hàm `match_master_product`.
- [x] **Phase 2 - Pipeline Cào Dữ Liệu, Dedupe & AI Spec Enricher:** Xây dựng `ProductNormalizer`, `EntityMatcher`, `AiSpecEnricher` đa LLM và `queue-worker` chống trùng lịch sử giá.
- [x] **Phase 3 - AI Review Intelligence, Dual Risk Score & JReviews Voting:** Phân loại 5 nhóm cờ đánh giá, tách `dosafe_risk_score` / `review_risk_score` và bình chọn đánh giá có trọng số.
- [x] **Phase 4 - Trải Nghiệm Directory 5 Ngành Hàng, So Sánh 1v1, Deal Radar & Kiến Trúc Next.js 16 (`4.1 -> 4.78`):** Hoàn thiện toàn bộ giao diện 5 ngành hàng, `/leaderboard`, `/compare`, `/compare/[versus]`, `/deals`, `/inspect`, `/merchants`, `/watchlist`, `/developers` và đồng bộ Deal Radar.
- [x] **Phase 5 - Đa Sàn 10/10 Nền Tảng, Browser Extension MV3 & Kiểm Toán Tự Động (`5.1 -> 5.20`):** Mở rộng 10 sàn TMĐT/đại lý, tiện ích mở rộng Chrome MV3 Shadow DOM + Side Panel, hợp nhất engine qua submodule `vendor/rate` và dọn sạch di sản Strapi.

---

## 3. Lộ Trình Đang Triển Khai & Sắp Tới (Phase 6 & Phase 7)

### 🛡️ Phase 6: Củng Cố Bảo Mật, Hiệu Năng DB & Review Trust Model v2 (2026 Q4)

- [x] **6.1. Review Trust Model v2 P1/P2/P3 (`DOS/Rate#162`, `#166`, `#169`):**
  - Chấm điểm 6 trục (`Authenticity`, `Independence`, `Depth`, `Reviewer`, `Context`, `Community`), định tuyến bình luận thuần vận chuyển về gian hàng (`E = 0`), phát hiện mâu thuẫn sao - cảm xúc, làm mượt điểm sản phẩm bằng **Bayesian Shrinkage ($k=3, \mu_0=3.80$)** kèm nhãn độ tin cậy, trọng số người bình chọn (`computeVoterWeight`), xếp hạng **Wilson Lower Bound** và phát hiện văn mẫu sao chép 3-shingle.
- [x] **6.2. Khóa Quyền Tối Thiểu & Vệ Sinh Phụ Thuộc (`DOS/Rate#159`, `#163`, `#168`, `#170`, `#172`, `#173`, `#174`, `#175`):**
  - Loại bỏ `SUPABASE_SERVICE_ROLE_KEY` khỏi đường đọc/ghi Web public (`extension/ingest` gọi RPC `rate.enqueue_crowd_verify_signal`), tách `@/lib/rate-domain` cho toàn bộ 14 Client Components, thêm HTTP Security Headers, chống CSV Formula Injection, và xử lý triệt để toàn bộ cảnh báo Dependabot (`0` open alerts trên cả `DOS/Rate` và `DOS/Rate-Services`).
- [x] **6.3. Chuẩn Hóa Thủ Tục SQL, Chỉ Mục BRIN/GIN & Đẩy Lọc Xuống PostgreSQL (`DOS/Rate#176`, `#177`, `#178`):**
  - Cố định `SET search_path = ''`, `SECURITY INVOKER` cho các hàm/view đọc công khai, chỉ mục BRIN trên `price_history(recorded_at)`, `ON DELETE RESTRICT` bảo vệ lịch sử khi lưu trữ gian hàng, hàm chuẩn `refresh_master_market_stats`, chống flood cả `INSERT` lẫn `UPDATE` trên `review_votes`, và đẩy lọc/phân trang danh mục xuống `get_category_brand_facets` + `search_master_products`.
- [ ] **6.4. Đồng Bộ Migration Ledger Sang `DOS-Me` & Kiểm Thử Replay Tự Động (Audit C9 / K1):**
  - Tạo PR đồng bộ các migration tham chiếu (`20261017235900`, `20261018003000`, `20261018010000`, `20261018013000`) sang sổ cái chính thức `DOS-Me/supabase/migrations/` và chạy kiểm thử trên môi trường `preview -> beta -> prod`.
- [ ] **6.5. Bảo Vệ Nhánh & Quét Bí Mật Trên GitHub (`DOS/Rate` - Audit K3):**
  - Bật GitHub Secret Scanning, Push Protection, CodeQL và Branch Rulesets cho `main` và `dev` sau khi hoàn tất làm sạch lịch sử git (`#153`).

### 🚀 Phase 7: Mở Rộng Độ Phủ Dữ Liệu Thật Đa Sàn & Kiểm Thử E2E (2027 Q1)

- [ ] **7.1. Mở Rộng Phủ Dữ Liệu Thật (Provenance-Verified Catalog):**
  - Vận hành định kỳ `scheduled-crawler.yml` trên `DOS/Rate-Services` để thu thập giá niêm yết thật, lịch sử giá thật và đánh giá thật có gắn nguồn kiểm chứng (`spec_source`, `observation_id`) cho toàn bộ 5 ngành hàng.
- [ ] **7.2. Bộ Kiểm Thử Hành Vi Route Handlers & E2E Smoke Suite (Audit T1):**
  - Bổ sung kiểm thử trực tiếp cho các Route Handlers (`/api/v1/rate/*`) với mock Supabase client kiểm tra đầy đủ mã lỗi `400`, `401`, `429`, `500` và kiểm thử Playwright E2E trên bản build thực tế.
- [ ] **7.3. Tối Ưu Hóa Cache Đa Tầng Next.js 16 (`use cache` & `cacheTag` - Audit C3):**
  - Áp dụng `cacheLife` và `cacheTag('product:<slug>')` trong tầng `src/server/rate/` kết hợp webhook `revalidateTag` từ pipeline ingest.
