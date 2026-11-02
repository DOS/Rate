-- =============================================================================
-- Migration: 20261102233000_rate_review_value_score.sql
-- Purpose (DOS/Rate#1547): phase P6 of the DOS/Rate criteria ratings design
-- (DOS/Rate#1531, Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html, section 6;
-- decisions D6 and D7 approved by JOY on 2026-10-31, the P6 apply on 2026-11-02). It needs
-- P2 (20261101120000_rate_criteria_ratings.sql) and P3
-- (20261102090000_rate_review_submission_v2.sql). Copied unchanged from the reviewed DOS/Rate
-- proposal Docs/Proposals/2026-11-02-dos-me-review-value-score.sql (DOS/Rate#1580) apart from
-- this header. One transaction, then a refresh that is a no-op on the first apply.
-- Verify: scripts/ops/rate-review-value-score-verify.sql (V1 to V7 return 0).
-- Rollback: scripts/ops/rate-review-value-score-rollback.sql.
--
-- D7: a review's value number lives in the private rate.review_values (no anon or
-- authenticated access); only its tier is public (rate.reviews.value_tier); the writer reads
-- their own number through rate.my_review_values. D6: a review's rating weight becomes
-- LEAST(3, helpfulness_weight x completeness factor), x1.00 to x1.25. No rating changes at
-- apply: the values table starts empty. Details in the proposal's header, below.
-- =============================================================================
--
-- =============================================================================
-- PROPOSAL (DOS/Rate#1547): phase P6 of the DOS/Rate criteria ratings design (DOS/Rate#1531,
-- Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html, section 6; D6 and D7 approved by
-- JOY on 2026-10-31). A DOS-Me migration to review and apply; nothing here is applied by
-- DOS/Rate. Verify: 2026-11-02-dos-me-review-value-score-verify.sql (V1 to V7 return 0).
-- Rollback: 2026-11-02-dos-me-review-value-score-rollback.sql.
--
-- What it does:
--   rate.review_values   a review's value score and breakdown, PRIVATE (D7: the number only for
--                        the writer). No anon or authenticated access; service_role and
--                        rate_worker read it; only rate.store_review_values writes it.
--   rate.reviews.value_tier   the public tier (D7): basic, complete or excellent; NULL when not
--                        scored or gated. P2's rate.reviews.value_score and value_breakdown stay
--                        empty, held there by a CHECK, so the number never reaches the public
--                        table.
--   rate.review_completeness_factor(breakdown)   the D6 factor, 1 to 1.25, from the breakdown's
--                        weightCompleteness (completeness less the photo of a review without
--                        pros and cons, so a marketplace review keeps its weight). Equal to
--                        completenessWeightFactor in packages/shared-data/src/rules/review-value.ts.
--   rate.master_rating_extras   each review's weight becomes LEAST(3, helpfulness_weight x
--                        factor); nothing else in P2's body changes.
--   triggers on rate.review_values   a change of a review's factor refreshes its master.
--   rate.store_review_values(p_values)   the writer for the scoring job (rate_worker) and
--                        service_role: only a breakdown the shared module could produce.
--   rate.my_review_values(p_review_ids)   the writer of a review reads its own number and
--                        breakdown (authenticated, through rate.review_authors).
--
-- Depends on P2 (20261101120000) and P3 (20261102090000); both are in production.
--
-- Rating impact at apply time: none. rate.review_values is new and empty, and a review without
-- a row has factor 1. Ratings move only as the job stores values, each review by at most +25%.
--
-- Idempotent: IF NOT EXISTS for the table and column, constraints guarded by pg_constraint,
-- CREATE OR REPLACE for functions, DROP ... IF EXISTS before each trigger and policy. Section
-- 7, after the transaction, refreshes masters whose reviews already hold values (a re-apply);
-- on the first apply it changes nothing.
-- =============================================================================

BEGIN;

-- The ALTER TABLEs on rate.reviews take a short ACCESS EXCLUSIVE lock: give up rather than
-- queue every reader behind a long query. Re-run the file if it times out.
SET LOCAL lock_timeout = '5s';

-- 1. The public tier, and P2's columns kept empty -----------------------------------------------
-- First, so rate.reviews goes straight to ACCESS EXCLUSIVE (the CREATE TABLE below would
-- otherwise take SHARE ROW EXCLUSIVE first and upgrade). NOT VALID: no scan under the lock.

