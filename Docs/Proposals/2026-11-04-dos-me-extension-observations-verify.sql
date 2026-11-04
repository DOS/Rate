-- VERIFY the PROPOSAL 2026-11-04-dos-me-extension-observations.sql (DOS/Rate#1606). Read-only.
-- Run after the migration and after the ingest key row is set, on preview, beta and production,
-- as postgres or service_role. V1 to V12 return 0. V13 is information: rows the purge should
-- already have handled.

-- V1 the three tables exist with row level security on and not forced (the functions' owner
-- must pass it); expect 0
SELECT 3 - count(*) FROM pg_class
WHERE oid IN (to_regclass('rate.extension_ingest_secret'), to_regclass('rate.extension_submitters'),
              to_regclass('rate.extension_observations'))
  AND relrowsecurity AND NOT relforcerowsecurity;

-- V2 anon and authenticated hold no privilege on the three tables or the identity sequence,
-- and PUBLIC holds none either; expect 0
SELECT count(*) FROM (
  SELECT r.role, t.tbl, p.priv
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  CROSS JOIN unnest(ARRAY['rate.extension_ingest_secret', 'rate.extension_submitters',
                          'rate.extension_observations']) AS t(tbl)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES',
                          'TRIGGER']) AS p(priv)
  WHERE has_table_privilege(r.role, t.tbl, p.priv)
     OR has_any_column_privilege(r.role, t.tbl, 'SELECT')
     OR has_any_column_privilege(r.role, t.tbl, 'INSERT')
     OR has_any_column_privilege(r.role, t.tbl, 'UPDATE')
  UNION ALL
  SELECT r.role, 'sequence', p.priv
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS p(priv)
  WHERE has_sequence_privilege(r.role,
          pg_get_serial_sequence('rate.extension_observations', 'id'), p.priv)
  UNION ALL
  SELECT 'PUBLIC', c.relname::text, a.privilege_type
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE c.oid IN (to_regclass('rate.extension_ingest_secret'),
                  to_regclass('rate.extension_submitters'),
                  to_regclass('rate.extension_observations'))
    AND a.grantee = 0
) x;

-- V3 service_role has full access; rate_worker reads submitters and observations, updates only
-- extension_observations.status, cannot insert, delete or truncate, and has nothing on the
-- ingest key; expect 0
SELECT count(*) FROM (
  SELECT t.tbl, p.priv FROM unnest(ARRAY['rate.extension_ingest_secret',
                                         'rate.extension_submitters',
                                         'rate.extension_observations']) AS t(tbl)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
  WHERE NOT has_table_privilege('service_role', t.tbl, p.priv)
  UNION ALL
  SELECT t.tbl, 'rate_worker select' FROM unnest(ARRAY['rate.extension_submitters',
                                                       'rate.extension_observations']) AS t(tbl)
  WHERE NOT has_table_privilege('rate_worker', t.tbl, 'SELECT')
     OR has_table_privilege('rate_worker', t.tbl, 'INSERT')
     OR has_table_privilege('rate_worker', t.tbl, 'UPDATE')
     OR has_table_privilege('rate_worker', t.tbl, 'DELETE')
     OR has_table_privilege('rate_worker', t.tbl, 'TRUNCATE')
     OR has_any_column_privilege('rate_worker', t.tbl, 'INSERT')
  UNION ALL
  SELECT 'rate.extension_submitters', 'rate_worker column update'
  WHERE has_any_column_privilege('rate_worker', 'rate.extension_submitters', 'UPDATE')
  UNION ALL
  SELECT 'rate.extension_ingest_secret', 'rate_worker'
  WHERE has_any_column_privilege('rate_worker', 'rate.extension_ingest_secret', 'SELECT')
     OR has_any_column_privilege('rate_worker', 'rate.extension_ingest_secret', 'INSERT')
     OR has_any_column_privilege('rate_worker', 'rate.extension_ingest_secret', 'UPDATE')
     OR has_table_privilege('rate_worker', 'rate.extension_ingest_secret', 'DELETE')
     OR has_table_privilege('rate_worker', 'rate.extension_ingest_secret', 'TRUNCATE')
  UNION ALL
  SELECT 'rate.extension_observations', a.attname::text
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass('rate.extension_observations') AND a.attnum > 0
    AND NOT a.attisdropped
    AND has_column_privilege('rate_worker', a.attrelid, a.attnum, 'UPDATE') <> (a.attname = 'status')
) x;

