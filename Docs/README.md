# 📚 Rate Platform Documentation (Zero-Strapi 2026 & Open-Core Architecture)

## 📋 Tổng Quan Hệ Thống

Kho tài liệu kiến trúc, đặc tả kỹ thuật và vận hành của **Rate Platform (`rate.vn`)** thuộc hệ sinh thái **DOS**.

- **Repo Public (Open-Core UI, REST API v1, Schema & Intelligence):** [`https://github.com/DOS/Rate`](https://github.com/DOS/Rate) (`D:\Projects\Rate`)
- **Repo Private (Anti-Detect Scrapers, Proxy & Queue Workers):** [`https://github.com/DOS/Rate-Services`](https://github.com/DOS/Rate-Services) (`D:\Projects\Rate-Services`)
- **Sole DB Migration Authority (`rate` schema):** [`https://github.com/DOS/DOS.Me`](https://github.com/DOS/DOS.Me) (`D:\Projects\DOS-Me\supabase\migrations`)
- **Bảng Quản lý Task Đa Agent (GitHub Project #9):** [`https://github.com/orgs/DOS/projects/9`](https://github.com/orgs/DOS/projects/9)

---

## 🛠️ Tech Stack Chuẩn Hóa 2026

1. **Runtime & Compiler**: **Node.js `>= 22 / 26`** + **TypeScript `7.0.2`** (`ignoreBuildErrors: false`) + **`pnpm@10.34.5`** + **`Turborepo ^2.10.12`**.
2. **Database, Queue & Auth (Tầng 4)**: **Supabase Cloud PostgreSQL 17 (`rate` schema)** - mô hình sản phẩm 2 tầng (`rate.master_products` + `rate.products`), tìm kiếm mờ `pg_trgm`, chỉ mục `JSONB` GIN, hàng đợi nguyên tử `rate.crawl_jobs` (`FOR UPDATE SKIP LOCKED`), và Trigger SQL `SECURITY DEFINER` tự động tính điểm đánh giá kép JReviews.
3. **Private Anti-Detect Worker (Tầng 3 - `DOS/Rate-Services`)**: Playwright Stealth + xoay IP `mproxy.vn` + giải Captcha tự động (`shopee-captcha-solver.ts`) + `queue-worker.ts`.
4. **Open-Core Intelligence Engine (Tầng 2 - `apps/importer` & `packages/shared-data`)**:
   - **Chuẩn 10 Field Groups (`specs.schema.ts`)**: Kết hợp cấu trúc sạch của **PhoneArena** và độ sâu kỹ thuật của **GSMArena**.
   - **`ProductNormalizer` & `EntityMatcher`**: Bóc tách RAM/ROM tiếng Việt và gom cụm 3 tầng (Exact `model_key` -> `pg_trgm` -> AI Seed).
   - **`AiSpecEnricher` & `AiReviewAnalyzer`**: Hỗ trợ đa nhà cung cấp chuẩn OpenAI-compatible (`dos-ai`, `openai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`), lọc Seeding/Spam xu và tính điểm rủi ro kép (`dosafe_risk_score` + `review_risk_score`).
5. **Web UI & Server BFF Layer (Tầng 1 - `apps/web`)**:
   - **Next.js 16.3.8** (App Router + Turbopack) + **React 19.3.0** + **Bootstrap 5.3.8** + **`next-intl 4.14.8`** (`vi` mặc định tại `/`, `en`, `cs`).
   - **Server Data Layer (`apps/web/src/server/rate/`)**: Tích hợp `React.cache()` chống truy vấn trùng lặp giữa `generateMetadata()` và `Page()`.
   - **Backend REST API v1 (`/api/v1/rate/products`, `/api/v1/rate/products/[slug]`, `/api/reviews/[id]/vote`)**: Cung cấp JSON API chuẩn hóa cho Web Client và Browser Extension MV3.

---

## 📁 Danh Mục Tài Liệu Trọng Tâm

- **[`Docs/Proposals/2026-10-14-full-stack-tech-architecture-audit.html`](./Proposals/2026-10-14-full-stack-tech-architecture-audit.html)**: Bản thiết kế Kiến trúc Backend & Full-Stack 4 tầng kèm Báo cáo Kiểm toán Tech Stack 2026 (Dark-Theme HTML).
- **[`Docs/Proposals/2026-10-14-nextjs-frontend-architecture-review.html`](./Proposals/2026-10-14-nextjs-frontend-architecture-review.html)**: Báo cáo kiểm toán chuyên sâu tầng Frontend Next.js 16 và xử lý triệt để lỗi điều hướng `/en` (Dark-Theme HTML).
- **[`Docs/Proposals/2026-10-14-merchant-risk-score-separation.html`](./Proposals/2026-10-14-merchant-risk-score-separation.html)**: Thiết kế tách biệt điểm rủi ro gian hàng (`dosafe_risk_score` vs `review_risk_score`) và hệ thống bình chọn JReviews.
- **[`Docs/Platform/Overview.md`](./Platform/Overview.md)**: Tổng quan Kiến trúc Backend 4 tầng, Luồng dữ liệu và Đặc tả REST API v1.
- **[`Docs/Resources/ROADMAP.md`](./Resources/ROADMAP.md)**: Lộ trình phát triển chi tiết theo từng Phase và trạng thái hoàn thành thực tế.
- **[`Docs/GSMARENA_VS_PHONEARENA_COMPARISON.md`](./GSMARENA_VS_PHONEARENA_COMPARISON.md)** & **[`Docs/PHONE_SPECS_COMPONENTS_V2.md`](./PHONE_SPECS_COMPONENTS_V2.md)**: Đặc tả 10 nhóm thông số kỹ thuật chuẩn hóa.
- **[`AGENTS.md`](../AGENTS.md)** & **[`CLAUDE.md`](../CLAUDE.md)**: Quy chuẩn bắt buộc cho mọi AI Coding Agents.
