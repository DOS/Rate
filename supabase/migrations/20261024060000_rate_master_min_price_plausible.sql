-- Rate: a bait-price listing no longer sets a master's min_price (DOS/Rate#802)
--
-- Purpose: a listing far below every other store's price for the same model
-- is almost never a real deal: it is a counterfeit, an accessory or a bait
-- listing. rate.vn showed the Samsung Galaxy Buds3 Pro "from 723,269 VND" on
-- catalogue cards, compare and the public API while FPT Shop, TGDD and
-- CellphoneS sold it for 3.03-3.69 M. The product page already ignores such
-- listings (DOS/Rate#797, apps/web/src/lib/offer-plausibility.ts); the stored
-- min_price did not. JOY approved this migration (2026-10-24).
--
-- 1. rate.refresh_master_market_stats leaves implausibly low listings out of
--    min_price with the web rule: with at least 3 priced listings, a listing
--    below 40% of the lower median of the OTHER listings is implausible.
--    The lower median of the m - 1 others is position L = floor((m - 2) / 2)
--    of the others, which is position L of the sorted list before the listing
--    and L + 1 from it on. max_price and merchant_count still count every
--    priced in-stock listing.
--    The update is skipped when the stats are unchanged, so a refresh that
--    finds the same prices no longer bumps updated_at (the sitemap's lastmod).
-- 2. Backfill: every master's stats are refreshed once; thanks to (1) only
--    masters whose stats change are written.
--
-- Body as in 20261020230000 otherwise (crawl, in-stock, priced listings).
-- CREATE OR REPLACE keeps the existing grants (service_role, rate_worker).
-- Idempotent. Touches the `rate` schema only.

-- 1. Market stats without bait prices ------------------------------------------

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

-- 2. Backfill -------------------------------------------------------------------

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT m.id FROM rate.master_products m ORDER BY m.id LOOP
    PERFORM rate.refresh_master_market_stats(v_id);
  END LOOP;
END $$;
