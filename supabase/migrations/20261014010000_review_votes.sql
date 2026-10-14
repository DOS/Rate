-- ==============================================================================
-- Migration: per-user review votes / reports (Issue #13)
--
-- Design notes
--  * One row per (review, voter): a user has ONE up/down vote per review and may
--    additionally REPORT it. Changing a vote is an UPDATE, not a second row.
--  * Authenticated users only (auth.users, shared Supabase Auth). Anonymous voting is
--    the easiest brigading vector (review_bombing / competitor_sabotage), so it is
--    deliberately not supported in v1.
--  * Counters on rate.reviews (upvotes/downvotes/report_count/helpfulness_weight) are
--    ALWAYS recomputed from rate.review_votes (set-based, idempotent -> no drift), and
--    helpfulness_weight reuses rate.compute_review_weight so SQL and TS agree.
--  * rate.master_products.user_rating_weighted is recomputed across ALL listings of a
--    master product (the analyzer previously overwrote it per-listing).
--  * Flood guard: max 60 new votes / hour / user.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS rate.review_votes (
  review_id UUID NOT NULL REFERENCES rate.reviews(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote TEXT CHECK (vote IN ('up', 'down')),
  reported BOOLEAN NOT NULL DEFAULT false,
  report_reason TEXT CHECK (
    report_reason IS NULL
    OR report_reason IN ('spam', 'fake', 'offensive', 'off_topic', 'other')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, voter_id),
  CONSTRAINT review_votes_has_action CHECK (vote IS NOT NULL OR reported),
  CONSTRAINT review_votes_reason_requires_report CHECK (report_reason IS NULL OR reported)
);

CREATE INDEX IF NOT EXISTS idx_rate_review_votes_voter_time
  ON rate.review_votes (voter_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- Aggregate: weighted user rating of a master product across ALL its listings.
-- Only analyzed reviews (a review_flags row exists) with weight > 0 count.
-- ------------------------------------------------------------------------------
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
      count(*) AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id;
$$;

-- ------------------------------------------------------------------------------
-- Recompute counters + weight of one review from review_votes, then its master rating.
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rate.review_votes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = rate, pg_temp
AS $$
DECLARE
  v_recent INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_recent
    FROM rate.review_votes
    WHERE voter_id = NEW.voter_id
      AND created_at > now() - interval '1 hour';
    IF v_recent >= 60 THEN
      RAISE EXCEPTION 'review_votes: rate limit exceeded (60 votes per hour)'
        USING ERRCODE = '54000';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.review_id <> OLD.review_id OR NEW.voter_id <> OLD.voter_id THEN
      RAISE EXCEPTION 'review_votes: review_id and voter_id are immutable';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rate.review_votes_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, pg_temp
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_review_votes_guard'
  ) THEN
    CREATE TRIGGER trg_review_votes_guard
      BEFORE INSERT OR UPDATE ON rate.review_votes
      FOR EACH ROW EXECUTE FUNCTION rate.review_votes_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_review_votes_after_change'
  ) THEN
    CREATE TRIGGER trg_review_votes_after_change
      AFTER INSERT OR UPDATE OR DELETE ON rate.review_votes
      FOR EACH ROW EXECUTE FUNCTION rate.review_votes_after_change();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- RLS: users read/write ONLY their own votes. Public sees only the counters that
-- live on rate.reviews (never who voted).
-- ------------------------------------------------------------------------------
ALTER TABLE rate.review_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_votes' AND policyname = 'Users read own review votes'
  ) THEN
    CREATE POLICY "Users read own review votes" ON rate.review_votes
      FOR SELECT TO authenticated USING (voter_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_votes' AND policyname = 'Users insert own review votes'
  ) THEN
    CREATE POLICY "Users insert own review votes" ON rate.review_votes
      FOR INSERT TO authenticated WITH CHECK (voter_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_votes' AND policyname = 'Users update own review votes'
  ) THEN
    CREATE POLICY "Users update own review votes" ON rate.review_votes
      FOR UPDATE TO authenticated
      USING (voter_id = (SELECT auth.uid()))
      WITH CHECK (voter_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_votes' AND policyname = 'Users delete own review votes'
  ) THEN
    CREATE POLICY "Users delete own review votes" ON rate.review_votes
      FOR DELETE TO authenticated USING (voter_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'rate' AND tablename = 'review_votes' AND policyname = 'Service role full access review_votes'
  ) THEN
    CREATE POLICY "Service role full access review_votes" ON rate.review_votes
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON rate.review_votes TO authenticated;
GRANT ALL ON rate.review_votes TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID) TO service_role;
