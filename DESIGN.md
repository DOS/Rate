# Rate.vn Design System & Frontend Engineering Guidelines (DESIGN.md)

> **Version:** 3.0.0 (Review & Rating-First Product Intelligence Architecture)
> **Target Audience:** Frontend Engineers, UI/UX Designers, AI Coding Agents
> **Core Positioning:** _The Independent Product Rating, AI Anti-Seeding Review & Technical Audit Terminal_
> **Aesthetic DNA:** RTINGS-analytical * Linear-monochrome * Vercel Geist-precision * Zero Affiliate Clutter
> **Token & component inventory:** [`Docs/Resources/design-system/`](./Docs/Resources/design-system/README.md) (`tokens.json`, brand book, component guidelines and previews, icons and logos)

---

## 1. Design Philosophy & Core Product Positioning

**Rate.vn** (`DOS/Rate`) is an independent **Product Rating, Community Review & Anti-Seeding Intelligence Platform**.
It is **NOT** an affiliate shopping portal, coupon site, or legacy business directory. Every screen must look and behave like an authoritative **product lab & review audit terminal** (inspired by **RTINGS**, **Linear**, and **Wirecutter**).

### Non-Negotiable Principles

1. **Rating & Review First - Never Affiliate First:**
   - The primary value of Rate.vn is **unbiased multi-criteria ratings** (`User Weighted Score` + `Expert Lab Score`) and **AI-audited authentic reviews** (filtering out fake seeding, coin-farming spam, and paid bot reviews).
   - Product pages must **never** place giant red/pink promotional price boxes or loud "Buy Now / Go to Store" affiliate buttons above the fold.
   - Merchant listings and historical prices exist strictly as **price-manipulation & merchant-trust verification evidence** at the bottom of the page, never as commercial sales pitches.
2. **Unified Monochrome + Semantic Precision (Zero "Bootstrap Rainbow Soup"):**
   - Do not mix random Bootstrap utility colors (`bg-info`, `bg-warning`, `bg-danger-subtle`, `bg-primary`, `bg-success`) or decorative emojis inside analytical headers.
   - Use a cohesive **Obsidian + Slate monochrome foundation** (`#0f1113`, `#151922`, `#f8fafc`, `#ffffff`) with `1px` crisp hairlines (`#e2e8f0` in light mode, `rgba(255,255,255,0.08)` in dark mode).
   - Color is reserved strictly for **semantic telemetry**:
     - **Brand Green (`#2dba69`, from the logo)**: Verified Authentic Reviews, Pros, High Trust (`>= 85`), Verified Price Floor.
     - **Indigo (`#6366f1`)**: Expert Lab Score, 5-Criteria Rating Bars, AI Enriched Specs.
     - **Amber (`#f59e0b`)**: Moderate Seeding Watch, Star Rating Gold (`#f59e0b`), Minor Price Volatility.
     - **Rose / Brand Red (`#f43f5e` / `#d83030`, from the logo)**: Seeding Spam Penalty, Cons, Fake Discount Alert, and Brand Focal Mark.
3. **Zero Legacy Template Artifacts:**
   - All remnants of the legacy _ListingHub_ directory template (`/img/brand/logo-*.png`, `<BrandImage />`, `/img/brand-section.png`, `.bg-primary-2` red background banners, `'Jost'` rounded geometric font) are **strictly banned**.
   - **Brand mark:** the official split star logo (red `#d83030` / green `#2dba69`; source files in Drive `Biz/Rate/Marketing/Logo/Final`, the PDF wraps a raster so the PNGs are the masters). Use `<RateWordmark />` (`src/components/brand/RateWordmark.tsx`): the star (`public/img/rate-logo-64.png`, resized from the 512px master `rate-logo-512.png`) followed by "Rate.vn" in Inter 800. `favicon.ico`, `icon.png`, `apple-icon.png`, the OG card and the extension icons are resized from the same files. The red/green split is identity, not a status signal; red/green look alike to color-blind users, so UI status always pairs the color with a word or icon.
4. **Visible Keyboard Focus (WCAG 2.4.7):**
   - Every link, button, `.btn` (including `.btn-check` toggle labels) and form control shows a solid 2px `--rate-focus-ring` outline on `:focus-visible` (offset 2px, 1px on inputs). `--rate-focus-ring` is `#d83030` (4.8:1 on white, 4.0:1 on `#0f1113`) and `#ff6b6b` inside `.rate-surface-dark`. Never strip focus with `outline: 0` or `box-shadow: none` without this replacement.
