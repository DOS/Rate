# DOS-Me proposal: review value score and the completeness weight (P6)

DOS/Rate#1547, phase P6 of the criteria ratings design (DOS/Rate#1531,
`Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html` section 6; D6 and D7
approved by JOY on 2026-10-31). Status: **proposal, nothing applied.** It goes
through DOS-Me like P2 and P3, after JOY approves it.

| File                                                | What                                                    |
| --------------------------------------------------- | ------------------------------------------------------- |
| `2026-11-02-dos-me-review-value-score.sql`          | the migration: one transaction, then a refresh          |
| `2026-11-02-dos-me-review-value-score-verify.sql`   | read-only checks, V1 to V7 return 0 (V8 is information) |
| `2026-11-02-dos-me-review-value-score-rollback.sql` | puts P2's functions back and removes the lift           |
| `scripts/test-review-value-proposal.mjs`            | replays it all on PostgreSQL in Docker                  |

## What it does

P2 already added `rate.reviews.value_score` and `value_breakdown` (both NULL
everywhere today). This migration makes them count for the rating and adds a
checked writer:

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
- **`rate.store_review_values(p_values)`**: the writer for the scoring job
  (`rate_worker`) and `service_role`.
  - It takes up to 1000 `{id, score, breakdown}` rows and 2 MB.
  - It accepts only a breakdown the shared module could produce:
    - its eleven keys; the parts within their values;
    - completeness a step of 5, and `weightCompleteness` 5 less exactly for a
      photo without pros and cons;
    - the score equal to the sum;
    - `tier` by the module's rule; `gaps` from the known list;
    - a gated review all 0, with no tier.
  - It locks the rows in id order, then writes them in one statement, so each
    master refreshes once.
  - One bad row refuses the whole call (22023, with the row's index).
- **Two NOT VALID CHECKs** on the breakdown: an object; completeness a step of
  5; `weightCompleteness` equal to it or 5 less. These also bind a direct
  write (below). V6 checks every row; a later file may VALIDATE them, as P2's
  backfill file did.
- **After the transaction**, a refresh of masters whose reviews already hold a
  lifting breakdown. It changes nothing on the first apply, and re-lifts them
  after a rollback and a re-apply.
- The ALTER TABLEs wait at most 5 s for their lock (`lock_timeout`); re-run the
  file if it times out.

**Rating impact at apply time: none**, as long as no review has a breakdown
yet (check 1 under Apply). Ratings then move only as the scoring job stores
values, each review by at most +25% weight.

## Order and dependencies

- **Needs:** P2 (`20261101120000`) and P3 (`20261102090000`). Both are in
  production.
- **Shared module:** DOS/Rate#1579 must be merged first, because the replay
  test builds the shared module.
- **After the apply:** the scoring job in the importer (a follow-up) computes
  `reviewValue` for each review and calls `store_review_values` as
  `rate_worker`, one worker at a time. The web then sorts by `value_score` and
  shows the tier.
- **The SQL repeats the module's constants**: 35, 0.25, the steps, the parts'
  values, the tier thresholds, the gap names and the keys.
  - A change to the module that changes its output needs a DOS-Me migration
    first, with a `REVIEW_VALUE_VERSION` bump. Until then the writer refuses
    the new rows: it fails closed.
  - The replay stores the module's output over a grid of 448 inputs, so CI
    catches a drift.

## Decisions for JOY

1. **D7 and the public API.** `rate.reviews` is publicly readable, so
   `value_score` and `value_breakdown` can be read through the API even
   though the web shows only the tier.
   - The breakdown includes `trust`, the writer's axis D trust x10, which is a
     per-author signal that is new to the public, and `gaps`.
   - Hiding them needs one of these:
     - column grants, which break the `select=*` reads of reviews;
     - moving the number to a private table.
   - **Recommendation:** accept it for now. D7 is about what pages show, and
     axis D is still a placeholder (unknown counts as 0.5). Move the number
     and the breakdown to a private table when author trust becomes real.
2. **Who can lift a review.**
   - The database cannot check a claimed completeness against the review's
     text, lines and criteria. So a caller with `rate_worker` can give any
     review it chooses up to +25% weight.
   - Two paths:
     - through the writer, for every review, community ones included (the job
       must score every review the same way);
     - directly, for crawled reviews, which its table grant already allows,
       as it allows `helpfulness_weight`. The CHECKs bound that to the same
       +25%.
   - The real worst case is selective lifting: for example, only the 1-star
     reviews of one product.
   - **Recommendation:** accept. `rate_worker` can already set
     `helpfulness_weight` up to 3 on crawled reviews, which moves a rating
     much further.
3. **Side effects of the lift**, for information:
   - A lifted review also counts toward D9's criterion threshold
     (`LEAST(1, w)`), so a lift can make a criterion score appear sooner.
   - `rating_weight_sum`, which is public, grows by the same amount.
   - Only `rating_score` is lifted. `user_rating_weighted`, the fallback
     rating, stays on the plain weight. The two drift a little further apart
     until the fallback is retired.

## Apply

1. **Before the apply**, read-only:
   - `SELECT count(*) FROM rate.reviews WHERE value_breakdown IS NOT NULL`
     must be 0. If it is not, the last section re-lifts those masters, which
     changes ratings.
   - Run V5 alone as a baseline, so drift that P2 already has is not
     mistaken for P6.
2. Copy the `.sql` into DOS-Me `supabase/migrations/` with a new timestamp,
   and the verify and rollback files into `scripts/ops/`, as for P3.
3. After the beta and production applies, run the verify file read-only as
   `postgres` or `service_role`: V1 to V7 must return 0. V5 recomputes every
   master, so run it off-peak.
4. **Rollback:** the rollback file, safe to run twice. It runs in two
   transactions:
   - P2's functions back byte for byte, and a refresh of the masters a stored
     breakdown touched;
   - then the writer, the factor and the CHECKs dropped, under a 5 s lock
     timeout.

   The stored values stay (they are P2's columns) and no longer count. The
   refresh skips a master another transaction holds at that moment, so run V5
   afterwards. A master it counts needs
   `SELECT rate.refresh_master_rating_extras(id)`. Stop the scoring job first.

## Tests (local, Docker)

`node scripts/test-review-value-proposal.mjs` (after building
`@repo/shared-data`):

- the proposal twice with no rating change;
- the factor's parity with the shared module for 0 to 35 and for junk;
- the writer accepting the module's output over a grid of 448 inputs;
- the module's values stored as `rate_worker` (a community review included),
  and the lifted rating equal to the module's formula, cap included;
- a re-store that changes nothing, and a rescore with the same completeness
  that refreshes nothing;
- the refusals, where nothing is written:
  - not an array, too many rows or bytes;
  - a bad id, version, key, type, tier, gap or part;
  - a score that is not the sum;
  - a gated review not scored 0;
  - the photo rule broken either way;
- a direct `rate_worker` write stopped by the CHECK;
- the grants (`anon` and `authenticated` refused);
- V1 to V7;
- the rollback twice (the lift is gone, the values stay, P2 still
  refreshes), then the proposal again, which lifts the kept values back.
