-- =============================================================================
-- Migration: 20261209100000_rate_extension_observations_item_id_128.sql
-- Purpose (DOS/DOS.Me#1987, DOS/Rate#1890): widen
-- rate.extension_observations.external_item_id from 64 to 128 characters
-- (`^[A-Za-z0-9_.-]{1,128}$`) in both the table CHECK constraint
-- (`extension_observations_external_item_id_check`) and
-- `rate.submit_extension_observation(text, uuid, jsonb, text)` via a dedicated
-- `c_item_id_pattern` constant, matching DOS/Rate retail extractors (up to 120
-- chars for retail chains and 128 chars for `anphatpc` via
-- `sanitizeAnPhatItemId`). `external_shop_id` and `sku_id` retain the
-- 64-character `c_id_pattern` bound and unchanged table CHECK constraints.
-- Approved by JOY on 2026-11-26 in the Rate Core PO chat for opening the
-- DOS/DOS.Me dev migration PR.
--
-- Monotonic timestamp: 20261209100000 (> 20261208130000 on dev and
-- > 20261208100000 on main), avoiding out-of-order skips.
--
-- Verify:
--   1. scripts/ops/rate-extension-observations-verify.sql (V1 to V12 return 0).
--   2. scripts/migration/test-rate-schema-replay.mjs (Docker PostgreSQL 17).
--   3. Direct constraint & function check:
--      SELECT c.conname, c.convalidated, pg_catalog.pg_get_constraintdef(c.oid)
--      FROM pg_catalog.pg_constraint c
--      WHERE c.conrelid = 'rate.extension_observations'::regclass
--        AND c.conname IN (
--          'extension_observations_external_item_id_check',
--          'extension_observations_external_shop_id_check',
--          'extension_observations_sku_id_check'
--        )
--      ORDER BY c.conname;
--
-- Rollback (to 64 characters only, via a committed DOS/DOS.Me migration):
--   1. Ensure DOS/Rate EXTENSION_OBSERVATION_LIMITS.idMax is 64 first, then delete or
--      archive any rows in rate.extension_observations where
--      char_length(external_item_id) > 64.
--   2. Re-apply `20261204120000_rate_extension_observations_22_platforms_late_apply.sql`
--      and restore `extension_observations_external_item_id_check` to
--      `CHECK (external_item_id ~ '^[A-Za-z0-9_.-]{1,64}$')`.
--
-- Separate operation (full quarantine teardown; drops all extension observation tables,
-- submitters, ingest key row, and RPCs):
--   scripts/ops/rate-extension-observations-rollback.sql.
--
-- Idempotent: named pg_constraint lookup for extension_observations_external_item_id_check
-- (installed NOT VALID inside the short DDL transaction and validated post-commit under
-- SHARE UPDATE EXCLUSIVE), CREATE OR REPLACE FUNCTION, and EXECUTE grants restated on every
-- run.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Widen extension_observations_external_item_id_check to 128 characters (guarded, NOT VALID) -

DO $$
DECLARE
  v_condef TEXT;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO v_condef
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'rate.extension_observations'::regclass
    AND c.conname = 'extension_observations_external_item_id_check'
    AND c.contype = 'c';

  IF v_condef IS DISTINCT FROM 'CHECK ((external_item_id ~ ''^[A-Za-z0-9_.-]{1,128}$''::text))'
     AND v_condef IS DISTINCT FROM 'CHECK ((external_item_id ~ ''^[A-Za-z0-9_.-]{1,128}$''::text)) NOT VALID' THEN
    IF v_condef IS NOT NULL THEN
      ALTER TABLE rate.extension_observations
        DROP CONSTRAINT extension_observations_external_item_id_check;
    END IF;

    ALTER TABLE rate.extension_observations
      ADD CONSTRAINT extension_observations_external_item_id_check
      CHECK (external_item_id ~ '^[A-Za-z0-9_.-]{1,128}$') NOT VALID;
  END IF;
END $$;

-- 2. Recreate rate.submit_extension_observation with 128-char external_item_id bound -----------

CREATE OR REPLACE FUNCTION rate.submit_extension_observation(
  p_ingest_key text,
  p_submitter_id uuid,
  p_observation jsonb,
  p_network_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_keys constant text[] := ARRAY['schema_version', 'marketplace', 'listing_url',
    'external_item_id', 'external_shop_id', 'sku_id', 'variant_label', 'price_vnd',
    'list_price_vnd', 'stock_state', 'stock_qty', 'observed_at', 'extractor'];
  c_item_id_pattern constant text := '^[A-Za-z0-9_.-]{1,128}$';
  c_id_pattern constant text := '^[A-Za-z0-9_.-]{1,64}$';
  o jsonb := p_observation;
  v_marketplace text;
  v_url text;
  v_host text;
  v_host_ok boolean;
  v_item text;
  v_shop text;
  v_sku text;
  v_variant text;
  v_price bigint;
  v_list_price bigint;
  v_stock_state text;
  v_stock_qty integer;
  v_observed_text text;
  v_observed timestamptz;
  v_extractor jsonb;
  v_num numeric;
  v_now timestamptz := now();
  v_id bigint;
BEGIN
  -- The web's key has at least 32 characters; a shorter or missing one never reaches the hash.
  IF p_ingest_key IS NULL OR char_length(p_ingest_key) < 32 THEN
    RAISE EXCEPTION 'Extension ingest key refused' USING ERRCODE = '42501',
      DETAIL = 'ingest_key';
  END IF;
  IF (SELECT key_sha256 FROM rate.extension_ingest_secret WHERE id) IS DISTINCT FROM
       encode(sha256(convert_to(coalesce(p_ingest_key, ''), 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Extension ingest key refused' USING ERRCODE = '42501',
      DETAIL = 'ingest_key';
  END IF;

  IF p_network_hash IS NULL OR p_network_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid network hash' USING ERRCODE = '22023', DETAIL = 'network_hash';
  END IF;

  IF o IS NULL OR jsonb_typeof(o) <> 'object' OR octet_length(o::text) > 16384 THEN
    RAISE EXCEPTION 'Observation must be a JSON object' USING ERRCODE = '22023',
      DETAIL = 'observation';
  END IF;

  -- Any other key is refused as 'observation': a caller's key name is never echoed.
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(o) AS k WHERE k <> ALL (c_keys)) THEN
    RAISE EXCEPTION 'Unknown observation key' USING ERRCODE = '22023', DETAIL = 'observation';
  END IF;

  -- schema_version: exactly 1.
  -- A number is read only once its type is known, so a string never reaches the cast.
  v_num := CASE WHEN jsonb_typeof(o -> 'schema_version') = 'number'
                THEN (o ->> 'schema_version')::numeric END;
  IF v_num IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Unsupported schema_version' USING ERRCODE = '22023',
      DETAIL = 'schema_version';
  END IF;

  -- marketplace.
  v_marketplace := CASE WHEN jsonb_typeof(o -> 'marketplace') = 'string'
                        THEN o ->> 'marketplace' END;
  IF v_marketplace IS NULL OR v_marketplace NOT IN (
       'shopee', 'lazada', 'tiki', 'tiktok', 'cellphones', 'tgdd', 'fptshop',
       'hoangha', 'didongviet', 'phongvu',
       'dienmayxanh', 'topzone', 'gearvn', 'nguyenkim', 'shopdunk', 'hacom',
       'clickbuy', 'viettelstore', 'pico', 'mediamart', 'memoryzone', 'anphatpc') THEN
    RAISE EXCEPTION 'Unsupported marketplace' USING ERRCODE = '22023', DETAIL = 'marketplace';
  END IF;

  -- listing_url: https, at most 2048 characters, no query, fragment, path parameter (;), space
  -- (JavaScript's \s set) or control character; a lowercase host without user or port, from the marketplace's host table.
  v_url := CASE WHEN jsonb_typeof(o -> 'listing_url') = 'string' THEN o ->> 'listing_url' END;
  v_host := substring(v_url FROM '^https://([^/]*)');
  -- The host table (a CASE inside an IF condition would end the condition at its first THEN).
  v_host_ok := CASE v_marketplace
    WHEN 'shopee' THEN v_host = 'shopee.vn'
    WHEN 'lazada' THEN v_host ~ '^([a-z0-9-]+\.)*lazada\.vn$'
    WHEN 'tiki' THEN v_host = 'tiki.vn'
    WHEN 'tiktok' THEN v_host IN ('www.tiktok.com', 'shop.tiktok.com')
    WHEN 'cellphones' THEN v_host = 'cellphones.com.vn'
    WHEN 'tgdd' THEN v_host ~ '^([a-z0-9-]+\.)*thegioididong\.com$'
    WHEN 'fptshop' THEN v_host = 'fptshop.com.vn'
    WHEN 'hoangha' THEN v_host = 'hoanghamobile.com'
    WHEN 'didongviet' THEN v_host = 'didongviet.vn'
    WHEN 'phongvu' THEN v_host = 'phongvu.vn'
    WHEN 'dienmayxanh' THEN v_host ~ '^([a-z0-9-]+\.)*dienmayxanh\.com$'
    WHEN 'topzone' THEN v_host ~ '^([a-z0-9-]+\.)*topzone\.vn$'
    WHEN 'gearvn' THEN v_host ~ '^([a-z0-9-]+\.)*gearvn\.com$'
    WHEN 'nguyenkim' THEN v_host ~ '^([a-z0-9-]+\.)*nguyenkim\.com$'
    WHEN 'shopdunk' THEN v_host ~ '^([a-z0-9-]+\.)*shopdunk\.com$'
    WHEN 'hacom' THEN v_host ~ '^([a-z0-9-]+\.)*hacom\.vn$'
    WHEN 'clickbuy' THEN v_host ~ '^([a-z0-9-]+\.)*clickbuy\.com\.vn$'
    WHEN 'viettelstore' THEN v_host ~ '^([a-z0-9-]+\.)*viettelstore\.vn$'
    WHEN 'pico' THEN v_host ~ '^([a-z0-9-]+\.)*pico\.vn$'
    WHEN 'mediamart' THEN v_host ~ '^([a-z0-9-]+\.)*mediamart\.vn$'
    WHEN 'memoryzone' THEN v_host ~ '^([a-z0-9-]+\.)*memoryzone\.com\.vn$'
    WHEN 'anphatpc' THEN v_host ~ '^([a-z0-9-]+\.)*anphatpc\.com\.vn$'
    ELSE false END;
  IF v_url IS NULL OR char_length(v_url) > 2048
     OR v_url ~ '[?#;[:space:]\x01-\x1f\x7f-\x9f\xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000\xfeff]'
     OR v_host IS NULL OR v_host !~ '^[a-z0-9.-]+$'
     OR v_host_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid listing_url' USING ERRCODE = '22023', DETAIL = 'listing_url';
  END IF;

  -- The ids: 1 to 128 of [A-Za-z0-9_.-] for external_item_id; 1 to 64 for shop and SKU (which may be null).
  v_item := CASE WHEN jsonb_typeof(o -> 'external_item_id') = 'string'
                 THEN o ->> 'external_item_id' END;
  IF v_item IS NULL OR v_item !~ c_item_id_pattern THEN
    RAISE EXCEPTION 'Invalid external_item_id' USING ERRCODE = '22023',
      DETAIL = 'external_item_id';
  END IF;
  IF NOT o ? 'external_shop_id'
     OR COALESCE(jsonb_typeof(o -> 'external_shop_id'), 'null') NOT IN ('null', 'string')
     OR (o ->> 'external_shop_id') !~ c_id_pattern THEN
    RAISE EXCEPTION 'Invalid external_shop_id' USING ERRCODE = '22023',
      DETAIL = 'external_shop_id';
  END IF;
  v_shop := o ->> 'external_shop_id';
  IF NOT o ? 'sku_id'
     OR COALESCE(jsonb_typeof(o -> 'sku_id'), 'null') NOT IN ('null', 'string')
     OR (o ->> 'sku_id') !~ c_id_pattern THEN
    RAISE EXCEPTION 'Invalid sku_id' USING ERRCODE = '22023', DETAIL = 'sku_id';
  END IF;
  v_sku := o ->> 'sku_id';

  -- variant_label: null, or 1 to 120 characters without a control character.
  IF NOT o ? 'variant_label'
     OR COALESCE(jsonb_typeof(o -> 'variant_label'), 'null') NOT IN ('null', 'string')
     OR char_length(o ->> 'variant_label') NOT BETWEEN 1 AND 120
     OR (o ->> 'variant_label') ~ '[\x01-\x1f\x7f-\x9f]' THEN
    RAISE EXCEPTION 'Invalid variant_label' USING ERRCODE = '22023', DETAIL = 'variant_label';
  END IF;
  v_variant := o ->> 'variant_label';

  -- price_vnd: an integer from 1,000 to 2,000,000,000.
  v_num := CASE WHEN jsonb_typeof(o -> 'price_vnd') = 'number'
                THEN (o ->> 'price_vnd')::numeric END;
  IF v_num IS NULL OR v_num NOT BETWEEN 1000 AND 2000000000 OR v_num <> trunc(v_num) THEN
    RAISE EXCEPTION 'Invalid price_vnd' USING ERRCODE = '22023', DETAIL = 'price_vnd';
  END IF;
  v_price := v_num;

  -- list_price_vnd: null, or an integer from price_vnd to 2,000,000,000.
  v_num := CASE WHEN jsonb_typeof(o -> 'list_price_vnd') = 'number'
                THEN (o ->> 'list_price_vnd')::numeric END;
  IF NOT o ? 'list_price_vnd'
     OR COALESCE(jsonb_typeof(o -> 'list_price_vnd'), 'null') NOT IN ('null', 'number')
     OR v_num NOT BETWEEN v_price AND 2000000000 OR v_num <> trunc(v_num) THEN
    RAISE EXCEPTION 'Invalid list_price_vnd' USING ERRCODE = '22023', DETAIL = 'list_price_vnd';
  END IF;
  v_list_price := v_num;

  -- stock_state and stock_qty.
  v_stock_state := CASE WHEN jsonb_typeof(o -> 'stock_state') = 'string'
                        THEN o ->> 'stock_state' END;
  IF v_stock_state IS NULL
     OR v_stock_state NOT IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown') THEN
    RAISE EXCEPTION 'Invalid stock_state' USING ERRCODE = '22023', DETAIL = 'stock_state';
  END IF;
  v_num := CASE WHEN jsonb_typeof(o -> 'stock_qty') = 'number'
                THEN (o ->> 'stock_qty')::numeric END;
  IF NOT o ? 'stock_qty'
     OR COALESCE(jsonb_typeof(o -> 'stock_qty'), 'null') NOT IN ('null', 'number')
     OR v_num NOT BETWEEN 0 AND 1000000 OR v_num <> trunc(v_num) THEN
    RAISE EXCEPTION 'Invalid stock_qty' USING ERRCODE = '22023', DETAIL = 'stock_qty';
  END IF;
  v_stock_qty := v_num;

  -- observed_at: ISO 8601 with a zone (seconds 00 to 59, so no leap second; an offset up to
  -- 15:59, as Postgres parses it), at most 10 minutes ahead and 24 hours behind now().
  v_observed_text := CASE WHEN jsonb_typeof(o -> 'observed_at') = 'string'
                          THEN o ->> 'observed_at' END;
  IF v_observed_text IS NULL OR v_observed_text !~
       '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:[0-5]\d(\.\d{1,9})?)?(Z|[+-](0\d|1[0-5])(:?[0-5]\d)?)$'
  THEN
    RAISE EXCEPTION 'Invalid observed_at' USING ERRCODE = '22023', DETAIL = 'observed_at';
  END IF;
  BEGIN
    v_observed := v_observed_text::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid observed_at' USING ERRCODE = '22023', DETAIL = 'observed_at';
  END;
  IF v_observed > v_now + interval '10 minutes' OR v_observed < v_now - interval '24 hours' THEN
    RAISE EXCEPTION 'observed_at is out of range' USING ERRCODE = '22023',
      DETAIL = 'observed_at';
  END IF;

  -- extractor: exactly {source, extension_version}.
  v_extractor := o -> 'extractor';
  IF jsonb_typeof(v_extractor) IS DISTINCT FROM 'object'
     OR v_extractor - 'source' - 'extension_version' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid extractor' USING ERRCODE = '22023', DETAIL = 'extractor';
  END IF;
  IF jsonb_typeof(v_extractor -> 'source') IS DISTINCT FROM 'string'
     OR (v_extractor ->> 'source') NOT IN ('json_ld', 'dom', 'mixed') THEN
    RAISE EXCEPTION 'Invalid extractor.source' USING ERRCODE = '22023',
      DETAIL = 'extractor.source';
  END IF;
  IF jsonb_typeof(v_extractor -> 'extension_version') IS DISTINCT FROM 'string'
     OR (v_extractor ->> 'extension_version') !~ '^[0-9A-Za-z.+-]{1,20}$' THEN
    RAISE EXCEPTION 'Invalid extractor.extension_version' USING ERRCODE = '22023',
      DETAIL = 'extractor.extension_version';
  END IF;

  -- The submitter, locked: one submitter's calls (and its deletion) run one at a time, so its
  -- count below is exact.
  PERFORM 1 FROM rate.extension_submitters WHERE id = p_submitter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown extension submitter' USING ERRCODE = 'P0002',
      DETAIL = 'submitter_id';
  END IF;

  IF (SELECT count(*) FROM rate.extension_observations
      WHERE submitter_id = p_submitter_id
        AND received_at > v_now - interval '1 hour') >= 120 THEN
    RAISE EXCEPTION 'Too many observations from this submitter, try again later'
      USING ERRCODE = '54000', DETAIL = 'submitter_id';
  END IF;

  -- One network's calls run one at a time too (a transaction-scoped advisory lock).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.extension_observations:' || p_network_hash, 0));
  IF (SELECT count(*) FROM rate.extension_observations
      WHERE network_hash = p_network_hash
        AND received_at > v_now - interval '1 hour') >= 600 THEN
    RAISE EXCEPTION 'Too many observations from this network, try again later'
      USING ERRCODE = '54000', DETAIL = 'network_hash';
  END IF;

  INSERT INTO rate.extension_observations (
    submitter_id, schema_version, marketplace, listing_url, external_item_id, external_shop_id,
    sku_id, variant_label, price_vnd, list_price_vnd, stock_state, stock_qty, observed_at,
    extractor, received_at, network_hash, status)
  VALUES (
    p_submitter_id, 1, v_marketplace, v_url, v_item, v_shop,
    v_sku, v_variant, v_price, v_list_price, v_stock_state, v_stock_qty, v_observed,
    v_extractor, v_now, p_network_hash, 'quarantined')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'quarantined', 'received_at', v_now);
END;
$$;

-- 3. Execute grants restated (anon, authenticated, service_role only; never PUBLIC or rate_worker)

REVOKE EXECUTE ON FUNCTION rate.submit_extension_observation(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role, rate_worker;

GRANT EXECUTE ON FUNCTION rate.submit_extension_observation(text, uuid, jsonb, text)
  TO anon, authenticated, service_role;

COMMIT;

-- Validate the widened CHECK outside the DDL transaction so SHARE UPDATE EXCLUSIVE
-- allows concurrent observations inserts and rate_worker reads while scanning.
DO $validate_item_id_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.extension_observations'::regclass
      AND c.conname = 'extension_observations_external_item_id_check'
      AND NOT c.convalidated
  ) THEN
    SET LOCAL lock_timeout = '5s';
    ALTER TABLE rate.extension_observations
      VALIDATE CONSTRAINT extension_observations_external_item_id_check;
  END IF;
END
$validate_item_id_check$;
