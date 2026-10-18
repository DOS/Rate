# 🤖 AGENTS.md - Quy Chuẩn Bắt Buộc Cho Mọi AI Coding Agents (Rate Platform & Hệ Sinh Thái DOS)

Tài liệu này tổng hợp đầy đủ **User-Level Hard Rules (`C:\Users\JOY\AGENTS.md`, `C:\Users\JOY\.claude\CLAUDE.md`)** và **Workspace Rules** dành cho mọi AI Coding Agents (Antigravity, Claude Code, OpenAI Codex, Cursor, Windsurf, ZCode, v.v.) khi làm việc trên **Rate Platform (`rate.vn`)**.

---

## 0. Hard Rules Cấp Hệ Sinh Thái (BẮT BUỘC TUÂN THỦ 100% - KHÔNG NGOẠI LỆ)

1. **CẤM TUYỆT ĐỐI chạy Migration / DDL trực tiếp lên Shared Prod Supabase (`gulptwduchsjcsbndmua`) từ BẤT KỲ repo nào:**
   - Project Supabase `dos` (prod ref: `gulptwduchsjcsbndmua`) được dùng chung bởi `DOS-Me`, `DOS-AI`, `DOSafe`, `Bexly`, `An-Nhan`, và `Rate`.
   - **CHỈ CÓ `DOS-Me/supabase/migrations/` (`D:\Projects\DOS-Me`)** là sổ cái migration (migration ledger) và đường deploy CI duy nhất (qua `preview -> beta -> prod`) cho mọi schema (`public`, `dosai`, `dosafe`, `bexly`, `nhan`, `rate`).
   - **TUYỆT ĐỐI KHÔNG** chạy DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`) lên `gulptwduchsjcsbndmua` qua Supabase MCP (`apply_migration`, `execute_sql`), Dashboard SQL Editor, hoặc `supabase db push` từ repo `Rate`. Chỉ được phép chạy `SELECT` (read-only) qua MCP.
   - Khi cần thay đổi schema `rate`: Viết file migration idempotent (`CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` trước `CREATE POLICY`, `DO $$ ... $$`), xin phép JOY để tạo PR bên `DOS-Me/supabase/migrations/`, test/deploy trên **beta** trước rồi mới qua **prod**. (Bản copy trong `DOS/Rate/supabase/migrations/` chỉ mang tính tham chiếu mã nguồn mở Open-Core, không dùng để push thẳng lên `gulptwduchsjcsbndmua`).

2. **JOY KHÔNG CODE, KHÔNG CHẠY LỆNH, VÀ KHÔNG MERGE PR:**
   - Không bao giờ đưa lệnh terminal, bash/PowerShell snippet hay code bảo JOY tự chạy hoặc tự dán. Agent phải tự chạy tất cả.
   - Không bao giờ bảo JOY tự review code diff hay bấm nút Merge PR ("chờ mày merge"). Agent phải chạy code review (`superpowers:code-reviewer` / subagent fresh-context review), sửa hết lỗi, đợi CI xanh và **tự động merge PR** (`gh pr merge`).
   - Chỉ hỏi ý kiến JOY cho: quyết định sản phẩm/kiến trúc, thao tác rủi ro cao (xóa dữ liệu, thay đổi prod, tiêu tiền, sửa khác repo `cross-repo writes`), hoặc bước bắt buộc cần người thật (2FA, CAPTCHA, OAuth device code).

3. **Ngôn ngữ & Định dạng Giao tiếp:**
   - **Trả lời trực tiếp JOY (Private / Direct Chat):** Luôn dùng **Tiếng Việt có dấu đầy đủ 100%** trên bề mặt giao tiếp trực tiếp với JOY (chat, câu hỏi `ask_question`, nhãn lựa chọn). Giữ nguyên thuật ngữ kỹ thuật thông dụng bằng tiếng Anh (`API`, `commit`, `branch`, `PR`, `CI`, `build`, `deploy`, `repo`, `merge`, `push`, `workflow`, `token`, `key`, `env`, `prod`, `staging`).
   - **Toàn bộ bề mặt Public trên GitHub & trong Repo (Issues, PRs, Comments, Code, Commits, Docs) = 100% Tiếng Anh:**
     - Vì `DOS/Rate` là kho mã nguồn mở công khai (`Open-Core`) hướng tới cộng đồng quốc tế (`vi`, `en`, `cs`), **BẮT BUỘC viết 100% bằng Tiếng Anh** cho: **GitHub Issues (Title, Body, Comments)**, **GitHub Pull Requests (Title, Body, Review comments)**, **Commit messages**, **Code & Code comments**, **Tests**, và các tài liệu chuẩn (`README.md`, `ROADMAP.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `DESIGN.md`). Không bao giờ tạo Issue, PR hoặc comment bằng tiếng Việt trên GitHub.
   - **Tài liệu đưa cho JOY đọc/review (Proposal, Plan, Report, Audit) = HTML + Dark Theme + Tiếng Việt có dấu:**
     - Mọi tài liệu cần JOY đọc để ra quyết định **BẮT BUỘC** phải xuất thành file **HTML tự chứa (self-contained)** lưu ngay trong repo (ví dụ `Docs/Proposals/<YYYY-MM-DD>-<slug>.html`), có **Dark Theme gốc** (`<meta name="color-scheme" content="dark">`, nền tối `~#0f1113`, chữ sáng, điểm nhấn đỏ `#FF2E29`), viết bằng **Tiếng Việt có dấu đầy đủ**. Không đưa file `.md` thô hoặc trang nền sáng cho JOY đọc.
   - **Cấm dùng dấu gạch ngang dài (No em-dashes):** Không bao giờ dùng `—` (`U+2014`), `–` (`U+2013`), hoặc `&mdash;`. Luôn dùng dấu gạch nối đơn `-`.