-- V4 the six policies exist, and none applies to PUBLIC, anon or authenticated; expect 0
SELECT (6 - (
  SELECT count(*) FROM pg_policies
  WHERE schemaname = 'rate' AND (tablename, policyname, cmd, roles) IN (
    ('extension_ingest_secret', 'Service role access extension_ingest_secret', 'ALL',
     '{service_role}'::name[]),
    ('extension_submitters', 'Service role access extension_submitters', 'ALL',
     '{service_role}'::name[]),
    ('extension_submitters', 'Rate worker read extension_submitters', 'SELECT',
     '{rate_worker}'::name[]),
    ('extension_observations', 'Service role access extension_observations', 'ALL',
     '{service_role}'::name[]),
    ('extension_observations', 'Rate worker read extension_observations', 'SELECT',
     '{rate_worker}'::name[]),
    ('extension_observations', 'Rate worker status extension_observations', 'UPDATE',
     '{rate_worker}'::name[]))
)) + (
  SELECT count(*) FROM pg_policies
  WHERE schemaname = 'rate'
    AND tablename IN ('extension_ingest_secret', 'extension_submitters', 'extension_observations')
    AND roles && '{public,anon,authenticated}'::name[]
);

-- V5 the four functions are SECURITY DEFINER with an empty search_path, and owned by the
-- tables' owner (who passes their row level security); expect 0
SELECT 4 - count(*) FROM pg_proc p
WHERE p.oid IN (
    to_regprocedure('rate.register_extension_submitter(text, text)'),
    to_regprocedure('rate.submit_extension_observation(text, uuid, jsonb, text)'),
    to_regprocedure('rate.delete_extension_submitter(uuid)'),
    to_regprocedure('rate.purge_extension_observations(integer, integer, integer)'))
  AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
  AND p.proowner = (SELECT relowner FROM pg_class
                    WHERE oid = to_regclass('rate.extension_observations'))
  AND p.proowner = ALL (SELECT relowner FROM pg_class
                        WHERE oid IN (to_regclass('rate.extension_ingest_secret'),
                                      to_regclass('rate.extension_submitters')));

-- V6 EXECUTE: PUBLIC has none; anon, authenticated and service_role call the first three;
-- only service_role calls the purge; rate_worker calls none; expect 0
SELECT count(*) FROM (
  SELECT f.sig, a.privilege_type
  FROM unnest(ARRAY['rate.register_extension_submitter(text, text)',
                    'rate.submit_extension_observation(text, uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)',
                    'rate.purge_extension_observations(integer, integer, integer)']) AS f(sig)
  JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE a.grantee = 0
  UNION ALL
  SELECT f.sig, r.role
  FROM unnest(ARRAY['rate.register_extension_submitter(text, text)',
                    'rate.submit_extension_observation(text, uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)']) AS f(sig)
  CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
  WHERE to_regprocedure(f.sig) IS NULL OR NOT has_function_privilege(r.role, f.sig, 'EXECUTE')
  UNION ALL
  SELECT 'purge', r.role FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  WHERE has_function_privilege(r.role,
          'rate.purge_extension_observations(integer, integer, integer)', 'EXECUTE')
  UNION ALL
  SELECT 'purge', 'service_role'
  WHERE NOT has_function_privilege('service_role',
          'rate.purge_extension_observations(integer, integer, integer)', 'EXECUTE')
  UNION ALL
  SELECT f.sig, 'rate_worker'
  FROM unnest(ARRAY['rate.register_extension_submitter(text, text)',
                    'rate.submit_extension_observation(text, uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)',
                    'rate.purge_extension_observations(integer, integer, integer)']) AS f(sig)
  WHERE has_function_privilege('rate_worker', f.sig, 'EXECUTE')
) x;

-- V7 the CHECKs exist and are validated, and the foreign key cascades on delete; expect 0
SELECT (19 - (
  SELECT count(*) FROM pg_constraint
  WHERE contype = 'c' AND convalidated AND (
    (conrelid = to_regclass('rate.extension_observations') AND conname IN (
      'extension_observations_schema_version_check', 'extension_observations_marketplace_check',
      'extension_observations_listing_url_check', 'extension_observations_external_item_id_check',
      'extension_observations_external_shop_id_check', 'extension_observations_sku_id_check',
      'extension_observations_variant_label_check', 'extension_observations_price_vnd_check',
      'extension_observations_list_price_vnd_check', 'extension_observations_stock_state_check',
      'extension_observations_stock_qty_check', 'extension_observations_observed_at_check',
      'extension_observations_extractor_check', 'extension_observations_network_hash_check',
      'extension_observations_status_check'))
    OR (conrelid = to_regclass('rate.extension_submitters')
        AND conname = 'extension_submitters_network_hash_check')
    OR (conrelid = to_regclass('rate.extension_ingest_secret')
        AND conname IN ('extension_ingest_secret_id_check',
                        'extension_ingest_secret_key_sha256_check')))
)) - (
  SELECT count(*) FROM pg_constraint
  WHERE conrelid = to_regclass('rate.extension_observations') AND contype = 'f'
    AND confrelid = to_regclass('rate.extension_submitters') AND confdeltype = 'c'
);

