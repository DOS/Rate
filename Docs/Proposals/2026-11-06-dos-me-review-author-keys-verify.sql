-- VERIFY the PROPOSAL 2026-11-06-dos-me-review-author-keys.sql (DOS/Rate#1614).
-- Read-only. V1 to V4 return 0.

-- V1 the table exists with RLS on; expect 0
SELECT count(*) FROM (SELECT 1) x
WHERE NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'rate' AND c.relname = 'review_author_keys' AND c.relrowsecurity
);

-- V2 anon and authenticated hold no privilege on it; expect 0
SELECT count(*) FROM information_schema.role_table_grants
WHERE table_schema = 'rate' AND table_name = 'review_author_keys'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- V3 no stored key has a bad shape; expect 0
SELECT count(*) FROM rate.review_author_keys WHERE author_key !~ '^[A-Za-z0-9_-]{16,128}$';

-- V4 no key row points at a missing review; expect 0
SELECT count(*) FROM rate.review_author_keys k
WHERE NOT EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = k.review_id);
