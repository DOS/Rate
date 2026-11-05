-- =============================================================================
-- Migration: 20261107100000_rate_extension_ingest_key_rotation.sql
-- Purpose (DOS/Rate#1606): rotates the ingest key row set by
-- 20261106160100_rate_extension_ingest_key.sql, as the apply runbook says ("a new migration
-- with the new hash, then the web redeploys with the new key"). The first key was lost before
-- it was set on Vercel, so nothing ever used it; a new key, 32 CSPRNG bytes in hex, is now set
-- on the DOS/Rate web's Vercel environments (JOY, 2026-11-05: "Cho đặt lên Vercel"). Only its
-- sha256 is stored; the key itself is never in git. The web flag RATE_EXTENSION_OBSERVATIONS is
-- still off, so no write depended on the old row.
-- =============================================================================

INSERT INTO rate.extension_ingest_secret (key_sha256)
VALUES ('aff995fa98271f0b1bb45f92567da3d425287726ccf759aa44e7cd3234aa5979')
ON CONFLICT (id) DO UPDATE SET key_sha256 = EXCLUDED.key_sha256, updated_at = now();
