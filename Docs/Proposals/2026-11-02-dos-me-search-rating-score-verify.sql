-- VERIFY the PROPOSAL 2026-11-02-dos-me-search-rating-score.sql (DOS/Rate#1545). Read-only.
-- Run after the migration on preview, beta and production. Every check returns 0.
-- The shown rating below is the migration's expression (resolveCompareEffectiveUserRating).

-- V1 the function is #1497's plpgsql, invoker-rights, search_path '' and custom plans; expect 0
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'rate' AND p.proname = 'search_master_products'
  AND NOT (
    p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    AND NOT p.prosecdef
    AND p.provolatile = 's'
    AND p.proconfig @> ARRAY['search_path=""', 'plan_cache_mode=force_custom_plan']
  );

-- V2 the order and the filter read rating_score and no longer read expert_rating; expect 0
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'rate' AND p.proname = 'search_master_products'
  AND (p.prosrc NOT LIKE '%m.rating_score%' OR p.prosrc LIKE '%expert_rating%');

-- V3 anon, authenticated and service_role can still call it; expect 0
SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
WHERE NOT has_function_privilege(
  r.role,
  'rate.search_master_products(uuid, text[], text, numeric, numeric, numeric, integer[], integer[], integer, integer, integer, boolean, boolean, numeric, text, integer, integer)',
  'EXECUTE'
);

-- V4 "highest rated" never puts a product above one with a higher shown rating; expect 0
SELECT count(*) FROM (
  SELECT lag(r.rating_5) OVER (ORDER BY s.ordinality) AS above, r.rating_5 AS here
  FROM rate.search_master_products(p_sort => 'rating_desc', p_limit => 500)
    WITH ORDINALITY AS s
  CROSS JOIN LATERAL (
    SELECT COALESCE(CASE
      WHEN s.rating_score > 0 AND s.rating_score <= 5 THEN s.rating_score
      ELSE COALESCE(
        CASE WHEN s.user_rating_weighted > 0 AND s.user_rating_weighted <= 100 THEN round(CASE
          WHEN s.user_rating_weighted > 10 THEN s.user_rating_weighted / 20
          WHEN s.user_rating_weighted > 5 THEN s.user_rating_weighted / 2
          ELSE s.user_rating_weighted END, 2) END,
        CASE WHEN s.average_rating > 0 AND s.average_rating <= 100 THEN round(CASE
          WHEN s.average_rating > 10 THEN s.average_rating / 20
          WHEN s.average_rating > 5 THEN s.average_rating / 2
          ELSE s.average_rating END, 2) END)
    END, 0) AS rating_5
  ) r
) o
WHERE o.here > o.above;

-- V5 a minimum rating returns exactly the published products whose shown rating reaches it; expect 0
-- (per threshold: products returned below it, plus products at or above it that are missing).
WITH shown AS (
  SELECT m.id, COALESCE(CASE
    WHEN m.rating_score > 0 AND m.rating_score <= 5 THEN m.rating_score
    ELSE COALESCE(
      CASE WHEN m.user_rating_weighted > 0 AND m.user_rating_weighted <= 100 THEN round(CASE
        WHEN m.user_rating_weighted > 10 THEN m.user_rating_weighted / 20
        WHEN m.user_rating_weighted > 5 THEN m.user_rating_weighted / 2
        ELSE m.user_rating_weighted END, 2) END,
      CASE WHEN m.average_rating > 0 AND m.average_rating <= 100 THEN round(CASE
        WHEN m.average_rating > 10 THEN m.average_rating / 20
        WHEN m.average_rating > 5 THEN m.average_rating / 2
        ELSE m.average_rating END, 2) END)
  END, 0) AS rating_5
  FROM rate.master_products m
  WHERE m.status = 'published'
),
thresholds AS (SELECT unnest(ARRAY[3.5, 4.0, 4.5, 4.8]::numeric[]) AS t),
returned AS (
  SELECT t.t, s.id
  FROM thresholds t
  CROSS JOIN LATERAL rate.search_master_products(p_min_rating => t.t, p_limit => 500) s
)
SELECT
  (SELECT count(*) FROM returned r JOIN shown s ON s.id = r.id WHERE s.rating_5 < r.t)
  + (SELECT count(*) FROM thresholds t
     WHERE (SELECT count(*) FROM returned r WHERE r.t = t.t)
         < LEAST(500, (SELECT count(*) FROM shown s WHERE s.rating_5 >= t.t)));
