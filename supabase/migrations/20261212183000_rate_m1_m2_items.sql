-- Item model step M1 + M2 (DOS/Rate#1150, DOS/DOS.Me#2015).
-- Upgraded from the reviewed October 2026 proposals for live DOS/DOS.Me@dev:
--   1. Strictly monotonic timestamp > 20261212160100 (runs after 20261212100000 Wave E5 Phase 2, 20261212160100 offboarding, and M0 20261212180000).
--   2. Adds normalized rating columns (rating_score, rating_weight_sum, criteria_scores)
--      and validated entity_type CHECK ('product', 'service', 'place') on rate.items, and
--      syncs entity_type / category_id in master_products_sync_item().
--   3. Preserves all 20261210160000 anti-deadlock locks, validation, quota preservation,
--      and seller_reply invariants across edit_community_review, delete_community_review,
--      submit_community_review[_v2], refresh_master_product_rating,
--      refresh_review_vote_counts, and store_review_values while supporting cluster_id NULL
--      (item_id fallback) and syncing rate.items rating extras.
--   4. Syncs all 20 SIZELESS_CATEGORY_SLUGS (earbuds + Wave E1-E5 + Wave E5 Phase 2) and fixes
--      item_slug_from_master / item_name_from_master against variant-suffix edge cases.
--   5. Enforces post-20261210150000 least-privilege ACLs (explicitly revoking PUBLIC, anon,
--      authenticated, authenticator, rate_worker, service_role before minimal grants) and
--      lock-safe NOT VALID constraints validated post-COMMIT under lock_timeout = '5s'.
--
-- Leaves rate.master_rating_extras(uuid) untouched (20261102233000 verify contract) and adds
-- rate.item_criteria_summary(uuid) + rate.refresh_item_criteria_summary(uuid, boolean) for Items.
-- Leaves rate.v_products_with_merchant_trust untouched (20261018153000 replay safety).
-- M3+M4 (retiring unknown variants and dropping nullable_variant shims) stays separate.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- M1.1 rate.items -----------------------------------------------------------------------------

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
  rating_score                  numeric(4, 3),
  rating_weight_sum             numeric(10, 2) NOT NULL DEFAULT 0,
  criteria_scores               jsonb NOT NULL DEFAULT '{}'::jsonb,
  expert_rating                 numeric(3, 2),
  expert_review_summary         text,
  expert_criteria_scores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_item_key_key UNIQUE (item_key),
  CONSTRAINT items_slug_key UNIQUE (slug)
);

-- Ensure columns exist on re-run or if an earlier draft of rate.items existed without them.
ALTER TABLE rate.items
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS rating_score numeric(4, 3),
  ADD COLUMN IF NOT EXISTS rating_weight_sum numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.items'::pg_catalog.regclass AND conname = 'items_entity_type_check'
  ) THEN
    ALTER TABLE rate.items ADD CONSTRAINT items_entity_type_check
      CHECK (entity_type IN ('product', 'service', 'place')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.items'::pg_catalog.regclass AND conname = 'items_rating_score_range'
  ) THEN
    ALTER TABLE rate.items ADD CONSTRAINT items_rating_score_range
      CHECK (rating_score IS NULL OR (rating_score >= 0 AND rating_score <= 5)) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.items'::pg_catalog.regclass AND conname = 'items_rating_weight_sum_nonneg'
  ) THEN
    ALTER TABLE rate.items ADD CONSTRAINT items_rating_weight_sum_nonneg
      CHECK (rating_weight_sum >= 0) NOT VALID;
  END IF;
END $$;

-- M1.2 Columns, NOT VALID constraints, and indexes on existing tables -------------------------

ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS variant_key text;
ALTER TABLE rate.master_products ADD COLUMN IF NOT EXISTS sort_order smallint;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE rate.products        ADD COLUMN IF NOT EXISTS variant_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.products'::pg_catalog.regclass AND conname = 'products_variant_source_check'
  ) THEN
    ALTER TABLE rate.products ADD CONSTRAINT products_variant_source_check CHECK (
      variant_source IS NULL
      OR variant_source IN ('title', 'sku', 'single_size', 'single_variant', 'manual', 'legacy')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.master_products'::pg_catalog.regclass AND conname = 'fk_master_products_item'
  ) THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT fk_master_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.products'::pg_catalog.regclass AND conname = 'fk_products_item'
  ) THEN
    ALTER TABLE rate.products ADD CONSTRAINT fk_products_item
      FOREIGN KEY (item_id) REFERENCES rate.items(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'rate.items'::pg_catalog.regclass AND conname = 'fk_items_default_variant'
  ) THEN
    ALTER TABLE rate.items ADD CONSTRAINT fk_items_default_variant
      FOREIGN KEY (default_variant_id) REFERENCES rate.master_products(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_products_item_variant
  ON rate.master_products (item_id, variant_key) WHERE item_id IS NOT NULL AND variant_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_products_item ON rate.master_products (item_id);
CREATE INDEX IF NOT EXISTS idx_rate_products_item ON rate.products (item_id);
CREATE INDEX IF NOT EXISTS idx_items_status_cat_price ON rate.items (status, category_id, min_price);
CREATE INDEX IF NOT EXISTS idx_items_status_rating ON rate.items (status, user_rating_weighted DESC);
CREATE INDEX IF NOT EXISTS idx_items_status_rating_score ON rate.items (status, rating_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_items_default_variant
  ON rate.items (default_variant_id) WHERE default_variant_id IS NOT NULL;

-- pg_trgm lives in schema `sign` on prod and `extensions` on fresh branches: look it up dynamically.
DO $$
DECLARE
  v_trgm text;
BEGIN
  SELECT n.nspname INTO v_trgm
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is not installed';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE INDEX IF NOT EXISTS idx_items_name_trgm ON rate.items USING gin (name %I.gin_trgm_ops)',
    v_trgm
  );
  EXECUTE pg_catalog.format(
    'CREATE INDEX IF NOT EXISTS idx_items_name_lower_trgm ON rate.items USING gin ((pg_catalog.lower(name)) %I.gin_trgm_ops)',
    v_trgm
  );
END $$;

-- M1.3 RLS, least-privilege grants, and updated_at --------------------------------------------

ALTER TABLE rate.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published items" ON rate.items;
CREATE POLICY "Public can view published items" ON rate.items
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Service role write items" ON rate.items;
CREATE POLICY "Service role write items" ON rate.items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Rate worker read items" ON rate.items;
CREATE POLICY "Rate worker read items" ON rate.items
  FOR SELECT TO rate_worker USING (true);

DROP POLICY IF EXISTS "Rate worker update items" ON rate.items;
CREATE POLICY "Rate worker update items" ON rate.items
  FOR UPDATE TO rate_worker USING (true) WITH CHECK (true);

-- Explicit full revoke first so pre-existing pg_default_acl entries (e.g. authenticator on prod)
-- cannot linger on rate.items or its columns.
REVOKE ALL ON TABLE rate.items FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT SELECT ON TABLE rate.items TO anon, authenticated, rate_worker;
GRANT ALL ON TABLE rate.items TO service_role;
-- Worker updates only the 6 spec/media columns on rate.items; rating_score, rating_weight_sum,
-- criteria_scores, status, prices, counts, and identity stay server-owned.
GRANT UPDATE (description, specifications, key_specs, images, thumbnail, updated_at)
  ON TABLE rate.items TO rate_worker;

DROP TRIGGER IF EXISTS trg_rate_items_set_updated_at ON rate.items;
CREATE TRIGGER trg_rate_items_set_updated_at
  BEFORE UPDATE ON rate.items
  FOR EACH ROW EXECUTE FUNCTION rate.set_updated_at_timestamp();

-- M1.4 Sizeless category list (all 20 of 24) and Item slug / name helpers ---------------------

CREATE OR REPLACE FUNCTION rate.is_sizeless_category_slug(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_slug, '') = ANY (ARRAY[
    'earbuds',
    'tvs', 'air-conditioners', 'refrigerators', 'washing-machines', 'air-purifiers',
    'bank-savings', 'internet-telecom',
    'supplements', 'cosmetics', 'mother-baby',
    'restaurants', 'cafes', 'hotels', 'homestays',
    'dental-clinics', 'gyms-fitness',
    'spas-aesthetics', 'english-centers', 'credit-cards'
  ]);
$$;

CREATE OR REPLACE FUNCTION rate.item_slug_from_master(p_slug text, p_model_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_slug text := COALESCE(p_slug, '');
  v_variant text := NULLIF(pg_catalog.split_part(COALESCE(p_model_key, ''), ':', 3), '');
  v_stripped text;
BEGIN
  IF v_variant ~ '^[0-9]+(gb|tb)$' THEN
    v_stripped := pg_catalog.regexp_replace(v_slug, '-' || v_variant || '$', '');
    IF v_stripped = v_slug THEN
      v_stripped := pg_catalog.regexp_replace(v_slug, '-[0-9]+(gb|tb)$', '');
    END IF;
  ELSIF v_variant = 'standard' THEN
    v_stripped := pg_catalog.regexp_replace(v_slug, '-standard$', '');
  ELSIF v_variant = 'unknown' THEN
    v_stripped := pg_catalog.regexp_replace(v_slug, '-unknown$', '');
  ELSIF v_variant IS NULL THEN
    v_stripped := pg_catalog.regexp_replace(v_slug, '-([0-9]+(gb|tb)|standard|unknown)$', '');
  ELSE
    v_stripped := v_slug;
  END IF;

  RETURN COALESCE(
    NULLIF(v_stripped, ''),
    pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.lower(
        pg_catalog.split_part(COALESCE(p_model_key, ''), ':', 1)
        || '-'
        || pg_catalog.split_part(COALESCE(p_model_key, ''), ':', 2)
      ),
      '[^a-z0-9-]+', '-', 'g'
    ), '-')
  );
END $$;

CREATE OR REPLACE FUNCTION rate.item_name_from_master(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(COALESCE(p_name, '')),
        '[[:space:]]+[0-9]+([.,][0-9]+)?[[:space:]]?(gb|tb)$',
        '',
        'i'
      )
    ), ''),
    pg_catalog.btrim(COALESCE(p_name, ''))
  );
$$;

-- M1.5 Compatibility sync trigger functions (removed in M4) -----------------------------------

