-- =============================================================================
-- Migration: 20261106160100_rate_extension_ingest_key.sql
-- Purpose (DOS/Rate#1606): sets the ingest key row of 20261106160000_rate_extension_observations.sql,
-- step 5 of the proposal's apply runbook (Docs/Proposals/2026-11-04-dos-me-extension-observations.md).
-- JOY approved on 2026-11-04: "Duyệt M2". Only the sha256 of the web's RATE_EXTENSION_INGEST_KEY
-- is stored; the key itself is never in git. The key was generated with a CSPRNG (32 random
-- bytes, hex) and hashed over its exact bytes; it is set on the Vercel environments of the
-- DOS/Rate web that use this database.
-- Rotation: a new migration with the new hash, then the web redeploys with the new key (writes
-- answer 503 in between; deletes keep working).
-- =============================================================================

INSERT INTO rate.extension_ingest_secret (key_sha256)
VALUES ('4e6e92c9d3114d98ad3ee2a13de33be70865adc1723cbf8f84b7db613217d55b')
ON CONFLICT (id) DO UPDATE SET key_sha256 = EXCLUDED.key_sha256, updated_at = now();
