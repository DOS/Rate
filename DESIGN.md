# 🎨 Rate.vn Design System & Frontend Engineering Guidelines (DESIGN.md)

> **Version:** 2.0.0  
> **Target Audience:** Frontend Engineers, UI/UX Designers, AI Coding Agents  
> **Core Concept:** _The Transparent Product Intelligence, Price Audit & Anti-Seeding Engine_  
> **Aesthetic DNA:** Linear-clean • RTINGS-analytical •CamelCamelCamel-data-dense • DOS Ecosystem Dark-First Precision

---

## 1. 🌟 Design Philosophy & Brand Identity

**Rate.vn** (`DOS/Rate`) is an independent, AI-powered Product Intelligence & E-Commerce Verification Platform. Unlike cluttered affiliate marketplaces that push fake flash-sale banners, Rate.vn is built like a **financial-grade product terminal**: high-trust, evidence-backed, scannable, and zero-fluff.

### Core Design Principles

1. **Evidence First, Zero Fake Urgency:** Never use manipulative countdown timers or fake strikethrough prices. Every claim (Trust Score, Fake Discount Warning, Seeding Penalty, 10-Group Specs) must display verifiable telemetry (`tabular-nums`, confidence badges, merchant observation counts).
2. **High-Density Analytical Scannability:** Inspired by **RTINGS**, **PhoneArena**, and **Linear**. Users comparing 4 devices across 10 canonical spec groups (`display`, `hardware`, `camera`, `battery`, `design`, `cellular`, `connectivity`, `multimedia`, `availability`, `regulatory`) must be able to scan winners, deltas, and lowest-ever prices in under 3 seconds.
3. **Dual-Surface Precision (Dark Obsidian Header/Hero + Crisp Analytical Cards):**
   - **Dark Surface (`#0f1113` / `#14171c`):** Used for the global navigation bar, hero command center, developer API playground, and executive HTML reports.
   - **Light Analytical Canvas (`#f8f9fc` / `#ffffff`):** Used for high-density specification matrices, multi-merchant offer tables, and SVG historical price charts to maximize daytime readability.
4. **Signature DOS Crimson Accent (`#FF2E29` / `#e11d48`):** Primary brand action color, paired with semantic verification tokens (Emerald for verified authentic/all-time-low, Amber for price volatility/seeding watch, Rose for fake-discount/spam alerts).
5. **Universal Accessibility & Responsive Ergonomics (WCAG 2.1 AA):** Minimum 4.5:1 contrast ratio, keyboard-navigable command palettes and drawers, sticky comparison headers on mobile (`360px`) through ultra-wide (`1920px`).

---

## 2. 🎨 Color Tokens & Semantic Palette

All new frontend components and design-system primitives must use semantic tokens rather than arbitrary inline colors.

### 2.1 Brand & Accent Tokens

| Token              | Hex       | Primary Usage                                                                    |
| :----------------- | :-------- | :------------------------------------------------------------------------------- |
| `--rate-brand-50`  | `#fff1f2` | Subtle crimson tint for active pills, price-watch badges, and highlighted states |
| `--rate-brand-100` | `#ffe4e6` | Border highlights on active comparison cards                                     |
| `--rate-brand-500` | `#ff2e29` | **DOS Signature Crimson** - Primary brand mark, focal accents, active indicators |
| `--rate-brand-600` | `#e11d48` | **Primary CTA Buttons**, primary links, active filter chips                      |
| `--rate-brand-700` | `#be123c` | Button hover/pressed states                                                      |

### 2.2 Surface & Neutral Tokens

| Role                                    | Dark Surface (`.theme-dark` / Hero / Reports) | Light Analytical Canvas (Default App) |
| :-------------------------------------- | :-------------------------------------------- | :------------------------------------ |
| **Page Canvas (`--bg-canvas`)**         | `#0f1113` (Obsidian Carbon)                   | `#f8f9fc` (Cool Alabaster)            |
| **Elevated Card (`--bg-surface`)**      | `#16191e` (Elevated Slate)                    | `#ffffff` (Pure White)                |
| **Subtle Surface (`--bg-muted`)**       | `#1e2229`                                     | `#f1f4f9`                             |
| **Border / Hairline (`--border-line`)** | `rgba(255, 255, 255, 0.08)` / `#262b33`       | `#e2e8f0` / `rgba(15, 23, 42, 0.08)`  |
| **Text - Primary (`--fg-primary`)**     | `#f8fafc`                                     | `#0f172a`                             |
| **Text - Secondary (`--fg-secondary`)** | `#94a3b8`                                     | `#475569`                             |
| **Text - Muted (`--fg-muted`)**         | `#64748b`                                     | `#64748b`                             |

