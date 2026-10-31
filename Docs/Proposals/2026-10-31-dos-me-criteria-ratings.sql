-- PROPOSAL, NOT APPLIED. DOS-Me migration for phase P2 of the criteria ratings design
-- (DOS/Rate#1543; design Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html, section 3;
-- decisions D2, D3, D9, D10 approved by JOY on 2026-10-31). JOY reviews and applies it through
-- DOS-Me (preview, then beta, then prod). Zero DDL on prod from DOS/Rate.
-- Rollback: 2026-10-31-dos-me-criteria-ratings-rollback.sql.
-- Verification: 2026-10-31-dos-me-criteria-ratings-verify.sql.
-- Replay test: scripts/test-criteria-ratings-proposal.mjs (Docker, never a real database).
--
-- What it adds:
--   rate.reviews         rating_exact (the 0.1 star a criteria review computes), verdict,
--                        criteria_version, value_score, value_breakdown
--   rate.review_points   one pro or con line of a review, optionally for one criterion
--   rate.product_points  the aggregated pro and con lines of a master (written by P5)
--   rate.master_products rating_score (the one rating of D3), rating_weight_sum,
--                        criteria_scores (per criterion, only when D9's thresholds are met)
--   rate.refresh_master_rating_extras(p_master_id) fills the three master columns.
--   rate.refresh_master_product_rating(p_master_id) becomes a wrapper: it runs the body that
--   is live today (renamed refresh_master_product_rating_base, whichever version that is,
--   M1+M2's Item-aware one included) and then the extras, so every existing caller fills the
--   new columns with no change on its side.
--
-- Order: after M0 and M1+M2 if those are still pending. A later migration that replaces
-- rate.refresh_master_product_rating must keep calling rate.refresh_master_rating_extras.
--
-- Idempotent: IF NOT EXISTS everywhere, constraints guarded by pg_constraint, the rename runs
-- only once (guarded by the base function's existence), CREATE OR REPLACE for functions, DROP
-- POLICY IF EXISTS before each policy. One transaction. The backfill at the end writes only
-- the three new master columns.

BEGIN;

-- 1. rate.reviews ----------------------------------------------------------------------------

ALTER TABLE rate.reviews
  ADD COLUMN IF NOT EXISTS rating_exact numeric(2, 1),
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS criteria_version integer,
  ADD COLUMN IF NOT EXISTS value_score numeric(5, 2),
  ADD COLUMN IF NOT EXISTS value_breakdown jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_exact_range') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_rating_exact_range
      CHECK (rating_exact IS NULL OR (rating_exact >= 1 AND rating_exact <= 5));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_verdict_length') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_verdict_length
      CHECK (verdict IS NULL OR char_length(verdict) <= 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_criteria_version_positive') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_criteria_version_positive
      CHECK (criteria_version IS NULL OR criteria_version >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_value_score_range') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_score_range
      CHECK (value_score IS NULL OR (value_score >= 0 AND value_score <= 100));
  END IF;
END $$;

-- 2. rate.review_points ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.review_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES rate.reviews(id) ON DELETE CASCADE,
  -- NULL: a pro or con of the whole review; otherwise a key of
  -- packages/shared-data/src/rules/rating-criteria.ts.
  criterion_key text CHECK (criterion_key IS NULL OR criterion_key ~ '^[a-z_]{2,32}$'),
  kind          text NOT NULL CHECK (kind IN ('pro', 'con')),
  body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 5 AND 150),
  position      smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 19),
  -- Set by the P5 aggregation; a line belongs to at most one cluster.
  cluster_id    uuid,
  -- 'writer' for the review's own text, 'ai' for a line P5 extracts from a marketplace review.
  method        text NOT NULL DEFAULT 'writer' CHECK (method IN ('writer', 'ai')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_points_review_idx ON rate.review_points (review_id);
CREATE INDEX IF NOT EXISTS review_points_cluster_idx ON rate.review_points (cluster_id)
  WHERE cluster_id IS NOT NULL;

-- 3. rate.product_points -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.product_points (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id      uuid NOT NULL REFERENCES rate.master_products(id) ON DELETE CASCADE,
  criterion_key  text CHECK (criterion_key IS NULL OR criterion_key ~ '^[a-z_]{2,32}$'),
  kind           text NOT NULL CHECK (kind IN ('pro', 'con')),
  label          text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 200),
  -- Sum of the trust weights of the distinct writers behind the line, decayed by age.
  support        numeric(8, 2) NOT NULL DEFAULT 0 CHECK (support >= 0),
  reviewer_count integer NOT NULL DEFAULT 0 CHECK (reviewer_count >= 0),
  has_expert     boolean NOT NULL DEFAULT false,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_seen      timestamptz NOT NULL DEFAULT now(),
  method         text NOT NULL DEFAULT 'code' CHECK (method IN ('code', 'ai')),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_points_master_idx
  ON rate.product_points (master_id, kind, support DESC);

-- 4. RLS: public read; service role writes both, the worker writes the aggregate --------------

ALTER TABLE rate.review_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.product_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view review_points" ON rate.review_points;
CREATE POLICY "Public can view review_points" ON rate.review_points FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write review_points" ON rate.review_points;
CREATE POLICY "Service role write review_points" ON rate.review_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view product_points" ON rate.product_points;
CREATE POLICY "Public can view product_points" ON rate.product_points FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write product_points" ON rate.product_points;
CREATE POLICY "Service role write product_points" ON rate.product_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Worker writes product_points" ON rate.product_points;
CREATE POLICY "Worker writes product_points" ON rate.product_points
  FOR ALL TO rate_worker USING (true) WITH CHECK (true);

GRANT SELECT ON rate.review_points, rate.product_points TO anon, authenticated;
GRANT ALL ON rate.review_points, rate.product_points TO service_role;
-- The importer's P5 job writes the aggregate; review lines come only through the review RPC.
GRANT SELECT, INSERT, UPDATE, DELETE ON rate.product_points TO rate_worker;
GRANT SELECT ON rate.review_points TO rate_worker;

-- 5. rate.master_products ----------------------------------------------------------------------

ALTER TABLE rate.master_products
  ADD COLUMN IF NOT EXISTS rating_score numeric(3, 2),
  ADD COLUMN IF NOT EXISTS rating_weight_sum numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_rating_score_range') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT master_products_rating_score_range
      CHECK (rating_score IS NULL OR (rating_score >= 0 AND rating_score <= 5));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_rating_weight_sum_nonneg') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT master_products_rating_weight_sum_nonneg
      CHECK (rating_weight_sum >= 0);
  END IF;
END $$;

-- 6. The extras: one rating (D2, D3) and per-criterion scores (D9) ------------------------------
--
-- The same reviews as rate.refresh_master_product_rating counts: user reviews of the master's
-- crawled listings, crawl or community, included in the rating, with a weight above 0. The
-- star is rating_exact when a criteria review set it, else rating_star. Each weight is capped
-- at 3, as apps/web/src/lib/rate-domain-core.ts computeBayesianRatingSummary does.
--
--   rating_score  = (k * mu + sum(w * star)) / (k + sum(w)),  k = 3, mu = 4.2; NULL with no
--                   weight, so a page shows "no rating yet" instead of the prior.
--   criteria      = the same estimate per criterion key of criteria_ratings, over the reviews
--                   that rated it; kept only with 3 or more reviews and a weight sum of 1.5 or
--                   more (D9). "writers" lets a reader apply the ranking threshold (5).
--                   A Rate user writes one review per product (submit_community_review), so a
--                   review is a writer. The prior mean is 4.2 until per-category means exist.

CREATE OR REPLACE FUNCTION rate.refresh_master_rating_extras(p_master_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT LEAST(3.0, r.helpfulness_weight)::numeric AS w,
           COALESCE(r.rating_exact, r.rating_star)::numeric AS star,
           r.criteria_ratings
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
      AND r.reviewer_type = 'user'
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ),
  overall AS (
    SELECT round(COALESCE(sum(w), 0), 2) AS weight_sum,
           CASE WHEN sum(w) > 0 THEN round((3 * 4.2 + sum(w * star)) / (3 + sum(w)), 2) END AS score
    FROM eligible
    WHERE star BETWEEN 1 AND 5
  ),
  per_criterion AS (
    SELECT c.key,
           count(*) AS writers,
           round(sum(e.w), 2) AS weight_sum,
           round((3 * 4.2 + sum(e.w * (c.value #>> '{}')::numeric)) / (3 + sum(e.w)), 2) AS score
    FROM eligible e
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(e.criteria_ratings) = 'object' THEN e.criteria_ratings
           ELSE '{}'::jsonb END
    ) AS c(key, value)
    WHERE jsonb_typeof(c.value) = 'number'
      AND (c.value #>> '{}')::numeric BETWEEN 1 AND 5
    GROUP BY c.key
  )
  UPDATE rate.master_products m
  SET rating_score = o.score,
      rating_weight_sum = o.weight_sum,
      criteria_scores = COALESCE(
        (SELECT jsonb_object_agg(pc.key, jsonb_build_object(
                  'score', pc.score, 'weight_sum', pc.weight_sum, 'writers', pc.writers))
         FROM per_criterion pc
         WHERE pc.writers >= 3 AND pc.weight_sum >= 1.5),
        '{}'::jsonb)
  FROM overall o
  WHERE m.id = p_master_id;
$$;

REVOKE EXECUTE ON FUNCTION rate.refresh_master_rating_extras(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_rating_extras(uuid) TO service_role, rate_worker;

-- 7. Wrap the live refresh ---------------------------------------------------------------------
--
-- Renaming keeps the live body, its owner, SECURITY DEFINER and grants, whatever version it
-- is. Only on the first run: a re-run finds the base and leaves it.

DO $$
BEGIN
  IF to_regprocedure('rate.refresh_master_product_rating_base(uuid)') IS NULL THEN
    ALTER FUNCTION rate.refresh_master_product_rating(uuid)
      RENAME TO refresh_master_product_rating_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM rate.refresh_master_product_rating_base(p_master_id);
  PERFORM rate.refresh_master_rating_extras(p_master_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(uuid) TO service_role, rate_worker;
REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating_base(uuid) FROM PUBLIC, anon, authenticated;

-- 8. Backfill: every master gets its rating_score and criteria_scores once. Re-runnable.

SELECT rate.refresh_master_rating_extras(id) FROM rate.master_products;

COMMIT;
