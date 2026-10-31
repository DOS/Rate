-- PROPOSAL. Read-only checks for 2026-10-31-dos-me-criteria-ratings.sql (DOS/Rate#1543). Run
-- after it. `scripts/test-criteria-ratings-proposal.mjs` runs the expect-0 ones on the replay
-- stack.

-- V1 Every new column exists.                                                  expect 0
SELECT 10 - count(*) AS missing_columns
FROM information_schema.columns
WHERE table_schema = 'rate'
  AND ((table_name = 'reviews' AND column_name IN ('rating_exact', 'verdict', 'criteria_version',
                                                   'value_score', 'value_breakdown'))
    OR (table_name = 'master_products' AND column_name IN ('rating_score', 'rating_weight_sum',
                                                           'criteria_scores'))
    OR (table_name = 'review_points' AND column_name = 'body')
    OR (table_name = 'product_points' AND column_name = 'label'));

-- V2 Both new tables have row level security on.                              expect 0
SELECT 2 - count(*) AS tables_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'rate' AND c.relname IN ('review_points', 'product_points')
  AND c.relrowsecurity;

-- V3 Each new function exists once, and no client role can run it.        expect 0
-- Client roles: PUBLIC, anon, authenticated.
SELECT count(*) FILTER (WHERE to_regprocedure(w.signature) IS NULL)
     + count(*) FILTER (WHERE to_regprocedure(w.signature) IS NOT NULL AND (
         has_function_privilege('anon', to_regprocedure(w.signature), 'EXECUTE')
         OR has_function_privilege('authenticated', to_regprocedure(w.signature), 'EXECUTE')
         OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                    WHERE p.oid = to_regprocedure(w.signature) AND a.grantee = 0)))
  AS missing_or_open_functions
FROM (VALUES ('rate.master_rating_item(uuid)'), ('rate.master_rating_extras(uuid)'),
             ('rate.refresh_master_rating_extras(uuid)'),
             ('rate.refresh_rating_extras_of_products(uuid[])'),
             ('rate.reviews_refresh_rating_extras()'),
             ('rate.review_flags_refresh_rating_extras()'),
             ('rate.master_products_refresh_rating_extras()')) w(signature);

-- V4 All seven triggers exist and are enabled.                                expect 0
SELECT 7 - count(*) AS missing_triggers
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'rate' AND NOT t.tgisinternal AND t.tgenabled <> 'D'
  AND t.tgname IN ('trg_reviews_rating_extras_ins', 'trg_reviews_rating_extras_upd',
                   'trg_reviews_rating_extras_del', 'trg_review_flags_rating_extras_ins',
                   'trg_review_flags_rating_extras_upd', 'trg_review_flags_rating_extras_del',
                   'trg_master_products_rating_extras');

-- V5 Every criterion score meets the display thresholds of D9.                expect 0
SELECT count(*) AS criteria_below_threshold
FROM rate.master_products m, jsonb_each(m.criteria_scores) c(key, v)
WHERE (c.v ->> 'writers')::int < 3
   OR (c.v ->> 'weight_sum')::numeric < 1.5
   OR (c.v ->> 'score')::numeric NOT BETWEEN 1 AND 5;

-- V6 Every master holds what its reviews give today.                         expect 0
-- No stale, missing or wrong rating or criteria: catches a skipped backfill and a missed trigger.
SELECT count(*) AS masters_out_of_date
FROM rate.master_products m
CROSS JOIN LATERAL rate.master_rating_extras(m.id) x
WHERE (m.rating_score, m.rating_weight_sum, m.criteria_scores)
      IS DISTINCT FROM (x.rating_score, x.rating_weight_sum, x.criteria_scores);

-- V7 Information: the rating each page will read, next to today's weighted mean.
SELECT m.slug, m.user_rating_weighted, m.rating_score, m.rating_weight_sum,
       (SELECT count(*) FROM jsonb_object_keys(m.criteria_scores)) AS criteria_with_scores
FROM rate.master_products m
WHERE m.authentic_review_count > 0
ORDER BY m.authentic_review_count DESC
LIMIT 20;
