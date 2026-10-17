-- ==============================================================================
-- rate: platform tables (crawl queue, review verdicts, promotions, snapshots)
--
-- Implements Rate repo plan v7 (Docs/Proposals/2026-10-04-rate-domain-migration-plan.md,
-- approved Codex APPROVED-WITH-NOTES + Gemini APPROVED) §4:
--   * Postgres queue: crawl_runs + crawl_jobs, ALL mutations via SECURITY
--     DEFINER RPCs (PostgREST cannot run FOR UPDATE SKIP LOCKED), per-claim
--     token fencing, direct DML revoked on service_role.
--   * review_flags: per-review current verdict, generation reserve/commit
--     protocol under row locks, value-typed signals whitelist via IMMUTABLE
--     helper CHECK.
--   * promotions: event identity vs price observations separated; two
--     non-overlapping partial unique indexes.
--   * merchant_snapshots: daily snapshot with DATE column (no mutable
--     timestamptz cast in the index).
--   * price_history: promotion_id FK + listing-scoped observation id (UNIQUE).
--
-- All DDL is idempotent. Public read follows the existing rate pattern;
-- queue tables are service-only with no policies at all.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Crawl runs (one row per crawler invocation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.crawl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','finished','aborted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  stats JSONB
);

-- ------------------------------------------------------------------------------
-- 2. Crawl jobs (Postgres queue; identity-deduped, claim-token fenced)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','skipped')),
  priority INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Hybrid identity columns (plan v7 §4.1): real columns for claim/dedup keys.
  target_url TEXT,
  platform_item_id TEXT,
  platform_shop_id TEXT,
  -- lease / retry machinery
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_id UUID REFERENCES rate.crawl_runs(id) ON DELETE SET NULL,
  leased_at TIMESTAMPTZ,
  lease_expires TIMESTAMPTZ,
  worker_id TEXT,
  claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
  backoff_until TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identity dedup ONLY on live states: terminal jobs (done/failed) never block
-- a legitimate recrawl (plan v7 §4.1 / Codex N2).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crawl_jobs_live_identity
  ON rate.crawl_jobs (platform, platform_item_id)
  WHERE status IN ('pending','running') AND platform_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_claimable
  ON rate.crawl_jobs (priority DESC, created_at)
  WHERE status IN ('pending','running');

-- ------------------------------------------------------------------------------
-- 3. Queue RPCs (SECURITY DEFINER; EXECUTE granted to service_role only)
-- ------------------------------------------------------------------------------

