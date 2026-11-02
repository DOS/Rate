# DOS-Me proposal: review value score and the completeness weight (P6)

DOS/Rate#1547, phase P6 of the criteria ratings design (DOS/Rate#1531,
`Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html` section 6; D6 and D7
approved by JOY on 2026-10-31). Status: **proposal, nothing applied.** It goes
through DOS-Me like P2 and P3, after JOY approves it.

| File                                                | What                                                    |
| --------------------------------------------------- | ------------------------------------------------------- |
| `2026-11-02-dos-me-review-value-score.sql`          | the migration: one transaction, then a refresh          |
| `2026-11-02-dos-me-review-value-score-verify.sql`   | read-only checks, V1 to V7 return 0 (V8 is information) |
| `2026-11-02-dos-me-review-value-score-rollback.sql` | puts P2's function back and removes the lift            |
| `scripts/test-review-value-proposal.mjs`            | replays it all on PostgreSQL in Docker                  |

## What it does

### D7: the number is private, the tier is public

- **`rate.review_values`** (new) holds each review's value score and breakdown.
  - Row level security is on. `anon` and `authenticated` have no access at
    all.
  - `service_role` has full access; `rate_worker` can read it.
  - Only `rate.store_review_values` writes it.
- **`rate.reviews.value_tier`** (new, nullable) is the public tier: `basic`,
  `complete` or `excellent`. It is NULL when a review is not scored, or is
  gated.
- **P2's `rate.reviews.value_score` and `value_breakdown` stay empty.** These
  columns are on the publicly readable table, so a CHECK
  (`reviews_value_private`) keeps any number from landing there. They can be
  dropped in a later clean-up.
- **`rate.my_review_values(review_ids)`**, for `authenticated` users: the
  writer reads the number and breakdown of their own reviews. It matches the
  caller through `rate.review_authors` and takes at most 100 ids per call.
  - Another user gets nothing; `anon` cannot call it.
  - The web uses it for the writer's hint ("Thêm ưu nhược cho Pin để lên bậc
    Đầy đủ").
- **Sorting reviews by value** runs on the server with `service_role`. Pages
  receive the order and the tier, never the number.

### D6: the weight

