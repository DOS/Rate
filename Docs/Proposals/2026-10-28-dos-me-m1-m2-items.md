# Proposal: DOS-Me migration M1 + M2 for Items (DOS/Rate#1150)

**Status:** proposal for JOY, **not applied**. Zero DDL on the shared prod Supabase from DOS/Rate; JOY reviews and applies it through DOS-Me (preview, then beta, then prod). The DOS-Me beta flow is still locked (ROADMAP 6.4).

Design: [`2026-10-27-item-variant-listing-model.md`](./2026-10-27-item-variant-listing-model.md), sections 4.3, 4.5, 7, 7.1, 7.3 (approved by JOY on 2026-10-27, #1129).

## Files

| File                                                                                         | What                                                                                                                                                                                        |
| :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`2026-10-28-dos-me-m1-m2-items.sql`](./2026-10-28-dos-me-m1-m2-items.sql)                   | M1 (schema, RLS, grants, sync triggers, race guards) and M2 (RPCs, backfill) in one transaction. Idempotent.                                                                                |
| [`2026-10-28-dos-me-m1-m2-items-rollback.sql`](./2026-10-28-dos-me-m1-m2-items-rollback.sql) | Full rollback, re-runnable; restores the two rating functions' previous bodies. Writers paused.                                                                                             |
| [`2026-10-28-dos-me-m1-m2-items-verify.sql`](./2026-10-28-dos-me-m1-m2-items-verify.sql)     | Read-only checks (V1 to V15) to run before, after, and as the reconciliation.                                                                                                               |
| [`scripts/test-item-migration-proposal.mjs`](../../scripts/test-item-migration-proposal.mjs) | CI test on the throwaway PostgreSQL 17 stack of the migration replay: proposal twice, verification, triggers and RPCs as `anon` / `rate_worker` / `service_role`, rollback twice, re-apply. |

## Order of operations

