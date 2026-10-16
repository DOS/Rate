# `@repo/crawlers` - Engine Open-Core Của Rate Platform

Thư mục `apps/importer` chứa package **`@repo/crawlers`**, bộ não chuẩn hóa và chấm điểm công khai của Rate Platform. Engine này không tự đi cào dữ liệu. Nó nhận dữ liệu thô (tiêu đề, thông số, đánh giá, giá), chuẩn hóa, gộp trùng, làm giàu thông số bằng AI, phân tích đánh giá và ghi vào schema `rate` trên Supabase.

> **Ranh giới Open-Core:** Scraper chống phát hiện (Playwright Stealth), giải Captcha, xoay Proxy và Queue Worker nằm trong repo private `DOS/Rate-Services`. Không đưa code bypass anti-bot / captcha / proxy vào package này. `DOS/Rate-Services` dùng package này qua git submodule `vendor/rate` (pnpm workspace).

## Các Module (`src/shopee/`)

| File                    | Vai trò                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`              | Data contract cho sản phẩm, gian hàng và đánh giá.                                                                                                                                                                                                                          |
| `product-normalizer.ts` | `ProductNormalizer`, `detectCategorySlug`: bóc tách thương hiệu, dòng máy, RAM/ROM tiếng Việt, ngành hàng và `model_key`.                                                                                                                                                   |
| `entity-matcher.ts`     | `EntityMatcher`: gộp trùng 3 tầng (`model_key` -> `pg_trgm` -> AI Spec Enricher).                                                                                                                                                                                           |
| `ai-spec-enricher.ts`   | `AiSpecEnricher`: làm giàu 10 nhóm thông số (`@repo/shared-data` `ProductSpecificationsSchema`), hỗ trợ nhiều LLM.                                                                                                                                                          |
| `ai-review-analyzer.ts` | `AiReviewAnalyzer`: phân tích đánh giá 2 tầng (Heuristics + LLM), trọng số JReviews, điểm rủi ro gian hàng.                                                                                                                                                                 |
| `shopee-to-supabase.ts` | `ShopeeIngestionPipeline`: ghi master product, listing, giá và đánh giá vào schema `rate`.                                                                                                                                                                                  |
| `arena-spec-syncer.ts`  | `parseGsmArenaHtmlToSpecs`, `extractPhoneArenaTableSpecs`, `parseGsmArenaBrandCatalogHtml`, `parsePhoneArenaCatalogHtml`: parse HTML GSMArena / PhoneArena (trang đã tải sẵn) sang 10 nhóm thông số; `ArenaSpecSyncer.auditCatalogAgainstArenaRegistry` đối chiếu danh mục. |
| `flagship-seed-data.ts` | Dữ liệu tham chiếu thông số cho các thiết bị flagship.                                                                                                                                                                                                                      |

## Entry Point Của Package

Build bằng `tsc` ra `dist/` (ESM, kèm `.d.ts`). Chỉ các entry sau được export:

- `@repo/crawlers`: `types`, `product-normalizer`, `entity-matcher`, `ai-spec-enricher`, `ai-review-analyzer`, `shopee-to-supabase`.
- `@repo/crawlers/shopee/arena-spec-syncer`
- `@repo/crawlers/shopee/flagship-seed-data`

Các file test chạy ngay khi import (`test-*.ts`, `run-ingestion-test.ts`) không được export. `pnpm --filter @repo/crawlers test:dist` kiểm tra điều này trong CI.

## Lệnh

```bash
pnpm --filter @repo/shared-data build   # build trước, @repo/crawlers phụ thuộc vào nó
pnpm --filter @repo/crawlers build      # tsc -> dist/
pnpm --filter @repo/crawlers test       # open-core-intelligence + review analyzer
pnpm --filter @repo/crawlers test:dist  # smoke test entry point của dist/
pnpm --filter @repo/crawlers lint       # lỗi làm fail CI, cảnh báo thì không
```

Test AI Spec Enricher (mặc định chạy với mock server OpenAI-compatible cục bộ, không cần API key; `--backfill` và `--audit-only` đọc/ghi Supabase thật):

```bash
pnpm --filter @repo/crawlers exec tsx src/shopee/test-ai-enricher.ts
```

## Biến Môi Trường

Sao chép `.env.example` thành `.env`. Không commit file `.env`.

- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (chỉ dùng phía server).
- **LLM:** `AI_PROVIDER` (`dos-ai`, `openai`, `gemini`, `deepseek`, `groq`, `openrouter`, `ollama`), `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`. Nếu không đặt `AI_PROVIDER`, engine tự chọn theo key đang có, theo thứ tự `DOS_AI_API_KEY` / `DOS_AI_BASE_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, nếu không có thì dùng `openai`. Mỗi provider đọc key riêng của nó trước, `AI_API_KEY` là fallback chung (riêng `openai` đọc `AI_API_KEY` trước `OPENAI_API_KEY`).

## Script Vận Hành

`Scripts/enqueue-shopee.ts` đưa URL sản phẩm Shopee vào hàng đợi `rate.crawl_jobs` qua RPC `rate.enqueue_crawl_job`. Worker trong `DOS/Rate-Services` sẽ xử lý các job này.

```bash
pnpm --filter @repo/crawlers exec tsx Scripts/enqueue-shopee.ts <url1> [url2 ...]
pnpm --filter @repo/crawlers exec tsx Scripts/enqueue-shopee.ts --file targets.txt
```

## Database

Schema `rate` dùng chung project Supabase `dos`. Migration chỉ được tạo và chạy qua CI của `DOS/DOS.Me` (`supabase/migrations/`). Không chạy DDL trực tiếp từ repo này.
