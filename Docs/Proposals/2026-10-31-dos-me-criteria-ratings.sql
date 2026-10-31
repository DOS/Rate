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
--   rate.master_rating_extras(p_master_id) computes the three master columns (read-only);
--   rate.refresh_master_rating_extras(p_master_id) writes them, to the master or, once M1+M2
--   is applied, to every variant of its Item (the pooled rating, like refresh_item_rating).
--   Triggers on rate.reviews, rate.review_flags and rate.master_products keep them current.
--   No existing function is replaced or renamed.
--
-- Order: before or after M0 and M1+M2; the replay test applies it both ways, and through the
-- M1+M2 rollback.
--
-- Idempotent: IF NOT EXISTS everywhere, constraints guarded by pg_constraint, CREATE OR
-- REPLACE for functions, DROP ... IF EXISTS before each policy and trigger. Two transactions:
-- the schema change, then the backfill (section 8), which writes only the three new master
-- columns of reviewed masters.

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
      CHECK (rating_exact IS NULL OR (rating_exact >= 1 AND rating_exact <= 5)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_verdict_length') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_verdict_length
      CHECK (verdict IS NULL OR char_length(verdict) <= 300) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_criteria_version_positive') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_criteria_version_positive
      CHECK (criteria_version IS NULL OR criteria_version >= 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_value_score_range') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_value_score_range
      CHECK (value_score IS NULL OR (value_score >= 0 AND value_score <= 100)) NOT VALID;
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
  ADD COLUMN IF NOT EXISTS rating_score numeric(4, 3),
  ADD COLUMN IF NOT EXISTS rating_weight_sum numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_rating_score_range') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT master_products_rating_score_range
      CHECK (rating_score IS NULL OR (rating_score >= 0 AND rating_score <= 5)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_rating_weight_sum_nonneg') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT master_products_rating_weight_sum_nonneg
      CHECK (rating_weight_sum >= 0) NOT VALID;
  END IF;
END $$;

-- 6. The rating and criteria scores of a master (D2, D3, D9) -----------------------------------
--
-- The reviews rate.refresh_master_product_rating counts: user reviews of crawled listings,
-- crawl or community, included in the rating, with a weight above 0. Their scope follows the
-- live refresh: the master's own listings (cluster_id) before M1+M2, the whole Item's listings
-- (item_id) once the master belongs to an Item, so every variant shows the Item's pooled
-- rating, as refresh_item_rating does for user_rating_weighted. The item_id columns are read
-- dynamically, so the same functions work with and without M1+M2.
--
--   rating_score  = (k * mu + sum(w * star)) / (k + sum(w)), k = 3, mu = 4.2, each weight capped
--                   at 3 and the star = rating_exact when a criteria review set it, else
--                   rating_star (apps/web/src/lib/rate-domain-core.ts computeBayesianRatingSummary).
--                   NULL with no weight, so a page shows "no rating yet" instead of the prior.
--                   Stored at 3 decimals (scores too), so a page rounds once, to 1 decimal.
--   criteria      = the same estimate per criterion of criteria_ratings, over the reviews that
--                   rated it with a number from 1 to 5 under a key shaped like the shared-data
--                   keys (^[a-z_]{2,32}$); kept only with 3 or more reviews and a weight sum of
--                   1.5 or more (D9). "writers" lets a reader apply the ranking threshold (5). A
--                   Rate user writes one review per product, so a review is a writer. The prior
--                   mean is 4.2 for every criterion until per-category means exist.

-- The Item a master belongs to, or NULL (always NULL before M1+M2).
CREATE OR REPLACE FUNCTION rate.master_rating_item(p_master_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
             WHERE attrelid = 'rate.master_products'::pg_catalog.regclass
               AND attname = 'item_id' AND NOT attisdropped) THEN
    EXECUTE 'SELECT item_id FROM rate.master_products WHERE id = $1' INTO v_item USING p_master_id;
  END IF;
  RETURN v_item;
END $$;

-- What the master's rating columns should hold. Read-only: the verify file compares it with
-- the stored columns.
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
              WHERE pc.writers >= 3 AND pc.weight_sum >= 1.5),
             '{}'::jsonb)
    FROM overall o
  $q$, CASE WHEN v_item IS NULL THEN 'p.cluster_id' ELSE 'p.item_id' END)
  USING COALESCE(v_item, p_master_id);