5. **Small-Radius Buttons (No Pills):**
   - Every `.btn` uses `--rate-radius-btn` (`8px`); `.btn.rounded-pill` is overridden to the same radius. Chips and badges may stay pill-shaped; buttons never are.
6. **Readable Text Floor:**
   - Body copy is `16px`. No UI text renders below `--rate-text-min` (`0.8125rem`, `13px`): labels, chips, captions, `.small`, `code` and chart labels included. Never set an inline `fontSize` below it.
7. **High-Density Tabular Scannability:**
   - Every rating (`4.9 / 5.0`), criteria score (`9.6 / 10`), review percentage (`92% Authentic`), hardware metric (`120 Hz`, `5000 mAh`), and reference price must use `font-variant-numeric: tabular-nums`.

---

## 2. Color Tokens & Surface Architecture

All components in `apps/web` must reference the `--rate-*` CSS custom properties defined in `apps/web/src/app/style/scss/_custom.scss` and `style.scss`.

### 2.1 Surface & Neutral Tokens

| Token                  | Dark Command Surface (`.rate-surface-dark`) | Light Analytical Canvas (Default App) | Usage                                                                  |
| :--------------------- | :------------------------------------------ | :------------------------------------ | :--------------------------------------------------------------------- |
| `--rate-bg-canvas`     | `#0b0d11`                                   | `#f8fafc`                             | Page background canvas                                                 |
| `--rate-bg-surface`    | `#12161f`                                   | `#ffffff`                             | Primary cards, review containers, spec tables                          |
| `--rate-bg-elevated`   | `#181d29`                                   | `#f1f5f9`                             | Scoreboard wells, criteria bar tracks, table headers                   |
| `--rate-border-subtle` | `rgba(255, 255, 255, 0.08)`                 | `#e2e8f0`                             | 1px structural borders (`border: 1px solid var(--rate-border-subtle)`) |
| `--rate-border-strong` | `rgba(255, 255, 255, 0.16)`                 | `#cbd5e1`                             | Active card borders, focused inputs                                    |
| `--rate-fg-primary`    | `#f8fafc`                                   | `#0f172a`                             | Headings, product titles, primary spec values                          |
| `--rate-fg-secondary`  | `#94a3b8`                                   | `#475569`                             | Review body copy, spec labels, descriptions                            |
| `--rate-fg-muted`      | `#64748b`                                   | `#64748b`                             | Timestamps, `model_key` metadata, secondary captions                   |
| `--rate-fg-paragraph`  | `#cbd5e1`                                   | `#334155`                             | Eyebrow and spec pill text, long-form copy                             |
| `--rate-crimson-text`  | `#ff6b6b`                                   | `#d83030`                             | Crimson links and labels that must hold 4.5:1 on the surface           |

Wrap an obsidian section in `.rate-surface-dark` (defined in `_custom.scss`) and every token above switches to its dark value, so `.rate-card`, `.rate-eyebrow`, `.rate-spec-pill`, `.rate-spec-group-card` and the score badges render correctly inside it. `--rate-fg-muted` stays `#64748b` and reaches only about 4.1:1 on the dark canvas and 3.8:1 on the dark surface: keep it for non-essential captions there (spec labels switch to `--rate-fg-secondary` inside the scope).

### 2.2 Semantic Rating & Audit Tokens

| Token                 | Value     | Soft Tint (Light / Dark)               | Strict Semantic Meaning                                              |
| :-------------------- | :-------- | :------------------------------------- | :------------------------------------------------------------------- |
| `--rate-brand`        | `#d83030` | `#fff1f2` / `rgba(216, 48, 48, 0.14)`  | Brand identity mark, primary review submission CTA                   |
| `--rate-score-user`   | `#2dba69` | `#ecfdf5` / `rgba(45, 186, 105, 0.14)` | **Authentic User Score** (post-seeding filter), Pros, Verified Buyer |
| `--rate-score-expert` | `#6366f1` | `#eef2ff` / `rgba(99, 102, 241, 0.14)` | **Expert Lab Score**, 5-Criteria progress bars, AI Review Verdict    |
| `--rate-score-star`   | `#f59e0b` | `#fffbeb` / `rgba(245, 158, 11, 0.14)` | Star rating icons, moderate caution indicators                       |
| `--rate-risk-danger`  | `#f43f5e` | `#fff1f2` / `rgba(244, 63, 94, 0.14)`  | Seeding spam excluded (`include_in_rating = false`), Cons, Fake Sale |

