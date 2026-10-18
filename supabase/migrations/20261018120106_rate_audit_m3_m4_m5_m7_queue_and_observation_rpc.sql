-- ============================================================================
-- Migration: 20261018120106_rate_audit_m3_m4_m5_m7_queue_and_observation_rpc.sql
-- Purpose:
--   1. Audit M3: Add `rate.cancel_crawl_jobs(p_job_ids UUID[], p_reason TEXT)`
--      (`SECURITY DEFINER`, `SET search_path = ''`) so operator scripts can cancel
--      pending crawl jobs without direct DML on `rate.crawl_jobs`.
--   2. Audit M4:
--      - Add platform-first claimable index `idx_crawl_jobs_claimable_platform`
--        (`(platform, priority DESC, created_at) WHERE status IN ('pending', 'running')`).
--      - Add URL-only live dedupe partial unique index `uq_crawl_jobs_live_target_url`
--        and update `rate.enqueue_crawl_job` to deduplicate URL-only jobs.
--      - Add `rate.release_crawl_job(p_id UUID, p_claim_token UUID, p_reason TEXT)`
--        for graceful `SIGTERM`/`SIGINT` lease release without burning an attempt.
--   3. Audit M5: Add missing FK B-tree indexes (`idx_price_history_promotion_id`,
--      `idx_crawl_jobs_run_id`, `idx_promotions_product_id`).
--   4. Audit M7: Add `price_history_price_non_negative_check` (`CHECK (price >= 0)`)
--      and single-round-trip `rate.record_price_observation` RPC (`ON CONFLICT
--      (observation_id) WHERE observation_id IS NOT NULL DO NOTHING`).
--   5. Supabase Linter 0011: Harden `SET search_path = ''` across all queue,
--      verdict, and helper functions (`signals_valid`, `review_input_hash`,
--      `match_master_product`, etc.).
-- Note: Reference migration in DOS/Rate; official deployment via DOS-Me ledger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit M4 & M5: Platform-First Queue Index, URL Dedupe Index & FK Indexes
-- ----------------------------------------------------------------------------
-- Fail fast instead of queueing behind long transactions on the shared database.
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_claimable_platform
  ON rate.crawl_jobs (platform, priority DESC, created_at)
  WHERE status IN ('pending', 'running');

-- Deduplicate live URL-only jobs before creating the partial unique index
UPDATE rate.crawl_jobs cj
SET status = 'skipped',
    last_error = 'deduped_before_uq_crawl_jobs_live_target_url',
    updated_at = pg_catalog.now()
WHERE cj.status = 'pending'
  AND cj.platform_item_id IS NULL
  AND cj.target_url IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM rate.crawl_jobs newer
    WHERE newer.platform = cj.platform
      AND newer.target_url = cj.target_url
      AND newer.platform_item_id IS NULL
      AND newer.status IN ('pending', 'running')
      AND (newer.created_at > cj.created_at OR (newer.created_at = cj.created_at AND newer.id > cj.id))
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_crawl_jobs_live_target_url
  ON rate.crawl_jobs (platform, target_url)
  WHERE status IN ('pending', 'running')
    AND platform_item_id IS NULL
    AND target_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_price_history_promotion_id
  ON rate.price_history (promotion_id)
  WHERE promotion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_run_id
  ON rate.crawl_jobs (run_id)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_product_id
  ON rate.promotions (product_id);

