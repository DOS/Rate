-- PROPOSAL, NOT APPLIED. Read-only checks for 2026-11-01-dos-me-review-submission-v2.sql
-- (DOS/Rate#1544). Run after the migration on preview, beta and prod. V1 to V7 must return 0.

-- V1 The criteria lists are complete.                                           expect 0
--    Version 1 has 36 rows; each category weighs 100 with one required criterion.
SELECT count(*) AS rating_criteria_incomplete
FROM (SELECT 1) one
WHERE (SELECT count(*) FROM rate.rating_criteria WHERE criteria_version = 1) <> 36
   OR EXISTS (SELECT 1 FROM rate.rating_criteria GROUP BY criteria_version, category_slug
              HAVING sum(weight) <> 100 OR count(*) FILTER (WHERE required) <> 1);

-- V2 The functions exist, the RPC is SECURITY DEFINER with an empty search_path.  expect 0
SELECT 7 - count(DISTINCT p.proname) AS functions_missing
FROM pg_proc p
WHERE p.pronamespace = 'rate'::regnamespace
  AND (p.proname IN ('review_text_stored', 'review_text_length', 'review_point_compare',
                     'review_point_has_content', 'review_point_is_evasive_con', 'review_point_list')
       OR (p.proname = 'submit_community_review_v2' AND p.prosecdef
           AND p.proconfig @> ARRAY['search_path=""']));

-- V3 anon cannot run the RPC or the helpers; authenticated and service_role can. expect 0
SELECT count(*) AS grants_wrong
FROM (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) AS g(role, allowed)
CROSS JOIN (VALUES
  ('rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)'),
  ('rate.review_point_list(jsonb, text, integer, integer, text)'),
  ('rate.review_text_stored(text)'), ('rate.review_text_length(text)'),
  ('rate.review_point_compare(text)'), ('rate.review_point_has_content(text)'),
  ('rate.review_point_is_evasive_con(text)')) AS f(fn)
WHERE has_function_privilege(g.role, f.fn, 'EXECUTE') <> g.allowed;

-- V4 Every v2 review (criteria_version set) has a verdict, a pro and a con.     expect 0
SELECT count(*) AS v2_reviews_incomplete
FROM rate.reviews r
WHERE r.criteria_version IS NOT NULL
  AND (r.verdict IS NULL OR r.rating_exact IS NULL
       OR NOT EXISTS (SELECT 1 FROM rate.review_points p
                      WHERE p.review_id = r.id AND p.criterion_key IS NULL AND p.kind = 'pro')
       OR NOT EXISTS (SELECT 1 FROM rate.review_points p
                      WHERE p.review_id = r.id AND p.criterion_key IS NULL AND p.kind = 'con'));

-- V5 Every v2 review's star is its 0.1 star rounded.                             expect 0
SELECT count(*) AS v2_star_mismatch
FROM rate.reviews
WHERE criteria_version IS NOT NULL AND rating_star <> round(rating_exact);

-- V6 The position key exists (one row per review, criterion, kind and position). expect 0
SELECT 1 - count(*) AS position_key_missing
FROM pg_indexes
WHERE schemaname = 'rate' AND indexname = 'review_points_position_key';

-- V7 The line helpers read Vietnamese the same as shared-data on this database.  expect 0
--    Upper case folds, diacritics stay, a dodge is caught, emoji marks are invisible.
SELECT count(*) AS line_helpers_wrong
FROM (VALUES
  (rate.review_point_compare('KHÔNG CÓ'), 'không có'),
  (rate.review_point_compare('Sạc NHANH!!'), 'sạc nhanh'),
  (rate.review_point_compare('Pin tốt ❤️'), 'pin tốt'),
  (rate.review_point_is_evasive_con('Không có gì ☺️')::text, 'true'),
  (rate.review_point_is_evasive_con('Giá hơi cao')::text, 'false'),
  (rate.review_point_has_content('ưu điểm')::text, 'true'),
  (rate.review_text_length('Ổn ' || chr(8203) || '😀')::text, '4')) AS t(got, want)
WHERE got IS DISTINCT FROM want;

-- V8 For information: v2 reviews and their lines so far.
SELECT count(*) AS v2_reviews,
       (SELECT count(*) FROM rate.review_points p JOIN rate.reviews r ON r.id = p.review_id
        WHERE r.criteria_version IS NOT NULL) AS v2_lines
FROM rate.reviews WHERE criteria_version IS NOT NULL;
