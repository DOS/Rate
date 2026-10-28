-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-28-dos-me-m1-m2-items.sql (DOS/Rate#1150,
-- design section 7 "M1"/"M2" reversibility). Run with the writers paused (importer and Rate
-- Services workers stopped), in one transaction. Re-runnable.
--
-- Never TRUNCATE rate.items: it fails while the FKs exist, and TRUNCATE ... CASCADE would wipe
-- master_products, products and through them price history, reviews and alerts.
-- Data written only by this migration (Items, item_id, variant_key, variant_source) is lost;
-- nothing older depends on it. The two rating functions get their previous bodies back
-- (20261018153000 and 20261018120103), so the old readers keep working.

BEGIN;

-- 1. Triggers first, so the column drops below fire nothing.
DROP TRIGGER IF EXISTS trg_products_refresh_left ON rate.products;
DROP TRIGGER IF EXISTS trg_products_sync_item ON rate.products;
DROP TRIGGER IF EXISTS trg_master_products_move_listings ON rate.master_products;
DROP TRIGGER IF EXISTS trg_master_products_sync_item ON rate.master_products;
DROP TRIGGER IF EXISTS trg_rate_items_set_updated_at ON rate.items;

-- 2. Previous rating bodies (verbatim from the reference migrations).
CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = now()
  FROM (
    SELECT
      round(
        (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      (count(*) FILTER (WHERE r.reviewer_type = 'user'))::INTEGER AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
      -- Reviews excluded from the rating (unanalyzed community reviews,
      -- flagged ones) never count, whatever their weight (20261014033000).
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_up INTEGER;
  v_down INTEGER;
  v_rep INTEGER;
  v_cat TEXT;
  v_verdict TEXT;
  v_inc BOOLEAN;
  v_master UUID;
BEGIN
  SELECT
    count(*) FILTER (WHERE vote = 'up'),
    count(*) FILTER (WHERE vote = 'down'),
    count(*) FILTER (WHERE reported)
  INTO v_up, v_down, v_rep
  FROM rate.review_votes
  WHERE review_id = p_review_id;

  SELECT f.flag_category, f.verdict, COALESCE(f.include_in_rating, true)
  INTO v_cat, v_verdict, v_inc
  FROM rate.review_flags f
  WHERE f.review_id = p_review_id;

  -- Votes cannot lift a review that is excluded from the rating
  -- (20261014033000, relied on by 20261017120000's unanalyzed reviews).
  UPDATE rate.reviews
  SET upvotes = v_up,
      downvotes = v_down,
      report_count = v_rep,
      helpfulness_weight = CASE
        WHEN NOT COALESCE(v_inc, true) THEN 0.00
        ELSE rate.compute_review_weight(
          v_up, v_down, v_rep,
          COALESCE(v_cat, 'authentic'),
          COALESCE(v_verdict, 'unanalyzed')
        )
      END
  WHERE id = p_review_id;

  SELECT p.cluster_id INTO v_master
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id;

  IF v_master IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH priced AS (
    SELECT
      p.price_current AS price,
      COALESCE(NULLIF(p.price_max, 0), p.price_current) AS price_top,
      p.merchant_id,
      (pg_catalog.row_number() OVER (ORDER BY p.price_current, p.id) - 1)::INTEGER AS k,
      (pg_catalog.count(*) OVER ())::INTEGER AS m
    FROM rate.products p
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND p.availability = 'in_stock'
      AND p.price_current > 0
  ),
  judged AS (
    SELECT
      c.price,
      c.price_top,
      c.merchant_id,
      (c.m >= 3 AND c.price < 0.4 * r.price) AS implausible
    FROM priced c
    LEFT JOIN priced r
      ON r.k = CASE WHEN (c.m - 2) / 2 < c.k THEN (c.m - 2) / 2 ELSE (c.m - 2) / 2 + 1 END
  ),
  s AS (
    SELECT
      MIN(j.price) FILTER (WHERE NOT j.implausible) AS min_price,
      MAX(j.price_top) AS max_price,
      COUNT(DISTINCT j.merchant_id)::INTEGER AS merchant_count
    FROM judged j
  )
  UPDATE rate.master_products m
  SET min_price = s.min_price,
      max_price = s.max_price,
      merchant_count = s.merchant_count,
      updated_at = now()
  FROM s
  WHERE m.id = p_master_id
    AND (m.min_price, m.max_price, m.merchant_count)
      IS DISTINCT FROM (s.min_price, s.max_price, s.merchant_count);
$$;

-- 2b. Put back what retire_item_unknown_variant changed (it records it in `metadata`), then
-- recompute every variant's rating and prices with the old bodies, so no pooled Item rating
-- stays mirrored on a variant. Listings that never had a variant (written with
-- RATE_ITEM_MODEL=nullable_variant) keep cluster_id NULL: the old schema cannot say which
-- Item they belong to. Count them first with
--   SELECT count(*) FROM rate.products WHERE cluster_id IS NULL AND item_id IS NOT NULL
--     AND NOT (metadata ? 'retired_unknown_variant');
UPDATE rate.master_products mp
SET status = mp.metadata ->> 'status_before_retire',
    metadata = mp.metadata - 'status_before_retire' - 'retired_by'
WHERE mp.metadata ->> 'retired_by' = 'retire_item_unknown_variant'
  AND mp.metadata ? 'status_before_retire';
UPDATE rate.products p
SET cluster_id = mp.id,
    metadata = p.metadata - 'retired_unknown_variant' - 'variant_source_before_retire'
FROM rate.master_products mp
WHERE p.cluster_id IS NULL
  AND p.metadata ? 'retired_unknown_variant'
  AND mp.id = (p.metadata ->> 'retired_unknown_variant')::uuid
  AND mp.item_id IS NOT DISTINCT FROM p.item_id;
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT m.id FROM rate.master_products m ORDER BY m.id LOOP
    PERFORM rate.refresh_master_market_stats(v_id);
    PERFORM rate.refresh_master_product_rating(v_id);
  END LOOP;
END $$;

-- 3. New functions.
DROP FUNCTION IF EXISTS rate.retire_item_unknown_variant(uuid);
DROP FUNCTION IF EXISTS rate.match_item(text, text, text, real);
DROP FUNCTION IF EXISTS rate.refresh_item_stats(uuid);
DROP FUNCTION IF EXISTS rate.refresh_item_rating(uuid);
DROP FUNCTION IF EXISTS rate.products_refresh_left();
DROP FUNCTION IF EXISTS rate.products_sync_item();
DROP FUNCTION IF EXISTS rate.master_products_move_listings();
DROP FUNCTION IF EXISTS rate.master_products_sync_item();
DROP FUNCTION IF EXISTS rate.item_name_from_master(text);
DROP FUNCTION IF EXISTS rate.item_slug_from_master(text, text);

-- 4. Constraints, indexes and columns on the existing tables.
ALTER TABLE rate.products DROP CONSTRAINT IF EXISTS fk_products_item;
ALTER TABLE rate.products DROP CONSTRAINT IF EXISTS products_variant_source_check;
ALTER TABLE rate.master_products DROP CONSTRAINT IF EXISTS fk_master_products_item;
DO $$
BEGIN
  IF to_regclass('rate.items') IS NOT NULL THEN
    ALTER TABLE rate.items DROP CONSTRAINT IF EXISTS fk_items_default_variant;
  END IF;
END $$;
DROP INDEX IF EXISTS rate.idx_rate_products_item;
DROP INDEX IF EXISTS rate.idx_master_products_item;
DROP INDEX IF EXISTS rate.uq_master_products_item_variant;
ALTER TABLE rate.products DROP COLUMN IF EXISTS variant_source;
ALTER TABLE rate.products DROP COLUMN IF EXISTS item_id;
ALTER TABLE rate.master_products DROP COLUMN IF EXISTS sort_order;
ALTER TABLE rate.master_products DROP COLUMN IF EXISTS variant_key;
ALTER TABLE rate.master_products DROP COLUMN IF EXISTS item_id;

-- 5. The Item table (its policies, grants and indexes go with it).
DROP TABLE IF EXISTS rate.items;

COMMIT;
