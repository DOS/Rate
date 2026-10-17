# CriteriaBar

A 7px pill track with an indigo-to-emerald fill showing one of the five criteria scores (0.0 - 5.0).

## Use
- The five criteria in order: Màn hình / Hiển thị, Hiệu năng, Camera / Cảm biến, Pin & Sạc, Đáng tiền.
- Label left, `x.x / 5.0` right in tabular numerals; the fill width is score / 5.

## Consumer provides
`.rate-criteria-track` containing `.rate-criteria-fill` with an inline `width` percentage, plus the label row.
