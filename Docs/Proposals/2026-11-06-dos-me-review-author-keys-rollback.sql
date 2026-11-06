-- ROLLBACK the PROPOSAL 2026-11-06-dos-me-review-author-keys.sql (DOS/Rate#1614).
-- Safe to run twice. The analyzer then groups authors by author_name again.
BEGIN;
DROP TABLE IF EXISTS rate.review_author_keys;
COMMIT;
