-- ==============================================================================
-- rate: recover master_products + match_master_product into the DOS-Me ledger
--
-- Baseline-contract recovery (Rate repo plan v7, §2). The live prod objects were
-- created out-of-band (never in any committed migration). This file re-states
-- them EXACTLY as verified against prod on 2026-10-05 via information_schema,
-- pg_proc and pg_indexes dumps, then asserts a full contract guard that ABORTS
-- on any mismatch instead of letting IF NOT EXISTS silently no-op over drift.
--
-- Verified live facts baked into this file:
--   * master_products has 28 columns (see contract guard at the bottom)
--   * UNIQUE constraints on model_key and slug already exist on prod -> the
--     idempotent re-creates below are no-ops there, but they make a FRESH
--     replay (branch preview) able to build the same shape from zero.
--   * pg_trgm is installed in the `sign` schema on this instance, hence
--     sign.gin_trgm_ops / sign.similarity (NOT public).
--   * RLS is enabled on master_products with two policies (public SELECT,
--     service_role ALL). force_rls is OFF.
--   * match_master_product signature (from pg_proc):
--     (search_title text, p_brand text DEFAULT NULL, p_model text DEFAULT NULL,
--      p_storage_gb numeric DEFAULT NULL, p_similarity_threshold real DEFAULT 0.4)
--     RETURNS TABLE(master_id uuid, name text, brand text, model text,
--                   similarity real, model_key text), STABLE, invoker rights.
--   * rate.products.cluster_id already has fk_products_cluster_id -> §2.4b is a
--     no-op here; the guard still verifies it.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS rate.master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant_name TEXT,
  model_key TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  ram_gb NUMERIC,
  storage_gb NUMERIC,
  screen_size_inch NUMERIC,
  battery_mah NUMERIC,
  has_5g BOOLEAN DEFAULT false,
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  key_specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  images TEXT[] DEFAULT '{}'::text[],
  thumbnail TEXT,
  colors TEXT[] DEFAULT '{}'::text[],
  min_price NUMERIC(15, 2) DEFAULT 0,
  max_price NUMERIC(15, 2) DEFAULT 0,
  merchant_count INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  average_rating NUMERIC(3, 2) DEFAULT 0,
  status TEXT DEFAULT 'published',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Constraints (idempotent: Postgres has no ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_category_id_fkey') THEN
    ALTER TABLE rate.master_products
      ADD CONSTRAINT master_products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES rate.categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_model_key_key') THEN
    -- Pre-check for duplicates so the constraint cannot fail mid-migration.
    IF EXISTS (SELECT 1 FROM rate.master_products GROUP BY model_key HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'rate.master_products has duplicate model_key values; dedupe before running this migration';
    END IF;
    ALTER TABLE rate.master_products
      ADD CONSTRAINT master_products_model_key_key UNIQUE (model_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_slug_key') THEN
    ALTER TABLE rate.master_products
      ADD CONSTRAINT master_products_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_status_check') THEN
    ALTER TABLE rate.master_products
      ADD CONSTRAINT master_products_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));
  END IF;
END $$;

-- Indexes (idempotent by name; matches prod exactly, including the
-- redundant idx_master_products_model_key that prod carries).
-- pg_trgm's operator class is schema-qualified per installation (prod keeps
-- the extension in schema "sign"; fresh replays may install elsewhere), so the
-- trgm index resolves the extension schema dynamically - same pattern as
-- 20260912120000_init_rate_schema.sql.
CREATE INDEX IF NOT EXISTS idx_master_products_model_key ON rate.master_products USING btree (model_key);
CREATE INDEX IF NOT EXISTS idx_master_products_brand ON rate.master_products USING btree (brand);
CREATE INDEX IF NOT EXISTS idx_master_products_category ON rate.master_products USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_master_products_slug ON rate.master_products USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_master_products_price ON rate.master_products USING btree (min_price, max_price);

DO $rate_master_trgm$
DECLARE
  v_trgm_schema text;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate master_products recovery: pg_trgm extension is not installed';
  END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_master_products_name_trgm ON rate.master_products USING gin (name %I.gin_trgm_ops)',
    v_trgm_schema
  );
