# Runbook: Item model go-live (DOS/Rate#1150)

**Status:** runbook for JOY, **nothing applied**. One page to approve the whole Item / variant / listing rollout in one pass. Vietnamese version for JOY: [`2026-10-29-item-model-go-live.html`](./2026-10-29-item-model-go-live.html).

Design (approved 2026-10-27, #1129): [`2026-10-27-item-variant-listing-model.md`](./2026-10-27-item-variant-listing-model.md). Per-step proposals:

- M0: [`2026-10-29-dos-me-m0-seed-rekey.md`](./2026-10-29-dos-me-m0-seed-rekey.md) (#1212, #1123)
- M1+M2: [`2026-10-28-dos-me-m1-m2-items.md`](./2026-10-28-dos-me-m1-m2-items.md) (#1150)
- Item RPCs, M3, M4: [`2026-10-29-dos-me-m3-m4.md`](./2026-10-29-dos-me-m3-m4.md) (#1160, PR #1279)

Every SQL file is replayed in CI on a throwaway PostgreSQL 17 stack (apply twice, checks, rollback twice, re-apply). No step has touched the shared prod Supabase.

## Rules for every database step

- **JOY applies it through DOS-Me**: preview, then beta, then prod, verifying after each. DOS/Rate never runs DDL or data writes on prod. The DOS-Me beta flow is still locked (ROADMAP 6.4); until it reopens, prod waits.
- **Verification files are read-only** (`SELECT` only). Every check marked "expect 0" must return 0.
- After each prod apply, mirror the applied file into `supabase/migrations/` and regenerate `database.types.ts` (a Rate PR, as #1147 did).
- **Writers paused** means: the importer jobs and the Rate Services workers stopped for the duration (the web keeps running).
- Rollbacks run in reverse order of the steps applied.

## Order at a glance

| #   | Step                                                 | Who runs it                                    | Blocks on                                       |
| :-- | :--------------------------------------------------- | :--------------------------------------------- | :---------------------------------------------- |
| 1   | #1123 / M0: seed key re-key (data)                   | JOY via DOS-Me                                 | decision 8                                      |
| 2   | Seed PR (`flagship-seed-data.ts`), right after M0    | Core opens, PO merges                          | step 1 on prod                                  |
| 3   | M1+M2: `rate.items`, columns, triggers, RPCs, fill   | JOY via DOS-Me                                 | step 2; decisions 1 to 5                        |
| 4   | Item catalogue RPCs                                  | JOY via DOS-Me                                 | step 3                                          |
| 5   | Rate Services bump of `vendor/rate`                  | Rate Services (RS PO), JOY merges              | step 3                                          |
| 6   | Flag `RATE_ITEM_MODEL=item`, then `nullable_variant` | Importer env (Rate Services), Vercel env (web) | steps 4 and 5                                   |
| 7   | Compatibility window                                 | everyone; PO tracks                            | step 6, at least one promote cycle and ~30 days |
| 8   | M3: retire `unknown` on multi-size Items             | JOY via DOS-Me, writers paused                 | step 7; decision 4                              |
| 9   | M4: constraints and default variants                 | JOY via DOS-Me                                 | step 8; decisions 6, 7                          |

Note on the order: #1123 and M0 are one step (M0 is the reviewed SQL for #1123, plus three more drifted earbuds keys). The seed PR must merge **right after M0, before M1+M2**, and `jobs/backfill-specs.ts --apply` must not run between M0 and the seed PR: it looks masters up by seed key and would re-create the old keys as duplicates.

## Steps

### 1. #1123 / M0: seed key re-key

- **Changes:** six drifted seed masters get the normalizer's keys in place (ids, slugs, listings, alerts, reviews unchanged); earbuds masters get `storage_gb = NULL`; markers `metadata.m0_rekeyed_from`, `m0_storage_gb_before`. A target key already taken is skipped with a NOTICE (never an automatic merge).
- **File:** `2026-10-29-dos-me-m0-seed-rekey.sql` (data only, one transaction, idempotent).
- **Verify:** before, run V5 of `2026-10-29-dos-me-m0-seed-rekey-verify.sql` and compare with the six rows in the M0 proposal; after, V1 to V4 return 0.
- **Roll back:** `2026-10-29-dos-me-m0-seed-rekey-rollback.sql` and revert the seed PR in the same step. Only while M1+M2 is not applied (roll M1+M2 back first otherwise).
- **Who:** JOY through DOS-Me.

### 2. Seed PR

- **Changes:** `apps/importer/src/shopee/flagship-seed-data.ts` uses the six new keys; earbuds `storage_gb: null`. The Core session opens it once JOY schedules M0; it must not merge before M0 is on prod.
- **Verify:** CI green; read-only check that no `model_key` appears twice in `rate.master_products`.
- **Roll back:** revert the PR (together with the M0 rollback).
- **Who:** Core opens, PO merges.

### 3. M1+M2: Items

- **Changes:** `rate.items` (RLS: public reads published; `rate_worker` reads all, updates spec columns only), `master_products.item_id / variant_key / sort_order`, `products.item_id / variant_source`, sync triggers (a master gets its Item from its key; listings follow), RPCs `match_item`, `refresh_item_stats`, `retire_item_unknown_variant`, Item-aware rating and vote functions with the same signatures, and the backfill. One transaction, idempotent.
- **File:** `2026-10-28-dos-me-m1-m2-items.sql`.
- **Verify:** `2026-10-28-dos-me-m1-m2-items-verify.sql`, V1 to V15, before and after (the same file is the reconciliation later).
- **Roll back:** `2026-10-28-dos-me-m1-m2-items-rollback.sql`, writers paused and the flags `off` first. Restores the two rating functions' previous bodies. Never `TRUNCATE rate.items`.
- **Who:** JOY through DOS-Me.

### 4. Item catalogue RPCs

- **Changes:** new functions only: `search_items_v1`, `get_category_brand_facets_v2`, `search_catalog_autocomplete_v2`; EXECUTE for `anon`, `authenticated`, `service_role`, `rate_worker`. The variant RPCs the flag-off web uses are untouched.
- **File:** `2026-10-29-dos-me-item-rpcs.sql`.
- **Verify (read-only):** as `anon`, `SELECT count(*) FROM rate.search_items_v1(p_limit => 200)` is non-zero and its `total_count` equals `SELECT count(*) FROM rate.items i WHERE i.status = 'published' AND EXISTS (SELECT 1 FROM rate.master_products m WHERE m.item_id = i.id AND m.status = 'published')`; `SELECT * FROM rate.search_catalog_autocomplete_v2('iphone', 5)` returns `entity_kind = 'item'` rows.
- **Roll back:** turn the web flag off, then `2026-10-29-dos-me-item-rpcs-rollback.sql`.
- **Who:** JOY through DOS-Me.

### 5. Rate Services bump

- **Changes:** Rate Services moves its `vendor/rate` pin to a DOS/Rate `dev` commit with the Item-aware importer (#1179, #1190, #1208, #1213 and later). Its own Item work already merged (RS#685 NULL `cluster_id` is "no variant", RS#687 Item verification, job Item ids, Item refresh, RS#689).
- **Verify:** Rate Services CI green on the bump; with the flag still `off`, one normal promote cycle shows no new errors.
- **Roll back:** revert the pin.
- **Who:** Rate Services (RS PO opens the PR), JOY merges.

### 6. Flags

`RATE_ITEM_MODEL` has three values: `off` (default; any unknown value reads as `off`), `item` (Item-first matching, writes `item_id`; every listing still has a variant), `nullable_variant` (as `item`, and a listing with no stated size on a multi-size Item gets `cluster_id = NULL`).

- **Order:** importer `item` -> web `item` (Vercel Preview, check, then Production) -> importer `nullable_variant`.
- **Verify:** after each switch, the M1+M2 verification file returns 0 on every expect-0 check; on the web, an old variant URL 308-redirects to its Item page (the Item E2E job covers this in CI).
- **Roll back:** set the env back to `off` and redeploy; data written meanwhile stays valid under `off` (the sync triggers keep the old columns consistent).
- **Who:** importer env in Rate Services; web env in Vercel (JOY).

### 7. Compatibility window (conditions before M3/M4)

- `RATE_ITEM_MODEL` on for the importer and the web for at least one promote cycle.
- Rate Services Item-aware code shipped (step 5).
- M1+M2 verification at 0 after the last writer changed (the reconciliation).
- No listing without an Item: `SELECT count(*) FROM rate.products WHERE item_id IS NULL` = 0 (M4 aborts otherwise).
- Sitemap re-crawled with Item URLs (about 30 days).
- Active price alerts on `unknown` variants of multi-size Items decided (V7 of the M3/M4 verify file): each moved to a sized variant or closed. M3 aborts while one is active.
- **Roll back the window:** flags `off`.

### 8. M3: retire `unknown` on multi-size Items

- **Changes:** aborts on a sized earbuds key or an active alert on an `unknown` to retire (`price_alerts` locked against writes while it runs). Then archives the live `unknown` variant of every multi-size Item through `retire_item_unknown_variant`; its listings keep their Item with no variant; stats refresh. Backup table `rate.m3_unknown_variant_backup` (RLS on, service role only) records exactly what changed. Single-size Items (earbuds, sizeless lines) untouched.
- **File:** `2026-10-29-dos-me-m3-m4.sql`, first transaction. Writers paused.
- **Verify:** `2026-10-29-dos-me-m3-m4-verify.sql` V1 and V5 return 0; V6 (work done) and V7 (alerts) for information.
- **Roll back:** `2026-10-29-dos-me-m3-m4-rollback.sql`, writers paused: restores the variants and only the listings still carrying the retire marker (a NOTICE counts any changed since), refreshes stats, drops the backup table.
- **Who:** JOY through DOS-Me.

### 9. M4: constraints

- **Changes:** aborts unless every variant and listing has an Item; `master_products.item_id NOT NULL`; `products_item_id_not_null` CHECK (added NOT VALID, validated in its own transaction so the listings table stays readable and writable); guard trigger (a listing's variant belongs to its Item); `items.default_variant_id` filled, plus a trigger filling it for new Items.
- **File:** `2026-10-29-dos-me-m3-m4.sql`, second and third transactions.
- **Verify:** M3/M4 verify V2, V3, V4 return 0, and the M1+M2 verification file again.
- **Roll back:** the first transaction of the same rollback file undoes M4 alone; its second transaction then undoes M3.
- **Who:** JOY through DOS-Me.

## Open decisions for JOY

Each has a recommendation, which is the default if JOY agrees.

1. **(M1+M2) `match_item` filters by brand, not by model.** The design names a model argument; filtering by it only finds the exact model, which Tier 1 already does. **Recommend: brand.**
2. **(M1+M2) An Item with no reviews stores rating 0**, like the variant columns today; the web shows "no rating" when the review count is 0. **Recommend: keep 0.**
3. **(M1+M2) `rate.v_products_with_merchant_trust` is not changed.** Adding `item_id` breaks a re-run of `20261018153000`; readers take `item_id` from `rate.products`. **Recommend: leave the view.**
4. **(M1+M2, updated by M3) Price alerts on an `unknown` variant.** An alert needs a size. M1+M2 leaves them on the variant; M3 now refuses to run while one is active, so JOY decides each one before M3: move it to a sized variant or close it. **Recommend: decide per alert from V7 before M3.**
5. **(M1+M2) Admin override name `rate.variant_override`.** Any admin tool that re-assigns a hand-set variant sets it locally. **Recommend: approve the name.**
6. **(M3/M4) M4 keeps the M1 sync triggers.** The design drops them; the importer still relies on them to create a new Item when it seeds a master. The M4 guard is the backstop; dropping them waits until the importer inserts Items itself. **Recommend: keep them.**
7. **(M3/M4) No master-side guard on a variant's Item change.** M1's move-listings trigger moves the listings in the same statement, and V3 checks the result. **Recommend: no extra guard.**
8. **(M0) Approve the M0 data write, including `apple:airpods-pro-2-usbc` becoming Item `apple:airpods-pro-2`** (the normalizer does not split USB-C from Lightning; only USB-C is sold new). **Recommend: approve.**
9. **(CI) Make `E2E (Playwright, Item model)` a required check on `dev`.** It ran green with no retry on every run of PR #1273 (about 4 minutes). Branch protection is a repository setting. **Recommend: required.**
