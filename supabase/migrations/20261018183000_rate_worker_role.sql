-- =============================================================================
-- Migration: 20261018183000_rate_worker_role.sql
-- Purpose (Rate audit K3): a least-privilege role for the Rate-Services crawl
-- worker, so the process that drives Chromium on untrusted e-commerce pages no
-- longer holds the shared project's service_role key.
--
--   * rate_worker: NOLOGIN NOINHERIT, no BYPASSRLS. PostgREST switches to it
--     when a Supabase Auth user whose auth.users.role is 'rate_worker' signs
--     in (the access token's role claim), so authenticator is its only member.
--   * Privileges cover only the worker cycle (ingest, queue, auditors, price
--     alerts) in schema rate: SELECT/INSERT/UPDATE on the tables it writes,
--     SELECT on what it reads, EXECUTE on the RPCs it calls. No DELETE, no
--     TRUNCATE, no direct crawl_jobs/crawl_runs access (RPCs only), nothing
--     outside rate apart from USAGE on pg_trgm's schema for match_master_product.
--   * PII and other products' fields stay out of reach: merchants phone /
--     bank columns are not readable and DOSafe's risk_score is not writable;
--     price_alerts only lets the worker mark delivery; community reviews and
--     their verdicts are read-only to it.
--   * Catalog maintenance that deletes or rewrites data (purge-fabricated,
--     remove-wrong-listings, reanalyze-reviews, cancel_crawl_jobs) stays
--     service_role-only behind the prod-ops gate. The worker keeps
--     purge_completed_crawl_jobs, which only trims terminal queue rows past
--     the retention window (at least 3 days, 5000 rows per call).
--
-- New rate tables or RPCs the worker needs must grant rate_worker explicitly:
-- there are no default privileges for this role.
-- Idempotent: guarded CREATE ROLE with a drift check, GRANT/REVOKE, DROP POLICY
-- IF EXISTS before CREATE POLICY.
-- =============================================================================

BEGIN;

-- Fail fast instead of queueing behind long transactions on the shared database.
SET LOCAL lock_timeout = '5s';
-- The creating role must not become a member of rate_worker.
SET LOCAL createrole_self_grant = '';

DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rate_worker') THEN
    CREATE ROLE rate_worker NOLOGIN NOINHERIT;
  END IF;

  SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit
  INTO r
  FROM pg_roles WHERE rolname = 'rate_worker';
  IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolinherit THEN
    RAISE EXCEPTION 'rate_worker drift: role must be NOLOGIN NOINHERIT without SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB';
  END IF;

  -- rate_worker must not inherit anything either.
  IF EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles member ON member.oid = am.member
    WHERE member.rolname = 'rate_worker'
  ) THEN
    RAISE EXCEPTION 'rate_worker drift: rate_worker must not be a member of any role';
  END IF;
END $$;

GRANT rate_worker TO authenticator;

DO $$
BEGIN
  -- Only authenticator may switch to rate_worker (SET, no INHERIT). The only
  -- other membership allowed is postgres's ADMIN-only grant that PostgreSQL
  -- gives the creating role (no INHERIT, no SET), as for dosai_pricing_worker
  -- (20261002110500).
  IF EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles granted ON granted.oid = am.roleid
    JOIN pg_roles member ON member.oid = am.member
    WHERE granted.rolname = 'rate_worker'
      AND NOT (
        (member.rolname = 'authenticator' AND NOT am.inherit_option AND NOT am.admin_option)
        OR (member.rolname = 'postgres' AND am.admin_option AND NOT am.inherit_option AND NOT am.set_option)
      )
  ) THEN
    RAISE EXCEPTION 'rate_worker drift: unexpected member of rate_worker (only authenticator, plus postgres as ADMIN only)';
  END IF;
END $$;

-- Schema access ------------------------------------------------------------

GRANT USAGE ON SCHEMA rate TO rate_worker;

DO $$
DECLARE
  v_trgm_schema TEXT;
BEGIN
  -- match_master_product (SECURITY INVOKER) calls pg_trgm's similarity();
  -- production keeps the extension in schema "sign", other environments in
  -- "extensions". On production "sign" also holds Crove Sign's tables, which
  -- are granted only to sign_app / service_role / postgres, so USAGE alone
  -- reaches nothing there beyond what PUBLIC can already execute.
  SELECT n.nspname INTO v_trgm_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF v_trgm_schema IS NOT NULL AND v_trgm_schema <> 'rate' THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO rate_worker', v_trgm_schema);
  END IF;
END $$;

-- Tables -------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA rate FROM rate_worker;

GRANT SELECT ON rate.categories TO rate_worker;
GRANT SELECT, INSERT, UPDATE ON
  rate.products,
  rate.master_products,
  rate.price_history,
  rate.reviews,
  rate.review_flags,
  rate.review_analysis
TO rate_worker;

