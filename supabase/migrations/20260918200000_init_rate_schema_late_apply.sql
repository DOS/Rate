-- ==============================================================================
-- Schema: rate (E-commerce, Products, Reviews, Price History & Merchant Trust)
-- Idempotent DDL for Supabase (ecosystem shared instance with dosafe & public)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS rate;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ------------------------------------------------------------------------------
-- 1. Merchants (Shops / Sellers across platforms)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,                         -- 'shopee', 'tiki', 'lazada', 'tiktok', 'web'
  platform_shop_id TEXT NOT NULL,                 -- Shop ID on origin platform
  name TEXT NOT NULL,
  slug TEXT,
  url TEXT,
  is_official BOOLEAN DEFAULT false,              -- Shopee Mall, Tiki Official, LazMall
  rating_star NUMERIC(3, 2) CHECK (rating_star IS NULL OR (rating_star >= 0 AND rating_star <= 5)),
  follower_count INTEGER DEFAULT 0,
  location TEXT,
  phone TEXT,
  bank_account TEXT,
  bank_name TEXT,
  entity_hash TEXT,                               -- SHA-256 for instant lookup against dosafe.threat_intel
  risk_score INTEGER DEFAULT 0,                   -- Synced / cached from DOSafe threat intelligence
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_merchant_platform_shop UNIQUE (platform, platform_shop_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_merchants_platform ON rate.merchants (platform);
CREATE INDEX IF NOT EXISTS idx_rate_merchants_entity_hash ON rate.merchants (entity_hash);
-- pg_trgm's operator class is schema-qualified per installation: production
-- keeps the extension in schema "sign" while fresh installs use "extensions",
-- so an unqualified gin_trgm_ops is not always on the session search_path
-- (SQLSTATE 42704 on replay). Resolve the extension's actual schema.
DO $rate_merchants_trgm$
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

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_rate_merchants_name_trgm ON rate.merchants USING gin (name %I.gin_trgm_ops)',
    v_trgm_schema
  );
END
$rate_merchants_trgm$;

-- ------------------------------------------------------------------------------
-- 2. Categories
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES rate.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_categories_slug ON rate.categories (slug);

-- ------------------------------------------------------------------------------
-- 3. Products
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES rate.merchants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES rate.categories(id) ON DELETE SET NULL,
  brand TEXT,
  price_current NUMERIC(15, 2) NOT NULL,
  price_original NUMERIC(15, 2),
  price_min NUMERIC(15, 2),
  price_max NUMERIC(15, 2),
  currency TEXT DEFAULT 'VND',
  historical_sold INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  rating_star NUMERIC(3, 2) DEFAULT 0 CHECK (rating_star IS NULL OR (rating_star >= 0 AND rating_star <= 5)),
  rating_count INTEGER DEFAULT 0,
  images TEXT[] DEFAULT '{}',
  models JSONB DEFAULT '[]'::jsonb,               -- SKUs / variations: [{modelId, name, price, stock}]
  attributes JSONB DEFAULT '{}'::jsonb,           -- Specifications
  url TEXT NOT NULL,
  cluster_id UUID,                                -- Master product cluster (Splink deduplication ID)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_product_platform_item UNIQUE (platform, platform_item_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_products_merchant ON rate.products (merchant_id);
CREATE INDEX IF NOT EXISTS idx_rate_products_category ON rate.products (category_id);
CREATE INDEX IF NOT EXISTS idx_rate_products_cluster ON rate.products (cluster_id);
CREATE INDEX IF NOT EXISTS idx_rate_products_price ON rate.products (price_current);
DO $rate_products_trgm$
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

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_rate_products_title_trgm ON rate.products USING gin (title %I.gin_trgm_ops)',
    v_trgm_schema
  );
END
$rate_products_trgm$;

