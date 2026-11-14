-- =============================================================================
-- PROPOSAL (DOS/Rate#1623): store the precomputed product verdict from kept pros and cons.
-- A DOS-Me migration to review and apply via DOS-Me/supabase/migrations/ (preview -> beta -> prod);
-- nothing here is applied directly from DOS/Rate (AGENTS.md 0.1).
-- Verify: 2026-11-14-dos-me-product-verdict-verify.sql (V1 to V4 return 0).
-- Rollback: 2026-11-14-dos-me-product-verdict-rollback.sql.
--
-- Why a separate table instead of a column on rate.master_products:
--   rate_worker intentionally has no UPDATE on rate.master_products. Storing one row per master
--   in rate.product_verdicts lets product-points-ai write and clear verdicts with the same
--   least-privilege boundary as rate.product_points.
--
-- Idempotent. One transaction.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS rate.product_verdicts (
  master_id    uuid PRIMARY KEY REFERENCES rate.master_products (id) ON DELETE CASCADE,
  verdict      text NOT NULL CHECK (char_length(btrim(verdict)) BETWEEN 10 AND 500),
  review_count integer NOT NULL CHECK (review_count > 0),
  method       text NOT NULL DEFAULT 'ai' CHECK (method IN ('code', 'ai')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate.product_verdicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON rate.product_verdicts FROM PUBLIC, anon, authenticated, rate_worker;
GRANT SELECT ON rate.product_verdicts TO anon, authenticated;
GRANT ALL ON rate.product_verdicts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate.product_verdicts TO rate_worker;

DROP POLICY IF EXISTS "Public can view product_verdicts" ON rate.product_verdicts;
CREATE POLICY "Public can view product_verdicts" ON rate.product_verdicts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write product_verdicts" ON rate.product_verdicts;
CREATE POLICY "Service role write product_verdicts" ON rate.product_verdicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Worker writes product_verdicts" ON rate.product_verdicts;
CREATE POLICY "Worker writes product_verdicts" ON rate.product_verdicts
  FOR ALL TO rate_worker USING (true) WITH CHECK (true);

COMMIT;
