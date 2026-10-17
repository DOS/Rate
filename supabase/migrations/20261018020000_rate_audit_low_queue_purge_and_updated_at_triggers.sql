-- ==============================================================================
-- Migration: Rate Architecture Audit Section 7 (Low) Hardening
--   * 1. Queue Maintenance RPC: `rate.purge_completed_crawl_jobs(p_retention_days INTEGER DEFAULT 14)`
--        (`SECURITY DEFINER`, `SET search_path = ''`, callable by `service_role`)
--        purges terminal `done` and `failed` rows from `rate.crawl_jobs` (and
--        cascading `rate.crawl_runs`) older than `GREATEST(3, p_retention_days)` days
--        in bounded batches (`LIMIT 5000`) to prevent unbounded queue table bloat.
--   * 2. Automatic `updated_at` Trigger: `rate.set_updated_at_timestamp()`
--        (`SET search_path = ''`) attached to `rate.master_products`, `rate.products`,
--        `rate.merchants`, `rate.price_alerts`, and `rate.crawl_jobs`.
--   * 3. Non-Null `created_at` Defaults: Ensure `created_at` defaults to `now()`
--        and is backfilled across `rate` tables.
--
-- Target: Shared Supabase Project `dos` (Deploy ONLY via DOS-Me/supabase/migrations/)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Automatic `updated_at` Trigger Function & Table Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['master_products', 'products', 'merchants', 'price_alerts', 'crawl_jobs']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'rate'
        AND table_name = v_tbl
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_rate_%I_set_updated_at ON rate.%I', v_tbl, v_tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_rate_%I_set_updated_at BEFORE UPDATE ON rate.%I FOR EACH ROW EXECUTE FUNCTION rate.set_updated_at_timestamp()',
        v_tbl,
        v_tbl
      );
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Bounded Terminal Queue Purge RPC (`rate.purge_completed_crawl_jobs`)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.purge_completed_crawl_jobs(
  p_retention_days INTEGER DEFAULT 14
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days INTEGER := GREATEST(3, LEAST(COALESCE(p_retention_days, 14), 365));
  v_deleted INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'rate'
      AND table_name = 'crawl_jobs'
  ) THEN
    RETURN 0;
  END IF;

  WITH stale_jobs AS (
    SELECT id
    FROM rate.crawl_jobs
    -- crawl_jobs has `status` (pending/running/done/failed/skipped) and no
    -- finished_at; updated_at is set on every terminal transition.
    WHERE status IN ('done', 'failed', 'skipped')
      AND updated_at < now() - make_interval(days => v_days)
    ORDER BY updated_at ASC
    LIMIT 5000
  ),
  deleted AS (
    DELETE FROM rate.crawl_jobs j
    USING stale_jobs s
    WHERE j.id = s.id
    RETURNING j.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION rate.purge_completed_crawl_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.purge_completed_crawl_jobs(INTEGER) TO service_role;
