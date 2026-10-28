-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-29-dos-me-m0-seed-rekey.sql (DOS/Rate#1212).
-- Run only BEFORE M1+M2 (once Items exist, roll M1+M2 back first: Items are keyed on the new
-- model_keys). Revert the seed change in the same step. Re-runnable: it only touches rows
-- that still carry the M0 markers in metadata.

BEGIN;

-- 1. Restore the previous keys. A key taken again meanwhile (by a newly seeded master) is
-- skipped with a NOTICE and left for a manual decision.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, model_key, metadata ->> 'm0_rekeyed_from' AS old_key
    FROM rate.master_products
    WHERE metadata ? 'm0_rekeyed_from'
  LOOP
    IF EXISTS (SELECT 1 FROM rate.master_products WHERE model_key = r.old_key AND id <> r.id) THEN
      RAISE NOTICE 'M0 rollback skip %: % is taken again', r.model_key, r.old_key;
    ELSE
      UPDATE rate.master_products
         SET model_key = r.old_key,
             metadata = metadata - 'm0_rekeyed_from',
             updated_at = now()
       WHERE id = r.id;
    END IF;
  END LOOP;
END
$$;

-- 2. Restore the earbuds storage values.
UPDATE rate.master_products
   SET storage_gb = (metadata ->> 'm0_storage_gb_before')::numeric,
       metadata = metadata - 'm0_storage_gb_before',
       updated_at = now()
 WHERE metadata ? 'm0_storage_gb_before';

COMMIT;