-- A review that already holds a number in P2's public columns could never be updated again
-- under reviews_value_private: refuse the apply instead (move such values out first). One scan
-- of rate.reviews, before any strong lock.
DO $$
BEGIN
  IF to_regclass('rate.review_values') IS NULL
     AND EXISTS (SELECT 1 FROM rate.reviews
                 WHERE value_score IS NOT NULL OR value_breakdown IS NOT NULL) THEN
    RAISE EXCEPTION 'rate.reviews has value_score or value_breakdown set; P6 keeps them empty (D7)'
      USING ERRCODE = '55000';
  END IF;
END $$;

ALTER TABLE rate.reviews ADD COLUMN IF NOT EXISTS value_tier text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.reviews'::regclass
                   AND conname = 'reviews_value_tier_known') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_tier_known
      CHECK (value_tier IS NULL OR value_tier IN ('basic', 'complete', 'excellent')) NOT VALID;
  END IF;
  -- P2 put the number on the public table; it lives in rate.review_values instead.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.reviews'::regclass
                   AND conname = 'reviews_value_private') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_private
      CHECK (value_score IS NULL AND value_breakdown IS NULL) NOT VALID;
  END IF;
END $$;

-- 2. The private values ------------------------------------------------------------------------
-- Writers: only rate.store_review_values (and service_role by hand). The refresh triggers
-- cover INSERT, UPDATE of the breakdown and DELETE; a TRUNCATE or a change of review_id (only
-- service_role can) needs a manual refresh of the masters involved.

CREATE TABLE IF NOT EXISTS rate.review_values (
  review_id       uuid PRIMARY KEY REFERENCES rate.reviews(id) ON DELETE CASCADE,
  value_score     numeric(5, 2) NOT NULL CHECK (value_score BETWEEN 0 AND 100),
  value_breakdown jsonb NOT NULL CHECK (jsonb_typeof(value_breakdown) = 'object'),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Both completeness keys numbers, completeness a step of 5, the weight one equal to it or
  -- the 5 of a photo less; the breakdown's score is value_score.
  CONSTRAINT review_values_completeness CHECK (
    CASE WHEN jsonb_typeof(value_breakdown -> 'completeness') = 'number'
          AND jsonb_typeof(value_breakdown -> 'weightCompleteness') = 'number'
          AND jsonb_typeof(value_breakdown -> 'score') = 'number'
         THEN (value_breakdown ->> 'completeness')::numeric IN (0, 5, 10, 15, 20, 25, 30, 35)
          AND (value_breakdown ->> 'completeness')::numeric
              - (value_breakdown ->> 'weightCompleteness')::numeric IN (0, 5)
          AND (value_breakdown ->> 'weightCompleteness')::numeric >= 0
          AND round((value_breakdown ->> 'score')::numeric, 2) = value_score
         ELSE false END)
);

COMMENT ON TABLE rate.review_values IS
  'Value score of a review (DOS/Rate#1547). Private (D7): the public sees only rate.reviews.value_tier; the writer reads its own through rate.my_review_values.';

ALTER TABLE rate.review_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.review_values FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.review_values TO service_role;
GRANT SELECT ON rate.review_values TO rate_worker;
DROP POLICY IF EXISTS "Service role access review_values" ON rate.review_values;
CREATE POLICY "Service role access review_values" ON rate.review_values
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker read review_values" ON rate.review_values;
CREATE POLICY "Rate worker read review_values" ON rate.review_values
  FOR SELECT TO rate_worker USING (true);


-- 3. The D6 factor -----------------------------------------------------------------------------
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

-- 4. The rating reads it -----------------------------------------------------------------------
-- P2's body with two changes, marked P6: the private values joined, and the weight.

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
      SELECT LEAST(3.0, r.helpfulness_weight * rate.review_completeness_factor(v.value_breakdown))::numeric AS w,
             COALESCE(r.rating_exact, r.rating_star)::numeric AS star,
             r.criteria_ratings
      FROM rate.products p
      JOIN rate.reviews r ON r.product_id = p.id
      JOIN rate.review_flags f ON f.review_id = r.id
      LEFT JOIN rate.review_values v ON v.review_id = r.id  -- P6
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

-- CREATE OR REPLACE keeps P2's grants (service_role only).