-- V8 the five indexes exist; expect 0
SELECT 5 - count(*) FROM pg_indexes
WHERE schemaname = 'rate' AND indexname IN (
  'extension_submitters_created_idx', 'extension_submitters_network_created_idx',
  'extension_observations_submitter_received_idx', 'extension_observations_network_received_idx',
  'extension_observations_item_received_idx');

-- V9 every column has the type, nullability and default of the proposal, and no other column
-- exists; expect 0
WITH expected (tbl, col, typ, not_null, def) AS (VALUES
  ('extension_ingest_secret', 'id', 'boolean', true, 'true'),
  ('extension_ingest_secret', 'key_sha256', 'text', true, NULL),
  ('extension_ingest_secret', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('extension_submitters', 'id', 'uuid', true, 'gen_random_uuid()'),
  ('extension_submitters', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('extension_submitters', 'network_hash', 'text', false, NULL),
  ('extension_observations', 'id', 'bigint', true, 'identity always'),
  ('extension_observations', 'submitter_id', 'uuid', true, NULL),
  ('extension_observations', 'schema_version', 'smallint', true, NULL),
  ('extension_observations', 'marketplace', 'text', true, NULL),
  ('extension_observations', 'listing_url', 'text', true, NULL),
  ('extension_observations', 'external_item_id', 'text', true, NULL),
  ('extension_observations', 'external_shop_id', 'text', false, NULL),
  ('extension_observations', 'sku_id', 'text', false, NULL),
  ('extension_observations', 'variant_label', 'text', false, NULL),
  ('extension_observations', 'price_vnd', 'bigint', true, NULL),
  ('extension_observations', 'list_price_vnd', 'bigint', false, NULL),
  ('extension_observations', 'stock_state', 'text', true, NULL),
  ('extension_observations', 'stock_qty', 'integer', false, NULL),
  ('extension_observations', 'observed_at', 'timestamp with time zone', true, NULL),
  ('extension_observations', 'extractor', 'jsonb', true, NULL),
  ('extension_observations', 'received_at', 'timestamp with time zone', true, 'now()'),
  ('extension_observations', 'network_hash', 'text', false, NULL),
  ('extension_observations', 'status', 'text', true, '''quarantined''::text')
), actual AS (
  SELECT c.relname::text AS tbl, a.attname::text AS col,
         format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull AS not_null,
         COALESCE(pg_get_expr(d.adbin, d.adrelid),
                  CASE a.attidentity WHEN 'a' THEN 'identity always'
                                     WHEN 'd' THEN 'identity by default' END) AS def
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE c.oid IN (to_regclass('rate.extension_ingest_secret'),
                  to_regclass('rate.extension_submitters'),
                  to_regclass('rate.extension_observations'))
    AND a.attnum > 0 AND NOT a.attisdropped
)
SELECT count(*) FROM (
  (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  UNION ALL
  (SELECT * FROM actual EXCEPT SELECT * FROM expected)
) x;

-- V10 the limits are in the function bodies: 120 and 600 an hour and the 16 KB cap in submit,
-- 20 an hour and 600 a minute in register; expect 0
SELECT count(*) FROM (VALUES
  ('rate.submit_extension_observation(text, uuid, jsonb, text)', '%) >= 120 THEN%'),
  ('rate.submit_extension_observation(text, uuid, jsonb, text)', '%) >= 600 THEN%'),
  ('rate.submit_extension_observation(text, uuid, jsonb, text)', '%octet_length(o::text) > 16384%'),
  ('rate.register_extension_submitter(text, text)', '%) >= 20 THEN%'),
  ('rate.register_extension_submitter(text, text)', '%) >= 600 THEN%')
) AS t(sig, pattern)
WHERE NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(t.sig) AND p.prosrc LIKE t.pattern);

-- V11 the ingest key table is granted to nobody but its owner and service_role; expect 0
SELECT count(*) FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = to_regclass('rate.extension_ingest_secret')
  AND a.grantee <> c.relowner
  AND a.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'service_role');

-- V12 the ingest key row is set (without it, register and submit refuse every caller); expect 0
SELECT 1 - count(*) FROM rate.extension_ingest_secret WHERE id;

-- V13 information: rows past the default retention (non-zero means the daily purge is not
-- running)
SELECT
  (SELECT count(*) FROM rate.extension_observations
   WHERE network_hash IS NOT NULL AND received_at < now() - interval '29 days')
  + (SELECT count(*) FROM rate.extension_submitters
     WHERE network_hash IS NOT NULL AND created_at < now() - interval '29 days') AS hashes_due,
  (SELECT count(*) FROM rate.extension_observations
   WHERE received_at < now() - interval '181 days') AS observations_due,
  (SELECT count(*) FROM rate.extension_submitters s
   WHERE s.created_at < now() - interval '8 days'
     AND NOT EXISTS (SELECT 1 FROM rate.extension_observations o
                     WHERE o.submitter_id = s.id)) AS empty_submitters_due;