The soft tints are the `-bg` tokens: `--rate-brand-bg`, `--rate-score-user-bg`, `--rate-score-expert-bg`, `--rate-score-star-bg`, `--rate-risk-danger-bg` (light value at `:root`, dark value inside `.rate-surface-dark`).

---

## 3. Typography & Numeric Discipline

### Font Stack

- **Primary UI & Editorial Copy (`--body-font-family` / `--heading-font-family`):**
  `'Inter'`, `'Plus Jakarta Sans'`, `'Noto Sans'`, system-ui, `-apple-system`, `'Segoe UI'`, sans-serif.
  _(Legacy `'Jost'` font is removed to eliminate the dated directory-template look)._
- **Scores, Telemetry & Spec Identifiers (`--rate-font-mono`):**
  `'JetBrains Mono'`, `'Fira Code'`, ui-monospace, SFMono-Regular, monospace with `font-variant-numeric: tabular-nums`.

### Typographic Scale

| Element                      | Size / Line-Height                        | Weight | Tracking   | Design Rule                                                             |
| :--------------------------- | :---------------------------------------- | :----- | :--------- | :---------------------------------------------------------------------- |
| **Display Hero**             | `clamp(1.85rem, 3.6vw, 2.85rem)` / `1.14` | `800`  | `-0.03em`  | High-contrast editorial headline on dark Obsidian canvas                |
| **Product H1 Title**         | `clamp(1.5rem, 2.5vw, 2.1rem)` / `1.2`    | `800`  | `-0.025em` | Clean device name without marketplace spam keywords                     |
| **Scoreboard Giant Numeral** | `2.25rem - 2.75rem` / `1.0`               | `800`  | `-0.04em`  | `tabular-nums`, paired with `/ 5.0` denominator & confidence            |
| **Section Heading (H2)**     | `1.25rem - 1.375rem` / `1.3`              | `700`  | `-0.015em` | Preceded by a subtle uppercase eyebrow pill (`0.72rem`, `0.06em`)       |
| **Spec Label / Value**       | `0.9375rem` (`15px`) / `1.5`              | `500`  | `0`        | Left label in `--rate-fg-secondary`, right value in `--rate-fg-primary` |
| **Telemetry / Micro Badge**  | `0.8125rem` (`13px`) / `1.35`             | `600`  | `0.02em`   | Pill radius `6px` (or `9999px` for status chips), `1px` border          |

---

## 4. Information Architecture: Product Detail Page (`/[category]/[slug]`)

