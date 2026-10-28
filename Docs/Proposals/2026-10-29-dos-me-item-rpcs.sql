-- PROPOSAL, NOT APPLIED. DOS-Me migration: Item catalogue RPCs (DOS/Rate#1160, #1275; design
-- Docs/Proposals/2026-10-27-item-variant-listing-model.md section 5.1). Applies any time AFTER
-- 2026-10-28-dos-me-m1-m2-items.sql (needs rate.items and master_products.item_id); it does not
-- wait for M3/M4. Rollback: 2026-10-29-dos-me-item-rpcs-rollback.sql.
--
-- New functions only; the variant RPCs (search_master_products, get_category_brand_facets,
-- search_catalog_autocomplete) are untouched, so the flag-off web keeps working.
-- Idempotent: CREATE OR REPLACE and grants.

BEGIN;

-- 1. search_items_v1: one row per published Item, with the published variants the filters
-- match. Same filter names as search_master_products where they apply; `p_storage_gb` means
-- "has a variant of that size" (design 5.1); price filters and sorts use the cheapest priced
-- matching variant (`matching_min_price`). `total_count` is the number of matching Items
-- (for paging), the same on every row.
CREATE OR REPLACE FUNCTION rate.search_items_v1(
  p_category_id UUID DEFAULT NULL,
  p_brands TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_min_price NUMERIC DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_min_rating NUMERIC DEFAULT NULL,
  p_storage_gb INTEGER[] DEFAULT NULL,
  p_has_5g BOOLEAN DEFAULT NULL,
  p_sort TEXT DEFAULT 'default',
  p_limit INTEGER DEFAULT 24,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  item_id UUID,
  item_key TEXT,
  slug TEXT,
  name TEXT,
  brand TEXT,
  model TEXT,
  category_id UUID,
  thumbnail TEXT,
  min_price NUMERIC,
  max_price NUMERIC,
  matching_min_price NUMERIC,
  price_variant_count INTEGER,
  merchant_count INTEGER,
  listing_count INTEGER,
  user_rating_weighted NUMERIC,
  authentic_review_count INTEGER,
  default_variant_id UUID,
  variant_keys TEXT[],
  matching_variant_keys TEXT[],
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH v AS (
    SELECT m.item_id, m.variant_key, m.min_price, m.storage_gb, m.has_5g, m.sort_order
    FROM rate.master_products m
    WHERE m.status = 'published' AND m.item_id IS NOT NULL
  ),
  per_item AS (
    SELECT
      v.item_id,
      pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
        AS variant_keys,
      pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
        FILTER (WHERE
          (p_storage_gb IS NULL OR cardinality(p_storage_gb) = 0 OR v.storage_gb = ANY (p_storage_gb))
          AND (p_has_5g IS NULL OR p_has_5g = false OR v.has_5g = true))
        AS matching_variant_keys,
      min(v.min_price) FILTER (WHERE v.min_price > 0
          AND (p_storage_gb IS NULL OR cardinality(p_storage_gb) = 0 OR v.storage_gb = ANY (p_storage_gb))
          AND (p_has_5g IS NULL OR p_has_5g = false OR v.has_5g = true))
        AS matching_min_price
    FROM v
    GROUP BY v.item_id
  ),
  matched AS (
    SELECT i.*, p.variant_keys, p.matching_variant_keys, p.matching_min_price
    FROM rate.items i
    JOIN per_item p ON p.item_id = i.id
    WHERE i.status = 'published'
      AND p.matching_variant_keys IS NOT NULL
      AND (p_category_id IS NULL OR i.category_id = p_category_id)
      AND (
        p_brands IS NULL
        OR cardinality(p_brands) = 0
        OR pg_catalog.lower(pg_catalog.btrim(i.brand)) = ANY (
          SELECT pg_catalog.lower(pg_catalog.btrim(b)) FROM unnest(p_brands) AS b
        )
      )
      AND (
        p_search IS NULL
        OR pg_catalog.btrim(p_search) = ''
        OR pg_catalog.concat_ws(' ', i.brand, i.name, i.model, i.item_key,
             COALESCE(i.key_specs ->> 'chip', ''),
             COALESCE(i.specifications #>> '{hardware,chipset}', ''))
           ILIKE '%' || pg_catalog.regexp_replace(pg_catalog.btrim(p_search), '([%_\\])', '\\\1', 'g') || '%' ESCAPE '\'
      )
      AND (p_min_price IS NULL OR p_min_price <= 0 OR p.matching_min_price >= p_min_price)
      AND (p_max_price IS NULL OR p_max_price <= 0 OR p.matching_min_price <= p_max_price)
      AND (
        p_min_rating IS NULL
        OR p_min_rating <= 0
        OR COALESCE(NULLIF(i.user_rating_weighted, 0), NULLIF(i.expert_rating, 0), i.average_rating, 0)
           >= p_min_rating
      )
  )
  SELECT
    m.id, m.item_key, m.slug, m.name, m.brand, m.model, m.category_id,
    COALESCE(m.thumbnail, m.images[1]),
    m.min_price, m.max_price, m.matching_min_price, m.price_variant_count, m.merchant_count,
    m.listing_count, m.user_rating_weighted, m.authentic_review_count, m.default_variant_id,
    m.variant_keys, m.matching_variant_keys, m.created_at,
    pg_catalog.count(*) OVER ()
  FROM matched m
  ORDER BY
    CASE WHEN p_sort = 'price_asc' THEN m.matching_min_price END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN m.matching_min_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'merchants_desc' THEN m.merchant_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating_desc' THEN COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) END
      DESC NULLS LAST,
    m.created_at DESC,
    m.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

-- 2. Brand facets counted by published Item (design 5.1).
CREATE OR REPLACE FUNCTION rate.get_category_brand_facets_v2(p_category_id UUID)
RETURNS TABLE (brand TEXT, count INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT i.brand, COUNT(*)::INTEGER AS count
  FROM rate.items i
  WHERE i.status = 'published'
    AND i.category_id = p_category_id
    AND i.brand IS NOT NULL
    AND pg_catalog.btrim(i.brand) <> ''
    AND EXISTS (SELECT 1 FROM rate.master_products m
                WHERE m.item_id = i.id AND m.status = 'published')
  GROUP BY i.brand
  ORDER BY count DESC, i.brand ASC;
$$;

-- 3. Autocomplete by Item. SECURITY DEFINER like search_catalog_autocomplete: anon has no
-- USAGE on the pg_trgm schema; the body reads published Items only. Same result shape as v1
-- with entity_kind 'item'.
CREATE OR REPLACE FUNCTION rate.search_catalog_autocomplete_v2(
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  entity_kind TEXT,
  id UUID,
  slug TEXT,
  title TEXT,
  subtitle TEXT,
  brand_or_platform TEXT,
  thumbnail TEXT,
  min_price NUMERIC,
  max_price NUMERIC,
  rating NUMERIC,
  review_count INTEGER,
  merchant_or_official_count INTEGER,
  similarity_score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trgm_schema TEXT;
  v_clean_q TEXT := pg_catalog.left(pg_catalog.btrim(COALESCE(p_query, '')), 100);
  v_escaped_q TEXT;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);
BEGIN
  IF v_clean_q = '' THEN
    RETURN;
  END IF;
  v_escaped_q := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    v_clean_q, '\', '\\'), '%', '\%'), '_', '\_');
  SELECT n.nspname INTO v_trgm_schema
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate.search_catalog_autocomplete_v2: pg_trgm extension is not installed';
  END IF;
  RETURN QUERY EXECUTE pg_catalog.format(
    'SELECT * FROM (
       SELECT
         ''item''::TEXT,
         i.id,
         i.slug,
         i.name,
         COALESCE(i.key_specs ->> ''chip'', i.model),
         i.brand,
         COALESCE(i.thumbnail, i.images[1]),
         i.min_price,
         i.max_price,
         COALESCE(NULLIF(i.user_rating_weighted, 0), i.average_rating, 0)::NUMERIC,
         COALESCE(NULLIF(i.authentic_review_count, 0), i.total_reviews, 0)::INTEGER,
         COALESCE(i.merchant_count, 0)::INTEGER,
         GREATEST(
           %I.similarity(pg_catalog.lower(i.name), pg_catalog.lower($1)),
           %I.similarity(pg_catalog.lower(i.brand || '' '' || i.model), pg_catalog.lower($1)),
           CASE WHEN pg_catalog.lower(i.name) LIKE ''%%'' || pg_catalog.lower($2) || ''%%'' ESCAPE ''\''
                THEN 0.75::real ELSE 0.0::real END
         ) AS score
       FROM rate.items i
       WHERE i.status = ''published''
         AND EXISTS (SELECT 1 FROM rate.master_products m
                     WHERE m.item_id = i.id AND m.status = ''published'')
     ) s
     WHERE s.score >= 0.2
     ORDER BY s.score DESC, s.id
     LIMIT $3',
    v_trgm_schema, v_trgm_schema
  ) USING v_clean_q, v_escaped_q, v_limit;
END $$;

-- 4. Grants: the web reads as anon / authenticated; the worker and service role too.
REVOKE EXECUTE ON FUNCTION rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rate.get_category_brand_facets_v2(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rate.search_catalog_autocomplete_v2(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER
) TO anon, authenticated, service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.get_category_brand_facets_v2(UUID)
  TO anon, authenticated, service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.search_catalog_autocomplete_v2(TEXT, INTEGER)
  TO anon, authenticated, service_role, rate_worker;

COMMIT;
