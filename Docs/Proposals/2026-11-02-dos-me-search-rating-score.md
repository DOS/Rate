# DOS-Me migration proposal: catalog search sorts and filters on the shown rating

**Not applied.** This is a follow-up of DOS/Rate#1545, which is phase P4 of the criteria ratings design (`2026-10-31-criteria-stars-pros-cons.html`, D3: one rating everywhere). JOY reviews it and applies it through DOS-Me: preview, then beta, then production. DOS/Rate runs no DDL against production.

## Problem

Since PR #1571, every page shows the same rating. It is `master_products.rating_score` when the product has one, and otherwise the weighted user rating, then the marketplace average (`resolveCompareEffectiveUserRating`, `apps/web/src/lib/rate-domain.ts`).

The catalog RPC `rate.search_master_products` still uses older values for two things:

- **The order `p_sort = 'rating_desc'`** reads `user_rating_weighted`, then `average_rating`. It ignores `rating_score`, and it does not bring a 0-10 or 0-100 average to 0-5.
- **The filter `p_min_rating`** reads `user_rating_weighted`, then `expert_rating`, then `average_rating`. No page shows `expert_rating` as the product's rating.

So three things can disagree with the rating on screen:

- the catalog's "Điểm đánh giá cao nhất" order;
- `?rating=` on the catalog and in `GET /api/v1/rate/products`;
- the leaderboard's top-100 load, which calls the RPC with `rating_desc`.

## Change

The migration is one `CREATE OR REPLACE FUNCTION`. The order and the filter read a new `shown.rating_5`, worked out exactly as the web does:

- `rating_score`, when it is above 0 and at most 5;
- otherwise `user_rating_weighted`, then `average_rating`. Each one counts only when it is above 0 and at most 100. A value above 10 is divided by 20, and a value above 5 is divided by 2. The result is rounded to 2 decimals (`normalizeCompareFiveStarRating`);
- otherwise nothing. Such a product sorts last and never passes a minimum rating, as before.

The order uses this rating unrounded. The filter compares it at one decimal, as every page shows it (`productRatingScore5`): a stored 4.46 shows 4.5, so it passes a 4.5 minimum.

**Nothing else changes.** The rest is DOS/DOS.Me#1497's function (head `8ccfbf2e`), byte for byte: the signature, the return type, `SECURITY INVOKER`, `search_path = ''`, `plan_cache_mode = force_custom_plan`, the other filters, the trigram search expression, the `created_at` and `id` tiebreak, the paging and the grants. There is no table, index or data change.

**Diff against #1497's function:**

```diff
   ) spec
+  CROSS JOIN LATERAL (
+    SELECT CASE
+      WHEN m.rating_score > 0 AND m.rating_score <= 5 THEN m.rating_score
+      ELSE COALESCE(<user_rating_weighted on 0-5>, <average_rating on 0-5>)
+    END AS rating_5
+  ) shown
 ...
-      OR COALESCE(
-        NULLIF(m.user_rating_weighted, 0),
-        NULLIF(m.expert_rating, 0),
-        m.average_rating,
-        0
-      ) >= p_min_rating
+      OR pg_catalog.round(COALESCE(shown.rating_5, 0), 1) >= p_min_rating
 ...
-    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) END DESC NULLS LAST,
+    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(shown.rating_5, 0) END DESC NULLS LAST,
```

### What changes for shoppers

- **The rating order follows the shown rating.** A product with a stored score of 4.6 no longer ranks above one shown at 4.8 because of a higher weighted rating.
- **`?rating=4.5` returns exactly the products shown at 4.5 or more**, counting the rating at one decimal as the pages do. A product with only an expert score, and no rating on screen, no longer passes.
- **A 0-10 average no longer ranks first.** Before, an average stored as 9.0 sorted above every 0-5 rating.

## Order (needs, in this order)

1. **P2** (`2026-10-31-dos-me-criteria-ratings.sql`, live on production) provides `rating_score`.
2. **DOS/DOS.Me#1497** (open; `20261101170000_rate_search_master_products_trgm_index_and_numeric_guard`) rewrites the function in plpgsql and adds the trigram index.
3. **This proposal**, as a DOS-Me migration with a timestamp after `20261101170000`.

This proposal must land **after #1497**. If it is applied first, #1497 would later put the old rating expressions back, and verification check V2 below would catch that. If #1497 changes its function before it merges, rebase this function on its final body: only the three hunks above are this proposal's.

## Files

- `2026-11-02-dos-me-search-rating-score.sql`: the migration. It is re-runnable.
- `-verify.sql`: read-only checks. V1 to V5 must each return 0:
  - **V1:** the function is #1497's: plpgsql, invoker rights, stable, `search_path = ''`, custom plans.
  - **V2:** the function reads `m.rating_score` and no longer reads `expert_rating`.
  - **V3:** `anon`, `authenticated` and `service_role` can still call it.
  - **V4:** in the `rating_desc` order, no product sits above one with a higher shown rating.
  - **V5:** at minimum ratings of 3.5, 4.0, 4.5 and 4.8, the RPC returns exactly the published products whose shown rating, at one decimal, reaches the threshold.
- `-rollback.sql`: #1497's function, byte for byte. There is no data to restore.
- **Replay test:** `scripts/test-search-rating-score-proposal.mjs`, on Docker, in DOS/Rate CI. It runs these steps:
  1. Apply P2, then #1497's function (from the rollback file).
  2. Check the old order and filter on a small catalog: a stored score, weighted only, a 0-10 average, expert only, a zero stored score, and a draft.
  3. Check that V2, V4 and V5 flag #1497's behaviour, so the checks have teeth.
  4. Apply the proposal twice, then check the new order, the filter thresholds, the three roles, search, the draft, and V1 to V5 at 0.
  5. Roll back twice, then apply the proposal again.

## Known limits

- **Rounding:** the fallback rounds with PostgreSQL `round(numeric, 2)` (half away from zero), and the web uses `toFixed(2)`. They can differ by 0.01 only on a binary halfway value of a fallback rating. `rating_score` itself is not rounded before that; both sides round the result once more to one decimal for the filter, half up.
- **No index on the rating:** the shown rating is computed per row, so the rating order and filter have no index. `rate.master_products` has under 40 rows on production. If the catalog grows past a few thousand published rows, a generated column or an expression index is a later step.
- **Web follow-ups (separate web PR, not this proposal):**
  - **The JS fallback path:** `getEffectiveRating` in `apps/web/src/lib/rate-api.ts` runs only when the RPC is unavailable. It still tries `expert_rating` before `average_rating`, does not bring a 0-10 value to 0-5, and accepts a `rating_score` above 5. It should use `resolveCompareEffectiveUserRating`, with the one-decimal filter. A test (`core-rate-architecture.test.ts`, "rating_desc sort must use expert_rating") pins the old behaviour.
  - **The OpenAPI text** for `min_rating` and `sort` (`server/rate/openapi.ts`) could say they use `rating_score_5`, the shown rating.
  - **The leaderboard engine's `userScore5`** fallback reads a value above 10 as 0, where `rate-domain.ts` divides it by 20. It only matters for edge rows, which the leaderboard re-ranks itself.

## Rollout

1. **Preview:** a DOS-Me PR with this migration, after #1497 has merged. Supabase Preview applies it; then run the verify file there, read-only.
2. **Beta:** the GitHub Integration applies it on merge to `dev`. Run the verify file again.
3. **Production:** a selective promote PR into `main`, after JOY's approval. Run the verify file.
4. **Rollback:** `-rollback.sql`, at any time. No data depends on it.