END
$rate_master_trgm$;

CREATE INDEX IF NOT EXISTS idx_master_products_specs ON rate.master_products USING gin (specifications jsonb_path_ops);

-- RLS + policies (matches prod: enabled, not forced, two policies)
ALTER TABLE rate.master_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view master_products" ON rate.master_products;
CREATE POLICY "Public can view master_products" ON rate.master_products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write master_products" ON rate.master_products;
CREATE POLICY "Service role write master_products" ON rate.master_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants (matches prod grantees: anon, authenticated, service_role)
GRANT SELECT ON rate.master_products TO anon, authenticated;
GRANT ALL ON rate.master_products TO service_role;

-- match_master_product: re-stated with the VERIFIED live signature and
-- semantics (owner postgres, STABLE, invoker rights). The trgm similarity call
-- resolves the extension schema dynamically so this replay-identically on
-- fresh branches (where pg_trgm may not live in schema "sign" as on prod).
CREATE OR REPLACE FUNCTION rate.match_master_product(
  search_title text,
  p_brand text DEFAULT NULL::text,
  p_model text DEFAULT NULL::text,
  p_storage_gb numeric DEFAULT NULL::numeric,
  p_similarity_threshold real DEFAULT 0.4
)
RETURNS TABLE(master_id uuid, name text, brand text, model text, similarity real, model_key text)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_trgm_schema text;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  IF v_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'rate.match_master_product: pg_trgm extension is not installed';
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT
        mp.id AS master_id,
        mp.name,
        mp.brand,
        mp.model,
        %I.similarity(mp.name, $1) AS similarity,
        mp.model_key
    FROM rate.master_products mp
    WHERE
        ($2 IS NULL OR LOWER(mp.brand) = LOWER($2))
        AND ($3 IS NULL OR LOWER(mp.model) = LOWER($3))
        AND ($4 IS NULL OR mp.storage_gb = $4)
        AND %I.similarity(mp.name, $1) >= $5
    ORDER BY similarity DESC
    LIMIT 5',
    v_trgm_schema, v_trgm_schema
  )
  USING search_title, p_brand, p_model, p_storage_gb, p_similarity_threshold;
END;
$function$;

-- ==============================================================================
-- CONTRACT GUARD (plan v7 §2.3): abort on ANY drift between this baseline and
-- the live object. A silent no-op over a wrongly-shaped object is the failure
-- mode this migration exists to prevent.
-- ==============================================================================
DO $$
DECLARE
  expected_cols text[] := ARRAY[
    'id','category_id','brand','model','variant_name','model_key','name','slug',
    'description','ram_gb','storage_gb','screen_size_inch','battery_mah','has_5g',
    'specifications','key_specs','images','thumbnail','colors','min_price','max_price',
    'merchant_count','total_reviews','average_rating','status','metadata','created_at','updated_at'
  ];
  live_cols text[];
  missing text[];
  fk_exists boolean;
  rls_on boolean;
  rpc_signature text;
  rpc_ok boolean;
  v_mismatch bigint;