-- merchants: no phone / bank_account / bank_name, and DOSafe's risk_score is
-- readable but never writable. SELECT on every upserted column is required:
-- ON CONFLICT DO UPDATE SET col = EXCLUDED.col reads it.
GRANT SELECT (
  id, platform, platform_shop_id, name, slug, url, is_official, rating_star,
  follower_count, location, entity_hash, risk_score, metadata, created_at,
  updated_at, review_risk_score, review_risk_breakdown, review_risk_updated_at,
  archived_at
) ON rate.merchants TO rate_worker;
-- INSERT and UPDATE cover the same columns, so any upsert payload the worker
-- can update it can also insert.
GRANT INSERT (
  platform, platform_shop_id, name, url, is_official, rating_star,
  follower_count, location, entity_hash, updated_at, review_risk_score,
  review_risk_breakdown, review_risk_updated_at, metadata
) ON rate.merchants TO rate_worker;
-- PostgREST's merge-duplicates upsert SETs every payload column, including the
-- conflict key (platform, platform_shop_id), and PostgreSQL checks those UPDATE
-- privileges at plan time even when the row is new.
GRANT UPDATE (
  platform, platform_shop_id, name, url, is_official, rating_star,
  follower_count, location, entity_hash, updated_at, review_risk_score,
  review_risk_breakdown, review_risk_updated_at, metadata
) ON rate.merchants TO rate_worker;

-- price_alerts: the evaluator reads alerts (subscriber_email for delivery)
-- and only marks delivery; it cannot redirect, retarget or disable an alert.
GRANT SELECT ON rate.price_alerts TO rate_worker;
GRANT UPDATE (last_triggered_at, updated_at) ON rate.price_alerts TO rate_worker;
-- price_history.id is BIGSERIAL (the no-RPC ingest fallback inserts directly).
GRANT USAGE ON SEQUENCE rate.price_history_id_seq TO rate_worker;

-- RLS: the write policies on these tables are TO service_role; give the worker
-- its own. Table grants above, not the policies, limit it to SELECT/INSERT/
-- UPDATE (no DELETE).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'merchants', 'products', 'master_products', 'price_history',
    'review_analysis', 'price_alerts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Rate worker access %s" ON rate.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Rate worker access %s" ON rate.%I FOR ALL TO rate_worker USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- reviews / review_flags: the worker writes crawled reviews and their
-- verdicts only. Community reviews (and their verdicts) are read-only to it.
DROP POLICY IF EXISTS "Rate worker access reviews" ON rate.reviews;
DROP POLICY IF EXISTS "Rate worker read reviews" ON rate.reviews;
DROP POLICY IF EXISTS "Rate worker insert reviews" ON rate.reviews;
DROP POLICY IF EXISTS "Rate worker update reviews" ON rate.reviews;
CREATE POLICY "Rate worker read reviews" ON rate.reviews
  FOR SELECT TO rate_worker USING (true);
CREATE POLICY "Rate worker insert reviews" ON rate.reviews
  FOR INSERT TO rate_worker WITH CHECK (origin <> 'community');
CREATE POLICY "Rate worker update reviews" ON rate.reviews
  FOR UPDATE TO rate_worker USING (origin <> 'community') WITH CHECK (origin <> 'community');

DROP POLICY IF EXISTS "Rate worker access review_flags" ON rate.review_flags;
DROP POLICY IF EXISTS "Rate worker read review_flags" ON rate.review_flags;
DROP POLICY IF EXISTS "Rate worker insert review_flags" ON rate.review_flags;
DROP POLICY IF EXISTS "Rate worker update review_flags" ON rate.review_flags;
CREATE POLICY "Rate worker read review_flags" ON rate.review_flags
  FOR SELECT TO rate_worker USING (true);
CREATE POLICY "Rate worker insert review_flags" ON rate.review_flags
  FOR INSERT TO rate_worker
  WITH CHECK (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_flags.review_id AND r.origin <> 'community'));
CREATE POLICY "Rate worker update review_flags" ON rate.review_flags
  FOR UPDATE TO rate_worker
  USING (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_flags.review_id AND r.origin <> 'community'))
  WITH CHECK (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_flags.review_id AND r.origin <> 'community'));

-- RPCs ---------------------------------------------------------------------

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rate FROM rate_worker;

-- Queue and run bookkeeping (SECURITY DEFINER; crawl_jobs has no table grant).
GRANT EXECUTE ON FUNCTION rate.start_crawl_run(TEXT, JSONB) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.finish_crawl_run(UUID, JSONB) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.enqueue_crawl_job(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INTEGER, UUID) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.dequeue_crawl_job(TEXT, TEXT, INTERVAL) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.heartbeat_crawl_job(UUID, UUID, INTERVAL) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.checkpoint_crawl_job(UUID, UUID, JSONB) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.ack_crawl_job(UUID, UUID, JSONB) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.fail_crawl_job(UUID, UUID, TEXT) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.release_crawl_job(UUID, UUID, TEXT) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.purge_completed_crawl_jobs(INTEGER) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.stamp_crawl_provenance(UUID, UUID) TO rate_worker;

-- Ingest and aggregates.
GRANT EXECUTE ON FUNCTION rate.record_price_observation(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.refresh_master_market_stats(UUID) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.match_master_product(TEXT, TEXT, TEXT, NUMERIC, REAL) TO rate_worker;

-- Auditor aggregates (SECURITY INVOKER: run with the table grants above).
GRANT EXECUTE ON FUNCTION rate.listing_price_context(UUID, INTEGER, INTEGER, UUID[]) TO rate_worker;
GRANT EXECUTE ON FUNCTION rate.merchant_review_counts(UUID[]) TO rate_worker;

COMMIT;
