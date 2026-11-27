-- =============================================================================
-- Migration: 20261207120000_rate_wave_e1_e2_categories_and_criteria_late_apply.sql
-- Purpose (DOS/DOS.Me#1935, DOS/Rate-Services#1324 PR #1326): monotonic
-- late-apply copy of 20261205100000_rate_wave_e1_e2_categories_and_criteria.sql
-- (landed on dev in DOS/DOS.Me#1937, commit 062ca5606).
-- Verify: scripts/ops/rate-wave-e1-e2-verify.sql (V1 to V4 return 0).
-- Rollback: scripts/ops/rate-wave-e1-e2-rollback.sql.
-- =============================================================================
--
-- Why late-apply:
--   origin/main already carried 20261206100000_auth_passkeys.sql (PR #1963)
--   before DOS/DOS.Me#1935 was selectively promoted, and origin/dev carried
--   migrations through 20261207110000, so supabase db push on Production
--   silently skips out-of-order files older than 20261206100000.
--   This monotonic idempotent copy (> 20261206100000 on main and > 20261207110000
--   on dev) guarantees Production applies Wave E1/E2 (tvs, air-conditioners,
--   refrigerators, washing-machines, air-purifiers, bank-savings,
--   internet-telecom, criteria_version = 2, and the entity_type partial index)
--   while remaining a safe no-op on Beta.
--
-- Idempotent: ON CONFLICT (...) DO NOTHING and CREATE INDEX IF NOT EXISTS.
-- One transaction.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Wave E1 and Wave E2 categories --------------------------------------------

INSERT INTO rate.categories (name, slug, icon, display_order)
VALUES
  ('Tivi', 'tvs', 'tv', 6),
  ('Máy lạnh', 'air-conditioners', 'air-vent', 7),
  ('Tủ lạnh', 'refrigerators', 'refrigerator', 8),
  ('Máy giặt', 'washing-machines', 'washing-machine', 9),
  ('Máy lọc không khí', 'air-purifiers', 'wind', 10),
  ('Lãi suất tiết kiệm', 'bank-savings', 'landmark', 11),
  ('Internet & Viễn thông', 'internet-telecom', 'wifi', 12)
ON CONFLICT (slug) DO NOTHING;

-- 2. Wave E1 and Wave E2 rating criteria (criteria_version = 2) ---------------

INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, required, position)
VALUES
  (2, 'tvs', 'display', 30, false, 0),
  (2, 'tvs', 'sound', 15, false, 1),
  (2, 'tvs', 'software', 15, false, 2),
  (2, 'tvs', 'connectivity', 10, false, 3),
  (2, 'tvs', 'design', 10, false, 4),
  (2, 'tvs', 'value', 20, true, 5),
  (2, 'air-conditioners', 'cooling', 30, false, 0),
  (2, 'air-conditioners', 'energy_efficiency', 20, false, 1),
  (2, 'air-conditioners', 'noise', 15, false, 2),
  (2, 'air-conditioners', 'durability', 10, false, 3),
  (2, 'air-conditioners', 'features', 10, false, 4),
  (2, 'air-conditioners', 'value', 15, true, 5),
  (2, 'refrigerators', 'cooling', 25, false, 0),
  (2, 'refrigerators', 'energy_efficiency', 20, false, 1),
  (2, 'refrigerators', 'capacity', 15, false, 2),
  (2, 'refrigerators', 'noise', 15, false, 3),
  (2, 'refrigerators', 'design', 10, false, 4),
  (2, 'refrigerators', 'value', 15, true, 5),
  (2, 'washing-machines', 'wash_quality', 30, false, 0),
  (2, 'washing-machines', 'noise', 15, false, 1),
  (2, 'washing-machines', 'energy_efficiency', 15, false, 2),
  (2, 'washing-machines', 'durability', 15, false, 3),
  (2, 'washing-machines', 'features', 10, false, 4),
  (2, 'washing-machines', 'value', 15, true, 5),
  (2, 'air-purifiers', 'filtration', 30, false, 0),
  (2, 'air-purifiers', 'noise', 20, false, 1),
  (2, 'air-purifiers', 'filter_cost', 15, false, 2),
  (2, 'air-purifiers', 'features', 10, false, 3),
  (2, 'air-purifiers', 'design', 10, false, 4),
  (2, 'air-purifiers', 'value', 15, true, 5),
  (2, 'bank-savings', 'service_quality', 35, false, 0),
  (2, 'bank-savings', 'price', 25, true, 1),
  (2, 'bank-savings', 'attitude', 20, false, 2),
  (2, 'bank-savings', 'speed', 20, false, 3),
  (2, 'internet-telecom', 'service_quality', 35, false, 0),
  (2, 'internet-telecom', 'price', 25, true, 1),
  (2, 'internet-telecom', 'attitude', 20, false, 2),
  (2, 'internet-telecom', 'speed', 20, false, 3)
ON CONFLICT (criteria_version, category_slug, key) DO NOTHING;

-- 3. Partial index for published product vs service master queries ------------

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_rate_master_products_entity_type_status
    ON rate.master_products (entity_type)
    WHERE status = 'published';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
    WHERE idx_ns.nspname = 'rate'
      AND idx.relname = 'idx_rate_master_products_entity_type_status'
      AND tbl_ns.nspname = 'rate'
      AND tbl.relname = 'master_products'
      AND i.indisvalid
      AND i.indisready
      AND pg_get_indexdef(i.indexrelid) LIKE '%USING btree (entity_type) WHERE (status = ''published''::text)'
  ) THEN
    RAISE EXCEPTION 'rate.idx_rate_master_products_entity_type_status definition mismatch: expected USING btree (entity_type) WHERE (status = ''published''::text)';
  END IF;
END $$;

COMMIT;
