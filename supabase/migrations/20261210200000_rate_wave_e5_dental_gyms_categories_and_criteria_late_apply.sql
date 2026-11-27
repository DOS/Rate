-- =============================================================================
-- Migration: 20261210200000_rate_wave_e5_dental_gyms_categories_and_criteria_late_apply.sql
-- Purpose (DOS/DOS.Me#1988): monotonic late-apply copy of
-- 20261209120000_rate_wave_e5_dental_gyms_categories_and_criteria.sql
-- (landed on dev in DOS/DOS.Me#1989, commit cf8259cae).
-- Verify: scripts/ops/rate-wave-e5-verify.sql (V1 to V3 return 0).
-- Rollback: scripts/ops/rate-wave-e5-rollback.sql.
-- =============================================================================
--
-- Why late-apply:
--   origin/main already carries
--   20261210103000_dosai_device_push_and_platform_settings_acl_late_apply.sql
--   before DOS/DOS.Me#1988 is selectively promoted, and origin/dev carries
--   migrations through 20261210180000, so supabase db push on Production would
--   silently skip out-of-order 20261209120000 older than 20261210103000.
--   This monotonic idempotent copy (> 20261210103000 on main and > 20261210180000
--   on dev) guarantees Production applies Wave E5 (dental-clinics, gyms-fitness,
--   and criteria_version = 4) while remaining a safe no-op on Beta.
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
