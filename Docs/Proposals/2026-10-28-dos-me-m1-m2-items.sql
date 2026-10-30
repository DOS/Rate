-- PROPOSAL, NOT APPLIED. DOS-Me migration M1 + M2 for the Item / variant / listing model
-- (DOS/Rate#1150; design Docs/Proposals/2026-10-27-item-variant-listing-model.md, sections
-- 4.3, 4.5, 7, 7.1). JOY reviews and applies it through DOS-Me (preview, then beta, then
-- prod). Zero DDL on prod from DOS/Rate. Rollback: 2026-10-28-dos-me-m1-m2-items-rollback.sql.
-- Verification: 2026-10-28-dos-me-m1-m2-items-verify.sql.
--
-- Order: M0 (2026-10-29-dos-me-m0-seed-rekey.sql, DOS/Rate#1212 / #1123) runs first, so the Items
-- are created with the normalizer's Item keys.
--
-- Idempotent: every step is IF NOT EXISTS, guarded by pg_constraint / pg_trigger, CREATE OR
-- REPLACE, or a re-runnable UPDATE ... WHERE <not yet done>. One transaction (M1 and M2 ship
-- together so no Item is created by a trigger and then skipped by the backfill).
--
-- Contracts the importer already calls (DOS/Rate#1179, #1190, #1208, #1202):
--   rate.items(id, item_key, status, description, specifications, key_specs, images, ...)
--   rate.master_products.item_id / variant_key, rate.products.item_id / variant_source
--   rate.match_item(search_title, p_brand, p_model, p_threshold)
--     -> item_id, item_key, name, similarity
--   rate.refresh_item_stats(p_item_id): prices, counts AND the Item's pooled rating
--   rate.refresh_master_product_rating(p_master_id): same signature, Item-aware body
--   M1 sync triggers: a master gets its Item from its key; a listing's item follows its variant
-- Added here for the matcher's open Codex P1s:
--   rate.retire_item_unknown_variant(p_item_id): transactional unknown-variant retire
--   a products trigger that keeps a hand-set (manual) variant against a racing ingest, and
--   an AFTER trigger that refreshes the Item and variant a listing leaves (overlapping ingests)
--
-- Not in this migration: rate.v_products_with_merchant_trust is left unchanged (appending a
-- column makes a re-run of 20261018153000 fail, see 20261020230000); listings read item_id
-- from rate.products. Web RPCs (search_items_v1, facets/autocomplete v2, resolve_catalog_slug,
-- submit_community_review by Item) belong to the web tasks (design section 10, tasks 7 to 11).

BEGIN;

-- M1.1 rate.items --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.items (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key                      text NOT NULL,
  slug                          text NOT NULL,
  name                          text NOT NULL,
  brand                         text NOT NULL,
  model                         text NOT NULL,
  category_id                   uuid REFERENCES rate.categories(id) ON DELETE SET NULL,
  status                        text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'published', 'archived')),
  entity_type                   text NOT NULL DEFAULT 'product',
  description                   text,
  specifications                jsonb NOT NULL DEFAULT '{}'::jsonb,
  key_specs                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  spec_provenance               jsonb NOT NULL DEFAULT '{}'::jsonb,
  images                        text[] NOT NULL DEFAULT '{}',
  thumbnail                     text,
  default_variant_id            uuid,
  min_price                     numeric(15, 2) NOT NULL DEFAULT 0,
  max_price                     numeric(15, 2) NOT NULL DEFAULT 0,
  price_variant_count           integer NOT NULL DEFAULT 0,
  merchant_count                integer NOT NULL DEFAULT 0,
  listing_count                 integer NOT NULL DEFAULT 0,
  unknown_variant_listing_count integer NOT NULL DEFAULT 0,
  total_reviews                 integer NOT NULL DEFAULT 0,
  average_rating                numeric(3, 2) NOT NULL DEFAULT 0,
  user_rating_weighted          numeric(3, 2),
  authentic_review_count        integer NOT NULL DEFAULT 0,
  expert_rating                 numeric(3, 2),
  expert_review_summary         text,
  expert_criteria_scores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_item_key_key UNIQUE (item_key),
  CONSTRAINT items_slug_key UNIQUE (slug)
);
-- No shape CHECK on item_key: legacy keys still get an Item (design 7.1).

