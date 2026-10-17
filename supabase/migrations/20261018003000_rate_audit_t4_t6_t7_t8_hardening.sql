-- ==============================================================================
-- Migration: Rate Schema Audit T4, T6, T7, T8 Hardening (DOS/Rate Issue #176)
-- - Audit T4: SECURITY INVOKER + SET search_path = '' on search RPC & view
-- - Audit T6: BRIN index on rate.price_history(recorded_at) + NOT NULL default
-- - Audit T7: Foreign-key B-tree indexes & escaped ILIKE wildcards in search RPC
-- - Audit T8: Soft-delete archived_at on rate.merchants & ON DELETE RESTRICT on products_merchant_id_fkey
-- (Open-Core reference migration; official ledger deployed via DOS-Me)
-- ==============================================================================

-- 1. Audit T4: Ensure v_products_with_merchant_trust runs as SECURITY INVOKER
ALTER VIEW IF EXISTS rate.v_products_with_merchant_trust SET (security_invoker = true);

-- 2. Audit T6: Ensure recorded_at on rate.price_history has a default, backfill NULLs, and add BRIN index
UPDATE rate.price_history
   SET recorded_at = now()
 WHERE recorded_at IS NULL;

ALTER TABLE rate.price_history
  ALTER COLUMN recorded_at SET DEFAULT now(),
  ALTER COLUMN recorded_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at_brin
  ON rate.price_history USING brin (recorded_at);

CREATE INDEX IF NOT EXISTS idx_rate_price_history_product_time
  ON rate.price_history (product_id, recorded_at DESC);

-- 3. Audit T7: Add missing B-tree indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_rate_categories_parent_id
  ON rate.categories (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rate_products_category
  ON rate.products (category_id)
  WHERE category_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'rate' AND table_name = 'master_products'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_master_products_category_id ON rate.master_products (category_id) WHERE category_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'rate' AND table_name = 'reviews' AND column_name = 'author_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rate_reviews_author_id ON rate.reviews (author_id) WHERE author_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'rate' AND table_name = 'price_alerts' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rate_price_alerts_user_id ON rate.price_alerts (user_id) WHERE user_id IS NOT NULL';
  END IF;
END $$;

-- 4. Audit T8: Soft-delete archived_at on rate.merchants & ON DELETE RESTRICT on rate.products(merchant_id)
ALTER TABLE rate.merchants
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'rate'
       AND t.relname = 'products'
       AND c.conname = 'products_merchant_id_fkey'
       AND c.confdeltype <> 'r'
  ) THEN
    ALTER TABLE rate.products DROP CONSTRAINT products_merchant_id_fkey;
    ALTER TABLE rate.products
      ADD CONSTRAINT products_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES rate.merchants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5. Audit T4 & T7: rate.search_catalog_autocomplete gets SET search_path = '' and escaped ILIKE wildcards.
--    It stays SECURITY DEFINER: pg_trgm lives in schema `sign` on prod, where anon
--    has no USAGE, so an INVOKER version fails with "permission denied for schema
--    sign" for every anonymous search. It reads only published catalog rows.
CREATE OR REPLACE FUNCTION rate.search_catalog_autocomplete(
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
  v_clean_q TEXT := pg_catalog.btrim(COALESCE(p_query, ''));
  v_escaped_q TEXT;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);
BEGIN
  -- Escape LIKE/ILIKE metacharacters (\, %, _) per Audit T7
  v_escaped_q := pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(v_clean_q, '\', '\\'),
      '%',
      '\%'
    ),
    '_',
    '\_'
  );

  SELECT n.nspname INTO v_trgm_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';

  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate.search_catalog_autocomplete: pg_trgm extension is not installed';
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'WITH product_matches AS (
       SELECT
         ''product''::TEXT AS entity_kind,
         m.id,
         m.slug,
         m.name AS title,
         COALESCE(m.key_specs->>''chip'', m.variant_name, m.model) AS subtitle,
         m.brand AS brand_or_platform,
         COALESCE(m.thumbnail, m.images[1]) AS thumbnail,
         m.min_price,
         m.max_price,
         COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) AS rating,
         COALESCE(NULLIF(m.authentic_review_count, 0), m.total_reviews, 0) AS review_count,
         COALESCE(m.merchant_count, 1) AS merchant_or_official_count,
         GREATEST(
           %I.similarity(pg_catalog.lower(m.name), pg_catalog.lower($1)),
           %I.similarity(pg_catalog.lower(COALESCE(m.brand, '''') || '' '' || COALESCE(m.model, '''')), pg_catalog.lower($1)),
           CASE WHEN pg_catalog.lower(m.name) LIKE ''%%'' || pg_catalog.lower($2) || ''%%'' ESCAPE ''\'' THEN 0.75::real ELSE 0.0::real END
         ) AS similarity_score
       FROM rate.master_products m
       WHERE m.status = ''published''
         AND (
           $1 = ''''
           OR m.name ILIKE ''%%'' || $2 || ''%%'' ESCAPE ''\''
           OR m.brand ILIKE ''%%'' || $2 || ''%%'' ESCAPE ''\''
           OR m.model ILIKE ''%%'' || $2 || ''%%'' ESCAPE ''\''
           OR m.model_key ILIKE ''%%'' || $2 || ''%%'' ESCAPE ''\''
           OR %I.similarity(pg_catalog.lower(m.name), pg_catalog.lower($1)) >= 0.2
         )
     )
     SELECT *
     FROM product_matches
     ORDER BY similarity_score DESC, min_price ASC
     LIMIT $3',
    v_trgm_schema, v_trgm_schema, v_trgm_schema
  )
  USING v_clean_q, v_escaped_q, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION rate.search_catalog_autocomplete(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate.search_catalog_autocomplete(TEXT, INTEGER) TO anon, authenticated, service_role;
