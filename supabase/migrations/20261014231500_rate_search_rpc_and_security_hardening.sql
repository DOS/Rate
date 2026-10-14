-- ==============================================================================
-- Migration: Rate Schema Security Hardening, Duplicate Index Cleanup & Fast Search RPC
-- (DOS/Rate Issue #18 - Open-Core Reference Migration; deploy via DOS-Me ledger)
-- ==============================================================================

-- 1. Security Hardening: Revoke excessive write/truncate privileges from anon & authenticated
--    (Audit finding: anon/authenticated had INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER table grants)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON ALL TABLES IN SCHEMA rate FROM anon, authenticated;

-- 2. PII Column Protection on rate.merchants:
--    Revoke table-wide SELECT and re-grant only public, non-PII columns
--    (Protects phone, bank_account, bank_name, entity_hash from anon key scraping)
REVOKE SELECT ON rate.merchants FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'rate' AND table_name = 'merchants' AND column_name = 'review_risk_score'
  ) THEN
    EXECUTE 'GRANT SELECT (
      id, platform, platform_shop_id, name, slug, url, is_official,
      rating_star, follower_count, location, risk_score,
      review_risk_score, review_risk_breakdown, review_risk_updated_at,
      metadata, created_at, updated_at
    ) ON rate.merchants TO anon, authenticated';
  ELSE
    EXECUTE 'GRANT SELECT (
      id, platform, platform_shop_id, name, slug, url, is_official,
      rating_star, follower_count, location, risk_score,
      metadata, created_at, updated_at
    ) ON rate.merchants TO anon, authenticated';
  END IF;
END $$;

-- 3. Drop Redundant / Duplicate Indexes identified during pg_indexes audit
--    - categories_slug_key already provides unique B-tree on rate.categories(slug)
--    - master_products_model_key_key already provides unique B-tree on rate.master_products(model_key)
--    - master_products_slug_key already provides unique B-tree on rate.master_products(slug)
--    - idx_rate_products_cluster already indexes rate.products(cluster_id)
DROP INDEX IF EXISTS rate.idx_rate_categories_slug;
DROP INDEX IF EXISTS rate.idx_master_products_model_key;
DROP INDEX IF EXISTS rate.idx_master_products_slug;
DROP INDEX IF EXISTS rate.idx_products_cluster_id;

-- 4. Add Composite & Full-Text/Trigram Indexes for Web BFF & REST API v1
CREATE INDEX IF NOT EXISTS idx_master_products_status_cat_price
  ON rate.master_products (status, category_id, min_price);

CREATE INDEX IF NOT EXISTS idx_master_products_status_rating
  ON rate.master_products (status, user_rating_weighted DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_master_products_search_trgm
  ON rate.master_products
  USING gin (
    (
      COALESCE(brand, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      COALESCE(model, '') || ' ' ||
      COALESCE(model_key, '')
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_rate_merchants_slug
  ON rate.merchants (slug)
  WHERE slug IS NOT NULL;

-- 5. Fast Unified Catalog & Merchant Search RPC for Hero Autocomplete & Extension
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = rate, public, pg_temp
AS $$
  WITH cleaned AS (
    SELECT trim(COALESCE(p_query, '')) AS q,
           LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25) AS lim
  ),
  product_matches AS (
    SELECT
      'product'::TEXT AS entity_kind,
      m.id,
      m.slug,
      m.name AS title,
      COALESCE(m.key_specs->>'chip', m.variant_name, m.model) AS subtitle,
      m.brand AS brand_or_platform,
      COALESCE(m.thumbnail, m.images[1]) AS thumbnail,
      m.min_price,
      m.max_price,
      COALESCE(NULLIF(m.user_rating_weighted, 0), m.average_rating, 0) AS rating,
      COALESCE(NULLIF(m.authentic_review_count, 0), m.total_reviews, 0) AS review_count,
      COALESCE(m.merchant_count, 1) AS merchant_or_official_count,
      GREATEST(
        similarity(lower(m.name), lower(c.q)),
        similarity(lower(COALESCE(m.brand, '') || ' ' || COALESCE(m.model, '')), lower(c.q)),
        CASE WHEN lower(m.name) LIKE '%' || lower(c.q) || '%' THEN 0.75::real ELSE 0.0::real END
      ) AS similarity_score
    FROM rate.master_products m
    CROSS JOIN cleaned c
    WHERE m.status = 'published'
      AND (
        c.q = ''
        OR m.name ILIKE '%' || c.q || '%'
        OR m.brand ILIKE '%' || c.q || '%'
        OR m.model ILIKE '%' || c.q || '%'
        OR m.model_key ILIKE '%' || c.q || '%'
        OR similarity(lower(m.name), lower(c.q)) >= 0.2
      )
  )
  SELECT *
  FROM product_matches
  ORDER BY similarity_score DESC, min_price ASC
  LIMIT (SELECT lim FROM cleaned);
$$;

GRANT EXECUTE ON FUNCTION rate.search_catalog_autocomplete(TEXT, INTEGER) TO anon, authenticated, service_role;
