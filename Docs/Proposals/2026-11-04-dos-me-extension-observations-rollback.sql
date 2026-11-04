-- ROLLBACK of the PROPOSAL 2026-11-04-dos-me-extension-observations.sql (DOS/Rate#1606).
-- One transaction: drops the four functions, then rate.extension_observations and
-- rate.extension_submitters with their policies and indexes. Every quarantined observation and
-- submitter id is lost; installed extensions then get errors from the web routes, so turn
-- RATE_EXTENSION_OBSERVATIONS off on the web first. Nothing else reads these tables.
-- Safe to run twice.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS rate.purge_extension_observations(integer, integer);
DROP FUNCTION IF EXISTS rate.delete_extension_submitter(uuid);
DROP FUNCTION IF EXISTS rate.submit_extension_observation(uuid, jsonb, text);
DROP FUNCTION IF EXISTS rate.register_extension_submitter();

DROP TABLE IF EXISTS rate.extension_observations;
DROP TABLE IF EXISTS rate.extension_submitters;

COMMIT;
