# 📚 Rate Platform Documentation (Zero-Strapi 2026 & Open-Core Architecture)

## 📋 Tổng quan

Kho tài liệu kiến trúc và vận hành của hệ thống **Rate Platform (`rate.vn`)** thuộc tổ chức **DOS**.

- **Repo Public (Open-Core UI, Schema & Intelligence):** [`https://github.com/DOS/Rate`](https://github.com/DOS/Rate) (`D:\Projects\Rate`)
- **Repo Private (Anti-Detect Scrapers, Proxy & Workers):** [`https://github.com/DOS/Rate-Services`](https://github.com/DOS/Rate-Services) (`D:\Projects\Rate-Services`)
- **Bảng Quản lý Task Đa Agent (GitHub Project #9):** [`https://github.com/orgs/DOS/projects/9`](https://github.com/orgs/DOS/projects/9)

---

## 🏗️ Kiến trúc nền tảng hiện tại (2026)

- **Database & Queue**: Pure PostgreSQL 17 trên Supabase Cloud (`rate` schema) — kiến trúc 2 tầng (`rate.master_products` + `rate.products`), tìm kiếm mờ `pg_trgm`, chỉ mục `JSONB` GIN và Queue RPCs.
- **Chuẩn thông số kỹ thuật**: **10 Field Groups** kết hợp cấu trúc sạch của **PhoneArena** (tách riêng từng ống kính camera, biometrics, keys) và độ sâu kỹ thuật của **GSMArena** (`packages/shared-data/src/schemas/specs.schema.ts`).
- **AI Intelligence Engine**: Provider-Agnostic (`openai`, `dos-ai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`) tự động điền 10 nhóm thông số (`ai-spec-enricher.ts`) và phân tích review ảo/chấm điểm rủi ro shop (`ai-review-analyzer.ts`).
- **Frontend**: Next.js 16 (App Router) + React 19 + đa ngôn ngữ (`vi`, `en`, `cs`).
- **Monorepo**: Turborepo + `pnpm` workspaces.

---

## 📁 Tài liệu quan trọng

- **[`Docs/Resources/ROADMAP.md`](./Resources/ROADMAP.md)**: Lộ trình phát triển chi tiết theo từng Phase và danh sách Task đồng bộ với GitHub Project #9.
- **[`Docs/GSMARENA_VS_PHONEARENA_COMPARISON.md`](./GSMARENA_VS_PHONEARENA_COMPARISON.md)**: Phân tích đối chiếu cấu trúc thông số kỹ thuật giữa GSMArena và PhoneArena (cơ sở chọn PhoneArena 10-Field-Group làm khung chuẩn).
- **[`Docs/PHONE_SPECS_COMPONENTS_V2.md`](./PHONE_SPECS_COMPONENTS_V2.md)**: Đặc tả chi tiết từng trường trong 10 nhóm thông số điện thoại.
- **[`AGENTS.md`](../AGENTS.md)** & **[`CLAUDE.md`](../CLAUDE.md)**: Quy tắc bắt buộc cho các AI Agents khi phối hợp làm việc qua GitHub Issues & Project #9.
