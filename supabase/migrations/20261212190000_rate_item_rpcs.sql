-- Item model step 3: Item catalogue RPCs (DOS/Rate#1160, DOS/DOS.Me#2015).
-- Upgraded from Docs/Proposals/2026-10-29-dos-me-item-rpcs.sql for live DOS/DOS.Me@dev:
--   1. Adds idx_items_search_full_trgm using dynamic pg_trgm schema resolution.
--   2. Rewrites rate.search_items_v1 in LANGUAGE plpgsql with STABLE SECURITY INVOKER,
--      SET search_path = '', and SET plan_cache_mode = 'force_custom_plan' (matching
--      20261104120000 / 20261104140000), filtering and sorting on normalized rating_score
--      (fallback user_rating_weighted / average_rating), adding p_entity_type filtering,
--      and exposing entity_type, rating_score, rating_weight_sum, and criteria_scores.
--   3. Upgrades search_catalog_autocomplete_v2 rating preference to rating_score first
--      and keeps get_category_brand_facets_v2.
--   4. Enforces post-20261210150000 least-privilege ACLs: REVOKE ALL FROM PUBLIC, anon,
--      authenticated, authenticator, rate_worker, service_role before GRANT EXECUTE TO
--      anon, authenticated, service_role, plus authenticator zero-ACL verification.
--
-- Leaves variant RPCs (search_master_products, get_category_brand_facets,
-- search_catalog_autocomplete) untouched so flag-off web readers keep working.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Trigram GIN index for Item search_items_v1 p_search lookups ---------------------------

DO $rate_items_search_full_trgm$
DECLARE
  v_trgm_schema text;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate schema: pg_trgm extension is not installed';
  END IF;

  -- Keep this expression identical to search_items_v1 below so the planner can use the GIN index.
  EXECUTE pg_catalog.format(
    'CREATE INDEX IF NOT EXISTS idx_items_search_full_trgm
       ON rate.items
       USING gin (
         (
           COALESCE(brand, '''') || '' '' ||
           COALESCE(name, '''') || '' '' ||
           COALESCE(model, '''') || '' '' ||
           COALESCE(item_key, '''') || '' '' ||
           COALESCE(key_specs ->> ''chip'', '''') || '' '' ||
           COALESCE(specifications #>> ''{hardware,chipset}'', '''')
         ) %I.gin_trgm_ops
       )',
    v_trgm_schema
  );
END
$rate_items_search_full_trgm$;

-- 2. search_items_v1 --------------------------------------------------------------------------

-- Drop legacy 11-argument overload if present so 11-argument named/positional calls never clash.
DROP FUNCTION IF EXISTS rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER
);

-- Drop current signature only if return shape differs? Keeping exact 12-argument signature;
-- CREATE OR REPLACE replaces identically when already applied.
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
  p_offset INTEGER DEFAULT 0,
  p_entity_type TEXT DEFAULT NULL
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
  matching_max_price NUMERIC,
  price_variant_count INTEGER,
  merchant_count INTEGER,
  listing_count INTEGER,
  user_rating_weighted NUMERIC,
  authentic_review_count INTEGER,
  expert_rating NUMERIC,
  average_rating NUMERIC,
  total_reviews INTEGER,
  default_variant_id UUID,
  representative_variant_id UUID,
  representative_variant_slug TEXT,
  variant_keys TEXT[],
  matching_variant_keys TEXT[],
  chips JSONB,
  created_at TIMESTAMPTZ,
  total_count BIGINT,
  entity_type TEXT,
  rating_score NUMERIC,
  rating_weight_sum NUMERIC,
  criteria_scores JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET plan_cache_mode = 'force_custom_plan'
AS $$
DECLARE
  v_clean_search TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_search, '')), '');
  v_clean_entity_type TEXT := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_entity_type, ''))), '');