### 2.3 Verification & Telemetry Semantic Tokens

- **Authentic / Verified Deal (`--status-authentic`):** Emerald `#10b981` (background `#ecfdf5` light / `rgba(16, 185, 129, 0.12)` dark) - Used for `authentic_review_count`, `isLowestEver`, and `status: 'authentic_discount'`.
- **Caution / Moderate Seeding (`--status-warning`):** Amber `#f59e0b` (background `#fffbeb` light / `rgba(245, 158, 11, 0.12)` dark) - Used for minor price fluctuation or mixed review sentiment.
- **Fake Discount / Seeding Alert (`--status-danger`):** Rose `#f43f5e` (background `#fff1f2` light / `rgba(244, 63, 94, 0.14)` dark) - Used for inflated list prices (`fakeDiscountCount > 0`) and filtered spam/seeding reviews (`include_in_rating = false`).
- **Expert / AI Intelligence (`--status-ai`):** Indigo `#6366f1` (background `#eef2ff` light / `rgba(99, 102, 241, 0.12)` dark) - Used for `expert_rating`, 10-group AI enrichment badges, and model keys.

---

## 3. 📐 Typography & Data Formatting

### Font Stack

- **UI & Editorial Copy (`--font-sans`):** `'Inter'`, `'Plus Jakarta Sans'`, system-ui, `-apple-system`, `'Segoe UI'`, Roboto, sans-serif (full Vietnamese diacritics support required).
- **Prices, Spec Numbers, Model Keys & Telemetry (`--font-mono`):** `'JetBrains Mono'`, `'Fira Code'`, ui-monospace, SFMono-Regular, monospace with `font-variant-numeric: tabular-nums`.

### Typographic Hierarchy

| Level                      | Size / Line-Height                      | Weight | Tracking   | Usage                                                           |
| :------------------------- | :-------------------------------------- | :----- | :--------- | :-------------------------------------------------------------- |
| **Display Hero**           | `clamp(2rem, 4.2vw, 3.25rem)` / `1.12`  | `800`  | `-0.03em`  | Homepage Hero, Category Command Header                          |
| **Page Title (H1)**        | `clamp(1.5rem, 2.8vw, 2.25rem)` / `1.2` | `800`  | `-0.025em` | Product Detail Title, Workspace Header (`/compare`, `/inspect`) |
| **Section Heading (H2)**   | `1.25rem - 1.5rem` / `1.3`              | `700`  | `-0.015em` | 10-Group Specs Header, Price History Header, JReviews Header    |
| **Group Card Title (H3)**  | `1rem` (`16px`) / `1.4`                 | `700`  | `-0.01em`  | Individual Spec Group Title (`1. Màn hình (Display)`, etc.)     |
| **Body / Spec Value**      | `0.875rem` (`14px`) / `1.55`            | `500`  | `0`        | Spec values, review content, merchant offer rows                |
| **Micro / Telemetry Pill** | `0.75rem` (`12px`) / `1.35`             | `600`  | `0.02em`   | Platform badges, `model_key`, seeding flags, discount %         |

### Mandatory Numeric Formatting Rules

1. All prices (`min_price`, `max_price`, `lowestEverPrice`), scores (`4.8 / 5.0`, `88/100`), and hardware specs (`120 Hz`, `5000 mAh`, `8 GB / 256 GB`) **must** use `tabular-nums` so columns align vertically in tables and cards.
2. Vietnamese currency is formatted as `XX.XXX.XXX ₫` (`toLocaleString('vi-VN') + ' ₫'`).

---

## 4. 🧩 Core Component Patterns

### 4.1 Product Intelligence Cards (Catalog & Related Competitors)

Every product card across Homepage, Category Catalogs (`/smartphones`, `/tablets`, `/laptops`, `/smartwatches`, `/earbuds`), and Competitor Strips must surface 5 non-negotiable signals without clutter:

1. **Top Trust Strip:** Brand badge + `★ Weighted User Rating` (anti-seeding filtered) + `🔬 Expert Score` (when available).
2. **Visual Thumbnail Container:** Clean `180px - 220px` padded container with `object-fit: contain` (never crop device hardware).
3. **Key Hardware Pills:** Up to 3 real hardware badges (`RAM/Storage`, `Chipset`, `5G` or `Screen`) derived from actual data (never hardcoded placeholder strings).
4. **Price & Merchant Telemetry:** Lowest verified price in bold crimson/dark tabular numerals + merchant count (`N sàn`).
5. **1-Tap Utility Footer:** Instant `⚖️ So sánh` (`CompareQuickToggle`), `🔔 Canh giá` (`WatchlistQuickToggle`), and `🔍 Kiểm định` (`/inspect?q=<slug>`).

