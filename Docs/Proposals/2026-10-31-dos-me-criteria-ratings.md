# Proposal: DOS-Me migration for criteria ratings, pros and cons (DOS/Rate#1543)

**Status:** proposal for JOY, **not applied**. A schema change on the shared Supabase: JOY approves and applies it through DOS-Me (preview, then beta, then prod). Nothing runs from DOS/Rate.

Design: [`2026-10-31-criteria-stars-pros-cons.html`](./2026-10-31-criteria-stars-pros-cons.html), section 3; phase P2 of #1531, decisions D2, D3, D9 and D10 approved by JOY on 2026-10-31.

## Files

- [`2026-10-31-dos-me-criteria-ratings.sql`](./2026-10-31-dos-me-criteria-ratings.sql): the migration. Idempotent, in two transactions: the schema change first, then a backfill of the reviewed masters.
- [`2026-10-31-dos-me-criteria-ratings-verify.sql`](./2026-10-31-dos-me-criteria-ratings-verify.sql): read-only checks. V1 to V6 must return 0 after applying:
  - V3: function grants for PUBLIC, anon and authenticated.
  - V4: the triggers.
  - V6: recomputes every master and compares it with what is stored.
  - V7: lists `rating_score` next to today's `user_rating_weighted` for the 20 most-reviewed masters.
- [`2026-10-31-dos-me-criteria-ratings-rollback.sql`](./2026-10-31-dos-me-criteria-ratings-rollback.sql): drops everything the migration added. One transaction, re-runnable.
- [`scripts/test-criteria-ratings-proposal.mjs`](../../scripts/test-criteria-ratings-proposal.mjs): the CI replay in Docker, in four steps:
  1. **Reference stack:** apply twice; check the ratings, the triggers (exact star, a flag that leaves the rating, the weight cap) and the grants; roll back twice.
  2. **Before M1+M2:** apply, then run M0 and M1+M2. Two sizes become one Item, both variants show the pooled rating, and a vote on the Item path updates it.
  3. **M1+M2 rollback** with this migration in place.
  4. **After M1+M2:** M1+M2 again, then this migration on top, then the rollback.

## What it adds

- **`rate.reviews`:**
  - `rating_exact numeric(2,1)`: the 0.1-step star a criteria review computes. `rating_star` stays the rounded integer that existing code reads.
  - `verdict` (300 characters at most).
  - `criteria_version`.
  - `value_score` (0 to 100) and `value_breakdown`, for P6.
- **`rate.review_points`:** one pro or con line of a review, for the whole review or one criterion.
  - Each line is 5 to 150 characters.
  - `method` is `writer` or `ai`.
  - `cluster_id` is filled by P5.
  - Public read; only the service role writes.
- **`rate.product_points`:** the aggregated lines of a master, with support, writer count, an expert flag, and first and last seen dates. Public read; the service role and the worker (P5) write.
- **`rate.master_products`:**
  - `rating_score`: the one rating of D3. It is a Bayesian average with k = 3 and mu = 4.2 (the same formula as the web's `computeBayesianRatingSummary`). Each review weight is capped at 3, and `rating_exact` is used when present.
  - `rating_weight_sum`.
  - `criteria_scores`: `{key: {score, weight_sum, writers}}`. A criterion appears only when all of these hold (D9):
    - 3 or more reviews rated it;
    - each rating is a number from 1 to 5, under a key shaped like the shared-data keys;
    - the reviews' weight sum is 1.5 or more.

    Readers apply the ranking threshold of 5 from `writers`.
- **Which reviews count:** the same reviews `refresh_master_product_rating` counts.
  - Before M1+M2: the master's own listings.
  - Once the master belongs to an Item: every listing of the Item, and the result is written to every variant, as `refresh_item_rating` does.
  - The `item_id` columns are read dynamically, so the same functions work with or without M1+M2.
- **Functions:**
  - `rate.master_rating_extras(master)` computes the values. It is read-only; the verify file uses it.
  - `rate.refresh_master_rating_extras(master)` writes them, only where they changed.
  - Only the service role can run them.
- **Triggers keep the values current.**
  - On `rate.reviews` (a change of a rating input: star, exact star, criteria, weight, type, origin or listing) and `rate.review_flags` (`include_in_rating`), for every insert, update and delete. They run once per statement; see Known limits for bulk flag imports.
  - On `rate.master_products`: a change of `user_rating_weighted` or `authentic_review_count`, for example after a listing moves.
  - **No existing function is replaced or renamed.** A later `CREATE OR REPLACE` of a refresh function (M1+M2, its rollback, a hotfix) cannot stop these updates.

## Order of operations

1. **Apply order:** before or after M0 and M1+M2. The replay covers both orders and the M1+M2 rollback.
2. **Apply on preview:**
   - The schema transaction takes ACCESS EXCLUSIVE locks on `rate.reviews` and `rate.master_products` only for the `ALTER TABLE` statements. The new CHECKs are added NOT VALID, so nothing is scanned under that lock.
   - The backfill transaction validates the CHECKs (a scan that lets reads and writes go on) and refreshes the reviewed masters, locking only those rows.
   - Run the verify file: V1 to V6 must return 0.
   - Compare V7: `rating_score` sits a little below `user_rating_weighted` for masters with few reviews, because of the prior. That is intended (D3).
3. **Then beta, then prod**, running the verify file after each.
4. **If M1+M2 is ever rolled back while this is in place:** run the backfill again (section 8 of the migration, its last transaction), then V6. Variants whose reviews did not change keep the Item's pooled values until then; V6 lists them.
5. **Next phases:**
   - P4 (#1545) switches the web to `rating_score`.
   - P3 (#1544) writes the new review columns and lines.
   - P5 (#1546) writes `product_points`.

## Rollback

`2026-10-31-dos-me-criteria-ratings-rollback.sql` drops the triggers, the functions, both tables and the new columns. It is safe before or after M1+M2, because the migration replaced nothing. Data written only into these objects is lost; nothing older depends on it.

Roll back only while no phase reads or writes the new columns: before P3, P4 and P5, or after reverting them.

## Known limits

- **Bulk flag imports.** The existing `trg_review_flags_sync_weight` updates `rate.reviews` one row at a time. A bulk flag import therefore refreshes a master once per flag row, not once per import. Re-crawls that rewrite reviews unchanged refresh nothing: only changes to rating inputs count.
- **Concurrent writers.** A variant locked by another transaction is skipped, as `refresh_item_rating` does. This avoids deadlocks between sibling variants. The other transaction writes its own values when it reaches that variant. Like the live refresh, two writers on the same master can leave the older values until the next write; V6 shows any master out of date.
- **Deleting a listing with its reviews** leaves the master's values in place until its next review write or refresh, the same as `user_rating_weighted` today. V6 shows it. Re-run the backfill to fix it.

- **`rate_worker` can write the new columns directly.** It keeps its table-level UPDATE on `master_products` and on crawled reviews (20261018183000). The next trigger run overwrites such a write, and V6 shows it. Column-level grants are a separate hardening step.
- **Per-category prior means:** version 1 uses 4.2 for every criterion.
- **Not in this migration:** `submit_community_review` v2 (P3) and the value score weight (P6). Each comes with its own phase.
