# Design: Item / variant / listing data model

- **Date:** 2026-10-27
- **Issue:** [DOS/Rate#1129](https://github.com/DOS/Rate/issues/1129)
- **Status:** PROPOSAL, awaiting JOY's decisions (section 9). Nothing in this document has been applied. The SQL is a draft for review and must go through `DOS-Me/supabase/migrations/` with JOY's approval.
- **Vietnamese summary for JOY:** [`2026-10-27-item-variant-listing-model.html`](./2026-10-27-item-variant-listing-model.html)
- **Decides:** [DOS/Rate#1105](https://github.com/DOS/Rate/issues/1105) (Tier 2 links storage-less titles to a sized master).

JOY's target model, in JOY's words: one Item per product; the other storage sizes are variants of that Item; an Item has many listings.

## 0. Summary

- **Today, the storage variant is the unit everywhere.** `rate.master_products` has one row per `brand:model:storage`, and each has its own slug, page, sitemap entry, aggregates, alerts, rating and leaderboard slot. There is nothing above it. The UI and stats therefore count iPhone 17 Pro 256GB and 512GB as two products, and a sibling size can show up as a "competitor" or as a versus rival.
- **Recommendation: Option B, "add Item above the existing variant table".**
  - Add a new table, `rate.items`.
  - `master_products` stays the **variant** table, with new `item_id` and `variant_key` columns.
  - Listings (`rate.products`) gain `item_id`.
  - The existing `products.cluster_id` keeps meaning "this listing's variant". It becomes **NULL when the variant is unknown**.
- **Why this option.** Every price computation that must compare like with like keeps working unchanged, because they all group by `cluster_id`: per-variant min price, spread, deal radar, peer floors, merchant risk, price alerts. Item-level views (pages, directory, search, leaderboard, rating) are added on top.
- **Effect on #1105.** A storage-less listing attaches to the Item with no variant, instead of being fuzzy-linked to a sized master. Fuzzy matching moves to Item names, which carry no storage. Variant assignment becomes exact-only.
- **Migration.** Five additive DOS-Me phases with a compatibility window. Old variant slugs keep resolving and redirect to the Item page with the variant preselected. The published catalog is small today: 16 published masters, all with three-part keys, and no published Item has more than one size yet (read from the public API on 2026-10-27). The backfill is cheap. The real cost is code, mostly the web app and Rate-Services.

## 1. Survey of the current model

### 1.1 Database (schema `rate`)

`supabase/migrations/` in this repo is a reference copy. The DOS-Me ledger has eight later `rate` migrations that are not mirrored here: row provenance, audit aggregate RPCs, the `rate_worker` role, listing availability, the iPhone 16e offer move, review vote eligibility, plausible min price, and the product images bucket. `packages/shared-data/src/database.types.ts` is generated from the Rate copy only, so it lacks `origin`, `availability` and `spec_provenance`. Mirroring those is a prerequisite of phase M1 (section 7).

| Object | Level today | What it assumes | Source |
| :--- | :--- | :--- | :--- |
| `master_products` | storage variant | `UNIQUE(model_key)` and `UNIQUE(slug)`, both including storage. It holds every catalog attribute and aggregate: specs, images, `min_price`/`max_price`, `merchant_count`, `user_rating_weighted`, `authentic_review_count`, status. | `20261005130000_rate_recover_master_products.sql:28-83` |
| `products` (listings) | listing | `cluster_id` FK to one master, with NO ACTION on delete. There is no variant, condition or region column. Raw marketplace SKUs live in `models jsonb`. `UNIQUE(platform, platform_item_id)`. | `20260912120000_init_rate_schema.sql:81-108`, recover `:267-270` |
| `price_history` | listing | Keyed by `product_id`. There is no master-level history. | init `:137-146` |
| `reviews`, `review_flags`, `review_votes`, `review_analysis` | listing | Reviews never reference a master. `reviews.variation` is free text. | init `:151-182`, `20261014011054` |
| `price_alerts` | variant | `master_product_id` FK with CASCADE. The alert compares against the variant's `min_price`. | `20261015010000:10-27` |
| `promotions` | listing | `sku_scope` is the only SKU concept in the schema. | `20261005130001:612-635` |
| `crawl_jobs` | listing / platform | No master reference. Payloads carry master ids as JSON. | `20261005130001:25-73` |
| `match_master_product` | variant | Filter `($4 IS NULL OR mp.storage_gb = $4)`: a NULL storage drops the storage check (the cause of #1105). No status filter. The signature is pinned by the contract guard. | recover `:137-179`, `:283-292` |
| `search_master_products`, `get_category_brand_facets`, `search_catalog_autocomplete` | variant | Return one row per storage, and facet counts are inflated by the number of sizes. | `20261019060000`, `20261018120104:30-53`, `20261018120102:94-187` |
| `refresh_master_market_stats`, `refresh_master_product_rating` | variant | Aggregate over `products WHERE cluster_id = master`. | `20261018120103`, DOS-Me `20261024060000` |
| `submit_community_review` | variant to listing | Takes a master id, then writes the review onto that master's cheapest listing. | `20261018100000:45-271` |
| `upsert_price_alert` | variant | Resolves the master by slug. | `20261018120000:60-188` |
| `listing_price_context` (DOS-Me) | variant | Peer price floors are per `cluster_id`. | DOS-Me `20261018160000` |

**Notes**

- The contract guard in `20261005130000` checks master_products columns and types only at its own position in a replay. Later additive columns (for example DOS-Me's `spec_provenance`) do not trip it. Renaming or dropping one of the 28 pinned columns would, so this design **adds** columns and renames nothing.
- No trigger maintains `min_price` or `merchant_count`. Callers (importer, worker, auditors) invoke the refresh RPCs explicitly.

### 1.2 Importer (`apps/importer`)

- **Key shape.** `ProductNormalizer.normalize()` builds `model_key = slugify(brand):slugify(model + appleSize):{N}gb|unknown` in one place (`product-normalizer.ts:1685`). Name and slug include the storage only when it is known (`:1694-1700`). RAM, condition, region and colour never enter the key.
- **Registry.** `CANONICAL_PHONE_REGISTRY` (`:227`) is already keyed `brand:model` with no storage. **That is the Item key.**
- **Apple sizes.** Since #1113 and #1124, Apple screen and case sizes are folded into the model slug, for example `ipad-pro-m5-11` vs `ipad-pro-m5-13`. They are therefore already separate Items.
- **`:unknown` is overloaded.** It means "storage not stated" (`needs_review: true`) for phones. For earbuds it means "storage not applicable" (`needs_review: false`, `:1623-1626`).
- **`EntityMatcher.resolveOrCreateMasterProduct`** (`entity-matcher.ts:148-406`):
  - Tier 1: exact `model_key`.
  - Tier 2: `match_master_product` with `p_storage_gb` (NULL when unknown). Accepts at 0.70.
  - Tier 3: AI enrich, then insert a master, `draft` when `needs_review`.
  - `enrichMasterProductById` can back-fill `storage_gb` on an `:unknown` master without changing its key (`:530`).
- **Pipeline** (`shopee-to-supabase.ts:401-985`):
  - Upserts the listing with `cluster_id = masterId`.
  - Then calls `refresh_master_market_stats`.
  - Price history is per listing.
  - **Existing defect:** the listing's `priceMin` spans every marketplace variation (all storages), yet it is attributed to one sized master (`:598-605`).
  - `masterIdHint` (`:488-519`) lets Rate-Services pin a listing to a master.
- **Seeds** (`flagship-seed-data.ts`) list one sized key per device. Several seed keys never match what the normalizer produces:
  - earbuds seeded as `:64gb` or `:standard`, while the normalizer gives `:unknown`;
  - `apple:watch-ultra-3-49mm:64gb`, while the normalizer gives `apple:watch-ultra-3:64gb`.

  Tier 1 never hits these, which can create duplicates.
- **Spec enrichment** is per variant: the cache key includes storage and RAM (`ai-spec-enricher.ts:812`), although almost every spec is Item-level.
- **Rating refresh** is per master (`ai-review-analyzer.ts:2404`). Peer price floors group by `cluster_id` (`merchant-review-risk.ts:474-489`, `cluster-peer-floor.ts`).
- **Tests pinning the key format:**
  - `open-core-intelligence.test.ts` (~131 key assertions)
  - `entity-matcher.test.ts`
  - `shopee-to-supabase.test.ts`
  - `arena-audit.test.ts`
  - `dist-exports.smoke.mjs` (the Rate-Services contract)

### 1.3 Web, API v1, extension (`apps/web`, `apps/extension`)

- **One master is one page.**
  - Product pages: `/{category}/{slug}` (`app/[locale]/smartphones/[slug]/page.tsx`; other categories wrap it).
  - Canonical: the variant slug.
  - JSON-LD: a single `Product` with `sku = model_key` and its own AggregateOffer and AggregateRating. There is no `ProductGroup`.
  - Variants appear only as text in `variant_name` and `name`. There is no sibling list and no picker.
- **Sibling leaks.**
  - `rankRelatedCompetitors` (`lib/product-competitors.ts:63-93`) excludes only the same slug, so other sizes of the same model show as "direct competitors".
  - The same happens in versus links, leaderboard ranks, popular battles and the category "compare top 2".
- **Directory, search, facets, leaderboard, sitemap and home stats all count variants.**
  - `search_master_products`, `get_category_brand_facets`, `getSitemapRows`, `masterProductsCount`.
  - One model can hold several top-10 leaderboard slots.
- **Persisted state keyed by variant slug:**
  - price alerts (RPC `p_product_slug`);
  - watchlist and compare-tray localStorage (`rate_price_watchlist_v1`, `rate_compare_tray_v1`);
  - cache tags `rate:product:<slug>`;
  - public API v1 (`/products/{slug}`, `/compare?slugs=`, `/versus?pair=`, `/watchlist`, `/reviews?slug=`);
  - extension response URLs.
- **Redirects.** None exist today apart from www to apex and the locale prefix (`proxy.ts:63-80`, `next.config.mjs:146-155`).
- **The extension is already variant-aware.**
  - `lookupExtensionProduct` (`server/rate/extension.ts:960`) groups sibling masters by brand + model among the top 8 search hits.
  - It defaults an unknown storage to 256GB (`:1212`).
  - The side panel renders a variant picker (`sidepanel.ts:343-356`).
  - **Defect (separate):** the extension's `/watchlist?add=` link has no handler on the web.
- **E2E.** `apps/web/e2e/seed.sql` has two single-size masters. About 40 test URLs pin `iphone-16-pro-max-256gb`.

### 1.4 DOS/Rate-Services (read-only; general terms only)

- **How it uses this repo.** It consumes `@repo/crawlers` and `@repo/shared-data` through `vendor/rate`:
  - the ingestion pipeline (with `masterIdHint`);
  - `ProductNormalizer` (to read `model_key`, `storage_gb`);
  - `AiReviewAnalyzer`;
  - the arena spec syncer;
  - shared rules.

  It does not call `EntityMatcher` directly.
- **Key parsing.** Its discovery and listing-verification code parses `model_key` as three `:`-separated segments: storage-strict matching, "stated storage" rewriting, and the "other variant" mismatch classification (lineage of DOS/Rate-Services#616 and #618). Title rewriting for some marketplaces exists only to steer a listing onto the right per-storage master.
- **Seeding is per master, which means per storage.** This covers coverage gaps, search queries built from the sized name, the market floor and refresh rotation. Job payloads carry `master_id`/`cluster_id`/`target_model_key`.
- **Every auditor groups by `cluster_id`:** price spread (which also writes master `min_price`/`max_price`/`merchant_count`/`key_specs`/`status`), price anomaly, merchant risk, review burst, catalog provenance and wrong-listing cleanup. The price alert evaluator uses `master_product_id`.
- **Its test harness pins about 184 key literals.** These include `:standard`, `:1024gb` and legacy `khc:` keys, so the third segment is not always storage.

## 2. Requirements derived from the survey

1. **One page, card, leaderboard slot and sitemap entry per Item.** Siblings must never compete with each other.
2. **Price comparisons stay within one variant:** min price, spread, deal radar, peer floors, bait detection, alerts. A 128GB price must never set the floor for 1TB.
3. **A listing whose variant is unknown is kept and shown, but never feeds a per-variant price.**
4. **Old variant slugs, API calls, alerts, watchlists and compare trays keep working.**
5. **No fuzzy assignment of storage.** A variant is assigned only from explicit evidence: title, marketplace SKU, or a single-size registry line.
6. **Additive, idempotent, reversible DOS-Me migrations.** Do not break the `master_products` contract guard.

## 3. Options

| | **A. Items + new variants table** | **B. Items above `master_products` (recommended)** | **C. Self-referencing `master_products` (`parent_id`, `kind`)** | **D. Repurpose `master_products` as Item, new variants table** |
| :--- | :--- | :--- | :--- | :--- |
| New tables | `items`, `item_variants` | `items` | none | `item_variants` |
| What `master_products` becomes | legacy, deprecated | the variant table (unchanged identity) | both levels in one table | the Item table |
| `cluster_id` meaning | must move to `variant_id` | unchanged (variant); NULL = unknown | unchanged | changes to Item; every per-cluster price computation would mix storages |
| Per-variant price logic (DB, importer, Rate-Services auditors) | rewrite | **unchanged** | unchanged | rewrite everywhere |
| Old slugs and ids | need an alias map | variant rows keep their slug and id | keep | ids change meaning silently (dangerous) |
| Contract guard / frozen RPC signature | untouched (but table goes stale) | untouched | needs new columns with mixed semantics; queries must filter `kind` everywhere | violated |
| Clarity of the end state | best | good (the table name is legacy; a view alias can fix it later) | poor | good, but unsafe migration |
| Cost | highest | **lowest** | medium, with lasting complexity | high, high risk |

**Recommendation: B.** It gets JOY's model (one Item, sizes as variants, many listings) at the lowest risk, because the riskiest logic in the system (per-variant price comparison across three codebases) does not change. Option A is cleaner on paper. But it rewrites every per-cluster query in this repo and in Rate-Services for a naming gain. That gain can still be had later with a `rate.item_variants` view over `master_products` (section 7, M6).

## 4. Proposed schema (Option B)

### 4.1 Levels and what lives where

| Data | Item | Variant (`master_products`) | Listing (`products`) |
| :--- | :--- | :--- | :--- |
| Identity | `item_key` = `brand:model` (Apple screen or case size stays in `model`), `slug`, `name`, `brand`, `model`, `category_id`, `status` | `variant_key` (e.g. `256gb`, `1tb`, `std`), `model_key` = `item_key:variant_key` (kept for compatibility), own `slug` (old URL), `variant_name` label, `sort_order` | `item_id` (required), `cluster_id` = variant (NULL = unknown), `platform`, `platform_item_id`, `url` |
| Specs | `specifications`, `key_specs`, `description`, `images`, `thumbnail`, `spec_provenance`, expert review | overrides only: `storage_gb`, `ram_gb`, `key_specs.storage`, launch price | raw `models`, `attributes`, `title` |
| Prices | `min_price` = min over published variants; `max_price`; `price_variant_count` | `min_price`, `max_price`, `merchant_count` (unchanged logic; known-variant listings only) | `price_current`, `price_history` (unchanged) |
| Ratings and reviews | `user_rating_weighted`, `authentic_review_count`, `average_rating`, `total_reviews`, computed over **all** listings of the Item, including unknown-variant ones | during the compatibility window the columns mirror the Item value; no separate per-size rating | review rows stay on listings; `reviews.variation` text stays |
| Counts | `listing_count`, `unknown_variant_listing_count`, `merchant_count` (distinct over all listings) | `merchant_count` | |
| Alerts | (optional later: "any size" alert) | `price_alerts.master_product_id` unchanged | |
| Deals, spread, peer floors, bait detection | none (rolled up for display only) | per variant, as today | input |

- **Ratings live on the Item.** Reviews of a 256GB and a 512GB phone describe the same device, and splitting them halves the evidence behind every Bayesian score. A per-size rating has no product meaning for storage.
- **Prices live on the variant.** The Item only shows a "from" price and a range.

### 4.2 Variant axis

- **v1: storage only.** `variant_key` is the existing third key segment, with these normalizations:
  - `unknown` is never a variant: it becomes NULL on the listing;
  - `standard` and earbuds become a single `std` variant;
  - a single-size registry line (`only_storage_gb`) gets that size.
- **Apple screen and case sizes stay part of the Item.** This keeps the #1113/#1124 behaviour: iPad Pro 11 and iPad Pro 13 are different Items. They have different specs, battery and screen, not just a different SKU.
- **Colour stays a listing attribute,** not a variant.
- **Connectivity (Wi-Fi vs Cellular for tablets and watches) is an open question (Q3).** The key format reserves room: `256gb-cellular` is a valid `variant_key`, so adding the axis later is data, not schema.
- **RAM** that comes paired with storage (e.g. 12/256 vs 12/512) goes in the variant's `ram_gb`. RAM-only differences at the same storage are rare in the catalog, so they would also be suffixed (`256gb-16gbram`) only if they occur.

### 4.3 Draft DDL (for review only; the target is a DOS-Me migration)

```sql
-- M1: additive
CREATE TABLE IF NOT EXISTS rate.items (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key                   text NOT NULL,
  slug                       text NOT NULL,
  name                       text NOT NULL,
  brand                      text NOT NULL,
  model                      text NOT NULL,
  category_id                uuid REFERENCES rate.categories(id) ON DELETE SET NULL,
  status                     text NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','published','archived')),
  entity_type                text NOT NULL DEFAULT 'product',
  description                text,
  specifications             jsonb NOT NULL DEFAULT '{}'::jsonb,
  key_specs                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  spec_provenance            jsonb NOT NULL DEFAULT '{}'::jsonb,
  images                     text[] NOT NULL DEFAULT '{}',
  thumbnail                  text,
  default_variant_id         uuid,            -- FK added after master_products.item_id exists
  min_price                  numeric(15,2) NOT NULL DEFAULT 0,
  max_price                  numeric(15,2) NOT NULL DEFAULT 0,
  price_variant_count        integer NOT NULL DEFAULT 0,
  merchant_count             integer NOT NULL DEFAULT 0,
  listing_count              integer NOT NULL DEFAULT 0,
  unknown_variant_listing_count integer NOT NULL DEFAULT 0,
  total_reviews              integer NOT NULL DEFAULT 0,
  average_rating             numeric(3,2) NOT NULL DEFAULT 0,
  user_rating_weighted       numeric(3,2),
  authentic_review_count     integer NOT NULL DEFAULT 0,
  expert_rating              numeric(3,2),
  expert_review_summary      text,
  expert_criteria_scores     jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_item_key_key UNIQUE (item_key),
  CONSTRAINT items_slug_key UNIQUE (slug),
  CONSTRAINT items_item_key_shape CHECK (item_key ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*$')
);

ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS variant_key text;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS sort_order smallint;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS variant_source text
  CHECK (variant_source IS NULL OR variant_source IN ('title','sku','single_size','manual','legacy'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_master_products_item') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT fk_master_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_item') THEN
    ALTER TABLE rate.products ADD CONSTRAINT fk_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_items_default_variant') THEN
    ALTER TABLE rate.items ADD CONSTRAINT fk_items_default_variant
      FOREIGN KEY (default_variant_id) REFERENCES rate.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_products_item_variant
  ON rate.master_products (item_id, variant_key) WHERE item_id IS NOT NULL AND variant_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rate_products_item ON rate.products (item_id);
CREATE INDEX IF NOT EXISTS idx_items_status_cat_price ON rate.items (status, category_id, min_price);
CREATE INDEX IF NOT EXISTS idx_items_status_rating ON rate.items (status, user_rating_weighted DESC);
CREATE INDEX IF NOT EXISTS idx_items_search_trgm ON rate.items
  USING gin ((brand || ' ' || name || ' ' || model || ' ' || item_key) extensions.gin_trgm_ops);
-- RLS and grants: mirror master_products (public SELECT on published rows, service_role ALL,
-- rate_worker policy and column grants as in DOS-Me 20261018183000), plus the updated_at trigger.
```

```sql
-- M5: constraints, after the backfill is verified
ALTER TABLE rate.master_products ALTER COLUMN item_id SET NOT NULL;
ALTER TABLE rate.products ADD CONSTRAINT products_item_id_not_null CHECK (item_id IS NOT NULL) NOT VALID;
ALTER TABLE rate.products VALIDATE CONSTRAINT products_item_id_not_null;
-- A listing's variant must belong to the listing's Item.
CREATE OR REPLACE FUNCTION rate.products_variant_item_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.cluster_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.id = NEW.cluster_id AND mp.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'listing % variant % is not a variant of item %', NEW.id, NEW.cluster_id, NEW.item_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
-- Moving a variant to another Item must carry its listings (same transaction), so the guard
-- needs a companion trigger on master_products.item_id updates that rejects stranded listings.
```

### 4.4 Listing with an unknown variant

- **Stored as:** `products.item_id = <item>`, `products.cluster_id = NULL`, `variant_source = NULL`.
- **Never feeds a variant.** It is excluded from variant `min_price`/`max_price`/`merchant_count`, spread, deal radar and peer floors. These already filter by `cluster_id`, so the exclusion is automatic.
- **Counted at Item level.** It feeds Item `listing_count`, `unknown_variant_listing_count`, Item `merchant_count` and Item ratings, because its reviews are about the device.
- **Shown** on the Item page in a separate group, "Storage not stated" (VI: "Chưa rõ dung lượng"). Each row gets a note and its own price. It is not used for the "from" price (Q2).
- **Upgraded later, never guessed.** It moves to a variant when a later crawl gives explicit evidence: a stated title, a selected marketplace SKU, or a single-size line. `variant_source` records which. The AI enricher must not set storage on a listing.
- **Multi-size marketplace listings.** A Shopee listing whose SKUs span several storages is one listing. Phase 1 attaches it to the variant of its cheapest SKU only when that SKU names its storage, and otherwise to the Item with unknown variant. This also fixes today's defect where `priceMin` across all SKUs is filed under one sized master. Per-SKU offers are the optional phase M6 (`rate.listing_skus`).

### 4.5 Keys and matching

- **Normalizer output**:
  - `item_key` = `slugify(brand):slugify(model + appleSize)`;
  - `variant_key` = `{N}gb|{N}tb|std|null`;
  - `item_name` and `item_slug` (no storage);
  - `variant_name`.

  `model_key` stays as `item_key:(variant_key ?? 'unknown')` until the compatibility window closes, so Rate-Services helpers keep working unchanged.
- **Shared helpers.** `packages/shared-data` gets `composeModelKey` and `splitModelKey`, so Rate-Services stops parsing key strings itself.
- **Matcher, item first:**
  1. Item by exact `item_key`.
  2. Variant by exact `(item_id, variant_key)`. A missing sized variant of a known published Item is created as a variant row. Specs are inherited from the Item; only storage and RAM are overridden. The Item stays published. A draft is needed only when the Item is new.
  3. Tier 2 fuzzy runs against **Item** names through a new RPC, `match_item(search_title, p_brand, p_model, p_threshold)`. Item names never contain storage, so the #1105 failure mode (bare title vs sized name) disappears. The frozen `match_master_product` stays for the compatibility window.
  4. Tier 3 creates a draft Item, plus a variant only when the key states one.
- **Pipeline hint.** `masterIdHint` keeps working (variant id implies item). A new `itemIdHint` is added for storage-less pages.

## 5. Impact

### 5.1 `apps/web`

| Area | Change |
| :--- | :--- |
| Data layer (`lib/rate-api.ts`, `server/rate/*`) | New `getItemBySlug`, `getItemVariants`, `getItemOffers` (grouped by variant, plus the unknown group), and `resolveCatalogSlug(slug)` returning `{item, variant}` from either an item slug or an old variant slug. Price history: one series per variant. Reviews and summary: across the Item's listings. |
| Product page | One page per Item: `/{category}/{item-slug}`. Variant selector with a price per variant, preselected by `?v=256gb` or by the old slug. Title and meta use "from X". JSON-LD becomes `ProductGroup` (`variesBy: storage`, `hasVariant` Products with their own sku and AggregateOffer) plus one Item-level AggregateRating. Competitors, leaderboard standing and versus suggestions exclude same-Item siblings. The page also checks that the route category matches the Item (fixes the `/tablets/<phone>` canonical leak). |
| URLs and redirects | An old variant slug gets a 308 `permanentRedirect` to `/{category}/{item-slug}?v={variant_key}`. Canonical is the Item URL (Q1). No alias table is needed while variants keep their `slug`. Slug-collision rule: an Item slug may equal only one of its own variants' slugs (for example single-size earbuds), checked by a verification query and by the importer. |
| Directory, search, facets, autocomplete | One card per Item with a "from" price and size chips. The `?storage=` filter means "has a variant of that size". Brand facet and pagination counts become Items. New RPCs: `search_items_v1`, `get_category_brand_facets_v2`, `search_catalog_autocomplete_v2`. |
| Compare and versus | Compare by Item, optionally pinning a variant (`slug@256gb`). Versus URLs become `{itemA}-vs-{itemB}`, and old variant pairs 308 to the Item pair. Same-Item pairs are rejected. Tray localStorage entries migrate on read (resolve the slug, keep the variant). |
| Deals | Deal computation stays per variant. Cards link to the Item with the variant preselected. |
| Leaderboard, stats, sitemap | Rank and count Items. The sitemap emits Item URLs only, with lastmod = max over variants and listings. "Products tracked" counts Items. |
| Watchlist and price alerts | Alerts stay per variant (Q5). Old slugs resolve. The UI asks for a size when the watchlist entry is an Item. |
| Cache | Revalidating a variant slug also busts `rate:product:<item-slug>`. |

### 5.2 API v1 and extension

- **Additive only within v1.**
  - `GET /products/{slug}` accepts an Item or variant slug. It returns the current `product` (the selected or default variant, so existing clients keep working) plus new `item`, `variants[]`, `selected_variant` and `unknown_variant_offers`.
  - `GET /products` gains `group=item|variant`. It defaults to `variant` for the compatibility window. Switching the default is a documented breaking change and needs an announcement (Q7).
  - OpenAPI gains Item and Variant component schemas. The doc text also gets corrected: it claims `/products/{slug}` accepts a `model_key`, which it does not.
- **Extension.**
  - `lookupExtensionProduct` resolves the Item and returns **all** its variants from the DB, not only the siblings among the top 8 search hits.
  - It drops the "unknown storage means 256GB" default; unknown shows the Item with no size preselected.
  - It returns Item URLs.
  - The side-panel picker already exists, so the client change is small.
  - The dead `/watchlist?add=` link gets its handler in the same task.

### 5.3 `apps/importer`

| File | Change |
| :--- | :--- |
| `product-normalizer.ts` | Emit `item_key`, `variant_key`, `item_name`, `item_slug`. Earbuds and fixed-size lines get `std` or the fixed size and are no longer `:unknown`. `needs_review` stops meaning "storage unknown". |
| `entity-matcher.ts` | Item-first tiers (section 4.5). Variant creation under a published Item. Fuzzy only at Item level. Return `{itemId, variantId \| null}`. **Closes #1105.** |
| `shopee-to-supabase.ts` | Write `products.item_id`, nullable `cluster_id`, `variant_source`. Pick the variant from the selected or cheapest SKU only when it states storage. Refresh variant stats, then Item stats. `itemIdHint`. |
| `ai-spec-enricher.ts` | Cache and enrich per Item. Variant overrides only. Never assign storage to a listing. |
| `ai-review-analyzer.ts`, `merchant-review-risk.ts`, `cluster-peer-floor.ts` | Rating refresh at Item level. Peer floors unchanged (per variant), and they must skip NULL `cluster_id`. |
| `flagship-seed-data.ts`, `arena-spec-syncer.ts`, `jobs/backfill-specs.ts` | Seeds become one Item with a list of variants. Fix the seed key drift (earbuds `:64gb`/`:standard`, `watch-ultra-3-49mm`). Specs backfill per Item. |
| `package.json` exports, `dist-exports.smoke.mjs` | Export the new helpers and types. Keep the old exports for one vendor bump. |
| Tests | Key assertions gain `item_key`/`variant_key`. Matcher tests cover the bare title linking to an Item with no variant (the #1105 case). |

### 5.4 DOS/Rate-Services (general terms; its own issues in its own repo)

- **Grouping by `cluster_id` stays correct,** because it remains the variant. Every auditor that groups by it must treat NULL as "no variant": skip it for floors and spread, and count it at Item level if needed.
- **Key-parsing helpers** should switch to the shared `splitModelKey`/`composeModelKey`, so they stop splitting strings themselves. Their about 184 fixture literals stay valid during the compatibility window, because `model_key` keeps its shape.
- **Listing verification** gains an Item-level mode. A page with no stated storage is accepted for the Item with no variant, instead of being rejected as "other variant".
- **Job payloads** carry `item_id` plus an optional variant id. Queued jobs with old ids stay valid, because variant ids do not change.
- **Seeding and coverage** can run per Item, with per-variant coverage computed after the search.
- **Writers of master aggregates** (the spread auditor, cleanup scripts) also call the new Item refresh RPC.
- **Bump the `vendor/rate` pin** after the importer change lands. The local submodule checkout is currently ahead of the pinned commit, which is worth syncing first.

## 6. #1105 decision

With this model, a storage-less title resolves to the Item with no variant. #1105 option (a) (fall through to a draft `:unknown` master) would be throwaway work. During the interim, it would also hide those listings from public pages, because the `:unknown` master is a draft.

**Recommendation:** close #1105 into the matcher task of this design (task 5). Keep today's behaviour until then. Rate-Services already guards discovery and refreshes against the wrong-size link.

## 7. DOS-Me migration plan

All steps are idempotent. Each phase is its own DOS-Me migration: preview, then beta, then prod, each with JOY's approval. Reference copies go into `DOS/Rate/supabase/migrations/`, and `database.types.ts` is regenerated. **Dependency:** the DOS-Me beta workflow is locked (ROADMAP 6.4). Until it reopens, these migrations cannot reach prod by the normal path.

| Phase | What | Reversible by |
| :--- | :--- | :--- |
| **M0** | Mirror the eight missing DOS-Me `rate` migrations into this repo's reference copy and regenerate types (a docs/types PR, no DDL). Run the read-only inventory queries below. Fix seed-key drift in data (merge duplicate earbuds and watch masters) as a separate, reviewed data step if the inventory finds duplicates. | not applicable |
| **M1** | Additive DDL from section 4.3: `rate.items`, new columns, indexes, RLS/grants, `rate_worker` access, updated_at trigger. | `DROP` of the new objects (no data depends on them yet) |
| **M2** | Backfill Items and links (below). New RPCs: `refresh_item_stats`, `refresh_item_rating`, `match_item`, `resolve_catalog_slug`, `search_items_v1`, facet and autocomplete v2, plus `submit_community_review` accepting an Item. Old RPCs are untouched. | set the new columns to NULL and truncate `items`; old paths never read them |
| **Compatibility window** | Importer and Rate-Services write both levels. Web ships Item pages behind an env flag, then switches. Old slugs redirect. Lasts at least one promote cycle and until the sitemap has been re-crawled (about 30 days). | flip the flag off |
| **M3** | Collapse unknown-storage masters: listings of `:unknown` masters get `cluster_id = NULL` (`item_id` is already set); the masters are archived. A backup table records each change. | restore from the backup table (below) |
| **M4** | Constraints: `item_id NOT NULL` on both tables, the listing/variant/Item guard triggers, `default_variant_id` filled. | drop the constraints and triggers |
| **M5 (optional)** | `rate.listing_skus` (per-SKU price and stock per listing, with nullable `variant_id`). Per-SKU price history. | drop table |
| **M6 (optional)** | `rate.item_variants` as a view over `master_products`, for naming clarity. Deprecate per-variant rating columns. | drop view |

### 7.1 M2 backfill (draft)

```sql
-- Variant key from the existing key; 'unknown' is not a variant.
UPDATE rate.master_products mp
SET variant_key = CASE
      WHEN split_part(mp.model_key, ':', 3) IN ('unknown') THEN NULL
      WHEN split_part(mp.model_key, ':', 3) = 'standard' THEN 'std'
      ELSE split_part(mp.model_key, ':', 3) END
WHERE mp.variant_key IS NULL
  AND mp.model_key ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*:[a-z0-9-]+$';

-- One Item per brand:model; attributes from a representative variant
-- (published first, then most merchants, then oldest).
INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status, entity_type,
                        description, specifications, key_specs, images, thumbnail, metadata)
SELECT DISTINCT ON (k.item_key)
       k.item_key,
       regexp_replace(mp.slug, '-(\d+(gb|tb)|standard|unknown)$', ''),
       regexp_replace(mp.name, '\s+\d+\s?(GB|TB)$', '', 'i'),
       mp.brand, mp.model, mp.category_id,
       CASE WHEN bool_or(mp.status = 'published') OVER (PARTITION BY k.item_key) THEN 'published'
            ELSE 'draft' END,
       mp.entity_type, mp.description, mp.specifications, mp.key_specs, mp.images, mp.thumbnail,
       mp.metadata || jsonb_build_object('backfilled_from_master', mp.id)
FROM rate.master_products mp
CROSS JOIN LATERAL (SELECT split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2) AS item_key) k
WHERE mp.model_key ~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*:[a-z0-9-]+$'
  AND mp.status <> 'archived'
ORDER BY k.item_key, (mp.status = 'published') DESC, mp.merchant_count DESC, mp.created_at ASC
ON CONFLICT (item_key) DO NOTHING;
-- Slug collisions (ON CONFLICT on slug) are resolved before this statement by the inventory step;
-- the migration aborts if any remain.

UPDATE rate.master_products mp SET item_id = i.id
FROM rate.items i
WHERE mp.item_id IS NULL
  AND i.item_key = split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2);

UPDATE rate.products p SET item_id = mp.item_id, variant_source = COALESCE(p.variant_source, 'legacy')
FROM rate.master_products mp
WHERE p.cluster_id = mp.id AND p.item_id IS NULL;

-- Item-level aggregates and ratings
SELECT rate.refresh_item_stats(id) FROM rate.items;
SELECT rate.refresh_item_rating(id) FROM rate.items;
```

- **Specs in the backfill.** Item `specifications` are copied from the representative variant. A follow-up importer job (dry-run by default, like `backfill-specs.ts`) strips variant-only fields such as storage from the Item specs and writes them as variant overrides.
- **Legacy keys** are listed by the inventory and fixed or archived before M2 runs: anything that fails the three-segment shape, `khc:` keys, and old hyphen-format keys. The migration aborts if any non-archived master would be left without an Item.

### 7.2 M3 collapse (draft)

```sql
CREATE TABLE IF NOT EXISTS rate.m3_unknown_variant_backup (
  product_id uuid PRIMARY KEY, old_cluster_id uuid NOT NULL, master_old_status text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now());
INSERT INTO rate.m3_unknown_variant_backup (product_id, old_cluster_id, master_old_status)
SELECT p.id, p.cluster_id, mp.status
FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE mp.variant_key IS NULL AND split_part(mp.model_key, ':', 3) = 'unknown'
ON CONFLICT (product_id) DO NOTHING;
UPDATE rate.products p SET cluster_id = NULL, variant_source = NULL
FROM rate.m3_unknown_variant_backup b WHERE p.id = b.product_id AND p.cluster_id = b.old_cluster_id;
-- Archive only masters with no price alerts; alerts on them are reported and resolved first.
UPDATE rate.master_products mp SET status = 'archived'
WHERE mp.variant_key IS NULL AND split_part(mp.model_key, ':', 3) = 'unknown'
  AND NOT EXISTS (SELECT 1 FROM rate.price_alerts a WHERE a.master_product_id = mp.id);
-- then refresh_master_market_stats for the affected masters and refresh_item_stats for their Items
```

- **Rollback of M3:**

  ```sql
  UPDATE rate.products p SET cluster_id = b.old_cluster_id FROM rate.m3_unknown_variant_backup b WHERE p.id = b.product_id;
  ```

  then restore `status` from `master_old_status` and refresh the stats.
- **Community reviews.** `submit_community_review` attaches reviews to a listing. Moving a listing to "no variant" keeps the review on that listing and on the same Item. This avoids the orphaning seen in the iPhone 16e offer move (DOS-Me `20261022140000`).

### 7.3 Verification queries (read-only; run after each phase)

```sql
-- Inventory (M0)
SELECT count(*) FILTER (WHERE model_key !~ '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*:[a-z0-9-]+$') AS bad_shape,
       count(*) FILTER (WHERE split_part(model_key, ':', 3) = 'unknown') AS unknown_masters,
       count(*) FILTER (WHERE status = 'published') AS published, count(*) AS total
FROM rate.master_products;
SELECT split_part(model_key, ':', 1) || ':' || split_part(model_key, ':', 2) AS item_key,
       array_agg(model_key ORDER BY model_key) AS variants, count(DISTINCT brand) AS brands,
       count(DISTINCT category_id) AS categories
FROM rate.master_products WHERE status <> 'archived'
GROUP BY 1 HAVING count(DISTINCT brand) > 1 OR count(DISTINCT category_id) > 1;   -- expect 0 rows
-- Unknown masters that carry alerts or community reviews (decide before M3)
SELECT mp.model_key, count(DISTINCT a.id) AS alerts, count(DISTINCT r.id) AS reviews
FROM rate.master_products mp
LEFT JOIN rate.price_alerts a ON a.master_product_id = mp.id
LEFT JOIN rate.products p ON p.cluster_id = mp.id
LEFT JOIN rate.reviews r ON r.product_id = p.id
WHERE split_part(mp.model_key, ':', 3) = 'unknown' GROUP BY 1 HAVING count(a.id) + count(r.id) > 0;

-- After M2
SELECT count(*) FROM rate.master_products WHERE item_id IS NULL AND status <> 'archived';  -- 0
SELECT count(*) FROM rate.products WHERE item_id IS NULL AND cluster_id IS NOT NULL;       -- 0
SELECT count(*) FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE p.item_id IS DISTINCT FROM mp.item_id;                                                -- 0
SELECT i.item_key FROM rate.items i
WHERE i.min_price IS DISTINCT FROM (SELECT COALESCE(min(mp.min_price) FILTER (WHERE mp.min_price > 0), 0)
                                    FROM rate.master_products mp
                                    WHERE mp.item_id = i.id AND mp.status = 'published');   -- 0 rows
-- An Item slug may only collide with one of its own variants' slugs
SELECT i.slug FROM rate.items i JOIN rate.master_products mp ON mp.slug = i.slug
WHERE mp.item_id IS DISTINCT FROM i.id;                                                      -- 0 rows
-- Published variant counts per Item, for the page smoke test
SELECT i.slug, count(mp.id) FROM rate.items i JOIN rate.master_products mp ON mp.item_id = i.id
WHERE i.status = 'published' GROUP BY 1 ORDER BY 2 DESC;

-- After M3
SELECT count(*) FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE split_part(mp.model_key, ':', 3) = 'unknown';                                         -- 0
SELECT (SELECT count(*) FROM rate.m3_unknown_variant_backup) AS moved,
       (SELECT count(*) FROM rate.products WHERE cluster_id IS NULL AND item_id IS NOT NULL) AS unknown_now;
```

## 8. Risks

| Risk | Mitigation |
| :--- | :--- |
| SEO: every indexed product URL changes. | 308 to the Item page with the variant preselected. The canonical points to the Item. The sitemap is swapped in the same deploy. Keep the redirects permanently, since they are cheap. |
| Public API clients break. | Additive fields only within v1. Item grouping is opt-in (`group=item`) until announced. |
| Rate-Services and this repo drift during the compatibility window. | `model_key` keeps its shape. Variant ids do not change. Helpers are shared through `@repo/shared-data`. The vendor bump happens only after the importer change is merged. |
| Item spec backfill picks the wrong representative. | Published, then most merchants, then oldest. A dry-run diff job is reviewed before applying. |
| Unknown-variant listings make an Item look cheaper. | They are excluded from the "from" price and shown in their own group (Q2). |
| Beta pipeline locked in DOS-Me. | The schema can be prepared and preview-tested now. Prod waits for the beta workflow (ROADMAP 6.4). |
| A listing's variant and Item disagree. | Guard trigger in M4. Verification query after every phase. |

## 9. Open questions for JOY

Each question has a recommendation, which is the default if JOY agrees.

1. **Q1. URL scheme.** **(Recommended)** One indexable URL per Item, `/{category}/{item-slug}`, with the size selected by `?v=256gb` (not indexed). The alternative is a separate indexable URL per size, `/{category}/{item-slug}/256gb`, with more pages but thin and near-duplicate content.
2. **Q2. Listings with an unknown size.** **(Recommended)** Show them on the Item page in a separate "Storage not stated" group, and keep them out of the "from" price. The alternative is to include them in the "from" price, which is cheaper-looking but can mislead.
3. **Q3. Variant axis.** **(Recommended)** Storage only for now. Screen and case sizes (iPad Pro 11 vs 13, Watch 42 vs 46 mm) stay separate Items, as today. Wi-Fi vs Cellular: start as one variant per storage, and add `256gb-cellular` later if price comparisons prove misleading. The alternative is to make connectivity a variant axis from day one.
4. **Q4. Ratings and reviews.** **(Recommended)** One rating per Item, pooled across sizes.
5. **Q5. Price alerts.** **(Recommended)** Alerts stay per size. An "any size" alert is a later feature.
6. **Q6. #1105.** **(Recommended)** Hold, and fold it into the matcher task below. No interim fix.
7. **Q7. Public API default.** **(Recommended)** Keep the variant-level default for `/api/v1/rate/products` during the compatibility window. Switch to Item grouping with an announcement after the window closes.

## 10. Task breakdown (filed by the PO after JOY approves)

Sizes: S is up to a day, M is 2-3 days, L is about a week of agent time, including review.

| # | Task | Repo | Size | Depends on |
| :--- | :--- | :--- | :--- | :--- |
| 1 | M0: mirror the eight DOS-Me `rate` migrations into the reference copy and regenerate `database.types.ts` | Rate | S | |
| 2 | M0: run the inventory queries (read-only) and write the data-fix list (seed key drift, legacy keys, slug collisions) | Rate (PO runs the queries) | S | |
| 3 | `shared-data`: Item and Variant schemas, `composeModelKey`/`splitModelKey`, `item_key` and `variant_key` rules | Rate | S | |
| 4 | DOS-Me M1 + M2: `rate.items`, columns, RLS/grants, backfill, Item RPCs | DOS-Me (with JOY's approval) + Rate reference copy | L | 1, 2 |
| 5 | Normalizer emits `item_key`/`variant_key`; matcher becomes item-first with `match_item` (**closes #1105**); pipeline writes `item_id` with nullable variant and `variant_source`, plus `itemIdHint` | Rate | L | 3, 4 |
| 6 | Seeds as Item plus variants; spec enrichment and backfill per Item; review rating at Item level | Rate | M | 5 |
| 7 | Web data layer: Item queries, `resolveCatalogSlug`, 308 redirects, cache tags | Rate | M | 4 |
| 8 | Product page per Item: variant selector, unknown-size group, `ProductGroup` JSON-LD, canonical, no sibling competitors | Rate | L | 7 |
| 9 | Directory, search, autocomplete, facets, leaderboard, sitemap and stats per Item | Rate | L | 7 |
| 10 | Compare, versus, tray, watchlist and alerts per Item with size pinning; old-URL redirects | Rate | M | 7 |
| 11 | API v1 additive fields and `group=item`, OpenAPI schemas, extension lookup returning all variants and the `?add=` handler | Rate | M | 7 |
| 12 | E2E seed with one multi-size Item; redirect and canonical assertions | Rate | S | 8 |
| 13 | Rate-Services: shared key helpers, NULL-variant handling in auditors, Item-level listing check, payload `item_id`, seeding per Item, vendor bump | Rate-Services | L | 5 |
| 14 | DOS-Me M3 (unknown collapse) and M4 (constraints) | DOS-Me (with JOY's approval) | M | 5, 13, compatibility window |
| 15 | (optional) M5 `listing_skus`, per-SKU prices | DOS-Me + Rate | L | 14 |

**Critical path:** 1, 2 and 3, then 4, then 5 and 7 in parallel, then 8 to 11 and 13, then 14. The web tasks (8 to 11) can share one feature flag, so that they ship dark and switch together.