### 4.2 10-Group Specification Matrix (`ProductSpecifications`)

Both the Product Detail View and the `/compare` Workspace must render all **10 canonical Field Groups** defined in `@repo/shared-data`:

1. `1. Màn hình (Display)` (`size_inch`, `type`, `resolution`, `refresh_rate_hz`, `ppi`, `protection`, `features`)
2. `2. Phần cứng & Hiệu năng (Hardware)` (`chipset`, `cpu`, `gpu`, `ram_gb`, `storage_gb`, `storage_expansion`, `os`)
3. `3. Máy ảnh (Camera - PhoneArena Split Architecture)` (`rear_setup`, `main_camera`, `second_camera`, `third_camera`, `fourth_camera`, `front_camera`, `flash`, `video_recording`)
4. `4. Pin & Sạc (Battery)` (`capacity_mah`, `type`, `charging`, `fast_charging_w`, `reverse_charging`)
5. `5. Thiết kế & Độ bền (Design)` (`dimensions`, `weight_g`, `materials`, `build`, `resistance`, `biometrics`, `keys`, `colors`)
6. `6. Mạng Di động & 5G (Cellular)` (`has_5g`, `technology`, `data_speed`, `sim_type`, `volte`, `vowifi`, `bands_5g`, `bands_4g`)
7. `7. Kết nối & Cảm biến (Connectivity)` (`wlan`, `bluetooth`, `usb`, `nfc`, `location`, `sensors`, `other`)
8. `8. Âm thanh & Đa phương tiện (Multimedia)` (`loudspeaker`, `headphone_jack_35mm`, `audio_features`)
9. `9. Phát hành & Giá niêm yết (Availability)` (`announced`, `status`, `prices_msrp`)
10. `10. Pháp lý, Chứng nhận & SAR (Regulatory)` (`certifications`, `fcc_approval`, `sar_head`, `sar_body`, `sar_simultaneous`)

### 4.3 Multi-Platform Trust & Link Inspector (`/inspect` & Browser Extension MV3)

- Supports all **10 e-commerce & retail platforms**: Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, Thế Giới Di Động, FPT Shop, Hoàng Hà Mobile, Di Động Việt, Phong Vũ.
- Always displays a 3-pillar verdict:
  1. **Real vs. Fake Sale Audit** (comparing current price against 90-day `price_history` average & lowest-ever floor).
  2. **Review Authenticity Breakdown** (authentic buyer reviews vs. AI-flagged seeding/coin-spam reviews).
  3. **Cross-Merchant Arbitrage Table** (showing if another verified retailer sells the exact `model_key` cheaper).

---

## 5. 🌐 Localization (i18n) & Content Rules

1. **Supported Locales (`vi`, `en`, `cs`):**
   - Route localized links through `@/lib/navigation` (`Link`, `useRouter`, `usePathname`) so `/vi`, `/en`, and `/cs` prefixes remain consistent.
   - Use `@/lib/rate-i18n` (`normalizeRateLocale`, `getRateShellCopy`) for shared shell, navigation, and metadata strings.
2. **No Em-Dashes (`—` or `–`):**
   - Strictly forbidden across all UI copy, metadata, comments, and reports. Always use a standard hyphen `-`.
3. **No Fake Category Fallbacks:**
   - Never display smartphone-only defaults (such as `'Apple A-Series'` or `'48 MP'`) on Laptops, Tablets, Smartwatches, or Earbuds when a field is absent. Derive values cleanly from `key_specs` and `specifications`, or display a clean category-appropriate fallback (`'-'` or `'Đang cập nhật'`).

---

## 6. 🚫 Strict "DON'Ts" for AI Agents & Engineers

- ❌ **DO NOT** use heavy shadows, neon rainbow gradients, or generic directory-template filler text (e.g., "Lorem ipsum", fake restaurant/hotel listings from legacy templates).
- ❌ **DO NOT** collapse the 10 canonical specification groups into fewer boxes or hide `second_camera`, `third_camera`, `fourth_camera`, `connectivity`, `availability`, or `regulatory` data.
- ❌ **DO NOT** hardcode locale-breaking `<a href="/...">` tags for internal navigation; always use `<Link>` from `@/lib/navigation` (except for in-page `#anchor` jumps).
- ❌ **DO NOT** ship any UI view without verifying mobile (`360px`), tablet (`768px`), and desktop (`1280px+`) layout integrity and passing `pnpm --filter @repo/web typecheck` + `pnpm --filter @repo/web build`.
