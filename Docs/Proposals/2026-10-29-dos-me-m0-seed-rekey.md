# Proposal: DOS-Me data step M0, seed key re-key (DOS/Rate#1212, #1123)

**Status:** proposal for JOY, **not applied**. A production data write: JOY approves and applies it through DOS-Me (preview, then beta, then prod), **before** the M1+M2 Item migration ([`2026-10-28-dos-me-m1-m2-items.md`](./2026-10-28-dos-me-m1-m2-items.md)).

Inventory: the M0 comment on #1150 (2026-10-28, anon read of prod: 37 masters, 6 drifted keys, no duplicate, no slug collision). Design: [`2026-10-27-item-variant-listing-model.md`](./2026-10-27-item-variant-listing-model.md), section 7 "M0".

## Files

| File                                                                                             | What                                                                                                                                                                                                   |
| :----------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`2026-10-29-dos-me-m0-seed-rekey.sql`](./2026-10-29-dos-me-m0-seed-rekey.sql)                   | Data only, one transaction, idempotent.                                                                                                                                                                |
| [`2026-10-29-dos-me-m0-seed-rekey-rollback.sql`](./2026-10-29-dos-me-m0-seed-rekey-rollback.sql) | Restores keys and storage from the recorded markers; re-runnable. Only before M1+M2 (or after rolling M1+M2 back).                                                                                     |
| [`2026-10-29-dos-me-m0-seed-rekey-verify.sql`](./2026-10-29-dos-me-m0-seed-rekey-verify.sql)     | Read-only: V1 to V4 expect 0 after; V5 is the pre-check listing every touched key.                                                                                                                     |
| [`scripts/test-m0-seed-rekey-proposal.mjs`](../../scripts/test-m0-seed-rekey-proposal.mjs)       | CI replay: the six drifted masters with listings, M0 twice, its checks, M1+M2 on top (all Item checks pass, Items under the normalizer keys), both rollbacks, and the skip when a target key is taken. |

## What it changes

| Stored `model_key`              | New `model_key`                    | Status (inventory) | Listings |
| :------------------------------ | :--------------------------------- | :----------------- | -------: |
| `samsung:galaxy-buds3-pro:64gb` | `samsung:galaxy-buds3-pro:unknown` | published          |        4 |
| `apple:airpods-pro-3:standard`  | `apple:airpods-pro-3:unknown`      | published          |        9 |
| `sony:wf-1000xm5:64gb`          | `sony:wf-1000xm5:unknown`          | draft              |        8 |
| `sony:wf-1000xm6:standard`      | `sony:wf-1000xm6:unknown`          | draft              |        9 |
| `apple:airpods-pro-2-usbc:64gb` | `apple:airpods-pro-2:unknown`      | draft              |        4 |
| `apple:watch-ultra-3-49mm:64gb` | `apple:watch-ultra-3:64gb`         | draft              |        4 |

- **Re-key in place.** Ids and slugs do not change, so listings, price alerts, reviews and public URLs keep pointing at the same rows; nothing is archived or merged. A rename whose target key is already taken is skipped with a NOTICE and shows in V1 (a reviewed merge, never an automatic one; the inventory found none).
- **Earbuds carry no storage:** `storage_gb = NULL` on every earbuds master (today 64, 64, 64, 1, 1 on the five rows above).
- **Markers for the rollback:** `metadata.m0_rekeyed_from` (old key) and `metadata.m0_storage_gb_before`.
- `apple:airpods-pro-2-usbc` becomes Item `apple:airpods-pro-2`: the normalizer does not split USB-C from Lightning (only USB-C is sold new today).

## Order of operations

1. Pre-check: run V5 (and V1 to V4) on beta and prod; compare with the table above.
2. Apply this file (beta, verify, then prod, verify).
3. **Right after**, merge the seed change below. Do not run `jobs/backfill-specs.ts --apply` between steps 2 and 3: it looks masters up by the seed key and inserts one when none is found, which would re-create the old keys as duplicates.
4. Then M1+M2 (`2026-10-28-dos-me-m1-m2-items.sql`).

## Seed change that ships right after (not in this PR)

`apps/importer/src/shopee/flagship-seed-data.ts`:

| Seed                     | `model_key`                                                           | `storage_gb` |
| :----------------------- | :-------------------------------------------------------------------- | :----------- |
| AirPods Pro 2 USB-C      | `apple:airpods-pro-2-usbc:64gb` -> `apple:airpods-pro-2:unknown`      | 64 -> `null` |
| Sony WF-1000XM5          | `sony:wf-1000xm5:64gb` -> `sony:wf-1000xm5:unknown`                   | 64 -> `null` |
| Samsung Galaxy Buds3 Pro | `samsung:galaxy-buds3-pro:64gb` -> `samsung:galaxy-buds3-pro:unknown` | 64 -> `null` |
| Apple Watch Ultra 3      | `apple:watch-ultra-3-49mm:64gb` -> `apple:watch-ultra-3:64gb`         | unchanged    |
| AirPods Pro 3 USB-C      | `apple:airpods-pro-3:standard` -> `apple:airpods-pro-3:unknown`       | -> `null`    |
| Sony WF-1000XM6          | `sony:wf-1000xm6:standard` -> `sony:wf-1000xm6:unknown`               | -> `null`    |

(The `FlagshipDeviceSeed.storage_gb` type is `number | null`, so `null` needs no type change.) The Core session opens this as a separate PR once JOY schedules the data step; it must not merge before the data is re-keyed.

## Rollback

`2026-10-29-dos-me-m0-seed-rekey-rollback.sql`, with the seed change reverted in the same step. If M1+M2 is applied, roll it back first (its Items are keyed on the new keys). A key that a newly seeded master took meanwhile is skipped with a NOTICE.
