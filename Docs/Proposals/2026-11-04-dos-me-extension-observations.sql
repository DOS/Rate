-- =============================================================================
-- PROPOSAL (DOS/Rate#1606): milestone M2 of Docs/Proposals/2026-10-28-extension-data-source.md,
-- the quarantine for ExtensionObservation v1. A DOS-Me migration to review and apply; nothing
-- here is applied by DOS/Rate. Verify: 2026-11-04-dos-me-extension-observations-verify.sql
-- (V1 to V12 return 0). Rollback: 2026-11-04-dos-me-extension-observations-rollback.sql.
-- Contract: the M2 contract with its Revision 2 (ingest key, required network hash, register
-- limits, purge race fix).
--
-- What it does:
--   rate.extension_ingest_secret one private row: the sha256 of the web's ingest key. This file
--                                inserts no row; DOS-Me sets it at apply time. Without it, or
--                                with a wrong key, register and submit refuse (42501).
--   rate.extension_submitters    one row per extension install that opted in: a random id, its
--                                creation time and the network hash it registered from.
--                                Pseudonymous personal data.
--   rate.extension_observations  the quarantine: one row per observation the extension sent,
--                                one column per payload key, checked like the payload, plus
--                                received_at, a salted network hash and a status
--                                (quarantined, corroborated or rejected).
--   All three tables: row level security on; no anon or authenticated access; service_role
--   full; rate_worker reads submitters and observations and may update status only.
--   rate.register_extension_submitter(key, h)        anon with the ingest key: a new submitter
--                                id; 20 an hour per network hash, 600 a minute in all (54000).
--   rate.submit_extension_observation(key, id, obs, h)  anon with the ingest key: one
--                                observation, validated field by field (22023 with the field in
--                                DETAIL), 120 an hour per submitter and 600 an hour per network
--                                hash (54000).
--   rate.delete_extension_submitter(id)              anon, no key: deletes the submitter and its
--                                observations; returns how many observations went (0 for an
--                                unknown id).
--   rate.purge_extension_observations(d, k, e)       service_role: clears network hashes after d
--                                days (28), deletes observations after k days (180) and
--                                submitters without observations after e days (7).
--
-- Nothing here writes price_history, products or any public table. Promotion out of the
-- quarantine is M3/M4, in DOS/Rate-Services.
--
-- Depends on: the rate schema, the API roles (anon, authenticated, service_role) and rate_worker
-- (20261018183000_rate_worker_role.sql); all are in production.
--
-- Rating impact: none. No rating, price or product reads these tables.
--
-- Idempotent: IF NOT EXISTS for the tables and indexes, CREATE OR REPLACE for functions,
-- DROP POLICY IF EXISTS before each policy, grants restated every run.
-- =============================================================================

BEGIN;

-- New tables only; the FK takes a lock on its own new parent. Give up rather than queue.
SET LOCAL lock_timeout = '5s';

-- 1. The ingest key ----------------------------------------------------------------------------
-- One row at most (id is always true). Only the key's sha256 is stored; the key is the web's
-- secret RATE_EXTENSION_INGEST_KEY and is never in git. DOS-Me inserts the row at apply time.

CREATE TABLE IF NOT EXISTS rate.extension_ingest_secret (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  key_sha256 text NOT NULL CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate.extension_ingest_secret IS
  'sha256 of the web''s extension ingest key (DOS/Rate#1606). register_extension_submitter and submit_extension_observation refuse a caller without the key. service_role only.';

-- 2. Submitters --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.extension_submitters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  network_hash text,
  CONSTRAINT extension_submitters_network_hash_check CHECK (network_hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE rate.extension_submitters IS
  'One row per extension install that opted in to sending observations (DOS/Rate#1606). Pseudonymous personal data: delete on request through rate.delete_extension_submitter; network_hash cleared after 28 days; deleted 7 days after creation when it has no observations, else with its last observation.';

-- The global register brake and the purge read created_at; the per-network register limit
-- reads network_hash.
CREATE INDEX IF NOT EXISTS extension_submitters_created_idx
  ON rate.extension_submitters (created_at);
CREATE INDEX IF NOT EXISTS extension_submitters_network_created_idx
  ON rate.extension_submitters (network_hash, created_at) WHERE network_hash IS NOT NULL;

-- 3. The quarantine ----------------------------------------------------------------------------
-- Each CHECK repeats a payload rule of rate.submit_extension_observation, which refuses first
-- with the field's name; the CHECKs hold service_role's direct writes to the same rules.

CREATE TABLE IF NOT EXISTS rate.extension_observations (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submitter_id     uuid NOT NULL REFERENCES rate.extension_submitters(id) ON DELETE CASCADE,
  schema_version   smallint NOT NULL,
  marketplace      text NOT NULL,
  listing_url      text NOT NULL,
  external_item_id text NOT NULL,
  external_shop_id text,
  sku_id           text,
  variant_label    text,
  price_vnd        bigint NOT NULL,
  list_price_vnd   bigint,
  stock_state      text NOT NULL,
  stock_qty        integer,
  observed_at      timestamptz NOT NULL,
  extractor        jsonb NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  network_hash     text,
  status           text NOT NULL DEFAULT 'quarantined',
  CONSTRAINT extension_observations_schema_version_check CHECK (schema_version = 1),
  CONSTRAINT extension_observations_marketplace_check CHECK (marketplace IN (
    'shopee', 'lazada', 'tiki', 'tiktok', 'cellphones', 'tgdd', 'fptshop',
    'hoangha', 'didongviet', 'phongvu')),
  -- https, at most 2048 characters, no query, fragment or path parameter, no space (JavaScript's
  -- \s set) or control character, and a lowercase host without user or port that belongs to the
  -- marketplace (the host table).
  CONSTRAINT extension_observations_listing_url_check CHECK (
    char_length(listing_url) <= 2048
    AND listing_url !~ '[?#;[:space:]\x01-\x1f\x7f-\x9f\xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000\xfeff]'
    AND CASE marketplace
      WHEN 'shopee' THEN listing_url ~ '^https://shopee\.vn(/|$)'
      WHEN 'lazada' THEN listing_url ~ '^https://([a-z0-9-]+\.)*lazada\.vn(/|$)'
      WHEN 'tiki' THEN listing_url ~ '^https://tiki\.vn(/|$)'
      WHEN 'tiktok' THEN listing_url ~ '^https://(www|shop)\.tiktok\.com(/|$)'
      WHEN 'cellphones' THEN listing_url ~ '^https://cellphones\.com\.vn(/|$)'
      WHEN 'tgdd' THEN listing_url ~ '^https://([a-z0-9-]+\.)*thegioididong\.com(/|$)'
      WHEN 'fptshop' THEN listing_url ~ '^https://fptshop\.com\.vn(/|$)'
      WHEN 'hoangha' THEN listing_url ~ '^https://hoanghamobile\.com(/|$)'
      WHEN 'didongviet' THEN listing_url ~ '^https://didongviet\.vn(/|$)'
      WHEN 'phongvu' THEN listing_url ~ '^https://phongvu\.vn(/|$)'
      ELSE false END),
  CONSTRAINT extension_observations_external_item_id_check
    CHECK (external_item_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
  CONSTRAINT extension_observations_external_shop_id_check
    CHECK (external_shop_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
  CONSTRAINT extension_observations_sku_id_check CHECK (sku_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
  CONSTRAINT extension_observations_variant_label_check CHECK (
    char_length(variant_label) BETWEEN 1 AND 120 AND variant_label !~ '[\x01-\x1f\x7f-\x9f]'),
  CONSTRAINT extension_observations_price_vnd_check
    CHECK (price_vnd BETWEEN 1000 AND 2000000000),
  CONSTRAINT extension_observations_list_price_vnd_check
    CHECK (list_price_vnd >= price_vnd AND list_price_vnd <= 2000000000),
  CONSTRAINT extension_observations_stock_state_check
    CHECK (stock_state IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  CONSTRAINT extension_observations_stock_qty_check CHECK (stock_qty BETWEEN 0 AND 1000000),
  -- The RPC checks observed_at against now(); a CHECK can only hold it to received_at.
  CONSTRAINT extension_observations_observed_at_check CHECK (
    observed_at <= received_at + interval '10 minutes'
    AND observed_at >= received_at - interval '24 hours'),
  CONSTRAINT extension_observations_extractor_check CHECK (
    jsonb_typeof(extractor) = 'object'
    AND extractor - 'source' - 'extension_version' = '{}'::jsonb
    AND extractor ->> 'source' IN ('json_ld', 'dom', 'mixed')
    AND jsonb_typeof(extractor -> 'source') = 'string'
    AND jsonb_typeof(extractor -> 'extension_version') = 'string'
    AND (extractor ->> 'extension_version') ~ '^[0-9A-Za-z.+-]{1,20}$'),
  CONSTRAINT extension_observations_network_hash_check CHECK (network_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT extension_observations_status_check
    CHECK (status IN ('quarantined', 'corroborated', 'rejected'))
);

COMMENT ON TABLE rate.extension_observations IS
  'Quarantine of ExtensionObservation v1 (DOS/Rate#1606). Unverified crowd data: nothing reads it into prices or ratings until M3/M4 corroborates it. network_hash is cleared after 28 days and rows are deleted after 180 days by rate.purge_extension_observations.';
COMMENT ON COLUMN rate.extension_observations.network_hash IS
  'HMAC-SHA256 of the sender''s /24 (IPv4) or /48 (IPv6), keyed by a web secret; pseudonymous personal data, cleared after 28 days.';

CREATE INDEX IF NOT EXISTS extension_observations_submitter_received_idx
  ON rate.extension_observations (submitter_id, received_at);
CREATE INDEX IF NOT EXISTS extension_observations_network_received_idx
  ON rate.extension_observations (network_hash, received_at) WHERE network_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS extension_observations_item_received_idx
  ON rate.extension_observations (marketplace, external_item_id, received_at);

-- 4. Grants and row level security -------------------------------------------------------------
-- anon and authenticated reach the tables only through the RPCs below.

ALTER TABLE rate.extension_ingest_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.extension_submitters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.extension_observations ENABLE ROW LEVEL SECURITY;

-- The ingest key: service_role only (the functions read it as their owner).
REVOKE ALL ON rate.extension_ingest_secret FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.extension_ingest_secret TO service_role;
DROP POLICY IF EXISTS "Service role access extension_ingest_secret" ON rate.extension_ingest_secret;
CREATE POLICY "Service role access extension_ingest_secret" ON rate.extension_ingest_secret
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON rate.extension_submitters, rate.extension_observations
  FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.extension_submitters, rate.extension_observations TO service_role;
GRANT SELECT ON rate.extension_submitters, rate.extension_observations TO rate_worker;
GRANT UPDATE (status) ON rate.extension_observations TO rate_worker;

-- The identity sequence: only service_role (a project's default privileges may grant it wider).
DO $$
DECLARE
  v_seq text := pg_get_serial_sequence('rate.extension_observations', 'id');
BEGIN
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, rate_worker', v_seq);
  EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', v_seq);
END $$;

DROP POLICY IF EXISTS "Service role access extension_submitters" ON rate.extension_submitters;
CREATE POLICY "Service role access extension_submitters" ON rate.extension_submitters
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker read extension_submitters" ON rate.extension_submitters;
CREATE POLICY "Rate worker read extension_submitters" ON rate.extension_submitters
  FOR SELECT TO rate_worker USING (true);

DROP POLICY IF EXISTS "Service role access extension_observations" ON rate.extension_observations;
CREATE POLICY "Service role access extension_observations" ON rate.extension_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker read extension_observations" ON rate.extension_observations;
CREATE POLICY "Rate worker read extension_observations" ON rate.extension_observations
  FOR SELECT TO rate_worker USING (true);
-- The column grant above limits the update to status; the CHECK limits its values.
DROP POLICY IF EXISTS "Rate worker status extension_observations" ON rate.extension_observations;
CREATE POLICY "Rate worker status extension_observations" ON rate.extension_observations
  FOR UPDATE TO rate_worker USING (true) WITH CHECK (true);

-- 5. register_extension_submitter --------------------------------------------------------------
-- The ingest key (42501, DETAIL ingest_key: its sha256 must equal the stored row, and no row
-- refuses every caller), a network hash (22023), then the limits (54000): at most 20 new
-- submitters per network hash in the last hour (DETAIL network_hash), then a global brake of
-- 600 in the last minute (DETAIL submitter). Each count runs under its advisory lock, so it is
-- exact: per network first, then the global one, always in that order.

CREATE OR REPLACE FUNCTION rate.register_extension_submitter(
  p_ingest_key text,
  p_network_hash text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT key_sha256 FROM rate.extension_ingest_secret WHERE id) IS DISTINCT FROM
       encode(sha256(convert_to(coalesce(p_ingest_key, ''), 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Extension ingest key refused' USING ERRCODE = '42501',
      DETAIL = 'ingest_key';
  END IF;

  IF p_network_hash IS NULL OR p_network_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid network hash' USING ERRCODE = '22023', DETAIL = 'network_hash';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.extension_submitters:' || p_network_hash, 0));
  IF (SELECT count(*) FROM rate.extension_submitters
      WHERE network_hash = p_network_hash
        AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Too many extension submitters from this network, try again later'
      USING ERRCODE = '54000', DETAIL = 'network_hash';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.extension_submitters:register', 0));
  IF (SELECT count(*) FROM rate.extension_submitters
      WHERE created_at > now() - interval '1 minute') >= 600 THEN
    RAISE EXCEPTION 'Too many extension submitters registered, try again later'
      USING ERRCODE = '54000', DETAIL = 'submitter';
  END IF;

  INSERT INTO rate.extension_submitters (network_hash) VALUES (p_network_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 6. submit_extension_observation --------------------------------------------------------------
-- The ingest key (42501, DETAIL ingest_key), a network hash (22023, DETAIL network_hash), then
-- every rule of ExtensionObservation v1 (22023, DETAIL the field) in the order of
-- parseExtensionObservationV1 (packages/shared-data/src/rules/extension-observation.ts):
-- 'observation' for a payload that is not an object, is over 16 KB or has another key (its name
-- is never echoed), then each key in turn, its presence checked with its rule (a nullable key
-- must be present as null), then extractor.source and extractor.extension_version. Then the
-- submitter (P0002, DETAIL submitter_id) and the limits (54000): at most 120 per submitter and
-- 600 per network hash in the last hour.

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
  IF v_marketplace IS NULL OR v_marketplace NOT IN ('shopee', 'lazada', 'tiki', 'tiktok',
       'cellphones', 'tgdd', 'fptshop', 'hoangha', 'didongviet', 'phongvu') THEN
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
    ELSE false END;
  IF v_url IS NULL OR char_length(v_url) > 2048
     OR v_url ~ '[?#;[:space:]\x01-\x1f\x7f-\x9f\xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000\xfeff]'
     OR v_host IS NULL OR v_host !~ '^[a-z0-9.-]+$'
     OR v_host_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid listing_url' USING ERRCODE = '22023', DETAIL = 'listing_url';
  END IF;

  -- The ids: 1 to 64 of [A-Za-z0-9_.-]; the shop and SKU may be null.
  v_item := CASE WHEN jsonb_typeof(o -> 'external_item_id') = 'string'
                 THEN o ->> 'external_item_id' END;
  IF v_item IS NULL OR v_item !~ c_id_pattern THEN
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

  -- observed_at: ISO 8601 with a zone, at most 10 minutes ahead and 24 hours behind now().
  v_observed_text := CASE WHEN jsonb_typeof(o -> 'observed_at') = 'string'
                          THEN o ->> 'observed_at' END;
  IF v_observed_text IS NULL OR v_observed_text !~
       '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)$' THEN
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

-- 7. delete_extension_submitter ----------------------------------------------------------------
-- Deletes the submitter; its observations go by the cascade. Returns how many observations went;
-- an unknown or null id returns 0, so a call does not reveal whether an id exists.

CREATE OR REPLACE FUNCTION rate.delete_extension_submitter(p_submitter_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Locked first: no observation of this submitter can be added between the count and the
  -- delete.
  PERFORM 1 FROM rate.extension_submitters WHERE id = p_submitter_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_count FROM rate.extension_observations
  WHERE submitter_id = p_submitter_id;

  DELETE FROM rate.extension_submitters WHERE id = p_submitter_id;
  RETURN v_count;
END;
$$;

-- 8. purge_extension_observations --------------------------------------------------------------
-- Retention, ages from received_at and created_at. Meant to run daily as service_role.
--   network_hash cleared after p_network_hash_days (28), on observations and on submitters;
--   observations deleted after p_keep_days (180);
--   submitters without observations deleted after p_empty_submitter_days (7).
-- The empty submitters are locked first (SKIP LOCKED: one a submit holds waits for the next
-- run), then deleted under a fresh NOT EXISTS, so an observation committed in between keeps its
-- submitter instead of going with it by the cascade.

CREATE OR REPLACE FUNCTION rate.purge_extension_observations(
  p_network_hash_days integer DEFAULT 28,
  p_keep_days integer DEFAULT 180,
  p_empty_submitter_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hashes integer;
  v_submitter_hashes integer;
  v_observations integer;
  v_submitters integer;
  v_candidates uuid[];
BEGIN
  IF p_network_hash_days IS NULL OR p_network_hash_days < 1 THEN
    RAISE EXCEPTION 'p_network_hash_days must be at least 1' USING ERRCODE = '22023',
      DETAIL = 'p_network_hash_days';
  END IF;
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'p_keep_days must be at least 1' USING ERRCODE = '22023',
      DETAIL = 'p_keep_days';
  END IF;
  IF p_empty_submitter_days IS NULL OR p_empty_submitter_days < 1 THEN
    RAISE EXCEPTION 'p_empty_submitter_days must be at least 1' USING ERRCODE = '22023',
      DETAIL = 'p_empty_submitter_days';
  END IF;

  UPDATE rate.extension_observations SET network_hash = NULL
  WHERE network_hash IS NOT NULL
    AND received_at < now() - make_interval(days => p_network_hash_days);
  GET DIAGNOSTICS v_hashes = ROW_COUNT;

  UPDATE rate.extension_submitters SET network_hash = NULL
  WHERE network_hash IS NOT NULL
    AND created_at < now() - make_interval(days => p_network_hash_days);
  GET DIAGNOSTICS v_submitter_hashes = ROW_COUNT;

  DELETE FROM rate.extension_observations
  WHERE received_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_observations = ROW_COUNT;

  SELECT array_agg(c.id) INTO v_candidates FROM (
    SELECT s.id FROM rate.extension_submitters s
    WHERE s.created_at < now() - make_interval(days => p_empty_submitter_days)
      AND NOT EXISTS (SELECT 1 FROM rate.extension_observations o WHERE o.submitter_id = s.id)
    FOR UPDATE OF s SKIP LOCKED
  ) c;

  DELETE FROM rate.extension_submitters s
  WHERE s.id = ANY (COALESCE(v_candidates, '{}'))
    AND NOT EXISTS (SELECT 1 FROM rate.extension_observations o WHERE o.submitter_id = s.id);
  GET DIAGNOSTICS v_submitters = ROW_COUNT;

  RETURN jsonb_build_object('network_hashes_cleared', v_hashes,
                            'submitter_network_hashes_cleared', v_submitter_hashes,
                            'observations_deleted', v_observations,
                            'submitters_deleted', v_submitters);
END;
$$;

-- 9. Execute grants ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION rate.register_extension_submitter(text, text)
  FROM PUBLIC, anon, authenticated, service_role, rate_worker;
REVOKE EXECUTE ON FUNCTION rate.submit_extension_observation(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role, rate_worker;
REVOKE EXECUTE ON FUNCTION rate.delete_extension_submitter(uuid)
  FROM PUBLIC, anon, authenticated, service_role, rate_worker;
REVOKE EXECUTE ON FUNCTION rate.purge_extension_observations(integer, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role, rate_worker;

-- register and submit stay open to anon: the web calls them with the anon key plus the ingest
-- key. delete takes no ingest key, so erasure always works.
GRANT EXECUTE ON FUNCTION rate.register_extension_submitter(text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.submit_extension_observation(text, uuid, jsonb, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.delete_extension_submitter(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.purge_extension_observations(integer, integer, integer)
  TO service_role;

COMMIT;