BEGIN
  IF v_clean_search IS NOT NULL THEN
    RETURN QUERY
    WITH matching_search_items AS (
      SELECT i.id
      FROM rate.items i
      WHERE i.status = 'published'
        AND (
          COALESCE(i.brand, '') || ' ' ||
          COALESCE(i.name, '') || ' ' ||
          COALESCE(i.model, '') || ' ' ||
          COALESCE(i.item_key, '') || ' ' ||
          COALESCE(i.key_specs ->> 'chip', '') || ' ' ||
          COALESCE(i.specifications #>> '{hardware,chipset}', '')
        ) ILIKE '%' || pg_catalog.regexp_replace(pg_catalog.btrim(p_search), '([%_\\])', '\\\1', 'g') || '%' ESCAPE '\'
      UNION
      SELECT sm.item_id
      FROM rate.master_products sm
      WHERE sm.status = 'published'
        AND sm.item_id IS NOT NULL
        AND (
          COALESCE(sm.brand, '') || ' ' ||
          COALESCE(sm.name, '') || ' ' ||
          COALESCE(sm.model, '') || ' ' ||
          COALESCE(sm.model_key, '') || ' ' ||
          COALESCE(sm.variant_name, '') || ' ' ||
          COALESCE(sm.key_specs ->> 'chip', '') || ' ' ||
          COALESCE(sm.specifications #>> '{hardware,chipset}', '')
        ) ILIKE '%' || pg_catalog.regexp_replace(pg_catalog.btrim(p_search), '([%_\\])', '\\\1', 'g') || '%' ESCAPE '\'
    ),
    v AS (
      SELECT m.id, m.slug, m.item_id, m.variant_key, m.min_price, m.max_price, m.storage_gb, m.sort_order,
             COALESCE(
               (p_storage_gb IS NULL OR pg_catalog.cardinality(p_storage_gb) = 0 OR m.storage_gb = ANY (p_storage_gb))
               AND (p_has_5g IS NULL OR p_has_5g = false OR m.has_5g = true),
               false
             ) AS matching
      FROM rate.master_products m
      WHERE m.status = 'published'
        AND m.item_id IS NOT NULL
        AND m.item_id IN (SELECT si.id FROM matching_search_items si)
    ),
    per_item AS (
      SELECT
        v.item_id,
        pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
          AS variant_keys,
        pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
          FILTER (WHERE v.matching) AS matching_variant_keys,
        pg_catalog.min(v.min_price) FILTER (WHERE v.matching AND v.min_price > 0) AS matching_min_price,
        pg_catalog.max(GREATEST(v.max_price, v.min_price)) FILTER (WHERE v.matching AND v.min_price > 0) AS matching_max_price,
        (pg_catalog.array_agg(
          v.id ORDER BY (v.min_price > 0) DESC NULLS LAST, v.min_price NULLS LAST,
                        v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key
        ) FILTER (WHERE v.matching))[1] AS representative_variant_id,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'variant_id', v.id, 'variant_key', v.variant_key, 'slug', v.slug,
            'storage_gb', v.storage_gb, 'min_price', NULLIF(v.min_price, 0), 'matching', v.matching
          )
          ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key
        ) AS chips
      FROM v
      GROUP BY v.item_id
    ),
    matched AS (
      SELECT i.*, p.variant_keys, p.matching_variant_keys, p.matching_min_price, p.matching_max_price,
             p.representative_variant_id, p.chips, shown.rating_5
      FROM rate.items i
      JOIN matching_search_items si ON si.id = i.id
      JOIN per_item p ON p.item_id = i.id
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN i.rating_score > 0 AND i.rating_score <= 5 THEN i.rating_score
          ELSE COALESCE(
            CASE WHEN i.user_rating_weighted > 0 AND i.user_rating_weighted <= 100 THEN pg_catalog.round(
              CASE
                WHEN i.user_rating_weighted > 10 THEN i.user_rating_weighted / 20
                WHEN i.user_rating_weighted > 5 THEN i.user_rating_weighted / 2
                ELSE i.user_rating_weighted
              END, 2) END,
            CASE WHEN i.average_rating > 0 AND i.average_rating <= 100 THEN pg_catalog.round(
              CASE
                WHEN i.average_rating > 10 THEN i.average_rating / 20
                WHEN i.average_rating > 5 THEN i.average_rating / 2
                ELSE i.average_rating
              END, 2) END
          )
        END AS rating_5
      ) shown
      WHERE i.status = 'published'
        AND p.matching_variant_keys IS NOT NULL
        AND (p_category_id IS NULL OR i.category_id = p_category_id)
        AND (v_clean_entity_type IS NULL OR i.entity_type = v_clean_entity_type)
        AND (
          p_brands IS NULL
          OR pg_catalog.cardinality(p_brands) = 0
          OR pg_catalog.lower(pg_catalog.btrim(i.brand)) = ANY (
            SELECT pg_catalog.lower(pg_catalog.btrim(b)) FROM unnest(p_brands) AS b
          )
        )
        AND (p_min_price IS NULL OR p_min_price <= 0 OR p.matching_min_price >= p_min_price)
        AND (p_max_price IS NULL OR p_max_price <= 0 OR p.matching_min_price <= p_max_price)
        AND (
          p_min_rating IS NULL
          OR p_min_rating <= 0
          OR pg_catalog.round(COALESCE(shown.rating_5, 0), 1) >= p_min_rating
        )
    )
    SELECT
      m.id, m.item_key, m.slug, m.name, m.brand, m.model, m.category_id,
      COALESCE(m.thumbnail, m.images[1]),
      m.min_price, m.max_price, m.matching_min_price, m.matching_max_price, m.price_variant_count,
      m.merchant_count, m.listing_count, m.user_rating_weighted, m.authentic_review_count,
      m.expert_rating, m.average_rating, m.total_reviews, m.default_variant_id,
      m.representative_variant_id, rv.slug,
      m.variant_keys, m.matching_variant_keys, m.chips, m.created_at,
      pg_catalog.count(*) OVER (),
      m.entity_type, m.rating_score, m.rating_weight_sum, m.criteria_scores
    FROM matched m
    LEFT JOIN rate.master_products rv ON rv.id = m.representative_variant_id
    ORDER BY
      CASE WHEN p_sort = 'price_asc' THEN m.matching_min_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'price_desc' THEN m.matching_min_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'merchants_desc' THEN m.merchant_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'rating_desc' THEN COALESCE(m.rating_5, 0) END DESC NULLS LAST,
      m.created_at DESC,
      m.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
  ELSE
    RETURN QUERY
    WITH v AS (
      SELECT m.id, m.slug, m.item_id, m.variant_key, m.min_price, m.max_price, m.storage_gb, m.sort_order,
             COALESCE(
               (p_storage_gb IS NULL OR pg_catalog.cardinality(p_storage_gb) = 0 OR m.storage_gb = ANY (p_storage_gb))
               AND (p_has_5g IS NULL OR p_has_5g = false OR m.has_5g = true),
               false
             ) AS matching
      FROM rate.master_products m
      JOIN rate.items fi ON fi.id = m.item_id
      WHERE m.status = 'published'
        AND fi.status = 'published'
        AND (p_category_id IS NULL OR fi.category_id = p_category_id)
        AND (v_clean_entity_type IS NULL OR fi.entity_type = v_clean_entity_type)
        AND (
          p_brands IS NULL
          OR pg_catalog.cardinality(p_brands) = 0
          OR pg_catalog.lower(pg_catalog.btrim(fi.brand)) = ANY (
            SELECT pg_catalog.lower(pg_catalog.btrim(b)) FROM unnest(p_brands) AS b
          )
        )
    ),
    per_item AS (
      SELECT
        v.item_id,
        pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
          AS variant_keys,
        pg_catalog.array_agg(v.variant_key ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key)
          FILTER (WHERE v.matching) AS matching_variant_keys,
        pg_catalog.min(v.min_price) FILTER (WHERE v.matching AND v.min_price > 0) AS matching_min_price,
        pg_catalog.max(GREATEST(v.max_price, v.min_price)) FILTER (WHERE v.matching AND v.min_price > 0) AS matching_max_price,
        (pg_catalog.array_agg(
          v.id ORDER BY (v.min_price > 0) DESC NULLS LAST, v.min_price NULLS LAST,
                        v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key
        ) FILTER (WHERE v.matching))[1] AS representative_variant_id,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'variant_id', v.id, 'variant_key', v.variant_key, 'slug', v.slug,
            'storage_gb', v.storage_gb, 'min_price', NULLIF(v.min_price, 0), 'matching', v.matching
          )
          ORDER BY v.sort_order NULLS LAST, v.storage_gb NULLS LAST, v.variant_key
        ) AS chips
      FROM v
      GROUP BY v.item_id
    ),
    matched AS (
      SELECT i.*, p.variant_keys, p.matching_variant_keys, p.matching_min_price, p.matching_max_price,
             p.representative_variant_id, p.chips, shown.rating_5
      FROM rate.items i
      JOIN per_item p ON p.item_id = i.id
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN i.rating_score > 0 AND i.rating_score <= 5 THEN i.rating_score
          ELSE COALESCE(
            CASE WHEN i.user_rating_weighted > 0 AND i.user_rating_weighted <= 100 THEN pg_catalog.round(
              CASE
                WHEN i.user_rating_weighted > 10 THEN i.user_rating_weighted / 20
                WHEN i.user_rating_weighted > 5 THEN i.user_rating_weighted / 2
                ELSE i.user_rating_weighted
              END, 2) END,
            CASE WHEN i.average_rating > 0 AND i.average_rating <= 100 THEN pg_catalog.round(
              CASE
                WHEN i.average_rating > 10 THEN i.average_rating / 20
                WHEN i.average_rating > 5 THEN i.average_rating / 2
                ELSE i.average_rating
              END, 2) END
          )
        END AS rating_5
      ) shown
      WHERE i.status = 'published'
        AND p.matching_variant_keys IS NOT NULL
        AND (p_category_id IS NULL OR i.category_id = p_category_id)
        AND (v_clean_entity_type IS NULL OR i.entity_type = v_clean_entity_type)
        AND (
          p_brands IS NULL
          OR pg_catalog.cardinality(p_brands) = 0
          OR pg_catalog.lower(pg_catalog.btrim(i.brand)) = ANY (
            SELECT pg_catalog.lower(pg_catalog.btrim(b)) FROM unnest(p_brands) AS b
          )
        )
        AND (p_min_price IS NULL OR p_min_price <= 0 OR p.matching_min_price >= p_min_price)
        AND (p_max_price IS NULL OR p_max_price <= 0 OR p.matching_min_price <= p_max_price)
        AND (
          p_min_rating IS NULL
          OR p_min_rating <= 0
          OR pg_catalog.round(COALESCE(shown.rating_5, 0), 1) >= p_min_rating
        )
    )
    SELECT
      m.id, m.item_key, m.slug, m.name, m.brand, m.model, m.category_id,
      COALESCE(m.thumbnail, m.images[1]),
      m.min_price, m.max_price, m.matching_min_price, m.matching_max_price, m.price_variant_count,
      m.merchant_count, m.listing_count, m.user_rating_weighted, m.authentic_review_count,
      m.expert_rating, m.average_rating, m.total_reviews, m.default_variant_id,
      m.representative_variant_id, rv.slug,
      m.variant_keys, m.matching_variant_keys, m.chips, m.created_at,
      pg_catalog.count(*) OVER (),
      m.entity_type, m.rating_score, m.rating_weight_sum, m.criteria_scores
    FROM matched m
    LEFT JOIN rate.master_products rv ON rv.id = m.representative_variant_id
    ORDER BY
      CASE WHEN p_sort = 'price_asc' THEN m.matching_min_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'price_desc' THEN m.matching_min_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'merchants_desc' THEN m.merchant_count END DESC NULLS LAST,
      CASE WHEN p_sort = 'rating_desc' THEN COALESCE(m.rating_5, 0) END DESC NULLS LAST,
      m.created_at DESC,
      m.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
  END IF;
