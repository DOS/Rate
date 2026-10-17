# ScoreBadge

The dual rating badge: emerald for the authentic user score, indigo for the expert lab score.

## Use
- Always show both side by side when both exist (`★ 4.9` user, `Lab 4.9` expert), user first.
- Never render a badge for a score that does not exist; show nothing instead.

## Consumer provides
`<span class="rate-score-badge-user">` or `<span class="rate-score-badge-expert">` with the score to one or two decimals.
