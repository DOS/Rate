# 🗺️ Rate Platform Roadmap - Kiến Trúc Zero-Strapi & Open-Core 2026

> **Cập nhật lần cuối:** 20/10/2026  
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

- [x] **6.1. Review Trust Model v2 P1/P2/P3/P4 & Giao Diện 6 Trục Minh Bạch (`DOS/Rate#162`, `#166`, `#169`, `#184`):**
  - Chấm điểm 6 trục (`Authenticity`, `Independence`, `Depth`, `Reviewer`, `Context`, `Community`), định tuyến bình luận thuần vận chuyển về gian hàng (`E = 0`), phát hiện mâu thuẫn sao - cảm xúc, làm mượt điểm sản phẩm bằng **Bayesian Shrinkage ($k=3, \mu_0=3.80$)** kèm nhãn độ tin cậy, cổng chặn độ tin cậy điểm tổng hợp (`userConfidence >= 0.6`), xếp hạng **Wilson Lower Bound**, cảnh báo phân bố sao bất thường và hiển thị đầy đủ huy hiệu 6 trục + nhãn tài trợ trên `JReviewsSection.tsx`.
- [x] **6.2. Khóa Quyền Tối Thiểu, Ranh Giới `server-only`, Chống CSV Formula Injection 16/16 & Tách CLI Backfill (`DOS/Rate#159`, `#163`, `#168`, `#170`, `#172`, `#173`, `#174`, `#175`, `#185`, `#188`):**
  - Loại bỏ `SUPABASE_SERVICE_ROLE_KEY` khỏi đường đọc/ghi Web public (`extension/ingest` gọi RPC `rate.enqueue_crowd_verify_signal`), cưỡng chế `import 'server-only'` trên toàn bộ 6 module `src/server/rate/*`, tách `@/lib/rate-domain` cho 100% Client Components, chuẩn hóa `escapeCsvCell` / `buildSafeCsvContent` trên toàn bộ **16/16** thành phần xuất CSV, tách riêng `apps/importer/src/shopee/jobs/backfill-specs.ts` (mặc định `dry-run`, yêu cầu `--apply` để ghi DB), và xử lý triệt để toàn bộ cảnh báo Dependabot (`0` open alerts).
- [x] **6.3. Chuẩn Hóa Thủ Tục SQL, Chỉ Mục BRIN/GIN & Đẩy Lọc Xuống PostgreSQL (`DOS/Rate#176`, `#177`, `#178`, `#188`):**
  - Cố định `SET search_path = ''`, `SECURITY INVOKER` cho các hàm/view đọc công khai, chỉ mục BRIN trên `price_history(recorded_at)`, `ON DELETE RESTRICT` bảo vệ lịch sử khi lưu trữ gian hàng, hàm chuẩn `refresh_master_market_stats`, chống flood cả `INSERT` lẫn `UPDATE` trên `review_votes`, và đẩy lọc/phân trang danh mục xuống `get_category_directory_facets_v1` + `search_catalog_products_v1`.
- [x] **6.4. Đồng Bộ Migration Ledger Sang `DOS-Me` & Kiểm Thử Replay Tự Động (Audit C9 / K1 - `DOS/Rate#193`, `#226`, `#302`, `DOS/DOS.Me#1239`):**
  - [x] Replay PostgreSQL 17 cho bản copy tham chiếu chạy trong CI (`pnpm test:migrations`); đã bắt và sửa 4 lỗi chạy thật trong các migration audit.
  - [x] 6 migration audit và migration khóa `upsert_price_alert` đã vào ledger `DOS-Me` (`20261018120000`, `20261018120101`-`120106`), Supabase Preview áp thành công; bản copy Rate khớp ledger (`pnpm check:migrations`: không drift).
  - [ ] Áp lên beta/prod: workflow beta của `DOS-Me` đang bị khóa (`beta-migrations.yml`), nhánh beta chưa cập nhật từ 18/04/2026; chờ quy trình beta có review của chủ `DOS-Me`.
