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
   - **Pick Issue** đang ở `status:ready` (hoặc **tạo Issue mới** nếu chưa có), tự đặt **Nickname riêng cho Agent** (vd: `Crawl`, `Web`, `Core`, `DB`), gắn nhãn **`agent:<nickname>` + `status:in-progress`** VÀ cập nhật cả **cột Status (`In progress`) lẫn cột `Agent` trên Board Project #9** ngay lập tức để các Agent khác không làm trùng:
     ```powershell
     $agentNick = "Crawl" # Đặt nickname riêng của Agent
     $agentLabel = "agent:$($agentNick.ToLower())"
     gh label create $agentLabel -R DOS/Rate --color "D93F0B" --description "Claimed by Agent: $agentNick" --force
     gh issue edit <ID> -R DOS/Rate --remove-label "status:ready" --add-label "status:in-progress,$agentLabel" --add-assignee "@me"
     $itemId = ((gh project item-list 9 --owner DOS --format json | ConvertFrom-Json).items | Where-Object { $_.content.number -eq <ID> -and $_.content.repository -eq "DOS/Rate" }).id
     # Option IDs: Backlog=f75ad846 | Ready=e18bf179 | In progress=47fc9ee4 | In review=aba860b9 | Done=98236657
     gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTSSF_lADOA388Vc4Bm5MlzhlgSt8 --single-select-option-id 47fc9ee4
     gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTF_lADOA388Vc4Bm5MlzhlqBH8 --text $agentNick
     ```
   - Khi làm xong: đổi cả nhãn Issue lẫn cột Status trên Project #9 sang **`In review` (`aba860b9`)** hoặc **`Done` (`98236657`)** + đóng Issue kèm chữ ký `**[Agent: <Nickname>]**` và mã commit.
   - Sau khi hoàn thành mỗi task, luôn **gợi ý 1 task tiếp theo cụ thể** từ [`Docs/Resources/ROADMAP.md`](./Docs/Resources/ROADMAP.md) theo mẫu: `Next: <việc tiếp theo> - <lý do>. Bắt đầu chứ?`

---

## 2. Kiến Trúc Open-Core 2 Repositories & 4-Layer Backend (Zero-Strapi 2026)

Hệ thống **Rate Platform (`rate.vn`)** đã loại bỏ hoàn toàn Strapi CMS & Splink Python cũ, chuẩn hóa lên **TypeScript 7.0.2**, **Next.js 16.3.8**, **React 19.3.0**, **Pure PostgreSQL 17 trên Supabase Cloud (`rate` schema)** và vận hành theo **Kiến trúc 4 Tầng Backend** trên 2 repositories (dùng chung DB authority tại `DOS/DOS.Me`):

1. **🌍 `DOS/Rate` (Public Open-Core - `D:\Projects\Rate`):**
   - `apps/web`: Giao diện Next.js 16.3.8 + React 19.3.0 (`rate.vn`), đa ngôn ngữ (`vi`, `en`, `cs`), **Server Data Layer** (`src/server/rate/` bọc `React.cache()`) và **JSON REST API v1** (`GET /api/v1/rate/products`, `GET /api/v1/rate/products/[slug]`, `POST /api/reviews/[id]/vote`).
   - `apps/extension`: Giao diện Browser Extension Manifest V3.
   - `packages/shared-data`: Bộ Zod Schema chuẩn **10 Field Groups** (`specs.schema.ts` - PhoneArena structure + GSMArena depth).
   - `apps/importer`: Bộ não chuẩn hóa & chấm điểm công khai:
     - `src/shopee/types.ts`: Data Contract chuẩn cho sản phẩm & review.
     - `src/shopee/product-normalizer.ts`: Bóc tách RAM/ROM tiếng Việt & ánh xạ 10 nhóm thông số.
     - `src/shopee/entity-matcher.ts`: Dedupe 3 tầng (`model_key` -> `pg_trgm` -> AI Spec Enricher).
     - `src/shopee/ai-spec-enricher.ts`: Làm giàu 10 nhóm thông số hỗ trợ đa LLM (`dos-ai`, `openai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`).
     - `src/shopee/ai-review-analyzer.ts`: Phân tích review 2 tầng (Heuristics + LLM), JReviews dual rating & chấm điểm rủi ro gian hàng.
     - `src/shopee/shopee-to-supabase.ts`: Pipeline lưu trữ vào schema `rate`.
   - `supabase/migrations`: Bản sao tham chiếu schema `rate` cho Open-Core (migration thực tế phải commit và chạy CI từ `D:\Projects\DOS-Me\supabase\migrations`).

2. **🔒 `DOS/Rate-Services` (Private Enterprise - `D:\Projects\Rate-Services`):**
   - Chứa toàn bộ phần nhạy cảm: Playwright Stealth Scrapers (`shopee-scraper.ts`, `shopee-search-scraper.ts`, `sniff-search-api.ts`), Giải Captcha (`shopee-captcha-solver.ts`), Xoay Proxy (`proxy-manager.ts`), và Queue Workers (`queue-worker.ts`).
   - **TUYỆT ĐỐI KHÔNG** đưa code bypass anti-bot/captcha/proxy vào repo Public `DOS/Rate`.
   - Engine Open-Core (`@repo/crawlers`, `@repo/shared-data`) được dùng qua git submodule `vendor/rate` (pnpm workspace). **KHÔNG** copy file engine sang Rate-Services; sửa engine tại `DOS/Rate` rồi bump submodule.

---

## 3. Các Lệnh Thiết Yếu (Package Manager: `pnpm` + TypeScript `7.0.2`)

```powershell
# Cài đặt dependencies
pnpm install

# Chạy Web UI (http://localhost:3000)
pnpm --filter @repo/web dev

# Build Shared Data & Importer Intelligence Engine
pnpm --filter @repo/shared-data build
pnpm --filter @repo/crawlers build

# Chạy bộ kiểm thử AI Spec Enricher & Normalizer
pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts

# Chạy bộ kiểm thử AI Review Analyzer & JReviews Voting
pnpm --filter @repo/crawlers exec tsx src/shopee/test-review-analyzer.ts

# Kiểm tra TypeScript 7.0.2 & Build Web Production
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```