-- ----------------------------------------------------------------------------
-- 2. Audit M3: `rate.cancel_crawl_jobs` RPC (Operator Queue Cancellation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.cancel_crawl_jobs(
  p_job_ids UUID[],
  p_reason TEXT DEFAULT 'cancelled_by_operator'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cancelled INTEGER := 0;
BEGIN
  IF p_job_ids IS NULL OR pg_catalog.array_length(p_job_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE rate.crawl_jobs
  SET status = 'skipped',
      last_error = pg_catalog.left(COALESCE(NULLIF(pg_catalog.btrim(p_reason), ''), 'cancelled_by_operator'), 2000),
      updated_at = pg_catalog.now()
  WHERE id = ANY(p_job_ids)
    AND status = 'pending';

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION rate.cancel_crawl_jobs(UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.cancel_crawl_jobs(UUID[], TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Audit M4: `rate.release_crawl_job` RPC (Graceful SIGTERM Lease Release)
--    & Updated `rate.enqueue_crawl_job` with URL-only Dedupe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.release_crawl_job(
  p_id UUID,
  p_claim_token UUID,
  p_reason TEXT DEFAULT 'worker_sigterm'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF p_id IS NULL OR p_claim_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE rate.crawl_jobs
  SET status = 'pending',
      leased_at = NULL,
      lease_expires = NULL,
      worker_id = NULL,
      attempts = GREATEST(0, attempts - 1),
      last_error = pg_catalog.left(COALESCE(NULLIF(pg_catalog.btrim(p_reason), ''), 'worker_sigterm'), 2000),
      updated_at = pg_catalog.now()
  WHERE id = p_id
    AND claim_token = p_claim_token
    AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION rate.release_crawl_job(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.release_crawl_job(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION rate.enqueue_crawl_job(
  p_type TEXT,
  p_platform TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_target_url TEXT DEFAULT NULL,
  p_platform_item_id TEXT DEFAULT NULL,
  p_platform_shop_id TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 0,
  p_run_id UUID DEFAULT NULL
)
RETURNS TABLE(job_id UUID, state TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_running UUID;
  v_pending UUID;
  v_new UUID;
BEGIN
  IF p_platform_item_id IS NOT NULL THEN
    SELECT id INTO v_running FROM rate.crawl_jobs
      WHERE platform = p_platform AND platform_item_id = p_platform_item_id AND status = 'running'
      ORDER BY created_at DESC LIMIT 1;
    IF v_running IS NOT NULL THEN
      RETURN QUERY SELECT v_running, 'running_in_progress'::text;
      RETURN;
    END IF;
    SELECT id INTO v_pending FROM rate.crawl_jobs
      WHERE platform = p_platform AND platform_item_id = p_platform_item_id AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE;
    IF v_pending IS NOT NULL THEN
      UPDATE rate.crawl_jobs SET status = 'skipped', updated_at = pg_catalog.now()
        WHERE id = v_pending AND status = 'pending';
    END IF;
  ELSIF p_target_url IS NOT NULL THEN
    SELECT id INTO v_running FROM rate.crawl_jobs
      WHERE platform = p_platform AND platform_item_id IS NULL AND target_url = p_target_url AND status = 'running'
      ORDER BY created_at DESC LIMIT 1;
    IF v_running IS NOT NULL THEN
      RETURN QUERY SELECT v_running, 'running_in_progress'::text;
      RETURN;
    END IF;
    SELECT id INTO v_pending FROM rate.crawl_jobs
      WHERE platform = p_platform AND platform_item_id IS NULL AND target_url = p_target_url AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE;
    IF v_pending IS NOT NULL THEN
      UPDATE rate.crawl_jobs SET status = 'skipped', updated_at = pg_catalog.now()
        WHERE id = v_pending AND status = 'pending';
    END IF;
  END IF;

  BEGIN
    INSERT INTO rate.crawl_jobs (type, platform, payload, target_url, platform_item_id, platform_shop_id, priority, run_id)
    VALUES (p_type, p_platform, p_payload, p_target_url, p_platform_item_id, p_platform_shop_id, p_priority, p_run_id)
    RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    DECLARE
      v_pending2 UUID;
      v_attempts INT := 0;
    BEGIN
      LOOP
        v_attempts := v_attempts + 1;
        IF p_platform_item_id IS NOT NULL THEN
          SELECT id INTO v_running FROM rate.crawl_jobs
            WHERE platform = p_platform AND platform_item_id = p_platform_item_id AND status = 'running'
            ORDER BY created_at DESC LIMIT 1;
          IF v_running IS NOT NULL THEN
            RETURN QUERY SELECT v_running, 'running_in_progress'::text;
            RETURN;
          END IF;
          SELECT id INTO v_pending2 FROM rate.crawl_jobs
            WHERE platform = p_platform AND platform_item_id = p_platform_item_id AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
            FOR UPDATE;
        ELSIF p_target_url IS NOT NULL THEN
          SELECT id INTO v_running FROM rate.crawl_jobs
            WHERE platform = p_platform AND platform_item_id IS NULL AND target_url = p_target_url AND status = 'running'
            ORDER BY created_at DESC LIMIT 1;
          IF v_running IS NOT NULL THEN
            RETURN QUERY SELECT v_running, 'running_in_progress'::text;
            RETURN;
          END IF;
          SELECT id INTO v_pending2 FROM rate.crawl_jobs
            WHERE platform = p_platform AND platform_item_id IS NULL AND target_url = p_target_url AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
            FOR UPDATE;
        END IF;

        IF v_pending2 IS NOT NULL THEN
          UPDATE rate.crawl_jobs SET status = 'skipped', updated_at = pg_catalog.now()
            WHERE id = v_pending2 AND status = 'pending';
        END IF;

        BEGIN
          INSERT INTO rate.crawl_jobs (type, platform, payload, target_url, platform_item_id, platform_shop_id, priority, run_id)
          VALUES (p_type, p_platform, p_payload, p_target_url, p_platform_item_id, p_platform_shop_id, p_priority, p_run_id)
          RETURNING id INTO v_new;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          IF v_attempts >= 5 THEN RAISE; END IF;
          CONTINUE;
        END;
      END LOOP;

      IF v_pending2 IS NOT NULL THEN
        UPDATE rate.crawl_jobs SET superseded_by = v_new WHERE id = v_pending2;
      END IF;
      RETURN QUERY SELECT v_new, 'enqueued'::text;
      RETURN;
    END;
  END;

  IF v_pending IS NOT NULL THEN
    UPDATE rate.crawl_jobs SET superseded_by = v_new WHERE id = v_pending;
  END IF;
  RETURN QUERY SELECT v_new, 'enqueued'::text;
END;
$$;

REVOKE ALL ON FUNCTION rate.enqueue_crawl_job(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.enqueue_crawl_job(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INTEGER, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Audit M7: Non-Negative Price Check & Single-Round-Trip Price Observation RPC
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'rate.price_history'::regclass
      AND conname = 'price_history_price_non_negative_check'
  ) THEN
    ALTER TABLE rate.price_history
      ADD CONSTRAINT price_history_price_non_negative_check
      CHECK (price >= 0) NOT VALID;
    -- Not validated here: VALIDATE would scan price_history under lock and abort
    -- the migration on any legacy negative row. New and updated rows are checked.
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rate.record_price_observation(
  p_product_id UUID,
  p_price NUMERIC,
  p_price_original NUMERIC DEFAULT NULL,
  p_source TEXT DEFAULT 'shopee_crawler',
  p_observation_id TEXT DEFAULT NULL,
  p_promotion_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_price NUMERIC;
  v_prev_original NUMERIC;
  v_prev_recorded TIMESTAMPTZ;
  v_inserted INTEGER := 0;
BEGIN
  IF p_product_id IS NULL OR p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Invalid product_id or negative price in record_price_observation'
      USING ERRCODE = '22023';
  END IF;

  SELECT ph.price, ph.price_original, ph.recorded_at
  INTO v_prev_price, v_prev_original, v_prev_recorded
  FROM rate.price_history ph
  WHERE ph.product_id = p_product_id
  ORDER BY ph.recorded_at DESC
  LIMIT 1;

  IF v_prev_recorded IS NOT NULL
     AND v_prev_price = p_price
     AND COALESCE(v_prev_original, 0) = COALESCE(p_price_original, 0)
     AND v_prev_recorded > pg_catalog.now() - INTERVAL '7 days'
  THEN
    RETURN 'unchanged_delta';
  END IF;

  IF p_observation_id IS NOT NULL THEN
    INSERT INTO rate.price_history (
      product_id,
      observation_id,
      price,
      price_original,
      recorded_at,
      source,
      promotion_id
    )
    VALUES (
      p_product_id,
      p_observation_id,
      p_price,
      p_price_original,
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_source), ''), 'shopee_crawler'),
      p_promotion_id
    )
    ON CONFLICT (observation_id) WHERE observation_id IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO rate.price_history (
      product_id,
      price,
      price_original,
      recorded_at,
      source,
      promotion_id
    )
    VALUES (
      p_product_id,
      p_price,
      p_price_original,
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_source), ''), 'shopee_crawler'),
      p_promotion_id
    );
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN 'inserted';
  END IF;
  RETURN 'deduped_conflict';
END;
$$;

REVOKE ALL ON FUNCTION rate.record_price_observation(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.record_price_observation(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Supabase Linter 0011: Harden `SET search_path = ''` Across Queue & Helpers
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'signals_valid') THEN
    ALTER FUNCTION rate.signals_valid(jsonb) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'review_input_hash') THEN
    ALTER FUNCTION rate.review_input_hash(text, smallint, text) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'match_master_product') THEN
    ALTER FUNCTION rate.match_master_product(text, text, text, numeric, real) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'dequeue_crawl_job') THEN
    ALTER FUNCTION rate.dequeue_crawl_job(text, text, interval) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'heartbeat_crawl_job') THEN
    ALTER FUNCTION rate.heartbeat_crawl_job(uuid, uuid, interval) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'checkpoint_crawl_job') THEN
    ALTER FUNCTION rate.checkpoint_crawl_job(uuid, uuid, jsonb) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'ack_crawl_job') THEN
    ALTER FUNCTION rate.ack_crawl_job(uuid, uuid, jsonb) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'fail_crawl_job') THEN
    ALTER FUNCTION rate.fail_crawl_job(uuid, uuid, text) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'start_crawl_run') THEN
    ALTER FUNCTION rate.start_crawl_run(text, jsonb) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'finish_crawl_run') THEN
    ALTER FUNCTION rate.finish_crawl_run(uuid, jsonb) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'reserve_review_generation') THEN
    ALTER FUNCTION rate.reserve_review_generation(uuid, text) SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'rate' AND p.proname = 'commit_review_verdict') THEN
    ALTER FUNCTION rate.commit_review_verdict(uuid, bigint, text, text, numeric, jsonb, text, text) SET search_path = '';
  END IF;
END $$;

RESET lock_timeout;
