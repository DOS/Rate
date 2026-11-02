-- =============================================================================
-- PROPOSAL (DOS/Rate#1547): phase P6 of the DOS/Rate criteria ratings design (DOS/Rate#1531,
-- Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html, section 6; D6 and D7 approved by
-- JOY on 2026-10-31). A DOS-Me migration to review and apply; nothing here is applied by
-- DOS/Rate. Verify: 2026-11-02-dos-me-review-value-score-verify.sql (V1 to V7 return 0).
-- Rollback: 2026-11-02-dos-me-review-value-score-rollback.sql.
--
-- What it does:
--   rate.review_completeness_factor(value_breakdown) the D6 factor, 1 to 1.25, from the
--                        weightCompleteness a review's value score stored (0 to 35: completeness
--                        less the photo of a review without pros and cons, so a marketplace review
--                        keeps its weight). Equal to completenessWeightFactor in
--                        packages/shared-data/src/rules/review-value.ts (DOS/Rate#1579).
--   rate.master_rating_extras   each review's weight becomes
--                        LEAST(3, helpfulness_weight x factor); nothing else changes.
--   rate.reviews_refresh_rating_extras   a change of the factor refreshes the master.
--   rate.store_review_values(p_values)   the one writer of value_score and value_breakdown,
--                        for the scoring job (rate_worker) and service_role; it checks each
--                        row's shape, so a stored breakdown is always one the shared module
--                        could have produced.
--   Two NOT VALID CHECKs on value_breakdown (an object; completeness and weightCompleteness
--   steps of 5 from 0 to 35).
--
-- Depends on P2 (20261101120000, value_score, value_breakdown and the rating functions) and
-- P3 (20261102090000); both are in production. Uses only PostgreSQL 15 features.
--
-- Rating impact at apply time: none. value_breakdown is NULL on every review until the scoring
-- job writes it, and a NULL breakdown has factor 1, so no stored rating changes. Ratings move
-- only as the job stores scores, each by at most +25% weight on a review.
--
-- Idempotent: CREATE OR REPLACE for functions, constraints guarded by pg_constraint.
-- =============================================================================

BEGIN;

-- 1. value_breakdown shape ---------------------------------------------------------------------
-- NOT VALID: no scan under the ALTER TABLE lock. Every row is NULL today; V6 checks them all.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_value_breakdown_object') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_breakdown_object
      CHECK (value_breakdown IS NULL OR jsonb_typeof(value_breakdown) = 'object') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_value_breakdown_completeness') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_breakdown_completeness
      CHECK (value_breakdown IS NULL
             OR jsonb_typeof(value_breakdown) <> 'object'
             OR CASE WHEN jsonb_typeof(value_breakdown -> 'completeness') = 'number'
                      AND jsonb_typeof(value_breakdown -> 'weightCompleteness') = 'number'
                     THEN (value_breakdown ->> 'completeness')::numeric IN (0, 5, 10, 15, 20, 25, 30, 35)
                      AND (value_breakdown ->> 'weightCompleteness')::numeric IN (0, 5, 10, 15, 20, 25, 30, 35)
                     ELSE false END)
      NOT VALID;
  END IF;
END $$;

-- 2. The D6 factor -----------------------------------------------------------------------------
-- 1 + 0.25 x weightCompleteness / 35 at four decimals. A missing breakdown, a missing or
-- non-number weightCompleteness count as 0 (factor 1); a number outside 0 to 35 as its nearest
-- bound.

CREATE OR REPLACE FUNCTION rate.review_completeness_factor(p_breakdown jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT round(1 + 0.25 * LEAST(35, GREATEST(0,
           CASE WHEN jsonb_typeof(p_breakdown) = 'object'
                 AND jsonb_typeof(p_breakdown -> 'weightCompleteness') = 'number'
                THEN (p_breakdown ->> 'weightCompleteness')::numeric
                ELSE 0 END)) / 35, 4)
$$;

REVOKE EXECUTE ON FUNCTION rate.review_completeness_factor(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.review_completeness_factor(jsonb) TO service_role;

-- 3. The rating reads it -----------------------------------------------------------------------
-- P2's body with one change: the weight of each review (marked P6).

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
      -- P6: the stored weight times the completeness factor (D6), capped at 3.
      SELECT LEAST(3.0, r.helpfulness_weight * rate.review_completeness_factor(r.value_breakdown))::numeric AS w,
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

-- P2's body with one change: the factor is a rating input (marked P6). Only a change of the
-- factor counts, so storing a new score with the same completeness refreshes nothing.
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
             n.helpfulness_weight, n.reviewer_type, n.origin,
             rate.review_completeness_factor(n.value_breakdown))  -- P6
            IS DISTINCT FROM
            (o.product_id, o.rating_star, o.rating_exact, o.criteria_ratings,
             o.helpfulness_weight, o.reviewer_type, o.origin,
             rate.review_completeness_factor(o.value_breakdown))));  -- P6
  ELSE
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(SELECT product_id FROM changed_old));
  END IF;
  RETURN NULL;
