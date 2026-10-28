-- Rate: listing availability (DOS/Rate-Services#123)
--
-- Purpose: a retailer page can load fine and state that the item is sold out
-- or discontinued (schema.org OutOfStock / Discontinued, TGDD flight data with
-- no buyable price). The Rate-Services worker completes such crawl jobs as
-- `listing_unavailable` without ingesting anything, so until now the listing
-- kept its last in-stock price and kept setting the master's min_price.
--
-- 1. rate.products.availability ('in_stock' | 'out_of_stock' | 'discontinued')
--    and availability_checked_at. Existing listings were ingested with a price,
--    so they default to 'in_stock'.
-- 2. rate.mark_listing_unavailable(job, availability): called by the worker for
--    a running job whose page reports the item unavailable. Marks the crawled
--    listing of that job (no-op returning NULL for a discovery job that has no
--    listing yet) and refreshes its master's market stats.
-- 3. rate.stamp_crawl_provenance marks the listing 'in_stock' again: it only
--    runs after a successful ingest with a price. The ingest refreshed the
--    master's stats while the listing was still unavailable, so a restock
--    refreshes them again.
-- 4. rate.refresh_master_market_stats only counts in-stock listings.
-- 5. rate.listing_price_context ignores sold-out peers in its price floors.
--
-- rate.v_products_with_merchant_trust is left unchanged: appending columns to it
-- would make re-running 20261018153000 fail ("cannot drop columns from view").
-- Public reads see the new columns on rate.products under its existing policy.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded constraint, CREATE OR REPLACE.
-- Touches the `rate` schema only.

-- 1. Columns -----------------------------------------------------------------
-- A constant default is a catalog-only change on PG 11+, but ADD COLUMN still
-- takes ACCESS EXCLUSIVE: give up fast instead of queueing behind a long
-- transaction and blocking every read. The CHECK is added NOT VALID and then
-- validated; within the migration's transaction the scan still runs under the
-- ADD COLUMN lock, which is fine for a table this size.

SET lock_timeout = '5s';

ALTER TABLE rate.products ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'in_stock';
ALTER TABLE rate.products ADD COLUMN IF NOT EXISTS availability_checked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rate.products'::regclass AND conname = 'products_availability_check'
  ) THEN
    ALTER TABLE rate.products
      ADD CONSTRAINT products_availability_check
      CHECK (availability IN ('in_stock', 'out_of_stock', 'discontinued')) NOT VALID;
  END IF;
END $$;

RESET lock_timeout;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rate.products'::regclass
      AND conname = 'products_availability_check'
      AND NOT convalidated
  ) THEN
    ALTER TABLE rate.products VALIDATE CONSTRAINT products_availability_check;
  END IF;
END $$;

COMMENT ON COLUMN rate.products.availability IS
  'Stock state the retailer page last reported: in_stock (priced crawl), out_of_stock or discontinued (set by rate.mark_listing_unavailable).';
COMMENT ON COLUMN rate.products.availability_checked_at IS
  'When availability was last confirmed by a crawl job; NULL for listings not crawled since the column was added.';

