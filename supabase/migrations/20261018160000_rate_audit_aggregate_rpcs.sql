-- =============================================================================
-- Migration: 20261018160000_rate_audit_aggregate_rpcs.sql
-- Purpose (Rate audit C2): compute the Rate-Services auditors' aggregates in
-- SQL instead of pulling capped pages of products, reviews and price history
-- into Node. PostgREST clamps every read to max_rows, so the auditors used
-- arbitrary subsets of the catalog and then wrote public risk scores.
--
--   rate.listing_price_context  - one row per priced, crawled listing with its
--     peer price floors and price-history statistics; keyset paged by id.
--   rate.merchant_review_counts - review classes per merchant, the same
--     classification as MerchantRiskAuditor; reviews that were never
--     analyzed (no review_flags row, or verdict 'unanalyzed') are pending,
--     not authentic.
--
-- Both are STABLE, SECURITY INVOKER and only executable by service_role (the
-- auditors' role), and only use crawled listings (origin, 20261018153000).
-- listing_price_context is plpgsql so each branch gets an index-backed plan
-- (keyset on the products primary key, or the merchant_id index).
-- =============================================================================

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
  -- Minimum price among the OTHER priced listings of the cluster, official
  -- merchants first, any merchant when the cluster has no other official
  -- listing (MerchantRiskAuditor.computePeerReferenceMinPrice).
  peer_reference_min NUMERIC,
  -- Minimum official-merchant price of the cluster, this listing included
  -- (PriceAnomalyAuditor.computeOfficialMinByCluster).
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

REVOKE ALL ON FUNCTION rate.listing_price_context(UUID, INTEGER, INTEGER, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.listing_price_context(UUID, INTEGER, INTEGER, UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION rate.merchant_review_counts(p_merchant_ids UUID[])
RETURNS TABLE (
  merchant_id UUID,
  total_reviews INTEGER,
  authentic_count INTEGER,
  seeding_count INTEGER,
  coin_spam_count INTEGER,
  pending_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH classified AS (
    SELECT
      p.merchant_id,
      f.review_id IS NULL AS unflagged,
      f.verdict,
      NULLIF(f.flag_category, '') AS flag_category,
      lower(COALESCE(NULLIF(f.flag_category, ''), f.verdict, '')) AS cat,
      COALESCE(f.fake_probability, 0) AS fake_probability
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    LEFT JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.merchant_id = ANY (p_merchant_ids)
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
  ),
  labelled AS (
    SELECT
      merchant_id,
      CASE
        -- Not analyzed yet (no verdict row, or the community 'unanalyzed'
        -- placeholder): neither authentic nor seeding.
        -- A reserved re-analysis also resets verdict to 'unanalyzed' but keeps
        -- the previous flag_category: a review already flagged keeps counting
        -- as flagged; only one with no classification yet is pending.
        WHEN unflagged OR (verdict = 'unanalyzed' AND COALESCE(flag_category, 'authentic') = 'authentic') THEN 'pending'
        WHEN cat IN ('seeding_fake', 'fake') THEN 'seeding'
        WHEN cat = 'low_value_coin_spam' THEN 'coin_spam'
        WHEN cat IN ('authentic', 'competitor_sabotage', 'review_bombing') THEN 'authentic'
        WHEN fake_probability >= 0.65 THEN 'seeding'
        ELSE 'authentic'
      END AS label
    FROM classified
  )
  SELECT
    merchant_id,
    (count(*) FILTER (WHERE label <> 'pending'))::INTEGER,
    (count(*) FILTER (WHERE label = 'authentic'))::INTEGER,
    (count(*) FILTER (WHERE label = 'seeding'))::INTEGER,
    (count(*) FILTER (WHERE label = 'coin_spam'))::INTEGER,
    (count(*) FILTER (WHERE label = 'pending'))::INTEGER
  FROM labelled
  GROUP BY merchant_id;
$$;

REVOKE ALL ON FUNCTION rate.merchant_review_counts(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.merchant_review_counts(UUID[]) TO service_role;

-- The peer-floor lateral scans one cluster at a time.
CREATE INDEX IF NOT EXISTS idx_rate_products_cluster_crawl_priced
  ON rate.products (cluster_id, price_current)
  WHERE origin = 'crawl' AND price_current > 0;
