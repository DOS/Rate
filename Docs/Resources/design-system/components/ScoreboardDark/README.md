# ScoreboardDark

The obsidian panel for head-to-head battles and the dual scoreboard: a 145deg dark gradient, 1px white-10% hairline, 14px radius.

## Use
- Homepage "Kèo Đối Đầu" battles and the product dual scoreboard. One per section.
- Inner tiles use `rgba(255,255,255,0.05)` fills with `rgba(255,255,255,0.12)` borders and `radius-xl`.
- Scores inside are Bootstrap `.font-monospace` (`system-mono`) in `text-warning` (`bs-warning`) with their `/5.0` denominator. The homepage panel also carries `rounded-4` (`radius-xl`, 1rem).

## Consumer provides
A block with `.rate-scoreboard-dark` plus padding; text uses `rate-fg-on-dark` / `rate-fg-on-dark-muted`.
