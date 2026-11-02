-- ROLLBACK of the PROPOSAL 2026-11-02-dos-me-review-value-score.sql (DOS/Rate#1547).
-- Two transactions:
--   1. puts back P2's rating function (byte for byte from 20261101120000_rate_criteria_ratings.sql),
--      drops the triggers on rate.review_values, and refreshes every master a stored value could
--      have lifted; no table lock beyond the rows it updates;
--   2. drops the writer, the reader, the factor, rate.review_values (its values are lost: the
--      scoring job recomputes them), the tier column and its CHECK, under a short ACCESS
--      EXCLUSIVE lock with a 5 s timeout (re-run the file if it times out). The CHECK keeping
--      P2's public number columns empty stays (D7).
-- The refresh skips a master another transaction holds at that moment (FOR UPDATE SKIP LOCKED in
-- P2), so stop the scoring job first and afterwards run V5 of the verify file: any master it
-- counts needs SELECT rate.refresh_master_rating_extras(id).
-- Safe to run twice.

BEGIN;

CREATE OR REPLACE FUNCTION rate.master_rating_extras(p_master_id uuid)
RETURNS TABLE (rating_score numeric, rating_weight_sum numeric, criteria_scores jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid := rate.master_rating_item(p_master_id);
BEGIN
  RETURN QUERY EXECUTE format($q$
    WITH eligible AS (
      SELECT LEAST(3.0, r.helpfulness_weight)::numeric AS w,
             COALESCE(r.rating_exact, r.rating_star)::numeric AS star,
             r.criteria_ratings
      FROM rate.products p
      JOIN rate.reviews r ON r.product_id = p.id
      JOIN rate.review_flags f ON f.review_id = r.id
      WHERE %s = $1
        AND p.origin = 'crawl'
        AND r.origin IN ('crawl', 'community')
        AND r.reviewer_type = 'user'
        AND COALESCE(f.include_in_rating, true)
        AND r.helpfulness_weight > 0
    ),
    overall AS (
      SELECT round(COALESCE(sum(w), 0), 2) AS weight_sum,
             CASE WHEN sum(w) > 0 THEN round((3 * 4.2 + sum(w * star)) / (3 + sum(w)), 3) END AS score
      FROM eligible
      WHERE star BETWEEN 1 AND 5
    ),
    per_criterion AS (
      SELECT c.key,
             count(*) AS writers,
             round(sum(e.w), 2) AS weight_sum,
             sum(LEAST(1.0, e.w)) AS shown_sum,
             round((3 * 4.2 + sum(e.w * (c.value #>> '{}')::numeric)) / (3 + sum(e.w)), 3) AS score
      FROM eligible e
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(e.criteria_ratings) = 'object' THEN e.criteria_ratings
             ELSE '{}'::jsonb END
      ) AS c(key, value)
      WHERE c.key ~ '^[a-z_]{2,32}$'
        AND jsonb_typeof(c.value) = 'number'
        AND (c.value #>> '{}')::numeric BETWEEN 1 AND 5
      GROUP BY c.key
    )
    SELECT o.score,
           o.weight_sum,
           COALESCE(
             (SELECT jsonb_object_agg(pc.key, jsonb_build_object(
                       'score', pc.score, 'weight_sum', pc.weight_sum, 'writers', pc.writers))
              FROM per_criterion pc
              WHERE pc.writers >= 3 AND pc.shown_sum >= 1.5),
             '{}'::jsonb)
    FROM overall o
  $q$, CASE WHEN v_item IS NULL THEN 'p.cluster_id' ELSE 'p.item_id' END)
  USING COALESCE(v_item, p_master_id);
END $$;

DROP TRIGGER IF EXISTS trg_review_values_rating_extras_ins ON rate.review_values;
DROP TRIGGER IF EXISTS trg_review_values_rating_extras_upd ON rate.review_values;
DROP TRIGGER IF EXISTS trg_review_values_rating_extras_del ON rate.review_values;
DROP FUNCTION IF EXISTS rate.review_values_refresh_rating_extras();

DO $$
BEGIN
  IF to_regclass('rate.review_values') IS NOT NULL THEN
    -- Only reviews whose value lifted them (the factor still exists until transaction 2).
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT DISTINCT r.product_id
      FROM rate.review_values v JOIN rate.reviews r ON r.id = v.review_id
      WHERE rate.review_completeness_factor(v.value_breakdown) > 1));
  END IF;
END $$;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS rate.store_review_values(jsonb);
DROP FUNCTION IF EXISTS rate.my_review_values(uuid[]);
DROP FUNCTION IF EXISTS rate.review_completeness_factor(jsonb);
DROP TABLE IF EXISTS rate.review_values;

-- reviews_value_private stays: P2's public number columns must remain empty after a rollback
-- too (D7), and rate_worker can still write rate.reviews.
ALTER TABLE rate.reviews DROP CONSTRAINT IF EXISTS reviews_value_tier_known;
ALTER TABLE rate.reviews DROP COLUMN IF EXISTS value_tier;

COMMIT;
