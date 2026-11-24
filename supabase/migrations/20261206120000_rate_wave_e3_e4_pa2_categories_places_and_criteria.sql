-- =============================================================================
-- Migration: 20261206120000_rate_wave_e3_e4_pa2_categories_places_and_criteria.sql
-- Purpose (DOS/DOS.Me#1961): Wave E3 (supplements, cosmetics, mother-baby) and
-- Wave E4 PA2 (places: restaurants, cafes, hotels, homestays) categories,
-- rate.master_products entity_type widening, 1-1 rate.place_details table with
-- bidirectional entity_type = 'place' integrity triggers, RLS + least-privilege
-- grants, and rating criteria v3.
-- Verify: scripts/ops/rate-wave-e3-e4-pa2-verify.sql (V1 to V6 return 0).
-- Rollback: scripts/ops/rate-wave-e3-e4-pa2-rollback.sql.
-- =============================================================================
--
-- What it adds:
--   1. 7 Wave E3/E4 categories in rate.categories (display_order 13..19):
--      supplements, cosmetics, mother-baby, restaurants, cafes, hotels, homestays.
--   2. Widen rate.master_products.entity_type CHECK constraint to allow 'place'
--      via named constraint master_products_entity_type_check.
--   3. 1-1 table rate.place_details (PK = master_id -> rate.master_products(id)
--      ON DELETE CASCADE) for place metadata, geo, price tier, and source IDs.
--   4. Bidirectional triggers enforcing master_products.entity_type = 'place'
--      for rate.place_details rows, plus updated_at trigger.
--   5. 4 query/filter indexes on rate.place_details.
--   6. RLS enabled and least-privilege grants (SELECT for anon/authenticated,
--      SELECT/INSERT/UPDATE for rate_worker, ALL for service_role).
--   7. 35 criteria rows in rate.rating_criteria with criteria_version = 3 across
--      the 7 Wave E3/E4 slugs (leaving criteria_version = 1 and 2 untouched).
--
-- Idempotent: ON CONFLICT (...) DO NOTHING, dynamic pg_constraint guard,
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, DROP TRIGGER/POLICY IF EXISTS. One transaction.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Wave E3 and Wave E4 PA2 categories ---------------------------------------

INSERT INTO rate.categories (name, slug, icon, display_order)
VALUES
  ('Thực phẩm chức năng', 'supplements', 'pill', 13),
  ('Mỹ phẩm', 'cosmetics', 'sparkles', 14),
  ('Mẹ & Bé', 'mother-baby', 'baby', 15),
  ('Quán ăn & Nhà hàng', 'restaurants', 'utensils', 16),
  ('Cà phê & Trà sữa', 'cafes', 'coffee', 17),
  ('Khách sạn', 'hotels', 'hotel', 18),
  ('Homestay & Lưu trú', 'homestays', 'home', 19)
ON CONFLICT (slug) DO NOTHING;

-- 2. Widen rate.master_products.entity_type to allow 'place' ------------------

DO $$
DECLARE
  v_con RECORD;
  v_has_target BOOLEAN := false;
BEGIN
  FOR v_con IN
    SELECT DISTINCT c.conname, pg_catalog.pg_get_constraintdef(c.oid) AS condef
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'rate.master_products'::regclass
      AND c.contype = 'c'
      AND a.attname = 'entity_type'
      AND NOT a.attisdropped
  LOOP
    IF v_con.conname = 'master_products_entity_type_check'
       AND v_con.condef = 'CHECK ((entity_type = ANY (ARRAY[''product''::text, ''service''::text, ''place''::text])))' THEN
      v_has_target := true;
    ELSE
      EXECUTE format('ALTER TABLE rate.master_products DROP CONSTRAINT %I', v_con.conname);
    END IF;
  END LOOP;

  IF NOT v_has_target THEN
    ALTER TABLE rate.master_products
      ADD CONSTRAINT master_products_entity_type_check
      CHECK (entity_type IN ('product', 'service', 'place'));
  END IF;
END $$;

-- 3. 1-1 rate.place_details ---------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.place_details (
  master_id UUID PRIMARY KEY REFERENCES rate.master_products(id) ON DELETE CASCADE,
  place_key TEXT NOT NULL CONSTRAINT uq_rate_place_details_place_key UNIQUE
    CHECK (place_key ~ '^[a-z0-9_-]{1,128}:[a-z0-9_-]{1,80}:[a-z0-9_-]{1,128}$'),
  branch_group_key TEXT NOT NULL
    CHECK (branch_group_key ~ '^[a-z0-9_-]{1,128}$'),
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,
  geohash7 TEXT
    CHECK (geohash7 IS NULL OR geohash7 ~ '^[0-9bcdefghjkmnpqrstuvwxyz]{7}$'),
  address TEXT,
  province_code TEXT NOT NULL
    CHECK (province_code ~ '^[a-z0-9_-]{1,64}$'),
  district_code TEXT
    CHECK (district_code IS NULL OR district_code ~ '^[a-z0-9_-]{1,64}$'),
  price_min BIGINT
    CHECK (price_min IS NULL OR price_min > 0),
  price_max BIGINT
    CHECK (price_max IS NULL OR price_max > 0),
  price_tier TEXT
    CHECK (price_tier IS NULL OR price_tier IN ('$', '$$', '$$$', '$$$$')),
  price_unit TEXT
    CHECK (price_unit IS NULL OR price_unit IN ('vnd_per_person', 'vnd_per_night_ref')),
  opening_hours TEXT,
  phone TEXT,
  website TEXT,
  cuisine TEXT,
  star_rating NUMERIC(2, 1)
    CHECK (star_rating IS NULL OR (star_rating >= 1.0 AND star_rating <= 5.0)),
  source_ids JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_ids) = 'object'),
  overture_confidence NUMERIC(4, 3)
    CHECK (overture_confidence IS NULL OR (overture_confidence >= 0 AND overture_confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT place_details_geo_pair_check CHECK (
    (geo_lat IS NULL AND geo_lng IS NULL)
    OR (
      geo_lat IS NOT NULL
      AND geo_lng IS NOT NULL
      AND geo_lat BETWEEN -90 AND 90
      AND geo_lng BETWEEN -180 AND 180
    )
  ),
  CONSTRAINT place_details_price_range_check CHECK (
    price_min IS NULL OR price_max IS NULL OR price_max >= price_min
  )
);

-- 4. Bidirectional entity_type = 'place' integrity triggers + updated_at ------

CREATE OR REPLACE FUNCTION rate.require_place_entity_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM rate.master_products
  WHERE id = NEW.master_id
    AND entity_type = 'place'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rate.place_details requires master_products.entity_type = ''place'' (master_id=%)', NEW.master_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION rate.require_place_entity_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rate_place_details_require_place_entity ON rate.place_details;
CREATE TRIGGER trg_rate_place_details_require_place_entity
  BEFORE INSERT OR UPDATE OF master_id ON rate.place_details
  FOR EACH ROW
  EXECUTE FUNCTION rate.require_place_entity_type();

CREATE OR REPLACE FUNCTION rate.guard_master_product_place_entity_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entity_type IS DISTINCT FROM 'place'
     AND EXISTS (SELECT 1 FROM rate.place_details WHERE master_id = NEW.id) THEN
    RAISE EXCEPTION 'cannot change master_products.entity_type from ''place'' while rate.place_details row exists (master_id=%)', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION rate.guard_master_product_place_entity_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rate_master_products_guard_place_entity_type ON rate.master_products;
CREATE TRIGGER trg_rate_master_products_guard_place_entity_type
  AFTER UPDATE OF entity_type ON rate.master_products
  FOR EACH ROW
  EXECUTE FUNCTION rate.guard_master_product_place_entity_type();

DROP TRIGGER IF EXISTS trg_rate_place_details_set_updated_at ON rate.place_details;
CREATE TRIGGER trg_rate_place_details_set_updated_at
  BEFORE UPDATE ON rate.place_details
  FOR EACH ROW
  EXECUTE FUNCTION rate.set_updated_at_timestamp();

-- 5. Indexes on rate.place_details --------------------------------------------

CREATE INDEX IF NOT EXISTS idx_rate_place_details_branch_group_key
  ON rate.place_details (branch_group_key);

CREATE INDEX IF NOT EXISTS idx_rate_place_details_province_district
  ON rate.place_details (province_code, district_code);

CREATE INDEX IF NOT EXISTS idx_rate_place_details_geohash7
  ON rate.place_details (geohash7)
  WHERE geohash7 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rate_place_details_price_tier
  ON rate.place_details (price_tier)
  WHERE price_tier IS NOT NULL;

-- 6. RLS & least-privilege grants on rate.place_details -----------------------

ALTER TABLE rate.place_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE rate.place_details FROM PUBLIC, anon, authenticated, rate_worker;
GRANT SELECT ON TABLE rate.place_details TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE rate.place_details TO rate_worker;
GRANT ALL ON TABLE rate.place_details TO service_role;

DROP POLICY IF EXISTS "Public can view place_details" ON rate.place_details;
CREATE POLICY "Public can view place_details" ON rate.place_details
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role write place_details" ON rate.place_details;
CREATE POLICY "Service role write place_details" ON rate.place_details
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Rate worker access place_details" ON rate.place_details;
CREATE POLICY "Rate worker access place_details" ON rate.place_details
  FOR ALL TO rate_worker USING (true) WITH CHECK (true);

-- 7. Wave E3 and Wave E4 PA2 rating criteria (criteria_version = 3) -----------

INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, required, position)
VALUES
  (3, 'supplements', 'effectiveness', 30, false, 0),
  (3, 'supplements', 'ingredients', 25, false, 1),
  (3, 'supplements', 'tolerance', 15, false, 2),
  (3, 'supplements', 'packaging', 10, false, 3),
  (3, 'supplements', 'value', 20, true, 4),
  (3, 'cosmetics', 'effectiveness', 30, false, 0),
  (3, 'cosmetics', 'skin_feel', 25, false, 1),
  (3, 'cosmetics', 'ingredients', 20, false, 2),
  (3, 'cosmetics', 'packaging', 10, false, 3),
  (3, 'cosmetics', 'value', 15, true, 4),
  (3, 'mother-baby', 'safety', 35, false, 0),
  (3, 'mother-baby', 'quality', 25, false, 1),
  (3, 'mother-baby', 'ease_of_use', 15, false, 2),
  (3, 'mother-baby', 'packaging', 10, false, 3),
  (3, 'mother-baby', 'value', 15, true, 4),
  (3, 'restaurants', 'food_quality', 35, false, 0),
  (3, 'restaurants', 'price', 20, true, 1),
  (3, 'restaurants', 'service_attitude', 20, false, 2),
  (3, 'restaurants', 'hygiene', 15, false, 3),
  (3, 'restaurants', 'ambiance', 10, false, 4),
  (3, 'cafes', 'food_quality', 35, false, 0),
  (3, 'cafes', 'price', 20, true, 1),
  (3, 'cafes', 'service_attitude', 20, false, 2),
  (3, 'cafes', 'hygiene', 15, false, 3),
  (3, 'cafes', 'ambiance', 10, false, 4),
  (3, 'hotels', 'room_quality', 30, false, 0),
  (3, 'hotels', 'cleanliness', 25, false, 1),
  (3, 'hotels', 'location', 20, false, 2),
  (3, 'hotels', 'service', 15, false, 3),
  (3, 'hotels', 'value', 10, true, 4),
  (3, 'homestays', 'room_quality', 30, false, 0),
  (3, 'homestays', 'cleanliness', 25, false, 1),
  (3, 'homestays', 'location', 20, false, 2),
  (3, 'homestays', 'service', 15, false, 3),
  (3, 'homestays', 'value', 10, true, 4)
ON CONFLICT (criteria_version, category_slug, key) DO NOTHING;

COMMIT;
