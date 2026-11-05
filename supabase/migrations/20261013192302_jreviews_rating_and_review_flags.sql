-- 1. Extend rate.review_flags with 5 distinct Vietnamese e-commerce & service flag categories
ALTER TABLE rate.review_flags
  ADD COLUMN IF NOT EXISTS flag_category TEXT DEFAULT 'authentic'
    CHECK (flag_category IN (
      'authentic',
      'low_value_coin_spam',
      'seeding_fake',
      'competitor_sabotage',
      'review_bombing'
    )),
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS include_in_rating BOOLEAN DEFAULT true;

-- 2. Extend rate.reviews with JReviews-style community voting, expert/user distinction & criteria scores
ALTER TABLE rate.reviews
  ADD COLUMN IF NOT EXISTS reviewer_type TEXT DEFAULT 'user'
    CHECK (reviewer_type IN ('user', 'expert')),
  ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0 CHECK (upvotes >= 0),
  ADD COLUMN IF NOT EXISTS downvotes INTEGER DEFAULT 0 CHECK (downvotes >= 0),
  ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0 CHECK (report_count >= 0),
  ADD COLUMN IF NOT EXISTS helpfulness_weight NUMERIC(5, 2) DEFAULT 1.00 CHECK (helpfulness_weight >= 0),
  ADD COLUMN IF NOT EXISTS criteria_ratings JSONB DEFAULT '{}'::jsonb;

-- 3. Extend rate.master_products for Products + Services & JReviews Dual Rating (Expert vs User)
ALTER TABLE rate.master_products
  ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'product'
    CHECK (entity_type IN ('product', 'service')),
  ADD COLUMN IF NOT EXISTS expert_rating NUMERIC(3, 2)
    CHECK (expert_rating IS NULL OR (expert_rating >= 0 AND expert_rating <= 5)),
  ADD COLUMN IF NOT EXISTS expert_review_summary TEXT,
  ADD COLUMN IF NOT EXISTS expert_criteria_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_rating_weighted NUMERIC(3, 2) DEFAULT 0
    CHECK (user_rating_weighted >= 0 AND user_rating_weighted <= 5),
  ADD COLUMN IF NOT EXISTS authentic_review_count INTEGER DEFAULT 0;

-- 4. Deterministic JReviews-style Review Weight Function
CREATE OR REPLACE FUNCTION rate.compute_review_weight(
  p_upvotes INTEGER,
  p_downvotes INTEGER,
  p_reports INTEGER,
  p_flag_category TEXT,
  p_verdict TEXT
) RETURNS NUMERIC(5, 2)
LANGUAGE plpgsql
IMMUTABLE
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

ALTER TABLE rate.review_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_flags' AND policyname = 'Public can view review_flags'
  ) THEN
    CREATE POLICY "Public can view review_flags" ON rate.review_flags FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_flags' AND policyname = 'Service role write review_flags'
  ) THEN
    CREATE POLICY "Service role write review_flags" ON rate.review_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON rate.review_flags TO anon, authenticated;
GRANT ALL ON rate.review_flags TO service_role;
