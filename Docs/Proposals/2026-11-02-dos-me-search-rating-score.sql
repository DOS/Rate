-- PROPOSAL, NOT APPLIED. DOS-Me migration for DOS/Rate#1545 (phase P4 of #1531).
-- JOY applies it through DOS-Me (preview, beta, production); DOS/Rate runs no DDL on production.
--
-- rate.search_master_products: the catalog's "highest rated" order (p_sort = 'rating_desc') and
-- its minimum rating filter (p_min_rating) read the one rating every page shows (design D3):
--   1. master_products.rating_score (P2, the stored Bayesian score), when it is above 0 and at
--      most 5;
--   2. else user_rating_weighted, then average_rating, each read as the web reads them
--      (normalizeCompareFiveStarRating: a value above 0 and at most 100, a 0-10 or 0-100 scale
--      brought to 0-5, rounded to 2 decimals).
-- This is resolveCompareEffectiveUserRating in apps/web/src/lib/rate-domain.ts. Before, the order
-- read user_rating_weighted then average_rating, and the filter also fell back to expert_rating,
-- which no page shows as the product's rating; so the catalog, `?rating=` and the leaderboard's
-- top-100 load could disagree with the rating on screen. A product with none of the three sorts
-- last and never passes a minimum rating, as before.
--
-- Needs, in this order:
--   * P2 (2026-10-31-dos-me-criteria-ratings.sql): the rating_score column;
--   * DOS/DOS.Me#1497 (20261101170000_rate_search_master_products_trgm_index_and_numeric_guard):
--     this function body is #1497's, head 8ccfbf2e, with only the two rating expressions changed.
--     Applied before #1497, #1497 would put the old rating expressions back.
-- Same signature, return type, SECURITY INVOKER, search_path, plan_cache_mode, filters, paging and
-- grants as #1497. No table, index or data change. Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION rate.search_master_products(
  p_category_id UUID DEFAULT NULL,
  p_brands TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_min_price NUMERIC DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_min_rating NUMERIC DEFAULT NULL,
  p_ram_gb INTEGER[] DEFAULT NULL,
  p_storage_gb INTEGER[] DEFAULT NULL,
  p_min_battery_mah INTEGER DEFAULT NULL,
  p_min_refresh_rate_hz INTEGER DEFAULT NULL,
  p_min_fast_charging_w INTEGER DEFAULT NULL,
  p_has_5g BOOLEAN DEFAULT NULL,
  p_has_nfc BOOLEAN DEFAULT NULL,
  p_max_screen_size_inch NUMERIC DEFAULT NULL,
  p_sort TEXT DEFAULT 'default',
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF rate.master_products
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET plan_cache_mode = 'force_custom_plan'
AS $$
BEGIN
  RETURN QUERY
  SELECT m.*
  FROM rate.master_products m
  CROSS JOIN LATERAL (
    SELECT
      pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{display,refresh_rate_hz}', ''), '[^0-9.]', '', 'g') AS refresh_rate_hz,
      pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{battery,fast_charging_w}', ''), '[^0-9.]', '', 'g') AS fast_charging_w,
      pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{display,size_inch}', ''), '[^0-9.]', '', 'g') AS size_inch
  ) spec
  -- The rating the pages show (DOS/Rate#1545): rating_score, else the weighted user rating, else
  -- the marketplace average, each on 0-5 as resolveCompareEffectiveUserRating reads it. NULL when
  -- the product has none.
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN m.rating_score > 0 AND m.rating_score <= 5 THEN m.rating_score
      ELSE COALESCE(
        CASE WHEN m.user_rating_weighted > 0 AND m.user_rating_weighted <= 100 THEN pg_catalog.round(
          CASE
            WHEN m.user_rating_weighted > 10 THEN m.user_rating_weighted / 20
            WHEN m.user_rating_weighted > 5 THEN m.user_rating_weighted / 2
            ELSE m.user_rating_weighted
          END, 2) END,
        CASE WHEN m.average_rating > 0 AND m.average_rating <= 100 THEN pg_catalog.round(
          CASE
            WHEN m.average_rating > 10 THEN m.average_rating / 20
            WHEN m.average_rating > 5 THEN m.average_rating / 2
            ELSE m.average_rating
          END, 2) END
      )
    END AS rating_5
  ) shown
  WHERE m.status = 'published'
    AND (p_category_id IS NULL OR m.category_id = p_category_id)
    AND (
      p_brands IS NULL
      OR cardinality(p_brands) = 0
      OR pg_catalog.lower(pg_catalog.btrim(m.brand)) = ANY (
        SELECT pg_catalog.lower(pg_catalog.btrim(b)) FROM unnest(p_brands) AS b
      )
    )
    AND (
      p_search IS NULL
      OR pg_catalog.btrim(p_search) = ''
      OR (
        -- Same expression as idx_master_products_search_full_trgm.
        (
          COALESCE(m.brand, '') || ' ' ||
          COALESCE(m.name, '') || ' ' ||
          COALESCE(m.model, '') || ' ' ||
          COALESCE(m.model_key, '') || ' ' ||
          COALESCE(m.variant_name, '') || ' ' ||
          COALESCE(m.key_specs ->> 'chip', '') || ' ' ||
          COALESCE(m.specifications #>> '{hardware,chipset}', '')
        ) ILIKE '%' || pg_catalog.regexp_replace(pg_catalog.btrim(p_search), '([%_\\])', '\\\1', 'g') || '%' ESCAPE '\'
      )
    )
    AND (p_min_price IS NULL OR p_min_price <= 0 OR m.min_price >= p_min_price)
    AND (p_max_price IS NULL OR p_max_price <= 0 OR m.min_price <= p_max_price)
    AND (
      p_min_rating IS NULL
      OR p_min_rating <= 0
      OR COALESCE(shown.rating_5, 0) >= p_min_rating
    )
    AND (p_ram_gb IS NULL OR cardinality(p_ram_gb) = 0 OR m.ram_gb = ANY (p_ram_gb))
    AND (p_storage_gb IS NULL OR cardinality(p_storage_gb) = 0 OR m.storage_gb = ANY (p_storage_gb))
    AND (p_min_battery_mah IS NULL OR p_min_battery_mah <= 0 OR m.battery_mah >= p_min_battery_mah)
    AND (
      p_min_refresh_rate_hz IS NULL
      OR p_min_refresh_rate_hz <= 0
      OR COALESCE(
        CASE WHEN spec.refresh_rate_hz ~ '^([0-9]+\.?[0-9]*|\.[0-9]+)$' THEN spec.refresh_rate_hz::NUMERIC END,
        0
      ) >= p_min_refresh_rate_hz
      OR COALESCE(m.key_specs ->> 'screen', '') ILIKE '%120hz%'
      OR COALESCE(m.key_specs ->> 'screen', '') ILIKE '%144hz%'
    )
    AND (
      p_min_fast_charging_w IS NULL
      OR p_min_fast_charging_w <= 0
      OR COALESCE(
        CASE WHEN spec.fast_charging_w ~ '^([0-9]+\.?[0-9]*|\.[0-9]+)$' THEN spec.fast_charging_w::NUMERIC END,
        0
      ) >= p_min_fast_charging_w
    )
    AND (p_has_5g IS NULL OR p_has_5g = false OR m.has_5g = true)
    AND (
      p_has_nfc IS NULL
      OR p_has_nfc = false
      OR (m.specifications -> 'connectivity' ->> 'nfc') = 'true'
    )
    AND (
      p_max_screen_size_inch IS NULL
      OR p_max_screen_size_inch <= 0
      OR COALESCE(
        m.screen_size_inch,
        CASE WHEN spec.size_inch ~ '^([0-9]+\.?[0-9]*|\.[0-9]+)$' THEN spec.size_inch::NUMERIC END
      ) <= p_max_screen_size_inch
    )
  ORDER BY
    CASE WHEN p_sort = 'price_asc' THEN m.min_price END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN m.min_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'merchants_desc' THEN m.merchant_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(shown.rating_5, 0) END DESC NULLS LAST,
    m.created_at DESC,
    m.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION rate.search_master_products(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], INTEGER[],
  INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN, NUMERIC, TEXT, INTEGER, INTEGER
) TO anon, authenticated, service_role;