END $$;

-- CREATE OR REPLACE keeps P2's grants on both (service_role only).

-- 4. The writer --------------------------------------------------------------------------------
-- p_values: a JSON array of {"id": review uuid, "score": 0-100, "breakdown": {...}}, at most
-- 1000 rows. Each breakdown must look like the shared module's output: an object with
-- "version" 1, "gated" boolean, the five parts as numbers within their maximums,
-- "completeness" a step of 5, "weightCompleteness" equal to it or 5 less, "score" equal to "score" of the row and to the parts' sum, and a
-- gated row scored 0. "tier" and "gaps" are kept as given. A malformed row fails the whole call
-- (22023) and names its index; nothing is written. Rows of reviews that no longer exist are
-- skipped. Returns the number of reviews whose stored value changed. One UPDATE statement, so
-- the reviews trigger refreshes each affected master once.
CREATE OR REPLACE FUNCTION rate.store_review_values(p_values jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_index integer := 0;
  v_b jsonb;
  v_score numeric;
  v_sum numeric;
  v_changed integer;
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_values) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 rows per call' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    v_b := v_row -> 'breakdown';
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row -> 'id') IS DISTINCT FROM 'string'
       OR (v_row ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b) IS DISTINCT FROM 'object'
       OR v_b -> 'version' IS DISTINCT FROM '1'::jsonb
       OR jsonb_typeof(v_b -> 'gated') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_b -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'completeness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'weightCompleteness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'specificity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'verified') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'helpful') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'trust') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
    END IF;
    v_score := (v_row ->> 'score')::numeric;
    v_sum := (v_b ->> 'completeness')::numeric + (v_b ->> 'specificity')::numeric
           + (v_b ->> 'verified')::numeric + (v_b ->> 'helpful')::numeric
           + (v_b ->> 'trust')::numeric;
    IF (v_b ->> 'completeness')::numeric NOT IN (0, 5, 10, 15, 20, 25, 30, 35)
       -- weightCompleteness: completeness, or completeness less the 5 of a photo
       OR (v_b ->> 'completeness')::numeric - (v_b ->> 'weightCompleteness')::numeric NOT IN (0, 5)
       OR (v_b ->> 'weightCompleteness')::numeric < 0
       OR (v_b ->> 'specificity')::numeric NOT BETWEEN 0 AND 20
       OR (v_b ->> 'verified')::numeric NOT IN (0, 15)
       OR (v_b ->> 'helpful')::numeric NOT BETWEEN 0 AND 20
       OR (v_b ->> 'trust')::numeric NOT BETWEEN 0 AND 10
       OR v_score NOT BETWEEN 0 AND 100
       OR (v_b ->> 'score')::numeric <> v_score
       OR abs(v_sum - v_score) > 0.01
       OR ((v_b ->> 'gated')::boolean AND v_sum <> 0) THEN
      RAISE EXCEPTION 'row % has values out of range', v_index USING ERRCODE = '22023';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  UPDATE rate.reviews r
  SET value_score = round(v.score, 2), value_breakdown = v.breakdown
  FROM (
    SELECT DISTINCT ON ((e ->> 'id')::uuid)
           (e ->> 'id')::uuid AS id, (e ->> 'score')::numeric AS score, e -> 'breakdown' AS breakdown
    FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
    ORDER BY (e ->> 'id')::uuid, n DESC  -- a review listed twice: the last row wins
  ) v
  WHERE r.id = v.id
    AND (r.value_score, r.value_breakdown) IS DISTINCT FROM (round(v.score, 2), v.breakdown);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END $$;

REVOKE EXECUTE ON FUNCTION rate.store_review_values(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.store_review_values(jsonb) TO service_role, rate_worker;

COMMIT;
