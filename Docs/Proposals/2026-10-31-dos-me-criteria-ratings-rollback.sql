-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-31-dos-me-criteria-ratings.sql (DOS/Rate#1543).
-- One transaction, re-runnable. It gives rate.refresh_master_product_rating its previous body
-- back (the renamed base, with its owner and grants), then drops what the migration added.
-- Data written only into the new columns and tables (exact stars, verdicts, pro and con lines,
-- product points, rating_score, criteria_scores) is lost; nothing older depends on it. Run it
-- before the web reads rating_score (P4) or after that read is reverted.

BEGIN;

-- 1. The refresh: drop the wrapper and put the base back under its own name.
DO $$
BEGIN
  IF to_regprocedure('rate.refresh_master_product_rating_base(uuid)') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS rate.refresh_master_product_rating(uuid);
    ALTER FUNCTION rate.refresh_master_product_rating_base(uuid)
      RENAME TO refresh_master_product_rating;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(uuid) TO service_role, rate_worker;

DROP FUNCTION IF EXISTS rate.refresh_master_rating_extras(uuid);

-- 2. Tables (their policies and indexes go with them).
DROP TABLE IF EXISTS rate.product_points;
DROP TABLE IF EXISTS rate.review_points;

-- 3. Columns (their CHECK constraints go with them).
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
