# Catalog expansion: current-generation phones (proposal)

Date: 2026-10-30. Author: Core (Rate). Status: proposal, for JOY's decisions in section 6; section 7 adds the measured gap list from Rate Services (RS#790). Read-only research: no database was read or written. The Vietnamese HTML twin is `2026-10-30-catalog-expansion.html`.

## 1. Why

JOY asked why newer phones such as the iPhone 18 and 18 Pro Max are missing. Today rate.vn publishes 16 masters. The smartphones among them are iPhone 15, 16, 16 Plus, 16 Pro Max, 16e, 18 Pro 256GB, 18 Pro Max 256GB and Galaxy S24 Ultra. The Galaxy S26 Ultra master exists but is a draft (RS#762).

Three gaps cause this:

1. **Seeds.** Each family is seeded in one storage only. For example, the iPhone 18 Pro Max is seeded at 256GB, but it sells at 256GB, 512GB, 1TB and 2TB.
2. **Seed list.** The iPhone 17 family is not in the seed list at all.
3. **Publishing.** A seeded master starts as a draft and has no automatic path to `published`.

## 2. What to add, ranked by demand

The ranking draws on global sales (Counterpoint: the iPhone 17 was the world's best-selling phone in Q1 and Q2 2026, and the Galaxy S26 Ultra was the best-selling Android phone in Q2) and on Vietnamese retail reporting (the iPhone 17 series sits on the CellphoneS, Thế Giới Di Động and FPT Shop best-seller lists, and the S26 Ultra drew strong interest at launch). It is not a Vietnam-specific unit ranking, so check it against RS listing counts after the first crawl.

| Tier | Family                                                                          | Storages to seed                                                                | Note                                                                                                                                            |
| :--- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | iPhone 17, 17 Pro, 17 Pro Max                                                   | 17: 256GB, 512GB. 17 Pro: 256GB, 512GB, 1TB. 17 Pro Max: 256GB, 512GB, 1TB, 2TB | Best-selling phone of 2026. Not in the seed list today.                                                                                         |
| A2   | iPhone 18 Pro, 18 Pro Max                                                       | 256GB, 512GB, 1TB, 2TB (both)                                                   | On sale in Vietnam since 18 Sep 2026. Pro Max launch prices: 41.999.000đ / 48.499.000đ / 61.499.000đ / 80.999.000đ. Only 256GB is seeded today. |
| A3   | Galaxy S26 Ultra, S26+, S26                                                     | Ultra: 256GB, 512GB, 1TB. S26+ and S26: 256GB, 512GB                            | The Ultra master is a draft (RS#762). The S26 and S26+ are missing.                                                                             |
| B1   | iPhone Duo (foldable)                                                           | 256GB, 512GB, 1TB, 2TB                                                          | Launched Sep 2026 from 64.999.000đ. Low volume but high search interest.                                                                        |
| B2   | iPhone Air, iPhone 17e                                                          | Air: 256GB, 512GB, 1TB. 17e: check the retailer pages                           | Check before seeding: storages and Vietnamese availability.                                                                                     |
| B3   | Galaxy Z Fold8, Z Flip8                                                         | Fold8: 256GB, 512GB. Flip8: 256GB, 512GB                                        | Listed by the VN chains.                                                                                                                        |
| C    | Xiaomi 17 series, OPPO Find X9 / X9 Pro, vivo X300 / X300 Pro, Galaxy A57 / A37 | Check each against the retailer pages                                           | Mid-range A-series volume is high in Vietnam. Xiaomi 17 Pro Max and OPPO Find X9 Pro are seeded already in one storage.                         |

Not yet: the base iPhone 18 and 18e. The sources found list only the 18 Pro, the 18 Pro Max and the Duo as on sale. Seed them only once a VN chain sells them.

Every seed must use the normalizer's own key (for example `apple:iphone-18-pro-max:512gb`). The matcher links crawled listings to masters by exact key (Tier 1), so a key the normalizer would not produce is never matched.

## 3. How masters are created (no DDL)

1. **Specs and seeds (Core PR).** Add each family to `CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY` and each storage to `FLAGSHIP_DEVICES_TO_SEED` in `apps/importer/src/shopee/flagship-seed-data.ts`.
   - Specs come from GSMArena / PhoneArena in the 10 field groups.
   - Seeds carry no prices, listings, merchants or reviews: those come only from real crawls.
   - The existing tests check every seed key against the normalizer.
2. **Seed run (prod data write, JOY approves).** `pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/backfill-specs.ts`:
   - First as a dry run, which prints "WOULD INSERT" per device.
   - Then with `--apply`, which inserts the missing masters as `draft` and updates specs.
   - This writes production data, so it needs JOY's approval and runs through the usual production step. It is not DDL.
3. **Crawling (RS).** Discovery searches the retail sites for each master's name (`search-discovery.ts`). Listings that pass the worker's master check are linked, and prices, merchant counts and history fill in.
4. **Publishing (gap).** A seeded master stays `draft`. The importer publishes only masters it creates itself (Tier 3), with verified specs and a new-device title. No step publishes a seeded draft once it has offers. See decision D2.

A master the importer creates from a crawled listing (Tier 3) is published at once when its specs come from the registry in step 1. So adding specs alone already lets organically found listings create published masters. Discovery, however, searches only for masters that exist, which is why the seeds are needed.

## 4. Role of the Item model

Under the Item model (#1150), one Item stands for one model (for example `apple:iphone-18-pro-max`), and each storage is a variant of it.

- `flagshipSeedsByItem()` groups the seeds by Item, so `backfill-specs` sets the Item's specs once and creates one variant per storage.
- A product page is per Item, with a storage selector; a storage with no offer yet appears as a variant without a price.
- Seeding every storage therefore fills the selector instead of creating separate thin pages.
- The rule "no storage on an Item" (#1208) stays: storage lives on the variant.
- An Item is published with its variants (the M1 sync triggers).

## 5. What Rate Services must do

1. **Bump `vendor/rate`** to the sha with the new seeds, so discovery and the worker see the new keys.
2. **Run discovery for the new masters.** `probe-discovery` with `probe_masters=<name>` checks that each master finds pages on the chains RS covers (FPT, CellphoneS, Thế Giới Di Động, Di Động Việt, Hoàng Hà, Shopee, Lazada and others). Report the masters with no hit.
3. **Watch the crawl budget.** About 40 new masters add discovery and warm jobs every cycle, so check the warm backlog lines (`warm-refresh-cadence.md`).
4. **Audit after the first cycles.** In `audit-catalog`, "Master products with no crawled listing" should shrink, and no new listing should fail the master check.

## 6. Decisions for JOY

- **D1. Scope of the first batch (revised after the RS#790 gap list, section 7).** Recommended: wave 1 is the 22 families and 68 keys of section 7.2, in two steps.
  - **Wave 1a, phones:** 14 families, 39 keys, 37 of them new. It starts once the Fold/Flip spacing fix (#1491 a) has shipped and Rate Services confirms it has the crawl capacity for it.
  - **Wave 1b, iPads and MacBooks:** 8 families, 29 keys. It waits until #1491 (c) and (d) give Wi-Fi/5G iPads and MacBook RAM configurations keys of their own. Without that, one master would mix configurations 25-50% apart in price, and the spread checks would read that as a fake sale.
  - **Wave 2:** the Xiaomi, Honor and OPPO families, MacBook Pro M5 Pro/Max, and configurations sold by only one chain. It follows once wave 1 is crawled and published.
  - This replaces the earlier "A1 to A3, about 25 storage variants".
- **D2. Publishing rule.** Choose one:
  - (a) Publish a seeded draft automatically once it has at least one in-stock crawled offer that passed the master check. This is a code change in RS or the importer, with no DDL.
  - (b) Publish by hand per batch after the audit. This is a data step each time.
  - Recommended: (a), with a minimum of 2 merchants for tier C.
- **D3. Approve the seed run** (`backfill-specs --apply`) on production for the approved batch. It is a data write, not DDL.
- **D4. Variants without an offer.** Show them in the storage selector as "chưa có giá" (recommended: buyers see that the size exists), or hide them until they have an offer.
- **D5. Base iPhone 18 and 18e.** Wait until a VN chain sells them (recommended), or seed them as drafts now so discovery starts early. RS#790 confirms that none of the six chains sells the base iPhone 18 yet.
- **D6. Draft masters with no model on sale.**
  - `xiaomi:17-pro-max:512gb` and `xiaomi:18-pro-max:512gb` have no listing, and no chain sells those models. `apple:iphone-16-pro:256gb` has no listing either; the only new 16 Pro on sale is a 128GB.
  - Choose one: archive them (a data write, recommended) or leave them as drafts. Discovery spends a search on each every cycle while they exist.

## 7. Measured gap list (RS#790)

Rate Services checked which current models six large Vietnamese retail chains sell, keyed with the current normalizer, and compared them with the masters on rate.vn (DOS/Rate-Services#790, read-only, 30 Oct 2026). Marketplaces were not part of the check. Only aggregate counts and model names are kept here; the scan details stay with Rate Services.

### 7.1 Size of the gap

| Group                                        | Families | Storage keys | Masters today |
| :------------------------------------------- | -------: | -----------: | ------------: |
| Current generation, 3+ chains                |       50 |          122 |             3 |
| of which phones                              |       32 |           69 |             2 |
| of which tablets                             |       10 |           30 |             1 |
| of which laptops                             |        8 |           23 |             0 |
| Current generation, 2 chains                 |        7 |           11 |             0 |
| Previous generation still on sale, 2+ chains |       14 |           32 |             2 |

- **About 119 masters are missing** for the current generation sold by 3+ chains. The three that exist are iPhone 18 Pro 256GB, iPhone 18 Pro Max 256GB and iPad Pro M5 11 256GB.
- **Not on sale at any of the six chains:** the base iPhone 18, Xiaomi 17 Pro Max, Xiaomi 18, Pixel 10 and Honor Magic8. The iPhone Duo and vivo X300 Pro/Ultra are sold by a single chain.

### 7.2 Wave 1 shortlist: 22 families, 68 keys

| Group   | Families and storage keys                                                                                                                                                                             | Keys |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: |
| iPhone  | 17 (256GB, 512GB), 17 Pro (256GB, 512GB, 1TB), 17 Pro Max (256GB, 512GB, 1TB, 2TB), 17e (256GB, 512GB), Air (256GB, 512GB, 1TB), 18 Pro (256GB, 512GB, 1TB, 2TB), 18 Pro Max (256GB, 512GB, 1TB, 2TB) |   22 |
| Galaxy  | S26 (256GB, 512GB), S26 Plus (256GB, 512GB), S26 Ultra (256GB, 512GB, 1TB), S26 FE (128GB, 256GB), Z Fold8 (256GB, 512GB, 1TB), Z Fold8 Ultra (256GB, 512GB, 1TB), Z Flip8 (256GB, 512GB)             |   17 |
| iPad    | A16 (128GB, 256GB, 512GB), Air M4 11 (128GB, 256GB, 512GB, 1TB), Air M4 13 (128GB, 256GB, 512GB, 1TB), Pro M5 11 (256GB, 512GB, 1TB, 2TB), Pro M5 13 (256GB, 512GB, 1TB, 2TB)                         |   19 |
| MacBook | Air M5 13 (512GB, 1TB, 2TB, 4TB), Air M5 15 (512GB, 1TB, 2TB, 4TB), Neo (256GB, 512GB)                                                                                                                |   10 |

- 65 of the 68 keys are new; three are the masters that exist today.
- Phones are wave 1a, with 39 keys, 37 of them new. iPads and MacBooks are wave 1b, with 29 keys (D1).
- Crawl capacity for wave 1 is a Rate Services matter and is agreed there.

### 7.3 Normalizer blockers before bulk creation (#1491)

Bulk creation must wait on four problems:

- **(a) Spaced names.** "Z Fold 8" and "Z Fold 8 Ultra" both key to `galaxy-z-fold-8`, while the other chains write "Fold8". Two phones end up on one key, and one phone on two keys.
- **(b) iPad mini (2026).** It keys to `ipad-mini` at three chains and to `ipad-mini-8` at the other three.
- **(c) iPad Wi-Fi and 5G.** Both share one key, for example `ipad-air-m4-11:128gb`, although the 5G model costs about a third more.
- **(d) MacBook RAM.** RAM configurations share one key, for example 24GB and 48GB under `macbook-pro-m5-pro-14:1024gb`.

(a) and (b) are plain fixes. (c) and (d) change existing iPad and MacBook keys, so they go behind the re-key plan (`2026-10-30-rekey-decisions.md`) and wait for JOY.

### 7.4 Collision check for JOY (read-only)

RS could check its keys only against 22 of the 37 masters: the 16 published ones and 6 drafts with no listing. The 15 drafts with listings need a database read on the Core side. The statement below only reads, inside a transaction that is rolled back, and lists every existing master in the wave 1 families with its listing count:

```sql
BEGIN READ ONLY;
SELECT m.model_key, m.status, count(p.id) AS listings
FROM rate.master_products m
LEFT JOIN rate.products p ON p.cluster_id = m.id
WHERE split_part(m.model_key, ':', 1) || ':' || split_part(m.model_key, ':', 2) = ANY (ARRAY[
  'apple:iphone-17', 'apple:iphone-17-pro', 'apple:iphone-17-pro-max', 'apple:iphone-17e',
  'apple:iphone-air', 'apple:iphone-18-pro', 'apple:iphone-18-pro-max',
  'samsung:galaxy-s26', 'samsung:galaxy-s26-plus', 'samsung:galaxy-s26-ultra', 'samsung:galaxy-s26-fe',
  'samsung:galaxy-z-fold8', 'samsung:galaxy-z-fold8-ultra', 'samsung:galaxy-z-flip8',
  'samsung:galaxy-z-fold-8', 'samsung:galaxy-z-flip-8',
  'apple:ipad-a16', 'apple:ipad-air-m4-11', 'apple:ipad-air-m4-13', 'apple:ipad-pro-m5-11',
  'apple:ipad-pro-m5-13', 'apple:ipad-mini', 'apple:ipad-mini-8',
  'apple:macbook-air-m5-13', 'apple:macbook-air-m5-15', 'apple:macbook-neo'])
GROUP BY m.model_key, m.status
ORDER BY m.model_key;
ROLLBACK;
```

The list includes the spaced Fold/Flip keys and both iPad mini keys, so a master already created under a split key shows up too.

- **A key in the result is a collision.** The seed run would skip that key, and existing listings stay on it.
- **A spaced or split key with listings** needs a re-key under D1 of the re-key plan before wave 1 starts.

## Sources

- DOS/Rate-Services#790, catalog coverage gap list (Rate Services, 30 Oct 2026, read-only)

- Tuổi Trẻ, iPhone 18 lineup prices in Vietnam: https://news.tuoitre.vn/iphone-18-lineup-prices-in-vietnam-iphone-duo-tops-4000-103260910153921165.htm
- VietNamNet, Apple reveals Vietnam prices for iPhone 18 Pro and the foldable Duo: https://vietnamnet.vn/en/apple-reveals-vietnam-prices-for-iphone-18-pro-and-foldable-duo-2553978.html
- FPT Shop, iPhone 18 Pro series price list: https://fptshop.com.vn/tin-tuc/danh-gia/bang-gia-iphone-18-212900
- Counterpoint Research, iPhone 17 global best-selling smartphone in Q2 2026: https://counterpointresearch.com/en/insights/iphone-17-global-best-selling-smartphone-in-q2-2026
- Lao Động, Vietnamese consumers shifting to high-end smartphones: https://news.laodong.vn/cong-nghe/nguoi-tieu-dung-viet-nam-dang-dich-chuyen-len-smartphone-cao-cap-1757322.ldo
- Viettablet, Galaxy S26 series: https://www.viettablet.com/dien-thoai/dien-thoai-samsung-1/galaxy-s26-series
