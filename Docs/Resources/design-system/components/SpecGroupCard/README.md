# SpecGroupCard

One of the ten canonical spec groups as a two-column matrix: slate header with a two-digit index, muted labels left, tabular values right.

## Use
- The spec section renders all ten groups in order (Display, Hardware, Camera, Battery, Design, Cellular, Connectivity, Multimedia, Availability, Regulatory).
- No colored badges inside rows; a missing value is omitted, never guessed.

## Consumer provides
`.rate-spec-group-card` > `.rate-spec-group-header` (title + index) and `table.rate-spec-table` rows of `td.rate-spec-label` / `td.rate-spec-value`.