- [ ] **6.5. Bảo Vệ Nhánh & Quét Bí Mật Trên GitHub (`DOS/Rate` - Audit K3 - `DOS/Rate#191`):**
  - [x] Dependabot security updates và CodeQL default setup đã bật.
  - [x] Quét secret bù trừ: gitleaks quét commit của mỗi PR vào `dev`/`main` (`DOS/Rate#305`).
  - [ ] Secret Scanning + Push Protection: repo public nên miễn phí, nhưng API trả `422` "blocked by an enterprise policy"; cần chủ enterprise mở policy hoặc gắn cấu hình "Secret Protection enabled" của org cho repo.
  - [x] Branch Rulesets: `dev-main-light` và `main-release` đã bật lại sau khi làm sạch lịch sử (`#153`); `dev-main-light` bắt buộc `Typecheck & Build Monorepo`, `E2E (Playwright)` và `Secret scan (gitleaks)` trên `dev` và `main` (JOY cho phép ngày 2026-10-25, `#1073`).
- [x] **6.6. Khóa Đường Ghi Công Khai Theo Người Dùng & Phiên Cookie (`DOS/Rate#155`, `#194` - Audit K1, K2, C4, T13):**
  - `POST /api/v1/rate/reviews` và `/watchlist` bắt buộc đăng nhập, gọi RPC dưới quyền người dùng (không còn service role), không báo thành công giả, mã lỗi RPC → 403/409/422/429. Client service role tách sang `@repo/shared-data/server` (ESLint cấm trong `apps/web`).
  - Phiên đăng nhập lưu trong cookie qua `@supabase/ssr`; `middleware.ts` → `proxy.ts` (Next.js 16) refresh phiên; request dùng cookie phải cùng origin.
- [x] **6.7. Nền Tảng Tooling 2026 (`DOS/Rate#192`, `#195`, `#196`, `#234`, `#238`, `#239`, `#240`, `#261`, `#263`):**
  - Pin GitHub Actions theo SHA, secret ra khỏi hash của Turbo; Zod 4 toàn monorepo; ESLint 9 flat config cưỡng chế `eslint . --max-warnings 0` trên cả 4 gói (`@repo/shared-data`, `@repo/crawlers`, `@repo/extension`, `@repo/web`); Dependabot một mục npm ở gốc; extension bundle bằng esbuild; bật React Compiler; logger JSON có che secret/email cho toàn bộ code server và CLI importer.
- [x] **6.8. Đa Ngôn Ngữ Đầy Đủ (`DOS/Rate#241`, `#251`-`#255`, `#265`, `#266`, `#271`, `#272`, `#276`, `#279`):**
  - [x] Một catalog next-intl (namespace `rate` có kiểm tra kiểu), client chỉ nhận namespace cần dùng (`DOS/Rate#250`).
  - [x] Đưa toàn bộ chuỗi tiếng Việt viết cứng trong hơn 60 component và route (bao gồm `NavbarDarkDynamic`, `FooterDynamic`, `footer-top`, `RadarBadge`, `LocaleSwitcher`, `range-slider`, `global-error`) vào catalog `vi.json`, `en.json`, `cs.json` (1.583 khóa mỗi ngôn ngữ trên 16 namespaces, gỡ bỏ hoàn toàn `getRateCopy`, kiểm tra đồng bộ kiểu tại thời điểm biên dịch và kiểm thử tự động Suite `[63/63]`).
