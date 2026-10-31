-- PROPOSAL. Read-only checks for 2026-10-31-dos-me-criteria-ratings.sql (DOS/Rate#1543). Run
-- after it. `scripts/test-criteria-ratings-proposal.mjs` runs the expect-0 ones on the replay
-- stack.

-- V1 Every new column exists.                                                  expect 0
SELECT 9 - count(*) AS missing_columns
FROM information_schema.columns
WHERE table_schema = 'rate'
  AND ((table_name = 'reviews' AND column_name IN ('rating_exact', 'verdict', 'criteria_version',
                                                   'value_score', 'value_breakdown'))
    OR (table_name = 'master_products' AND column_name IN ('rating_score', 'rating_weight_sum',
                                                           'criteria_scores'))
    OR (table_name = 'review_points' AND column_name = 'body'));

-- V2 Both new tables have row level security on.                              expect 0
SELECT 2 - count(*) AS tables_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'rate' AND c.relname IN ('review_points', 'product_points')
  AND c.relrowsecurity;

-- V3 The refresh wrapper, its base and the extras exist, and anon cannot run them. expect 0
SELECT (3 - count(*)) + count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))
  AS missing_or_open_functions
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'rate'
  AND p.proname IN ('refresh_master_product_rating', 'refresh_master_product_rating_base',
                    'refresh_master_rating_extras');

-- V4 No rating outside 0-5, and no rating without the weight behind it.       expect 0
SELECT count(*) AS bad_ratings
FROM rate.master_products
WHERE rating_score < 0 OR rating_score > 5
   OR (rating_score IS NOT NULL AND rating_weight_sum <= 0)
   OR (rating_score IS NULL AND rating_weight_sum > 0);

-- V5 Every criterion score meets the display thresholds of D9.                expect 0
SELECT count(*) AS criteria_below_threshold
FROM rate.master_products m, jsonb_each(m.criteria_scores) c(key, v)
WHERE (c.v ->> 'writers')::int < 3
   OR (c.v ->> 'weight_sum')::numeric < 1.5
   OR (c.v ->> 'score')::numeric NOT BETWEEN 1 AND 5;

-- V6 The backfill reached every master: none with counted reviews and no rating. expect 0
SELECT count(*) AS masters_not_backfilled
FROM rate.master_products m
WHERE m.rating_score IS NULL
  AND m.authentic_review_count > 0
  AND EXISTS (
    SELECT 1
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = m.id AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community') AND r.reviewer_type = 'user'
      AND COALESCE(f.include_in_rating, true) AND r.helpfulness_weight > 0);

-- V7 Information: the rating each page will read, next to today's weighted mean.
SELECT slug, user_rating_weighted, rating_score, rating_weight_sum,
       jsonb_object_keys_count.n AS criteria_with_scores
FROM rate.master_products m,
     LATERAL (SELECT count(*) AS n FROM jsonb_object_keys(m.criteria_scores)) jsonb_object_keys_count
WHERE m.authentic_review_count > 0
ORDER BY m.authentic_review_count DESC
LIMIT 20;
