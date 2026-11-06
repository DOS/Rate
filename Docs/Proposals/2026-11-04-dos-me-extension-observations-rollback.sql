-- ROLLBACK of the PROPOSAL 2026-11-04-dos-me-extension-observations.sql (DOS/Rate#1606).
-- One transaction: drops the four functions, then rate.extension_observations,
-- rate.extension_submitters and rate.extension_ingest_secret with their policies and indexes.
-- Every quarantined observation and submitter id is lost, and so is the stored ingest key hash
-- (set it again after a re-apply). Turn RATE_EXTENSION_OBSERVATIONS off on the web first; the
-- routes would otherwise answer errors. Nothing else reads these tables.
-- Safe to run twice.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS rate.purge_extension_observations(integer, integer, integer);
DROP FUNCTION IF EXISTS rate.delete_extension_submitter(uuid);
DROP FUNCTION IF EXISTS rate.submit_extension_observation(text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS rate.register_extension_submitter(text, text);

DROP TABLE IF EXISTS rate.extension_observations;
DROP TABLE IF EXISTS rate.extension_submitters;
DROP TABLE IF EXISTS rate.extension_ingest_secret;

COMMIT;
