# 🗺️ Rate Platform Roadmap - Kiến Trúc Zero-Strapi & Open-Core 2026

> **Cập nhật lần cuối:** 14/10/2026  
> **Tech Stack chuẩn hóa:** TypeScript 7.0.2 + Next.js 16.3.8 + React 19.3 + Pure PostgreSQL 17 (Supabase Cloud `rate` schema) + Open-Core 2 Repositories (`DOS/Rate` & `DOS/Rate-Services`)  
> **GitHub Project Board (Multi-Agent Queue):** [https://github.com/orgs/DOS/projects/9](https://github.com/orgs/DOS/projects/9)  
> **Trạng thái hiện tại:** Đã hoàn thành Phase 1, Phase 2, Phase 3.1, Phase 3.2, Phase 4.1, Phase 4.2, Phase 4.3, Phase 4.4 & Đại phẫu Kiến trúc 2026 (Sẵn sàng cho Phase 3.3 & Phase 5)

---

## 1. Tầm Nhìn & Kiến Trúc Backend + Full-Stack 4 Tầng (Zero-Strapi 2026)

Hệ thống **Rate Platform (`rate.vn`)** vận hành trên kiến trúc **4 Tầng Chuyên Biệt (Composable 4-Layer Architecture)**, loại bỏ hoàn toàn Strapi CMS, Redis Streams và Python Splink cũ:

1. **Tầng 1 - Web BFF & REST API v1 (`apps/web` trong `DOS/Rate`):**
   - Giao diện **Next.js 16.3.8** (App Router + Turbopack) + **React 19.3** + **Bootstrap 5.3.8** + **`next-intl`** (`vi` mặc định tại `/`, `en`, `cs`).
   - Tầng Server Data (`apps/web/src/server/rate/`) tích hợp `React.cache()` deduplication và cung cấp các endpoints REST JSON (`/api/v1/rate/products`, `/api/v1/rate/products/[slug]`, `/api/v1/rate/lookup`, `/api/v1/rate/merchants`, `/api/v1/rate/merchants/[id]`, `/api/reviews/[id]/vote`).
2. **Tầng 2 - Open-Core Intelligence Engine (`apps/importer` & `packages/shared-data` trong `DOS/Rate`):**
   - Chuẩn hóa **10 Field Groups** (`specs.schema.ts` với Zod `^3.25.76`).
   - Bộ não `ProductNormalizer`, `EntityMatcher` (3-Tier Dedupe), `AiSpecEnricher` (đa LLM OpenAI-compatible) và `AiReviewAnalyzer` (lọc Seeding/Spam xu + tính điểm rủi ro kép `dosafe_risk_score` và `review_risk_score`).
3. **Tầng 3 - Private Anti-Detect Scraper & Queue Worker (`DOS/Rate-Services`):**
   - Chứa Playwright Stealth, giải Captcha (`shopee-captcha-solver.ts`), xoay IP `mproxy.vn` (`proxy-manager.ts`), và `queue-worker.ts` chạy định kỳ trên GitHub Actions Enterprise.
4. **Tầng 4 - Database, Queue & Trigger Engine (`Supabase Cloud PostgreSQL 17` - Schema `rate`):**
   - Sổ cái migration duy nhất tại `DOS-Me/supabase/migrations/`.
   - Mô hình sản phẩm 2 tầng (`rate.master_products` + `rate.products`), lịch sử giá chống trùng (`rate.price_history`), và hệ thống đánh giá kép JReviews (`rate.reviews`, `rate.review_flags`, `rate.review_votes`).

---

## 2. Trạng Thái Triển Khai Chi Tiết Theo Từng Phase

### ✅ Phase 1: Nền Tảng Database PostgreSQL 17 & Schema 2 Tầng (Đã hoàn thành)

- [x] Khởi tạo schema `rate` trên Supabase Cloud (`master_products`, `products`, `merchants`, `categories`, `price_history`, `reviews`, `review_flags`, `review_votes`).
- [x] Thiết lập hệ thống hàng đợi cào dữ liệu thuần Postgres (`rate.crawl_jobs`, `rate.crawl_runs`) với các `SECURITY DEFINER` RPCs (`dequeue_crawl_job`, `heartbeat_crawl_job`, `checkpoint_crawl_job`, `ack_crawl_job`, `fail_crawl_job`).
- [x] Định nghĩa bộ Schema Zod & TypeScript 7.0 cho **10 Field Groups** tại `packages/shared-data/src/schemas/specs.schema.ts`.
- [x] Xây dựng hàm PostgreSQL `match_master_product` sử dụng `pg_trgm` kết hợp lọc cứng theo `brand` và `storage_gb`.
- [x] Cấu hình triggers tự động cập nhật `min_price`, `max_price`, `merchant_count` và điểm đánh giá trọng số JReviews trên `rate.master_products`.

### ✅ Phase 2: Pipeline Cào Dữ Liệu, Dedupe & AI Spec Enricher (Đã hoàn thành)

- [x] **Shopee Scraper & Anti-Detect Proxy (`DOS/Rate-Services`):** Tích hợp `mproxy.vn` xoay IP, xử lý trượt Captcha và bóc tách chi tiết sản phẩm, biến thể, đánh giá.
- [x] **Queue-Driven Worker (`queue-worker.ts`):** Cơ chế nhận job theo lease, gửi heartbeat định kỳ, lưu checkpoint từng bước và chống trùng lặp `observation_id` cho lịch sử giá.
- [x] **RAM/ROM-Aware `ProductNormalizer` (`product-normalizer.ts`):** Nhận diện chính xác dung lượng RAM và ROM trong tiêu đề tiếng Việt phức tạp.
- [x] **Provider-Agnostic `AiSpecEnricher` (`ai-spec-enricher.ts`):** Hỗ trợ mọi LLM chuẩn OpenAI-compatible (`dos-ai`, `openai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`) kèm bộ Sanitizer + Zod validation.

### ✅ Phase 3: AI Review Intelligence, Dual Risk Score & JReviews Voting (Đã hoàn thành 3.1 & 3.2)

- [x] **3.1. Module AI Review Analyzer (`apps/importer/src/shopee/ai-review-analyzer.ts` - Issue #6 & #7):**
  - Phân loại chi tiết 5 hạng mục (`authentic`, `low_value_coin_spam`, `seeding_fake`, `competitor_sabotage`, `review_bombing`), tự động loại bỏ bình luận rác nhận xu khỏi điểm trung bình.
- [x] **3.2. Tách biệt Dual Merchant Risk Score & JReviews Interactive Voting (Issue #15 & #16):**
  - Tách `dosafe_risk_score` (từ `dosafe.threat_intel`) và `review_risk_score` (từ tỷ lệ review bất thường), kết hợp thành `risk_score` tổng hợp.
  - Xây dựng bảng `rate.review_votes`, API `/api/reviews/[id]/vote` và giao diện `JReviewsSection.tsx` trên `/smartphones/[slug]`.
- [ ] **3.3. Batch Crawl & Backfill Mở Rộng Danh Mục Lên Supabase Cloud (Issue #8):**
  - Mở rộng seed & backfill thêm các dòng máy chủ lực mới lên Supabase Cloud.

### ✅ Phase 4: Nâng Cấp Trải Nghiệm Directory Filter, Biểu Đồ Lịch Sử Giá & Kiến Trúc Next.js 16 (Đã hoàn thành 100%)

- [x] **4.1. Bộ Lọc Đa Tiêu Chí Theo 10 Nhóm Thông Số (`/smartphones` - Issue #9):**
  - Thiết kế `category-filters.ts` hỗ trợ lọc động theo từng Category (`smartphones`, `tablets`, `laptops`) kế thừa giao diện `ListingHub` (`list-sidebar-one.tsx` + `grid-layout-01`).
- [x] **4.2. Biểu Đồ Lịch Sử Giá & Cảnh Báo Giảm Giá Ảo (`/smartphones/[slug]` - Issue #10):**
  - Triển khai `getMasterProductPriceHistory` và `PriceHistorySection.tsx` (Biểu đồ SVG chuỗi thời gian + phát hiện nâng khống giá gốc).
  - Khắc phục triệt để lỗi điều hướng `/en` bằng `localeCookie: false`.
- [x] **4.2b. Đại Phẫu Kiến Trúc Monorepo & Chuẩn Hóa TypeScript 7.0.2 (Issue #17):**
  - Nâng cấp toàn bộ Monorepo lên **TypeScript 7.0.2**, xóa 4 gói Zombie (`packages/ai`, `importer`, `strapi-types`, `validator`) và toàn bộ route/component Strapi cũ, bật lại `typescript.ignoreBuildErrors: false`, bổ sung tầng `src/server/rate/` (`React.cache`) và REST API `/api/v1/rate/*`.
- [x] **4.3. Thanh Tìm Kiếm Thông Minh Autocomplete & Chọn Máy So Sánh Động (`/compare` - Issue #11):**
  - Triển khai `CompareWorkspace.tsx` (Autocomplete kết nối REST API `/api/v1/rate/products`, thêm/bớt/đổi tối đa 4 mẫu điện thoại, chế độ "Chỉ hiện điểm khác biệt" & "Tô sáng thông số vượt trội" trên ma trận 10 nhóm thông số) cùng `CompareQuickToggle.tsx` và khay nổi `CompareTrayBar.tsx` trên `/smartphones` và `/smartphones/[slug]`.
- [x] **4.4. Nâng Cấp Trang Chủ Dữ Liệu Thật, Hồ Sơ Tín Nhiệm Gian Hàng (`/merchants`), Danh Mục Đa Ngành (`/tablets`, `/laptops`) & Kiểm Toán DB (`rate` Schema - Issue #18):**
  - Thay thế toàn bộ mock template trên Trang chủ bằng dữ liệu thật 100% từ Supabase `rate` schema, tích hợp `HeroSearchInspector.tsx` (Autocomplete + Kiểm tra Link Shopee/Lazada/Tiki/TikTok Shop phát hiện giảm giá ảo & điểm rủi ro kép).
  - Triển khai trang Danh mục `/tablets`, `/laptops` dùng chung bộ lọc 10 nhóm thông số và trang Hồ sơ Tín nhiệm Gian hàng `/merchants`, `/merchants/[id]` (Dual Risk Score + phân tích Seeding).
  - Mở rộng REST API v1 (`/api/v1/rate/lookup`, `/api/v1/rate/merchants`, `/api/v1/rate/merchants/[id]`) và viết migration chuẩn hóa bảo mật quyền truy cập + tối ưu chỉ mục (`20261014231500_rate_search_rpc_and_security_hardening.sql`).

### 🔮 Phase 5: Mở Rộng Đa Sàn & Browser Extension MV3

- [ ] **5.1. Mở rộng Scraper sang Lazada, Tiki, CellphoneS, Thế Giới Di Động (Issue #1 bên `DOS/Rate-Services`).**
- [ ] **5.2. Nâng cấp Rate Browser Extension (Manifest V3) kết nối trực tiếp API `/api/v1/rate/lookup`, `/api/v1/rate/products/[slug]` & `/api/v1/rate/merchants/[id]` (Issue #12).**
