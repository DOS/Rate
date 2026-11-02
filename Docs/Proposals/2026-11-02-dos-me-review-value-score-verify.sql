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

-- V2 the rating reads the factor, and its trigger compares it on both sides; expect 0
SELECT 2 - count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'rate'
  AND ((p.proname = 'master_rating_extras'
        AND p.prosrc LIKE '%r.helpfulness_weight * rate.review_completeness_factor(r.value_breakdown)%')
    OR (p.proname = 'reviews_refresh_rating_extras'
        AND p.prosrc LIKE '%rate.review_completeness_factor(n.value_breakdown)%'
        AND p.prosrc LIKE '%rate.review_completeness_factor(o.value_breakdown)%'));

-- V3 the writer is security definer with an empty search_path, callable by service_role and
-- rate_worker and by nobody else; expect 0
SELECT count(*) FROM (
  SELECT 'definer' AS problem FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rate' AND p.proname = 'store_review_values'
    AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
  UNION ALL
  SELECT r.role FROM unnest(ARRAY['service_role', 'rate_worker']) AS r(role)
  WHERE NOT has_function_privilege(r.role, 'rate.store_review_values(jsonb)', 'EXECUTE')
  UNION ALL
  SELECT r.role FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  WHERE has_function_privilege(r.role, 'rate.store_review_values(jsonb)', 'EXECUTE')
     OR has_function_privilege(r.role, 'rate.review_completeness_factor(jsonb)', 'EXECUTE')
) x;

-- V4 the two CHECKs exist; expect 0
SELECT 2 - count(*) FROM pg_constraint
WHERE conrelid = 'rate.reviews'::regclass
  AND conname IN ('reviews_value_breakdown_object', 'reviews_value_breakdown_completeness');

-- V5 every master's stored rating equals what the functions compute; expect 0
SELECT count(*) FROM rate.master_products m
CROSS JOIN LATERAL rate.master_rating_extras(m.id) x
WHERE (m.rating_score, m.rating_weight_sum, m.criteria_scores)
      IS DISTINCT FROM (x.rating_score, x.rating_weight_sum, x.criteria_scores);

-- V6 every stored value is well formed: a score only with a breakdown, the CHECKs hold on
-- every row (they are NOT VALID), the breakdown's score is value_score, and a gated review
-- scores 0; expect 0
SELECT count(*) FROM rate.reviews r
WHERE (r.value_breakdown IS NULL) <> (r.value_score IS NULL)
   OR r.value_breakdown IS NOT NULL AND CASE
    WHEN jsonb_typeof(r.value_breakdown) <> 'object'
      OR jsonb_typeof(r.value_breakdown -> 'completeness') IS DISTINCT FROM 'number'
      OR jsonb_typeof(r.value_breakdown -> 'weightCompleteness') IS DISTINCT FROM 'number'
      OR jsonb_typeof(r.value_breakdown -> 'score') IS DISTINCT FROM 'number' THEN true
    ELSE (r.value_breakdown ->> 'completeness')::numeric NOT IN (0, 5, 10, 15, 20, 25, 30, 35)
      OR (r.value_breakdown ->> 'completeness')::numeric
         - (r.value_breakdown ->> 'weightCompleteness')::numeric NOT IN (0, 5)
      OR round((r.value_breakdown ->> 'score')::numeric, 2) IS DISTINCT FROM r.value_score
      OR (r.value_breakdown -> 'gated' = 'true'::jsonb AND r.value_score <> 0)
  END;

-- V7 the public tier (D7) follows the module's rule: none on a gated review, else basic under
-- completeness 30, excellent from score 70, complete between; expect 0
SELECT count(*) FROM rate.reviews r
WHERE jsonb_typeof(r.value_breakdown) = 'object'
  AND jsonb_typeof(r.value_breakdown -> 'completeness') = 'number'
  AND jsonb_typeof(r.value_breakdown -> 'score') = 'number'
  AND (r.value_breakdown ->> 'tier') IS DISTINCT FROM CASE
    WHEN r.value_breakdown -> 'gated' = 'true'::jsonb THEN NULL
    WHEN (r.value_breakdown ->> 'completeness')::numeric < 30 THEN 'basic'
    WHEN (r.value_breakdown ->> 'score')::numeric >= 70 THEN 'excellent'
    ELSE 'complete' END;

-- V8 (information) reviews scored, their mean score and the share lifted
SELECT count(*) FILTER (WHERE value_breakdown IS NOT NULL) AS scored,
       round(avg(value_score), 2) AS mean_score,
       count(*) FILTER (WHERE rate.review_completeness_factor(value_breakdown) > 1) AS lifted
FROM rate.reviews;