- [x] **6.9. Củng Cố Toàn Diện Open-Core Engine & Rate-Services (`DOS/Rate#215`, `#259`, `#261` & `DOS/Rate-Services#45`-`#55`):**
  - Hoàn tất 100% mục kiểm toán `DOS/Rate-Services` (`K1-K3`, `C1-C12`, `M1-M14`, `Low`) và Open-Core Engine (`C6`, `C8`, `T14`, `T15`, `Low`): `strict: true` + `no-explicit-any: error` toàn bộ TypeScript, `ScrapedProductSchema` (Zod 4) ở ranh giới cào dữ liệu, `z.toJSONSchema()` cho `response_format: { type: 'json_schema', strict: true }` kèm backoff có jitter và bộ lọc URL/số điện thoại chống prompt-injection (`sanitizeAiGeneratedText`), bộ dữ liệu cặp sản phẩm gán nhãn đo Precision/Recall = 100%, `DomainTokenBucketLimiter` + `PlatformCircuitBreaker`, Chromium sandbox cấu hình theo môi trường, `StructuredLogger` che secret/PII, và gắn `algorithmMeta` (`{ algo, version, paramsHash }`) cho toàn bộ 4 Auditor.
- [x] **6.10. Quy Trình Nhận Task Đa Agent Được Cưỡng Chế (`DOS/Rate#325`, `#327`, `#337`, `#338`, `#383`, `#385`, `#426`, `#429`):**
  - Sửa `labels-sync.yml` dùng đúng input `yaml-file`/`skip-delete` của labeler v6 (bản cũ bị bỏ qua nên xóa sạch nhãn `status:*`/`agent:*` ngày 18/10), tạo lại 28 nhãn và gắn lại nhãn claim cho issue/PR đang mở; nhãn `status:*` do `labels.yml` quản lý.
  - Check bắt buộc `task-claim` (ruleset `dev-task-claim`, chỉ áp cho `dev`): PR đóng issue nào thì issue đó phải có `agent:<nick>` và `status:in-progress`/`status:in-review`; chạy bằng `pull_request_target` từ `dev` nên PR không tự sửa được check, tự chạy lại khi nhãn claim thay đổi (`task-claim-revalidate.yml`).
  - AGENTS.md tra item Project #9 từ phía issue (`gh project item-list` mặc định chỉ trả 30/321 item nên cập nhật Status/Agent của issue mới thất bại âm thầm).
- [x] **6.11. Củng Cố Ranh Giới Dữ Liệu Đầu Vào Toàn Hệ Thống (`DOS/Rate#522`-`#586`, `DOS/Rate-Services#141`-`#171`):**
  - Trần miền giá trị và kiểm tra số hữu hạn ở mọi tầng (shared schema, REST API v1, extension, engine, scraper); URL chỉ HTTP(S); listing hết hàng không có giá được ghi `listing_unavailable` thay vì lỗi. Chi tiết tại mục 6.5 trong [`CHANGELOG.md`](./CHANGELOG.md).

### 🚀 Phase 7: Mở Rộng Độ Phủ Dữ Liệu Thật Đa Sàn & Kiểm Thử E2E (2027 Q1)

- [ ] **7.1. Mở Rộng Phủ Dữ Liệu Thật (Provenance-Verified Catalog):**
  - Vận hành định kỳ `scheduled-crawler.yml` trên `DOS/Rate-Services` để thu thập giá niêm yết thật, lịch sử giá thật và đánh giá thật có gắn nguồn kiểm chứng (`spec_source`, `observation_id`) cho toàn bộ 5 ngành hàng.
- [x] **7.2. Bộ Kiểm Thử Hành Vi Route Handlers Toàn Diện (`DOS/Rate#179`, `#187` - Audit T1):**
  - Kiểm thử trực tiếp `NextRequest -> NextResponse` trên toàn bộ 15 REST API v1 endpoints (`/api/v1/rate/products`, `/products/[slug]`, `/compare`, `/versus`, `/lookup`, `/inspect`, `/deals`, `/leaderboard`, `/merchants`, `/merchants/[id]`, `/stats`, `/openapi`, `/openapi.json`, `/revalidate`, `/extension/lookup`, `/extension/ingest`, `/api/reviews/[id]/vote`, `/api/health`) kiểm tra đầy đủ mã `200`, `204`, `400`, `401`, `404`, `429`, `500` (Suite `[56/61]` & `[60/61]`).
