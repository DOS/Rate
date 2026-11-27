-- =============================================================================
-- Migration: 20261212100000_rate_wave_e5_phase2_categories_and_criteria.sql
-- Purpose (DOS/DOS.Me#2025): Wave E5 Phase 2 categories (spas-aesthetics,
-- english-centers, credit-cards) and rating criteria v5.
-- Verify: scripts/ops/rate-wave-e5-phase2-verify.sql (V1 to V3 return 0).
-- Rollback: scripts/ops/rate-wave-e5-phase2-rollback.sql.
-- =============================================================================
--
-- What it adds:
--   1. 3 Wave E5 Phase 2 categories in rate.categories (display_order 22..24):
--      spas-aesthetics ('Spa & Thẩm mỹ'),
--      english-centers ('Trung tâm tiếng Anh'),
--      credit-cards ('Thẻ tín dụng').
--   2. 15 criteria rows in rate.rating_criteria with criteria_version = 5 across
--      those 3 slugs (5 criteria per slug, weights summing to 100 per slug,
--      exactly 1 required per slug), leaving criteria_version = 1, 2, 3, 4
--      untouched.
--
-- Idempotent: ON CONFLICT (...) DO NOTHING. One transaction.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Wave E5 Phase 2 categories -----------------------------------------------

INSERT INTO rate.categories (name, slug, icon, display_order)
VALUES
  ('Spa & Thẩm mỹ', 'spas-aesthetics', 'sparkles', 22),
  ('Trung tâm tiếng Anh', 'english-centers', 'graduation-cap', 23),
  ('Thẻ tín dụng', 'credit-cards', 'credit-card', 24)
ON CONFLICT (slug) DO NOTHING;

-- 2. Wave E5 Phase 2 rating criteria (criteria_version = 5) -------------------

INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, required, position)
VALUES
  -- spas-aesthetics
  (5, 'spas-aesthetics', 'service_quality', 30, false, 0),
  (5, 'spas-aesthetics', 'hygiene', 25, false, 1),
  (5, 'spas-aesthetics', 'service_attitude', 20, false, 2),
  (5, 'spas-aesthetics', 'price', 15, true, 3),
  (5, 'spas-aesthetics', 'ambiance', 10, false, 4),
  -- english-centers
  (5, 'english-centers', 'service_quality', 35, false, 0),
  (5, 'english-centers', 'service_attitude', 20, false, 1),
  (5, 'english-centers', 'quality', 15, false, 2),
  (5, 'english-centers', 'location', 10, false, 3),
  (5, 'english-centers', 'value', 20, true, 4),
  -- credit-cards
  (5, 'credit-cards', 'features', 30, false, 0),
  (5, 'credit-cards', 'price', 25, true, 1),
  (5, 'credit-cards', 'service_quality', 20, false, 2),
  (5, 'credit-cards', 'speed', 15, false, 3),
  (5, 'credit-cards', 'ease_of_use', 10, false, 4)
ON CONFLICT (criteria_version, category_slug, key) DO NOTHING;

COMMIT;
