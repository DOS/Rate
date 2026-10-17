# Wordmark

The Rate.vn wordmark: the brand mark (a `rate-brand` dot on a #12151a disc) followed by "Rate.vn" in `sans` 800 (`src/components/brand/RateWordmark.tsx`).

## Use
- Navbar, mobile menu and footer whenever no uploaded `logoUrl` is set; the app icon and favicon use the mark alone.
- `tone="ink"` on `rate-bg-canvas` / `rate-bg-surface`, `tone="light"` on `rate-bg-dark` (adds a 16% white hairline around the disc).
- `size` is the mark height in px (30 in the navbar and footer, 26 in the mobile menu); the name is 0.82 of it.

## Consumer provides (React props)
- `tone?: 'ink' | 'light'` (default `ink`), `size?: number` (default 28), `className?: string`. Wrap it in the home link and give that link `aria-label="Rate.vn"`.

## Don't
- Don't recolor the dot, set the name in another face, or put the ListingHub template logo back.
