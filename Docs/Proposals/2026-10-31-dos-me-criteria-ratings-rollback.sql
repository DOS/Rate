-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-31-dos-me-criteria-ratings.sql (DOS/Rate#1543).
-- One transaction, re-runnable, safe before or after M1+M2 or its rollback: the migration
-- replaces no existing function, so this only drops what it added. Data written only into the
-- new columns and tables (exact stars, verdicts, pro and con lines, product points,
-- rating_score, criteria_scores) is lost; nothing older depends on it. Run it only while no
-- phase reads or writes them: before P3 (#1544), P4 (#1545) and P5 (#1546), or after they are
-- reverted.

BEGIN;

-- 1. Triggers first, so the drops below fire nothing.
DROP TRIGGER IF EXISTS trg_reviews_rating_extras_ins ON rate.reviews;
DROP TRIGGER IF EXISTS trg_reviews_rating_extras_upd ON rate.reviews;
DROP TRIGGER IF EXISTS trg_reviews_rating_extras_del ON rate.reviews;
DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_ins ON rate.review_flags;
DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_upd ON rate.review_flags;
DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_del ON rate.review_flags;
DROP TRIGGER IF EXISTS trg_master_products_rating_extras ON rate.master_products;

-- 2. Functions.
DROP FUNCTION IF EXISTS rate.master_products_refresh_rating_extras();
DROP FUNCTION IF EXISTS rate.review_flags_refresh_rating_extras();
DROP FUNCTION IF EXISTS rate.reviews_refresh_rating_extras();
DROP FUNCTION IF EXISTS rate.refresh_rating_extras_of_masters(uuid[]);
DROP FUNCTION IF EXISTS rate.refresh_master_rating_extras(uuid);
DROP FUNCTION IF EXISTS rate.master_rating_extras(uuid);
DROP FUNCTION IF EXISTS rate.master_rating_item(uuid);

-- 3. Tables (their policies and indexes go with them).
DROP TABLE IF EXISTS rate.product_points;
DROP TABLE IF EXISTS rate.review_points;

-- 4. Columns (their CHECK constraints go with them).
ALTER TABLE rate.master_products
  DROP COLUMN IF EXISTS criteria_scores,
  DROP COLUMN IF EXISTS rating_weight_sum,
  DROP COLUMN IF EXISTS rating_score;

ALTER TABLE rate.reviews
  DROP COLUMN IF EXISTS value_breakdown,
  DROP COLUMN IF EXISTS value_score,
  DROP COLUMN IF EXISTS criteria_version,
  DROP COLUMN IF EXISTS verdict,
  DROP COLUMN IF EXISTS rating_exact;

COMMIT;
