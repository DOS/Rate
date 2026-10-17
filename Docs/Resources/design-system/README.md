# Rate.vn Design System

Source of the Rate.vn design system: `tokens.json` (colors in light and dark, type, spacing, radius, shadow, sizes), the brand book below, per-component guidelines and static previews under `components/`, and the icon and logo assets under `assets/`. DESIGN.md is the engineering rule book; this folder is the token and component inventory extracted from it and from `apps/web`. Previews expect a `tokens.css` compiled from `tokens.json` plus `components/bundle.css`.

Rate.vn is an independent product rating, anti-seeding review and technical audit terminal. Every screen should read like a product lab report (RTINGS, Linear, Wirecutter), never like an affiliate shopping portal. Build on an obsidian and slate monochrome foundation, draw structure with 1px hairlines, and spend color only on meaning.

## Principles

- **Rating and review first, never affiliate first.** Lead product pages with the dual score (authentic user score + expert lab score) and the AI-audited reviews. Never put a loud price box or a "Buy now" button above the fold; prices and merchants are evidence, placed at the bottom.
- **Monochrome plus semantic color.** Surfaces and text come from `rate-bg-*` and `rate-fg-*`. Color is telemetry, not decoration:
  - `rate-score-user` (emerald): authentic user score, pros, verified buyer, trust >= 85, verified price floor.
  - `rate-score-expert` (indigo): expert lab score, 5-criteria bars, AI-enriched specs.
  - `rate-score-star` (amber): star ratings, moderate seeding watch, minor price volatility.
  - `rate-risk-danger` (rose) and `rate-brand` (crimson): seeding spam excluded, cons, fake discount alert, and the brand focal mark.
- **No "Bootstrap rainbow soup".** Do not mix `bg-info`, `bg-warning`, `bg-primary`, `bg-success` utility fills or decorative emoji inside analytical headers. The sanctioned uses of Bootstrap status fills are the Deal Radar verdict (`bs-success`, `bs-danger`, `bs-warning-bg-subtle`) and, inside the dark scoreboard, the VS and battle badges (`bs-danger`) and rank chips (`bs-warning`).
- **Tabular density.** Every rating (`4.9 / 5.0`), criteria score, percentage (`92% Review thật`), hardware metric (`120 Hz`, `5000 mAh`) and price uses `font-variant-numeric: tabular-nums` (`.rate-tabular`, or `.rate-mono` for identifiers).
- **No legacy template artifacts.** The ListingHub template logos, brand carousels, red `bg-primary-2` banners and the Jost font are banned.

## Content fundamentals

- **Language.** Vietnamese is the default; English and Czech are full translations. Public URLs never carry a locale prefix.
- **Voice.** Expert, evidence-led, slightly combative toward fake sales and seeding. Name the method: "Chuẩn hóa 10 nhóm thông số GSMArena & PhoneArena, phát hiện nâng khống giá gốc và lọc bình luận Seeding bằng AI."
- **Casing.** Hero titles and CTAs use Title Case in Vietnamese ("Tra Cứu Giá Thật & Điểm Tín Nhiệm Trước Khi Mua", "Bàn Cân 10 Nhóm Thông Số"). Body copy is sentence case. Eyebrows are uppercase via CSS, not in the string.
- **Numbers carry units and denominators.** Write `4.9 / 5.0`, `9.6 / 10`, `-18%`, `Chênh 0.12/5.0`. Never a bare score.
- **Punctuation.** Never use em or en dashes; use a plain hyphen `-`. Use `->` or `→` only for link arrows.
- **CTAs are review-centric.** "Đọc & Chấm điểm Review", "Viết đánh giá 5 tiêu chí", "So sánh đối đầu", "Kiểm định Link", "Theo dõi". A merchant link is a muted "Đối chiếu nguồn ↗", never "Mua ngay".
- **Honest empty states.** Show nothing rather than an invented rating, review count, offer count or expert score.

## Visual foundations

### Color