4. **Trung thực tuyệt đối (Never Lie / Evidence-Based):**
   - Chỉ khẳng định khi có bằng chứng trực tiếp (log, output lệnh, dòng code, kết quả truy vấn). Nếu suy đoán phải ghi rõ là giả thuyết kèm lý do và cách kiểm chứng.

5. **Cách ly Worktree & Bảo vệ Cross-Repo:**
   - **Không tự ý sửa repo khác** ngoài workspace hiện tại khi chưa được JOY đồng ý.
   - Khi làm việc đa nhánh/đa repo, tạo worktree riêng theo runtime (`<repo>\.claude\worktrees\<task>`, `<repo>\.codex\worktrees\<task>`, `<repo>\.gemini\worktrees\<task>`). Không bao giờ chạy `git checkout` / `git reset --hard` trên nhánh chính đang dùng chung.
   - Mọi deliverable (báo cáo HTML, proposal, script) phải lưu trong repo và commit, không vứt ở thư mục tạm (`C:\Temp`, scratchpad).

6. **CẤM deploy thẳng lên Production (`rate.vn`). Production chỉ build từ nhánh `main` qua Vercel Git integration:**
   - Luồng chuẩn (giống `DOS.AI` và `DOS.Me`): PR tính năng -> `dev` (**squash**); PR promote `dev` -> `main` mở từ chính nhánh `dev` và merge bằng **merge commit** (`gh pr merge --merge`), không bao giờ squash hay rebase. Hotfix: nhánh `hotfix/*` -> `main` có label `emergency-hotfix`, rồi back-merge ngay `main` -> `dev` bằng merge commit. Chi tiết: [`Docs/Resources/RELEASE.md`](./Docs/Resources/RELEASE.md).
   - **TUYỆT ĐỐI KHÔNG** chạy `vercel deploy --prod`, `vercel --prod`, `--prebuilt --prod`, `--skip-domain` rồi `promote`, hay promote một bản Preview của `dev` lên production, kể cả khi JOY đã cho phép "deploy". Lời cho phép deploy nghĩa là merge PR promote `dev` -> `main`, không phải deploy từ máy local.
   - Chốt kỹ thuật: `scripts/vercel-production-guard.mjs` (chạy trong `buildCommand` của `vercel.json`) làm build production thất bại nếu không phải GitHub build từ `DOS/Rate@main`; workflow `Validate PR Base` chặn PR vào `main` không từ `dev`; workflow `Branch Divergence` báo lỗi khi `main` có commit mà `dev` không có. Không được sửa hay vô hiệu hóa các chốt này để deploy cho nhanh.
   - Ngoại lệ duy nhất: **rollback** về một bản production cũ đã build từ Git (`vercel rollback`), vì không build lại. Sau đó sửa tiếp qua PR hotfix.

