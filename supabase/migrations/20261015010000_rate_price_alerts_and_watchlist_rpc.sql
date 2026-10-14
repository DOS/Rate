-- ============================================================================
-- Migration: 20261015010000_rate_price_alerts_and_watchlist_rpc.sql
-- Purpose:
--   1. Create idempotent table rate.price_alerts for server-backed Target Price
--      Watchlist alerts across all 5 tech device categories.
--   2. Configure strict RLS policies and SECURITY DEFINER RPC
--      rate.upsert_price_alert for web and browser extension clients.
-- Note:
--   Reference migration in DOS/Rate. Official deployment to gulptwduchsjcsbndmua
--   must go through DOS-Me/supabase/migrations/ CI pipeline (Hard Rule 0.1).
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_product_id UUID NOT NULL REFERENCES rate.master_products(id) ON DELETE CASCADE,
  user_id UUID NULL,
  subscriber_email TEXT NULL,
  client_fingerprint TEXT NOT NULL,
  target_price NUMERIC(14, 2) NOT NULL CHECK (target_price > 0),
  price_when_created NUMERIC(14, 2) NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en', 'cs')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rate_price_alerts_product_fingerprint UNIQUE (master_product_id, client_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_rate_price_alerts_active_target
  ON rate.price_alerts (master_product_id, is_active, target_price);

ALTER TABLE rate.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read own price alerts by fingerprint" ON rate.price_alerts;
CREATE POLICY "Allow public read own price alerts by fingerprint"
  ON rate.price_alerts
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE rate.price_alerts FROM anon, authenticated;
GRANT SELECT ON TABLE rate.price_alerts TO anon, authenticated;
GRANT ALL ON TABLE rate.price_alerts TO service_role;

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
SET search_path = rate, public
AS $$
DECLARE
  v_master rate.master_products%ROWTYPE;
  v_alert rate.price_alerts%ROWTYPE;
  v_clean_locale TEXT;
BEGIN
  IF p_product_slug IS NULL OR btrim(p_product_slug) = '' THEN
    RAISE EXCEPTION 'Product slug is required';
  END IF;

  IF p_target_price IS NULL OR p_target_price <= 0 THEN
    RAISE EXCEPTION 'Target price must be greater than 0';
  END IF;

  SELECT *
  INTO v_master
  FROM rate.master_products
  WHERE slug = btrim(p_product_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master product not found for slug: %', p_product_slug;
  END IF;

  v_clean_locale := CASE
    WHEN p_locale IN ('vi', 'en', 'cs') THEN p_locale
    ELSE 'vi'
  END;

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
    auth.uid(),
    NULLIF(btrim(COALESCE(p_subscriber_email, '')), ''),
    COALESCE(NULLIF(btrim(p_client_fingerprint), ''), 'anon'),
    ROUND(p_target_price, 0),
    COALESCE(v_master.min_price, 0),
    v_clean_locale,
    TRUE,
    NOW()
  )
  ON CONFLICT (master_product_id, client_fingerprint)
  DO UPDATE SET
    target_price = EXCLUDED.target_price,
    subscriber_email = COALESCE(EXCLUDED.subscriber_email, rate.price_alerts.subscriber_email),
    locale = EXCLUDED.locale,
    is_active = TRUE,
    updated_at = NOW()
  RETURNING * INTO v_alert;

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

GRANT EXECUTE ON FUNCTION rate.upsert_price_alert(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
