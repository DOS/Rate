-- ROLLBACK of the PROPOSAL 2026-11-02-dos-me-review-value-score.sql (DOS/Rate#1547).
-- Puts back P2's rating functions (byte for byte from 20261101120000_rate_criteria_ratings.sql),
-- drops the factor, the writer and the two CHECKs, then refreshes every master whose rating a
-- stored breakdown could have lifted. The value_score and value_breakdown columns are P2's and
-- keep their data; without the factor they no longer touch any rating.
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

CREATE OR REPLACE FUNCTION rate.reviews_refresh_rating_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(SELECT product_id FROM changed_new));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT x.product_id
      FROM changed_new n JOIN changed_old o ON o.id = n.id,
           LATERAL (VALUES (n.product_id), (o.product_id)) x(product_id)
      WHERE (n.product_id, n.rating_star, n.rating_exact, n.criteria_ratings,
             n.helpfulness_weight, n.reviewer_type, n.origin)
            IS DISTINCT FROM
            (o.product_id, o.rating_star, o.rating_exact, o.criteria_ratings,
             o.helpfulness_weight, o.reviewer_type, o.origin)));
  ELSE
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(SELECT product_id FROM changed_old));
  END IF;
  RETURN NULL;
END $$;

DROP FUNCTION IF EXISTS rate.store_review_values(jsonb);
DROP FUNCTION IF EXISTS rate.review_completeness_factor(jsonb);

ALTER TABLE rate.reviews DROP CONSTRAINT IF EXISTS reviews_value_breakdown_completeness;
ALTER TABLE rate.reviews DROP CONSTRAINT IF EXISTS reviews_value_breakdown_object;

SELECT rate.refresh_rating_extras_of_products(ARRAY(
  SELECT DISTINCT r.product_id FROM rate.reviews r WHERE r.value_breakdown IS NOT NULL));

COMMIT;