BEGIN
  -- 1. Column contract: names AND types (Codex #7 - a wrong-typed column must fail the guard)
  SELECT array_agg(c.column_name ORDER BY c.ordinal_position)
    INTO live_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'rate' AND c.table_name = 'master_products';
  IF live_cols IS NULL THEN
    RAISE EXCEPTION 'rate.master_products does not exist after CREATE TABLE IF NOT EXISTS';
  END IF;
  SELECT array_agg(x) INTO missing
    FROM (SELECT unnest(expected_cols) AS x EXCEPT SELECT unnest(live_cols)) d;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'master_products drift: missing columns %', missing;
  END IF;
  -- Full type-exact contract: every column's resolved type (incl. precision
  -- and array element type) must match, so numeric(3,2) masquerading as
  -- numeric(15,2) or a text max_price cannot pass (Codex round-2 #7).
  SELECT count(*) INTO v_mismatch
    FROM (
      SELECT c.column_name, format_type(a.atttypid, a.atttypmod) AS actual_type
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name AND cl.relnamespace = 'rate'::regnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = c.column_name AND NOT a.attisdropped
      WHERE c.table_schema = 'rate' AND c.table_name = 'master_products'
    ) live
    FULL OUTER JOIN (VALUES
      ('id','uuid'), ('category_id','uuid'), ('brand','text'), ('model','text'),
      ('variant_name','text'), ('model_key','text'), ('name','text'), ('slug','text'),
      ('description','text'), ('ram_gb','numeric'), ('storage_gb','numeric'),
      ('screen_size_inch','numeric'), ('battery_mah','numeric'), ('has_5g','boolean'),
      ('specifications','jsonb'), ('key_specs','jsonb'), ('images','text[]'),
      ('thumbnail','text'), ('colors','text[]'), ('min_price','numeric(15,2)'),
      ('max_price','numeric(15,2)'), ('merchant_count','integer'),
      ('total_reviews','integer'), ('average_rating','numeric(3,2)'),
      ('status','text'), ('metadata','jsonb'),
      ('created_at','timestamp with time zone'), ('updated_at','timestamp with time zone')
    ) expected(column_name, expected_type)
      ON live.column_name = expected.column_name
    WHERE live.actual_type IS DISTINCT FROM expected.expected_type;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'master_products drift: % column(s) have unexpected types', v_mismatch;
  END IF;

  -- 2. Constraint contract
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_model_key_key' AND contype = 'u') THEN
    RAISE EXCEPTION 'master_products drift: unique constraint master_products_model_key_key missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_status_check') THEN
    RAISE EXCEPTION 'master_products drift: status CHECK constraint missing';
  END IF;

  -- 3. products.cluster_id FK (plan v7 §2.4b): exists+validated on prod, but a
  -- fresh ledger replay must CREATE it here - the guard only asserts validity.
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.products'::regclass AND conname = 'fk_products_cluster_id' AND contype = 'f' AND convalidated)
    INTO fk_exists;
  IF NOT fk_exists THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.products'::regclass AND conname = 'fk_products_cluster_id' AND contype = 'f') THEN
      ALTER TABLE rate.products VALIDATE CONSTRAINT fk_products_cluster_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM rate.products p
        LEFT JOIN rate.master_products mp ON p.cluster_id = mp.id
        WHERE p.cluster_id IS NOT NULL AND mp.id IS NULL
      ) THEN
        RAISE EXCEPTION 'products.cluster_id has orphan values; aborting before FK creation (mapping preserved, manual decision required)';
      END IF;
      ALTER TABLE rate.products
        ADD CONSTRAINT fk_products_cluster_id
        FOREIGN KEY (cluster_id) REFERENCES rate.master_products(id) NOT VALID;
      ALTER TABLE rate.products VALIDATE CONSTRAINT fk_products_cluster_id;
    END IF;
  END IF;

  -- 4. RLS contract
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'rate.master_products'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'master_products drift: RLS not enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'master_products' AND policyname = 'Public can view master_products') THEN
    RAISE EXCEPTION 'master_products drift: public SELECT policy missing';
  END IF;

  -- 5. RPC signature contract (identity arguments must match the verified live shape)
  SELECT pg_get_function_identity_arguments(p.oid)
    INTO rpc_signature
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'rate' AND p.proname = 'match_master_product'
      AND pg_get_function_result(p.oid) = 'TABLE(master_id uuid, name text, brand text, model text, similarity real, model_key text)';
  rpc_ok := (rpc_signature = 'search_title text, p_brand text, p_model text, p_storage_gb numeric, p_similarity_threshold real');
  IF NOT rpc_ok THEN
    RAISE EXCEPTION 'match_master_product drift: unexpected signature "%"', coalesce(rpc_signature, '<not found>');
  END IF;

  RAISE NOTICE 'rate.master_products contract guard PASSED (% columns, constraints, RLS, RPC verified)', array_length(live_cols, 1);
END $$;