CREATE OR REPLACE FUNCTION rate.master_products_sync_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key          text;
  v_slug         text;
  v_cat_slug     text;
  v_item_name    text;
  v_entity_type  text := COALESCE(NEW.entity_type, 'product');
  v_created_item boolean := false;
  v_next_status  text;
  v_old_status   text;
  v_cur_entity   text;
  v_cur_cat      uuid;
  v_next_entity  text;
  v_next_cat     uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT c.slug INTO v_cat_slug FROM rate.categories c WHERE c.id = NEW.category_id;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.model_key IS DISTINCT FROM OLD.model_key OR NEW.item_id IS NULL THEN
    v_key := pg_catalog.split_part(NEW.model_key, ':', 1) || ':' || pg_catalog.split_part(NEW.model_key, ':', 2);
    NEW.variant_key := NULLIF(pg_catalog.split_part(NEW.model_key, ':', 3), '');
    NEW.item_id := NULL;
    SELECT i.id INTO NEW.item_id FROM rate.items i WHERE i.item_key = v_key;
    IF NEW.item_id IS NULL THEN
      v_slug := rate.item_slug_from_master(NEW.slug, NEW.model_key);
      v_item_name := CASE
        WHEN rate.is_sizeless_category_slug(v_cat_slug) OR v_entity_type IN ('service', 'place')
          THEN NEW.name
        ELSE rate.item_name_from_master(NEW.name)
      END;
      BEGIN
        INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status, entity_type)
        VALUES (
          v_key, v_slug, v_item_name, NEW.brand, NEW.model, NEW.category_id,
          CASE
            WHEN NEW.status = 'published' THEN 'published'
            WHEN COALESCE(NEW.status, 'draft') <> 'archived' THEN 'draft'
            ELSE 'archived'
          END,
          v_entity_type
        )
        ON CONFLICT (item_key) DO NOTHING;
        v_created_item := FOUND;
      EXCEPTION WHEN unique_violation THEN
        INSERT INTO rate.items (item_key, slug, name, brand, model, category_id, status, entity_type)
        VALUES (
          v_key,
          pg_catalog.left(v_slug, 190) || '-' || pg_catalog.left(pg_catalog.md5(v_key), 8),
          v_item_name, NEW.brand, NEW.model, NEW.category_id,
          CASE
            WHEN NEW.status = 'published' THEN 'published'
            WHEN COALESCE(NEW.status, 'draft') <> 'archived' THEN 'draft'
            ELSE 'archived'
          END,
          v_entity_type
        )
        ON CONFLICT (item_key) DO NOTHING;
        v_created_item := FOUND;
      END;
      SELECT i.id INTO NEW.item_id FROM rate.items i WHERE i.item_key = v_key;
    END IF;
  END IF;

  IF NEW.item_id IS NOT NULL AND NOT v_created_item THEN
    SELECT CASE
             WHEN NEW.status = 'published'
                  OR COALESCE(pg_catalog.bool_or(mp.status = 'published'), false)
               THEN 'published'
             WHEN COALESCE(NEW.status, 'draft') <> 'archived'
                  OR COALESCE(pg_catalog.bool_or(COALESCE(mp.status, 'draft') <> 'archived'), false)
               THEN 'draft'
             ELSE 'archived'
           END
    INTO v_next_status
    FROM rate.master_products mp
    WHERE mp.item_id = NEW.item_id
      AND mp.id IS DISTINCT FROM NEW.id;

    SELECT i.entity_type, i.category_id
    INTO v_cur_entity, v_cur_cat
    FROM rate.items i
    WHERE i.id = NEW.item_id;

    v_next_entity := v_cur_entity;
    v_next_cat := v_cur_cat;

    IF TG_OP = 'INSERT' OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
      -- Precedence on attach/insert: service/place upgrades default 'product', and
      -- non-null category_id fills missing category or overrides unpublished defaults.
      IF v_entity_type <> 'product'
         AND (
           v_cur_entity = 'product'
           OR NEW.status = 'published'
           OR NOT EXISTS (
             SELECT 1 FROM rate.master_products mp
             WHERE mp.item_id = NEW.item_id
               AND mp.id IS DISTINCT FROM NEW.id
               AND mp.status = 'published'
               AND COALESCE(mp.entity_type, 'product') <> 'product'
           )
         ) THEN
        v_next_entity := v_entity_type;
      END IF;

      IF NEW.category_id IS NOT NULL
         AND (
           v_cur_cat IS NULL
           OR NEW.status = 'published'
           OR NOT EXISTS (
             SELECT 1 FROM rate.master_products mp
             WHERE mp.item_id = NEW.item_id
               AND mp.id IS DISTINCT FROM NEW.id
               AND mp.status = 'published'
               AND mp.category_id IS NOT NULL
           )
         ) THEN
        v_next_cat := NEW.category_id;
      END IF;
    ELSE
      IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
        IF v_entity_type <> 'product'
           OR NOT EXISTS (
             SELECT 1 FROM rate.master_products mp
             WHERE mp.item_id = NEW.item_id
               AND mp.id IS DISTINCT FROM NEW.id
               AND COALESCE(mp.entity_type, 'product') <> 'product'
               AND (mp.status = 'published' OR NEW.status <> 'published')
           ) THEN
          v_next_entity := v_entity_type;
        END IF;
      ELSIF NEW.status = 'published'
            AND OLD.status IS DISTINCT FROM 'published'
            AND v_entity_type <> 'product'
            AND v_cur_entity = 'product' THEN
        v_next_entity := v_entity_type;
      END IF;

      IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
        IF NEW.category_id IS NOT NULL THEN
          IF NEW.status = 'published'
             OR v_cur_cat IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM rate.master_products mp
               WHERE mp.item_id = NEW.item_id
                 AND mp.id IS DISTINCT FROM NEW.id
                 AND mp.status = 'published'
                 AND mp.category_id IS NOT NULL
             ) THEN
            v_next_cat := NEW.category_id;
          END IF;
        ELSE
          SELECT mp.category_id
          INTO v_next_cat
          FROM rate.master_products mp
          WHERE mp.item_id = NEW.item_id
            AND mp.id IS DISTINCT FROM NEW.id
            AND mp.category_id IS NOT NULL
          ORDER BY (mp.status = 'published') DESC, mp.id
          LIMIT 1;
        END IF;
      ELSIF NEW.category_id IS NOT NULL
            AND NEW.status = 'published'
            AND OLD.status IS DISTINCT FROM 'published' THEN
        v_next_cat := NEW.category_id;
      END IF;
    END IF;

    UPDATE rate.items
    SET status = v_next_status,
        entity_type = COALESCE(v_next_entity, entity_type),
        category_id = v_next_cat
    WHERE id = NEW.item_id
      AND (status, entity_type, category_id) IS DISTINCT FROM (
        v_next_status, COALESCE(v_next_entity, entity_type), v_next_cat
      );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.item_id IS NOT NULL AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
    SELECT CASE
             WHEN COALESCE(pg_catalog.bool_or(mp.status = 'published'), false) THEN 'published'
             WHEN COALESCE(pg_catalog.bool_or(COALESCE(mp.status, 'draft') <> 'archived'), false) THEN 'draft'
             ELSE 'archived'
           END
    INTO v_old_status
    FROM rate.master_products mp
    WHERE mp.item_id = OLD.item_id
      AND mp.id IS DISTINCT FROM NEW.id;

    UPDATE rate.items
    SET status = v_old_status
    WHERE id = OLD.item_id
      AND status IS DISTINCT FROM v_old_status;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION rate.master_products_move_listings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override text := COALESCE(pg_catalog.current_setting('rate.variant_override', true), '');
BEGIN
  IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    PERFORM pg_catalog.set_config('rate.variant_override', 'on', true);
    UPDATE rate.products SET item_id = NEW.item_id
    WHERE cluster_id = NEW.id AND item_id IS DISTINCT FROM NEW.item_id;
    PERFORM pg_catalog.set_config('rate.variant_override', v_override, true);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    IF NEW.item_id IS NOT NULL THEN
      UPDATE rate.items i
      SET status = s.status
      FROM (
        SELECT CASE
                 WHEN COALESCE(pg_catalog.bool_or(mp.status = 'published'), false) THEN 'published'
                 WHEN COALESCE(pg_catalog.bool_or(COALESCE(mp.status, 'draft') <> 'archived'), false) THEN 'draft'
                 ELSE 'archived'
               END AS status
        FROM rate.master_products mp
        WHERE mp.item_id = NEW.item_id
      ) s
      WHERE i.id = NEW.item_id AND i.status IS DISTINCT FROM s.status;
    END IF;

    IF OLD.item_id IS NOT NULL AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
      UPDATE rate.items i
      SET status = s.status
      FROM (
        SELECT CASE
                 WHEN COALESCE(pg_catalog.bool_or(mp.status = 'published'), false) THEN 'published'
                 WHEN COALESCE(pg_catalog.bool_or(COALESCE(mp.status, 'draft') <> 'archived'), false) THEN 'draft'
                 ELSE 'archived'
               END AS status
        FROM rate.master_products mp
        WHERE mp.item_id = OLD.item_id
      ) s
      WHERE i.id = OLD.item_id AND i.status IS DISTINCT FROM s.status;
    END IF;
  END IF;
  RETURN NULL;
END $$;

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
     AND COALESCE(pg_catalog.current_setting('rate.variant_override', true), '') <> 'on'
     AND (NEW.cluster_id IS DISTINCT FROM OLD.cluster_id
          OR NEW.variant_source IS DISTINCT FROM OLD.variant_source
          OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    NEW.cluster_id := OLD.cluster_id;
    NEW.variant_source := OLD.variant_source;
    NEW.item_id := OLD.item_id;
  END IF;

  IF NEW.cluster_id IS NOT NULL THEN
    SELECT mp.item_id, mp.status, mp.variant_key INTO NEW.item_id, v_status, v_variant_key
    FROM rate.master_products mp WHERE mp.id = NEW.cluster_id;
    IF v_status = 'archived' AND v_variant_key = 'unknown'
       AND (TG_OP = 'INSERT' OR NEW.cluster_id IS DISTINCT FROM OLD.cluster_id) THEN
      NEW.cluster_id := NULL;
      NEW.variant_source := NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.metadata ? 'retired_unknown_variant'
     AND (NEW.cluster_id IS NOT NULL OR NEW.item_id IS DISTINCT FROM OLD.item_id) THEN
    NEW.metadata := NEW.metadata - 'retired_unknown_variant' - 'variant_source_before_retire';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION rate.products_refresh_left()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.cluster_id IS NOT NULL AND OLD.cluster_id IS DISTINCT FROM NEW.cluster_id THEN
    PERFORM rate.refresh_master_market_stats(OLD.cluster_id);
  END IF;
  IF OLD.item_id IS NOT NULL AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
    PERFORM rate.refresh_item_stats(OLD.item_id);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION rate.products_recheck_retired_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override text := COALESCE(pg_catalog.current_setting('rate.variant_override', true), '');
BEGIN
  IF NEW.cluster_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.id = NEW.cluster_id AND mp.status = 'archived' AND mp.variant_key = 'unknown') THEN
    PERFORM pg_catalog.set_config('rate.variant_override', 'on', true);
    UPDATE rate.products p SET cluster_id = NULL, variant_source = NULL
    WHERE p.id = NEW.id AND p.cluster_id = NEW.cluster_id;
    PERFORM pg_catalog.set_config('rate.variant_override', v_override, true);
  END IF;
  RETURN NULL;
END $$;

-- M2.1 Item rating extras, stats, and 20261210160000-hardened review / vote / store RPCs ----

