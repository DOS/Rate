-- =============================================================================
-- Migration: 20261018120000_rate_price_alert_auth_gate.sql
-- Purpose: close the anonymous write path opened by
--   20261015010000_rate_price_alerts_and_watchlist_rpc.sql before it is
--   promoted to production.
--
--   1. Only signed-in users may call rate.upsert_price_alert. anon loses
--      EXECUTE, and the function fails closed without auth.uid() or for
--      Supabase anonymous sign-ins.
--   2. The alert recipient is the caller's confirmed account email, read from
--      auth.users (email_confirmed_at IS NOT NULL). The JWT email claim is not
--      trusted: with sign-up confirmations off it can name an address the
--      caller never proved. p_subscriber_email is ignored, so nobody can
--      subscribe an address they do not control. Accounts without a confirmed
--      email are rejected. The signature is unchanged for callers.
--   3. Each user may keep at most 100 active alerts.
--   4. rate.price_alerts.user_id references auth.users and is removed with
--      the account (NOT VALID: legacy rows are not re-checked).
--   5. Legacy alerts that could mail an unproven address are deactivated:
--      anonymous rows (user_id IS NULL), rows whose user no longer exists, and
--      rows whose subscriber_email is not the user's confirmed account email
--      (the previous function let signed-in callers pick any address).
--
-- Idempotent: CREATE OR REPLACE FUNCTION with the same signature, guarded
-- constraint creation, explicit grants, a repeatable UPDATE.
-- =============================================================================

-- Fail fast instead of queueing behind long transactions on the shared database.
SET lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_rate_price_alerts_user'
      AND conrelid = 'rate.price_alerts'::regclass
  ) THEN
    ALTER TABLE rate.price_alerts
      ADD CONSTRAINT fk_rate_price_alerts_user
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_rate_price_alerts_user_active
  ON rate.price_alerts (user_id)
  WHERE user_id IS NOT NULL AND is_active;

UPDATE rate.price_alerts pa
SET is_active = FALSE, updated_at = now()
WHERE pa.is_active
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = pa.user_id
      AND u.email_confirmed_at IS NOT NULL
      AND lower(u.email) = lower(pa.subscriber_email)
  );

CREATE OR REPLACE FUNCTION rate.upsert_price_alert(
  p_product_slug TEXT,
  p_target_price NUMERIC,
  p_client_fingerprint TEXT,
  p_subscriber_email TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT 'vi'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_email TEXT;
  v_master RECORD;
  v_alert rate.price_alerts%ROWTYPE;
  v_clean_locale TEXT;
  v_active INTEGER;
BEGIN
  -- Fail closed even if EXECUTE is ever re-granted to anon by mistake.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để lưu cảnh báo giá' USING ERRCODE = '42501';
  END IF;

  -- Supabase anonymous sign-ins mint users at will and have no verified email.
  IF COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để lưu cảnh báo giá' USING ERRCODE = '42501';
  END IF;

  IF p_product_slug IS NULL OR btrim(p_product_slug) = '' THEN
    RAISE EXCEPTION 'Product slug is required' USING ERRCODE = '22023';
  END IF;

  IF p_target_price IS NULL OR p_target_price <= 0 THEN
    RAISE EXCEPTION 'Target price must be greater than 0' USING ERRCODE = '22023';
  END IF;

  SELECT mp.id, mp.slug, mp.min_price
  INTO v_master
  FROM rate.master_products mp
  WHERE mp.slug = btrim(p_product_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master product not found for slug: %', p_product_slug USING ERRCODE = 'P0002';
  END IF;

  v_clean_locale := CASE
    WHEN p_locale IN ('vi', 'en', 'cs') THEN p_locale
    ELSE 'vi'
  END;

  -- The recipient is the account's own confirmed email, never a caller-supplied
  -- one. Reading auth.users also rejects tokens of deleted accounts.
  SELECT NULLIF(left(btrim(COALESCE(u.email, '')), 254), '')
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Tài khoản cần có email đã xác minh để nhận cảnh báo giá' USING ERRCODE = '22023';
  END IF;

  -- Serialize this user's alert writes so the cap below cannot be raced.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rate.price_alerts:' || v_uid::text, 0));

  SELECT count(*) INTO v_active
  FROM rate.price_alerts pa
  WHERE pa.user_id = v_uid
    AND pa.is_active
    AND pa.master_product_id <> v_master.id;

  IF v_active >= 100 THEN
    RAISE EXCEPTION 'Bạn đã có quá 100 cảnh báo giá đang hoạt động' USING ERRCODE = '54000';
  END IF;

  INSERT INTO rate.price_alerts (
    master_product_id,
    user_id,
    subscriber_email,
    client_fingerprint,
    target_price,
    price_when_created,
    locale,
    is_active,
    updated_at
  )
  VALUES (
    v_master.id,
    v_uid,
    v_email,
    'uid:' || v_uid::text,
    round(p_target_price, 0),
    COALESCE(v_master.min_price, 0),
    v_clean_locale,
    TRUE,
    now()
  )
  ON CONFLICT (master_product_id, client_fingerprint)
  DO UPDATE SET
    target_price = EXCLUDED.target_price,
    subscriber_email = EXCLUDED.subscriber_email,
    locale = EXCLUDED.locale,
    is_active = TRUE,
    updated_at = now()
  WHERE rate.price_alerts.user_id = v_uid
  RETURNING * INTO v_alert;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot overwrite a price alert owned by another user' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', v_alert.id,
    'master_product_id', v_alert.master_product_id,
    'slug', v_master.slug,
    'target_price', v_alert.target_price,
    'current_min_price', v_master.min_price,
    'is_reached', (COALESCE(v_master.min_price, 0) > 0 AND v_master.min_price <= v_alert.target_price),
    'updated_at', v_alert.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION rate.upsert_price_alert(TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.upsert_price_alert(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

RESET lock_timeout;