- [x] **7.3. Tối Ưu Hóa Cache Đa Tầng Next.js 16 (`withRateDataCache` & `/api/v1/rate/revalidate` - `DOS/Rate#186`, `DOS/Rate-Services#52` - Audit C3):**
  - Kết hợp `React.cache()` (chống trùng lặp trong cùng 1 SSR request) với `unstable_cache` (`withRateDataCache` trong `src/server/rate/cache-tags.ts`) gắn thẻ xác định (`rate:products`, `rate:product:<slug>`, `rate:category:<slug>`, `rate:merchant:<id>`, `rate:deals`, `rate:reviews`, `rate:price-history`), endpoint `POST /api/v1/rate/revalidate` xác thực `timingSafeEqual`, và tích hợp tự động gọi revalidate tại Step 8 (`triggerWebCacheRevalidation`) của `DOS/Rate-Services`.
- [x] **7.4. Kiểm Thử E2E Hermetic Trên Trình Duyệt (`DOS/Rate#312`, `#317`):**
  - `pnpm test:e2e` dựng PostgreSQL 17 từ `supabase/migrations`, seed catalog mẫu, chạy PostgREST sau proxy `/rest/v1` (anon JWT ký tại chỗ), build production rồi chạy Playwright; job CI `E2E (Playwright)` không cần secret Supabase. Proxy giả lập DB lỗi theo từng URL và giới hạn request line 8000 ký tự như gateway.
- [x] **7.5. Type Schema `rate` Sinh Từ Migration (`DOS/Rate#313`, `#320`, `#330`, `#331`):**
  - `pnpm gen:db-types` sinh `packages/shared-data/src/database.types.ts` bằng `supabase/postgres-meta` (pin digest) trên DB replay; `pnpm check:db-types` chặn drift trong CI; mọi client Supabase của web có type `Database`.
- [x] **7.6. HTTP Status Đúng & Không Cache Dữ Liệu Lỗi (`DOS/Rate#316`, `#318`, `#319`, `#323`, `#326`, `#328`, `#329`, `#332`, `#333`, `#336`):**
  - Bỏ `[locale]/loading.tsx` để URL sản phẩm, merchant, so sánh không tồn tại trả 404 thật (trước đó là soft 404 trên rate.vn); thay bằng thanh tiến trình chuyển trang. Lỗi DB ở trang chi tiết, hồ sơ merchant, danh sách merchant và lịch sử giá ném `RateDataUnavailableError` (trang 5xx, body API đã che chi tiết) thay vì trả rỗng rồi bị `unstable_cache` giữ 5-10 phút; truy vấn `in()` chia lô 150 id.
- [x] **7.7. Dọn Stack E2E Mồ Côi (`DOS/Rate#417`, `#419`):**
  - `scripts/e2e/run.mjs` tự xóa container/network `rate-e2e-<pid>` của các lần chạy đã chết (bị kill không kịp dọn) trước khi dựng stack mới; logic tên/PID có unit test trong CI.
- [x] **7.8. Khả Năng Tiếp Cận WCAG 2.1 AA Có Cổng Kiểm Thử (`DOS/Rate#362`, `#413`, `#421`, `#425`):**
  - Token `--rate-ink-*` cho chữ `text-*` và nút outline đạt tối thiểu 4,5:1 trên mọi nền sáng; nền tối (`rate-surface-dark`, scoreboard, `bg-dark`, hero gradient `rate-ink-on-dark`) dùng mực sáng, đảo sáng bên trong quay về mực tối; `bg-white` tôn trọng `bg-opacity-*`, `--bs-form-color` được định nghĩa.
  - `e2e/a11y.spec.ts` chạy axe (WCAG 2.1 A/AA, gồm `color-contrast`) trên toàn bộ 25 trang công khai ở hai viewport desktop 1280 và phone 390; từ 6.823 node vi phạm tương phản về 0.
