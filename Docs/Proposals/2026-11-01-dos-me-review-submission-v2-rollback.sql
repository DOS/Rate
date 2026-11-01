-- PROPOSAL, NOT APPLIED. Rollback of 2026-11-01-dos-me-review-submission-v2.sql (DOS/Rate#1544).
-- Drops the v2 RPC, the line helpers, the criteria table and the position key. Reviews written
-- through v2 stay, with their rating_exact, verdict, criteria_version and review_points rows
-- (P2 columns and table). Run it only while no web build calls v2 (the form falls back to v1).
-- One transaction, re-runnable.

BEGIN;

DROP FUNCTION IF EXISTS rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text);
DROP FUNCTION IF EXISTS rate.review_point_list(jsonb, text, integer, integer, text);
DROP FUNCTION IF EXISTS rate.review_point_is_evasive_con(text);
DROP FUNCTION IF EXISTS rate.review_point_has_content(text);
DROP FUNCTION IF EXISTS rate.review_text_length(text);
DROP FUNCTION IF EXISTS rate.review_point_compare(text);
DROP INDEX IF EXISTS rate.review_points_position_key;
DROP TABLE IF EXISTS rate.rating_criteria;

COMMIT;
