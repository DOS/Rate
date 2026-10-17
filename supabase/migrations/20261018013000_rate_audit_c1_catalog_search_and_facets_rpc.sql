-- ==============================================================================
-- Migration: Rate Architecture Audit C1 (Catalog Facets & Server-Side Search RPCs)
--   * C1a: `rate.get_category_brand_facets(p_category_id UUID)` (`SECURITY INVOKER`,
--          `STABLE`, `SET search_path = ''`) aggregates published master product
--          counts grouped by brand directly in PostgreSQL instead of scanning all
--          rows in JavaScript.
--   * C1b: `rate.search_master_products(...)` (`SECURITY INVOKER`, `STABLE`,
--          `SET search_path = ''`) filters, sorts, and paginates `rate.master_products`
--          (including 10-Field-Group JSONB criteria: `refresh_rate_hz`,
--          `fast_charging_w`, `nfc`, `screen_size_inch`) directly in PostgreSQL.
--   * C1c: GIN `jsonb_path_ops` index on `rate.master_products(specifications)`
--          and composite B-tree index on `(status, category_id, min_price)`.
--
-- Target: Shared Supabase Project `dos` (Deploy ONLY via DOS-Me/supabase/migrations/)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Supporting Indexes for Catalog Filtering & JSONB Containment (Audit C1)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_master_products_specs_gin
  ON rate.master_products USING gin (specifications jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_master_products_status_category_price
  ON rate.master_products (status, category_id, min_price)
  WHERE status = 'published';

-- ------------------------------------------------------------------------------
-- 2. Brand Facet Aggregation RPC: `rate.get_category_brand_facets`
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.get_category_brand_facets(p_category_id UUID)
RETURNS TABLE (
  brand TEXT,
  count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    m.brand,
    COUNT(*)::INTEGER AS count
  FROM rate.master_products m
  WHERE m.status = 'published'
    AND m.category_id = p_category_id
    AND m.brand IS NOT NULL
    AND pg_catalog.btrim(m.brand) <> ''
  GROUP BY m.brand
  ORDER BY count DESC, m.brand ASC;
$$;

GRANT EXECUTE ON FUNCTION rate.get_category_brand_facets(UUID)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Server-Side Catalog Search & Filter RPC: `rate.search_master_products`
-- ------------------------------------------------------------------------------
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.*
  FROM rate.master_products m
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
        pg_catalog.concat_ws(
          ' ',
          m.brand,
          m.name,
          m.model,
          m.model_key,
          COALESCE(m.variant_name, ''),
          COALESCE(m.key_specs ->> 'chip', ''),
          COALESCE(m.specifications #>> '{hardware,chipset}', '')
        ) ILIKE '%' || pg_catalog.regexp_replace(pg_catalog.btrim(p_search), '([%_\\])', '\\\1', 'g') || '%' ESCAPE '\'
      )
    )
    AND (p_min_price IS NULL OR p_min_price <= 0 OR m.min_price >= p_min_price)
    AND (p_max_price IS NULL OR p_max_price <= 0 OR m.min_price <= p_max_price)
    AND (
      p_min_rating IS NULL
      OR p_min_rating <= 0
      OR COALESCE(
        NULLIF(m.user_rating_weighted, 0),
        NULLIF(m.expert_rating, 0),
        m.average_rating,
        0
      ) >= p_min_rating
    )
    AND (p_ram_gb IS NULL OR cardinality(p_ram_gb) = 0 OR m.ram_gb = ANY (p_ram_gb))
    AND (p_storage_gb IS NULL OR cardinality(p_storage_gb) = 0 OR m.storage_gb = ANY (p_storage_gb))
    AND (p_min_battery_mah IS NULL OR p_min_battery_mah <= 0 OR m.battery_mah >= p_min_battery_mah)
    AND (
      p_min_refresh_rate_hz IS NULL
      OR p_min_refresh_rate_hz <= 0
      OR COALESCE(NULLIF(pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{display,refresh_rate_hz}', ''), '[^0-9.]', '', 'g'), '')::NUMERIC, 0) >= p_min_refresh_rate_hz
      OR COALESCE(m.key_specs ->> 'screen', '') ILIKE '%120hz%'
      OR COALESCE(m.key_specs ->> 'screen', '') ILIKE '%144hz%'
    )
    AND (
      p_min_fast_charging_w IS NULL
      OR p_min_fast_charging_w <= 0
      OR COALESCE(NULLIF(pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{battery,fast_charging_w}', ''), '[^0-9.]', '', 'g'), '')::NUMERIC, 0) >= p_min_fast_charging_w
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
        NULLIF(pg_catalog.regexp_replace(COALESCE(m.specifications #>> '{display,size_inch}', ''), '[^0-9.]', '', 'g'), '')::NUMERIC
      ) <= p_max_screen_size_inch
    )
  ORDER BY
    CASE WHEN p_sort = 'price_asc' THEN m.min_price END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN m.min_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'merchants_desc' THEN m.merchant_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) END DESC NULLS LAST,
    m.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION rate.search_master_products(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], INTEGER[],
  INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN, NUMERIC, TEXT, INTEGER, INTEGER
) TO anon, authenticated, service_role;