- **`rate.review_completeness_factor(breakdown)`** computes
  `1 + 0.25 x weightCompleteness / 35`, from x1.00 to x1.25, at four decimals.
  - It equals `completenessWeightFactor` in
    `packages/shared-data/src/rules/review-value.ts` (DOS/Rate#1579); the replay
    compares the two for every value.
  - `weightCompleteness` drops the photo of a review without pros and cons, so
    a marketplace review keeps its weight (design 6.2).
- **`rate.master_rating_extras`** joins the private values. Each review's
  weight becomes `LEAST(3, helpfulness_weight x factor)`; nothing else in P2's
  body changes.
- **Statement-level triggers on `rate.review_values`** refresh a master when a
  review's factor changes. A rescore with the same completeness refreshes
  nothing. P2's triggers on `rate.reviews` are not touched.

### The writer: `rate.store_review_values(p_values)`

- Callable by `rate_worker` (the scoring job) and `service_role`.
- Takes up to 1000 `{id, score, breakdown}` rows and 2 MB per call.
- It accepts only a breakdown the shared module could produce:
  - exactly its eleven keys;
  - each part one of its possible values;
  - completeness a step of 5;
  - `weightCompleteness` 5 less exactly for a photo without pros and cons;
  - the score equal to the parts' sum;
  - `tier` by the module's rule, and `gaps` from the known list;
  - a gated review all 0, with no tier.
- It writes the number to `rate.review_values` and the tier to
  `rate.reviews.value_tier`. It locks the reviews in id order first.
- One bad row refuses the whole call (22023, with the row's index).
- `rate_worker` has no direct write to `rate.review_values`. The old direct
  path, its table grant on `rate.reviews`, cannot carry a number either,
  because of the CHECK.

### Locks and refresh

- The ALTER TABLEs on `rate.reviews` (one nullable column, two NOT VALID
  CHECKs) wait at most 5 s for their lock. Re-run the file if it times out.
- After the transaction, a refresh brings the masters of already stored values
  back in line. It changes nothing on the first apply, because the table is
  new.

**Rating impact at apply time: none.** The values table starts empty, and a
review without a row has factor 1. Ratings move only as the scoring job stores
values, each review by at most +25% weight.

## Order and dependencies

- **Needs:** P2 (`20261101120000`) and P3 (`20261102090000`). Both are in
  production.
- **Shared module:** DOS/Rate#1579 must be merged first, because the replay
  test builds the shared module.
- **After the apply:**
  - The scoring job in the importer (a follow-up) computes `reviewValue` for
    each review and calls `store_review_values` as `rate_worker`, one worker
    at a time.
  - The web sorts on the server and shows the tier publicly. It shows the
    writer their own number through `my_review_values`.
- **The SQL repeats the module's constants**: 35, 0.25, the steps, the parts'
  values, the tier thresholds, the gap names and the keys.
  - A change to the module that changes its output needs a DOS-Me migration
    first, with a `REVIEW_VALUE_VERSION` bump.
  - Until then the writer refuses the new rows: it fails closed.
  - The replay stores the module's output over a grid of 448 inputs, so CI
    catches a drift.

## Decisions

1. **D7 is applied as approved:** the tier is public and the number is only
   for the writer.
2. **Who can lift a review**, accepted by the PO as recommended.
   - The database cannot check a claimed completeness against the review's
     text, lines and criteria.
   - So a caller with `rate_worker` can, through the writer, give any review
     up to +25% weight.
   - `rate_worker` can already set `helpfulness_weight` up to 3 on crawled
     reviews, which moves a rating much further.
3. **Side effects of the lift**, for information:
   - A lifted review also counts toward D9's criterion threshold
     (`LEAST(1, w)`), so a lift can make a criterion score appear sooner.
   - `rating_weight_sum`, which is public, grows by the same amount.
   - `user_rating_weighted`, the fallback rating, stays on the plain weight.

## Apply

1. **Before the apply**, run V5 of the verify file alone as a baseline, so
   drift that P2 already has is not mistaken for P6.
2. Copy the `.sql` into DOS-Me `supabase/migrations/` with a new timestamp,
   and the verify and rollback files into `scripts/ops/`, as for P3.
3. After the beta and production applies, run the verify file read-only as
   `postgres` or `service_role`. V1 to V7 must return 0. V5 recomputes every
   master, so run it off-peak.
4. **Rollback:** the rollback file, safe to run twice. Stop the scoring job
   first. It runs in two transactions:
   - first, P2's rating function goes back byte for byte, the triggers are
     dropped, and the masters the values touched are refreshed;
   - then the functions, `rate.review_values`, the tier column and the CHECKs
     are dropped, under a 5 s lock timeout.

   The stored values are lost; the scoring job recomputes them after a
   re-apply. Afterwards, run V5. A master it counts was held by another
   transaction during the refresh and needs
   `SELECT rate.refresh_master_rating_extras(id)`.

## Tests (local, Docker)

`node scripts/test-review-value-proposal.mjs` (after building
`@repo/shared-data`):

- the proposal applied twice with no rating change;
- the factor's parity with the shared module for 0 to 35, and for junk;
- the writer accepting the module's output over a grid of 448 inputs;
- the module's values stored as `rate_worker` (a community review included),
  and the lifted rating equal to the module's formula, cap included;
- D7:
  - `anon` reads the tier;
  - `anon` and `authenticated` are refused on `rate.review_values`;
  - P2's number columns stay empty;
  - the writer reads their own number and nobody else's;
  - `anon` cannot call the reader, and the id cap holds;
- a re-store that changes nothing, and a rescore with the same completeness
  that refreshes nothing;
- the refusals, where nothing is written:
  - not an array, too many rows or bytes;
  - a bad id, version, key, type, tier, gap or part;
  - a score that is not the sum;
  - a gated review not scored 0;
  - the photo rule broken in either direction;
- direct writes stopped:
  - `rate_worker` on `rate.review_values`;
  - a number on `rate.reviews`;
  - the CHECKs;
- V1 to V7;
- the rollback twice: the lift and every object are gone, and P2 still
  refreshes;
- the proposal again: no change until values are stored, then the lift.