-- Sole write path for creating jobs (Codex N5). On identity conflict:
--  * live pending job exists -> supersede it and insert the fresh one;
--  * running job exists      -> do NOT insert; return the existing job with
--    state 'running_in_progress' so callers subscribe instead of stacking.
CREATE OR REPLACE FUNCTION rate.enqueue_crawl_job(
  p_type text,
  p_platform text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_target_url text DEFAULT NULL,
  p_platform_item_id text DEFAULT NULL,
  p_platform_shop_id text DEFAULT NULL,
  p_priority integer DEFAULT 0,
  p_run_id uuid DEFAULT NULL
) RETURNS TABLE(job_id uuid, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_running uuid;
  v_pending uuid;
  v_new uuid;
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
      UPDATE rate.crawl_jobs SET status = 'skipped', updated_at = now()
        WHERE id = v_pending AND status = 'pending';
    END IF;
  END IF;

  BEGIN
    INSERT INTO rate.crawl_jobs (type, platform, payload, target_url, platform_item_id, platform_shop_id, priority, run_id)
    VALUES (p_type, p_platform, p_payload, p_target_url, p_platform_item_id, p_platform_shop_id, p_priority, p_run_id)
    RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    -- Lost the identity race (Codex #6 round 2): another enqueue inserted a
    -- PENDING row, or a dequeue flipped one to running, between our reads and
    -- the INSERT. FOR UPDATE cannot lock a row that did not exist yet, so
    -- converge by re-reading live state and retrying the whole flow.
    DECLARE
      v_pending2 uuid;
      v_attempts int := 0;
    BEGIN
      LOOP
        v_attempts := v_attempts + 1;
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
        IF v_pending2 IS NULL THEN
          -- Live state vanished (previous pending superseded into our slot):
          -- retry the plain INSERT.
          BEGIN
            INSERT INTO rate.crawl_jobs (type, platform, payload, target_url, platform_item_id, platform_shop_id, priority, run_id)
            VALUES (p_type, p_platform, p_payload, p_target_url, p_platform_item_id, p_platform_shop_id, p_priority, p_run_id)
            RETURNING id INTO v_new;
            EXIT;
          EXCEPTION WHEN unique_violation THEN
            IF v_attempts >= 5 THEN RAISE; END IF;
            CONTINUE;
          END;
        ELSE
          UPDATE rate.crawl_jobs SET status = 'skipped', updated_at = now()
            WHERE id = v_pending2 AND status = 'pending';
          BEGIN
            INSERT INTO rate.crawl_jobs (type, platform, payload, target_url, platform_item_id, platform_shop_id, priority, run_id)
            VALUES (p_type, p_platform, p_payload, p_target_url, p_platform_item_id, p_platform_shop_id, p_priority, p_run_id)
            RETURNING id INTO v_new;
            EXIT;
          EXCEPTION WHEN unique_violation THEN
            IF v_attempts >= 5 THEN RAISE; END IF;
            CONTINUE;
          END;
        END IF;
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'enqueue_crawl_job: could not converge identity race for %/% after % attempts', p_platform, p_platform_item_id, v_attempts;
        END IF;
      END LOOP;
      -- successor link for the superseded pending row of THIS race (v_pending2)
      IF v_pending2 IS NOT NULL THEN
        UPDATE rate.crawl_jobs SET superseded_by = v_new WHERE id = v_pending2;
      END IF;
      RETURN QUERY SELECT v_new, 'enqueued'::text;
      RETURN; -- do not fall through to the outer RETURN (Codex round-3: double row)
    END;
  END;
  -- Successor id now exists: record the supersede link (Codex NIT 9).
  IF v_pending IS NOT NULL THEN
    UPDATE rate.crawl_jobs SET superseded_by = v_new WHERE id = v_pending;
  END IF;
  RETURN QUERY SELECT v_new, 'enqueued'::text;
END;
$$;

-- Claim one job (platform-filtered, SKIP LOCKED, reclaim expired leases,
-- respect backoff, zombie-loop protection at max_attempts).
CREATE OR REPLACE FUNCTION rate.dequeue_crawl_job(
  p_worker_id text,
  p_platform text,
  p_lease interval DEFAULT interval '10 minutes'
) RETURNS SETOF rate.crawl_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_expired uuid;
BEGIN
  -- Expired-lease reclaim happens in the normal dequeue path (no reaper).
  -- A job that already burned its attempts is flipped to failed instead of
  -- looping forever between zombie workers (Codex N6).
  SELECT id INTO v_expired
    FROM rate.crawl_jobs
    WHERE platform = p_platform AND status = 'running' AND lease_expires < now()
      AND attempts >= max_attempts
    ORDER BY lease_expires LIMIT 1
    FOR UPDATE SKIP LOCKED;
  IF v_expired IS NOT NULL THEN
    UPDATE rate.crawl_jobs
      SET status = 'failed', last_error = 'lease expired after max attempts', updated_at = now()
      WHERE id = v_expired;
  END IF;

  RETURN QUERY
  WITH available AS (
    SELECT id FROM rate.crawl_jobs
    WHERE platform = p_platform
      AND (
        (status = 'pending' AND (backoff_until IS NULL OR backoff_until <= now()))
        OR (status = 'running' AND lease_expires < now() AND attempts < max_attempts)
      )
    ORDER BY priority DESC, created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE rate.crawl_jobs j
  SET status = 'running',
      leased_at = now(),
      lease_expires = now() + p_lease,
      worker_id = p_worker_id,
      claim_token = gen_random_uuid(),
      attempts = j.attempts + 1,
      updated_at = now()
  FROM available
  WHERE j.id = available.id
  RETURNING j.*;
END;
$$;

-- Fenced lease extension: only the current claim holder, only while running
-- and not yet expired (expired leases must go back through dequeue).
CREATE OR REPLACE FUNCTION rate.heartbeat_crawl_job(
  p_id uuid,
  p_claim_token uuid,
  p_extend interval DEFAULT interval '5 minutes'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE rate.crawl_jobs
    SET lease_expires = now() + p_extend, updated_at = now()
    WHERE id = p_id AND claim_token = p_claim_token
      AND status = 'running' AND lease_expires > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Token-fenced per-section progress (Codex round-4 #8): a zombie worker cannot
-- advance the checkpoint of a reclaimed job.
CREATE OR REPLACE FUNCTION rate.checkpoint_crawl_job(
  p_id uuid,
  p_claim_token uuid,
  p_progress jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE rate.crawl_jobs
    SET progress = p_progress, updated_at = now()
    WHERE id = p_id AND claim_token = p_claim_token AND status = 'running';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION rate.ack_crawl_job(
  p_id uuid,
  p_claim_token uuid,
  p_stats jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE rate.crawl_jobs
    SET status = 'done', updated_at = now(), progress = progress || jsonb_build_object('final_stats', p_stats)
    WHERE id = p_id AND claim_token = p_claim_token AND status = 'running';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Exponential backoff (2^attempts minutes, capped 60) or terminal failure.
CREATE OR REPLACE FUNCTION rate.fail_crawl_job(
  p_id uuid,
  p_claim_token uuid,
  p_error text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_updated int;
  v_attempts int;
  v_max int;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM rate.crawl_jobs
    WHERE id = p_id AND claim_token = p_claim_token AND status = 'running'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_attempts >= v_max THEN
    UPDATE rate.crawl_jobs
      SET status = 'failed', last_error = left(p_error, 2000), updated_at = now()
      WHERE id = p_id;
  ELSE
    UPDATE rate.crawl_jobs
      SET status = 'pending',
          last_error = left(p_error, 2000),
          backoff_until = now() + least(power(2, v_attempts) * interval '1 minute', interval '60 minutes'),
          updated_at = now()
      WHERE id = p_id;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Run lifecycle (Codex N15/N16). A run still 'running' past the timeout is
-- flipped to 'aborted' opportunistically here - no separate reaper.
CREATE OR REPLACE FUNCTION rate.start_crawl_run(
  p_source text,
  p_params jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE rate.crawl_runs
    SET status = 'aborted', finished_at = now()
    WHERE status = 'running' AND started_at < now() - interval '6 hours';
  INSERT INTO rate.crawl_runs (source, params) VALUES (p_source, p_params)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION rate.finish_crawl_run(
  p_run_id uuid,
  p_stats jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_updated int;
BEGIN
  -- A run that blew past the timeout is aborted, never 'finished' (Codex #8).
  UPDATE rate.crawl_runs
    SET status = 'aborted', finished_at = now()
    WHERE status = 'running' AND started_at < now() - interval '6 hours';
  UPDATE rate.crawl_runs
    SET status = 'finished', finished_at = now(), stats = p_stats
    WHERE id = p_run_id AND status = 'running';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Queue tables are service-only: RLS enabled with NO policies (anon/auth
-- see nothing), direct DML revoked even from service_role so the RPCs are
-- the sole write path (plan v7 §4.5 / Codex N5 residual).
ALTER TABLE rate.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate.crawl_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.crawl_jobs FROM anon, authenticated;
REVOKE ALL ON rate.crawl_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rate.crawl_jobs FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rate.crawl_runs FROM service_role;
GRANT SELECT ON rate.crawl_jobs TO service_role;
GRANT SELECT ON rate.crawl_runs TO service_role;
GRANT EXECUTE ON FUNCTION rate.enqueue_crawl_job(text, text, jsonb, text, text, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rate.dequeue_crawl_job(text, text, interval) TO service_role;
GRANT EXECUTE ON FUNCTION rate.heartbeat_crawl_job(uuid, uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION rate.checkpoint_crawl_job(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rate.ack_crawl_job(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rate.fail_crawl_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rate.start_crawl_run(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rate.finish_crawl_run(uuid, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION rate.enqueue_crawl_job(text, text, jsonb, text, text, text, integer, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.dequeue_crawl_job(text, text, interval) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.heartbeat_crawl_job(uuid, uuid, interval) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.checkpoint_crawl_job(uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.ack_crawl_job(uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.fail_crawl_job(uuid, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.start_crawl_run(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.finish_crawl_run(uuid, jsonb) FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. review_flags (per-review current verdict)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.review_flags (
  review_id UUID PRIMARY KEY REFERENCES rate.reviews(id) ON DELETE CASCADE,
  fake_probability NUMERIC(4, 3) CHECK (fake_probability IS NULL OR (fake_probability >= 0 AND fake_probability <= 1)),
  verdict TEXT CHECK (verdict IN ('authentic','suspicious','fake','unanalyzed')),
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  detector TEXT NOT NULL,
  detector_version TEXT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1,
  input_hash TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Value-typed signals whitelist (Codex N7/N11/N13): IMMUTABLE scalar helper
-- (jsonb_each is set-returning and cannot be walked inside a CHECK).
CREATE OR REPLACE FUNCTION rate.signals_valid(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  v jsonb;
  allowed text[] := ARRAY[
    'burst_pattern_score','duplicate_text_ratio','account_age_bucket',
    'reviewer_history_score','language_marker_score'
  ];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v) = 'number' THEN
      IF (v::text)::numeric < 0 OR (v::text)::numeric > 1 THEN
        RETURN false;
      END IF;
    ELSIF jsonb_typeof(v) = 'string' THEN
      IF v #>> '{}' NOT IN ('low','medium','high','unknown') THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false; -- nested objects/arrays/bools/nulls are not allowed
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.review_flags'::regclass AND conname = 'review_flags_signals_valid') THEN
    ALTER TABLE rate.review_flags
      ADD CONSTRAINT review_flags_signals_valid CHECK (rate.signals_valid(signals));
  END IF;
END $$;

-- RLS: public read (verdicts power UI badges); writes only via RPC.
ALTER TABLE rate.review_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view review_flags" ON rate.review_flags;
CREATE POLICY "Public can view review_flags" ON rate.review_flags FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write review_flags" ON rate.review_flags;
CREATE POLICY "Service role write review_flags" ON rate.review_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON rate.review_flags TO anon, authenticated;
GRANT ALL ON rate.review_flags TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rate.review_flags FROM service_role;

-- Canonical, collision-safe input hash (Codex #5): length-prefixed fields so
-- ('A|5',5,'B') and ('A',5,'5|B') can never collide. Single source of truth
-- used by both reserve and commit.
CREATE OR REPLACE FUNCTION rate.review_input_hash(p_author text, p_rating smallint, p_comment text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Pure function of its arguments (no table access): IMMUTABLE is honest
  -- here, and callers read the row themselves so snapshot semantics are
  -- explicit at every call site.
  SELECT md5(
    length(coalesce(p_author,''))::text || ':' || coalesce(p_author,'') || '|' ||
    p_rating::text || '|' ||
    length(coalesce(p_comment,''))::text || ':' || coalesce(p_comment,'')
  );
$$;

-- Generation reserve (Codex N3/N9/N12): allocated BEFORE analysis. Refuses
-- stale input at reservation time; same-input re-analysis bumps generation.
CREATE OR REPLACE FUNCTION rate.reserve_review_generation(
  p_review_id uuid,
  p_input_hash text
) RETURNS TABLE(generation bigint, input_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_current_hash text;
  v_gen bigint;
BEGIN
  -- Current hash comes from the shared canonical pure helper over the live row.
  SELECT rate.review_input_hash(author_name, rating_star, comment) INTO v_current_hash
    FROM rate.reviews WHERE id = p_review_id;
  IF v_current_hash IS NULL THEN
    RAISE EXCEPTION 'review % not found', p_review_id;
  END IF;
  IF v_current_hash <> p_input_hash THEN
    RAISE EXCEPTION 'stale analysis input: review % current hash is %, caller has %', p_review_id, v_current_hash, p_input_hash;
  END IF;

  -- Upsert with hash resync (Codex #4): when the review changed since the last
  -- flag row, adopt the NEW hash and bump generation so the caller receives a
  -- reservation bound to the CURRENT input instead of a doomed old one.
  INSERT INTO rate.review_flags (review_id, input_hash, generation, detector, detector_version, verdict)
    VALUES (p_review_id, v_current_hash, 1, 'pending', '0', 'unanalyzed')
    ON CONFLICT (review_id) DO UPDATE
      SET generation = rate.review_flags.generation + 1,
          input_hash = EXCLUDED.input_hash,
          verdict = 'unanalyzed',
          analyzed_at = now()
    RETURNING rate.review_flags.generation, rate.review_flags.input_hash INTO v_gen, v_current_hash;
  RETURN QUERY SELECT v_gen, v_current_hash;
END;
$$;

-- Verdict commit (Codex N12 + round-6 locking contract): row-locks the review
-- and the reservation, re-verifies the input hash UNDER THE LOCK, holds the
-- lock to commit. Direct DML is revoked; this RPC is the only writer.
CREATE OR REPLACE FUNCTION rate.commit_review_verdict(
  p_review_id uuid,
  p_generation bigint,
  p_input_hash text,
  p_verdict text,
  p_probability numeric,
  p_signals jsonb,
  p_detector text,
  p_detector_version text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_catalog
AS $$
DECLARE
  v_review text;
  v_flag text;
  v_updated int;
BEGIN
  -- Lock the review row first (blocks concurrent edits for the tx duration),
  -- then hash the LOCKED row's fields via the shared canonical pure helper.
  SELECT rate.review_input_hash(author_name, rating_star, comment)
    INTO v_review
    FROM rate.reviews WHERE id = p_review_id FOR UPDATE;
  IF v_review IS NULL OR v_review <> p_input_hash THEN
    RETURN false; -- review changed (or gone) since reservation; verdict dies here
  END IF;

  SELECT 'locked' INTO v_flag
    FROM rate.review_flags
    WHERE review_id = p_review_id AND generation = p_generation AND input_hash = p_input_hash
    FOR UPDATE;
  IF v_flag IS NULL THEN
    RETURN false; -- reservation superseded
  END IF;

  UPDATE rate.review_flags
    SET verdict = p_verdict,
        fake_probability = p_probability,
        signals = p_signals,
        detector = p_detector,
        detector_version = p_detector_version,
        analyzed_at = now()
    WHERE review_id = p_review_id AND generation = p_generation AND input_hash = p_input_hash;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION rate.reserve_review_generation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rate.commit_review_verdict(uuid, bigint, text, text, numeric, jsonb, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION rate.reserve_review_generation(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.commit_review_verdict(uuid, bigint, text, text, numeric, jsonb, text, text) FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. Promotions (event identity vs price observations separated)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES rate.products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_promo_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('flash_sale','voucher','bundle','other')),
  sku_scope TEXT NOT NULL DEFAULT 'all',
  discounted_price NUMERIC(15, 2),
  original_price NUMERIC(15, 2),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  raw JSONB DEFAULT '{}'::jsonb,
  promo_fingerprint TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two non-overlapping partial unique indexes (Codex N10): platform-id path
-- and fingerprint path can never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotions_platform_id
  ON rate.promotions (product_id, platform, platform_promo_id, sku_scope)
  WHERE platform_promo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotions_fingerprint
  ON rate.promotions (product_id, platform, promo_fingerprint, sku_scope)
  WHERE platform_promo_id IS NULL;

ALTER TABLE rate.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view promotions" ON rate.promotions;
CREATE POLICY "Public can view promotions" ON rate.promotions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write promotions" ON rate.promotions;
CREATE POLICY "Service role write promotions" ON rate.promotions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON rate.promotions TO anon, authenticated;
GRANT ALL ON rate.promotions TO service_role;

-- ------------------------------------------------------------------------------
-- 6. Merchant snapshots (daily, DATE column - no mutable timestamptz cast)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate.merchant_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES rate.merchants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  rating_star NUMERIC(3, 2),
  follower_count INTEGER DEFAULT 0,
  product_count INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_merchant_snapshot_day UNIQUE (merchant_id, snapshot_date)
);

ALTER TABLE rate.merchant_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view merchant_snapshots" ON rate.merchant_snapshots;
CREATE POLICY "Public can view merchant_snapshots" ON rate.merchant_snapshots FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write merchant_snapshots" ON rate.merchant_snapshots;
CREATE POLICY "Service role write merchant_snapshots" ON rate.merchant_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON rate.merchant_snapshots TO anon, authenticated;
GRANT ALL ON rate.merchant_snapshots TO service_role;

-- ------------------------------------------------------------------------------
-- 7. price_history: promotion link + listing-scoped observation id
-- ------------------------------------------------------------------------------
ALTER TABLE rate.price_history ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES rate.promotions(id) ON DELETE SET NULL;
ALTER TABLE rate.price_history ADD COLUMN IF NOT EXISTS observation_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_history_observation
  ON rate.price_history (observation_id)
  WHERE observation_id IS NOT NULL;

ALTER TABLE rate.price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role write price_history" ON rate.price_history;
CREATE POLICY "Service role write price_history" ON rate.price_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PUBLIC holds EXECUTE on functions by default (Codex blocker 1): strip it
-- from every rate queue/verdict RPC; only service_role keeps EXECUTE.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'rate'
      AND p.proname IN ('enqueue_crawl_job','dequeue_crawl_job','heartbeat_crawl_job',
                        'checkpoint_crawl_job','ack_crawl_job','fail_crawl_job',
                        'start_crawl_run','finish_crawl_run',
                        'reserve_review_generation','commit_review_verdict')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION rate.%I FROM PUBLIC', fn.proname);
  END LOOP;
END $$;

-- ==============================================================================
-- CONTRACT GUARD: verify the full platform-table contract exists after DDL.
-- ==============================================================================
DO $$
DECLARE
  v_missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='rate' AND table_name='crawl_jobs')
    OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='rate' AND table_name='crawl_runs')
    OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='rate' AND table_name='review_flags')
    OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='rate' AND table_name='promotions')
    OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='rate' AND table_name='merchant_snapshots') THEN
    RAISE EXCEPTION 'platform tables guard: a required table is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='rate' AND indexname='uq_crawl_jobs_live_identity')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='rate' AND indexname='uq_promotions_platform_id')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='rate' AND indexname='uq_promotions_fingerprint')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='rate' AND indexname='uq_merchant_snapshot_day')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='rate' AND indexname='uq_price_history_observation') THEN
    RAISE EXCEPTION 'platform tables guard: a required unique index is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='rate' AND table_name='crawl_jobs' AND grantee='service_role' AND privilege_type IN ('INSERT','UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'platform tables guard: service_role direct DML on crawl_jobs must stay revoked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='rate' AND p.proname='commit_review_verdict' AND p.prosecdef) THEN
    RAISE EXCEPTION 'platform tables guard: commit_review_verdict RPC missing or not SECURITY DEFINER';
  END IF;
  IF NOT rate.signals_valid('{"burst_pattern_score":0.5}'::jsonb)
    OR rate.signals_valid('{"rogue_key":1}'::jsonb)
    OR rate.signals_valid('{"burst_pattern_score":"text"}'::jsonb)
    OR rate.signals_valid('{"burst_pattern_score":1.5}'::jsonb) THEN
    RAISE EXCEPTION 'platform tables guard: signals_valid helper failed self-test';
  END IF;
  RAISE NOTICE 'rate platform tables contract guard PASSED';
END $$;