To ensure Rate.vn is unmistakably a **Rating & Review Platform**, every Product Detail View across all 5 categories (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`) must follow this exact vertical hierarchy:

### 4.1 Above the Fold: The Rating & Review Command Card

1. **Left Column (4 cols) - Hardware Visual & Telemetry Identity:**
   - Clean white/slate studio frame (`object-fit: contain`), canonical `model_key` badge, category pill, and quick-jump anchor tabs (`#jreviews-section`, `#specs-section`, `#price-history-section`).
2. **Right Column (8 cols) - Dual Rating Scoreboard & AI Review Synthesis (THE CORE):**
   - **Dual Scoreboard Panel (`.rate-scoreboard-panel`):**
     - **Weighted Authentic User Score (`4.9 / 5.0`)**: Prominent Emerald/Dark badge showing total verified reviews vs. excluded seeding reviews.
     - **Rate.vn Lab Expert Score (`4.9 / 5.0`)**: Prominent Indigo badge with expert calibration status.
     - **5-Criteria Analytical Bars**: Horizontal progress bars (`0.0 - 5.0`, `tabular-nums`) for `Màn hình / Hiển thị`, `Hiệu năng`, `Camera / Cảm biến`, `Pin & Sạc`, and `Đáng tiền (Value)`.
   - **AI Review Verdict & Pros/Cons Grid:**
     - **Expert Verdict Summary** quote block.
     - Two-column **Ưu điểm thực tế (Pros)** (Emerald checkmarks) vs. **Nhược điểm cần lưu ý (Cons)** (Rose alerts) synthesized from verified buyers and lab testing.
   - **Primary Action Bar (Review-Centric CTAs):**
     - Primary button: **Đọc & Chấm điểm Review (`#jreviews-section`)** + **Viết đánh giá 5 tiêu chí**.
     - Secondary analytical actions: **So sánh đối đầu (`/compare`)**, **Kiểm định Link (`/inspect`)**, and **Theo dõi (`WatchlistQuickToggle`)**.
   - **Compact Neutral Market Reference Strip:**
     - A single, understated horizontal bar at the bottom of the card showing the reference market price range (`Giá tham khảo trung lập từ N nguồn kiểm định`) with a subtle link to `#price-history-section`. No flashy red discount banners.

### 4.2 Section #1 (Immediately Below Header): JReviews Community & Anti-Seeding Audit (`#jreviews-section`)

- Placed **first** in the page body so users immediately engage with community ratings, AI seeding flags, pros/cons, and the interactive 5-criteria review submission form.
- Includes filter tabs (`Tất cả`, `Review thật đã xác thực`, `Nghi vấn Seeding bị loại trừ`), helpful/report voting (`POST /api/reviews/[id]/vote`), and per-review AI confidence telemetry.

### 4.3 Section #2: 10-Group Canonical Technical Specifications (`#specs-section`)

- Renders all **10 canonical Field Groups** (`Display`, `Hardware`, `Camera`, `Battery`, `Design`, `Cellular`, `Connectivity`, `Multimedia`, `Availability`, `Regulatory`) in a unified **RTINGS/Linear two-column specification matrix**:
  - Clean slate card header with group index badge (`01` .. `10`).
  - Crisp `1px` row dividers, left column `38%` muted label, right column `62%` high-contrast tabular value.
  - Zero rainbow Bootstrap badges inside specification rows.

### 4.4 Section #3 (Bottom Appendix): Price History Audit & Neutral Merchant Telemetry (`#price-history-section` & `#offers-table`)

- Framed explicitly as **Kiểm định Lịch sử Giá & Độ Tin Cậy Gian Hàng (Price & Merchant Audit)**:
  - **90-Day Price History SVG Chart** to expose fake flash-sale markups before campaign days.
  - **Merchant Audit Table** showing `DOSafe Score`, `Review Risk`, `Stock Status`, and a muted, neutral verification link (`Đối chiếu nguồn ↗` using `.rate-btn-ghost` instead of a loud primary buy button).

---

## 5. Information Architecture: Homepage & Category Catalogs

### 5.1 Homepage (`/[locale]/page.tsx`)

- **Dark Obsidian Command Hero:** Focuses on **tra cứu giá thật và độ tin cậy gian hàng trước khi mua** (multi-criteria ratings, fake-review filtering and 10-group spec comparison).
- **Product Intelligence Cards (`.rate-product-card`):**
  - **Header Strip:** Brand + Category pill on the left; **Dual Rating Badge (`★ 4.9` User + `Lab 4.9`)** prominently on the right.
  - **Review Authenticity Pill:** Shows `94% Review thật` (Emerald) and `5 tiêu chí chấm điểm` above hardware pills.
  - **Clean Slate Hardware Pills:** Monochrome slate pills (`.rate-spec-pill`) for RAM/Storage, Chipset, Display/5G.
  - **Footer:** Reference price in neutral dark tabular numerals + primary link `Xem đánh giá & chấm điểm ->` + 1-tap `Compare` / `Watchlist` toggles.
- **No Legacy Brand Carousels:** `<BrandImage />` is permanently removed from the homepage.

---

## 6. Localization (i18n) & Content Rules

1. **Cookie-Based Unprefixed Routing (`localePrefix: 'never'`):**
   - Public URLs never include `/vi`, `/en`, or `/cs` slugs (`https://rate.vn/smartphones/iphone-16-pro-max-256gb`).
   - Switching language updates the `NEXT_LOCALE` cookie and refreshes the current URL in place.
2. **No Em-Dashes (`U+2014` or `U+2013`):**
   - Strictly forbidden across all UI copy, metadata, comments, and reports. Always use a standard hyphen `-`.
3. **No Fake Category Fallbacks:**
   - Never display smartphone-only defaults on Laptops, Tablets, Smartwatches, or Earbuds.