-- Compute Item rating_score, rating_weight_sum, and criteria_scores with the exact
-- 20261102233000 Bayesian + completeness-factor formula (without modifying master_rating_extras).
CREATE OR REPLACE FUNCTION rate.item_criteria_summary(p_item_id uuid)
RETURNS TABLE (rating_score numeric, rating_weight_sum numeric, criteria_scores jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_values boolean := pg_catalog.to_regprocedure('rate.review_completeness_factor(jsonb)') IS NOT NULL
                          AND pg_catalog.to_regclass('rate.review_values') IS NOT NULL;
  v_join text := '';
  v_weight text := 'LEAST(3.0, r.helpfulness_weight)::numeric';
BEGIN
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;

  IF v_has_values THEN
    v_join := 'LEFT JOIN rate.review_values v ON v.review_id = r.id';
    v_weight := 'LEAST(3.0, r.helpfulness_weight * rate.review_completeness_factor(v.value_breakdown))::numeric';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format($q$
    WITH eligible AS (
      SELECT %s AS w,
             COALESCE(r.rating_exact, r.rating_star)::numeric AS star,
             r.criteria_ratings
      FROM rate.products p
      JOIN rate.reviews r ON r.product_id = p.id
      JOIN rate.review_flags f ON f.review_id = r.id
      %s
      WHERE p.item_id = $1
        AND p.origin = 'crawl'
        AND r.origin IN ('crawl', 'community')
        AND r.reviewer_type = 'user'
        AND COALESCE(f.include_in_rating, true)
        AND r.helpfulness_weight > 0
    ),
    overall AS (
      SELECT pg_catalog.round(COALESCE(pg_catalog.sum(w), 0), 2) AS weight_sum,
             CASE WHEN pg_catalog.sum(w) > 0
                  THEN pg_catalog.round((3 * 4.2 + pg_catalog.sum(w * star)) / (3 + pg_catalog.sum(w)), 3)
             END AS score
      FROM eligible
      WHERE star BETWEEN 1 AND 5
    ),
    per_criterion AS (
      SELECT c.key,
             pg_catalog.count(*) AS writers,
             pg_catalog.round(pg_catalog.sum(e.w), 2) AS weight_sum,
             pg_catalog.sum(LEAST(1.0, e.w)) AS shown_sum,
             pg_catalog.round((3 * 4.2 + pg_catalog.sum(e.w * (c.value #>> '{}')::numeric)) / (3 + pg_catalog.sum(e.w)), 3) AS score
      FROM eligible e
      CROSS JOIN LATERAL pg_catalog.jsonb_each(
        CASE WHEN pg_catalog.jsonb_typeof(e.criteria_ratings) = 'object' THEN e.criteria_ratings
             ELSE '{}'::jsonb END
      ) AS c(key, value)
      WHERE c.key ~ '^[a-z_]{2,32}$'
        AND pg_catalog.jsonb_typeof(c.value) = 'number'
        AND (c.value #>> '{}')::numeric BETWEEN 1 AND 5
      GROUP BY c.key
    )
    SELECT o.score,
           o.weight_sum,
           COALESCE(
             (SELECT pg_catalog.jsonb_object_agg(pc.key, pg_catalog.jsonb_build_object(
                       'score', pc.score, 'weight_sum', pc.weight_sum, 'writers', pc.writers))
              FROM per_criterion pc
              WHERE pc.writers >= 3 AND pc.shown_sum >= 1.5),
             '{}'::jsonb
           )
    FROM overall o
  $q$, v_weight, v_join) USING p_item_id;
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_item_criteria_summary(
  p_item_id uuid,
  p_skip_item_lock boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score numeric;
  v_weight numeric;
  v_criteria jsonb;
BEGIN
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;

  SELECT x.rating_score, x.rating_weight_sum, x.criteria_scores
  INTO v_score, v_weight, v_criteria
  FROM rate.item_criteria_summary(p_item_id) x;

  -- Lock variants in deterministic id order using SKIP LOCKED (canonical order:
  -- master_products before items, except sibling callers holding master_products skip here
  -- and let the holder write).
  UPDATE rate.master_products m
  SET rating_score = v_score,
      rating_weight_sum = COALESCE(v_weight, 0),
      criteria_scores = COALESCE(v_criteria, '{}'::jsonb)
  WHERE m.id IN (
    SELECT mp.id
    FROM rate.master_products mp
    WHERE mp.item_id = p_item_id
      AND (mp.rating_score, mp.rating_weight_sum, mp.criteria_scores)
          IS DISTINCT FROM (v_score, COALESCE(v_weight, 0), COALESCE(v_criteria, '{}'::jsonb))
    ORDER BY mp.id
    FOR UPDATE SKIP LOCKED
  );

  IF p_skip_item_lock THEN
    UPDATE rate.items i
    SET rating_score = v_score,
        rating_weight_sum = COALESCE(v_weight, 0),
        criteria_scores = COALESCE(v_criteria, '{}'::jsonb)
    WHERE i.id IN (
      SELECT ii.id
      FROM rate.items ii
      WHERE ii.id = p_item_id
        AND (ii.rating_score, ii.rating_weight_sum, ii.criteria_scores)
            IS DISTINCT FROM (v_score, COALESCE(v_weight, 0), COALESCE(v_criteria, '{}'::jsonb))
      FOR UPDATE SKIP LOCKED
    );
  ELSE
    UPDATE rate.items i
    SET rating_score = v_score,
        rating_weight_sum = COALESCE(v_weight, 0),
        criteria_scores = COALESCE(v_criteria, '{}'::jsonb)
    WHERE i.id = p_item_id
      AND (i.rating_score, i.rating_weight_sum, i.criteria_scores)
          IS DISTINCT FROM (v_score, COALESCE(v_weight, 0), COALESCE(v_criteria, '{}'::jsonb));
  END IF;
END $$;

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
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock the Item row first so two concurrent vote/edit/delete paths on cluster_id IS NULL
  -- listings serialize on rate.items without lost updates.
  PERFORM 1
  FROM rate.items i
  WHERE i.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(pg_catalog.round(
      (pg_catalog.sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
      / NULLIF(pg_catalog.sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
      2
    ), 0),
    COALESCE((pg_catalog.count(*) FILTER (WHERE r.reviewer_type = 'user'))::integer, 0)
  INTO v_weighted, v_n
  FROM rate.products p
  JOIN rate.reviews r ON r.product_id = p.id
  JOIN rate.review_flags f ON f.review_id = r.id
  WHERE p.item_id = p_item_id
    AND p.origin = 'crawl'
    AND r.origin IN ('crawl', 'community')
    AND COALESCE(f.include_in_rating, true)
    AND r.helpfulness_weight > 0;

  UPDATE rate.master_products m
  SET user_rating_weighted = v_weighted,
      authentic_review_count = v_n,
      updated_at = pg_catalog.now()
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

  PERFORM rate.refresh_item_criteria_summary(p_item_id, false);
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_item_stats(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM rate.refresh_item_rating(p_item_id);

  UPDATE rate.items i
  SET min_price = COALESCE(v.min_price, 0),
      max_price = COALESCE(v.max_price, 0),
      price_variant_count = COALESCE(v.n, 0),
      listing_count = l.listing_count,
      unknown_variant_listing_count = l.unknown_count,
      merchant_count = l.merchant_count,
      status = CASE WHEN v.total_variants > 0 THEN v.derived_status ELSE i.status END
  FROM (
    SELECT pg_catalog.count(*) AS total_variants,
           CASE
             WHEN COALESCE(pg_catalog.bool_or(mp.status = 'published'), false) THEN 'published'
             WHEN COALESCE(pg_catalog.bool_or(COALESCE(mp.status, 'draft') <> 'archived'), false) THEN 'draft'
             ELSE 'archived'
           END AS derived_status,
           pg_catalog.min(mp.min_price) FILTER (WHERE mp.status = 'published' AND mp.min_price > 0) AS min_price,
           pg_catalog.max(mp.max_price) FILTER (WHERE mp.status = 'published' AND mp.min_price > 0) AS max_price,
           (pg_catalog.count(*) FILTER (WHERE mp.status = 'published' AND mp.min_price > 0))::integer AS n
    FROM rate.master_products mp
    WHERE mp.item_id = p_item_id
  ) v,
  (
    SELECT pg_catalog.count(*)::integer AS listing_count,
           (pg_catalog.count(*) FILTER (WHERE p.cluster_id IS NULL))::integer AS unknown_count,
           (pg_catalog.count(DISTINCT p.merchant_id))::integer AS merchant_count
    FROM rate.products p
    WHERE p.item_id = p_item_id AND p.origin = 'crawl'
  ) l
  WHERE i.id = p_item_id
    AND (i.min_price, i.max_price, i.price_variant_count, i.listing_count,
         i.unknown_variant_listing_count, i.merchant_count, i.status)
      IS DISTINCT FROM (COALESCE(v.min_price, 0), COALESCE(v.max_price, 0), COALESCE(v.n, 0),
                        l.listing_count, l.unknown_count, l.merchant_count,
                        CASE WHEN v.total_variants > 0 THEN v.derived_status ELSE i.status END);
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_weighted numeric;
  v_prev_count integer;
  v_next_weighted numeric;
  v_next_count integer;
  v_item uuid;
BEGIN
  IF p_master_id IS NULL THEN
    RETURN;
  END IF;

  -- Preserve 20261210160000: lock the master row FOR UPDATE before aggregating or delegating
  -- to its Item so concurrent votes/edits/deletes serialize without lock upgrade deadlocks.
  SELECT m.user_rating_weighted, m.authentic_review_count, m.item_id
  INTO v_prev_weighted, v_prev_count, v_item
  FROM rate.master_products m
  WHERE m.id = p_master_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item);
    RETURN;
  END IF;

  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = pg_catalog.now()
  FROM (
    SELECT
      pg_catalog.round(
        (pg_catalog.sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(pg_catalog.sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      (pg_catalog.count(*) FILTER (WHERE r.reviewer_type = 'user'))::INTEGER AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id
  RETURNING m.user_rating_weighted, m.authentic_review_count
  INTO v_next_weighted, v_next_count;

  IF (v_prev_weighted, v_prev_count) IS NOT DISTINCT FROM (v_next_weighted, v_next_count)
     AND pg_catalog.to_regprocedure('rate.refresh_master_rating_extras(uuid)') IS NOT NULL THEN
    PERFORM rate.refresh_master_rating_extras(p_master_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id UUID)
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
  IF p_review_id IS NULL THEN
    RETURN;
  END IF;

  -- Preserve 20261210160000: FOR NO KEY UPDATE on reviews avoids FK check deadlocks on review_votes.
  PERFORM 1
  FROM rate.reviews r
  WHERE r.id = p_review_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (WHERE vote = 'up'),
    pg_catalog.count(*) FILTER (WHERE vote = 'down'),
    pg_catalog.count(*) FILTER (WHERE reported)
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

  SELECT p.cluster_id, p.item_id
  INTO v_master, v_item
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id;

  -- Canonical lock order: master_products before items when cluster_id is present;
  -- item-only listings (cluster_id IS NULL) refresh rate.items directly.
  IF v_master IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master);
  ELSIF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_master_rating_extras(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid := rate.master_rating_item(p_master_id);
  v_score numeric;
  v_weight numeric;
  v_criteria jsonb;
BEGIN
  IF p_master_id IS NULL THEN
    RETURN;
  END IF;

  SELECT x.rating_score, x.rating_weight_sum, x.criteria_scores
  INTO v_score, v_weight, v_criteria
  FROM rate.master_rating_extras(p_master_id) x;

  EXECUTE pg_catalog.format($q$
    UPDATE rate.master_products m
    SET rating_score = $2, rating_weight_sum = $3, criteria_scores = $4
    WHERE m.id IN (
      SELECT mp.id FROM rate.master_products mp
      WHERE %s = $1
        AND (mp.rating_score, mp.rating_weight_sum, mp.criteria_scores)
            IS DISTINCT FROM ($2, $3, $4)
      ORDER BY mp.id
      FOR UPDATE SKIP LOCKED)
  $q$, CASE WHEN v_item IS NULL THEN 'mp.id' ELSE 'mp.item_id' END)
  USING COALESCE(v_item, p_master_id), v_score, v_weight, v_criteria;

  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_criteria_summary(v_item, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_rating_extras_of_products(p_products uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_masters uuid[];
  v_extra uuid[];
  v_master uuid;
  v_item uuid;
  v_done uuid[] := '{}';
BEGIN
  IF p_products IS NULL OR pg_catalog.cardinality(p_products) = 0 THEN
    RETURN;
  END IF;

  v_masters := ARRAY(
    SELECT DISTINCT p.cluster_id
    FROM rate.products p
    WHERE p.id = ANY (p_products) AND p.cluster_id IS NOT NULL
  );

  SELECT ARRAY(
    SELECT DISTINCT ON (p.item_id) m.id
    FROM rate.products p
    JOIN rate.master_products m ON m.item_id = p.item_id
    WHERE p.id = ANY (p_products) AND p.cluster_id IS NULL AND p.item_id IS NOT NULL
    ORDER BY p.item_id, m.id
  ) INTO v_extra;

  v_masters := COALESCE(v_masters, '{}'::uuid[]) || COALESCE(v_extra, '{}'::uuid[]);

  FOR v_master IN SELECT DISTINCT unnest(v_masters) ORDER BY 1 LOOP
    v_item := rate.master_rating_item(v_master);
    IF v_item IS NOT NULL THEN
      CONTINUE WHEN v_item = ANY (v_done);
      v_done := v_done || v_item;
    END IF;
    PERFORM rate.refresh_master_rating_extras(v_master);
  END LOOP;

  -- Also refresh any Item whose affected listing has no variant rows (e.g. direct Item listings).
  FOR v_item IN
    SELECT DISTINCT p.item_id
    FROM rate.products p
    WHERE p.id = ANY (p_products)
      AND p.item_id IS NOT NULL
      AND NOT (p.item_id = ANY (v_done))
    ORDER BY p.item_id
  LOOP
    PERFORM rate.refresh_item_criteria_summary(v_item, true);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid;
BEGIN
  IF p_master_id IS NULL THEN
    RETURN;
  END IF;

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
      updated_at = pg_catalog.now()
  FROM s
  WHERE m.id = p_master_id
    AND (m.min_price, m.max_price, m.merchant_count)
      IS DISTINCT FROM (s.min_price, s.max_price, s.merchant_count);

  SELECT m.item_id INTO v_item FROM rate.master_products m WHERE m.id = p_master_id;
  IF v_item IS NOT NULL THEN
    PERFORM rate.refresh_item_stats(v_item);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rate.edit_community_review(
  p_review_id uuid,
  p_criteria_ratings jsonb DEFAULT NULL,
  p_verdict text DEFAULT NULL,
  p_pros jsonb DEFAULT NULL,
  p_cons jsonb DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_variation text DEFAULT NULL,
  p_rating_star integer DEFAULT NULL,
  p_criterion_points jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_probe record;
  v_review record;
  v_master_id uuid;
  v_item_id uuid;
  v_master_item_id uuid;
  v_category text;
  v_version integer;
  v_criterion record;
  v_value jsonb;
  v_star numeric;
  v_clean_criteria jsonb := '{}'::jsonb;
  v_weighted numeric := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_rating_exact numeric(2, 1);
  v_rating_star smallint;
  v_verdict text;
  v_verdict_len integer;
  v_pros text[];
  v_cons text[];
  v_key text;
  v_points jsonb;
  v_cr_pros text[];
  v_cr_cons text[];
  v_criterion_lines jsonb := '[]'::jsonb;
  v_comment text;
  v_comment_len integer;
  v_criterion_points_text text;
  v_all_text text;
  v_clean_variation text;
  v_line_count integer := 0;
  v_i integer;
  v_flag_verdict text := 'unanalyzed';
  v_flag_category text := NULL;
  v_reason text := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
  v_edited_at timestamptz;
BEGIN
  IF v_uid IS NULL OR COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để chỉnh sửa đánh giá'
      USING ERRCODE = '42501';
  END IF;

  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'review_id is required'
      USING ERRCODE = '22023', DETAIL = 'review_id';
  END IF;

  IF p_criteria_ratings IS NOT NULL
     AND jsonb_typeof(p_criteria_ratings) = 'object'
     AND (SELECT pg_catalog.count(*) FROM jsonb_object_keys(p_criteria_ratings)) > 32 THEN
    RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
      USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
  );

  SELECT r.id, r.origin, p.cluster_id, p.item_id
  INTO v_probe
  FROM rate.reviews r
  LEFT JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_probe.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.product_id, r.author_name, r.origin, r.reviewer_type,
         r.criteria_version AS existing_criteria_version, r.created_at,
         r.comment AS existing_comment, r.verdict AS existing_verdict, r.variation AS existing_variation,
         p.cluster_id, p.item_id
  INTO v_review
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community')
  FOR NO KEY UPDATE OF r FOR SHARE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_review.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  v_master_id := v_review.cluster_id;
  v_item_id := v_review.item_id;
  v_category := NULL;

  -- Canonical lock order: master_products FOR UPDATE -> items FOR UPDATE before reading
  -- category_id so concurrent recategorization or cluster_id NULL listings validate cleanly.
  IF v_master_id IS NOT NULL THEN
    SELECT m.item_id, (SELECT c.slug FROM rate.categories c WHERE c.id = m.category_id)
    INTO v_master_item_id, v_category
    FROM rate.master_products m
    WHERE m.id = v_master_id
    FOR UPDATE;
    v_item_id := COALESCE(v_item_id, v_master_item_id);
  END IF;

  IF v_item_id IS NOT NULL THEN
    SELECT COALESCE(v_category, (SELECT c.slug FROM rate.categories c WHERE c.id = i.category_id))
    INTO v_category
    FROM rate.items i
    WHERE i.id = v_item_id
    FOR UPDATE;
  END IF;

  IF v_category IS NOT NULL THEN
    SELECT pg_catalog.max(criteria_version) INTO v_version
    FROM rate.rating_criteria
    WHERE category_slug = v_category;
  END IF;

  IF v_review.existing_criteria_version IS NOT NULL AND v_version IS NULL THEN
    RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm'
      USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  IF v_version IS NOT NULL THEN
    IF p_criteria_ratings IS NULL OR jsonb_typeof(p_criteria_ratings) <> 'object' THEN
      RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_criteria_ratings) LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM rate.rating_criteria
        WHERE criteria_version = v_version
          AND category_slug = v_category
          AND key = v_key
      ) THEN
        RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
      END IF;
    END LOOP;

    FOR v_criterion IN
      SELECT key, weight, required
      FROM rate.rating_criteria
      WHERE criteria_version = v_version
        AND category_slug = v_category
      ORDER BY position
    LOOP
      v_value := p_criteria_ratings -> v_criterion.key;
      IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
        IF v_criterion.required THEN
          RAISE EXCEPTION 'Tiêu chí này là bắt buộc'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
        END IF;
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF jsonb_typeof(v_value) <> 'number' THEN
        RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;

      v_star := (v_value #>> '{}')::numeric;
      IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
        RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;

      v_star := pg_catalog.round(v_star, 1);
      v_clean_criteria := v_clean_criteria || jsonb_build_object(v_criterion.key, v_star);
      v_weighted := v_weighted + v_star * v_criterion.weight;
      v_weights := v_weights + v_criterion.weight;
    END LOOP;

    IF v_skipped > 2 THEN
      RAISE EXCEPTION 'Chỉ được bỏ qua tối đa 2 tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;
    IF v_weights <= 0 THEN
      RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    v_rating_exact := pg_catalog.round(v_weighted / v_weights, 1);
    v_rating_star := pg_catalog.round(v_rating_exact)::smallint;

    v_verdict := rate.review_text_stored(p_verdict);
    v_verdict_len := rate.review_text_length(v_verdict);
    IF v_verdict_len < 20 OR v_verdict_len > 300 THEN
      RAISE EXCEPTION 'Phần kết luận cần từ 20 đến 300 ký tự'
        USING ERRCODE = '22023', DETAIL = 'verdict';
    END IF;
    IF NOT rate.review_point_has_content(v_verdict) THEN
      RAISE EXCEPTION 'Phần kết luận chưa có nội dung'
        USING ERRCODE = '22023', DETAIL = 'verdict';
    END IF;

    v_pros := rate.review_point_list(p_pros, 'pro', 1, 5, 'pros');
    v_cons := rate.review_point_list(p_cons, 'con', 1, 5, 'cons');
    FOR v_i IN 1 .. pg_catalog.array_length(v_cons, 1) LOOP
      IF rate.review_point_compare(v_cons[v_i]) IN (
        SELECT rate.review_point_compare(x) FROM unnest(v_pros) x
      ) THEN
        RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
          USING ERRCODE = '22023', DETAIL = 'cons.' || (v_i - 1);
      END IF;
    END LOOP;

    IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) NOT IN ('object', 'null') THEN
      RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
        USING ERRCODE = '22023', DETAIL = 'criterion_points';
    END IF;

    IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) = 'object' THEN
      FOR v_key, v_points IN SELECT * FROM jsonb_each(p_criterion_points) LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM rate.rating_criteria
          WHERE criteria_version = v_version
            AND category_slug = v_category
            AND key = v_key
        ) THEN
          RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || pg_catalog.left(v_key, 40);
        END IF;

        IF jsonb_typeof(v_points) <> 'object' THEN
          RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key;
        END IF;

        v_cr_pros := rate.review_point_list(
          v_points -> 'pros', 'pro', 0, 3, 'criterion_points.' || v_key || '.pros'
        );
        v_cr_cons := rate.review_point_list(
          v_points -> 'cons', 'con', 0, 3, 'criterion_points.' || v_key || '.cons'
        );

        FOR v_i IN 1 .. COALESCE(pg_catalog.array_length(v_cr_cons, 1), 0) LOOP
          IF rate.review_point_compare(v_cr_cons[v_i]) IN (
            SELECT rate.review_point_compare(x) FROM unnest(v_cr_pros) x
          ) THEN
            RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
              USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key || '.cons.' || (v_i - 1);
          END IF;
        END LOOP;

        v_criterion_lines := v_criterion_lines || jsonb_build_object(
          'key', v_key,
          'pros', to_jsonb(v_cr_pros),
          'cons', to_jsonb(v_cr_cons)
        );
      END LOOP;
    END IF;

    IF p_comment IS NULL THEN
      IF v_review.existing_comment IS NOT NULL
         AND v_review.existing_comment IS DISTINCT FROM COALESCE(v_review.existing_verdict, '') THEN
        v_comment := v_review.existing_comment;
      ELSE
        v_comment := v_verdict;
      END IF;
    ELSE
      v_comment := rate.review_text_stored(p_comment);
      v_comment_len := pg_catalog.char_length(v_comment);
      IF v_comment_len > 3000 THEN
        RAISE EXCEPTION 'Nội dung đánh giá tối đa 3000 ký tự'
          USING ERRCODE = '22023', DETAIL = 'comment';
      END IF;
      IF v_comment_len = 0 THEN
        v_comment := v_verdict;
      END IF;
    END IF;

    IF p_criterion_points IS NULL THEN
      SELECT pg_catalog.string_agg(rp.body, E'\n')
      INTO v_criterion_points_text
      FROM rate.review_points rp
      WHERE rp.review_id = p_review_id
        AND rp.method = 'writer'
        AND rp.criterion_key IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM rate.rating_criteria rc
          WHERE rc.criteria_version = v_version
            AND rc.category_slug = v_category
            AND rc.key = rp.criterion_key
        );
    ELSE
      SELECT pg_catalog.string_agg(line, E'\n')
      INTO v_criterion_points_text
      FROM jsonb_array_elements(v_criterion_lines) e,
           LATERAL (
             SELECT jsonb_array_elements_text(e -> 'pros')
             UNION ALL
             SELECT jsonb_array_elements_text(e -> 'cons')
           ) AS t(line);
    END IF;

    v_all_text := pg_catalog.concat_ws(
      E'\n',
      v_comment,
      v_verdict,
      pg_catalog.array_to_string(v_pros, E'\n'),
      pg_catalog.array_to_string(v_cons, E'\n'),
      v_criterion_points_text
    );

    IF v_all_text ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
    ELSIF v_all_text ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'seeding_fake';
      v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
    ELSIF v_rating_star <= 2 AND v_all_text ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'competitor_sabotage';
      v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
    END IF;
  ELSE
    IF p_verdict IS NOT NULL
       OR (p_pros IS NOT NULL AND jsonb_typeof(p_pros) <> 'null')
       OR (p_cons IS NOT NULL AND jsonb_typeof(p_cons) <> 'null')
       OR (p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) <> 'null') THEN
      RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    IF p_rating_star IS NULL OR p_rating_star < 1 OR p_rating_star > 5 THEN
      RAISE EXCEPTION 'Số sao đánh giá phải từ 1 đến 5'
        USING ERRCODE = '22023', DETAIL = 'rating_star';
    END IF;
    v_rating_star := p_rating_star::smallint;
    v_rating_exact := NULL;
    v_verdict := NULL;

    IF p_comment IS NULL THEN
      v_comment := rate.review_text_stored(v_review.existing_comment);
    ELSE
      v_comment := rate.review_text_stored(p_comment);
    END IF;
    v_comment_len := pg_catalog.char_length(v_comment);
    IF v_comment_len < 15 OR v_comment_len > 3000 THEN
      RAISE EXCEPTION 'Nội dung đánh giá phải từ 15 đến 3000 ký tự'
        USING ERRCODE = '22023', DETAIL = 'comment';
    END IF;

    IF p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) <> 'null' THEN
      IF jsonb_typeof(p_criteria_ratings) <> 'object' THEN
        RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criteria';
      END IF;
      IF (SELECT pg_catalog.count(*) FROM jsonb_object_keys(p_criteria_ratings)) > 32 THEN
        RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criteria';
      END IF;
      FOR v_key, v_value IN SELECT * FROM jsonb_each(p_criteria_ratings) LOOP
        IF v_key !~ '^[a-z_]{2,32}$' THEN
          RAISE EXCEPTION 'Tiêu chí không hợp lệ'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
        END IF;
        IF jsonb_typeof(v_value) <> 'number' THEN
          RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_key;
        END IF;
        v_star := (v_value #>> '{}')::numeric;
        IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
          RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_key;
        END IF;
      END LOOP;
      SELECT COALESCE(
        pg_catalog.jsonb_object_agg(
          e.key,
          to_jsonb(pg_catalog.round((e.value #>> '{}')::numeric, 1))
        ),
        '{}'::jsonb
      )
      INTO v_clean_criteria
      FROM jsonb_each(p_criteria_ratings) e;
    END IF;

    IF v_comment ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
    ELSIF v_comment ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'seeding_fake';
      v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
    ELSIF v_rating_star <= 2 AND v_comment ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'competitor_sabotage';
      v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
    ELSIF v_comment_len < 30 THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình.';
    END IF;
  END IF;

  IF p_variation IS NULL THEN
    v_clean_variation := v_review.existing_variation;
  ELSE
    v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(p_variation), 120), '');
  END IF;

  IF p_criterion_points IS NULL AND v_version IS NOT NULL THEN
    DELETE FROM rate.review_points rp
    WHERE rp.review_id = p_review_id
      AND rp.method = 'writer'
      AND (
        rp.criterion_key IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM rate.rating_criteria rc
          WHERE rc.criteria_version = v_version
            AND rc.category_slug = v_category
            AND rc.key = rp.criterion_key
        )
      );
  ELSE
    DELETE FROM rate.review_points
    WHERE review_id = p_review_id
      AND method = 'writer';
  END IF;

  DELETE FROM rate.review_values
  WHERE review_id = p_review_id;

  UPDATE rate.reviews
  SET rating_star = v_rating_star,
      rating_exact = v_rating_exact,
      comment = v_comment,
      verdict = v_verdict,
      variation = v_clean_variation,
      criteria_ratings = v_clean_criteria,
      criteria_version = v_version,
      edited_at = pg_catalog.now(),
      helpfulness_weight = 0.00,
      value_score = NULL,
      value_breakdown = NULL,
      value_tier = NULL
  WHERE id = p_review_id
  RETURNING edited_at INTO v_edited_at;

  IF v_version IS NOT NULL THEN
    INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
    SELECT p_review_id, NULL, 'pro', line, ord - 1, 'writer'
    FROM unnest(v_pros) WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, NULL, 'con', line, ord - 1, 'writer'
    FROM unnest(v_cons) WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, e ->> 'key', 'pro', line, ord - 1, 'writer'
    FROM jsonb_array_elements(v_criterion_lines) e,
         jsonb_array_elements_text(e -> 'pros') WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, e ->> 'key', 'con', line, ord - 1, 'writer'
    FROM jsonb_array_elements(v_criterion_lines) e,
         jsonb_array_elements_text(e -> 'cons') WITH ORDINALITY AS t(line, ord);

    SELECT pg_catalog.count(*)::integer
    INTO v_line_count
    FROM rate.review_points
    WHERE review_id = p_review_id
      AND method = 'writer';
  END IF;

  INSERT INTO rate.review_flags (
    review_id, verdict, fake_probability, flag_category, include_in_rating, reason, signals,
    detector, detector_version, generation, input_hash, analyzed_at
  )
  VALUES (
    p_review_id, v_flag_verdict, NULL, v_flag_category, false, v_reason, '{}'::jsonb,
    'rate-community-guard', 'v3', 1,
    rate.review_input_hash(v_review.author_name, v_rating_star, v_comment),
    pg_catalog.now()
  )
  ON CONFLICT (review_id) DO UPDATE
    SET verdict = EXCLUDED.verdict,
        fake_probability = NULL,
        flag_category = EXCLUDED.flag_category,
        include_in_rating = false,
        reason = EXCLUDED.reason,
        signals = '{}'::jsonb,
        detector = EXCLUDED.detector,
        detector_version = EXCLUDED.detector_version,
        generation = rate.review_flags.generation + 1,
        input_hash = EXCLUDED.input_hash,
        analyzed_at = EXCLUDED.analyzed_at;

  IF v_master_id IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master_id);
  ELSIF v_item_id IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item_id);
  END IF;

  RETURN jsonb_build_object(
    'id', p_review_id,
    'product_id', v_review.product_id,
    'master_product_id', v_master_id,
    'author_name', v_review.author_name,
    'rating_star', v_rating_star,
    'rating_exact', v_rating_exact,
    'criteria_ratings', v_clean_criteria,
    'criteria_version', v_version,
    'verdict', v_verdict,
    'comment', v_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_review.reviewer_type,
    'points', v_line_count,
    'flag_verdict', v_flag_verdict,
    'flag_category', v_flag_category,
    'include_in_rating', false,
    'reason', v_reason,
    'created_at', v_review.created_at,
    'edited_at', v_edited_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION rate.delete_community_review(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_probe record;
  v_review record;
  v_master_id uuid;
  v_item_id uuid;
  v_submitted_at timestamptz;
BEGIN
  IF v_uid IS NULL OR COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để xóa đánh giá'
      USING ERRCODE = '42501';
  END IF;

  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'review_id is required'
      USING ERRCODE = '22023', DETAIL = 'review_id';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
  );

  SELECT r.id, r.origin, p.cluster_id, p.item_id
  INTO v_probe
  FROM rate.reviews r
  LEFT JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_probe.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM rate.review_votes rv
  WHERE rv.review_id = p_review_id
  ORDER BY rv.voter_id
  FOR UPDATE;

  SELECT r.id, r.origin, p.cluster_id, p.item_id
  INTO v_review
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community')
  FOR UPDATE OF r FOR SHARE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  SELECT a.created_at
  INTO v_submitted_at
  FROM rate.review_authors a
  WHERE a.review_id = p_review_id
    AND a.author_user_id = v_uid;

  IF v_review.origin IS DISTINCT FROM 'community' OR NOT FOUND THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  v_master_id := v_review.cluster_id;
  v_item_id := v_review.item_id;

  PERFORM rate.purge_deleted_review_submissions(interval '24 hours', 50);

  IF v_submitted_at IS NOT NULL AND v_submitted_at > pg_catalog.now() - interval '24 hours' THEN
    INSERT INTO rate.review_deleted_submissions (review_id, author_user_id, submitted_at)
    VALUES (p_review_id, v_uid, v_submitted_at)
    ON CONFLICT (review_id) DO NOTHING;
  END IF;

  DELETE FROM rate.reviews
  WHERE id = p_review_id;

  IF v_master_id IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master_id);
  ELSIF v_item_id IS NOT NULL THEN
    PERFORM rate.refresh_item_rating(v_item_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_review_id,
    'master_product_id', v_master_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION rate.submit_community_review(
  p_master_product_id UUID,
  p_author_name TEXT,
  p_rating_star INTEGER,
  p_comment TEXT,
  p_variation TEXT DEFAULT NULL,
  p_reviewer_type TEXT DEFAULT 'user',
  p_criteria_ratings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_claim_role TEXT := COALESCE(v_claims ->> 'role', '');
  v_is_service BOOLEAN;
  v_item_id UUID;
  v_product_id UUID;
  v_review_id UUID;
  v_created_at TIMESTAMPTZ;
  v_clean_author TEXT;
  v_clean_comment TEXT;
  v_clean_variation TEXT;
  v_clean_type TEXT;
  v_clean_criteria JSONB;
  v_comment_len INTEGER;
  v_recent INTEGER;
  v_verdict TEXT := 'unanalyzed';
  v_flag_category TEXT := NULL;
  v_reason TEXT := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
BEGIN
  v_is_service := v_claim_role = 'service_role';

  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023';
  END IF;

  v_clean_author := pg_catalog.left(pg_catalog.btrim(COALESCE(p_author_name, '')), 80);
  IF pg_catalog.char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;

  v_clean_comment := pg_catalog.btrim(COALESCE(p_comment, ''));
  v_comment_len := pg_catalog.char_length(v_clean_comment);
  IF v_comment_len < 15 OR v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá phải từ 15 đến 3000 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_rating_star IS NULL OR p_rating_star < 1 OR p_rating_star > 5 THEN
    RAISE EXCEPTION 'Số sao đánh giá phải từ 1 đến 5' USING ERRCODE = '22023';
  END IF;

  v_clean_type := CASE
    WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert'
    ELSE 'user'
  END;

  v_clean_criteria := CASE
    WHEN p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) = 'object'
    THEN p_criteria_ratings
    ELSE '{}'::jsonb
  END;

  v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_variation, '')), 120), '');

  -- Support both variant master_products.id and rate.items.id; fall back to item_id when
  -- a variant's listings have cluster_id IS NULL (nullable_variant).
  SELECT m.item_id INTO v_item_id
  FROM rate.master_products m
  WHERE m.id = p_master_product_id;

  IF NOT FOUND THEN
    SELECT i.id INTO v_item_id
    FROM rate.items i
    WHERE i.id = p_master_product_id;
  END IF;

  SELECT p.id INTO v_product_id
  FROM rate.products p
  WHERE p.origin = 'crawl'
    AND (
      p.cluster_id = p_master_product_id
      OR (v_item_id IS NOT NULL AND p.item_id = v_item_id)
    )
  ORDER BY (p.cluster_id = p_master_product_id) DESC NULLS LAST,
           p.price_current ASC NULLS LAST,
           p.created_at ASC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM rate.review_authors a
      JOIN rate.reviews r ON r.id = a.review_id
      JOIN rate.products p ON p.id = r.product_id
      WHERE a.author_user_id = v_uid
        AND (
          p.cluster_id = p_master_product_id
          OR (v_item_id IS NOT NULL AND p.item_id = v_item_id)
        )
    ) THEN
      RAISE EXCEPTION 'Bạn đã gửi đánh giá cho sản phẩm này' USING ERRCODE = '23505';
    END IF;

    SELECT
      (SELECT pg_catalog.count(*)
       FROM rate.review_authors
       WHERE author_user_id = v_uid
         AND created_at > pg_catalog.now() - interval '24 hours')
      +
      (SELECT pg_catalog.count(*)
       FROM rate.review_deleted_submissions
       WHERE author_user_id = v_uid
         AND submitted_at > pg_catalog.now() - interval '24 hours')
    INTO v_recent;

    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

  IF v_clean_comment ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
  ELSIF v_clean_comment ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'seeding_fake';
    v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
  ELSIF p_rating_star <= 2 AND v_clean_comment ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'competitor_sabotage';
    v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
  ELSIF v_comment_len < 30 THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình.';
  END IF;

  INSERT INTO rate.reviews (
    product_id,
    platform_review_id,
    author_name,
    rating_star,
    comment,
    variation,
    is_verified_buyer,
    reviewer_type,
    criteria_ratings,
    upvotes,
    downvotes,
    report_count,
    helpfulness_weight
  )
  VALUES (
    v_product_id,
    'rate_comm_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    v_clean_author,
    p_rating_star::smallint,
    v_clean_comment,
    v_clean_variation,
    NULL,
    v_clean_type,
    v_clean_criteria,
    0,
    0,
    0,
    0.00
  )
  RETURNING id, created_at INTO v_review_id, v_created_at;

  IF v_uid IS NOT NULL THEN
    INSERT INTO rate.review_authors (review_id, author_user_id)
    VALUES (v_review_id, v_uid);
  END IF;

  INSERT INTO rate.review_flags (
    review_id,
    verdict,
    fake_probability,
    flag_category,
    include_in_rating,
    reason,
    signals,
    detector,
    detector_version,
    input_hash
  )
  VALUES (
    v_review_id,
    v_verdict,
    NULL,
    v_flag_category,
    false,
    v_reason,
    '{}'::jsonb,
    'rate-community-guard',
    'v2',
    rate.review_input_hash(v_clean_author, p_rating_star::smallint, v_clean_comment)
  );

  RETURN jsonb_build_object(
    'id', v_review_id,
    'product_id', v_product_id,
    'author_name', v_clean_author,
    'rating_star', p_rating_star,
    'comment', v_clean_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_clean_type,
    'criteria_ratings', v_clean_criteria,
    'verdict', v_verdict,
    'flag_category', v_flag_category,
    'fake_probability', NULL,
    'include_in_rating', false,
    'helpfulness_weight', 0,
    'reason', v_reason,
    'created_at', v_created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION rate.submit_community_review_v2(
  p_master_product_id uuid,
  p_criteria_ratings jsonb,
  p_verdict text,
  p_pros jsonb,
  p_cons jsonb,
  p_criterion_points jsonb DEFAULT '{}'::jsonb,
  p_comment text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_variation text DEFAULT NULL,
  p_reviewer_type text DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service boolean;
  v_item_id uuid;
  v_category text;
  v_version integer;
  v_criterion record;
  v_value jsonb;
  v_star numeric;
  v_clean_criteria jsonb := '{}'::jsonb;
  v_weighted numeric := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_rating_exact numeric(2, 1);
  v_rating_star smallint;
  v_verdict text;
  v_verdict_len integer;
  v_pros text[];
  v_cons text[];
  v_key text;
  v_points jsonb;
  v_cr_pros text[];
  v_cr_cons text[];
  v_criterion_lines jsonb := '[]'::jsonb;
  v_comment text;
  v_comment_len integer;
  v_all_text text;
  v_clean_author text;
  v_clean_variation text;
  v_clean_type text;
  v_product_id uuid;
  v_recent integer;
  v_review_id uuid;
  v_created_at timestamptz;
  v_line_count integer := 0;
  v_i integer;
  v_flag_verdict text := 'unanalyzed';
  v_flag_category text := NULL;
  v_reason text := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
BEGIN
  v_is_service := COALESCE(v_claims ->> 'role', '') = 'service_role';

  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023', DETAIL = 'master_product_id';
  END IF;

  SELECT m.item_id, c.slug
  INTO v_item_id, v_category
  FROM rate.master_products m
  LEFT JOIN rate.categories c ON c.id = m.category_id
  WHERE m.id = p_master_product_id;

  IF NOT FOUND THEN
    SELECT i.id, c.slug
    INTO v_item_id, v_category
    FROM rate.items i
    LEFT JOIN rate.categories c ON c.id = i.category_id
    WHERE i.id = p_master_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy sản phẩm' USING ERRCODE = 'P0002', DETAIL = 'master_product_id';
    END IF;
  ELSIF v_category IS NULL AND v_item_id IS NOT NULL THEN
    SELECT c.slug
    INTO v_category
    FROM rate.items i
    JOIN rate.categories c ON c.id = i.category_id
    WHERE i.id = v_item_id;
  END IF;

  SELECT pg_catalog.max(criteria_version) INTO v_version
  FROM rate.rating_criteria WHERE category_slug = v_category;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  IF p_criteria_ratings IS NULL OR jsonb_typeof(p_criteria_ratings) <> 'object' THEN
    RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_criteria_ratings) LOOP
    IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                   WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
      RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này' USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
    END IF;
  END LOOP;
  FOR v_criterion IN
    SELECT key, weight, required FROM rate.rating_criteria
    WHERE criteria_version = v_version AND category_slug = v_category
    ORDER BY position
  LOOP
    v_value := p_criteria_ratings -> v_criterion.key;
    IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
      IF v_criterion.required THEN
        RAISE EXCEPTION 'Tiêu chí này là bắt buộc' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_value) <> 'number' THEN
      RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
    END IF;
    v_star := (v_value #>> '{}')::numeric;
    IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
      RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
    END IF;
    v_star := pg_catalog.round(v_star, 1);
    v_clean_criteria := v_clean_criteria || jsonb_build_object(v_criterion.key, v_star);
    v_weighted := v_weighted + v_star * v_criterion.weight;
    v_weights := v_weights + v_criterion.weight;
  END LOOP;
  IF v_skipped > 2 THEN
    RAISE EXCEPTION 'Chỉ được bỏ qua tối đa 2 tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  v_rating_exact := pg_catalog.round(v_weighted / v_weights, 1);
  v_rating_star := pg_catalog.round(v_rating_exact)::smallint;

  v_verdict := rate.review_text_stored(p_verdict);
  v_verdict_len := rate.review_text_length(v_verdict);
  IF v_verdict_len < 20 OR v_verdict_len > 300 THEN
    RAISE EXCEPTION 'Phần kết luận cần từ 20 đến 300 ký tự' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;
  IF NOT rate.review_point_has_content(v_verdict) THEN
    RAISE EXCEPTION 'Phần kết luận chưa có nội dung' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;

  v_pros := rate.review_point_list(p_pros, 'pro', 1, 5, 'pros');
  v_cons := rate.review_point_list(p_cons, 'con', 1, 5, 'cons');
  FOR v_i IN 1 .. pg_catalog.array_length(v_cons, 1) LOOP
    IF rate.review_point_compare(v_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_pros) x) THEN
      RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
        USING ERRCODE = '22023', DETAIL = 'cons.' || (v_i - 1);
    END IF;
  END LOOP;

  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ' USING ERRCODE = '22023', DETAIL = 'criterion_points';
  END IF;
  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) = 'object' THEN
    FOR v_key, v_points IN SELECT * FROM jsonb_each(p_criterion_points) LOOP
      IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                     WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
        RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || pg_catalog.left(v_key, 40);
      END IF;
      IF jsonb_typeof(v_points) <> 'object' THEN
        RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key;
      END IF;
      v_cr_pros := rate.review_point_list(v_points -> 'pros', 'pro', 0, 3, 'criterion_points.' || v_key || '.pros');
      v_cr_cons := rate.review_point_list(v_points -> 'cons', 'con', 0, 3, 'criterion_points.' || v_key || '.cons');
      FOR v_i IN 1 .. COALESCE(pg_catalog.array_length(v_cr_cons, 1), 0) LOOP
        IF rate.review_point_compare(v_cr_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_cr_pros) x) THEN
          RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key || '.cons.' || (v_i - 1);
        END IF;
      END LOOP;
      v_criterion_lines := v_criterion_lines || jsonb_build_object('key', v_key, 'pros', to_jsonb(v_cr_pros), 'cons', to_jsonb(v_cr_cons));
    END LOOP;
  END IF;

  v_comment := rate.review_text_stored(p_comment);
  v_comment_len := pg_catalog.char_length(v_comment);
  IF v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá tối đa 3000 ký tự' USING ERRCODE = '22023', DETAIL = 'comment';
  END IF;
  IF v_comment_len = 0 THEN
    v_comment := v_verdict;
  END IF;

  v_clean_author := pg_catalog.left(pg_catalog.btrim(COALESCE(p_author_name, '')), 80);
  IF pg_catalog.char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;
  v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_variation, '')), 120), '');
  v_clean_type := CASE WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert' ELSE 'user' END;

  SELECT p.id INTO v_product_id
  FROM rate.products p
  WHERE p.origin = 'crawl'
    AND (
      p.cluster_id = p_master_product_id
      OR (v_item_id IS NOT NULL AND p.item_id = v_item_id)
    )
  ORDER BY (p.cluster_id = p_master_product_id) DESC NULLS LAST,
           p.price_current ASC NULLS LAST,
           p.created_at ASC
  LIMIT 1;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
    );
    IF EXISTS (
      SELECT 1 FROM rate.review_authors a
      JOIN rate.reviews r ON r.id = a.review_id
      JOIN rate.products p ON p.id = r.product_id
      WHERE a.author_user_id = v_uid
        AND (
          p.cluster_id = p_master_product_id
          OR (v_item_id IS NOT NULL AND p.item_id = v_item_id)
        )
    ) THEN
      RAISE EXCEPTION 'Bạn đã gửi đánh giá cho sản phẩm này' USING ERRCODE = '23505';
    END IF;
    SELECT
      (SELECT pg_catalog.count(*)
       FROM rate.review_authors
       WHERE author_user_id = v_uid
         AND created_at > pg_catalog.now() - interval '24 hours')
      +
      (SELECT pg_catalog.count(*)
       FROM rate.review_deleted_submissions
       WHERE author_user_id = v_uid
         AND submitted_at > pg_catalog.now() - interval '24 hours')
    INTO v_recent;
    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

  v_all_text := pg_catalog.concat_ws(E'\n', v_comment, v_verdict,
    pg_catalog.array_to_string(v_pros, E'\n'), pg_catalog.array_to_string(v_cons, E'\n'),
    (SELECT pg_catalog.string_agg(line, E'\n') FROM jsonb_array_elements(v_criterion_lines) e,
       LATERAL (SELECT jsonb_array_elements_text(e -> 'pros') UNION ALL SELECT jsonb_array_elements_text(e -> 'cons')) AS t(line)));
  IF v_all_text ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
  ELSIF v_all_text ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'seeding_fake';
    v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
  ELSIF v_rating_star <= 2 AND v_all_text ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'competitor_sabotage';
    v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
  END IF;

  INSERT INTO rate.reviews (
    product_id, platform_review_id, author_name, rating_star, rating_exact, comment, verdict,
    variation, is_verified_buyer, reviewer_type, criteria_ratings, criteria_version,
    upvotes, downvotes, report_count, helpfulness_weight
  )
  VALUES (
    v_product_id, 'rate_comm_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), v_clean_author,
    v_rating_star, v_rating_exact, v_comment, v_verdict, v_clean_variation, NULL, v_clean_type,
    v_clean_criteria, v_version, 0, 0, 0, 0.00
  )
  RETURNING id, created_at INTO v_review_id, v_created_at;

  INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
  SELECT v_review_id, NULL, 'pro', line, ord - 1, 'writer' FROM unnest(v_pros) WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, NULL, 'con', line, ord - 1, 'writer' FROM unnest(v_cons) WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, e ->> 'key', 'pro', line, ord - 1, 'writer'
  FROM jsonb_array_elements(v_criterion_lines) e,
       jsonb_array_elements_text(e -> 'pros') WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, e ->> 'key', 'con', line, ord - 1, 'writer'
  FROM jsonb_array_elements(v_criterion_lines) e,
       jsonb_array_elements_text(e -> 'cons') WITH ORDINALITY AS t(line, ord);
  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  IF v_uid IS NOT NULL THEN
    INSERT INTO rate.review_authors (review_id, author_user_id) VALUES (v_review_id, v_uid);
  END IF;

  INSERT INTO rate.review_flags (
    review_id, verdict, fake_probability, flag_category, include_in_rating, reason, signals,
    detector, detector_version, input_hash
  )
  VALUES (
    v_review_id, v_flag_verdict, NULL, v_flag_category, false, v_reason, '{}'::jsonb,
    'rate-community-guard', 'v3',
    rate.review_input_hash(v_clean_author, v_rating_star, v_comment)
  );

  RETURN jsonb_build_object(
    'id', v_review_id,
    'product_id', v_product_id,
    'author_name', v_clean_author,
    'rating_star', v_rating_star,
    'rating_exact', v_rating_exact,
    'criteria_ratings', v_clean_criteria,
    'criteria_version', v_version,
    'verdict', v_verdict,
    'comment', v_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_clean_type,
    'points', v_line_count,
    'flag_verdict', v_flag_verdict,
    'flag_category', v_flag_category,
    'include_in_rating', false,
    'reason', v_reason,
    'created_at', v_created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION rate.store_review_values(p_values jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_index integer := 0;
  v_b jsonb;
  v_score numeric;
  v_sum numeric;
  v_c numeric;
  v_gaps text[];
  v_tier text;
  v_changed integer;
  v_upserted_ids uuid[] := '{}'::uuid[];
  v_affected_masters uuid[] := '{}'::uuid[];
  v_affected_items uuid[] := '{}'::uuid[];
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_values) > 1000 OR pg_catalog.octet_length(p_values::text) > 2097152 THEN
    RAISE EXCEPTION 'at most 1000 rows and 2 MB per call' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    v_b := v_row -> 'breakdown';
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row -> 'id') IS DISTINCT FROM 'string'
       OR (v_row ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b) IS DISTINCT FROM 'object'
       OR v_row - ARRAY['id', 'score', 'breakdown', 'edited_at'] <> '{}'::jsonb
       OR (v_row ? 'edited_at' AND jsonb_typeof(v_row -> 'edited_at') NOT IN ('string', 'null'))
       OR v_b - ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                      'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps'] <> '{}'::jsonb
       OR NOT v_b ?& ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                          'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps']
       OR v_b -> 'version' IS DISTINCT FROM '1'::jsonb
       OR jsonb_typeof(v_b -> 'gated') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_b -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'completeness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'weightCompleteness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'specificity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'verified') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'helpful') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'trust') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'tier') NOT IN ('string', 'null')
       OR jsonb_typeof(v_b -> 'gaps') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_b -> 'gaps') g
                  WHERE jsonb_typeof(g) IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
    END IF;
    IF v_row ? 'edited_at' THEN
      IF jsonb_typeof(v_row -> 'edited_at') NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_row -> 'edited_at') = 'string' THEN
        BEGIN
          PERFORM (v_row ->> 'edited_at')::timestamptz;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
        END;
      END IF;
    END IF;
    v_score := (v_row ->> 'score')::numeric;
    v_c := (v_b ->> 'completeness')::numeric;
    v_sum := v_c + (v_b ->> 'specificity')::numeric
           + (v_b ->> 'verified')::numeric + (v_b ->> 'helpful')::numeric
           + (v_b ->> 'trust')::numeric;
    v_gaps := ARRAY(SELECT jsonb_array_elements_text(v_b -> 'gaps'));
    v_tier := v_b ->> 'tier';
    IF v_c NOT IN (0, 5, 10, 15, 20, 25, 30, 35)
       OR v_c - (v_b ->> 'weightCompleteness')::numeric NOT IN (0, 5)
       OR (v_c - (v_b ->> 'weightCompleteness')::numeric = 5)
          IS DISTINCT FROM ('pros_cons' = ANY (v_gaps) AND NOT 'photo' = ANY (v_gaps) AND v_c > 0)
       OR (v_b ->> 'specificity')::numeric NOT IN (0, 5, 12, 17, 20)
       OR (v_b ->> 'verified')::numeric NOT IN (0, 15)
       OR (v_b ->> 'helpful')::numeric NOT BETWEEN 0 AND 20
       OR (v_b ->> 'trust')::numeric NOT BETWEEN 0 AND 10
       OR v_score NOT BETWEEN 0 AND 100
       OR (v_b ->> 'score')::numeric <> v_score
       OR pg_catalog.abs(v_sum - v_score) > 0.01
       OR pg_catalog.cardinality(v_gaps) <> (SELECT pg_catalog.count(DISTINCT g) FROM unnest(v_gaps) g)
       OR NOT v_gaps <@ ARRAY['detail', 'criteria', 'verdict', 'pros_cons', 'criterion_points',
                               'photo', 'verified']
       OR (CASE WHEN (v_b ->> 'gated')::boolean
               THEN v_sum <> 0 OR v_score <> 0 OR v_tier IS NOT NULL OR pg_catalog.cardinality(v_gaps) <> 0
               ELSE v_tier IS DISTINCT FROM CASE WHEN v_c < 30 THEN 'basic'
                                                 WHEN v_score >= 70 THEN 'excellent'
                                                 ELSE 'complete' END
           END) THEN
      RAISE EXCEPTION 'row % has values out of range', v_index USING ERRCODE = '22023';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  PERFORM 1 FROM rate.reviews r
  WHERE r.id IN (SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(p_values) e)
  ORDER BY r.id
  FOR NO KEY UPDATE;

  WITH upserted AS (
    INSERT INTO rate.review_values AS rv (review_id, value_score, value_breakdown, updated_at)
    SELECT b.review_id, b.value_score, b.value_breakdown, pg_catalog.now()
    FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
                 (e ->> 'id')::uuid AS review_id,
                 pg_catalog.round((e ->> 'score')::numeric, 2) AS value_score,
                 e -> 'breakdown' AS value_breakdown,
                 CASE WHEN e ? 'edited_at' AND jsonb_typeof(e -> 'edited_at') = 'string'
                      THEN (e ->> 'edited_at')::timestamptz
                      ELSE NULL::timestamptz END AS expected_edited_at
          FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
          ORDER BY (e ->> 'id')::uuid, n DESC) b
    JOIN rate.reviews r ON r.id = b.review_id
    WHERE r.edited_at IS NOT DISTINCT FROM b.expected_edited_at
    ORDER BY b.review_id
    ON CONFLICT (review_id) DO UPDATE
      SET value_score = EXCLUDED.value_score,
          value_breakdown = EXCLUDED.value_breakdown,
          updated_at = EXCLUDED.updated_at
      WHERE (rv.value_score, rv.value_breakdown)
            IS DISTINCT FROM (EXCLUDED.value_score, EXCLUDED.value_breakdown)
    RETURNING review_id
  )
  SELECT COALESCE(pg_catalog.array_agg(u.review_id), '{}'::uuid[])
  INTO v_upserted_ids
  FROM upserted u;

  v_changed := COALESCE(pg_catalog.cardinality(v_upserted_ids), 0);

  UPDATE rate.reviews r
  SET value_tier = b.value_breakdown ->> 'tier'
  FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
               (e ->> 'id')::uuid AS review_id,
               e -> 'breakdown' AS value_breakdown,
               CASE WHEN e ? 'edited_at' AND jsonb_typeof(e -> 'edited_at') = 'string'
                    THEN (e ->> 'edited_at')::timestamptz
                    ELSE NULL::timestamptz END AS expected_edited_at
        FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
        ORDER BY (e ->> 'id')::uuid, n DESC) b
  WHERE r.id = b.review_id
    AND r.edited_at IS NOT DISTINCT FROM b.expected_edited_at
    AND r.value_tier IS DISTINCT FROM (b.value_breakdown ->> 'tier');

  IF v_changed > 0
     AND pg_catalog.to_regprocedure('rate.refresh_rating_extras_of_products(uuid[])') IS NOT NULL THEN
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(p.item_id, m.item_id)), '{}'::uuid[])
    INTO v_affected_items
    FROM rate.reviews r
    JOIN rate.products p ON p.id = r.product_id
    LEFT JOIN rate.master_products m ON m.id = p.cluster_id
    WHERE r.id = ANY (v_upserted_ids)
      AND COALESCE(p.item_id, m.item_id) IS NOT NULL;

    -- Collect both direct listing masters and sibling variants of affected Items so locking
    -- in deterministic id order covers all masters that could race with refresh_item_rating.
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT mid), '{}'::uuid[])
    INTO v_affected_masters
    FROM (
      SELECT p.cluster_id AS mid
      FROM rate.reviews r
      JOIN rate.products p ON p.id = r.product_id
      WHERE r.id = ANY (v_upserted_ids)
        AND p.cluster_id IS NOT NULL
      UNION
      SELECT mp.id AS mid
      FROM rate.master_products mp
      WHERE mp.item_id = ANY (v_affected_items)
    ) affected;

    IF pg_catalog.cardinality(v_affected_masters) > 0 THEN
      PERFORM 1
      FROM rate.master_products m
      WHERE m.id = ANY (v_affected_masters)
      ORDER BY m.id
      FOR UPDATE;
    END IF;

    IF pg_catalog.cardinality(v_affected_items) > 0 THEN
      PERFORM 1
      FROM rate.items i
      WHERE i.id = ANY (v_affected_items)
      ORDER BY i.id
      FOR UPDATE;
    END IF;

    IF pg_catalog.cardinality(v_affected_masters) > 0
       OR pg_catalog.cardinality(v_affected_items) > 0 THEN
      PERFORM rate.refresh_rating_extras_of_products(
        ARRAY(
          SELECT DISTINCT r.product_id
          FROM rate.reviews r
          WHERE r.id = ANY (v_upserted_ids)
        )
      );

      -- Mirror user_rating_weighted and authentic_review_count from locked rate.items onto
      -- locked sibling variants in case a concurrent refresh_item_rating skipped locked masters.
      IF pg_catalog.cardinality(v_affected_items) > 0 THEN
        UPDATE rate.master_products m
        SET user_rating_weighted = i.user_rating_weighted,
            authentic_review_count = i.authentic_review_count,
            updated_at = pg_catalog.now()
        FROM rate.items i
        WHERE m.item_id = i.id
          AND i.id = ANY (v_affected_items)
          AND (COALESCE(m.user_rating_weighted, 0), COALESCE(m.authentic_review_count, 0))
              IS DISTINCT FROM (COALESCE(i.user_rating_weighted, 0), i.authentic_review_count);
      END IF;
    END IF;
  END IF;

  RETURN v_changed;