-- A change of a review's factor refreshes its master. Statement-level, as P2's triggers; only
-- rows whose factor changed count, so a rescore with the same completeness refreshes nothing.
CREATE OR REPLACE FUNCTION rate.review_values_refresh_rating_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id FROM changed_new n JOIN rate.reviews r ON r.id = n.review_id
      WHERE rate.review_completeness_factor(n.value_breakdown) <> 1));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id
      FROM changed_new n JOIN changed_old o ON o.review_id = n.review_id
      JOIN rate.reviews r ON r.id = n.review_id
      WHERE rate.review_completeness_factor(n.value_breakdown)
            IS DISTINCT FROM rate.review_completeness_factor(o.value_breakdown)));
  ELSE
    -- A row deleted with its review (ON DELETE CASCADE) finds no review here; the reviews
    -- trigger refreshes that master.
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id FROM changed_old o JOIN rate.reviews r ON r.id = o.review_id
      WHERE rate.review_completeness_factor(o.value_breakdown) <> 1));
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION rate.review_values_refresh_rating_extras() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_review_values_rating_extras_ins ON rate.review_values;
CREATE TRIGGER trg_review_values_rating_extras_ins AFTER INSERT ON rate.review_values
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_values_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_review_values_rating_extras_upd ON rate.review_values;
CREATE TRIGGER trg_review_values_rating_extras_upd AFTER UPDATE ON rate.review_values
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_values_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_review_values_rating_extras_del ON rate.review_values;
CREATE TRIGGER trg_review_values_rating_extras_del AFTER DELETE ON rate.review_values
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_values_refresh_rating_extras();

-- 5. The writer --------------------------------------------------------------------------------
-- p_values: a JSON array of {"id": review uuid, "score": 0-100, "breakdown": {...}}, at most
-- 1000 rows and 2 MB. Each breakdown must be one the shared module could produce:
--   exactly its eleven keys; "version" 1; "gated" a boolean;
--   "completeness" a step of 5 up to 35; "weightCompleteness" 5 less exactly for a photo
--   without pros and cons ("gaps" has "pros_cons" and not "photo"), else equal to it;
--   "specificity" one of the depth points; "verified" 0 or 15; "helpful" 0 to 20; "trust" 0 to
--   10; "score" the row's score and the parts' sum;
--   "gaps" distinct known gaps; "tier" the module's rule (basic under completeness 30,
--   excellent from score 70, else complete);
--   a gated row: every part 0, tier null, no gaps.
-- A malformed row fails the whole call (22023) and names its index; nothing is written. Rows
-- of reviews that do not exist are skipped. It writes rate.review_values (the number, private)
-- and rate.reviews.value_tier (the tier, public). The reviews are locked FOR NO KEY UPDATE in id
-- order first: two batches never deadlock, and inserts that reference those reviews (flags,
-- lines, votes) are not blocked. Another writer that updates several reviews out of id order
-- can still deadlock with a batch; PostgreSQL aborts one side (40P01), so the job retries.
-- Returns the number of reviews whose stored value changed. Run one job worker at a time; a
-- batch refreshes its masters inside the call.
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
  v_c numeric;
  v_gaps text[];
  v_tier text;
  v_changed integer;
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_values) > 1000 OR octet_length(p_values::text) > 2097152 THEN
    RAISE EXCEPTION 'at most 1000 rows and 2 MB per call' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    v_b := v_row -> 'breakdown';
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row -> 'id') IS DISTINCT FROM 'string'
       OR (v_row ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b) IS DISTINCT FROM 'object'
       OR v_b - ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                      'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps'] <> '{}'::jsonb
       OR NOT v_b ?& ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                          'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps']
       OR v_b -> 'version' IS DISTINCT FROM '1'::jsonb
       OR jsonb_typeof(v_b -> 'gated') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_b -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'completeness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'weightCompleteness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'specificity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'verified') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'helpful') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'trust') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'tier') NOT IN ('string', 'null')
       OR jsonb_typeof(v_b -> 'gaps') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_b -> 'gaps') g
                  WHERE jsonb_typeof(g) IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
    END IF;
    v_score := (v_row ->> 'score')::numeric;
    v_c := (v_b ->> 'completeness')::numeric;
    v_sum := v_c + (v_b ->> 'specificity')::numeric
           + (v_b ->> 'verified')::numeric + (v_b ->> 'helpful')::numeric
           + (v_b ->> 'trust')::numeric;
    v_gaps := ARRAY(SELECT jsonb_array_elements_text(v_b -> 'gaps'));
    v_tier := v_b ->> 'tier';
    IF v_c NOT IN (0, 5, 10, 15, 20, 25, 30, 35)
       OR v_c - (v_b ->> 'weightCompleteness')::numeric NOT IN (0, 5)
       -- 5 off exactly when a review has a photo, no pros and cons, and some completeness
       OR (v_c - (v_b ->> 'weightCompleteness')::numeric = 5)
          IS DISTINCT FROM ('pros_cons' = ANY (v_gaps) AND NOT 'photo' = ANY (v_gaps) AND v_c > 0)
       OR (v_b ->> 'specificity')::numeric NOT IN (0, 5, 12, 17, 20)
       OR (v_b ->> 'verified')::numeric NOT IN (0, 15)
       OR (v_b ->> 'helpful')::numeric NOT BETWEEN 0 AND 20
       OR (v_b ->> 'trust')::numeric NOT BETWEEN 0 AND 10
       OR v_score NOT BETWEEN 0 AND 100
       OR (v_b ->> 'score')::numeric <> v_score
       OR abs(v_sum - v_score) > 0.01
       OR cardinality(v_gaps) <> (SELECT count(DISTINCT g) FROM unnest(v_gaps) g)
       OR NOT v_gaps <@ ARRAY['detail', 'criteria', 'verdict', 'pros_cons', 'criterion_points',
                               'photo', 'verified']
       -- in parentheses: plpgsql ends an IF condition at the first bare THEN
       OR (CASE WHEN (v_b ->> 'gated')::boolean
               THEN v_sum <> 0 OR v_score <> 0 OR v_tier IS NOT NULL OR cardinality(v_gaps) <> 0
               ELSE v_tier IS DISTINCT FROM CASE WHEN v_c < 30 THEN 'basic'
                                                 WHEN v_score >= 70 THEN 'excellent'
                                                 ELSE 'complete' END
           END) THEN
      RAISE EXCEPTION 'row % has values out of range', v_index USING ERRCODE = '22023';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  -- The batch is read straight from p_values in each statement, with no temp table a caller's
  -- session could have prepared: a review listed twice, the last row wins; reviews that do not
  -- exist are skipped by the joins.
  PERFORM 1 FROM rate.reviews r
  WHERE r.id IN (SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(p_values) e)
  ORDER BY r.id
  FOR NO KEY UPDATE;

  INSERT INTO rate.review_values AS rv (review_id, value_score, value_breakdown, updated_at)
  SELECT b.review_id, b.value_score, b.value_breakdown, now()
  FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
               (e ->> 'id')::uuid AS review_id, round((e ->> 'score')::numeric, 2) AS value_score,
               e -> 'breakdown' AS value_breakdown
        FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
        ORDER BY (e ->> 'id')::uuid, n DESC) b
  JOIN rate.reviews r ON r.id = b.review_id
  ORDER BY b.review_id
  ON CONFLICT (review_id) DO UPDATE
    SET value_score = EXCLUDED.value_score,
        value_breakdown = EXCLUDED.value_breakdown,
        updated_at = EXCLUDED.updated_at
    WHERE (rv.value_score, rv.value_breakdown)
          IS DISTINCT FROM (EXCLUDED.value_score, EXCLUDED.value_breakdown);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  UPDATE rate.reviews r
  SET value_tier = b.value_breakdown ->> 'tier'
  FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
               (e ->> 'id')::uuid AS review_id, e -> 'breakdown' AS value_breakdown
        FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
        ORDER BY (e ->> 'id')::uuid, n DESC) b
  WHERE r.id = b.review_id
    AND r.value_tier IS DISTINCT FROM (b.value_breakdown ->> 'tier');

  RETURN v_changed;
