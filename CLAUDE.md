# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and all AI Coding Agents working in this repository.

> 📌 **QUAN TRỌNG:** Đọc kỹ [`AGENTS.md`](./AGENTS.md) và [`Docs/Resources/ROADMAP.md`](./Docs/Resources/ROADMAP.md). Mọi quy tắc trong `AGENTS.md` (bao gồm User-Level Hard Rules từ `C:\Users\JOY\AGENTS.md` và `C:\Users\JOY\.claude\CLAUDE.md`) là bắt buộc.

## 1. Nguyên Tắc Bắt Buộc (CRITICAL HARD RULES)

1. **CẤM TUYỆT ĐỐI chạy Migration / DDL trực tiếp lên Shared Prod Supabase (`gulptwduchsjcsbndmua`):**
   - **CHỈ CÓ `DOS-Me/supabase/migrations/` (`D:\Projects\DOS-Me`)** là nơi duy nhất quản lý lịch sử migration và chạy CI deploy (`preview -> beta -> prod`) cho toàn bộ project `dos` (`gulptwduchsjcsbndmua`), bao gồm cả schema `rate`.
   - **TUYỆT ĐỐI KHÔNG** dùng Supabase MCP (`apply_migration`, `execute_sql`), Dashboard SQL Editor, hoặc `supabase db push` từ repo `Rate` để chạy lệnh DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`) lên `gulptwduchsjcsbndmua`. Chỉ được dùng MCP cho truy vấn đọc (`SELECT`).
2. **JOY KHÔNG CODE, KHÔNG CHẠY LỆNH, VÀ KHÔNG MERGE PR:**
   - Agent phải tự chạy mọi lệnh terminal, tự chạy code review (`superpowers:code-reviewer` / subagent review), đợi CI xanh và tự động merge PR (`gh pr merge`). Không bao giờ đưa snippet bảo JOY tự chạy hay chờ JOY bấm merge.
3. **Ngôn ngữ & Tài liệu cho JOY đọc:**
   - Giao tiếp với JOY bằng **Tiếng Việt có dấu đầy đủ 100%**. Không dùng dấu gạch ngang dài (`—` hay `–`), chỉ dùng `-`.
   - Mọi tài liệu cần JOY đọc/duyệt (Proposal, Plan, Report, Audit) **BẮT BUỘC** phải xuất thành file **HTML tự chứa (self-contained)** có **Dark Theme gốc** (`#0f1113` bg, `#FF2E29` accents), tiếng Việt có dấu, và lưu thẳng trong repo (ví dụ `Docs/Proposals/<YYYY-MM-DD>-<slug>.html`).
4. **Kiểm thử trước khi báo xong:** LUÔN LUÔN chạy build và test thực tế trước khi báo cáo hoàn thành bất kỳ task nào.
5. **Phối hợp Đa Agent qua GitHub Project #9 (`https://github.com/orgs/DOS/projects/9`):**
   - Trước khi bắt đầu làm việc, kiểm tra Issue trên `DOS/Rate` và `DOS/Rate-Services`:
     ```powershell
     gh issue list -R DOS/Rate --state open
     gh issue list -R DOS/Rate-Services --state open
     ```
   - **Pick Issue** đang ở `status:ready` (hoặc **tạo Issue mới** nếu chưa có), gán cho `@me` và đổi nhãn ngay sang **`status:in-progress`** (cập nhật cột **In progress** trên Project #9) để các Agent khác không làm trùng:
     ```powershell
     gh issue edit <ID> -R DOS/Rate --remove-label "status:ready" --add-label "status:in-progress" --add-assignee "@me"
     ```
   - Khi làm xong: đổi trạng thái sang **`status:in-review`** hoặc **`status:done`** + đóng Issue kèm mã commit.
   - Sau khi hoàn thành mỗi task, luôn **gợi ý 1 task tiếp theo cụ thể** từ [`Docs/Resources/ROADMAP.md`](./Docs/Resources/ROADMAP.md) theo mẫu: `Next: <việc tiếp theo> - <lý do>. Bắt đầu chứ?`

---

## 2. Kiến Trúc Open-Core 2 Repositories (Zero-Strapi 2026)

Hệ thống **Rate Platform (`rate.vn`)** đã loại bỏ hoàn toàn Strapi CMS & Splink Python cũ, chuyển sang **Pure PostgreSQL 17 trên Supabase Cloud (`rate` schema)** và tách thành 2 repositories (dùng chung DB authority tại `DOS/DOS.Me`):

1. **🌍 `DOS/Rate` (Public Open-Core - `D:\Projects\Rate`):**
   - `apps/web`: Giao diện Next.js 16 + React 19 (`rate.vn`), hỗ trợ đa ngôn ngữ (`vi`, `en`, `cs`).
   - `apps/extension`: Giao diện Browser Extension Manifest V3.
   - `packages/shared-data`: Bộ Zod Schema chuẩn **10 Field Groups** (`specs.schema.ts` - PhoneArena structure + GSMArena depth).
   - `apps/importer`: Bộ não chuẩn hóa & chấm điểm công khai:
     - `src/shopee/types.ts`: Data Contract chuẩn cho sản phẩm & review.
     - `src/shopee/product-normalizer.ts`: Bóc tách RAM/ROM tiếng Việt & ánh xạ 10 nhóm thông số.
     - `src/shopee/entity-matcher.ts`: Dedupe 3 tầng (`model_key` -> `pg_trgm` -> AI Spec Enricher).
     - `src/shopee/ai-spec-enricher.ts`: Làm giàu 10 nhóm thông số hỗ trợ đa LLM (`openai`, `dos-ai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`).
     - `src/shopee/ai-review-analyzer.ts`: Phân tích review 2 tầng (Heuristics + LLM), JReviews dual rating & chấm điểm rủi ro gian hàng.
     - `src/shopee/shopee-to-supabase.ts`: Pipeline lưu trữ vào schema `rate`.
   - `supabase/migrations`: Bản sao tham chiếu schema `rate` cho Open-Core (migration thực tế phải commit và chạy CI từ `D:\Projects\DOS-Me\supabase\migrations`).

2. **🔒 `DOS/Rate-Services` (Private Enterprise - `D:\Projects\Rate-Services`):**
   - Chứa toàn bộ phần nhạy cảm: Playwright Stealth Scrapers (`shopee-scraper.ts`, `shopee-search-scraper.ts`, `sniff-search-api.ts`), Giải Captcha (`shopee-captcha-solver.ts`), Xoay Proxy (`proxy-manager.ts`), và Queue Workers (`queue-worker.ts`).
   - **TUYỆT ĐỐI KHÔNG** đưa code bypass anti-bot/captcha/proxy vào repo Public `DOS/Rate`.

---

## 3. Các Lệnh Thiết Yếu (Package Manager: `pnpm`)

```powershell
# Cài đặt dependencies
pnpm install

# Chạy Web UI (http://localhost:3000)
pnpm --filter web dev

# Build & Kiểm tra TypeScript cho Importer / Intelligence Engine
pnpm --filter @repo/crawlers build

# Chạy bộ kiểm thử AI Spec Enricher & Normalizer
pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts

# Chạy bộ kiểm thử AI Review Analyzer & JReviews Voting
pnpm --filter @repo/crawlers exec tsx src/shopee/test-review-analyzer.ts

# Build Web Production
pnpm --filter web build
```