7. **Chủ động thực thi liên tục & đề xuất việc tiếp theo (Proactive Next-Task):**
   - **Khi đang ở chế độ `/goal` hoặc được giao làm hết backlog:** Tự động tạo/nhận và làm liên tục từng task đến khi sạch toàn bộ backlog mà **KHÔNG dừng lại hỏi `Bắt đầu chứ?`**.
   - Chỉ khi đã hoàn thành toàn bộ mục tiêu và không còn task khả dụng mới báo cáo tổng kết.

---

## 1. Quy Trình Quản Lý Task Đa Agent (GitHub Project #9 & Issues)

Bảng điều phối trung tâm: **[https://github.com/orgs/DOS/projects/9](https://github.com/orgs/DOS/projects/9)**  
Lộ trình chuẩn: **[`Docs/Resources/ROADMAP.md`](./Docs/Resources/ROADMAP.md)**

### Bước 1: Kiểm tra & Nhận Task (Pick / Create Issue -> `In Progress`)

Trước khi viết bất kỳ dòng code nào, Agent phải kiểm tra danh sách Issue trên cả 2 repo:

```powershell
# Xem danh sách Issue đang mở
gh issue list -R DOS/Rate --state open
gh issue list -R DOS/Rate-Services --state open
```

- **Quy tắc Định danh Agent (Agent Nickname) & Tránh trùng lặp:**
  - Vì mọi Agent đều chạy dưới tài khoản GitHub của JOY (`@me`), **MỖI AGENT PHẢI TỰ ĐẶT MỘT NICKNAME NGẮN GỌN** theo chuyên môn hoặc phiên làm việc (ví dụ: `Crawl`, `Web`, `Core`, `DB`, `QA`) và gắn cả **Nhãn `agent:<nickname>`** lẫn **Cột `Agent` trên GitHub Project #9**.
  - **TUYỆT ĐỐI KHÔNG** tự ý làm các Issue đang có nhãn `status:in-progress`, `status:in-review` hoặc đã có nhãn `agent:<khác>` đang chạy (trừ khi JOY chỉ định rõ).
  - Ưu tiên chọn các Issue đang có nhãn `status:ready`.
  - Nếu yêu cầu của người dùng chưa có Issue tương ứng, **TẠO NGAY ISSUE MỚI BẰNG TIẾNG ANH** và gắn vào GitHub Project #9:
    ```powershell
    $agentNick = "Crawl" # Đặt nickname riêng của Agent (vd: Crawl, Web, Core...)
    $agentLabel = "agent:$($agentNick.ToLower())"
    gh label create $agentLabel -R DOS/Rate --color "D93F0B" --description "Claimed by Agent: $agentNick" --force
    gh issue create -R DOS/Rate --title "<English task title>" --body "<Detailed English description>" --label "status:in-progress,$agentLabel" --assignee "@me"
    gh project item-add 9 --owner DOS --url <ISSUE_URL>
    ```
- **Chuyển trạng thái sang `In Progress` & Ghi danh Agent ngay khi bắt đầu (BẮT BUỘC đồng bộ cả Issue lẫn Board Project #9, comment bằng Tiếng Anh):**

  ```powershell
  $agentNick = "Crawl" # Nickname của Agent hiện tại
  $agentLabel = "agent:$($agentNick.ToLower())"
  gh label create $agentLabel -R DOS/Rate --color "D93F0B" --description "Claimed by Agent: $agentNick" --force

  # 1. Cập nhật nhãn Issue (status:in-progress + agent:<nick>) & comment ghi danh bằng Tiếng Anh
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:ready" --add-label "status:in-progress,$agentLabel" --add-assignee "@me"
  gh issue comment <ISSUE_NUMBER> -R DOS/Rate --body "🤖 **[Agent: $agentNick]** Claimed this issue (Status: Ready -> In Progress)."

  # 2. BẮT BUỘC cập nhật cột Status VÀ trường Agent trên bảng GitHub Project #9
  # Project ID: PVT_kwDOA388Vc4Bm5Ml | Field Status: PVTSSF_lADOA388Vc4Bm5MlzhlgSt8 | Field Agent: PVTF_lADOA388Vc4Bm5MlzhlqBH8
  # Status Option IDs: Backlog=f75ad846 | Ready=e18bf179 | In progress=47fc9ee4 | In review=aba860b9 | Done=98236657
  # Tra item từ phía issue: `gh project item-list` mặc định chỉ trả 30 trong hơn 300 item của Project #9 nên không thấy issue mới (`$itemId` rỗng, cập nhật board thất bại âm thầm).
  $itemId = gh api graphql -F n=<ISSUE_NUMBER> -f query='query($n: Int!) { repository(owner: "DOS", name: "Rate") { issue(number: $n) { projectItems(first: 10) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == 9) | .id'
  gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTSSF_lADOA388Vc4Bm5MlzhlgSt8 --single-select-option-id 47fc9ee4
  gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTF_lADOA388Vc4Bm5MlzhlqBH8 --text $agentNick
  ```

- **Check bắt buộc `task-claim`:** ruleset `dev-task-claim` chặn merge PR vào `dev` cho tới khi **mỗi** issue mà PR sẽ đóng (từ khóa `Closes`/`Fixes`/`Resolves #N` hoặc liên kết thủ công) có nhãn `agent:<nick>` và `status:in-progress` hoặc `status:in-review`. PR của Dependabot được miễn; PR không đóng issue nào thì pass. Khi issue được thêm hoặc gỡ nhãn `agent:*`/`status:*`, check của các PR liên quan tự chạy lại; nếu không thấy chạy lại thì push/sửa mô tả PR hoặc chạy `gh run rerun <run-id> -R DOS/Rate`. Nguồn: `.github/workflows/task-claim.yml`, `.github/workflows/task-claim-revalidate.yml`, `scripts/task-claim-check.mjs`.

### Bước 2: Cập nhật trạng thái khi hoàn thành (`In Review` / `Done`)

Sau khi code xong, chạy pass toàn bộ bài test/build và qua bước review:

- **Trường hợp đang mở PR chờ CI / Reviewer tự động (`In Review`):**
  ```powershell
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:in-progress" --add-label "status:in-review"
  gh issue comment <ISSUE_NUMBER> -R DOS/Rate --body "🔍 **[Agent: $agentNick]** Implementation complete and tests passing. Moving status to In Review (Commit/PR: <SHA/URL>)."
  $itemId = gh api graphql -F n=<ISSUE_NUMBER> -f query='query($n: Int!) { repository(owner: "DOS", name: "Rate") { issue(number: $n) { projectItems(first: 10) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == 9) | .id'
  gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTSSF_lADOA388Vc4Bm5MlzhlgSt8 --single-select-option-id aba860b9
  ```
- **Trường hợp đã hoàn tất & merge xong (`Done`):**
  ```powershell
  gh issue edit <ISSUE_NUMBER> -R DOS/Rate --remove-label "status:in-progress,status:in-review" --add-label "status:done"
  gh issue close <ISSUE_NUMBER> -R DOS/Rate --comment "✅ **[Agent: $agentNick]** Completed in commit <SHA> (Status -> Done)."
  $itemId = gh api graphql -F n=<ISSUE_NUMBER> -f query='query($n: Int!) { repository(owner: "DOS", name: "Rate") { issue(number: $n) { projectItems(first: 10) { nodes { id project { number } } } } } }' --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == 9) | .id'
  gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id $itemId --field-id PVTSSF_lADOA388Vc4Bm5MlzhlgSt8 --single-select-option-id 98236657
  ```

---

## 2. Ranh Giới Kiến Trúc Open-Core 2 Repositories (CỰC KỲ QUAN TRỌNG)

Hệ thống Rate được tách thành **2 repositories riêng biệt** (và dùng chung DB với **`DOS/DOS.Me`**):

| Repository                                                      |         Độ riêng tư         | Đường dẫn Local             | Những gì ĐƯỢC PHÉP đặt tại đây                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| :-------------------------------------------------------------- | :-------------------------: | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`DOS/Rate`](https://github.com/DOS/Rate)**                   |  🌍 **Public (Open-Core)**  | `D:\Projects\Rate`          | • **`apps/web`**: Giao diện Next.js 16.3.8 (`rate.vn`), i18n (`vi`, `en`, `cs`), Server Data Layer (`src/server/rate/`) & REST API v1 (`src/app/api/v1/rate/`)<br/>• **`apps/extension`**: Giao diện Browser Extension MV3 minh bạch<br/>• **`packages/shared-data`**: Zod Schema 10 nhóm thông số (`specs.schema.ts`)<br/>• **`apps/importer`**: Bộ não chuẩn hóa & chấm điểm công khai (`types.ts`, `product-normalizer.ts`, `entity-matcher.ts`, `ai-spec-enricher.ts`, `ai-review-analyzer.ts`, `shopee-to-supabase.ts`)<br/>• **`supabase/migrations`**: Bản sao tham chiếu schema `rate` cho Open-Core (**KHÔNG chạy `db push` hay MCP `apply_migration` từ đây**) |
| **[`DOS/Rate-Services`](https://github.com/DOS/Rate-Services)** | 🔒 **Private (Enterprise)** | `D:\Projects\Rate-Services` | • **Anti-Detect Scrapers**: `shopee-scraper.ts`, `shopee-search-scraper.ts`, `sniff-search-api.ts`<br/>• **Bypass & Proxy**: `shopee-captcha-solver.ts` (giải Captcha), `proxy-manager.ts` (`mproxy.vn`)<br/>• **Queue Workers**: `queue-worker.ts`, `crawl-smartphones-with-proxy.ts`<br/>• **GitHub Actions Cron**: `.github/workflows/scheduled-crawler.yml`                                                                                                                                                                                                                                                                                                          |
| **[`DOS/DOS.Me`](https://github.com/DOS/DOS.Me)**               |  🔒 **Sole DB Authority**   | `D:\Projects\DOS-Me`        | • **`supabase/migrations/`**: Nơi **DUY NHẤT** được phép chứa migration chính thức và chạy CI deploy (`preview -> beta -> prod`) lên Supabase `gulptwduchsjcsbndmua`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

> ⚠️ **CẤM TUYỆT ĐỐI:** Không bao giờ commit code giải Captcha, xoay Proxy, sniff API nội bộ của sàn, hoặc khoá bí mật (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `MPROXY_*`) vào `DOS/Rate`.

> 🔗 **Engine dùng chung:** `DOS/Rate-Services` lấy `@repo/crawlers` (`apps/importer`) và `@repo/shared-data` (`packages/shared-data`) từ repo này qua git submodule `vendor/rate` (pnpm workspace). Module mới cần dùng bên đó thì thêm subpath vào `exports` của `apps/importer/package.json` và vào `test:dist`.

---

## 3. Kiến Trúc Kỹ Thuật Cốt Lõi & 4-Layer Backend (Zero-Strapi 2026)

- **Bỏ hoàn toàn Strapi CMS & Splink Python:** Không sử dụng hay khởi tạo lại các thành phần Strapi cũ.
- **Chuẩn Ngôn Ngữ & Công Cụ (Ecosystem Standard 2026):**
  - **TypeScript `^7.0.2`** (`strict: true`, `ignoreBuildErrors: false`), **Node.js >= 22 (v26 LTS)**, **pnpm `10.x`**, **Turborepo `^2.10.12`**.
- **Kiến Trúc 4 Tầng Backend (4-Layer Composable Backend Architecture):**
  1. **Layer 1 - Web BFF & REST API v1 (`apps/web`):**
     - **Server Data Layer (`apps/web/src/server/rate/`):** Tầng truy vấn Server-only bọc `React.cache()` chống trùng lặp request giữa `generateMetadata()` và React Server Components (`page.tsx`).
     - **JSON REST API v1 (`apps/web/src/app/api/v1/rate/*` & `/api/reviews/[id]/vote`):** Cung cấp REST API chuẩn (`GET /api/v1/rate/products`, `GET /api/v1/rate/products/[slug]`, `POST /api/reviews/[id]/vote`) phục vụ cả Web Client islands lẫn Browser Extension Manifest V3.
  2. **Layer 2 - Open-Core Intelligence & Normalization Service (`apps/importer` + `packages/shared-data`):**
     - `packages/shared-data/src/schemas/specs.schema.ts`: Chuẩn **10 Field Groups** bằng Zod (`^3.25.76`), kết hợp cấu trúc sạch của **PhoneArena** (tách riêng `main_camera`, `second_camera`, `third_camera`, `fourth_camera`, `front_camera`) và độ sâu kỹ thuật của **GSMArena**.
     - `apps/importer/src/shopee/*`: `ProductNormalizer`, `EntityMatcher` (Dedupe 3 tầng: `model_key` -> `pg_trgm` -> LLM), `AiSpecEnricher`, `AiReviewAnalyzer`, `ShopeeToSupabasePipeline`.
     - **AI Provider-Agnostic:** Hỗ trợ chuẩn OpenAI-compatible (`dos-ai` gateway `api.dos.ai` / vLLM Qwen, `openai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`) qua `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
  3. **Layer 3 - Private Anti-Detect Scraper & Queue Worker Service (`DOS/Rate-Services`):**
     - Playwright Stealth, xoay IP `mproxy.vn`, giải Slider Captcha, và `queue-worker.ts` xử lý hàng đợi bất đồng bộ qua cơ chế khóa nguyên tử PostgreSQL `FOR UPDATE SKIP LOCKED`.
  4. **Layer 4 - Database, Atomic Queue & In-DB Trigger Engine (`Supabase Cloud PostgreSQL 17` - `rate` schema):**
     - `rate.master_products`: Sản phẩm gốc chuẩn hóa (`model_key` duy nhất, `specifications` JSONB 10 nhóm, `key_specs`).
     - `rate.products`: Gian hàng/Listing từ các sàn liên kết qua `cluster_id`.
     - `rate.price_history`: Lịch sử giá chống trùng theo `observation_id`.
     - `rate.reviews`, `rate.review_flags`, `rate.review_votes`: Đánh giá người dùng, phân tích seeding bằng AI, bình chọn/báo cáo theo từng người dùng, và trigger `SECURITY DEFINER` tự động tính điểm.

---

## 4. Lệnh Kiểm Thử & Build Thường Dùng

```powershell
# Tại D:\Projects\Rate (Monorepo dùng pnpm + TypeScript 7.0.2)
pnpm --filter @repo/shared-data build
pnpm --filter @repo/crawlers build
pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts
pnpm --filter @repo/crawlers exec tsx src/shopee/test-review-analyzer.ts
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build

pnpm --filter @repo/crawlers test:dist

# Tại D:\Projects\Rate-Services (pnpm workspace + submodule vendor/rate)
git submodule update --init
pnpm install
pnpm build
pnpm test:enricher
```

---

## 5. Review PR: Mức Độ Finding (P0-P3) & Quy Tắc Hội Tụ

Mỗi finding khi review (subagent fresh-context, bot, hoặc người) phải được gắn một mức độ:

| Mức    | Định nghĩa                                                                                                                |
| :----- | :------------------------------------------------------------------------------------------------------------------------ |
| **P0** | Gây sập dịch vụ, mất dữ liệu, xâm phạm bảo mật, hoặc dịch chuyển tiền sai trong luồng sử dụng bình thường.                |
| **P1** | Lỗi đúng/sai trên luồng bình thường, hoặc lỗi về bảo mật / phân quyền / tiền / credential / dữ liệu chưa tới mức P0.      |
| **P2** | Lỗi ở edge case, hoặc lỗi có cách né (workaround), nằm ngoài các vùng bảo mật / phân quyền / tiền / credential / dữ liệu. |
| **P3** | Câu chữ, style, đặt tên.                                                                                                  |

**Quy tắc hội tụ (nhẹ):**

- **Vòng 1:** Sửa các finding hợp lý ở mọi mức.
- **Từ vòng 2 trở đi:** Trong PR hiện tại chỉ sửa P0/P1, mọi finding về bảo mật hoặc dữ liệu, lỗi trong hành vi mà chính PR này thêm vào, và required check đang đỏ. Các P2/P3 còn lại gom vào **một** issue follow-up duy nhất; trả lời từng thread kèm link issue đó rồi resolve thread.
- Một lượt review của bot bị rate-limit, bị bỏ qua (skipped) hoặc không có nội dung **không phải là review**. Không chờ và không tính là đã review.
- Cổng review thật sự là **review bằng subagent fresh-context** (Mục 0.2). Required check `Typecheck & Build Monorepo` phải xanh trước khi merge (ruleset `dev-main-light` trên `dev` và `main`: chặn xóa nhánh và force-push, không yêu cầu approval). Riêng `main` có thêm ruleset `main-release`: bắt buộc qua PR, chỉ cho merge commit, và phải xanh thêm `PR into main comes from dev` và `main must not lead dev` (Mục 0.6).