END $$;

REVOKE EXECUTE ON FUNCTION rate.store_review_values(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.store_review_values(jsonb) TO service_role, rate_worker;

-- 6. The writer of a review reads its number ---------------------------------------------------
-- Up to 100 review ids; returns the ones the caller wrote (rate.review_authors) that have a
-- value. Anyone else's reviews, and anon, get nothing.
CREATE OR REPLACE FUNCTION rate.my_review_values(p_review_ids uuid[])
RETURNS TABLE (review_id uuid, value_score numeric, value_breakdown jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF cardinality(p_review_ids) > 100 THEN
    RAISE EXCEPTION 'at most 100 review ids per call' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT v.review_id, v.value_score, v.value_breakdown
  FROM rate.review_values v
  JOIN rate.review_authors a ON a.review_id = v.review_id
  WHERE v.review_id = ANY (p_review_ids)
    AND a.author_user_id = v_uid;
END $$;

REVOKE EXECUTE ON FUNCTION rate.my_review_values(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.my_review_values(uuid[]) TO authenticated, service_role;

COMMIT;

-- 7. Masters with values stored before this apply ----------------------------------------------
-- A no-op on the first apply (the table is new). On a re-apply over kept values it brings their
-- masters back in line. Outside the transaction, so it holds no ALTER TABLE lock.
SELECT rate.refresh_rating_extras_of_products(ARRAY(
  SELECT DISTINCT r.product_id
  FROM rate.review_values v JOIN rate.reviews r ON r.id = v.review_id
  WHERE rate.review_completeness_factor(v.value_breakdown) > 1));
