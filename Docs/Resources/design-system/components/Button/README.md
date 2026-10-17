# Button

Bootstrap 5.3 `.btn` with the Rate theme overrides; review-centric actions, most often as small pills.

## Use
- Primary (`.btn-primary`): the one review action per view ("Đọc & Chấm điểm Review", "Viết đánh giá 5 tiêu chí"). Never "Mua ngay".
- Outline primary / light primary: secondary analytical actions ("So sánh đối đầu", "Kiểm định Link").
- Outline dark on light grounds, outline light and outline warning on `rate-bg-dark` (scoreboard links).
- Add `.rounded-pill` and `.btn-sm` for in-card actions; the default 56px height is for hero search and forms.

## Consumer provides
A `<button>` or `<a>` with `.btn` + one variant + optional size (`.btn-sm`, `.btn-md`, `.btn-xs`) and `.rounded-pill`; label text, optional leading Bootstrap icon.

## Notes
- Hover darkens to `bs-primary-bg-dark`; outline and light variants fill with `bs-primary`.
- Crimson text on outline and light variants uses `rate-crimson-text` (bs-primary in light, #ff6b6b in dark).
- Source pair kept: `bs-primary` text on `bs-primary-bg-subtle` (light primary) is about 4.3:1, under 4.5:1 for small text.
