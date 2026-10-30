# Re-key decisions: watch spellings, gift words in keys, used listings

Date: 2026-10-30. Author: Core (Rate). Status: decision document for JOY. Nothing in it is applied. The Vietnamese HTML twin is `2026-10-30-rekey-decisions.html`.

Covers #1407 (the SE2 / Series10 half), #1441 (gift words in non-Apple keys) and #1430 (used and like-new listings feeding the new-device price).

## 1. Why these wait for JOY

The matcher links a crawled listing to a master by **exact `model_key`**. When the normalizer starts producing a different key for the same product, three things happen:

- New listings go to the new key.
- If no master has the new key, a new one is created.
- The old master stops receiving listings, so its price and offers go stale.

Fixing the normalizer alone therefore splits one product into two pages. Each item below needs a **data step on production** (a re-key or a merge, run through DOS-Me) in the same release as the code change. That is JOY's decision.

The precedent is M0 (`2026-10-29-dos-me-m0-seed-rekey.md`, #1123). M0 was:

- one idempotent SQL transaction;
- a re-key in place (ids, slugs, listings, reviews and alerts unchanged);
- a skip with a NOTICE when the target key already exists (a merge is reviewed by hand, never automatic);
- rollback markers kept in `metadata`;
- shipped with a read-only verify file, a rollback file and a CI replay.

## 2. #1407: watch spellings that key apart

- "Apple Watch SE2 40mm" keys `apple:watch-se2-40mm:unknown`, while "Apple Watch SE 2 40mm" keys `apple:watch-se-2-40mm:unknown`. "SE3" and "SE2022" behave the same way.
- "Apple Watch Series10 46mm" keys `apple:watch-series10:unknown`, while "Series 10 46mm" keys `apple:watch-series-10-46mm:64gb`.
- The normalizer change is one line, and was held back from PR #1405 for this reason.

Options:

- **A. Re-key and normalize (recommended).** First, a read-only count of the masters whose key holds `se2`, `se3`, `se2022` or `series1x` written together. Then an M0-style data step that renames each to the spaced key, or, when the spaced master exists, moves its listings there and archives the old row. Then the normalizer line ships in the same release.
- **B. Alias in the matcher.** A small map from old to new key before Tier 1. No data step, but the alias table stays forever and every reader of `model_key` must know it.
- **C. Leave as is.** The two spellings stay two products.

## 3. #1441: gift words inside non-Apple keys

PR #1433 (#1429, merged) already cuts the model at "tặng", "kèm", "quà" and "+". New listings now key `samsung:galaxy-s25:unknown` where they used to key `samsung:galaxy-s25-tang-tai:unknown`.

So any stored master whose key absorbed a gift word (`-tang-…`, `-kem-…`) has **already stopped receiving new listings**, and new ones go to the clean key. This makes the data step more urgent than when #1441 was filed. On the 1,208-title RS corpus, the change moved 3 keys of this kind. Stored masters were not counted, because Core has no database access.

Recommended steps:

1. A read-only count, on the DOS-Me / JOY side, of the masters and listings whose `model_key` holds `-tang`, `-kem` or `-qua` as a token, with the clean key each should have.
2. An M0-style data step:
   - re-key in place where the clean key is free;
   - where the clean key exists, move the listings to it, refresh both masters' stats, and archive the old row;
   - verify and rollback files, plus a CI replay.
3. Items 2 and 3 of #1441 (category patterns for brand lines, and a gift right before a real size) are code-only. Core does them after step 2, each with a key diff.

## 4. #1430: used and like-new listings

- The normalizer marks a listing's condition (`new`, `like_new_99`, `used`, `refurbished`) and sets `needs_review` for a non-new device.
- The matcher uses this only when it **creates** a master. A used listing that links to an existing new-device master counts like a new one.
- `refresh_master_market_stats` does not look at condition. So a used listing's lower price can become the new device's `min_price` and drive the deal radar.

Options:

- **A. Drop non-new listings at ingest (recommended now).** Code only, no DDL: the pipeline rejects a listing whose condition is not `new`, as it rejects an unkeyable one. Used offers disappear from rate.vn until B.
- **B. Store condition and filter the stats (recommended later).** DDL through DOS-Me: a `condition` column on `rate.products`, `refresh_master_market_stats` and the radar skip non-new rows, and the product page can show used offers in their own group.
- **C. Link but flag.** Needs the same column as B. On its own it adds little over B.

Before either: a read-only count of stored listings whose title holds a used or like-new marker ("Like new", "99%", "Cũ", "Đã qua sử dụng"), on the DOS-Me / JOY side.

## 5. Decisions for JOY

- **D1. Watch spellings (#1407):** A (re-key and normalize), B (alias) or C (leave). Recommended: A.
- **D2. Gift words in keys (#1441):** approve the read-only count now, then the M0-style data step. Recommended: yes. The split has already started since PR #1433.
- **D3. Used listings (#1430):** A now and B later, B now, or leave. Recommended: A now, B as a planned DOS-Me migration.
- **D4. Who runs the counts:** the read-only counts in D1 to D3 need SELECT access on production, which Core does not have. Recommended: the DOS-Me side runs them, and Core prepares the SQL in the same docs PR as each data step.

## 6. Order

1. D1 to D4 decided.
2. Read-only counts (DOS-Me / JOY).
3. Core writes each data step with its verify, rollback and CI replay, in a proposal PR. The PO reviews it, and JOY applies it through DOS-Me (preview, beta, then prod).
4. In the same release, Core ships the matching normalizer change, with a key diff over the fixtures and the RS corpus (counts only).
5. RS bumps its vendor copy, runs `audit-catalog` and checks that no master lost its listings.