- Page: `rate-bg-canvas`. Cards and tables: `rate-bg-surface` with a 1px `rate-border-subtle`. Wells, table headers and tracks: `rate-bg-elevated`.
- Text: `rate-fg-primary` for headings and values, `rate-fg-paragraph` for long copy, `rate-fg-secondary` for labels and descriptions, `rate-fg-muted` for metadata (24px+ or non-essential on `rate-bg-elevated` and on dark canvas, where it falls under 4.5:1).
- Obsidian sections (homepage hero, scoreboard, extension side panel) use `rate-bg-dark` in both themes, with `rate-fg-on-dark` and `rate-fg-on-dark-muted` text and `rate-border-dark` hairlines.
- The dark theme here is the app's `.rate-surface-dark` scope (`_custom.scss`): wrap an obsidian section in it and the `rate-bg-*`, `rate-border-*`, `rate-fg-*` and `-bg` tint tokens switch to their dark values, so cards, eyebrows, spec pills and score badges keep working inside it.
- Crimson text that must read on a surface uses `rate-crimson-text` (`bs-primary` in light, #ff6b6b in dark).
- `rate-brand` is a mark, not a text color on light grounds (3.7:1 on white). Crimson text uses `bs-primary` (4.7:1) or `bs-primary-text-emphasis` (6.3:1) on light grounds, and `rate-crimson-text` where it must also read inside `.rate-surface-dark`.
- Emerald, indigo and amber fills never carry small text directly; badges pair a soft tint (`rate-score-*-bg`) with a dark ink (`rate-score-*-ink`).
- Status always carries a word or icon as well as a color: emerald vs rose are told apart by the label ("Review thật" vs "Seeding bị loại").

### Type

- One sans family, `sans` (Inter 400-800, self-hosted by next/font in `src/lib/fonts.ts` with the Latin and Vietnamese subsets). Headings 600 by default with `-0.02em` tracking.
- `mono` (JetBrains Mono 500-700, next/font, not preloaded) applies only through `.rate-mono`; no component uses it yet. Deal Radar labels, scoreboard scores and deltas use Bootstrap `.font-monospace`, which is `system-mono` (SFMono-Regular, Menlo, Consolas).
- Scale: `display-hero` on the obsidian hero, `product-title` for the product H1, `score-numeral` for scoreboard numbers, `section-heading` under an `eyebrow-label` pill, `body` (15px) for copy, `spec-label` / `spec-value` in spec tables, `score-badge-label`, `spec-pill-label`, `micro-badge` for chips.
- The hero size is fluid, `clamp(2rem, 4.2vw, 3.25rem)`; the product H1 and score numerals are Bootstrap `.h2` (`calc(1.325rem + .9vw)`, 2rem from 1200px). The tokens hold the maximum. DESIGN.md asks for an 800-weight product title and score numeral; the app does not apply that yet.

### Spacing and layout

- Bootstrap 5.3 grid and spacers (`spacer-1` .. `spacer-5`). Cards pad `spacer-3` on mobile and `spacer-4` from md up; grids use `g-3` gutters.
- The obsidian hero pads `space-hero-top` / `space-hero-bottom` and centers a 10-of-12 column.
- Product detail: a 5-column hardware visual on the left (`col-lg-5`), the 7-column dual scoreboard on the right (`col-lg-7`); then reviews, then the 10-group spec matrix, then price history and merchant audit.

### Shape, borders and elevation

- Borders, not shadows. `shadow-card` is nearly invisible; only interactive cards lift (`shadow-card-hover`, 2px up) on hover.
- Radii: `radius-pill` for chips, eyebrows, criteria bars and most buttons (`rounded-pill` is the most used class in the app); `radius-card` for cards and the scoreboard; `radius-spec-group` for spec cards; `radius-badge` for score badges; `radius-spec-pill` for spec pills.
- Two gradients are part of the brand and live in `bundle.css`, not tokens: the dark scoreboard (`#0b0d11 → #121722 → #171e2e`, 145deg) and the criteria fill (`rate-criteria-from` → `rate-criteria-to`). The homepage hero adds two soft radial glows (crimson at 16%, indigo at 14%) over a `rate-bg-dark` to #141821 vertical gradient.

### Motion and states

- Transitions are short: 0.16s ease on cards, 0.4s on buttons. No decorative animation in analytical sections.
- Hover: buttons darken to `bs-primary-bg-dark`; outline and light buttons fill with `bs-primary`. Keyboard focus is a solid 2px `rate-focus-ring` outline on every link, button, `.btn` and form control (`:focus-visible`, offset 2px, 1px on inputs); mouse clicks on buttons and links show no ring. Inputs also switch their border to `bs-primary-border-subtle`. Never remove the ring with `outline: 0`.
- Disabled: keep the fill, drop opacity per Bootstrap defaults.

## Iconography

- Bootstrap Icons through `react-icons/bs` (outline by default, `-fill` variants for status). Most used: `shield-check` (trust), `check-circle-fill` (verified), `star-fill`, `shop`, `cpu`, `search`, `code-slash`, `exclamation-triangle-fill`, `shield-exclamation`, `bell-fill`, `arrow-left-right` (compare). The Icons group holds these as 16px SVGs.
- Icons inherit text color in the app; the stored SVGs are single-ink in `rate-fg-primary` (#0f172a). Recolor by CSS mask or inline SVG, not by `<img>`.
- Size icons to the text they sit beside (`fs-6`, 1em) with `spacer-1` between icon and label.
- Social marks in the footer use Font Awesome glyphs through `react-icons/fa` and `fa6`. Do not use emoji in analytical headers.

## Logo

- The brand mark is a `rate-brand` (#ff2e29) dot on a #12151a disc, radii 0.24 and 0.46 of the size: the same geometry as the extension icon, the favicon and `icon.svg`. The Logos group holds `rate-mark.svg` and the 128px and 48px PNGs.
- The wordmark is the mark followed by "Rate.vn" in `sans` 800 at 0.82 of the mark height, with a 0.4em gap (`<RateWordmark />`, see the Wordmark component). Use `tone="ink"` on light grounds and `tone="light"` on obsidian grounds, where the disc gets a white 16% hairline.
- Never use the ListingHub template logos, favicon or brand images.

## Not synced

- Fonts are self-hosted by next/font at build time; no font files are stored here.
- Components are static renditions of the app's CSS classes (`style.scss`, `_custom.scss`), not a built React bundle; `RadarBadge` and `RateWordmark` are shown by their markup.
- Not tokenized: the ListingHub template's remaining SCSS outside the Rate.vn v3.0 block and the hero's radial gradients.
