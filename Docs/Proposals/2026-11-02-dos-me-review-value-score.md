# DOS-Me proposal: review value score and the completeness weight (P6)

DOS/Rate#1547, phase P6 of the criteria ratings design (DOS/Rate#1531,
`Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html` section 6; D6 and D7
approved by JOY on 2026-10-31). Status: **proposal, nothing applied.** It goes
through DOS-Me like P2 and P3, after JOY approves it.

| File                                                | What                                                    |
| --------------------------------------------------- | ------------------------------------------------------- |
| `2026-11-02-dos-me-review-value-score.sql`          | the migration, one transaction                          |
| `2026-11-02-dos-me-review-value-score-verify.sql`   | read-only checks, V1 to V7 return 0 (V8 is information) |
| `2026-11-02-dos-me-review-value-score-rollback.sql` | puts P2's functions back and removes the lift           |
| `scripts/test-review-value-proposal.mjs`            | replays it all on PostgreSQL in Docker                  |

## What it does

P2 already added `rate.reviews.value_score` and `value_breakdown` (both NULL
everywhere today). This migration makes them count for the rating and gives
them one writer:

- **`rate.review_completeness_factor(value_breakdown)`**: D6's
  `1 + 0.25 x weightCompleteness / 35`, from x1.00 to x1.25, at four decimals.
  - It is equal to `completenessWeightFactor` in
    `packages/shared-data/src/rules/review-value.ts` (DOS/Rate#1579); the replay
    compares the two for every value.
  - `weightCompleteness` is the review's completeness, less the photo of a
    review without pros and cons. A marketplace review keeps its weight even
    with photos (design 6.2 and the issue's acceptance).
- **`rate.master_rating_extras`**: each review's weight becomes
  `LEAST(3, helpfulness_weight x factor)`. Nothing else in P2's body changes.
- **`rate.reviews_refresh_rating_extras`**: a change of the factor refreshes
  the master, as a change of the weight does. Storing a new score with the
  same completeness refreshes nothing.
- **`rate.store_review_values(p_values)`**: the writer, for the scoring job
  (`rate_worker`) and `service_role`.
  - It takes up to 1000 `{id, score, breakdown}` rows.
  - It checks each breakdown has the shared module's shape: version 1, the
    five parts within their maximums, completeness a step of 5,
    `weightCompleteness` equal to it or 5 less, the score equal to the sum,
    and a gated review scored 0.
  - It writes them in one statement, so each master refreshes once.
  - One bad row refuses the whole call (22023, with the row's index).
- **Two NOT VALID CHECKs** on the breakdown's shape. Every row is NULL today,
  and V6 checks them all.

**Rating impact at apply time: none.** No breakdown is stored yet, and a
missing one has factor 1. Ratings move only as the scoring job stores values,
each review by at most +25% weight.

## Order and dependencies

- **Needs:** P2 (`20261101120000`) and P3 (`20261102090000`). Both are in
  production.
- **Shared module:** DOS/Rate#1579 must be merged first, because the replay
  test builds the shared module.
- **After the apply:** the scoring job in the importer (a follow-up) computes
  `reviewValue` for each review and calls `store_review_values` as
  `rate_worker`. The web then sorts by `value_score` and shows the tier.

## Decisions for JOY

1. **D7 and the public API.** `rate.reviews` is publicly readable, so
   `value_score` and `value_breakdown` can be read through the API even
   though the web shows only the tier.
   - Hiding them needs one of these:
     - column grants, which break the `select=*` reads of reviews;
     - moving the number to a private table.
   - **Recommendation:** accept it for now. D7 is about what pages show; a
     separate private table can come later if the number gets gamed.
2. **The job writes community reviews too.**
   - `rate_worker` cannot update community reviews directly, by policy.
     Through this function it can write their value, so the job scores every
     review the same way.
   - The worst a wrong value can do is +25% weight on that review, and only
     with a shape the module could produce.
   - **Recommendation:** accept.

## Apply

1. Copy the `.sql` into DOS-Me `supabase/migrations/` with a new timestamp,
   with the verify and rollback files in `scripts/ops/`, as for P3.
2. After the beta and production applies, run the verify file read-only:
   V1 to V7 must return 0.
3. **Rollback:** the rollback file, safe to run twice.
   - It puts back P2's functions byte for byte, drops the factor, the writer
     and the CHECKs, and refreshes the masters a stored breakdown touched.
   - The stored values stay (they are P2's columns) and no longer count.

## Tests (local, Docker)

`node scripts/test-review-value-proposal.mjs` (after building
`@repo/shared-data`):

- the proposal twice with no rating change;
- the factor's parity with the shared module for 0 to 35 and for junk;
- the module's values stored as `rate_worker` (a community review included),
  and the lifted rating equal to the module's formula, cap included;
- a re-store that changes nothing, and a rescore with the same completeness
  that refreshes nothing;
- the refusals, in which nothing is written:
  - not an array, too many rows;
  - a bad id, version, type or range;
  - a score that is not the sum;
  - a gated review not scored 0;
- the grants (`anon` and `authenticated` refused) and the CHECKs;
- V1 to V7;
- the rollback twice (the lift is gone, the values stay, P2 still refreshes),
  then the proposal again.
