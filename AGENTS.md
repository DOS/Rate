# 🤖 AGENTS.md — Quy Chuẩn Phối Hợp Đa Agent Trên Rate Platform

Tài liệu này là **quy tắc bắt buộc** dành cho mọi AI Coding Agents (Antigravity, Claude Code, OpenAI Codex, Cursor, Windsurf, v.v.) khi làm việc trên hệ sinh thái **Rate Platform (`rate.vn`)**.

---

## 0. Nguyên Tắc Tối Thượng
1. **Ngôn ngữ giao tiếp:** Luôn trả lời bằng **Tiếng Việt** (trừ khi người dùng yêu cầu ngôn ngữ khác).
2. **Kiểm thử bắt buộc:** **LUÔN LUÔN TEST & BUILD THÀNH CÔNG TRƯỚC KHI BÁO HOÀN THÀNH.**
3. **Không đụng hàng giữa các Agent:** Dự án được code song song bởi nhiều Agent. Mọi Agent **BẮT BUỘC** phải làm việc thông qua **GitHub Issues** và bảng **[GitHub Project #9 (`https://github.com/orgs/DOS/projects/9`)](https://github.com/orgs/DOS/projects/9)** theo đúng quy trình bên dưới.

---

## 1. Quy Trình Quản Lý Task Đa Agent (GitHub Project #9 & Issues)

Bảng điều phối trung tâm: **[https://github.com/orgs/DOS/projects/9](https://github.com/orgs/DOS/projects/9)**  
Lộ trình chuẩn: **[`Docs/Resources/ROADMAP.md`](./Docs/Resources/ROADMAP.md)**

### Bước 1: Kiểm tra & Nhận Task (Pick / Create Issue $\rightarrow$ `In Progress`)
Trước khi viết bất kỳ dòng code nào, Agent phải kiểm tra danh sách Issue trên cả 2 repo:

```powershell
# Xem danh sách Issue đang mở
gh issue list -R DOS/Rate --state open
gh issue list -R DOS/Rate-Services --state open
```

- **Quy tắc tránh trùng lặp:**
  - **TUYỆT ĐỐI KHÔNG** tự ý làm các Issue đang có nhãn `status:in-progress` hoặc `status:in-review` (trừ khi người dùng chỉ định rõ).
  - Ưu tiên chọn các Issue đang có nhãn `status:ready`.
  - Nếu yêu cầu của người dùng chưa có Issue tương ứng, **TẠO NGAY ISSUE MỚI** và gắn vào GitHub Project #9:
    ```powershell
    gh issue create -R DOS/Rate --title "<Tiêu đề task>" --body "<Mô tả chi tiết>" --label "status:in-progress" --assignee "@me"
    # Nếu gh CLI đã có scope project (`gh auth refresh -s project,read:project`):
    gh project item-add 9 --owner DOS --url <ISSUE_URL>
    ```
- **Chuyển trạng thái sang `In Progress` ngay khi bắt đầu:**
  ```powershell
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:ready" --add-label "status:in-progress" --add-assignee "@me"
  gh issue comment <ISSUE_NUMBER> -R DOS/Rate --body "🤖 Agent bắt đầu thực hiện task này (Status: Ready -> In Progress)."
  ```

### Bước 2: Cập nhật trạng thái khi hoàn thành (`In Review` / `Done`)
Sau khi code xong và chạy pass toàn bộ bài test/build:

- **Trường hợp cần User Review / Mở PR (`In Review`):**
  ```powershell
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:in-progress" --add-label "status:in-review"
  gh issue comment <ISSUE_NUMBER> -R DOS/Rate --body "🔍 Đã triển khai xong và pass test. Chuyển trạng thái sang In Review (Commit/PR: <SHA/URL>)."
  ```
- **Trường hợp đã hoàn tất & push/merge xong (`Done`):**
  ```powershell
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:in-progress,status:in-review" --add-label "status:done"
  gh issue close <ISSUE_NUMBER> -R DOS/Rate --comment "✅ Hoàn tất task tại commit <SHA> (Status -> Done)."
  ```

---

## 2. Ranh Giới Kiến Trúc Open-Core 2 Repositories (CỰC KỲ QUAN TRỌNG)

Hệ thống Rate được tách thành **2 repositories riêng biệt**. Agent phải đặt code đúng repo, **tuyệt đối không làm lộ code nhạy cảm sang repo Public**:

| Repository | Độ riêng tư | Đường dẫn Local | Những gì ĐƯỢC PHÉP đặt tại đây |
| :--- | :---: | :--- | :--- |
| **[`DOS/Rate`](https://github.com/DOS/Rate)** | 🌍 **Public (Open-Core)** | `D:\Projects\Rate` | • **`apps/web`**: Giao diện Next.js 16 (`rate.vn`), i18n (`vi`, `en`, `cs`)<br/>• **`apps/extension`**: Giao diện Browser Extension MV3 minh bạch<br/>• **`packages/shared-data`**: Zod Schema 10 nhóm thông số (`specs.schema.ts`)<br/>• **`apps/importer`**: Bộ não chuẩn hóa & chấm điểm công khai (`types.ts`, `product-normalizer.ts`, `entity-matcher.ts`, `ai-spec-enricher.ts`, `ai-review-analyzer.ts`, `shopee-to-supabase.ts`)<br/>• **`supabase/migrations`**: Schema PostgreSQL 17 (`rate` schema) |
| **[`DOS/Rate-Services`](https://github.com/DOS/Rate-Services)** | 🔒 **Private (Enterprise)** | `D:\Projects\Rate-Services` | • **Anti-Detect Scrapers**: `shopee-scraper.ts`, `shopee-search-scraper.ts`, `sniff-search-api.ts`<br/>• **Bypass & Proxy**: `shopee-captcha-solver.ts` (giải Captcha), `proxy-manager.ts` (`mproxy.vn`)<br/>• **Queue Workers**: `queue-worker.ts`, `crawl-smartphones-with-proxy.ts`<br/>• **GitHub Actions Cron**: `.github/workflows/scheduled-crawler.yml` |

> ⚠️ **CẤM TUYỆT ĐỐI:** Không bao giờ commit code giải Captcha, xoay Proxy, sniff API nội bộ của sàn, hoặc khoá bí mật (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `MPROXY_*`) vào `DOS/Rate`.

---

## 3. Kiến Trúc Kỹ Thuật Cốt Lõi (Zero-Strapi 2026)

- **Bỏ hoàn toàn Strapi CMS & Splink Python:** Không sử dụng hay khởi tạo lại các thành phần Strapi cũ.
- **Pure PostgreSQL 17 trên Supabase Cloud (`rate` schema):**
  - `rate.master_products`: Sản phẩm gốc chuẩn hóa (`model_key` duy nhất, `specifications` JSONB 10 nhóm, `key_specs`).
  - `rate.products`: Gian hàng/Listing từ các sàn liên kết qua `cluster_id`.
  - `rate.price_history`: Lịch sử giá chống trùng theo `observation_id`.
  - `rate.reviews` & `rate.review_flags`: Đánh giá người dùng & kết quả phân tích seeding bằng AI.
- **Chuẩn 10 Field Groups:** Kết hợp cấu trúc sạch của **PhoneArena** (tách riêng `main_camera`, `second_camera`, `third_camera`, `fourth_camera`, `front_camera`) và độ sâu kỹ thuật của **GSMArena**.
- **AI Provider-Agnostic:** Mọi module AI (`AiSpecEnricher`, `AiReviewAnalyzer`) phải hỗ trợ chuẩn OpenAI-compatible (`openai`, `dos-ai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`) qua biến môi trường `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.

---

## 4. Lệnh Kiểm Thử & Build Thường Dùng

```powershell
# Tại D:\Projects\Rate (Monorepo dùng pnpm)
pnpm --filter @repo/crawlers build
pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts
pnpm --filter web build

# Tại D:\Projects\Rate-Services
npm run build
npm run test:enricher
```
