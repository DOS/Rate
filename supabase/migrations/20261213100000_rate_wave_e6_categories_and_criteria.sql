-- =============================================================================
-- Migration: 20261213100000_rate_wave_e6_categories_and_criteria.sql
-- Purpose (DOS/DOS.Me#2034): Wave E6 categories (monitors, cameras,
-- vps-hosting), rating criteria v6, and conditional sizeless helper update.
-- Verify: scripts/ops/rate-wave-e6-verify.sql (V1 to V4 return 0).
-- Rollback: scripts/ops/rate-wave-e6-rollback.sql.
-- =============================================================================
--
-- What it adds:
--   1. 3 Wave E6 categories in rate.categories (display_order 25..27):
--      monitors ('Màn hình máy tính', icon 'monitor'),
--      cameras ('Máy ảnh & Action Cam', icon 'camera'),
--      vps-hosting ('Cloud VPS & Hosting', icon 'server').
--   2. 15 criteria rows in rate.rating_criteria with criteria_version = 6 across
--      those 3 slugs (5 criteria per slug, weights summing to 100 per slug,
--      exactly 1 required per slug), leaving criteria_version = 1..5 untouched.
--   3. Conditional update to rate.is_sizeless_category_slug(text) when Item
--      Model M1+M2 (20261212183000) is installed, adding monitors, cameras, and
--      vps-hosting while keeping the exact least-privilege ACL (revoking
--      PUBLIC, anon, authenticated, authenticator, rate_worker, service_role
--      before granting EXECUTE to service_role). When M1+M2 is absent (e.g.
--      selective promotion onto main), step 3 is a no-op.
--
-- Idempotent: ON CONFLICT (...) DO UPDATE and guarded CREATE OR REPLACE.
-- One transaction.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Wave E6 categories -------------------------------------------------------

INSERT INTO rate.categories (name, slug, icon, display_order)
VALUES
  ('Màn hình máy tính', 'monitors', 'monitor', 25),
  ('Máy ảnh & Action Cam', 'cameras', 'camera', 26),
  ('Cloud VPS & Hosting', 'vps-hosting', 'server', 27)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order;

-- 2. Wave E6 rating criteria (criteria_version = 6) ---------------------------

INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, position, required)
VALUES
  -- monitors
  (6, 'monitors', 'display', 35, 0, false),
  (6, 'monitors', 'performance', 20, 1, false),
  (6, 'monitors', 'connectivity', 15, 2, false),
  (6, 'monitors', 'design', 15, 3, false),
  (6, 'monitors', 'value', 15, 4, true),
  -- cameras
  (6, 'cameras', 'camera', 35, 0, false),
  (6, 'cameras', 'performance', 20, 1, false),
  (6, 'cameras', 'design', 15, 2, false),
  (6, 'cameras', 'battery', 15, 3, false),
  (6, 'cameras', 'value', 15, 4, true),
  -- vps-hosting
  (6, 'vps-hosting', 'performance', 30, 0, false),
  (6, 'vps-hosting', 'price', 25, 1, true),
  (6, 'vps-hosting', 'speed', 20, 2, false),
  (6, 'vps-hosting', 'service_quality', 15, 3, false),
  (6, 'vps-hosting', 'ease_of_use', 10, 4, false)
ON CONFLICT (criteria_version, category_slug, key) DO UPDATE
SET weight = EXCLUDED.weight,
    position = EXCLUDED.position,
    required = EXCLUDED.required;

-- 3. Conditional rate.is_sizeless_category_slug(text) update ------------------

DO $wave_e6_sizeless$
BEGIN
  IF pg_catalog.to_regprocedure('rate.is_sizeless_category_slug(text)') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION rate.is_sizeless_category_slug(p_slug text)
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    SET search_path = ''
    AS $fn$
      SELECT COALESCE(p_slug, '') = ANY (ARRAY[
        'earbuds',
        'tvs', 'air-conditioners', 'refrigerators', 'washing-machines', 'air-purifiers',
        'bank-savings', 'internet-telecom',
        'supplements', 'cosmetics', 'mother-baby',
        'restaurants', 'cafes', 'hotels', 'homestays',
        'dental-clinics', 'gyms-fitness',
        'spas-aesthetics', 'english-centers', 'credit-cards',
        'monitors', 'cameras', 'vps-hosting'
      ]);
    $fn$;

    REVOKE ALL ON FUNCTION rate.is_sizeless_category_slug(text)
      FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
    GRANT EXECUTE ON FUNCTION rate.is_sizeless_category_slug(text) TO service_role;
  END IF;
END
$wave_e6_sizeless$;

COMMIT;
