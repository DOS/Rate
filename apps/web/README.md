# `@repo/web` - Giao Diện & REST API Của `rate.vn`

Ứng dụng Next.js 16 (App Router) + React 19, đa ngôn ngữ `vi` (mặc định), `en`, `cs` qua `next-intl`. Dữ liệu đọc từ schema `rate` trên Supabase (PostgreSQL 17). Giao diện theo [`DESIGN.md`](../../DESIGN.md) (Bootstrap 5 + SCSS tokens `--rate-*`).

## Cấu Trúc Chính (`src/`)

| Đường dẫn | Vai trò |
| --- | --- |
| `app/[locale]/` | Các trang: trang chủ, 5 ngành hàng (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`), `compare`, `deals`, `inspect`, `leaderboard`, `merchants`, `watchlist`, `developers`... |
| `app/api/v1/rate/` | REST API v1 công khai (danh sách bên dưới). |
| `app/api/reviews/[id]/vote/` | Bình chọn đánh giá hữu ích (JReviews). |
| `server/rate/` | Server Data Layer: các hàm `getCached*` bọc `React.cache()` để `generateMetadata()` và `Page()` không truy vấn trùng; `deals.ts` (Deal Radar), `extension.ts` (lookup / ingest cho Extension), `openapi.ts` (đặc tả OpenAPI 3.1.0). |
| `lib/rate-api.ts` | Truy vấn Supabase cho sản phẩm, gian hàng, đánh giá, lịch sử giá. |
| `middleware.ts`, `lib/navigation.ts` | Định tuyến locale (`localePrefix: "never"`, cookie `NEXT_LOCALE`). |
| `../locales/{vi,en,cs}.json` | Chuỗi dịch. |

## REST API v1 (`/api/v1/rate/...`)

`products`, `products/[slug]`, `compare`, `versus`, `deals`, `inspect`, `leaderboard`, `lookup`, `merchants`, `merchants/[id]`, `reviews`, `stats`, `watchlist`, `extension/lookup`, `extension/ingest`, `openapi` (và `openapi.json`). Đặc tả đầy đủ: `GET /api/v1/rate/openapi`.

## Lệnh

```bash
pnpm --filter @repo/shared-data build   # build trước
pnpm --filter @repo/web dev             # http://localhost:3000
pnpm --filter @repo/web typecheck       # tsc --noEmit (TypeScript 7)
pnpm --filter @repo/web lint            # lỗi làm fail CI, cảnh báo thì không
pnpm --filter @repo/web test            # core-rate-architecture test
pnpm --filter @repo/web build           # next build
```

Deploy Production trên Vercel theo `vercel.json` ở root (`pnpm@10.34.5`, `--filter @repo/web...`).

## Biến Môi Trường

Khai báo trong `src/env.mjs`. Đặt trong `apps/web/.env.local` khi chạy local, không commit.

- **Bắt buộc:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `src/lib/rate-api.ts` cố ý báo lỗi khi thiếu, để môi trường preview không âm thầm đọc nhầm project prod (giá trị mặc định trong `src/env.mjs` không được data layer dùng).
- **Tùy chọn:**
  - `APP_PUBLIC_URL` (mặc định `https://rate.vn`), `NEXT_PUBLIC_REVALIDATE`, `NEXT_OUTPUT`, `APP_ENV`;
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`;
  - reCAPTCHA: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY`: chỉ phía server, cho phần ghi dữ liệu của Extension (`src/server/rate/extension.ts`). Không bao giờ đưa key này ra client. `SUPABASE_URL` được dùng làm fallback khi thiếu `NEXT_PUBLIC_SUPABASE_URL`.

## Database

Schema `rate` dùng chung project Supabase `dos`. Migration chỉ được tạo và chạy qua CI của `DOS/DOS.Me`. Không chạy DDL trực tiếp từ repo này.
