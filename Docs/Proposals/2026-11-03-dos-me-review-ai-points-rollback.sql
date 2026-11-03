-- ROLLBACK the PROPOSAL 2026-11-03-dos-me-review-ai-points.sql (DOS/Rate#1531, AI design D6).
-- Safe to run twice. Stop the review AI points job first (REVIEW_AI_POINTS_ENABLED=false in the
-- Rate-Services schedule), and cancel any open batch, so nothing writes while this runs.
--
-- It deletes every 'ai' line of rate.review_points (the job can extract them again after a
-- re-apply, at the cost of the model calls), then the two functions and the two tables. Writer
-- lines are not touched. The next product-points run aggregates without the 'ai' lines.
-- The batches table holds the month's spend: copy it first if the record is wanted.

BEGIN;

DELETE FROM rate.review_points WHERE method = 'ai';

DROP FUNCTION IF EXISTS rate.store_review_ai_points(jsonb);
DROP FUNCTION IF EXISTS rate.purge_review_ai_points(text);
DROP FUNCTION IF EXISTS rate.review_ai_text_hash(text);
DROP TABLE IF EXISTS rate.review_ai_extractions;
DROP TABLE IF EXISTS rate.review_ai_batches;

COMMIT;