-- M1.2 columns on the variant and listing tables ------------------------------------------

ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS variant_key text;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS sort_order smallint;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS variant_source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.products'::regclass AND conname = 'products_variant_source_check') THEN
    ALTER TABLE rate.products ADD CONSTRAINT products_variant_source_check CHECK
      (variant_source IS NULL OR variant_source IN ('title', 'sku', 'single_size', 'single_variant', 'manual', 'legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.master_products'::regclass AND conname = 'fk_master_products_item') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT fk_master_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.products'::regclass AND conname = 'fk_products_item') THEN
    ALTER TABLE rate.products ADD CONSTRAINT fk_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.items'::regclass AND conname = 'fk_items_default_variant') THEN
    ALTER TABLE rate.items ADD CONSTRAINT fk_items_default_variant
      FOREIGN KEY (default_variant_id) REFERENCES rate.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_products_item_variant
  ON rate.master_products (item_id, variant_key) WHERE item_id IS NOT NULL AND variant_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_products_item ON rate.master_products (item_id);
-- Rate Services filters listings by Item (RS#688, PR #689).
CREATE INDEX IF NOT EXISTS idx_rate_products_item ON rate.products (item_id);
CREATE INDEX IF NOT EXISTS idx_items_status_cat_price ON rate.items (status, category_id, min_price);
CREATE INDEX IF NOT EXISTS idx_items_status_rating ON rate.items (status, user_rating_weighted DESC);

-- pg_trgm lives in schema `sign` on prod and elsewhere in other stacks: look it up at run time.
DO $$
DECLARE
  v_trgm text;
BEGIN
  SELECT n.nspname INTO v_trgm
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is not installed';
  END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_items_name_trgm ON rate.items USING gin (name %I.gin_trgm_ops)',
    v_trgm
  );
END $$;

-- M1.3 RLS, grants, updated_at -------------------------------------------------------------

ALTER TABLE rate.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view published items" ON rate.items;
CREATE POLICY "Public can view published items" ON rate.items
  FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "Service role write items" ON rate.items;
CREATE POLICY "Service role write items" ON rate.items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- The worker reads every Item (the matcher links listings to draft Items too); it writes
-- Items only through the SECURITY DEFINER triggers and RPCs below.
DROP POLICY IF EXISTS "Rate worker read items" ON rate.items;
CREATE POLICY "Rate worker read items" ON rate.items
  FOR SELECT TO rate_worker USING (true);

GRANT SELECT ON rate.items TO anon, authenticated;
GRANT ALL ON rate.items TO service_role;
GRANT SELECT ON rate.items TO rate_worker;
-- Rate Services updates Item specs before the flag goes on (RS#700): spec and description
-- columns only. Identity, status, prices, counts and ratings stay with the triggers and
-- RPCs, so the worker cannot publish or re-key an Item. spec_provenance and metadata stay
-- with the service role: no engine path writes them (RS#739). The table-level REVOKE also
-- drops column grants, so a re-run narrows a database that has the wider list.
REVOKE UPDATE ON rate.items FROM rate_worker;
GRANT UPDATE (description, specifications, key_specs, images, thumbnail, updated_at)
  ON rate.items TO rate_worker;
DROP POLICY IF EXISTS "Rate worker update items" ON rate.items;
CREATE POLICY "Rate worker update items" ON rate.items
  FOR UPDATE TO rate_worker USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_rate_items_set_updated_at ON rate.items;
CREATE TRIGGER trg_rate_items_set_updated_at
  BEFORE UPDATE ON rate.items
  FOR EACH ROW EXECUTE FUNCTION rate.set_updated_at_timestamp();

-- M1.4 Item slug and name from a variant (design 7.1) ---------------------------------------

CREATE OR REPLACE FUNCTION rate.item_slug_from_master(p_slug text, p_model_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(COALESCE(p_slug, ''), '-([0-9]+(gb|tb)|standard|unknown)$', ''), ''),
    trim(BOTH '-' FROM regexp_replace(
      lower(split_part(COALESCE(p_model_key, ''), ':', 1) || '-' || split_part(COALESCE(p_model_key, ''), ':', 2)),
      '[^a-z0-9-]+', '-', 'g'))
  );
$$;

CREATE OR REPLACE FUNCTION rate.item_name_from_master(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(btrim(regexp_replace(COALESCE(p_name, ''), '[[:space:]]+[0-9]+([.,][0-9]+)?[[:space:]]?(gb|tb)$', '', 'i')), ''),
    COALESCE(p_name, '')
  );
$$;

REVOKE EXECUTE ON FUNCTION rate.item_slug_from_master(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.item_name_from_master(text) FROM PUBLIC, anon, authenticated;

-- M1.5 compatibility sync (removed in M4) --------------------------------------------------

-- A master inserted or re-keyed without its Item gets one from its key (created as draft);
-- publishing a variant publishes its Item. SECURITY DEFINER: rate_worker holds no write grant
-- on rate.items; the function only derives an Item from the row being written.
CREATE OR REPLACE FUNCTION rate.master_products_sync_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key  text;
  v_slug text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.model_key IS DISTINCT FROM OLD.model_key OR NEW.item_id IS NULL THEN
    v_key := split_part(NEW.model_key, ':', 1) || ':' || split_part(NEW.model_key, ':', 2);
    NEW.variant_key := NULLIF(split_part(NEW.model_key, ':', 3), '');
    NEW.item_id := NULL;
    SELECT i.id INTO NEW.item_id FROM rate.items i WHERE i.item_key = v_key;
    IF NEW.item_id IS NULL THEN
      v_slug := rate.item_slug_from_master(NEW.slug, NEW.model_key);
      BEGIN
        INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status)
        VALUES (v_key, v_slug, rate.item_name_from_master(NEW.name), NEW.brand, NEW.model,
                NEW.category_id, CASE WHEN NEW.status = 'published' THEN 'published' ELSE 'draft' END)
        ON CONFLICT (item_key) DO NOTHING;
      EXCEPTION WHEN unique_violation THEN
        -- The slug belongs to another Item: suffix it with a hash of the key.
        INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status)
        VALUES (v_key, left(v_slug, 190) || '-' || left(md5(v_key), 8),
                rate.item_name_from_master(NEW.name), NEW.brand, NEW.model,
                NEW.category_id, CASE WHEN NEW.status = 'published' THEN 'published' ELSE 'draft' END)
        ON CONFLICT (item_key) DO NOTHING;
      END;
      SELECT i.id INTO NEW.item_id FROM rate.items i WHERE i.item_key = v_key;
    END IF;
  END IF;
  IF NEW.status = 'published' AND NEW.item_id IS NOT NULL THEN
    UPDATE rate.items SET status = 'published' WHERE id = NEW.item_id AND status <> 'published';
  END IF;
  RETURN NEW;
END $$;

-- A master's listings follow it to a new Item in the same statement.
CREATE OR REPLACE FUNCTION rate.master_products_move_listings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    UPDATE rate.products SET item_id = NEW.item_id
    WHERE cluster_id = NEW.id AND item_id IS DISTINCT FROM NEW.item_id;
  END IF;
  RETURN NULL;
END $$;

-- A listing's Item follows its variant whenever a variant is set (NULL variant: keep the
-- Item the writer supplied). A hand-set variant (variant_source 'manual') is evidence: a
-- later write, including an ingest that read the listing before it was hand-set, never
-- moves it (the read-then-upsert race of DOS/Rate#1179). Admin tools and the retire RPC move
-- it on purpose with SET LOCAL rate.variant_override = 'on'.
CREATE OR REPLACE FUNCTION rate.products_sync_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status      text;
  v_variant_key text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.variant_source = 'manual'
     AND COALESCE(current_setting('rate.variant_override', true), '') <> 'on'
     AND (NEW.cluster_id IS DISTINCT FROM OLD.cluster_id
          OR NEW.variant_source IS DISTINCT FROM OLD.variant_source
          OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    NEW.cluster_id := OLD.cluster_id;
    NEW.variant_source := OLD.variant_source;
    NEW.item_id := OLD.item_id;
  END IF;
  IF NEW.cluster_id IS NOT NULL THEN
    -- No lock here: an INSERT ... ON CONFLICT runs this before it locks the conflicting
    -- listing, so locking the variant would invert the listing -> variant lock order.
    -- A write that races a running retire is swept up by the retire itself (it re-sweeps
    -- after archiving, and a later call sweeps a retired variant again).
    SELECT mp.item_id, mp.status, mp.variant_key INTO NEW.item_id, v_status, v_variant_key
    FROM rate.master_products mp WHERE mp.id = NEW.cluster_id;
    IF v_status = 'archived' AND v_variant_key = 'unknown'
       AND (TG_OP = 'INSERT' OR NEW.cluster_id IS DISTINCT FROM OLD.cluster_id) THEN
      -- A retired `unknown` variant takes no listing: the listing keeps the Item only.
      NEW.cluster_id := NULL;
      NEW.variant_source := NULL;
    END IF;
  END IF;
  -- The retire markers describe one move; any later variant or Item change voids them, so
  -- the rollback never puts a listing back on a variant of another Item.
  IF TG_OP = 'UPDATE' AND NEW.metadata ? 'retired_unknown_variant'
     AND (NEW.cluster_id IS NOT NULL OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    NEW.metadata := NEW.metadata - 'retired_unknown_variant' - 'variant_source_before_retire';
  END IF;
  RETURN NEW;
END $$;

-- The Item and variant a listing leaves are refreshed by the statement that moves it, under
-- the row lock, so two overlapping ingests of one listing cannot leave the middle Item stale
-- (DOS/Rate#1185 / PR #1190 review). The writer still refreshes the new Item and variant.
CREATE OR REPLACE FUNCTION rate.products_refresh_left()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Lock order everywhere: listing, then variant, then Item. The variant first also gives
  -- the Item its post-move variant prices.
  IF OLD.cluster_id IS NOT NULL AND OLD.cluster_id IS DISTINCT FROM NEW.cluster_id THEN
    PERFORM rate.refresh_master_market_stats(OLD.cluster_id);
  END IF;
  IF OLD.item_id IS NOT NULL AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
    PERFORM rate.refresh_item_stats(OLD.item_id);
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION rate.master_products_sync_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.master_products_move_listings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.products_sync_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.products_refresh_left() FROM PUBLIC, anon, authenticated;

-- Re-check at commit: a write that read the variant before a running retire archived it
-- (its BEFORE trigger saw it live) waits on the variant's FK lock until the retire commits,
-- so at its own commit this deferred check sees the variant archived and moves the listing
-- to "no variant, same Item". The retire's sweeps cover writes committed before it.
CREATE OR REPLACE FUNCTION rate.products_recheck_retired_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override text := COALESCE(current_setting('rate.variant_override', true), '');
BEGIN
  IF NEW.cluster_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.id = NEW.cluster_id AND mp.status = 'archived' AND mp.variant_key = 'unknown') THEN
    PERFORM set_config('rate.variant_override', 'on', true);
    UPDATE rate.products p SET cluster_id = NULL, variant_source = NULL
    WHERE p.id = NEW.id AND p.cluster_id = NEW.cluster_id;
    PERFORM set_config('rate.variant_override', v_override, true);
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION rate.products_recheck_retired_variant() FROM PUBLIC, anon, authenticated;

-- M2.1 Item rating and stats ---------------------------------------------------------------

-- The Item's pooled rating over every crawled listing of the Item, including listings with
-- no variant (design 4.1, Q4), mirrored onto each variant for old readers. Same review filter
-- as refresh_master_product_rating (20261018153000). Variants are written before the Item
-- (lock order: listing, variant, Item).
CREATE OR REPLACE FUNCTION rate.refresh_item_rating(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_weighted numeric;
  v_n        integer;
BEGIN
  SELECT
    COALESCE(round(
      (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
      / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
      2
    ), 0),
    COALESCE((count(*) FILTER (WHERE r.reviewer_type = 'user'))::integer, 0)
  INTO v_weighted, v_n
  FROM rate.products p
  JOIN rate.reviews r ON r.product_id = p.id
  JOIN rate.review_flags f ON f.review_id = r.id
  WHERE p.item_id = p_item_id
    AND p.origin = 'crawl'
    AND r.origin IN ('crawl', 'community')
    AND COALESCE(f.include_in_rating, true)
    AND r.helpfulness_weight > 0;

  -- Mirror onto the variants in id order. A variant another transaction holds is skipped:
  -- that transaction is a refresh of the same Item (every variant write here goes through
  -- refresh_master_market_stats or this function) and mirrors when it gets here, so two
  -- refreshes of sibling variants never wait on each other.
  UPDATE rate.master_products m
  SET user_rating_weighted = v_weighted,
      authentic_review_count = v_n,
      updated_at = now()
  WHERE m.id IN (
    SELECT mp.id FROM rate.master_products mp
    WHERE mp.item_id = p_item_id
      AND (mp.user_rating_weighted, mp.authentic_review_count) IS DISTINCT FROM (v_weighted, v_n)
    ORDER BY mp.id
    FOR UPDATE SKIP LOCKED
  );

  UPDATE rate.items i
  SET user_rating_weighted = v_weighted,
      authentic_review_count = v_n
  WHERE i.id = p_item_id
    AND (i.user_rating_weighted, i.authentic_review_count) IS DISTINCT FROM (v_weighted, v_n);
END $$;

-- Item prices (from its published variants), counts (over every crawled listing, with and
-- without a variant) and its rating.
CREATE OR REPLACE FUNCTION rate.refresh_item_stats(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM rate.refresh_item_rating(p_item_id);
  UPDATE rate.items i
  SET min_price = COALESCE(v.min_price, 0),
      max_price = COALESCE(v.max_price, 0),
      price_variant_count = COALESCE(v.n, 0),
      listing_count = l.listing_count,
      unknown_variant_listing_count = l.unknown_count,
      merchant_count = l.merchant_count
  FROM (
    SELECT min(mp.min_price) FILTER (WHERE mp.min_price > 0) AS min_price,
           max(mp.max_price) FILTER (WHERE mp.min_price > 0) AS max_price,
           (count(*) FILTER (WHERE mp.min_price > 0))::integer AS n
    FROM rate.master_products mp
    WHERE mp.item_id = p_item_id AND mp.status = 'published'
  ) v,
  (
    SELECT count(*)::integer AS listing_count,
           (count(*) FILTER (WHERE p.cluster_id IS NULL))::integer AS unknown_count,
           (count(DISTINCT p.merchant_id))::integer AS merchant_count
    FROM rate.products p
    WHERE p.item_id = p_item_id AND p.origin = 'crawl'
  ) l
  WHERE i.id = p_item_id
    AND (i.min_price, i.max_price, i.price_variant_count, i.listing_count,
         i.unknown_variant_listing_count, i.merchant_count)
      IS DISTINCT FROM (COALESCE(v.min_price, 0), COALESCE(v.max_price, 0), COALESCE(v.n, 0),
                        l.listing_count, l.unknown_count, l.merchant_count);
END $$;

-- Same signature; a master with an Item rates the whole Item (design 4.5). Without an Item
-- (before the backfill) the 20261018153000 body runs unchanged.
CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid;
BEGIN
  SELECT m.item_id INTO v_item FROM rate.master_products m WHERE m.id = p_master_id;
  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item);
    RETURN;
  END IF;
  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = now()
  FROM (
    SELECT
      round(
        (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      (count(*) FILTER (WHERE r.reviewer_type = 'user'))::integer AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id;
END $$;

-- Votes on a listing with no variant count too: resolve the Item through products.item_id
-- (design 4.5). Body of 20261018120103 otherwise unchanged.
CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_up INTEGER;
  v_down INTEGER;
  v_rep INTEGER;
  v_cat TEXT;
  v_verdict TEXT;
  v_inc BOOLEAN;
  v_master UUID;
  v_item UUID;
BEGIN
  SELECT
    count(*) FILTER (WHERE vote = 'up'),
    count(*) FILTER (WHERE vote = 'down'),
    count(*) FILTER (WHERE reported)
  INTO v_up, v_down, v_rep
  FROM rate.review_votes
  WHERE review_id = p_review_id;

  SELECT f.flag_category, f.verdict, COALESCE(f.include_in_rating, true)
  INTO v_cat, v_verdict, v_inc
  FROM rate.review_flags f
  WHERE f.review_id = p_review_id;

  UPDATE rate.reviews
  SET upvotes = v_up,
      downvotes = v_down,
      report_count = v_rep,
      helpfulness_weight = CASE
        WHEN NOT COALESCE(v_inc, true) THEN 0.00
        ELSE rate.compute_review_weight(
          v_up, v_down, v_rep,
          COALESCE(v_cat, 'authentic'),
          COALESCE(v_verdict, 'unanalyzed')
        )
      END
  WHERE id = p_review_id;

  SELECT p.cluster_id, p.item_id INTO v_master, v_item
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id;

  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item);
  ELSIF v_master IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master);
  END IF;
END;
$$;

-- Compatibility hook (removed in M4 with the sync triggers): writers that do not know Items
-- (the importer with RATE_ITEM_MODEL off, Rate Services before task 13) refresh only the
-- variant; its Item is refreshed in the same call. Variant query of 20261024060000 unchanged.
CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid;
BEGIN
  WITH priced AS (
    SELECT
      p.price_current AS price,
      COALESCE(NULLIF(p.price_max, 0), p.price_current) AS price_top,
      p.merchant_id,
      (pg_catalog.row_number() OVER (ORDER BY p.price_current, p.id) - 1)::INTEGER AS k,
      (pg_catalog.count(*) OVER ())::INTEGER AS m
    FROM rate.products p
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND p.availability = 'in_stock'
      AND p.price_current > 0
  ),
  judged AS (
    SELECT
      c.price,
      c.price_top,
      c.merchant_id,
      (c.m >= 3 AND c.price < 0.4 * r.price) AS implausible
    FROM priced c
    LEFT JOIN priced r
      ON r.k = CASE WHEN (c.m - 2) / 2 < c.k THEN (c.m - 2) / 2 ELSE (c.m - 2) / 2 + 1 END
  ),
  s AS (
    SELECT
      MIN(j.price) FILTER (WHERE NOT j.implausible) AS min_price,
      MAX(j.price_top) AS max_price,
      COUNT(DISTINCT j.merchant_id)::INTEGER AS merchant_count
    FROM judged j
  )
  UPDATE rate.master_products m
  SET min_price = s.min_price,
      max_price = s.max_price,
      merchant_count = s.merchant_count,
      updated_at = now()
  FROM s
  WHERE m.id = p_master_id
    AND (m.min_price, m.max_price, m.merchant_count)
      IS DISTINCT FROM (s.min_price, s.max_price, s.merchant_count);
  SELECT m.item_id INTO v_item FROM rate.master_products m WHERE m.id = p_master_id;
  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_stats(v_item);
  END IF;
END $$;

-- M2.2 Item fuzzy match (design 4.5 step 5) -----------------------------------------------

-- Item names carry no storage, so a bare title never scores against a sized name (#1105).
-- p_brand filters; p_model is accepted for the matcher's call shape but does not filter:
-- an Item's model is the key segment and a different spelling must still be found.
CREATE OR REPLACE FUNCTION rate.match_item(
  search_title text,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_threshold real DEFAULT 0.4
)
RETURNS TABLE(item_id uuid, item_key text, name text, similarity real)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_trgm text;
BEGIN
  SELECT n.nspname INTO v_trgm
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm IS NULL THEN
    RAISE EXCEPTION 'rate.match_item: pg_trgm extension is not installed';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT i.id, i.item_key, i.name, %I.similarity(i.name, $1) AS similarity
       FROM rate.items i
      WHERE i.status <> ''archived''
        AND ($2 IS NULL OR lower(i.brand) = lower($2))
        AND %I.similarity(i.name, $1) >= $3
      ORDER BY 4 DESC, i.id
      LIMIT 5',
    v_trgm, v_trgm
  ) USING search_title, p_brand, p_threshold;
END $$;

-- M2.3 retire an Item's unknown variant (design 4.5 step 4, M3 rule for one Item) ---------

-- When a multi-size Item (a live sized variant, a category with a storage axis) still has a
-- live `unknown` variant, its listings move to "no variant" and the variant is archived, in
-- one transaction. Lock order as everywhere else: listings, then the variant, then the Item
-- (through the refreshes), so it cannot deadlock with an ingest moving one of those
-- listings. What it changes is recorded in `metadata` (listing: the variant and source it
-- had; variant: its status before), so the rollback can put it back. Returns the number of
-- listings moved. Price alerts stay on the archived variant (an alert needs a size).
CREATE OR REPLACE FUNCTION rate.retire_item_unknown_variant(p_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_unknown  uuid;
  v_status   text;
  v_moved    integer := 0;
  v_swept    integer := 0;
  v_override text := COALESCE(current_setting('rate.variant_override', true), '');
BEGIN
  IF EXISTS (SELECT 1 FROM rate.items i JOIN rate.categories c ON c.id = i.category_id
             WHERE i.id = p_item_id AND c.slug = 'earbuds') THEN
    RETURN 0;
  END IF;
  SELECT mp.id INTO v_unknown
  FROM rate.master_products mp
  WHERE mp.item_id = p_item_id AND mp.variant_key = 'unknown' AND mp.status IS DISTINCT FROM 'archived';
  IF v_unknown IS NULL THEN
    -- Already retired: move any listing a racing writer put back on it.
    SELECT mp.id INTO v_unknown
    FROM rate.master_products mp
    WHERE mp.item_id = p_item_id AND mp.variant_key = 'unknown' AND mp.status = 'archived'
      AND mp.metadata ->> 'retired_by' = 'retire_item_unknown_variant';
    IF v_unknown IS NULL THEN
      RETURN 0;
    END IF;
    PERFORM set_config('rate.variant_override', 'on', true);
    UPDATE rate.products p
    SET cluster_id = NULL,
        variant_source = NULL,
        metadata = COALESCE(p.metadata, '{}'::jsonb)
          || jsonb_build_object('retired_unknown_variant', v_unknown,
                                'variant_source_before_retire', p.variant_source)
    WHERE p.cluster_id = v_unknown;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    PERFORM set_config('rate.variant_override', v_override, true);
    IF v_moved > 0 THEN
      PERFORM rate.refresh_master_market_stats(v_unknown);
      PERFORM rate.refresh_item_stats(p_item_id);
    END IF;
    RETURN v_moved;
  END IF;
  PERFORM 1 FROM rate.products p WHERE p.cluster_id = v_unknown ORDER BY p.id FOR UPDATE;
  SELECT mp.status INTO v_status FROM rate.master_products mp WHERE mp.id = v_unknown FOR UPDATE;
  -- Re-check under the locks: a concurrent call may have retired it, or the sized variant
  -- may have been archived meanwhile.
  IF NOT FOUND OR v_status IS NOT DISTINCT FROM 'archived' OR NOT EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.item_id = p_item_id AND mp.status IS DISTINCT FROM 'archived'
         AND mp.variant_key ~ '^[0-9]+(gb|tb)$') THEN
    RETURN 0;
  END IF;
  PERFORM set_config('rate.variant_override', 'on', true);
  UPDATE rate.products p
  SET cluster_id = NULL,
      variant_source = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb)
        || jsonb_build_object('retired_unknown_variant', v_unknown,
                              'variant_source_before_retire', p.variant_source)
  WHERE p.cluster_id = v_unknown;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  PERFORM set_config('rate.variant_override', v_override, true);
  UPDATE rate.master_products mp
  SET status = 'archived',
      metadata = COALESCE(mp.metadata, '{}'::jsonb)
        || jsonb_build_object('status_before_retire', v_status, 'retired_by', 'retire_item_unknown_variant')
  WHERE mp.id = v_unknown;
  -- Sweep again: a listing written onto the variant while this ran (its writer read the
  -- variant before the archive) is moved too; later writes see it archived.
  PERFORM set_config('rate.variant_override', 'on', true);
  UPDATE rate.products p
  SET cluster_id = NULL,
      variant_source = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb)
        || jsonb_build_object('retired_unknown_variant', v_unknown,
                              'variant_source_before_retire', p.variant_source)
  WHERE p.cluster_id = v_unknown;
  GET DIAGNOSTICS v_swept = ROW_COUNT;
  PERFORM set_config('rate.variant_override', v_override, true);
  v_moved := v_moved + v_swept;
  PERFORM rate.refresh_master_market_stats(v_unknown);
  PERFORM rate.refresh_item_stats(p_item_id);
  RETURN v_moved;
END $$;

-- M2.4 function grants ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION rate.refresh_item_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.refresh_item_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.match_item(text, text, text, real) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.retire_item_unknown_variant(uuid) FROM PUBLIC, anon, authenticated;
-- The worker calls only refresh_item_stats and match_item (RS#739). refresh_item_stats is
-- SECURITY DEFINER, so the rating it refreshes needs no worker grant; retiring an unknown
-- variant is an admin step. The explicit REVOKE narrows a database that had the wider grant.
REVOKE EXECUTE ON FUNCTION rate.refresh_item_rating(uuid) FROM rate_worker;
REVOKE EXECUTE ON FUNCTION rate.retire_item_unknown_variant(uuid) FROM rate_worker;
GRANT EXECUTE ON FUNCTION rate.refresh_item_rating(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_item_stats(uuid) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.match_item(text, text, text, real) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.retire_item_unknown_variant(uuid) TO service_role;

-- M1.6 triggers (after the functions they call exist) -------------------------------------

DROP TRIGGER IF EXISTS trg_master_products_sync_item ON rate.master_products;
CREATE TRIGGER trg_master_products_sync_item
  BEFORE INSERT OR UPDATE OF model_key, status, item_id ON rate.master_products
  FOR EACH ROW EXECUTE FUNCTION rate.master_products_sync_item();
DROP TRIGGER IF EXISTS trg_master_products_move_listings ON rate.master_products;
CREATE TRIGGER trg_master_products_move_listings
  AFTER UPDATE OF model_key, item_id ON rate.master_products
  FOR EACH ROW EXECUTE FUNCTION rate.master_products_move_listings();
DROP TRIGGER IF EXISTS trg_products_sync_item ON rate.products;
CREATE TRIGGER trg_products_sync_item
  BEFORE INSERT OR UPDATE OF cluster_id, item_id, variant_source ON rate.products
  FOR EACH ROW EXECUTE FUNCTION rate.products_sync_item();
DROP TRIGGER IF EXISTS trg_products_refresh_left ON rate.products;
CREATE TRIGGER trg_products_refresh_left
  AFTER UPDATE OF cluster_id, item_id ON rate.products
  FOR EACH ROW EXECUTE FUNCTION rate.products_refresh_left();
DROP TRIGGER IF EXISTS trg_products_recheck_retired_variant ON rate.products;
CREATE CONSTRAINT TRIGGER trg_products_recheck_retired_variant
  AFTER INSERT OR UPDATE OF cluster_id ON rate.products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION rate.products_recheck_retired_variant();

-- M2.5 backfill (design 7.1) ---------------------------------------------------------------

-- Abort before writing if two Items would share a slug (the M0 inventory found none).
DO $$
DECLARE
  v_clash text;
BEGIN
  SELECT string_agg(slug, ', ') INTO v_clash FROM (
    SELECT rate.item_slug_from_master(mp.slug, mp.model_key) AS slug
    FROM rate.master_products mp
    WHERE mp.item_id IS NULL
    GROUP BY 1
    HAVING count(DISTINCT split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2)) > 1
  ) c;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'M2 backfill: Item slug collisions, resolve them first: %', v_clash;
  END IF;
  -- ...or take the slug of an Item that already exists under another key.
  SELECT string_agg(DISTINCT i.slug, ', ') INTO v_clash
  FROM rate.master_products mp
  JOIN rate.items i ON i.slug = rate.item_slug_from_master(mp.slug, mp.model_key)
  WHERE mp.item_id IS NULL
    AND i.item_key <> split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2);
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'M2 backfill: Item slugs already taken by other Items: %', v_clash;
  END IF;
END $$;

UPDATE rate.master_products mp
SET variant_key = NULLIF(split_part(mp.model_key, ':', 3), '')
WHERE mp.variant_key IS DISTINCT FROM NULLIF(split_part(mp.model_key, ':', 3), '');

-- One Item per brand:model, including Items whose masters are all archived. Representative
-- variant: published first, then most merchants, then oldest. Item specs carry no storage or
-- RAM (variant overrides, design 4.1).
INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status, entity_type,
                        description, specifications, key_specs, spec_provenance, images, thumbnail,
                        expert_rating, expert_review_summary, expert_criteria_scores, metadata)
SELECT DISTINCT ON (k.item_key)
       k.item_key,
       rate.item_slug_from_master(mp.slug, mp.model_key),
       rate.item_name_from_master(mp.name),
       mp.brand, mp.model, mp.category_id,
       CASE WHEN bool_or(mp.status = 'published') OVER w THEN 'published'
            WHEN bool_or(COALESCE(mp.status, 'draft') <> 'archived') OVER w THEN 'draft'
            ELSE 'archived' END,
       COALESCE(mp.entity_type, 'product'), mp.description,
       COALESCE(mp.specifications, '{}'::jsonb) #- '{hardware,storage_gb}' #- '{hardware,ram_gb}',
       COALESCE(mp.key_specs, '{}'::jsonb) - 'storage' - 'ram',
       COALESCE(mp.spec_provenance, '{}'::jsonb), COALESCE(mp.images, '{}'), mp.thumbnail,
       mp.expert_rating, mp.expert_review_summary, COALESCE(mp.expert_criteria_scores, '{}'::jsonb),
       COALESCE(mp.metadata, '{}'::jsonb) || jsonb_build_object('backfilled_from_master', mp.id)
FROM rate.master_products mp
CROSS JOIN LATERAL (
  SELECT split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2) AS item_key
) k
WINDOW w AS (PARTITION BY k.item_key)
ORDER BY k.item_key, (mp.status = 'published') DESC NULLS LAST,
         mp.merchant_count DESC NULLS LAST, mp.created_at ASC NULLS LAST, mp.id
ON CONFLICT (item_key) DO NOTHING;

UPDATE rate.master_products mp SET item_id = i.id
FROM rate.items i
WHERE mp.item_id IS DISTINCT FROM i.id
  AND i.item_key = split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2);

-- Re-runnable and self-correcting: also fixes listings whose master changed after a run.
UPDATE rate.products p
SET item_id = mp.item_id, variant_source = COALESCE(p.variant_source, 'legacy')
FROM rate.master_products mp
WHERE p.cluster_id = mp.id
  AND (p.item_id IS DISTINCT FROM mp.item_id OR p.variant_source IS NULL);

-- Items that already existed (created by the sync trigger, or by a re-run) take their status
-- from their masters, so a published product is never hidden behind a draft Item.
UPDATE rate.items i SET status = s.status
FROM (
  SELECT item_id,
         CASE WHEN bool_or(status = 'published') THEN 'published'
              WHEN bool_or(COALESCE(status, 'draft') <> 'archived') THEN 'draft'
              ELSE 'archived' END AS status
  FROM rate.master_products WHERE item_id IS NOT NULL GROUP BY item_id
) s
WHERE i.id = s.item_id AND i.status IS DISTINCT FROM s.status;

-- Item aggregates and ratings.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT i.id FROM rate.items i ORDER BY i.id LOOP
    PERFORM rate.refresh_item_stats(v_id);
  END LOOP;
END $$;

COMMIT;
