-- ==============================================================================
-- Migration: Rate Architecture Audit C5 & T3 Hardening (Open-Core Reference)
--   * C5: Canonical `rate.refresh_master_market_stats(p_master_id UUID)` function
--         computing `min_price`, `max_price`, and `merchant_count` on
--         `rate.master_products` from clustered `rate.products` (`price_current > 0`).
--         Also tightens `rate.review_flags` DML grants so public roles are
--         strictly read-only (`SELECT` only).
--   * T3: Extend `rate.review_votes_guard()` 60-actions/hour flood protection to
--         cover both `INSERT` and `UPDATE` (`updated_at > now() - interval '1 hour'`),
--         add composite index `idx_rate_review_votes_voter_updated`, and harden
--         `SET search_path = ''` with fully-qualified `rate.*` references across
--         `compute_review_weight`, `refresh_master_product_rating`,
--         `refresh_review_vote_counts`, `review_votes_guard`, and
--         `review_votes_after_change`.
--
-- Target: Shared Supabase Project `dos` (Deploy ONLY via DOS-Me/supabase/migrations/)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Audit C5: Canonical `rate.refresh_master_market_stats(p_master_id UUID)`
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET min_price = s.min_price,
      max_price = s.max_price,
      merchant_count = COALESCE(s.merchant_count, 0),
      updated_at = now()
  FROM (
    SELECT
      MIN(p.price_current) FILTER (WHERE p.price_current > 0) AS min_price,
      MAX(COALESCE(NULLIF(p.price_max, 0), p.price_current)) FILTER (WHERE p.price_current > 0) AS max_price,
      COUNT(DISTINCT p.merchant_id) FILTER (WHERE p.price_current > 0)::INTEGER AS merchant_count
    FROM rate.products p
    WHERE p.cluster_id = p_master_id
  ) s
  WHERE m.id = p_master_id;
$$;

REVOKE ALL ON FUNCTION rate.refresh_master_market_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_market_stats(UUID) TO service_role;

-- Ensure anon and authenticated can never write to rate.review_flags
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rate.review_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON rate.review_flags TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Audit T3: Harden `search_path = ''` & UPDATE flood guard on `review_votes`
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rate_review_votes_voter_updated
  ON rate.review_votes (voter_id, updated_at DESC);

CREATE OR REPLACE FUNCTION rate.compute_review_weight(
  p_upvotes INTEGER,
  p_downvotes INTEGER,
  p_reports INTEGER,
  p_flag_category TEXT,
  p_verdict TEXT
) RETURNS NUMERIC(5, 2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_base NUMERIC := 1.0;
  v_net INTEGER := COALESCE(p_upvotes, 0) - COALESCE(p_downvotes, 0);
  v_weight NUMERIC;
BEGIN
  IF p_flag_category IN ('low_value_coin_spam', 'seeding_fake', 'competitor_sabotage', 'review_bombing')
     OR p_verdict = 'fake' THEN
    RETURN 0.00;
  END IF;

  IF p_verdict = 'suspicious' THEN
    v_base := 0.25;
  END IF;

  IF v_net > 0 THEN
    v_weight := v_base + (ln(1 + v_net) * 0.45);
  ELSIF v_net < 0 THEN
    v_weight := v_base - (ABS(v_net) * 0.30);
  ELSE
    v_weight := v_base;
  END IF;

  v_weight := v_weight - (COALESCE(p_reports, 0) * 0.35);

  RETURN ROUND(GREATEST(0.00, LEAST(3.00, v_weight)), 2);
END;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = now()
  FROM (
    SELECT
      round(
        (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      count(*)::INTEGER AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_up INTEGER;
  v_down INTEGER;
  v_rep INTEGER;
  v_cat TEXT;
  v_verdict TEXT;
  v_master UUID;
BEGIN
  SELECT
    count(*) FILTER (WHERE vote = 'up'),
    count(*) FILTER (WHERE vote = 'down'),
    count(*) FILTER (WHERE reported)
  INTO v_up, v_down, v_rep
  FROM rate.review_votes
  WHERE review_id = p_review_id;

  SELECT f.flag_category, f.verdict INTO v_cat, v_verdict
  FROM rate.review_flags f
  WHERE f.review_id = p_review_id;

  UPDATE rate.reviews
  SET upvotes = v_up,
      downvotes = v_down,
      report_count = v_rep,
      helpfulness_weight = rate.compute_review_weight(
        v_up, v_down, v_rep,
        COALESCE(v_cat, 'authentic'),
        COALESCE(v_verdict, 'unanalyzed')
      )
  WHERE id = p_review_id;

  SELECT p.cluster_id INTO v_master
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id;

  IF v_master IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rate.review_votes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_recent INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.review_id <> OLD.review_id OR NEW.voter_id <> OLD.voter_id THEN
      RAISE EXCEPTION 'review_votes: review_id and voter_id are immutable';
    END IF;
    NEW.updated_at := now();
  END IF;

  -- Enforce 60 vote/report actions per hour across both INSERT and UPDATE (Audit T3)
  SELECT count(*) INTO v_recent
  FROM rate.review_votes
  WHERE voter_id = NEW.voter_id
    AND updated_at > now() - interval '1 hour';

  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'review_votes: rate limit exceeded (60 vote actions per hour)'
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rate.review_votes_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM rate.refresh_review_vote_counts(OLD.review_id);
  ELSE
    PERFORM rate.refresh_review_vote_counts(NEW.review_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID) TO service_role;
