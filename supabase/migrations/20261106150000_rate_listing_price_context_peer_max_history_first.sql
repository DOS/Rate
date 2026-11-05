-- Rate: market reference and history age for the inflated_fake_sale signal
-- (DOS/Rate-Services#582, decided by JOY 2026-11-04).
--
-- Purpose: the Rate-Services auditors flag `inflated_fake_sale` when a listing's
-- struck-through price is far above the median of its own 60-day price points.
-- A retailer that always sells below the manufacturer's list price (MSRP) and
-- strikes the list price through therefore trips the signal after one week at a
-- flat price, although the struck price is what the official stores sell at.
-- The auditors need two more facts per listing, both computed here because
-- PostgREST cuts max_rows (the reason 20261018160000 moved the aggregates to SQL):
--
--   peer_reference_max  the highest current price among the OTHER priced,
--                       in-stock listings of the same cluster, official
--                       merchants first, any merchant when the cluster has no
--                       other official listing. The struck price is no inflated
--                       original price when it does not exceed this by more than
--                       the auditor's margin (3%).
--   history_first_at    the oldest price point inside the history window. The
--                       auditor only concludes once it is at least 14 days old.
--
-- rate.listing_price_context(...) gains the two columns at the END of its
-- result. A function cannot change its result type with CREATE OR REPLACE, so
-- this drops and recreates it with the same signature and re-grants EXECUTE
-- (DROP removes the grants): service_role as in 20261018160000, rate_worker as
-- in 20261018183000. Both steps run in the migration's transaction, so no caller
-- sees the function missing. The body is that of 20261020230000 plus the two
-- columns, with the aggregates of the peers and median expressions schema-qualified
-- like those of the history expression (pg_catalog is searched anyway, so the
-- result is the same); nothing else changes. Nothing depends on the function (no view,
-- trigger or other function), so the DROP needs no CASCADE and fails loudly if
-- one appears.
--
-- Idempotent: DROP FUNCTION IF EXISTS, then the full definition and the grants
-- again; a second run leaves the same function. Touches the `rate` schema only.

DROP FUNCTION IF EXISTS rate.listing_price_context(UUID, INTEGER, INTEGER, UUID[]);

CREATE FUNCTION rate.listing_price_context(
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
  history_max NUMERIC,
  -- Maximum price among the OTHER priced, in-stock listings of the cluster,
  -- chosen like peer_reference_min: official merchants first, any merchant when
  -- the cluster has no other official listing. NULL when no other listing of
  -- the cluster is in stock.
  peer_reference_max NUMERIC,
  -- recorded_at of the oldest crawled price point inside the history window
  -- (the same points history_count counts); NULL when there is none.
  history_first_at TIMESTAMPTZ
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
    h.max_price,
    peers.peer_reference_max,
    h.first_at
  FROM rate.products pg
  JOIN rate.merchants m ON m.id = pg.merchant_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        pg_catalog.min(o.price_current) FILTER (WHERE o.id <> pg.id AND om.is_official),
        pg_catalog.min(o.price_current) FILTER (WHERE o.id <> pg.id)
      ) AS peer_reference_min,
      pg_catalog.min(o.price_current) FILTER (WHERE om.is_official) AS cluster_official_min,
      COALESCE(
        pg_catalog.max(o.price_current) FILTER (WHERE o.id <> pg.id AND om.is_official),
        pg_catalog.max(o.price_current) FILTER (WHERE o.id <> pg.id)
      ) AS peer_reference_max
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
      pg_catalog.percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.price) AS median_price,
      pg_catalog.min(ph.price) AS min_price,
      pg_catalog.max(ph.price) AS max_price,
      pg_catalog.min(ph.recorded_at) AS first_at
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rate_worker') THEN
    GRANT EXECUTE ON FUNCTION rate.listing_price_context(UUID, INTEGER, INTEGER, UUID[]) TO rate_worker;
  END IF;
END $$;
