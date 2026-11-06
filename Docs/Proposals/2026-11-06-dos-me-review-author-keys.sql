-- =============================================================================
-- PROPOSAL (DOS/Rate#1614): a per-review author key, so the review analyzer can tell authors
-- apart after Rate-Services masks rate.reviews.author_name (DOS/Rate-Services#1073). A DOS-Me
-- migration to review and apply; nothing here is applied by DOS/Rate.
-- Verify: 2026-11-06-dos-me-review-author-keys-verify.sql (V1 to V4 return 0).
-- Rollback: 2026-11-06-dos-me-review-author-keys-rollback.sql.
--
-- What it adds:
--   rate.review_author_keys   one row per review that has a key: the keyed HMAC of the original
--                             author name, computed by Rate-Services (the key never reaches
--                             Rate). It is a separate table on purpose: anon holds a table-level
--                             SELECT on rate.reviews, so a new column there would be public, and
--                             a stable key would let anyone link one author's reviews across
--                             products. This table has no grant for anon or authenticated.
--
-- The importer (service_role, rate_worker) writes it and reads it for the analysis. Reviews
-- without a row are analysed by author_name as before. Nothing the user sees changes.
--
-- Idempotent. One transaction.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS rate.review_author_keys (
  review_id  uuid PRIMARY KEY REFERENCES rate.reviews (id) ON DELETE CASCADE,
  -- hex or base64url of an HMAC: 16 to 128 characters
  author_key text NOT NULL CHECK (author_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate.review_author_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.review_author_keys FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.review_author_keys TO service_role;
GRANT SELECT, INSERT, UPDATE ON rate.review_author_keys TO rate_worker;

DROP POLICY IF EXISTS review_author_keys_service ON rate.review_author_keys;
CREATE POLICY review_author_keys_service ON rate.review_author_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Like reviews and review_flags: the worker reads all, writes only keys of crawled reviews.
DROP POLICY IF EXISTS review_author_keys_worker ON rate.review_author_keys;
DROP POLICY IF EXISTS review_author_keys_worker_read ON rate.review_author_keys;
DROP POLICY IF EXISTS review_author_keys_worker_insert ON rate.review_author_keys;
DROP POLICY IF EXISTS review_author_keys_worker_update ON rate.review_author_keys;
CREATE POLICY review_author_keys_worker_read ON rate.review_author_keys
  FOR SELECT TO rate_worker USING (true);
CREATE POLICY review_author_keys_worker_insert ON rate.review_author_keys
  FOR INSERT TO rate_worker
  WITH CHECK (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_author_keys.review_id AND r.origin <> 'community'));
CREATE POLICY review_author_keys_worker_update ON rate.review_author_keys
  FOR UPDATE TO rate_worker
  USING (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_author_keys.review_id AND r.origin <> 'community'))
  WITH CHECK (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_author_keys.review_id AND r.origin <> 'community'));

COMMIT;