1. **DOS/Rate#1123 first** (M0 re-key of the six drifted seed masters, with JOY's approval), so the Items get the normalizer's Item keys (`apple:watch-ultra-3`, `apple:airpods-pro-2`).
2. This migration on preview, run the verification file, then beta, then prod.
3. The importer keeps `RATE_ITEM_MODEL` off until Rate Services handles NULL `cluster_id` (design task 13). Flag `item` can come first; `nullable_variant` after task 13.
4. Mirror the applied file into `supabase/migrations/` and regenerate `database.types.ts` (as #1147 did).

## Contents and the contracts they satisfy

| Piece                                                                                                                                                                                                                                                                 | Contract / source                                                                                                                              |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate.items` (design 4.3 columns), RLS: public reads published, `service_role` all, `rate_worker` reads all and updates spec columns only (description, specifications, key_specs, spec_provenance, images, thumbnail, metadata), never status, key, prices or counts | matcher reads draft Items (#1179); seed spec sync writes as service role (#1208); Rate Services needs SELECT, UPDATE and the two RPCs (RS#700) |
| `master_products.item_id`, `variant_key`, `sort_order`; `products.item_id`, `variant_source` (+ CHECK)                                                                                                                                                                | pipeline writes (#1179, #1190)                                                                                                                 |
| index `rate.products(item_id)`                                                                                                                                                                                                                                        | Rate Services filters by Item (RS#688, PR #689)                                                                                                |
| M1 sync triggers: a master inserted or re-keyed gets its Item from its key (draft, published with its variant); its listings follow; a listing's Item follows its variant                                                                                             | design 4.3 compatibility sync; `itemIdOfMaster` in the matcher fails loudly without it                                                         |
| `match_item(search_title, p_brand, p_model, p_threshold)` -> `item_id, item_key, name, similarity`                                                                                                                                                                    | matcher Item Tier 2 (#1179)                                                                                                                    |
| `refresh_item_stats(p_item_id)`: prices from published variants, listing / unknown-variant / merchant counts, **and the pooled Item rating** mirrored onto the variants                                                                                               | pipeline and review analyzer (#1190, #1208)                                                                                                    |
| `refresh_master_product_rating(p_master_id)`: same signature, rates the whole Item when the master has one                                                                                                                                                            | design 4.5                                                                                                                                     |
| `refresh_review_vote_counts`: resolves the Item through `products.item_id`, so votes on a listing with no variant count                                                                                                                                               | design 4.5                                                                                                                                     |
| `retire_item_unknown_variant(p_item_id)`: one transaction, Item row locked; listings of a multi-size Item's live `unknown` variant move to no variant, the variant is archived, stats refreshed; earbuds never                                                        | Codex P1 left open on #1179                                                                                                                    |
| `products` BEFORE trigger: a `manual` variant is never moved by a later write (an ingest that read the row before it was hand-set included); admin tools move it with `SET LOCAL rate.variant_override = 'on'`                                                        | Codex P1 on #1179 (read-then-upsert race)                                                                                                      |
| `products` AFTER trigger: the Item and variant a listing leaves are refreshed by the statement that moves it, under the row lock                                                                                                                                      | Codex finding on #1190 (overlapping ingests leave the middle Item stale)                                                                       |
| Backfill (design 7.1) with an up-front slug-collision abort; Item specs and key specs without storage and RAM                                                                                                                                                         | design 7.1, #1208 rule "no storage on an Item"                                                                                                 |

## Concurrency and compatibility

- **One lock order everywhere: listing, then variant, then Item.** The listing triggers refresh the left variant before the left Item and take no variant lock themselves (an `INSERT ... ON CONFLICT` runs the BEFORE trigger before it locks the conflicting listing); the rating refresh mirrors onto the variants in id order with `SKIP LOCKED` (a skipped variant belongs to a concurrent refresh of the same Item, which mirrors itself), then writes the Item; the retire RPC locks the listings, then the variant, then refreshes the Item.
- **A retired `unknown` variant takes no listing.** The listing trigger turns a write onto a retired `unknown` into "no variant, same Item". A write that races a running retire is caught by the retire's second sweep after it archives the variant, and calling the RPC again on an Item whose `unknown` is already retired sweeps any straggler.
- **Old writers keep Item numbers fresh.** `refresh_master_market_stats(p_master_id)` keeps its signature and query and also refreshes the variant's Item (removed with the sync triggers in M4), so the importer with the flag off and Rate Services before task 13 do not leave Item prices or counts stale.
- **The retire RPC records what it changed** in `metadata` (listing: `retired_unknown_variant`, `variant_source_before_retire`; variant: `status_before_retire`, `retired_by`), so the rollback can put those listings back on their variant. Any later variant or Item change on the listing clears its markers, and the rollback restores a listing only onto a variant of its own Item.
- **`rate.variant_override` is a cooperative switch, not a permission.** Any role that can update `rate.products` could set it; only the worker and service role can, and both are trusted writers. The retire RPC restores the caller's value.
- **An Item is never demoted automatically.** Publishing a variant publishes its Item; archiving every variant leaves the Item's status to an admin (or M3/M4 tooling).

## Decisions to confirm (JOY)

- **`match_item` filters by brand, not by model.** The design names a `p_model` argument; filtering by it would only find the exact model, which Tier 1 already did. The matcher only links a fuzzy Item hit to variants that exist, so a looser match cannot create a variant under a foreign Item.
- **Item rating with no reviews is stored as 0**, like the variant columns today (`refresh_master_product_rating` writes `COALESCE(..., 0)`). The web shows "no rating" when the review count is 0.
- **`rate.v_products_with_merchant_trust` is not changed.** The design suggested appending `item_id`; doing so breaks a re-run of `20261018153000` (see the note in `20261020230000`). Readers take `item_id` from `rate.products`.
- **Price alerts on a retired `unknown` variant stay on it** (archived): an alert needs a size. M3's report lists them (design 7.3).
- **Admin override setting name:** `rate.variant_override`. Any admin tool that re-assigns a hand-set variant must set it locally.

## Not in this migration

Web RPCs (`search_items_v1`, facet and autocomplete v2, `resolve_catalog_slug`, `submit_community_review` by Item) belong to the web tasks (design section 10, tasks 7 to 11). M3 (bulk retire with a backup table) and M4 (NOT NULL, guard triggers, dropping the sync triggers) are later phases.

## Rollback

Run `2026-10-28-dos-me-m1-m2-items-rollback.sql` with the importer and Rate Services workers paused. It drops the triggers, the new functions, the new columns and `rate.items`, and restores `refresh_master_product_rating` (20261018153000) and `refresh_review_vote_counts` (20261018120103). Never `TRUNCATE rate.items`.
