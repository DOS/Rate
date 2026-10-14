-- ==============================================================================
-- Migration: Separate Rate review-derived merchant risk from DOSafe threat_intel
-- (DOS/Rate Issue #15) + sync review_flags weight trigger & user-only rating count
-- ==============================================================================

-- 1. Separate Rate review-derived risk columns on rate.merchants
--    `rate.merchants.risk_score` remains reserved for DOSafe threat_intel sync.
ALTER TABLE rate.merchants
  ADD COLUMN IF NOT EXISTS review_risk_score INTEGER DEFAULT 0
    CHECK (review_risk_score >= 0 AND review_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS review_risk_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_risk_updated_at TIMESTAMPTZ;

-- 2. Update rate.v_products_with_merchant_trust to combine DOSafe & Review risk
--    via GREATEST() while preserving all existing column names/types in order
--    and appending dosafe_risk_score, review_risk_score, review_risk_breakdown.
CREATE OR REPLACE VIEW rate.v_products_with_merchant_trust AS
SELECT
  p.id,
  p.merchant_id,
  p.platform,
  p.platform_item_id,
  p.title,
  p.description,
  p.category_id,
  p.brand,
  p.price_current,
  p.price_original,
  p.price_min,
  p.price_max,
  p.currency,
  p.historical_sold,
  p.stock,
  p.rating_star,
  p.rating_count,
  p.images,
  p.models,
  p.attributes,
  p.url,
  p.cluster_id,
  p.metadata,
  p.created_at,
  p.updated_at,
  m.name AS merchant_name,
  m.is_official AS merchant_is_official,
  m.location AS merchant_location,
  GREATEST(
    COALESCE(t.risk_score::integer, 0),
    COALESCE(m.risk_score, 0),
    COALESCE(m.review_risk_score, 0)
  ) AS threat_risk_score,
  t.category AS threat_category,
  t.source AS threat_source,
  COALESCE(t.risk_score::integer, m.risk_score, 0) AS dosafe_risk_score,
  COALESCE(m.review_risk_score, 0) AS review_risk_score,
  COALESCE(m.review_risk_breakdown, '{}'::jsonb) AS review_risk_breakdown
FROM rate.products p
JOIN rate.merchants m ON p.merchant_id = m.id
LEFT JOIN dosafe.threat_intel t ON t.entity_hash = m.entity_hash;

GRANT SELECT ON rate.v_products_with_merchant_trust TO anon, authenticated, service_role;

-- 3. Harden rate.refresh_master_product_rating & rate.refresh_review_vote_counts
CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = rate, pg_temp
AS $$
  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0)
  FROM (
    SELECT
      round(
        (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      count(*) FILTER (WHERE r.reviewer_type = 'user') AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id;
$$;

CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_temp
AS $$
DECLARE
  v_up INTEGER;
  v_down INTEGER;
  v_rep INTEGER;
  v_cat TEXT;
  v_verdict TEXT;
  v_inc BOOLEAN;
  v_master UUID;
BEGIN
  SELECT
    count(*) FILTER (WHERE vote = 'up'),
    count(*) FILTER (WHERE vote = 'down'),
    count(*) FILTER (WHERE reported)
  INTO v_up, v_down, v_rep
  FROM rate.review_votes
  WHERE review_id = p_review_id;

  SELECT f.flag_category, f.verdict, COALESCE(f.include_in_rating, true)
  INTO v_cat, v_verdict, v_inc
  FROM rate.review_flags f
  WHERE f.review_id = p_review_id;

  UPDATE rate.reviews
  SET upvotes = v_up,
      downvotes = v_down,
      report_count = v_rep,
      helpfulness_weight = CASE
        WHEN NOT COALESCE(v_inc, true) THEN 0.00
        ELSE rate.compute_review_weight(
          v_up, v_down, v_rep,
          COALESCE(v_cat, 'authentic'),
          COALESCE(v_verdict, 'unanalyzed')
        )
      END
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

-- 4. Automatically recompute rate.reviews.helpfulness_weight from live vote counts
--    whenever rate.review_flags is inserted or updated (prevents stale vote overwrites)
CREATE OR REPLACE FUNCTION rate.review_flags_sync_review_weight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_temp
AS $$
BEGIN
  UPDATE rate.reviews r
  SET helpfulness_weight = CASE
    WHEN NOT COALESCE(NEW.include_in_rating, true) THEN 0.00
    ELSE rate.compute_review_weight(
      COALESCE(r.upvotes, 0),
      COALESCE(r.downvotes, 0),
      COALESCE(r.report_count, 0),
      COALESCE(NEW.flag_category, 'authentic'),
      COALESCE(NEW.verdict, 'unanalyzed')
    )
  END
  WHERE r.id = NEW.review_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_flags_sync_weight ON rate.review_flags;
CREATE TRIGGER trg_review_flags_sync_weight
  AFTER INSERT OR UPDATE OF flag_category, verdict, include_in_rating ON rate.review_flags
  FOR EACH ROW EXECUTE FUNCTION rate.review_flags_sync_review_weight();

REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rate.review_flags_sync_review_weight() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID) TO service_role;