-- 2. Worker RPC ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION rate.mark_listing_unavailable(p_job_id UUID, p_availability TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id UUID;
  v_cluster_id UUID;
BEGIN
  IF p_job_id IS NULL OR p_availability IS NULL OR p_availability NOT IN ('out_of_stock', 'discontinued') THEN
    RAISE EXCEPTION 'job id and availability out_of_stock|discontinued are required' USING ERRCODE = '22023';
  END IF;

  -- Only a job that is currently being processed may report availability.
  IF NOT EXISTS (
    SELECT 1 FROM rate.crawl_jobs WHERE id = p_job_id AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'crawl job % is not running', p_job_id USING ERRCODE = 'P0002';
  END IF;

  -- The job's own listing: same platform, and the same item id, or the same
  -- URL when the job carries no item id (URL-only discovery jobs). One row:
  -- (platform, platform_item_id) is unique, and URL matches prefer the newest.
  SELECT p.id, p.cluster_id
  INTO v_product_id, v_cluster_id
  FROM rate.products p
  JOIN rate.crawl_jobs j ON j.id = p_job_id
  WHERE p.origin = 'crawl'
    AND p.platform = j.platform
    AND (
      (j.platform_item_id IS NOT NULL AND p.platform_item_id = j.platform_item_id)
      OR (j.platform_item_id IS NULL AND j.target_url IS NOT NULL AND p.url = j.target_url)
    )
  ORDER BY p.updated_at DESC NULLS LAST, p.id
  LIMIT 1;

  -- A discovery job for a listing that was never ingested has nothing to mark.
  IF v_product_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE rate.products
  SET availability = p_availability,
      availability_checked_at = now(),
      last_crawled_at = now(),
      last_crawl_job_id = p_job_id
  WHERE id = v_product_id;

  IF v_cluster_id IS NOT NULL THEN
    PERFORM rate.refresh_master_market_stats(v_cluster_id);
  END IF;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION rate.mark_listing_unavailable(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.mark_listing_unavailable(UUID, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rate_worker') THEN
    GRANT EXECUTE ON FUNCTION rate.mark_listing_unavailable(UUID, TEXT) TO rate_worker;
  END IF;
END $$;

-- 3. A priced crawl puts the listing back in stock --------------------------
-- Body as in 20261018153000, plus the availability columns in the listing update
-- and a stats refresh when that update is a restock.

CREATE OR REPLACE FUNCTION rate.stamp_crawl_provenance(p_job_id UUID, p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prices INTEGER;
  v_reviews INTEGER;
  v_prev_availability TEXT;
  v_cluster_id UUID;
BEGIN
  IF p_job_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'job id and product id are required' USING ERRCODE = '22023';
  END IF;

  -- Only a job that is currently being processed may stamp rows.
  IF NOT EXISTS (
    SELECT 1 FROM rate.crawl_jobs WHERE id = p_job_id AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'crawl job % is not running', p_job_id USING ERRCODE = 'P0002';
  END IF;

  -- Locked so a concurrent mark_listing_unavailable cannot slip between this
  -- read and the update below and leave the restock refresh skipped.
  SELECT p.availability, p.cluster_id
  INTO v_prev_availability, v_cluster_id
  FROM rate.products p
  WHERE p.id = p_product_id
  FOR UPDATE;

  -- The job must be for this listing: same platform, and the same item id or
  -- URL when the job carries them (URL-only discovery jobs have no item id).
  -- The job ingested a price, so the listing is in stock.
  UPDATE rate.products p
  SET last_crawled_at = now(),
      last_crawl_job_id = p_job_id,
      availability = 'in_stock',
      availability_checked_at = now()
  FROM rate.crawl_jobs j
  WHERE p.id = p_product_id
    AND p.origin = 'crawl'
    AND j.id = p_job_id
    AND j.platform = p.platform
    AND (
      j.platform_item_id = p.platform_item_id
      OR j.target_url = p.url
      OR j.platform_item_id IS NULL
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'crawled listing % not found for job %', p_product_id, p_job_id USING ERRCODE = 'P0002';
  END IF;

  -- The ingest refreshed the master's stats before this stamp, while the
  -- listing was still out of stock and so not counted.
  IF v_prev_availability IS DISTINCT FROM 'in_stock' AND v_cluster_id IS NOT NULL THEN
    PERFORM rate.refresh_master_market_stats(v_cluster_id);
  END IF;

  -- Rows this job just wrote: the dedupe index keeps one live job per
  -- listing, and one job runs for minutes, so the 1h window cannot reach a
  -- previous crawl's rows (those are already stamped or predate this column).
  UPDATE rate.price_history
  SET crawl_job_id = p_job_id
  WHERE product_id = p_product_id
    AND crawl_job_id IS NULL
    AND origin = 'crawl'
    AND recorded_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_prices = ROW_COUNT;

  UPDATE rate.reviews
  SET first_seen_job_id = p_job_id
  WHERE product_id = p_product_id
    AND first_seen_job_id IS NULL
    AND origin = 'crawl'
    AND observed_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  RETURN jsonb_build_object('price_points', v_prices, 'reviews', v_reviews);
END;
$$;

-- 4. Market stats count in-stock listings only -------------------------------
-- Body as in 20261018153000, plus the availability filter.

CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET min_price = s.min_price,
      max_price = s.max_price,
      merchant_count = COALESCE(s.merchant_count, 0),
      updated_at = now()
  FROM (
    SELECT
      MIN(p.price_current) FILTER (WHERE p.price_current > 0) AS min_price,
      MAX(COALESCE(NULLIF(p.price_max, 0), p.price_current)) FILTER (WHERE p.price_current > 0) AS max_price,
      COUNT(DISTINCT p.merchant_id) FILTER (WHERE p.price_current > 0)::INTEGER AS merchant_count
    FROM rate.products p
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND p.availability = 'in_stock'
  ) s
  WHERE m.id = p_master_id;
$$;

-- 5. Sold-out peers no longer set the auditors' price floors ----------------
-- Body as in 20261018160000, plus the availability filter on peers.

CREATE OR REPLACE FUNCTION rate.listing_price_context(
  p_after UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 500,
  p_history_days INTEGER DEFAULT 60,
  p_merchant_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  cluster_id UUID,
  merchant_id UUID,
  merchant_is_official BOOLEAN,
  platform TEXT,
  title TEXT,
  price_current NUMERIC,
  price_original NUMERIC,
  -- Minimum price among the OTHER priced, in-stock listings of the cluster,
  -- official merchants first, any merchant when the cluster has no other
  -- official listing (MerchantRiskAuditor.computePeerReferenceMinPrice).
  peer_reference_min NUMERIC,
  -- Minimum official-merchant price of the cluster's in-stock listings, this
  -- listing included while it is in stock (PriceAnomalyAuditor.computeOfficialMinByCluster).
  cluster_official_min NUMERIC,
  history_count INTEGER,
  history_avg NUMERIC,
  history_median NUMERIC,
  history_min NUMERIC,
  history_max NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  -- Index-friendly predicates: no "param IS NULL OR ..." (which forces a
  -- scan in a generic plan); the nil uuid sorts before every real id.
  v_after UUID := COALESCE(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
  v_since TIMESTAMPTZ := pg_catalog.now() - pg_catalog.make_interval(days => GREATEST(COALESCE(p_history_days, 60), 1));
  v_page UUID[];
BEGIN
  IF p_merchant_ids IS NULL THEN
    SELECT pg_catalog.array_agg(x.id ORDER BY x.id) INTO v_page
    FROM (
      SELECT p.id
      FROM rate.products p
      WHERE p.id > v_after
        AND p.origin = 'crawl'
        AND p.price_current > 0
      ORDER BY p.id
      LIMIT v_limit
    ) x;
  ELSE
    SELECT pg_catalog.array_agg(x.id ORDER BY x.id) INTO v_page
    FROM (
      SELECT p.id
      FROM rate.products p
      WHERE p.merchant_id = ANY (p_merchant_ids)
        AND p.id > v_after
        AND p.origin = 'crawl'
        AND p.price_current > 0
      ORDER BY p.id
      LIMIT v_limit
    ) x;
  END IF;

  IF v_page IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pg.id,
    pg.cluster_id,
    pg.merchant_id,
    COALESCE(m.is_official, false),
    pg.platform,
    pg.title,
    pg.price_current,
    pg.price_original,
    peers.peer_reference_min,
    peers.cluster_official_min,
    COALESCE(h.n, 0)::INTEGER,
    h.avg_price,
    h.median_price::NUMERIC,
    h.min_price,
    h.max_price
  FROM rate.products pg
  JOIN rate.merchants m ON m.id = pg.merchant_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        MIN(o.price_current) FILTER (WHERE o.id <> pg.id AND om.is_official),
        MIN(o.price_current) FILTER (WHERE o.id <> pg.id)
      ) AS peer_reference_min,
      MIN(o.price_current) FILTER (WHERE om.is_official) AS cluster_official_min
    FROM rate.products o
    JOIN rate.merchants om ON om.id = o.merchant_id
    WHERE pg.cluster_id IS NOT NULL
      AND o.cluster_id = pg.cluster_id
      AND o.origin = 'crawl'
      AND o.price_current > 0
      AND o.availability = 'in_stock'
  ) peers ON true
  LEFT JOIN LATERAL (
    SELECT
      pg_catalog.count(*) AS n,
      pg_catalog.avg(ph.price) AS avg_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.price) AS median_price,
      pg_catalog.min(ph.price) AS min_price,
      pg_catalog.max(ph.price) AS max_price
    FROM rate.price_history ph
    WHERE ph.product_id = pg.id
      AND ph.origin = 'crawl'
      AND ph.price > 0
      AND ph.recorded_at >= v_since
  ) h ON true
  WHERE pg.id = ANY (v_page)
  ORDER BY pg.id;
END;
$$;
