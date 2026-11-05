-- =============================================================================
-- Migration: 20261106160200_rate_extension_observations_purge_schedule.sql
-- Purpose (DOS/Rate#1606): step 8 of the apply runbook of
-- 20261106160000_rate_extension_observations.sql: run the retention purge daily. JOY approved
-- the M2 apply on 2026-11-04 in the Rate Core PO chat: "Duyệt M2".
--
-- rate.purge_extension_observations() with its defaults clears the network hashes after 28
-- days, deletes observations after 180 days and empty submitters after 7 days, as the
-- privacy policy and the extension's disclosures say. The job runs as its owner (postgres),
-- like dosai_audit_log_retention. Daily at 03:30 UTC (10:30 Vietnam time).
--
-- Idempotent: an existing job of the same name is unscheduled first. Where pg_cron is not
-- installed (the disposable replay database) it does nothing and says so; Beta and
-- Production have pg_cron.
-- Verify: SELECT jobname, schedule, command FROM cron.job
--         WHERE jobname = 'rate_extension_observations_purge';  -- one row
-- Rollback: SELECT cron.unschedule('rate_extension_observations_purge');
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: rate_extension_observations_purge not scheduled';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate_extension_observations_purge') THEN
    PERFORM cron.unschedule('rate_extension_observations_purge');
  END IF;
  PERFORM cron.schedule(
    'rate_extension_observations_purge',
    '30 3 * * *',
    $cmd$ SELECT rate.purge_extension_observations(); $cmd$
  );
END
$$;