END $$;

-- M2.2 Item fuzzy match -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rate.match_item(
  search_title text,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_threshold real DEFAULT 0.4
)
RETURNS TABLE(item_id uuid, item_key text, name text, similarity real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trgm text;
  v_sim_limit real;
  v_eff_threshold real := COALESCE(p_threshold, 0.4);
  v_use_trgm_op boolean;
BEGIN
  SELECT n.nspname INTO v_trgm
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm IS NULL THEN
    RAISE EXCEPTION 'rate.match_item: pg_trgm extension is not installed';
  END IF;

  -- Trigger pg_trgm shared library load so current_setting reads the active threshold safely.
  EXECUTE pg_catalog.format('SELECT %I.similarity('''', '''')', v_trgm);
  v_sim_limit := COALESCE(
    NULLIF(pg_catalog.current_setting('pg_trgm.similarity_threshold', true), '')::real,
    0.3
  );
  v_use_trgm_op := v_eff_threshold >= v_sim_limit;

  RETURN QUERY EXECUTE pg_catalog.format(
    'SELECT i.id, i.item_key, i.name, %I.similarity(i.name, $1) AS similarity
       FROM rate.items i
      WHERE i.status <> ''archived''
        AND ($2 IS NULL OR pg_catalog.lower(i.brand) = pg_catalog.lower($2))
        %s
        AND %I.similarity(i.name, $1) >= $3
      ORDER BY 4 DESC, i.id
      LIMIT 5',
    v_trgm,
    CASE WHEN v_use_trgm_op
         THEN pg_catalog.format('AND i.name OPERATOR(%I.%%) $1', v_trgm)
         ELSE '' END,
    v_trgm
  ) USING search_title, p_brand, v_eff_threshold;
END $$;

-- M2.3 Retire an Item's unknown variant (guarded against all 20 sizeless categories) ----------

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
  v_override text := COALESCE(pg_catalog.current_setting('rate.variant_override', true), '');
BEGIN
  IF p_item_id IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rate.items i
    LEFT JOIN rate.categories c ON c.id = i.category_id
    WHERE i.id = p_item_id
      AND (
        rate.is_sizeless_category_slug(COALESCE(c.slug, i.specifications ->> 'category_slug'))
        OR i.entity_type IN ('service', 'place')
      )
  ) THEN
    RETURN 0;
  END IF;

  SELECT mp.id INTO v_unknown
  FROM rate.master_products mp
  WHERE mp.item_id = p_item_id AND mp.variant_key = 'unknown' AND mp.status IS DISTINCT FROM 'archived';
  IF v_unknown IS NULL THEN
    SELECT mp.id INTO v_unknown
    FROM rate.master_products mp
    WHERE mp.item_id = p_item_id AND mp.variant_key = 'unknown' AND mp.status = 'archived'
      AND mp.metadata ->> 'retired_by' = 'retire_item_unknown_variant';
    IF v_unknown IS NULL THEN
      RETURN 0;
    END IF;
    PERFORM pg_catalog.set_config('rate.variant_override', 'on', true);
    UPDATE rate.products p
    SET cluster_id = NULL,
        variant_source = NULL,
        metadata = COALESCE(p.metadata, '{}'::jsonb)
          || jsonb_build_object('retired_unknown_variant', v_unknown,
                                'variant_source_before_retire', p.variant_source)
    WHERE p.cluster_id = v_unknown;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    PERFORM pg_catalog.set_config('rate.variant_override', v_override, true);
    IF v_moved > 0 THEN
      PERFORM rate.refresh_master_market_stats(v_unknown);
      PERFORM rate.refresh_item_stats(p_item_id);
    END IF;
    RETURN v_moved;
  END IF;

  PERFORM 1 FROM rate.products p WHERE p.cluster_id = v_unknown ORDER BY p.id FOR UPDATE;
  SELECT mp.status INTO v_status FROM rate.master_products mp WHERE mp.id = v_unknown FOR UPDATE;

  IF NOT FOUND OR v_status IS NOT DISTINCT FROM 'archived' OR NOT EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.item_id = p_item_id AND mp.status IS DISTINCT FROM 'archived'
         AND mp.variant_key ~ '^[0-9]+(gb|tb)$') THEN
    RETURN 0;
  END IF;

  PERFORM pg_catalog.set_config('rate.variant_override', 'on', true);
  UPDATE rate.products p
  SET cluster_id = NULL,
      variant_source = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb)
        || jsonb_build_object('retired_unknown_variant', v_unknown,
                              'variant_source_before_retire', p.variant_source)
  WHERE p.cluster_id = v_unknown;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  PERFORM pg_catalog.set_config('rate.variant_override', v_override, true);

  UPDATE rate.master_products mp
  SET status = 'archived',
      metadata = COALESCE(mp.metadata, '{}'::jsonb)
        || jsonb_build_object('status_before_retire', v_status, 'retired_by', 'retire_item_unknown_variant')
  WHERE mp.id = v_unknown;

  PERFORM pg_catalog.set_config('rate.variant_override', 'on', true);
  UPDATE rate.products p
  SET cluster_id = NULL,
      variant_source = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb)
        || jsonb_build_object('retired_unknown_variant', v_unknown,
                              'variant_source_before_retire', p.variant_source)
  WHERE p.cluster_id = v_unknown;
  GET DIAGNOSTICS v_swept = ROW_COUNT;
  PERFORM pg_catalog.set_config('rate.variant_override', v_override, true);

  v_moved := v_moved + v_swept;
  PERFORM rate.refresh_master_market_stats(v_unknown);
  PERFORM rate.refresh_item_stats(p_item_id);
  RETURN v_moved;
