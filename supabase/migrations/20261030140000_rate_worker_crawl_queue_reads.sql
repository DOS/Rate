-- =============================================================================
-- Migration: 20261030140000_rate_worker_crawl_queue_reads.sql
-- Purpose (DOS/Rate-Services#739, DOS/DOS.Me#1460): read-only aggregates over
-- the crawl queue for the Rate-Services worker role.
--
-- rate_worker has no grant on rate.crawl_jobs (20261018183000) and must not get
-- one: claim_token fences ack_crawl_job / fail_crawl_job, and payload, progress
-- and target_url hold page data. Its audits only need counts, ages and error
-- groups, so they read the queue through three SECURITY DEFINER functions that
-- return nothing else:
--
--   rate.crawl_queue_summary(p_platforms)     - jobs per (platform, type,
--     status, priority) with the oldest created_at, newest updated_at, pending
--     jobs in a retry backoff and running jobs whose lease ran out; at most 500
--     rows. p_platforms NULL means every platform.
--   rate.crawl_job_failures(p_since, p_limit) - failed and skipped jobs per
--     (status, platform, type, error kind) updated within p_since; at most 500
--     rows (p_limit, default 200).
--   rate.crawl_job_repeat_failures(p_min_failures, p_since, p_limit) - listings
--     (platform, public platform_item_id) with at least p_min_failures failed or
--     skipped jobs whose error is a connection error, with the first and last
--     failure and the latest error kind; at most 100 rows (p_limit, default 50).
--
-- Windows are clamped to 1 hour .. 14 days: purge_completed_crawl_jobs keeps
-- terminal rows 14 days by default (20261018120105), so a longer window would
-- read a partial history. Raise the clamp together with the retention.
--
-- error_kind is the first 1000 characters of last_error normalized in SQL
-- (each distinct text once) so raw error text never leaves the database:
-- URLs, double- and single-quoted strings (an unclosed quote to the end;
-- b'', r'' and u'' literals included; an apostrophe inside a word such as
-- can't is not a quote), cookie headers,
-- user:password@ credentials, email addresses, UUIDs, JWTs and other 32+
-- character tokens, IPv4 hosts, numbers of 5+ digits, bearer / basic
-- credentials and key=value secrets are replaced, whitespace and control
-- characters collapse, and the result is cut at 200 characters. Callers still
-- normalize it again (Rate-Services crawlJobErrorKind + redactSensitiveString)
-- and re-sum groups that become equal. platform_item_id is cut at 200 too.
--
-- Statement timeout: a function-level SET statement_timeout does not bound the
-- statement that calls the function (the timer starts with the outer
-- statement), so none is set here. A PostgREST call runs under the request
-- role's statement_timeout, or authenticator's when that role sets none.
--
-- EXECUTE goes to service_role and rate_worker only. Nothing is granted on any
-- table, and no data changes.
-- Idempotent: an existing function with another signature or result type is
-- dropped first (CREATE OR REPLACE cannot change a result type), then CREATE OR
-- REPLACE, REVOKE and GRANT.
-- =============================================================================

BEGIN;

-- Fail fast instead of queueing behind long transactions on the shared database.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN (VALUES
      ('crawl_queue_summary',
       'p_platforms text[]',
       'TABLE(platform text, type text, status text, priority integer, jobs bigint, oldest_created_at timestamp with time zone, newest_updated_at timestamp with time zone, pending_in_backoff bigint, running_lease_expired bigint)'),
      ('crawl_job_failures',
       'p_since interval, p_limit integer',
       'TABLE(status text, platform text, type text, error_kind text, jobs bigint, latest_updated_at timestamp with time zone)'),
      ('crawl_job_repeat_failures',
       'p_min_failures integer, p_since interval, p_limit integer',
       'TABLE(platform text, platform_item_id text, failures bigint, first_failed_at timestamp with time zone, last_failed_at timestamp with time zone, latest_error_kind text)')
    ) AS want(proname, args, result)
      ON want.proname = p.proname
     AND want.args = pg_get_function_identity_arguments(p.oid)
     AND want.result = pg_get_function_result(p.oid)
    WHERE n.nspname = 'rate'
      AND p.proname IN ('crawl_queue_summary', 'crawl_job_failures', 'crawl_job_repeat_failures')
      AND want.proname IS NULL
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- A. Queue summary: counts and ages only.
CREATE OR REPLACE FUNCTION rate.crawl_queue_summary(p_platforms text[] DEFAULT NULL)
RETURNS TABLE (
  platform text,
  type text,
  status text,
  priority integer,
  jobs bigint,
  oldest_created_at timestamptz,
  newest_updated_at timestamptz,
  pending_in_backoff bigint,
  running_lease_expired bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.platform,
         j.type,
         j.status,
         j.priority,
         pg_catalog.count(*)::bigint,
         pg_catalog.min(j.created_at),
         pg_catalog.max(j.updated_at),
         (pg_catalog.count(*) FILTER (WHERE j.status = 'pending' AND j.backoff_until > pg_catalog.now()))::bigint,
         (pg_catalog.count(*) FILTER (WHERE j.status = 'running' AND j.lease_expires < pg_catalog.now()))::bigint
  FROM rate.crawl_jobs j
  WHERE p_platforms IS NULL OR j.platform = ANY (p_platforms)
  GROUP BY j.platform, j.type, j.status, j.priority
  ORDER BY j.platform, j.type, j.status, j.priority
  LIMIT 500;
$$;

-- B. Failed and skipped jobs by (status, platform, type, error kind).
-- The error_kind expression is the same in C; keep them in step.
CREATE OR REPLACE FUNCTION rate.crawl_job_failures(
  p_since interval DEFAULT interval '3 days',
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  status text,
  platform text,
  type text,
  error_kind text,
  jobs bigint,
  latest_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.status, f.platform, f.type, f.error_kind,
         pg_catalog.sum(f.n)::bigint AS jobs,
         pg_catalog.max(f.latest) AS latest_updated_at
  FROM (
    -- Normalize each distinct error once, not once per job.
    SELECT r.status, r.platform, r.type, r.n, r.latest,
           pg_catalog.left(
             pg_catalog.btrim(
               pg_catalog.regexp_replace(
                 pg_catalog.regexp_replace(
                   pg_catalog.regexp_replace(
                     pg_catalog.regexp_replace(
                       pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(
                           pg_catalog.regexp_replace(
                             pg_catalog.regexp_replace(
                               pg_catalog.regexp_replace(
                                 pg_catalog.regexp_replace(
                                   pg_catalog.regexp_replace(
                                     pg_catalog.regexp_replace(
                                       pg_catalog.regexp_replace(
                                         pg_catalog.regexp_replace(
                                           r.raw,
                                           '[a-z][a-z0-9+.-]*://\S+', '<url>', 'gi'),
                                         '"[^"]*("|$)', '"<text>\1', 'g'),
                                       '(?<![a-z0-9])([bru]?)''[^'']*(''|$)', '\1''<text>\2', 'gi'),
                                     '\m((set-)?cookie)\s*[=:][^\r\n]*', '\1=<redacted>', 'gi'),
                                   '[^\s/@:"<>]+:[^\s/@"<>]*@', '<cred>@', 'g'),
                                 '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+', '<email>', 'gi'),
                               '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'gi'),
                             'eyJ[a-z0-9_-]{8,}(\.[a-z0-9_-]+){0,2}', '<token>', 'gi'),
                           '[a-z0-9_-]{32,}', '<token>', 'gi'),
                         '\m[0-9]{1,3}(\.[0-9]{1,3}){3}(:[0-9]+)?', '<host>', 'g'),
                       '[0-9]{5,}', '#', 'g'),
                     '\m(bearer|basic)\s+[^\s,;]+', '\1 <redacted>', 'gi'),
                   '\m([a-z_-]*(token|key|secret|password|passwd|signature|authorization|session|credential)[a-z_-]*)\s*[=:]\s*[^\s,;&]+', '\1=<redacted>', 'gi'),
                 '[[:space:][:cntrl:]]+', ' ', 'g')),
             200) AS error_kind
    FROM (
      SELECT j.status, j.platform, j.type,
             pg_catalog.left(COALESCE(j.last_error, ''), 1000) AS raw,
             pg_catalog.count(*) AS n,
             pg_catalog.max(j.updated_at) AS latest
      FROM rate.crawl_jobs j
      WHERE j.status IN ('failed', 'skipped')
        AND j.updated_at >= pg_catalog.now() - LEAST(GREATEST(COALESCE(p_since, interval '3 days'), interval '1 hour'), interval '14 days')
      GROUP BY 1, 2, 3, 4
    ) r
  ) f
  GROUP BY f.status, f.platform, f.type, f.error_kind
  ORDER BY jobs DESC, latest_updated_at DESC, f.status, f.platform, f.type, f.error_kind
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

-- C. Listings with repeated connection failures: the public marketplace item
-- id, counts, timestamps and the latest error kind (normalized as in B).
CREATE OR REPLACE FUNCTION rate.crawl_job_repeat_failures(
  p_min_failures integer DEFAULT 3,
  p_since interval DEFAULT interval '3 days',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  platform text,
  platform_item_id text,
  failures bigint,
  first_failed_at timestamptz,
  last_failed_at timestamptz,
  latest_error_kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.platform,
         pg_catalog.left(g.platform_item_id, 200),
         g.failures,
         g.first_failed_at,
         g.last_failed_at,
         pg_catalog.left(
           pg_catalog.btrim(
             pg_catalog.regexp_replace(
               pg_catalog.regexp_replace(
                 pg_catalog.regexp_replace(
                   pg_catalog.regexp_replace(
                     pg_catalog.regexp_replace(
                       pg_catalog.regexp_replace(
                         pg_catalog.regexp_replace(
                           pg_catalog.regexp_replace(
                             pg_catalog.regexp_replace(
                               pg_catalog.regexp_replace(
                                 pg_catalog.regexp_replace(
                                   pg_catalog.regexp_replace(
                                     pg_catalog.regexp_replace(
                                       pg_catalog.regexp_replace(
                                         g.latest_error,
                                         '[a-z][a-z0-9+.-]*://\S+', '<url>', 'gi'),
                                       '"[^"]*("|$)', '"<text>\1', 'g'),
                                     '(?<![a-z0-9])([bru]?)''[^'']*(''|$)', '\1''<text>\2', 'gi'),
                                   '\m((set-)?cookie)\s*[=:][^\r\n]*', '\1=<redacted>', 'gi'),
                                 '[^\s/@:"<>]+:[^\s/@"<>]*@', '<cred>@', 'g'),
                               '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+', '<email>', 'gi'),
                             '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'gi'),
                           'eyJ[a-z0-9_-]{8,}(\.[a-z0-9_-]+){0,2}', '<token>', 'gi'),
                         '[a-z0-9_-]{32,}', '<token>', 'gi'),
                       '\m[0-9]{1,3}(\.[0-9]{1,3}){3}(:[0-9]+)?', '<host>', 'g'),
                     '[0-9]{5,}', '#', 'g'),
                   '\m(bearer|basic)\s+[^\s,;]+', '\1 <redacted>', 'gi'),
                 '\m([a-z_-]*(token|key|secret|password|passwd|signature|authorization|session|credential)[a-z_-]*)\s*[=:]\s*[^\s,;&]+', '\1=<redacted>', 'gi'),
               '[[:space:][:cntrl:]]+', ' ', 'g')),
           200)
  FROM (
    SELECT j.platform,
           j.platform_item_id,
           pg_catalog.count(*)::bigint AS failures,
           pg_catalog.min(j.updated_at) AS first_failed_at,
           pg_catalog.max(j.updated_at) AS last_failed_at,
           (pg_catalog.array_agg(pg_catalog.left(COALESCE(j.last_error, ''), 1000) ORDER BY j.updated_at DESC, j.id DESC))[1] AS latest_error
    FROM rate.crawl_jobs j
    WHERE j.status IN ('failed', 'skipped')
      AND j.platform_item_id IS NOT NULL
      AND j.updated_at >= pg_catalog.now() - LEAST(GREATEST(COALESCE(p_since, interval '3 days'), interval '1 hour'), interval '14 days')
      AND pg_catalog.left(COALESCE(j.last_error, ''), 1000) ~* '(ECONNRESET|socket hang up|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|net::ERR_|connection (reset|refused|closed))'
    GROUP BY j.platform, j.platform_item_id
    HAVING pg_catalog.count(*) >= GREATEST(COALESCE(p_min_failures, 3), 2)
    ORDER BY failures DESC, last_failed_at DESC, j.platform, j.platform_item_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) g
  ORDER BY g.failures DESC, g.last_failed_at DESC, g.platform, g.platform_item_id;
$$;

-- Privileges: service_role and rate_worker only. No privilege on crawl_jobs.
REVOKE ALL ON FUNCTION rate.crawl_queue_summary(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rate.crawl_job_failures(interval, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rate.crawl_job_repeat_failures(integer, interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.crawl_queue_summary(text[]) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.crawl_job_failures(interval, integer) TO service_role, rate_worker;
GRANT EXECUTE ON FUNCTION rate.crawl_job_repeat_failures(integer, interval, integer) TO service_role, rate_worker;

COMMIT;
