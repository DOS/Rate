# Catalog expansion: current-generation phones (proposal)

Date: 2026-10-30. Author: Core (Rate). Status: proposal, for JOY's decisions in section 6. Read-only research: no database was read or written. The Vietnamese HTML twin is `2026-10-30-catalog-expansion.html`.

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

- **D1. Scope of the first batch.** Recommended: tiers A1 to A3, about 25 storage variants. B and C follow once A is crawled and published.
- **D2. Publishing rule.** Choose one:
  - (a) Publish a seeded draft automatically once it has at least one in-stock crawled offer that passed the master check. This is a code change in RS or the importer, with no DDL.
  - (b) Publish by hand per batch after the audit. This is a data step each time.
  - Recommended: (a), with a minimum of 2 merchants for tier C.
- **D3. Approve the seed run** (`backfill-specs --apply`) on production for the approved batch. It is a data write, not DDL.
- **D4. Variants without an offer.** Show them in the storage selector as "chưa có giá" (recommended: buyers see that the size exists), or hide them until they have an offer.
- **D5. Base iPhone 18 and 18e.** Wait until a VN chain sells them (recommended), or seed them as drafts now so discovery starts early.

## Sources

- Tuổi Trẻ, iPhone 18 lineup prices in Vietnam: https://news.tuoitre.vn/iphone-18-lineup-prices-in-vietnam-iphone-duo-tops-4000-103260910153921165.htm
- VietNamNet, Apple reveals Vietnam prices for iPhone 18 Pro and the foldable Duo: https://vietnamnet.vn/en/apple-reveals-vietnam-prices-for-iphone-18-pro-and-foldable-duo-2553978.html
- FPT Shop, iPhone 18 Pro series price list: https://fptshop.com.vn/tin-tuc/danh-gia/bang-gia-iphone-18-212900
- Counterpoint Research, iPhone 17 global best-selling smartphone in Q2 2026: https://counterpointresearch.com/en/insights/iphone-17-global-best-selling-smartphone-in-q2-2026
- Lao Động, Vietnamese consumers shifting to high-end smartphones: https://news.laodong.vn/cong-nghe/nguoi-tieu-dung-viet-nam-dang-dich-chuyen-len-smartphone-cao-cap-1757322.ldo
- Viettablet, Galaxy S26 series: https://www.viettablet.com/dien-thoai/dien-thoai-samsung-1/galaxy-s26-series
