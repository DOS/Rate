# Social

The default share card for rate.vn links (`apps/web/public/img/rate-og.png`, 1200x630 PNG), set as `og:image` and `twitter:image` by the locale layout.

- Ground: `rate-bg-dark` to #141821 with the hero's crimson (16%) and indigo (14%) radial glows.
- Top: the wordmark (72px mark, "Rate.vn" in `sans` 800). Middle: the hero headline with the `rate-crimson-text` highlight and the hero subtitle in `rate-fg-on-dark-muted`. Bottom: three pills in the score inks (#34d399, #a5b4fc, #fbbf24).
- Source: `apps/web/scripts/og-image/rate-og.html`, rendered at 1200x630 after the fonts load. Regenerate it when the headline, palette or wordmark change.
