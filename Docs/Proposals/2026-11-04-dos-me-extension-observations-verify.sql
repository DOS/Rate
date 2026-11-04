-- VERIFY the PROPOSAL 2026-11-04-dos-me-extension-observations.sql (DOS/Rate#1606). Read-only.
-- Run after the migration on preview, beta and production, as postgres or service_role.
-- V1 to V8 return 0. V9 is information: rows the purge should already have handled.

-- V1 both tables exist with row level security on; expect 0
SELECT 2 - count(*) FROM pg_class
WHERE oid IN (to_regclass('rate.extension_submitters'), to_regclass('rate.extension_observations'))
  AND relrowsecurity;

-- V2 anon and authenticated hold no privilege on either table or the identity sequence, and
-- PUBLIC holds none either; expect 0
SELECT count(*) FROM (
  SELECT r.role, t.tbl, p.priv
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  CROSS JOIN unnest(ARRAY['rate.extension_submitters', 'rate.extension_observations']) AS t(tbl)
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
  WHERE c.oid IN (to_regclass('rate.extension_submitters'),
                  to_regclass('rate.extension_observations'))
    AND a.grantee = 0
) x;

-- V3 service_role has full access; rate_worker reads both tables, updates only
-- extension_observations.status, and cannot insert, delete or truncate; expect 0
SELECT count(*) FROM (
  SELECT t.tbl, p.priv FROM unnest(ARRAY['rate.extension_submitters',
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
  SELECT 'rate.extension_observations', a.attname::text
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass('rate.extension_observations') AND a.attnum > 0
    AND NOT a.attisdropped
    AND has_column_privilege('rate_worker', a.attrelid, a.attnum, 'UPDATE') <> (a.attname = 'status')
) x;

-- V4 the five policies exist, and none applies to PUBLIC, anon or authenticated; expect 0
SELECT (5 - (
  SELECT count(*) FROM pg_policies
  WHERE schemaname = 'rate' AND (tablename, policyname, cmd, roles) IN (
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
  WHERE schemaname = 'rate' AND tablename IN ('extension_submitters', 'extension_observations')
    AND roles && '{public,anon,authenticated}'::name[]
);

-- V5 the four functions are SECURITY DEFINER with an empty search_path; expect 0
SELECT 4 - count(*) FROM pg_proc
WHERE oid IN (
    to_regprocedure('rate.register_extension_submitter()'),
    to_regprocedure('rate.submit_extension_observation(uuid, jsonb, text)'),
    to_regprocedure('rate.delete_extension_submitter(uuid)'),
    to_regprocedure('rate.purge_extension_observations(integer, integer)'))
  AND prosecdef AND proconfig @> ARRAY['search_path=""'];

-- V6 EXECUTE: PUBLIC has none; anon, authenticated and service_role call the first three;
-- only service_role calls the purge; rate_worker calls none; expect 0
SELECT count(*) FROM (
  SELECT f.sig, a.privilege_type
  FROM unnest(ARRAY['rate.register_extension_submitter()',
                    'rate.submit_extension_observation(uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)',
                    'rate.purge_extension_observations(integer, integer)']) AS f(sig)
  JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE a.grantee = 0
  UNION ALL
  SELECT f.sig, r.role
  FROM unnest(ARRAY['rate.register_extension_submitter()',
                    'rate.submit_extension_observation(uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)']) AS f(sig)
  CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
  WHERE to_regprocedure(f.sig) IS NULL OR NOT has_function_privilege(r.role, f.sig, 'EXECUTE')
  UNION ALL
  SELECT 'purge', r.role FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  WHERE has_function_privilege(r.role,
          'rate.purge_extension_observations(integer, integer)', 'EXECUTE')
  UNION ALL
  SELECT 'purge', 'service_role'
  WHERE NOT has_function_privilege('service_role',
          'rate.purge_extension_observations(integer, integer)', 'EXECUTE')
  UNION ALL
  SELECT f.sig, 'rate_worker'
  FROM unnest(ARRAY['rate.register_extension_submitter()',
                    'rate.submit_extension_observation(uuid, jsonb, text)',
                    'rate.delete_extension_submitter(uuid)',
                    'rate.purge_extension_observations(integer, integer)']) AS f(sig)
  WHERE has_function_privilege('rate_worker', f.sig, 'EXECUTE')
) x;

-- V7 the CHECKs exist, and the foreign key cascades on delete; expect 0
SELECT (16 - (
  SELECT count(*) FROM pg_constraint
  WHERE conrelid = to_regclass('rate.extension_observations') AND contype = 'c'
    AND convalidated AND conname IN (
      'extension_observations_schema_version_check', 'extension_observations_marketplace_check',
      'extension_observations_listing_url_check', 'extension_observations_external_item_id_check',
      'extension_observations_external_shop_id_check', 'extension_observations_sku_id_check',
      'extension_observations_variant_label_check', 'extension_observations_price_vnd_check',
      'extension_observations_list_price_vnd_check', 'extension_observations_stock_state_check',
      'extension_observations_stock_qty_check', 'extension_observations_observed_at_check',
      'extension_observations_extractor_check', 'extension_observations_network_hash_check',
      'extension_observations_status_check')
)) - (
  SELECT count(*) FROM pg_constraint
  WHERE conrelid = to_regclass('rate.extension_observations') AND contype = 'f'
    AND confrelid = to_regclass('rate.extension_submitters') AND confdeltype = 'c'
);

-- V8 the four indexes exist; expect 0
SELECT 4 - count(*) FROM pg_indexes
WHERE schemaname = 'rate' AND indexname IN (
  'extension_submitters_created_idx', 'extension_observations_submitter_received_idx',
  'extension_observations_network_received_idx', 'extension_observations_item_received_idx');

-- V9 information: rows past the default retention (non-zero means the daily purge is not
-- running)
SELECT
  (SELECT count(*) FROM rate.extension_observations
   WHERE network_hash IS NOT NULL AND received_at < now() - interval '29 days') AS hashes_due,
  (SELECT count(*) FROM rate.extension_observations
   WHERE received_at < now() - interval '181 days') AS observations_due;