END;
$$;

-- 3. Brand facets counted by published Item ---------------------------------------------------

CREATE OR REPLACE FUNCTION rate.get_category_brand_facets_v2(p_category_id UUID)
RETURNS TABLE (brand TEXT, count INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT i.brand, pg_catalog.count(*)::INTEGER AS count
  FROM rate.items i
  WHERE i.status = 'published'
    AND i.category_id = p_category_id
    AND i.brand IS NOT NULL
    AND pg_catalog.btrim(i.brand) <> ''
    AND EXISTS (
      SELECT 1 FROM rate.master_products m
      WHERE m.item_id = i.id AND m.status = 'published'
    )
  GROUP BY i.brand
  ORDER BY count DESC, i.brand ASC;
$$;

-- 4. Autocomplete by Item ---------------------------------------------------------------------

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
         COALESCE(
           CASE
             WHEN i.rating_score > 0 AND i.rating_score <= 5 THEN i.rating_score
             ELSE COALESCE(
               CASE WHEN i.user_rating_weighted > 0 AND i.user_rating_weighted <= 100 THEN pg_catalog.round(
                 CASE
                   WHEN i.user_rating_weighted > 10 THEN i.user_rating_weighted / 20
                   WHEN i.user_rating_weighted > 5 THEN i.user_rating_weighted / 2
                   ELSE i.user_rating_weighted
                 END, 2) END,
               CASE WHEN i.average_rating > 0 AND i.average_rating <= 100 THEN pg_catalog.round(
                 CASE
                   WHEN i.average_rating > 10 THEN i.average_rating / 20
                   WHEN i.average_rating > 5 THEN i.average_rating / 2
                   ELSE i.average_rating
                 END, 2) END
             )
           END,
           0
         )::NUMERIC,
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
         AND (
           pg_catalog.lower(i.name) LIKE ''%%'' || pg_catalog.lower($2) || ''%%'' ESCAPE ''\''
           OR pg_catalog.lower(i.name) OPERATOR(%I.%%) pg_catalog.lower($1)
           OR pg_catalog.lower($1) OPERATOR(%I.<%%) pg_catalog.lower(i.name)
           OR (
             COALESCE(i.brand, '''') || '' '' ||
             COALESCE(i.name, '''') || '' '' ||
             COALESCE(i.model, '''') || '' '' ||
             COALESCE(i.item_key, '''') || '' '' ||
             COALESCE(i.key_specs ->> ''chip'', '''') || '' '' ||
             COALESCE(i.specifications #>> ''{hardware,chipset}'', '''')
           ) ILIKE ''%%'' || $2 || ''%%'' ESCAPE ''\''
           OR (
             COALESCE(i.brand, '''') || '' '' ||
             COALESCE(i.name, '''') || '' '' ||
             COALESCE(i.model, '''') || '' '' ||
             COALESCE(i.item_key, '''') || '' '' ||
             COALESCE(i.key_specs ->> ''chip'', '''') || '' '' ||
             COALESCE(i.specifications #>> ''{hardware,chipset}'', '''')
           ) OPERATOR(%I.%%) $1
         )
         AND EXISTS (SELECT 1 FROM rate.master_products m
                     WHERE m.item_id = i.id AND m.status = ''published'')
     ) s
     WHERE s.score >= 0.2
     ORDER BY s.score DESC, s.id
     LIMIT $3',
    v_trgm_schema, v_trgm_schema, v_trgm_schema, v_trgm_schema, v_trgm_schema
  ) USING v_clean_q, v_escaped_q, v_limit;
END $$;

-- 5. Least-privilege grants (explicitly revoking PUBLIC, authenticator, rate_worker) -----------

REVOKE ALL ON FUNCTION rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.get_category_brand_facets_v2(UUID)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
REVOKE ALL ON FUNCTION rate.search_catalog_autocomplete_v2(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;

GRANT EXECUTE ON FUNCTION rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER, TEXT
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.get_category_brand_facets_v2(UUID)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.search_catalog_autocomplete_v2(TEXT, INTEGER)
  TO anon, authenticated, service_role;

DO $$
DECLARE
  v_auth_oid oid := pg_catalog.to_regrole('authenticator');
  v_proc text;
  v_proc_oid regprocedure;
BEGIN
  IF v_auth_oid IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_proc IN ARRAY ARRAY[
    'rate.search_items_v1(uuid,text[],text,numeric,numeric,numeric,integer[],boolean,text,integer,integer,text)',
    'rate.get_category_brand_facets_v2(uuid)',
    'rate.search_catalog_autocomplete_v2(text,integer)'
  ] LOOP
    v_proc_oid := pg_catalog.to_regprocedure(v_proc);
    IF v_proc_oid IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = v_proc_oid AND a.grantee = v_auth_oid
    ) THEN
      RAISE EXCEPTION 'authenticator EXECUTE privilege remains on function % (current_user=%)', v_proc, current_user;
    END IF;
  END LOOP;
END $$;

COMMIT;