END $$;

-- M2.4 Explicit least-privilege function grants (including authenticator revoke) ------------

REVOKE ALL ON FUNCTION rate.is_sizeless_category_slug(text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.item_slug_from_master(text, text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.item_name_from_master(text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.master_products_sync_item()
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.master_products_move_listings()
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.products_sync_item()
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.products_refresh_left()
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.products_recheck_retired_variant()
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.item_criteria_summary(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_item_criteria_summary(uuid, boolean)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_item_rating(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_item_stats(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_master_product_rating(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_review_vote_counts(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_master_rating_extras(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_rating_extras_of_products(uuid[])
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.refresh_master_market_stats(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.match_item(text, text, text, real)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.retire_item_unknown_variant(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.edit_community_review(uuid, jsonb, text, jsonb, jsonb, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.delete_community_review(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.submit_community_review(uuid, text, integer, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.store_review_values(jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;

GRANT EXECUTE ON FUNCTION rate.is_sizeless_category_slug(text) TO service_role;
GRANT EXECUTE ON FUNCTION rate.item_slug_from_master(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION rate.item_name_from_master(text) TO service_role;
GRANT EXECUTE ON FUNCTION rate.item_criteria_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_item_criteria_summary(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_item_rating(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_item_stats(uuid) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(uuid) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.refresh_review_vote_counts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_master_rating_extras(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_rating_extras_of_products(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_master_market_stats(uuid) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.match_item(text, text, text, real) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.retire_item_unknown_variant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.edit_community_review(uuid, jsonb, text, jsonb, jsonb, text, text, integer, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.delete_community_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rate.submit_community_review(uuid, text, integer, text, text, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.store_review_values(jsonb) TO service_role, rate_worker;

-- Verify zero privileges remain for authenticator on rate.items or the Item Model functions.
DO $$
DECLARE
  v_auth_oid oid := pg_catalog.to_regrole('authenticator');
  v_items_oid regclass := pg_catalog.to_regclass('rate.items');
  v_proc text;
  v_proc_oid regprocedure;
BEGIN
  IF v_auth_oid IS NULL THEN
    RETURN;
  END IF;

  IF v_items_oid IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
      WHERE c.oid = v_items_oid AND a.grantee = v_auth_oid
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute attr
      CROSS JOIN LATERAL pg_catalog.aclexplode(attr.attacl) a
      WHERE attr.attrelid = v_items_oid AND NOT attr.attisdropped AND attr.attacl IS NOT NULL AND a.grantee = v_auth_oid
    )
  ) THEN
    RAISE EXCEPTION 'authenticator privileges remain on table rate.items (current_user=%)', current_user;
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'rate.is_sizeless_category_slug(text)',
    'rate.item_slug_from_master(text, text)',
    'rate.item_name_from_master(text)',
    'rate.master_products_sync_item()',
    'rate.master_products_move_listings()',
    'rate.products_sync_item()',
    'rate.products_refresh_left()',
    'rate.products_recheck_retired_variant()',
    'rate.item_criteria_summary(uuid)',
    'rate.refresh_item_criteria_summary(uuid, boolean)',
    'rate.refresh_item_rating(uuid)',
    'rate.refresh_item_stats(uuid)',
    'rate.refresh_master_product_rating(uuid)',
    'rate.refresh_review_vote_counts(uuid)',
    'rate.refresh_master_rating_extras(uuid)',
    'rate.refresh_rating_extras_of_products(uuid[])',
    'rate.refresh_master_market_stats(uuid)',
    'rate.match_item(text, text, text, real)',
    'rate.retire_item_unknown_variant(uuid)',
    'rate.edit_community_review(uuid, jsonb, text, jsonb, jsonb, text, text, integer, jsonb)',
    'rate.delete_community_review(uuid)',
    'rate.submit_community_review(uuid, text, integer, text, text, text, jsonb)',
    'rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)',
    'rate.store_review_values(jsonb)'
  ] LOOP
    v_proc_oid := pg_catalog.to_regprocedure(v_proc);
    IF v_proc_oid IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = v_proc_oid AND a.grantee = v_auth_oid
    ) THEN
      RAISE EXCEPTION 'authenticator EXECUTE privilege remains on function % (current_user=%)', v_proc, current_user;
    END IF;
  END LOOP;
END $$;

-- M1.6 Compatibility triggers (created after the functions they call) ------------------------

DROP TRIGGER IF EXISTS trg_master_products_sync_item ON rate.master_products;
CREATE TRIGGER trg_master_products_sync_item
  BEFORE INSERT OR UPDATE OF model_key, status, item_id, entity_type, category_id ON rate.master_products
  FOR EACH ROW EXECUTE FUNCTION rate.master_products_sync_item();

DROP TRIGGER IF EXISTS trg_master_products_move_listings ON rate.master_products;
CREATE TRIGGER trg_master_products_move_listings
  AFTER UPDATE OF model_key, item_id, status ON rate.master_products
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

-- M2.5 Idempotent backfill -------------------------------------------------------------------

DO $$
DECLARE
  v_clash text;
BEGIN
  SELECT pg_catalog.string_agg(slug, ', ') INTO v_clash FROM (
    SELECT rate.item_slug_from_master(mp.slug, mp.model_key) AS slug
    FROM rate.master_products mp
    WHERE mp.item_id IS NULL
    GROUP BY 1
    HAVING pg_catalog.count(
      DISTINCT pg_catalog.split_part(mp.model_key, ':', 1) || ':' || pg_catalog.split_part(mp.model_key, ':', 2)
    ) > 1
  ) c;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'M2 backfill: Item slug collisions, resolve them first: %', v_clash;
  END IF;

  SELECT pg_catalog.string_agg(DISTINCT i.slug, ', ') INTO v_clash
  FROM rate.master_products mp
  JOIN rate.items i ON i.slug = rate.item_slug_from_master(mp.slug, mp.model_key)
  WHERE mp.item_id IS NULL
    AND i.item_key <> pg_catalog.split_part(mp.model_key, ':', 1) || ':' || pg_catalog.split_part(mp.model_key, ':', 2);
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'M2 backfill: Item slugs already taken by other Items: %', v_clash;
  END IF;
END $$;

UPDATE rate.master_products mp
SET variant_key = NULLIF(pg_catalog.split_part(mp.model_key, ':', 3), '')
WHERE mp.variant_key IS DISTINCT FROM NULLIF(pg_catalog.split_part(mp.model_key, ':', 3), '');

INSERT INTO rate.items (
  item_key, slug, name, brand, model, category_id, status, entity_type,
  description, specifications, key_specs, spec_provenance, images, thumbnail,
  expert_rating, expert_review_summary, expert_criteria_scores, metadata
)
SELECT DISTINCT ON (k.item_key)
       k.item_key,
       rate.item_slug_from_master(mp.slug, mp.model_key),
       CASE
         WHEN rate.is_sizeless_category_slug(c.slug)
              OR COALESCE(mp.entity_type, 'product') IN ('service', 'place')
           THEN mp.name
         ELSE rate.item_name_from_master(mp.name)
       END,
       mp.brand, mp.model, mp.category_id,
       CASE WHEN bool_or(mp.status = 'published') OVER w THEN 'published'
            WHEN bool_or(COALESCE(mp.status, 'draft') <> 'archived') OVER w THEN 'draft'
            ELSE 'archived' END,
       COALESCE(mp.entity_type, 'product'),
       mp.description,
       COALESCE(mp.specifications, '{}'::jsonb) #- '{hardware,storage_gb}' #- '{hardware,ram_gb}',
       COALESCE(mp.key_specs, '{}'::jsonb) - 'storage' - 'ram',
       COALESCE(mp.spec_provenance, '{}'::jsonb),
       COALESCE(mp.images, '{}'),
       mp.thumbnail,
       mp.expert_rating,
       mp.expert_review_summary,
       COALESCE(mp.expert_criteria_scores, '{}'::jsonb),
       COALESCE(mp.metadata, '{}'::jsonb) || jsonb_build_object('backfilled_from_master', mp.id)
FROM rate.master_products mp
LEFT JOIN rate.categories c ON c.id = mp.category_id
CROSS JOIN LATERAL (
  SELECT pg_catalog.split_part(mp.model_key, ':', 1) || ':' || pg_catalog.split_part(mp.model_key, ':', 2) AS item_key
) k
WINDOW w AS (PARTITION BY k.item_key)
ORDER BY k.item_key, (mp.status = 'published') DESC NULLS LAST,
         mp.merchant_count DESC NULLS LAST, mp.created_at ASC NULLS LAST, mp.id
ON CONFLICT (item_key) DO NOTHING;

UPDATE rate.master_products mp SET item_id = i.id
FROM rate.items i
WHERE mp.item_id IS DISTINCT FROM i.id
  AND i.item_key = pg_catalog.split_part(mp.model_key, ':', 1) || ':' || pg_catalog.split_part(mp.model_key, ':', 2);

UPDATE rate.products p
SET item_id = mp.item_id,
    variant_source = COALESCE(p.variant_source, 'legacy')
FROM rate.master_products mp
WHERE p.cluster_id = mp.id
  AND (p.item_id IS DISTINCT FROM mp.item_id OR p.variant_source IS NULL);

UPDATE rate.items i SET status = s.status
FROM (
  SELECT item_id,
         CASE WHEN bool_or(status = 'published') THEN 'published'
              WHEN bool_or(COALESCE(status, 'draft') <> 'archived') THEN 'draft'
              ELSE 'archived' END AS status
  FROM rate.master_products WHERE item_id IS NOT NULL GROUP BY item_id
) s
WHERE i.id = s.item_id AND i.status IS DISTINCT FROM s.status;

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT i.id FROM rate.items i ORDER BY i.id LOOP
    PERFORM rate.refresh_item_stats(v_id);
  END LOOP;
END $$;

COMMIT;

-- Validate newly added NOT VALID constraints outside the main transaction under lock_timeout.
DO $validate_item_model_constraints$
BEGIN
  SET LOCAL lock_timeout = '5s';

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.items'::pg_catalog.regclass
      AND c.conname = 'items_entity_type_check'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.items VALIDATE CONSTRAINT items_entity_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.items'::pg_catalog.regclass
      AND c.conname = 'items_rating_score_range'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.items VALIDATE CONSTRAINT items_rating_score_range;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.items'::pg_catalog.regclass
      AND c.conname = 'items_rating_weight_sum_nonneg'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.items VALIDATE CONSTRAINT items_rating_weight_sum_nonneg;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.products'::pg_catalog.regclass
      AND c.conname = 'products_variant_source_check'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.products VALIDATE CONSTRAINT products_variant_source_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.master_products'::pg_catalog.regclass
      AND c.conname = 'fk_master_products_item'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.master_products VALIDATE CONSTRAINT fk_master_products_item;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.products'::pg_catalog.regclass
      AND c.conname = 'fk_products_item'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.products VALIDATE CONSTRAINT fk_products_item;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.items'::pg_catalog.regclass
      AND c.conname = 'fk_items_default_variant'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE rate.items VALIDATE CONSTRAINT fk_items_default_variant;
  END IF;
END
$validate_item_model_constraints$;
