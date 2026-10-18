# RateCard

The base surface: white card, 1px subtle hairline, 14px radius, near-invisible shadow; `.rate-card-interactive` lifts on hover.

## Use
- Every product card, review container and panel on the light canvas.
- Add `.rate-card-interactive` only when the whole card is a link.

## Consumer provides
A block with `.rate-card` (and optionally `.rate-card-interactive`) and its own padding (`spacer-3`, `spacer-4` from md up).

## Don't
- Don't add a colored left border or a heavy shadow; structure comes from `rate-border-subtle`.
