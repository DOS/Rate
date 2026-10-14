# 🏗️ Rate Platform - Tổng Quan Kiến Trúc Backend & Full-Stack (2026)

> **Cập nhật lần cuối:** 14/10/2026  
> **Kiến trúc chuẩn:** Zero-Strapi 2026 - TypeScript 7.0.2 + Next.js 16.3.8 BFF + Open-Core Ingestion Engine + Supabase Cloud PostgreSQL 17 (`rate` schema)

---

## 1. Giải Đáp Câu Hỏi Cốt Lõi: "Backend Của Rate.vn Dùng Gì?"

Thay vì sử dụng một framework моноlit cồng kềnh kiểu cũ (như Strapi CMS + Redis Streams năm 2024), **Backend của Rate.vn năm 2026 được thiết kế theo mô hình 4 Tầng Chuyên Biệt (4-Layer Composable Backend Architecture)** đồng bộ 100% với hệ sinh thái **DOS (`DOS.Me`, `DOSafe`, `DOS-AI`)**:

### Tầng 1: Web BFF (Backend-For-Frontend) & Public REST API (`apps/web`)

- **Công nghệ:** **Next.js 16.3.8 App Router** + **TypeScript 7.0.2** + **React 19 `cache()`** + **Supabase PostgREST/RPC Client**.
- **Cấu trúc mã nguồn:**
  - **`apps/web/src/server/rate/index.ts`**: Tầng truy xuất dữ liệu phía Server có bộ nhớ đệm theo từng request (`React.cache()`), đảm bảo `generateMetadata()` và `Page()` không bao giờ bắn truy vấn trùng lặp lên Supabase.
  - **`apps/web/src/lib/rate-api.ts`**: Thực thi các truy vấn chuyên sâu lên schema `rate` (Lọc đa tiêu chí 10 nhóm thông số, tính Facets động theo Category, lấy danh sách chào giá kèm điểm rủi ro DOSafe/AI, thuật toán phát hiện Giảm giá ảo từ `price_history`, và tổng hợp đánh giá JReviews).
  - **REST JSON API v1 (`apps/web/src/app/api/v1/rate/*` & `/api/reviews/*`)**:
    - `GET /api/v1/rate/products`: API lọc & tìm kiếm sản phẩm chuẩn hóa theo 10 nhóm thông số (`category`, `q`, `brands`, `minPrice`, `maxPrice`, `ram`, `rom`, `battery`, `hz`, `charge`, `5g`, `nfc`, `sort`, `facets`).
    - `GET /api/v1/rate/products/[slug]`: API trả về trọn gói thông tin chi tiết sản phẩm gốc, bảng giá các sàn, chuỗi thời gian lịch sử giá kèm cảnh báo giảm ảo và điểm đánh giá JReviews (phục vụ cả Web và Browser Extension MV3).
    - `POST /api/reviews/[id]/vote`: API xác thực JWT Supabase Auth (`DOS.Me`) cho phép người dùng bình chọn Hữu ích (`up`), Không hữu ích (`down`) hoặc Báo cáo vi phạm (`report`) với kiểm tra RLS và chống tự vote.

### Tầng 2: Open-Core Intelligence & Normalization Service (`apps/importer` & `packages/shared-data`)

- **Công nghệ:** **Node.js `>= 22 / 26` ES Modules** + **TypeScript 7.0.2** + **Zod `^3.25.76`** + **OpenAI-Compatible Multi-LLM SDK**.
- **Vai trò:** Là "bộ não nghiệp vụ" mã nguồn mở minh bạch của Rate.vn, gồm 5 dịch vụ miền (Domain Services):
  1. **`specs.schema.ts` (`@repo/shared-data`)**: Định nghĩa hợp đồng dữ liệu 10 nhóm thông số kỹ thuật (PhoneArena + GSMArena standard).
  2. **`ProductNormalizer` (`product-normalizer.ts`)**: Phân tích cú pháp tên sản phẩm tiếng Việt phức tạp, tách bạch chính xác RAM và ROM, sinh khóa định danh chuẩn `model_key` (`brand:model:storage`).
  3. **`EntityMatcher` (`entity-matcher.ts`)**: Thuật toán gom cụm sản phẩm 3 tầng (Tier 1: khớp chính xác `model_key` -> Tier 2: khớp mờ PostgreSQL `pg_trgm` ngưỡng `>= 0.70` -> Tier 3: gọi AI khởi tạo sản phẩm gốc mới).
  4. **`AiSpecEnricher` (`ai-spec-enricher.ts`)**: Tự động làm giàu đầy đủ 10 nhóm thông số kỹ thuật qua DOS-AI Gateway (`api.dos.ai` / vLLM Qwen), OpenAI, Gemini, DeepSeek hoặc OpenRouter, kèm bộ lọc ép kiểu an toàn (Sanitizer) trước khi kiểm tra Zod.
  5. **`AiReviewAnalyzer` (`ai-review-analyzer.ts`)**: Phân loại từng đánh giá người mua thành 5 nhóm (`authentic`, `low_value_coin_spam`, `seeding_fake`, `competitor_sabotage`, `review_bombing`), trích xuất Ưu/Nhược điểm thực tế và tính toán `review_risk_score` độc lập với `dosafe_risk_score`.

### Tầng 3: Private Anti-Detect Scraper & Queue Worker Service (`DOS/Rate-Services`)

- **Công nghệ:** **Playwright Stealth** + **Proxy Rotation (`mproxy.vn`)** + **Slider Captcha Solver** + **GitHub Actions Scheduled Workers**.
- **Vai trò:** Tiêu thụ công việc từ bảng hàng đợi `rate.crawl_jobs` qua cơ chế khóa dòng nguyên tử của PostgreSQL (`FOR UPDATE SKIP LOCKED`), duy trì nhịp tim (`heartbeat_crawl_job`), lưu trạng thái từng bước (`checkpoint_crawl_job`) và đẩy dữ liệu thô sang Tầng 2 để chuẩn hóa.

### Tầng 4: Database, Atomic Queue & Trigger Engine (`Supabase Cloud PostgreSQL 17`)

- **Quản trị Schema:** Sổ cái migration duy nhất đặt tại `DOS-Me/supabase/migrations/` (deploy qua đường ống CI `preview -> beta -> prod` lên project `gulptwduchsjcsbndmua`).
- **Xử lý nghiệp vụ trong DB (In-Database Compute):**
  - Triggers tự động đồng bộ `min_price`, `max_price`, `merchant_count` trên `rate.master_products` ngay khi có thay đổi ở `rate.products`.
  - Hàm `rate.compute_review_weight()` và Trigger `rate.recalculate_master_product_ratings()` tự động tính lại `helpfulness_weight`, `user_rating_weighted` và `authentic_review_count` ngay khi người dùng bấm bình chọn hoặc AI gắn cờ review.
  - Row Level Security (RLS) bảo vệ toàn bộ các bảng, chỉ cho phép đọc công khai (`SELECT`) đối với dữ liệu đã xuất bản và yêu cầu xác thực JWT cho thao tác bình chọn.
