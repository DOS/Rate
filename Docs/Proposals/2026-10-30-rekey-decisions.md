# Re-key decisions: watch spellings, gift words in keys, used listings

Date: 2026-10-30. Author: Core (Rate). Status: decision document for JOY. Nothing in it is applied. The Vietnamese HTML twin is `2026-10-30-rekey-decisions.html`.

Covers #1407 (the SE2 / Series10 half), #1441 (gift words in non-Apple keys), #1430 (used and like-new listings feeding the new-device price) and #1491 (c) and (d) (iPad Wi-Fi vs 5G, MacBook RAM).

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

## 5. #1491 (c) and (d): iPad Wi-Fi vs 5G, MacBook RAM

PR #1493 (merged) fixed parts (a) and (b) of #1491. Parts (c) and (d) add a key dimension, so they change where existing iPad and MacBook listings link. That is why they are here and not in code.

### 5.1 The problem

- **(c) iPad.** The Wi-Fi and the 5G (Cellular) iPad of one model and storage share one key. The 5G model costs about a third more, so one master mixes two prices. The spread checks read that as a fake sale, and the "from" price is the Wi-Fi one.
- **(d) MacBook.** RAM configurations of one model and SSD share one key, for example 24GB and 48GB under `macbook-pro-m5-pro-14:1024gb`. They are 25-50% apart in price.

### 5.2 Proposed suffix scheme

The scheme keeps today's key for the base configuration and adds a suffix only for the other one. A master holding both configurations keeps its key and loses only the other configuration's listings to a new master. A master holding **only** the other configuration moves whole to the suffixed key, which the dry run shows as a rename (5.4).

| Part | Base configuration (key unchanged)               | Other configuration (new key)                            |
| :--- | :----------------------------------------------- | :------------------------------------------------------- |
| (c)  | Wi-Fi: `apple:ipad-air-m4-11:128gb`              | 5G/Cellular: `apple:ipad-air-m4-11-5g:128gb`             |
| (d)  | Base RAM (16GB): `apple:macbook-air-m3-13:256gb` | Other RAM (8GB): `apple:macbook-air-m3-13-8gb-ram:256gb` |

- **(c)** needs no table: a title that says 5G, Cellular or LTE gets the suffix, and anything else is Wi-Fi, as today.
- **(d)** needs a table of the base RAM per MacBook model, which is code plus data. The base RAM is the one the seeded master's specs carry, so a master never loses the listings its specs describe. For example, the seeded `apple:macbook-air-m3-13:256gb` is 16GB, so 16GB keeps the key and 8GB gets the suffix. A title with no RAM keeps the base key, as today.

### 5.3 Keys and rows affected (estimated from code and the RS title corpus, counts only)

- **(c) iPad, keys mixing Wi-Fi and 5G titles today: 6.** These are `apple:ipad-mini-7:128gb`, `apple:ipad-pro-m4-11:256gb`, `apple:ipad-pro-m4-11:unknown`, `apple:ipad-pro-m5-11:1024gb`, `apple:ipad-pro-m5-11:unknown` and `apple:ipad-air-m3-11:128gb`. Each keeps its key and loses its 5G listings to a `-5g` master.
- **(c) iPad, keys whose titles are all 5G: 8.** A master on one of them moves whole to the `-5g` key, a rename in the dry run's sense.
- **(d) MacBook, keys mixing RAM today: 1.** This is `apple:macbook-air-m3-13:256gb` (8GB and 16GB). Four more keys carry a single RAM in their titles. Such a master is renamed only if that RAM differs from the base RAM in the table.
- **Seeded masters touched:**
  - `apple:ipad-pro-m5-11:256gb` (published) and `apple:ipad-pro-m4-11:256gb`, only through their 5G listings;
  - `apple:macbook-air-m3-13:256gb`, through its 8GB listings.
- Core has no database access, so the stored counts come from the dry run (5.4).

### 5.4 How the dry run (PR #1456) lists them

The read-only dry run compares each master's stored key with what the normalizer gives for its own listings' titles. To list (c) and (d):

1. Build the normalizer from the branch that adds the suffixes (not merged), and point the dry run at it with `--normalizer <path>`.
2. A master whose listings are **mostly** the other configuration (all-5G keys) shows as a proposed move to the `-5g` key, with its listing and price-row counts.
3. A master whose listings are **mostly** the base configuration keeps its key, so today's dry run does not list the minority that would leave. A small extension prints, per master, the listings whose new key differs. It is still read-only, and it runs before D5 and D6 are decided.

The data step after JOY's OK is M0-style:

- create the new masters;
- move the other configuration's listings;
- refresh both masters' stats;
- ship verify and rollback files and a CI replay.

The normalizer change ships in the same release.

## 6. Decisions for JOY

- **D1. Watch spellings (#1407):** A (re-key and normalize), B (alias) or C (leave). Recommended: A.
- **D2. Gift words in keys (#1441):** approve the read-only count now, then the M0-style data step. Recommended: yes. The split has already started since PR #1433.
- **D3. Used listings (#1430):** A now and B later, B now, or leave. Recommended: A now, B as a planned DOS-Me migration.
- **D4. Who runs the counts:** the read-only counts in D1 to D3 (and D5, D6) need SELECT access on production, which Core does not have. Recommended: the DOS-Me side runs them, and Core prepares the SQL in the same docs PR as each data step.
- **D5. iPad Wi-Fi vs 5G (#1491 c), in two steps.**
  - Now: approve the read-only dry run of 5.4 with the suffix branch.
  - Then, with its counts: choose the suffix scheme of section 5.2 (Wi-Fi keeps its key, 5G gets `-5g`) or leave the two in one key.
  - Recommended: the suffix scheme. It gates wave 1b of the catalog expansion.
- **D6. MacBook RAM (#1491 d), in two steps.**
  - Now: Core writes the base-RAM table and its tests, so JOY sees every base RAM, and the dry run lists the moves.
  - Then: choose the suffix scheme or leave.
  - Recommended: the suffix scheme.

## 7. Order

1. D1 to D4 decided, and the first step of D5 and D6 approved.
2. Read-only counts (DOS-Me / JOY), including the dry run of 5.4. Then the second step of D5 and D6 is decided.
3. Core writes each data step with its verify, rollback and CI replay, in a proposal PR. The PO reviews it, and JOY applies it through DOS-Me (preview, beta, then prod).
4. In the same release, Core ships the matching normalizer change, with a key diff over the fixtures and the RS corpus (counts only).
5. RS bumps its vendor copy, runs `audit-catalog` and checks that no master lost its listings.
