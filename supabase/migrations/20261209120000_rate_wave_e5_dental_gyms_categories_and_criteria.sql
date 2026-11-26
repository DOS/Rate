-- =============================================================================
-- Migration: 20261209120000_rate_wave_e5_dental_gyms_categories_and_criteria.sql
-- Purpose: Wave E5 local service/place categories (dental-clinics, gyms-fitness)
-- and rating criteria v4.
-- Verify: scripts/ops/rate-wave-e5-verify.sql (V1 to V3 return 0).
-- Rollback: scripts/ops/rate-wave-e5-rollback.sql.
-- =============================================================================
--
-- What it adds:
--   1. 2 Wave E5 categories in rate.categories (display_order 20..21):
--      dental-clinics ('Nha khoa'), gyms-fitness ('Phòng tập Gym & Fitness').
--   2. 10 criteria rows in rate.rating_criteria with criteria_version = 4 across
--      those 2 slugs (5 criteria per slug, weights summing to 100 per slug,
--      exactly 1 required per slug), leaving criteria_version = 1, 2, 3 untouched.
--
-- Idempotent: ON CONFLICT (...) DO NOTHING. One transaction.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Wave E5 categories -------------------------------------------------------

INSERT INTO rate.categories (name, slug, icon, display_order)
VALUES
  ('Nha khoa', 'dental-clinics', 'stethoscope', 20),
  ('Phòng tập Gym & Fitness', 'gyms-fitness', 'dumbbell', 21)
ON CONFLICT (slug) DO NOTHING;

-- 2. Wave E5 rating criteria (criteria_version = 4) ---------------------------

INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, required, position)
VALUES
  (4, 'dental-clinics', 'service_quality', 30, false, 0),
  (4, 'dental-clinics', 'hygiene', 25, false, 1),
  (4, 'dental-clinics', 'service_attitude', 20, false, 2),
  (4, 'dental-clinics', 'price', 15, true, 3),
  (4, 'dental-clinics', 'location', 10, false, 4),
  (4, 'gyms-fitness', 'quality', 30, false, 0),
  (4, 'gyms-fitness', 'hygiene', 20, false, 1),
  (4, 'gyms-fitness', 'service_attitude', 15, false, 2),
  (4, 'gyms-fitness', 'location', 15, false, 3),
  (4, 'gyms-fitness', 'value', 20, true, 4)
ON CONFLICT (criteria_version, category_slug, key) DO NOTHING;

COMMIT;
