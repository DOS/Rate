# Proposal: DOS-Me migration for criteria ratings, pros and cons (DOS/Rate#1543)

**Status:** proposal for JOY, **not applied**. This is a schema change on the shared Supabase. JOY approves it and applies it through DOS-Me: preview, then beta, then prod. Nothing runs from DOS/Rate.

Design: [`2026-10-31-criteria-stars-pros-cons.html`](./2026-10-31-criteria-stars-pros-cons.html), section 3. Phase P2 of #1531. JOY approved decisions D2, D3, D9 and D10 on 2026-10-31.

## Files

| File                                                                                                   | What                                                                                                                                                                                                                                                                                 |
| :----------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`2026-10-31-dos-me-criteria-ratings.sql`](./2026-10-31-dos-me-criteria-ratings.sql)                   | The migration. One transaction, idempotent, ends with a backfill of the new master columns.                                                                                                                                                                                          |
| [`2026-10-31-dos-me-criteria-ratings-verify.sql`](./2026-10-31-dos-me-criteria-ratings-verify.sql)     | Read-only. V1 to V6 must return 0 after the migration. V7 lists `rating_score` next to today's `user_rating_weighted` for the 20 most-reviewed masters.                                                                                                                              |
| [`2026-10-31-dos-me-criteria-ratings-rollback.sql`](./2026-10-31-dos-me-criteria-ratings-rollback.sql) | Restores the previous refresh body and drops everything the migration added. One transaction, re-runnable.                                                                                                                                                                           |
| [`scripts/test-criteria-ratings-proposal.mjs`](../../scripts/test-criteria-ratings-proposal.mjs)       | CI replay in Docker. It builds a small catalog, applies the migration twice and asserts the computed rating and criteria scores. It also runs every V check, the anon and worker grants and the rollback twice, then repeats all of it on top of M0 and M1+M2, plus a full re-apply. |

## What it adds

- **`rate.reviews`:**
  - `rating_exact numeric(2,1)`: the 0.1 star a criteria review computes. `rating_star` stays the rounded integer that existing code reads.
  - `verdict` (300 characters at most).
  - `criteria_version`.
  - `value_score` (0 to 100) and `value_breakdown` (for P6).
- **`rate.review_points`:** one pro or con line of a review, for the whole review or for one criterion.
  - A line is 5 to 150 characters, and its `method` is `writer` or `ai`.
  - It holds a `cluster_id` for P5.
  - Public read; only the service role writes.
- **`rate.product_points`:** the aggregated lines of a master.
  - Each line has its support, writer count, an expert flag, and first and last seen dates.
  - Public read; the service role and the worker (P5) write.
- **`rate.master_products`:**
  - `rating_score`: the one rating of D3, Bayesian with k = 3 and mu = 4.2, the same formula as the web's `computeBayesianRatingSummary`.
  - `rating_weight_sum`.
  - `criteria_scores`: `{key: {score, weight_sum, writers}}`. A criterion appears only when 3 or more reviews rated it and their weight sum is 1.5 or more (D9). Readers apply the ranking threshold of 5 from `writers`.
- **`rate.refresh_master_rating_extras(master)`:** fills the three master columns. It reads the same reviews that `refresh_master_product_rating` counts. It uses `rating_exact` when a review has one, and caps each weight at 3.
- **`rate.refresh_master_product_rating(master)` becomes a wrapper:**
  - The live body is renamed `refresh_master_product_rating_base`. It keeps its owner and grants, whichever version is live, including M1+M2's Item-aware one.
  - The wrapper runs the base, then the extras, so every existing caller fills the new columns unchanged.
  - anon and authenticated cannot run any of the three functions.

## Order of operations

1. **Apply order:** after M0 and M1+M2 if those are still pending. The replay covers both orders.
2. **Apply:** on preview, then run the verify file (V1 to V6 must be 0). Compare V7: `rating_score` sits a little below `user_rating_weighted` for masters with few reviews, because of the prior. That is intended (D3).
3. **Then beta, then prod**, verifying each.
4. **Keep the wrapper:** any later migration that replaces `rate.refresh_master_product_rating` must keep calling `rate.refresh_master_rating_extras`, or the new columns stop updating.
5. **What comes next:** P4 (#1545) switches the web to `rating_score`. P3 (#1544) writes the review columns and lines. P5 (#1546) writes `product_points`.

## Rollback

`2026-10-31-dos-me-criteria-ratings-rollback.sql` drops the wrapper and renames the base back, then drops the extras function, both tables and the new columns. Data written only into these is lost; nothing older depends on it.

Roll back before P4 reads `rating_score`, or revert P4 first.

## Not in this migration

- `submit_community_review` v2 (P3) and the value score weight (P6). Each comes with its own phase.
- Per-category prior means for criteria. Version 1 uses 4.2 for every criterion.
