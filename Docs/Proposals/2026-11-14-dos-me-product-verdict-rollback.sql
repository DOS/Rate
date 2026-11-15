-- ROLLBACK the PROPOSAL 2026-11-14-dos-me-product-verdict.sql (DOS/Rate#1623).
-- Safe to run twice. Product pros and cons in rate.product_points are unaffected.
BEGIN;
DROP TABLE IF EXISTS rate.product_verdicts;
COMMIT;
