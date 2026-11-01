-- =============================================================================
-- Migration: 20261101120100_rate_criteria_ratings_backfill.sql
-- Purpose (DOS/Rate#1543): section 8 of the reviewed DOS/Rate proposal
-- Docs/Proposals/2026-10-31-dos-me-criteria-ratings.sql, copied unchanged. It runs after
-- 20261101120000_rate_criteria_ratings.sql commits: it validates that file's NOT VALID
-- CHECKs and fills rating_score, rating_weight_sum and criteria_scores for every reviewed
-- master.
--
-- Its own transaction, so the ALTER TABLE locks of the schema change are already released
-- and only the touched master rows are locked. Masters with no counted review already hold
-- the right values (NULL, 0, {}) from the column defaults. Re-runnable: it writes only rows
-- whose values differ. Re-run it after a rollback of the DOS/Rate M1+M2 Item migration.
-- =============================================================================

-- VALIDATE scans each table under a lock that lets reads and writes go on.
BEGIN;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_rating_exact_range;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_verdict_length;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_criteria_version_positive;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_value_score_range;
ALTER TABLE rate.master_products VALIDATE CONSTRAINT master_products_rating_score_range;
ALTER TABLE rate.master_products VALIDATE CONSTRAINT master_products_rating_weight_sum_nonneg;
-- A master with a reviewed listing, or one the live refresh rated (an Item variant whose
-- reviews sit on listings with no variant). The first test does not trust the cached
-- authentic_review_count: a weight written straight to rate.reviews leaves it stale.
SELECT rate.refresh_master_rating_extras(m.id)
FROM rate.master_products m
WHERE EXISTS (SELECT 1 FROM rate.products p JOIN rate.reviews r ON r.product_id = p.id
              WHERE p.cluster_id = m.id)
   OR m.authentic_review_count > 0 OR m.user_rating_weighted > 0
ORDER BY m.id;
COMMIT;