-- ------------------------------------------------------------------------------
-- 4. Price History (Time-series / Price tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.price_history (
  id BIGSERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES rate.products(id) ON DELETE CASCADE,
  price NUMERIC(15, 2) NOT NULL,
  price_original NUMERIC(15, 2),
  recorded_at TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'crawler'
);

CREATE INDEX IF NOT EXISTS idx_rate_price_history_product_time ON rate.price_history (product_id, recorded_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Reviews
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES rate.products(id) ON DELETE CASCADE,
  platform_review_id TEXT,
  author_name TEXT,
  author_avatar TEXT,
  rating_star SMALLINT NOT NULL CHECK (rating_star BETWEEN 1 AND 5),
  comment TEXT,
  variation TEXT,
  images TEXT[] DEFAULT '{}',
  is_verified_buyer BOOLEAN DEFAULT true,
  platform_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_reviews_product ON rate.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_rate_reviews_rating ON rate.reviews (rating_star);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_reviews_platform_review ON rate.reviews (product_id, platform_review_id) WHERE platform_review_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 6. AI Review Analysis (Qwen 3.5 summary & authenticity detection)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.review_analysis (
  product_id UUID PRIMARY KEY REFERENCES rate.products(id) ON DELETE CASCADE,
  total_reviews_analyzed INTEGER DEFAULT 0,
  authenticity_score NUMERIC(5, 2) DEFAULT 100.00 CHECK (authenticity_score IS NULL OR (authenticity_score >= 0 AND authenticity_score <= 100)),
  sentiment_positive_ratio NUMERIC(5, 2) CHECK (sentiment_positive_ratio IS NULL OR (sentiment_positive_ratio >= 0 AND sentiment_positive_ratio <= 100)),
  pros TEXT[] DEFAULT '{}',                        -- Pros extracted by Qwen 3.5
  cons TEXT[] DEFAULT '{}',                        -- Cons / complaints extracted by Qwen 3.5
  ai_summary TEXT,                                 -- Executive AI synthesis of all reviews
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 7. Cross-schema View with DOSafe Threat Intelligence
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW rate.v_products_with_merchant_trust AS
-- Deliberately NOT security_invoker: the view joins dosafe.threat_intel, whose
-- table grant is intentionally not given to anon/authenticated (internal risk
-- data, owned by the DOSafe schema). Running with owner privileges keeps the
-- join working for every reader while the view only exposes the safe columns
-- listed below - none of the merchants PII (phone, bank_account, bank_name).
SELECT 
  p.id,
  p.merchant_id,
  p.platform,
  p.platform_item_id,
  p.title,
  p.description,
  p.category_id,
  p.brand,
  p.price_current,
  p.price_original,
  p.price_min,
  p.price_max,
  p.currency,
  p.historical_sold,
  p.stock,
  p.rating_star,
  p.rating_count,
  p.images,
  p.models,
  p.attributes,
  p.url,
  p.cluster_id,
  p.metadata,
  p.created_at,
  p.updated_at,
  m.name AS merchant_name,
  m.is_official AS merchant_is_official,
  m.location AS merchant_location,
  COALESCE(t.risk_score, m.risk_score, 0) AS threat_risk_score,
  t.category AS threat_category,
  t.source AS threat_source
FROM rate.products p
JOIN rate.merchants m ON p.merchant_id = m.id
LEFT JOIN dosafe.threat_intel t ON t.entity_hash = m.entity_hash;

-- ------------------------------------------------------------------------------
-- 8. Row Level Security (RLS) & Policies
-- ------------------------------------------------------------------------------
ALTER TABLE rate.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.review_analysis ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS "Public can view merchants" ON rate.merchants;
CREATE POLICY "Public can view merchants" ON rate.merchants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view categories" ON rate.categories;
CREATE POLICY "Public can view categories" ON rate.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view products" ON rate.products;
CREATE POLICY "Public can view products" ON rate.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view price_history" ON rate.price_history;
CREATE POLICY "Public can view price_history" ON rate.price_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view reviews" ON rate.reviews;
CREATE POLICY "Public can view reviews" ON rate.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view review_analysis" ON rate.review_analysis;
CREATE POLICY "Public can view review_analysis" ON rate.review_analysis FOR SELECT USING (true);

-- Service role full access policies
DROP POLICY IF EXISTS "Service role write merchants" ON rate.merchants;
CREATE POLICY "Service role write merchants" ON rate.merchants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write categories" ON rate.categories;
CREATE POLICY "Service role write categories" ON rate.categories FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write products" ON rate.products;
CREATE POLICY "Service role write products" ON rate.products FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write price_history" ON rate.price_history;
CREATE POLICY "Service role write price_history" ON rate.price_history FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write reviews" ON rate.reviews;
CREATE POLICY "Service role write reviews" ON rate.reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write review_analysis" ON rate.review_analysis;
CREATE POLICY "Service role write review_analysis" ON rate.review_analysis FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. Grants
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA rate TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA rate TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rate TO service_role;
-- Public read, EXCEPT the merchants PII columns (phone, bank_account,
-- bank_name): those stay service_role-only. rate.merchants gets COLUMN-level
-- grants only (a full-table grant could not be narrowed by a column revoke);
-- every other rate table gets a plain full-table SELECT.
REVOKE SELECT ON rate.merchants FROM anon, authenticated;
GRANT SELECT (id, platform, platform_shop_id, name, slug, url, is_official, rating_star,
              follower_count, location, entity_hash, risk_score, metadata,
              created_at, updated_at)
  ON rate.merchants TO anon, authenticated;
GRANT SELECT ON rate.categories, rate.products, rate.price_history, rate.reviews, rate.review_analysis
  TO anon, authenticated;
-- The trust view exposes only safe columns (merchant name/official/location +
-- threat risk fields), never the PII columns above.
GRANT SELECT ON rate.v_products_with_merchant_trust TO anon, authenticated;

-- Late-apply re-add of the rate schema. The original migration
-- 20260912120000_init_rate_schema.sql was merged in #788 but carries a
-- timestamp OLDER than migrations already applied to production
-- (supabase db push skips out-of-order older-timestamp files by default),
-- so it never reached any live environment. This copy is byte-identical
-- content-wise and fully idempotent: on a fresh environment both files
-- run (the second is a no-op); on the shared prod/beta this file is the
-- one that actually creates the schema. Tested in disposable Postgres:
-- replays cleanly, anon is blocked on merchants PII columns, the trust
-- view is readable.
