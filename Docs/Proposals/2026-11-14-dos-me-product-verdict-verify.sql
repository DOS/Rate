-- VERIFY the PROPOSAL 2026-11-14-dos-me-product-verdict.sql (DOS/Rate#1623).
-- Read-only. V1 to V4 return 0.

-- V1 the table exists with RLS on; expect 0
SELECT count(*) FROM (SELECT 1) x
WHERE NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'rate' AND c.relname = 'product_verdicts' AND c.relrowsecurity
);

-- V2 privilege matrix: anon and authenticated cannot mutate, rate_worker cannot TRUNCATE; expect 0
SELECT count(*) FROM (VALUES
  ('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'),
  ('authenticated', 'INSERT'), ('authenticated', 'UPDATE'), ('authenticated', 'DELETE'),
  ('rate_worker', 'TRUNCATE')
) AS t(role_name, priv)
WHERE has_table_privilege(t.role_name, 'rate.product_verdicts', t.priv)
   OR has_any_column_privilege(t.role_name, 'rate.product_verdicts', t.priv);

-- V3 anon, authenticated, rate_worker and service_role can SELECT; expect 0
SELECT count(*) FROM (VALUES
  ('anon'), ('authenticated'), ('rate_worker'), ('service_role')
) AS t(role_name)
WHERE NOT has_table_privilege(t.role_name, 'rate.product_verdicts', 'SELECT');

-- V4 no stored verdict violates length or review_count bounds; expect 0
SELECT count(*) FROM rate.product_verdicts
WHERE char_length(btrim(verdict)) NOT BETWEEN 10 AND 500
   OR review_count <= 0
   OR method NOT IN ('code', 'ai');
