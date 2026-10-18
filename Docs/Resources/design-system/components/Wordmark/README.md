# Wordmark

The Rate.vn wordmark: the official split star followed by "Rate.vn" in `sans` 800 (`src/components/brand/RateWordmark.tsx`).

## Use

- Navbar, mobile menu and footer whenever no uploaded `logoUrl` is set; favicon and app icons use the star alone.
- `tone="ink"` on light grounds, `tone="light"` on `rate-bg-dark`.
- `size` is the star height in px (30 in the navbar and footer, 26 in the mobile menu); the name is 0.82 of it.

## Consumer provides (React props)

- `tone?: 'ink' | 'light'` (default `ink`), `size?: number` (default 28), `className?: string`. Wrap it in the home link with `aria-label="Rate.vn"`.

## Don't

- Don't redraw, recolor or stretch the star, or put the ListingHub or AhReview logos back.
