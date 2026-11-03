-- VERIFY the PROPOSAL 2026-11-03-dos-me-review-ai-points.sql (DOS/Rate#1531, AI design D6).
-- Read-only. Run after the migration on preview, beta and production, and after each run of
-- the review AI points job. V1 to V7 return 0; V8 is information. Run as postgres or
-- service_role (V1 calls a function only service_role and rate_worker may execute).

-- V1 the text hash is sha256 of the NFC text: a decomposed and a composed "Pin tốt" hash the
-- same, and the empty text is sha256 of nothing; expect 0
SELECT count(*) FROM (VALUES
  (rate.review_ai_text_hash(NULL), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
  (rate.review_ai_text_hash(E'Pin tốt'), rate.review_ai_text_hash(E'Pin tốt'))
) AS t(got, expected)
WHERE t.got IS DISTINCT FROM t.expected;

-- V2 the objects and grants: anon and authenticated cannot read the two tables or call the
-- functions; rate_worker reads both tables, writes batches but not markers, and still has no
-- write on rate.review_points; the functions are security definer with an empty search_path;
-- expect 0
SELECT count(*) FROM (
  SELECT c.relname::text AS problem FROM pg_class c
  WHERE c.oid IN ('rate.review_ai_batches'::regclass, 'rate.review_ai_extractions'::regclass)
    AND NOT c.relrowsecurity
  UNION ALL
  SELECT p.proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rate' AND p.proname IN ('store_review_ai_points', 'purge_review_ai_points')
    AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
  UNION ALL
  SELECT r.role || ' ' || t.tab FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  CROSS JOIN unnest(ARRAY['rate.review_ai_batches', 'rate.review_ai_extractions']) AS t(tab)
  WHERE has_table_privilege(r.role, t.tab, 'SELECT')
     OR has_table_privilege(r.role, t.tab, 'INSERT')
     OR has_table_privilege(r.role, t.tab, 'UPDATE')
     OR has_table_privilege(r.role, t.tab, 'DELETE')
  UNION ALL
  SELECT r.role || ' ' || f.fn FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
  CROSS JOIN unnest(ARRAY['rate.store_review_ai_points(jsonb)', 'rate.purge_review_ai_points(text)',
                          'rate.review_ai_text_hash(text)']) AS f(fn)
  WHERE has_function_privilege(r.role, f.fn, 'EXECUTE')
  UNION ALL
  SELECT 'rate_worker grants' WHERE NOT (
    has_table_privilege('rate_worker', 'rate.review_ai_batches', 'SELECT')
    AND has_table_privilege('rate_worker', 'rate.review_ai_batches', 'INSERT')
    AND has_table_privilege('rate_worker', 'rate.review_ai_batches', 'UPDATE')
    AND NOT has_table_privilege('rate_worker', 'rate.review_ai_batches', 'DELETE')
    AND has_table_privilege('rate_worker', 'rate.review_ai_extractions', 'SELECT')
    AND NOT has_table_privilege('rate_worker', 'rate.review_ai_extractions', 'INSERT')
    AND NOT has_table_privilege('rate_worker', 'rate.review_ai_extractions', 'UPDATE')
    AND NOT has_table_privilege('rate_worker', 'rate.review_ai_extractions', 'DELETE')
    AND NOT has_table_privilege('rate_worker', 'rate.review_points', 'INSERT')
    AND NOT has_table_privilege('rate_worker', 'rate.review_points', 'UPDATE')
    AND NOT has_table_privilege('rate_worker', 'rate.review_points', 'DELETE')
    AND has_function_privilege('rate_worker', 'rate.store_review_ai_points(jsonb)', 'EXECUTE')
    AND has_function_privilege('rate_worker', 'rate.purge_review_ai_points(text)', 'EXECUTE'))
) s;

-- V3 every 'ai' line is on a crawled user review with a marker, and no review has both writer
-- and 'ai' lines; expect 0
SELECT count(*) FROM rate.review_points p
JOIN rate.reviews r ON r.id = p.review_id
LEFT JOIN rate.review_ai_extractions x ON x.review_id = p.review_id
WHERE p.method = 'ai'
  AND (x.review_id IS NULL
       OR r.origin IS DISTINCT FROM 'crawl' OR r.reviewer_type IS DISTINCT FROM 'user'
       OR EXISTS (SELECT 1 FROM rate.review_points w
                  WHERE w.review_id = p.review_id AND w.method = 'writer'));

-- V4 each marker counts the review's 'ai' lines and holds one evidence quote per line; expect 0
SELECT count(*) FROM rate.review_ai_extractions x
LEFT JOIN (SELECT review_id, count(*) AS n FROM rate.review_points WHERE method = 'ai'
           GROUP BY review_id) l ON l.review_id = x.review_id
WHERE x.point_count <> COALESCE(l.n, 0)
   OR jsonb_array_length(x.evidence) <> x.point_count;

-- V5 at most 3 pros and 3 cons per review, and every criterion key in the criteria list the
-- marker was processed with (its version and category; a review whose master moved keeps its
-- keys until the job processes it again); expect 0
SELECT count(*) FROM (
  SELECT review_id FROM rate.review_points WHERE method = 'ai'
  GROUP BY review_id, kind HAVING count(*) > 3
  UNION ALL
  SELECT p.review_id FROM rate.review_points p
  JOIN rate.review_ai_extractions x ON x.review_id = p.review_id
  WHERE p.method = 'ai' AND p.criterion_key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM rate.rating_criteria k
                    WHERE k.criteria_version = x.criteria_version
                      AND k.category_slug = x.category_slug AND k.key = p.criterion_key)
) s;

-- V6 no stored batch without its reported cost, and no batch left open for more than 48 hours
-- (the Batch API ends every batch within 24); expect 0
SELECT count(*) FROM rate.review_ai_batches
WHERE (status = 'stored' AND cost_usd IS NULL)
   OR (status IN ('submitted', 'ended') AND submitted_at < now() - interval '48 hours');

-- V7 no marker points at a batch of another model or prompt version; expect 0
SELECT count(*) FROM rate.review_ai_extractions x
JOIN rate.review_ai_batches b ON b.id = x.batch_id
WHERE b.model <> x.model OR b.prompt_version <> x.prompt_version;

-- V8 information: markers by prompt version and outcome, and this month's spend per model
SELECT 'marker' AS what, prompt_version AS key, outcome AS detail, count(*)::numeric AS n
FROM rate.review_ai_extractions GROUP BY prompt_version, outcome
UNION ALL
SELECT 'spend', model, to_char(date_trunc('month', now()), 'YYYY-MM'),
       sum(COALESCE(cost_usd, reserved_usd))
FROM rate.review_ai_batches
WHERE submitted_at >= date_trunc('month', now())
GROUP BY model
ORDER BY 1, 2, 3;
