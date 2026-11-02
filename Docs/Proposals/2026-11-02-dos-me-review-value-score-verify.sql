-- VERIFY the PROPOSAL 2026-11-02-dos-me-review-value-score.sql (DOS/Rate#1547). Read-only.
-- Run after the migration on preview, beta and production. V1 to V7 return 0.
-- Run as postgres or service_role: V1, V5 and V8 call functions only service_role may execute
-- (a role without them fails loudly, never passes). V5 recomputes every master: run it off-peak.

-- V1 the factor is the D6 formula on weightCompleteness
-- (packages/shared-data completenessWeightFactor); expect 0
SELECT count(*) FROM (VALUES
  (NULL::jsonb, 1.0000), ('{}', 1.0000), ('[]', 1.0000), ('{"weightCompleteness": "35"}', 1.0000),
  ('{"weightCompleteness": 0}', 1.0000), ('{"weightCompleteness": 25}', 1.1786),
  ('{"weightCompleteness": 35}', 1.2500), ('{"weightCompleteness": 99}', 1.2500),
  ('{"weightCompleteness": -4}', 1.0000)
) AS t(breakdown, expected)
WHERE rate.review_completeness_factor(t.breakdown) IS DISTINCT FROM t.expected;

-- V2 the rating reads the private values' factor, and the three triggers on them exist; expect 0
SELECT 4 - (
  SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rate' AND p.proname = 'master_rating_extras'
    AND p.prosrc LIKE '%r.helpfulness_weight * rate.review_completeness_factor(v.value_breakdown)%'
    AND p.prosrc LIKE '%LEFT JOIN rate.review_values v ON v.review_id = r.id%'
) - (
  SELECT count(*) FROM pg_trigger
  WHERE tgrelid = 'rate.review_values'::regclass AND NOT tgisinternal
    AND tgname IN ('trg_review_values_rating_extras_ins', 'trg_review_values_rating_extras_upd',
                   'trg_review_values_rating_extras_del')
);

-- V3 D7: anon and authenticated cannot read rate.review_values or call the writer, and anon
-- cannot call the reader; rate_worker reads the table but writes only through the writer; the
-- functions are security definer with an empty search_path; expect 0
SELECT count(*) FROM (
  SELECT p.proname::text AS problem FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rate' AND p.proname IN ('store_review_values', 'my_review_values')
    AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
  UNION ALL
  SELECT r.role FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  WHERE has_table_privilege(r.role, 'rate.review_values', 'SELECT')
     OR has_table_privilege(r.role, 'rate.review_values', 'INSERT')
     OR has_table_privilege(r.role, 'rate.review_values', 'UPDATE')
     OR has_table_privilege(r.role, 'rate.review_values', 'DELETE')
     OR has_table_privilege(r.role, 'rate.review_values', 'TRUNCATE')
     OR has_function_privilege(r.role, 'rate.store_review_values(jsonb)', 'EXECUTE')
     OR has_function_privilege(r.role, 'rate.review_completeness_factor(jsonb)', 'EXECUTE')
  UNION ALL
  SELECT 'anon reader' WHERE has_function_privilege('anon', 'rate.my_review_values(uuid[])', 'EXECUTE')
  UNION ALL
  SELECT 'authenticated reader'
  WHERE NOT has_function_privilege('authenticated', 'rate.my_review_values(uuid[])', 'EXECUTE')
  UNION ALL
  SELECT 'rate_worker' WHERE NOT has_table_privilege('rate_worker', 'rate.review_values', 'SELECT')
     OR has_table_privilege('rate_worker', 'rate.review_values', 'INSERT')
     OR has_table_privilege('rate_worker', 'rate.review_values', 'UPDATE')
     OR has_table_privilege('rate_worker', 'rate.review_values', 'DELETE')
     OR has_table_privilege('rate_worker', 'rate.review_values', 'TRUNCATE')
     OR NOT has_function_privilege('rate_worker', 'rate.store_review_values(jsonb)', 'EXECUTE')
  UNION ALL
  SELECT 'rls' FROM pg_class WHERE oid = 'rate.review_values'::regclass AND NOT relrowsecurity
) x;

-- V4 the CHECKs exist; expect 0
SELECT 3 - count(*) FROM pg_constraint
WHERE (conrelid = 'rate.reviews'::regclass
       AND conname IN ('reviews_value_tier_known', 'reviews_value_private'))
   OR (conrelid = 'rate.review_values'::regclass AND conname = 'review_values_completeness');

-- V5 every master's stored rating equals what the functions compute; expect 0
SELECT count(*) FROM rate.master_products m
CROSS JOIN LATERAL rate.master_rating_extras(m.id) x
WHERE (m.rating_score, m.rating_weight_sum, m.criteria_scores)
      IS DISTINCT FROM (x.rating_score, x.rating_weight_sum, x.criteria_scores);

-- V6 the number never reaches the public table: P2's columns are empty on every row (the CHECK
-- is NOT VALID), and every tier is known; expect 0
SELECT count(*) FROM rate.reviews r
WHERE r.value_score IS NOT NULL OR r.value_breakdown IS NOT NULL
   OR (r.value_tier IS NOT NULL AND r.value_tier NOT IN ('basic', 'complete', 'excellent'));

-- V7 the public tier is the stored breakdown's, and follows the module's rule: none on a gated
-- review, else basic under completeness 30, excellent from score 70, complete between; a tier
-- only with a value; expect 0
SELECT count(*) FROM rate.reviews r
LEFT JOIN rate.review_values v ON v.review_id = r.id
WHERE (v.review_id IS NULL AND r.value_tier IS NOT NULL)
   OR (v.review_id IS NOT NULL AND (
         r.value_tier IS DISTINCT FROM (v.value_breakdown ->> 'tier')
      OR (v.value_breakdown ->> 'tier') IS DISTINCT FROM CASE
           WHEN v.value_breakdown -> 'gated' = 'true'::jsonb THEN NULL
           WHEN (v.value_breakdown ->> 'completeness')::numeric < 30 THEN 'basic'
           WHEN v.value_score >= 70 THEN 'excellent'
           ELSE 'complete' END));

-- V8 (information) reviews scored, their mean score and how many are lifted
SELECT count(*) AS scored,
       round(avg(value_score), 2) AS mean_score,
       count(*) FILTER (WHERE rate.review_completeness_factor(value_breakdown) > 1) AS lifted
FROM rate.review_values;
