-- rate.search_master_products: let the text search use a trigram index, and
-- stop a malformed spec number from failing the whole search (DOS/DOS.Me#1262,
-- from the Gemini review of DOS/DOS.Me#1258).
--
-- 1. Index use. The search matched
--      concat_ws(' ', brand, name, model, model_key, variant_name, chip, chipset)
--    but idx_master_products_search_trgm indexes only
--      brand || ' ' || name || ' ' || model || ' ' || model_key,
--    and concat_ws is STABLE, so no index can be built on it. Even a matching
--    index would stay out of the plan: the filter is
--    "p_search IS NULL OR btrim(p_search) = '' OR <match>", and a LANGUAGE sql
--    function that is not inlined (SET search_path prevents inlining) is
--    planned on PostgreSQL 17 with its arguments as unknown parameters, so the
--    OR is never simplified, and an OR with a non-indexable arm cannot use an
--    index.
--    This migration:
--      * adds idx_master_products_search_full_trgm on the same seven fields,
--        written with || and COALESCE (immutable). brand, name, model and
--        model_key are NOT NULL, so the text is the one concat_ws built and
--        a search matches exactly the rows it matched before;
--      * rewrites the function in plpgsql with SET plan_cache_mode =
--        force_custom_plan, so every call is planned with its actual
--        arguments: the IS NULL / empty-string arms fold away and the match is
--        a plain ILIKE on the indexed expression.
--    The function stays SECURITY INVOKER with SET search_path = '', the same
--    signature, return type, filters, ordering, paging and grants.
--
-- 2. Numeric cast. The refresh-rate, fast-charging and screen-size filters
--    strip every character but digits and dots from crawled spec text and cast
--    the rest to NUMERIC. A value such as '120.5.6' or '.' then raised
--    "invalid input syntax for type numeric" and failed the search for every
--    caller using that filter. The stripped text is now cast only when it is a
--    valid number (digits with at most one dot); otherwise it counts as
--    unknown, the same as an empty value did before. Every value that cast
--    successfully before gives the same number.
--
-- rate.master_products is small (37 rows on Production on 2026-11-01), so a
-- plain CREATE INDEX (which a migration transaction requires; CONCURRENTLY
-- cannot run in one) holds its lock only briefly. lock_timeout makes it fail
-- fast instead of queueing behind a long transaction. Idempotent: CREATE INDEX
-- IF NOT EXISTS and CREATE OR REPLACE FUNCTION.

SET lock_timeout = '5s';

-- pg_trgm lives in `sign` on Production and in `extensions` on fresh branches:
-- resolve its schema, as 20261014231500 does for the existing trgm indexes.
DO $rate_master_products_search_full_trgm$
DECLARE
  v_trgm_schema text;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';

  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate schema: pg_trgm extension is not installed';
  END IF;

  -- Keep this expression identical to the one in rate.search_master_products
  -- below, or the planner cannot match the index.
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_master_products_search_full_trgm
       ON rate.master_products
       USING gin (
         (
           COALESCE(brand, '''') || '' '' ||
           COALESCE(name, '''') || '' '' ||
           COALESCE(model, '''') || '' '' ||
           COALESCE(model_key, '''') || '' '' ||
           COALESCE(variant_name, '''') || '' '' ||
           COALESCE(key_specs ->> ''chip'', '''') || '' '' ||
           COALESCE(specifications #>> ''{hardware,chipset}'', '''')
         ) %I.gin_trgm_ops
       )',
    v_trgm_schema
  );
END
$rate_master_products_search_full_trgm$;

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
    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) END DESC NULLS LAST,
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

RESET lock_timeout;
