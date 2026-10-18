# RadarBadge

The only place that decides how a Deal Radar signal looks: a monospace pill whose tone follows the verdict (`apps/web/src/components/radar/RadarBadge.tsx`).

## Use
- `genuine_deal` → `bs-success` fill, white text. `fake_sale_trap` → `bs-danger` fill, white text. A price spread only → `bs-warning-bg-subtle` with dark text and a subtle border.
- Labels come from `radarLabel()` and keep their leading glyph (🔥, 🚨, 📊) and one-decimal percentage.
- Renders nothing when the product has no signal; spread-only badges hide under `minSpreadPct` (default 10).

## Consumer provides (React props)
- `signal: RadarSignal` (required), `minSpreadPct?: number`, `className?: string`, `emptyFallback?: ReactNode`, `style?: CSSProperties`.
