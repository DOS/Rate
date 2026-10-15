# 🗺️ Rate Platform Roadmap - Kiến Trúc Zero-Strapi & Open-Core 2026

> **Cập nhật lần cuối:** 15/10/2026  
> **Tech Stack chuẩn hóa:** TypeScript 7.0.2 + Next.js 16.3.8 + React 19.3 + Pure PostgreSQL 17 (Supabase Cloud `rate` schema) + Open-Core 2 Repositories (`DOS/Rate` & `DOS/Rate-Services`)  
> **GitHub Project Board (Multi-Agent Queue):** [https://github.com/orgs/DOS/projects/9](https://github.com/orgs/DOS/projects/9)  
> **Trạng thái hiện tại:** Đã hoàn thành 100% toàn bộ Lộ trình Phase 1, Phase 2, Phase 3 (3.1 -> 3.3), Phase 4 (4.1 -> 4.11) & Phase 5 (5.1 & 5.2)

---

## 1. Tầm Nhìn & Kiến Trúc Backend + Full-Stack 4 Tầng (Zero-Strapi 2026)

Hệ thống **Rate Platform (`rate.vn`)** vận hành trên kiến trúc **4 Tầng Chuyên Biệt (Composable 4-Layer Architecture)**, loại bỏ hoàn toàn Strapi CMS, Redis Streams và Python Splink cũ:

1. **Tầng 1 - Web BFF & REST API v1 (`apps/web` trong `DOS/Rate`):**
   - Giao diện **Next.js 16.3.8** (App Router + Turbopack) + **React 19.3** + **Bootstrap 5.3.8** + **`next-intl`** (`vi` mặc định tại `/`, `en`, `cs`).
   - Tầng Server Data (`apps/web/src/server/rate/`) tích hợp `React.cache()` deduplication và cung cấp đầy đủ các endpoints REST JSON (`/api/v1/rate/stats`, `/api/v1/rate/products`, `/api/v1/rate/products/[slug]`, `/api/v1/rate/compare`, `/api/v1/rate/lookup`, `/api/v1/rate/inspect`, `/api/v1/rate/merchants`, `/api/v1/rate/merchants/[id]`, `/api/v1/rate/reviews`, `/api/reviews/[id]/vote`, `/api/v1/rate/extension/lookup`, `/api/v1/rate/extension/ingest`).
2. **Tầng 2 - Open-Core Intelligence Engine (`apps/importer` & `packages/shared-data` trong `DOS/Rate`):**
   - Chuẩn hóa **10 Field Groups** (`specs.schema.ts` với Zod `^3.25.76`).
   - Bộ não `ProductNormalizer`, `EntityMatcher` (3-Tier Dedupe), `AiSpecEnricher` (đa LLM OpenAI-compatible) và `AiReviewAnalyzer` (lọc Seeding/Spam xu + tính điểm rủi ro kép `dosafe_risk_score` và `review_risk_score`).
3. **Tầng 3 - Private Anti-Detect Scraper & Queue Worker (`DOS/Rate-Services`):**
   - Chứa Playwright Stealth, giải Captcha (`shopee-captcha-solver.ts`), xoay IP `mproxy.vn` (`proxy-manager.ts`), bộ định tuyến cào đa sàn 5 nền tảng (`MultiPlatformScraper`: Shopee, Lazada, Tiki, CellphoneS, Thế Giới Di Động) và `queue-worker.ts` chạy định kỳ trên GitHub Actions Enterprise.
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

### ✅ Phase 3: AI Review Intelligence, Dual Risk Score & JReviews Voting (Đã hoàn thành 100%)

- [x] **3.1. Module AI Review Analyzer (`apps/importer/src/shopee/ai-review-analyzer.ts` - Issue #6 & #7):**
  - Phân loại chi tiết 5 hạng mục (`authentic`, `low_value_coin_spam`, `seeding_fake`, `competitor_sabotage`, `review_bombing`), tự động loại bỏ bình luận rác nhận xu khỏi điểm trung bình.
- [x] **3.2. Tách biệt Dual Merchant Risk Score & JReviews Interactive Voting (Issue #15 & #16):**
  - Tách `dosafe_risk_score` (từ `dosafe.threat_intel`) và `review_risk_score` (từ tỷ lệ review bất thường), kết hợp thành `risk_score` tổng hợp.
  - Xây dựng bảng `rate.review_votes`, API `/api/reviews/[id]/vote` và giao diện `JReviewsSection.tsx` trên `/smartphones/[slug]`.
- [x] **3.3. Batch Crawl & Backfill Mở Rộng Danh Mục Lên Supabase Cloud (Issue #8):**
  - Chuẩn hóa và Backfill đầy đủ 10/10 Field Groups (tách cụm camera rời chuẩn PhoneArena + chiều sâu kỹ thuật GSMArena) cho toàn bộ 13 sản phẩm gốc (`rate.master_products`) trải rộng trên cả 5 ngành hàng (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`), 8 gian hàng đa sàn (`rate.merchants`), lịch sử giá 60 ngày (`rate.price_history`) và đánh giá JReviews chống Seeding (`flagship-seed-data.ts` + `test-ai-enricher.ts --backfill`).

### ✅ Phase 4: Nâng Cấp Trải Nghiệm Directory Filter, Biểu Đồ Lịch Sử Giá & Kiến Trúc Next.js 16 (Đã hoàn thành 100%)

- [x] **4.1. Bộ Lọc Đa Tiêu Chí Theo 10 Nhóm Thông Số (`/smartphones` - Issue #9):**
  - Thiết kế `category-filters.ts` hỗ trợ lọc động theo từng Category (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`) kế thừa giao diện `ListingHub` (`list-sidebar-one.tsx` + `grid-layout-01`).
- [x] **4.2. Biểu Đồ Lịch Sử Giá & Cảnh Báo Giảm Giá Ảo (`/smartphones/[slug]` - Issue #10):**
  - Triển khai `getMasterProductPriceHistory` và `PriceHistorySection.tsx` (Biểu đồ SVG chuỗi thời gian + phát hiện nâng khống giá gốc).
  - Khắc phục triệt để lỗi điều hướng `/en` bằng `localeCookie: false`.
- [x] **4.2b. Đại Phẫu Kiến Trúc Monorepo & Chuẩn Hóa TypeScript 7.0.2 (Issue #17):**
  - Nâng cấp toàn bộ Monorepo lên **TypeScript 7.0.2**, xóa 4 gói Zombie (`packages/ai`, `importer`, `strapi-types`, `validator`) và toàn bộ route/component Strapi cũ, bật lại `typescript.ignoreBuildErrors: false`, bổ sung tầng `src/server/rate/` (`React.cache`) và REST API `/api/v1/rate/*`.
- [x] **4.3. Thanh Tìm Kiếm Thông Minh Autocomplete & Chọn Máy So Sánh Động (`/compare` - Issue #11):**
  - Triển khai `CompareWorkspace.tsx` (Autocomplete kết nối REST API `/api/v1/rate/products`, thêm/bớt/đổi tối đa 4 mẫu thiết bị, chế độ "Chỉ hiện điểm khác biệt" & "Tô sáng thông số vượt trội" trên ma trận 10 nhóm thông số) cùng `CompareQuickToggle.tsx` và khay nổi `CompareTrayBar.tsx`.
- [x] **4.4. Nâng Cấp Trang Chủ Dữ Liệu Thật, Hồ Sơ Tín Nhiệm Gian Hàng (`/merchants`), Danh Mục Đa Ngành (`/tablets`, `/laptops`) & Kiểm Toán DB (`rate` Schema - Issue #18):**
  - Thay thế toàn bộ mock template trên Trang chủ bằng dữ liệu thật 100% từ Supabase `rate` schema, tích hợp `HeroSearchInspector.tsx` (Autocomplete + Kiểm tra Link Shopee/Lazada/Tiki/TikTok Shop phát hiện giảm giá ảo & điểm rủi ro kép).
  - Triển khai trang Danh mục `/tablets`, `/laptops` dùng chung bộ lọc 10 nhóm thông số và trang Hồ sơ Tín nhiệm Gian hàng `/merchants`, `/merchants/[id]` (Dual Risk Score + phân tích Seeding).
  - Mở rộng REST API v1 (`/api/v1/rate/lookup`, `/api/v1/rate/merchants`, `/api/v1/rate/merchants/[id]`) và viết migration chuẩn hóa bảo mật quyền truy cập + tối ưu chỉ mục (`20261014231500_rate_search_rpc_and_security_hardening.sql`).
- [x] **4.6. Chi Tiết Sản Phẩm Đa Danh Mục (`/tablets/[slug]`, `/laptops/[slug]`), Gửi Đánh Giá 5 Tiêu Chí JReviews (`POST /api/v1/rate/reviews`), Hệ Thống Canh Giá Thật (`/watchlist`), JSON-LD SEO & Dọn Dẹp 56 Route Template Dư Thừa (Issue #19):**
  - Tách `ProductDetailView` dùng chung cho `/smartphones/[slug]`, `/tablets/[slug]`, `/laptops/[slug]` kèm Schema.org `@graph` (`Product`, `AggregateOffer`, `AggregateRating`, `BreadcrumbList`) và `OnlineStore` trên `/merchants/[id]`.
  - Triển khai biểu mẫu viết đánh giá 5 tiêu chí JReviews (`Màn hình`, `Hiệu năng`, `Camera`, `Pin & Sạc`, `Đáng tiền`) trong `JReviewsSection.tsx`, API `POST /api/v1/rate/reviews` và migration RPC `rate.submit_community_review` (`20261014234500_rate_community_review_submission_rpc.sql`).
  - Triển khai nút `PriceWatchButton.tsx` và trang `/watchlist` (`WatchlistWorkspace.tsx`) cho phép đặt mức giá mục tiêu và theo dõi biến động giá thật.
  - Xóa 56 route demo khách sạn/nhà hàng dư thừa của template ListingHub, chuẩn hóa `FooterDynamic.tsx` và `sitemap.ts`.
- [x] **4.7. Củng Cố Core Architecture: Đa Ngôn Ngữ Toàn Diện (`vi`/`en`/`cs`), Cổng Tài Liệu & Sandbox Open-Core REST API v1 (`/developers`), Chuẩn Hóa Liên Kết Đa Danh Mục & Xóa Sạch 63 Component Template Dư Thừa (Issue #20):**
  - Đồng bộ hóa bộ từ điển đa ngôn ngữ (`apps/web/locales/{vi,en,cs}.json` + `src/lib/rate-i18n.ts`) trên toàn bộ Root Layout Metadata, Navbar, Footer, Trang chủ, Trang So sánh và các trang thông tin nền tảng.
  - Xây dựng Cổng Nhà Phát Triển `/developers` kèm `ApiPlaygroundClient.tsx` cho phép chạy thử trực tiếp các REST API v1 và tra cứu cấu trúc 10 Field Groups.
  - Chuẩn hóa hàm `getMasterProductHref` tự động định tuyến theo ngành hàng trên toàn hệ thống và hỗ trợ so sánh đa ngành hàng trên `/compare`.
  - Thay thế 4 trang thông tin lõi (`/about-us`, `/faq`, `/privacy-policy`, `/contact-us`) bằng nội dung kiểm toán dữ liệu thật của Rate.vn và xóa 63 component mẫu ListingHub không còn sử dụng.
- [x] **4.8. Hoàn Thiện Core 5/5 Ngành Hàng (`/smartwatches`, `/earbuds`), Chuẩn Hóa REST API v1 (`/api/v1/rate/stats`, `/api/v1/rate/compare`) & Kiểm Thử Tự Động Core Logic (Issue #21):**
  - Mở rộng đầy đủ 5/5 ngành hàng thiết bị công nghệ trong `rate.categories` với route chính thức `/smartwatches`, `/smartwatches/[slug]`, `/earbuds`, `/earbuds/[slug]` cùng bộ lọc chuyên biệt theo 10 nhóm thông số (`category-filters.ts`).
  - Bổ sung REST API v1 `GET /api/v1/rate/stats` (số liệu thống kê toàn nền tảng) và `GET /api/v1/rate/compare?slugs=...` (ma trận đối chiếu thông số, giá cả và điểm đánh giá JReviews).
  - Xây dựng bộ kiểm thử tự động `core-rate-architecture.test.ts` (kiểm định bộ lọc 5 ngành hàng, định tuyến chuẩn, phân tích URL TMĐT Shopee/Lazada/Tiki/TikTok Shop và từ điển đa ngôn ngữ `vi`/`en`/`cs`) tích hợp trực tiếp vào GitHub Actions CI (`.github/workflows/ci.yml`).
- [x] **4.9. Xóa Sạch Tàn Dư Strapi Cuối Cùng (`env.mjs`, `auth/options.ts`, CkEditor, Dead Forms), Tích Hợp Supabase Auth & Chuẩn Hóa Đa Ngôn Ngữ Cụm Trang Xác Thực (Issue #22):**
  - Loại bỏ hoàn toàn biến môi trường `STRAPI_*` khỏi `env.mjs`, `StrapiImageMedia` khỏi `types/api/index.ts` và 12 component Strapi v4 cũ không còn sử dụng.
  - Nâng cấp `auth/options.ts` và xây dựng `RateAuthPortal.tsx` tích hợp trực tiếp **Supabase Auth** (`signInWithPassword`, `signUp`, `resetPasswordForEmail`, `verifyOtp`) đa ngôn ngữ `vi`/`en`/`cs` trên `/login`, `/register`, `/forgot-password`, `/two-factor-auth`, `/not-found`, `/error`, `/loading`.
- [x] **4.10. Trung Tâm Kiểm Toán Link & Báo Cáo Giá Ảo Chuyên Sâu (`/inspect`), Đồng Bộ Canh Giá Đa Ngành (`/watchlist`) & Cloud Price Alerts API (Issue #23):**
  - Xây dựng trang `/inspect` (`DeepInspectWorkspace.tsx`) và endpoint `GET /api/v1/rate/inspect` cho phép kiểm toán sâu bất kỳ URL Shopee/Lazada/Tiki/TikTok Shop kèm link báo cáo chia sẻ (`/inspect?q=...`).
  - Nâng cấp `/watchlist` hỗ trợ cả 5 ngành hàng, tích hợp endpoint `POST /api/v1/rate/watchlist` và file migration chuẩn hóa `rate.price_alerts` (`20261015010000_rate_price_alerts_and_watchlist_rpc.sql`).
- [x] **4.11. Quốc Tế Hóa Toàn Diện (`vi`/`en`/`cs`) Cho Danh Mục 5 Ngành Hàng, Hồ Sơ Gian Hàng (`/merchants`) & Chi Tiết Sản Phẩm (Issue #24):**
  - Đồng bộ SEO Metadata, Breadcrumb và tiêu đề đa ngôn ngữ `vi`/`en`/`cs` trên `/merchants`, `/merchants/[id]`, `/smartphones` và `ProductDetailView` cho toàn bộ 5 ngành hàng.
- [x] **4.12. Bộ Lọc Tương Tác Danh Bạ Gian Hàng (`/merchants`), Chuẩn Hóa 5 Ngành Hàng Open-Core (`apps/importer`) & Kiểm Thử Tự Động CI (Issue #25):**
  - Xây dựng `MerchantDirectoryExplorer.tsx` hỗ trợ tìm kiếm trực tiếp (`q`), lọc theo Sàn TMĐT, `Official Mall`, cấp độ rủi ro kép (`Dual Risk Score`) và sắp xếp theo `trust_score`, số lượng sản phẩm, tỷ lệ Seeding AI.
  - Nâng cấp `ProductNormalizer` (`detectCategorySlug`) và `ShopeeToSupabasePipeline` hỗ trợ tự động phân loại cả 5 ngành hàng (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`) kèm bộ kiểm thử tự động `open-core-intelligence.test.ts` trên CI.
- [x] **4.13. Mở Rộng Rate Browser Extension MV3 Lên 10 Sàn/Đại Lý, Ô Tra Cứu Nhanh Side Panel & Tích Hợp CI (Issue #26):**
  - Nâng cấp `apps/extension` và `apps/web/src/server/rate/extension.ts` hỗ trợ 10 nền tảng (`shopee`, `lazada`, `tiki`, `tiktok`, `cellphones`, `tgdd`, `fptshop`, `hoangha`, `didongviet`, `phongvu`), bổ sung ô tra cứu nhanh `RATE_SIDEPANEL_QUICK_QUERY` ngay trong Chrome Side Panel, thẻ tóm tắt `key_specs` 10 nhóm và đưa `@repo/extension build` + `test` vào `.github/workflows/ci.yml`.
- [x] **4.14. Cổng Nhà Phát Triển (`/developers`): Đặc Tả OpenAPI 3.1.0 (`/api/v1/rate/openapi.json`) & Interactive API Playground (Issue #27):**
  - Xuất bản tài liệu OpenAPI 3.1.0 chuẩn máy đọc (`GET /api/v1/rate/openapi.json`) cho toàn bộ 13 REST API v1 endpoints và nâng cấp `ApiPlaygroundClient.tsx` hỗ trợ cả `GET` lẫn `POST` (Zero-Trust Quarantine Ingest) kèm chuyển đổi mã lệnh `cURL` / `TS fetch()`.
- [x] **4.15. Nút Theo Dõi Giá (`WatchlistQuickToggle`) & Kiểm Định Nhanh (`/inspect`) Trên Toàn Bộ Thẻ Sản Phẩm 5 Ngành Hàng + Trang Chủ (Issue #28):**
  - Tích hợp `WatchlistQuickToggle.tsx` cạnh `CompareQuickToggle.tsx` trên mọi thẻ sản phẩm của cả 5 danh mục ngành hàng và Trang chủ, kèm liên kết kiểm định nhanh `/inspect?q=<slug>`.
- [x] **4.16. Biểu Mẫu Đóng Góp Link & Báo Cáo Giá Ảo Cộng Đồng (`/contact-us`) Kết Nối Zero-Trust Quarantine (Issue #29):**
  - Triển khai `CommunityQuarantineSubmitForm.tsx` trên `/[locale]/contact-us` kết nối trực tiếp tới `POST /api/v1/rate/extension/ingest` (`consentGranted = true`) để người mua gửi đường dẫn nghi vấn giảm giá ảo trên 10 sàn/đại lý vào hàng đợi `rate.crawl_jobs`.
- [x] **4.17. Gợi Ý Đối Thủ Cùng Phân Khúc & So Sánh 1-Chạm Trên Chi Tiết Sản Phẩm + Thẻ Tóm Tắt Kết Luận So Sánh Tự Động Trên `/compare` (Issue #30):**
  - Bổ sung khối `relatedCompetitors` ("Đối Thủ Trực Tiếp Cùng Phân Khúc & So Sánh 1-Chạm") và nút `🔍 Kiểm định` theo từng gian hàng trên `ProductDetailView`, cùng thẻ "Kết Luận Đối Chiếu Tự Động Theo 10 Nhóm Thông Số" và nút `🔔 Canh giá cả nhóm` trên `CompareWorkspace.tsx`.
- [x] **4.18. Chuẩn Hóa `DESIGN.md` v2.0, Xóa Slug Ngôn Ngữ (`/en`, `/cs`) Khi Đổi Locale & Hiển Thị Đủ 10/10 Nhóm Thông Số Trên `ProductDetailView` (Issue #31):**
  - Ban hành tài liệu thiết kế gốc `DESIGN.md` v2.0 tại thư mục gốc dự án; chuyển `routing` trong `navigation.ts` sang `localePrefix: "never"` kèm cookie `NEXT_LOCALE` và redirect `308` trong `middleware.ts` để đổi ngôn ngữ luôn giữ nguyên URL gốc; nâng cấp `ProductDetailView` hiển thị đủ 10/10 nhóm thông số chuẩn hóa (bao gồm tách rời cụm camera chuẩn PhoneArena `main_camera`, `second_camera`, `third_camera`, `fourth_camera`, `front_camera`).
- [x] **4.19 & 4.20. Hiện Đại Hóa Giao Diện Hero, Telemetry Strip, 5 Trang Danh Mục & `/merchants` Theo `DESIGN.md` v2.0 + Test Regression Locale URL (Issue #32 & Issue #33):**
  - Thay thế toàn bộ ảnh nền template cũ (`/img/banner-6.jpg`, `data-overlay`, `br-dashed`) trên Trang chủ, 5 trang Danh mục ngành hàng và trang Gian hàng bằng nền Dark Obsidian (`#0f1113` -> `#141821`) kết hợp Radial Glow đỏ `#FF2E29` / Indigo AI và thẻ kính mờ `tabular-nums`; bổ sung bài kiểm thử tự động `[8/8]` trong `core-rate-architecture.test.ts` đảm bảo `localePrefix: "never"`.
- [x] **4.21. Đồng Bộ & Gia Cố Bảo Mật 3 Bản Migration `rate` Vào Sổ Cái Trung Tâm `DOS/DOS.Me` (`PR #1189` - Issue #34):**
  - Đồng bộ và gia cố bảo mật 3 bản migration `rate` (`20261014231500_rate_search_rpc_and_security_hardening.sql`, `20261014234500_rate_community_review_submission_rpc.sql`, `20261015010000_rate_price_alerts_and_watchlist_rpc.sql`) vào `DOS/DOS.Me/supabase/migrations/`, mở rộng `scripts/migration/test-rate-schema-replay.mjs` kiểm thử replay kép trên PostgreSQL 17 với `pg_trgm` thuộc schema `sign`, vượt qua Fresh-Context Subagent Review & `DOS Code Review`, và tự động merge PR `DOS/DOS.Me#1189` (commit `717c3e177`).

### ✅ Phase 5: Mở Rộng Đa Sàn & Browser Extension MV3 (Đã hoàn thành 100%)

- [x] **5.1. Mở rộng Anti-Detect Scraper sang Lazada, Tiki, CellphoneS, Thế Giới Di Động (Issue #1 bên `DOS/Rate-Services`):**
  - Xây dựng bộ 4 Scrapers chuyên biệt (`LazadaScraper`, `TikiScraper`, `CellphonesScraper`, `TgddScraper`) cùng bộ định tuyến tự động `MultiPlatformScraper` (`detectPlatformFromUrl`) và `queue-worker` đa nền tảng.
  - Hỗ trợ bóc tách JSON-LD, REST API v2 (Tiki), `__moduleData__` (Lazada), bảng thông số kỹ thuật DOM, biến thể dung lượng và đánh giá người mua, tự động gộp chuẩn xác về cùng `model_key` trên `rate.master_products`.
- [x] **5.2. Nâng cấp Rate Browser Extension (Manifest V3 - `apps/extension`) & Two-Speed Hybrid Lookup/Quarantine Ingest API (`/api/v1/rate/extension/lookup`, `/api/v1/rate/extension/ingest` - Issue #12 & Issue #26):**
  - Triển khai kiến trúc 2026 v2 đã qua kiểm định của OpenAI Codex (`gpt-6.1-sol`, `xhigh`): Shadow DOM Floating Trust Pill + Chrome Native Side Panel (`chrome.sidePanel`) hỗ trợ 10 sàn/đại lý, URL Canonicalization cắt tham số theo dõi, Gatekeeper chặn phụ kiện/linh kiện, nhận diện biến thể dung lượng (`ambiguous_variant`), kết luận giá 5 mức dựa trên bằng chứng (`genuine_deal`, `fair_market_price`, `above_market`, `inflated_fake_sale`, `insufficient_data`), và hàng đợi cách ly Zero-Trust Opt-In (`rate.enqueue_crawl_job`).
