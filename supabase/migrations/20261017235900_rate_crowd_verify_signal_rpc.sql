-- ============================================================================
-- Migration: 20261017235900_rate_crowd_verify_signal_rpc.sql
-- Purpose (Issue #159 / Audit T9):
--   Provide a narrow, rate-limited SECURITY DEFINER wrapper RPC
--   `rate.enqueue_crowd_verify_signal` callable by `anon` and `authenticated`
--   so `POST /api/v1/rate/extension/ingest` never needs `SUPABASE_SERVICE_ROLE_KEY`
--   in `apps/web`.
--   NOTE: Open-Core reference migration in `DOS/Rate`. Official deployment to
--   Shared Prod (`gulptwduchsjcsbndmua`) goes exclusively through `DOS-Me`.
-- ============================================================================

CREATE OR REPLACE FUNCTION rate.enqueue_crowd_verify_signal(
  p_platform TEXT,
  p_target_url TEXT,
  p_platform_item_id TEXT,
  p_platform_shop_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(job_id UUID, state TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_platform TEXT := lower(btrim(COALESCE(p_platform, '')));
  v_clean_url TEXT := btrim(COALESCE(p_target_url, ''));
  v_clean_item_id TEXT := btrim(COALESCE(p_platform_item_id, ''));
  v_clean_shop_id TEXT := NULLIF(btrim(COALESCE(p_platform_shop_id, '')), '');
  v_recent_crowd_count INTEGER := 0;
BEGIN
  IF v_clean_platform NOT IN (
    'shopee', 'lazada', 'tiki', 'tiktok', 'cellphones',
    'tgdd', 'fptshop', 'hoangha', 'didongviet', 'phongvu'
  ) THEN
    RAISE EXCEPTION 'Unsupported platform for crowd verification'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_url = '' OR char_length(v_clean_url) > 1024 OR v_clean_url !~* '^https?://' THEN
    RAISE EXCEPTION 'Invalid target product URL'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_item_id = '' OR char_length(v_clean_item_id) > 240 THEN
    RAISE EXCEPTION 'Invalid platform item identifier'
      USING ERRCODE = '22023';
  END IF;

  -- anon can call this; keep the stored payload small and an object.
  IF p_payload IS NOT NULL
     AND (jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384) THEN
    RAISE EXCEPTION 'Invalid crowd verification payload'
      USING ERRCODE = '22023';
  END IF;

  -- Global database-side flood guard: cap pending crowd verification jobs created
  -- in the last 1 minute to prevent queue exhaustion across serverless instances.
  SELECT count(*)::integer
    INTO v_recent_crowd_count
    FROM rate.crawl_jobs cj
   WHERE cj.type = 'extension_crowd_verify'
     AND cj.created_at >= (now() - interval '1 minute');

  IF v_recent_crowd_count >= 120 THEN
    RAISE EXCEPTION 'Crowd verification queue rate limit exceeded'
      USING ERRCODE = 'P0001';
  END IF;

  -- Delegate to canonical queue RPC with fixed type='extension_crowd_verify' and priority=5
  RETURN QUERY
  SELECT eq.job_id, eq.state
    FROM rate.enqueue_crawl_job(
      'extension_crowd_verify'::text,
      v_clean_platform,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
        'submitted_uid', auth.uid(),
        'enqueued_via', 'enqueue_crowd_verify_signal'
      ),
      v_clean_url,
      v_clean_item_id,
      v_clean_shop_id,
      5,
      NULL::uuid
    ) AS eq;
END;
$$;

REVOKE ALL ON FUNCTION rate.enqueue_crowd_verify_signal(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate.enqueue_crowd_verify_signal(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