END $$;

-- Writes them, to the master or to every variant of its Item, only where they changed.
CREATE OR REPLACE FUNCTION rate.refresh_master_rating_extras(p_master_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item uuid := rate.master_rating_item(p_master_id);
  v_score numeric;
  v_weight numeric;
  v_criteria jsonb;
BEGIN
  SELECT x.rating_score, x.rating_weight_sum, x.criteria_scores
  INTO v_score, v_weight, v_criteria
  FROM rate.master_rating_extras(p_master_id) x;
  -- Variants in id order, skipping one another transaction holds, as refresh_item_rating
  -- does: that transaction is refreshing the same Item and writes when it gets there, so two
  -- refreshes of sibling variants never wait on each other (no deadlock).
  EXECUTE format($q$
    UPDATE rate.master_products m
    SET rating_score = $2, rating_weight_sum = $3, criteria_scores = $4
    WHERE m.id IN (
      SELECT mp.id FROM rate.master_products mp
      WHERE %s = $1
        AND (mp.rating_score, mp.rating_weight_sum, mp.criteria_scores)
            IS DISTINCT FROM ($2, $3, $4)
      ORDER BY mp.id
      FOR UPDATE SKIP LOCKED)
  $q$, CASE WHEN v_item IS NULL THEN 'mp.id' ELSE 'mp.item_id' END)
  USING COALESCE(v_item, p_master_id), v_score, v_weight, v_criteria;
END $$;

REVOKE EXECUTE ON FUNCTION rate.master_rating_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.master_rating_extras(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.refresh_master_rating_extras(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.master_rating_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.master_rating_extras(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_master_rating_extras(uuid) TO service_role;

-- 7. Keep them current: triggers on what they read --------------------------------------------
--
-- No refresh function is replaced or renamed, so a later CREATE OR REPLACE of
-- refresh_master_product_rating or refresh_item_rating (M1+M2, its rollback, a hotfix) cannot
-- drop these columns' updates. The triggers fire on:
--   rate.reviews       every insert, update and delete (star, exact star, criteria, weight)
--   rate.review_flags  every insert, update and delete (include_in_rating)
--   rate.master_products a change of user_rating_weighted or authentic_review_count, which the
--                      live refresh writes after a listing moves between masters or Items
-- Statement-level with transition tables for the two review tables, and only rows whose rating
-- inputs changed count, so a re-crawl that rewrites reviews unchanged refreshes nothing. A bulk
-- flag import still refreshes a master once per flag row: the existing trg_review_flags_sync_weight
-- updates rate.reviews one row at a time (20261014033000).

-- The masters whose ratings a set of listings feeds: each listing's master, and once M1+M2 is
-- in, one variant of the Item of a listing with no variant (cluster_id NULL, item_id set).
-- Each Item is refreshed once, whichever of its variants comes first.
CREATE OR REPLACE FUNCTION rate.refresh_rating_extras_of_products(p_products uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_masters uuid[];
  v_extra uuid[];
  v_master uuid;
  v_item uuid;
  v_done uuid[] := '{}';
BEGIN
  IF p_products IS NULL OR cardinality(p_products) = 0 THEN
    RETURN;
  END IF;
  v_masters := ARRAY(SELECT DISTINCT p.cluster_id FROM rate.products p
                     WHERE p.id = ANY (p_products) AND p.cluster_id IS NOT NULL);
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
             WHERE attrelid = 'rate.products'::pg_catalog.regclass
               AND attname = 'item_id' AND NOT attisdropped) THEN
    EXECUTE $q$
      SELECT ARRAY(
        SELECT DISTINCT ON (p.item_id) m.id
        FROM rate.products p
        JOIN rate.master_products m ON m.item_id = p.item_id
        WHERE p.id = ANY ($1) AND p.cluster_id IS NULL AND p.item_id IS NOT NULL
        ORDER BY p.item_id, m.id)
    $q$ INTO v_extra USING p_products;
    v_masters := v_masters || v_extra;
  END IF;
  FOR v_master IN SELECT DISTINCT unnest(v_masters) ORDER BY 1 LOOP
    v_item := rate.master_rating_item(v_master);
    IF v_item IS NOT NULL THEN
      CONTINUE WHEN v_item = ANY (v_done);
      v_done := v_done || v_item;
    END IF;
    PERFORM rate.refresh_master_rating_extras(v_master);
  END LOOP;
END $$;

-- Only rows whose rating inputs changed count, so a re-crawl that rewrites a review unchanged
-- (ON CONFLICT DO UPDATE) refreshes nothing.
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

CREATE OR REPLACE FUNCTION rate.review_flags_refresh_rating_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id FROM changed_new f JOIN rate.reviews r ON r.id = f.review_id));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id
      FROM changed_new n JOIN changed_old o ON o.review_id = n.review_id
      JOIN rate.reviews r ON r.id = n.review_id
      WHERE n.include_in_rating IS DISTINCT FROM o.include_in_rating));
  ELSE
    -- A flag deleted with its review (ON DELETE CASCADE) finds no review here; the reviews
    -- trigger refreshes that master.
    PERFORM rate.refresh_rating_extras_of_products(ARRAY(
      SELECT r.product_id FROM changed_old f JOIN rate.reviews r ON r.id = f.review_id));
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION rate.master_products_refresh_rating_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM rate.refresh_master_rating_extras(NEW.id);
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION rate.refresh_rating_extras_of_products(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.reviews_refresh_rating_extras() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.review_flags_refresh_rating_extras() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.master_products_refresh_rating_extras() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reviews_rating_extras_ins ON rate.reviews;
CREATE TRIGGER trg_reviews_rating_extras_ins AFTER INSERT ON rate.reviews
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.reviews_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_reviews_rating_extras_upd ON rate.reviews;
CREATE TRIGGER trg_reviews_rating_extras_upd AFTER UPDATE ON rate.reviews
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.reviews_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_reviews_rating_extras_del ON rate.reviews;
CREATE TRIGGER trg_reviews_rating_extras_del AFTER DELETE ON rate.reviews
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION rate.reviews_refresh_rating_extras();

DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_ins ON rate.review_flags;
CREATE TRIGGER trg_review_flags_rating_extras_ins AFTER INSERT ON rate.review_flags
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_flags_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_upd ON rate.review_flags;
CREATE TRIGGER trg_review_flags_rating_extras_upd AFTER UPDATE ON rate.review_flags
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_flags_refresh_rating_extras();
DROP TRIGGER IF EXISTS trg_review_flags_rating_extras_del ON rate.review_flags;
CREATE TRIGGER trg_review_flags_rating_extras_del AFTER DELETE ON rate.review_flags
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION rate.review_flags_refresh_rating_extras();

DROP TRIGGER IF EXISTS trg_master_products_rating_extras ON rate.master_products;
CREATE TRIGGER trg_master_products_rating_extras
  AFTER UPDATE OF user_rating_weighted, authentic_review_count ON rate.master_products
  FOR EACH ROW
  WHEN ((OLD.user_rating_weighted, OLD.authentic_review_count)
        IS DISTINCT FROM (NEW.user_rating_weighted, NEW.authentic_review_count))
  EXECUTE FUNCTION rate.master_products_refresh_rating_extras();

COMMIT;

-- 8. Backfill, in its own transaction after the schema change commits, so the ALTER TABLE
-- locks are already released and only the touched master rows are locked. Masters with no
-- counted review already hold the right values (NULL, 0, {}) from the column defaults.
-- Re-runnable; it writes only rows whose values differ. A catalog of many thousand reviewed
-- masters can run it in id ranges instead.

-- The CHECKs above were added NOT VALID (no scan under the ACCESS EXCLUSIVE lock); validating
-- them here scans each table under a lock that lets reads and writes go on.
BEGIN;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_rating_exact_range;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_verdict_length;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_criteria_version_positive;
ALTER TABLE rate.reviews VALIDATE CONSTRAINT reviews_value_score_range;
ALTER TABLE rate.master_products VALIDATE CONSTRAINT master_products_rating_score_range;
ALTER TABLE rate.master_products VALIDATE CONSTRAINT master_products_rating_weight_sum_nonneg;
SELECT rate.refresh_master_rating_extras(m.id)
FROM rate.master_products m
WHERE m.authentic_review_count > 0 OR m.user_rating_weighted > 0
ORDER BY m.id;
COMMIT;
