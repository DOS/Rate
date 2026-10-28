-- PROPOSAL, NOT APPLIED. DOS-Me data step M0 for the Item model (DOS/Rate#1212, #1123;
-- design Docs/Proposals/2026-10-27-item-variant-listing-model.md section 7 "M0"; inventory in
-- the #1150 comment of 2026-10-28). JOY reviews and applies it through DOS-Me (preview, beta,
-- prod) BEFORE 2026-10-28-dos-me-m1-m2-items.sql. Rollback:
-- 2026-10-29-dos-me-m0-seed-rekey-rollback.sql. Verification:
-- 2026-10-29-dos-me-m0-seed-rekey-verify.sql.
--
-- What it does (data only, no DDL):
-- 1. Re-keys the six flagship-seed masters whose stored model_key the normalizer never
--    produces, so new listings hit Tier 1 and M2 creates their Items under the normalizer's
--    Item keys. Ids and slugs do not change, so listings, alerts, reviews and public URLs
--    keep pointing at the same rows. A rename whose target key is already taken by another
--    master is skipped with a NOTICE (that pair needs a reviewed merge, not a rename; the
--    inventory found none). Duplicates are never deleted.
-- 2. Clears storage_gb on earbuds masters (earbuds have no storage axis, #643/#657).
-- Each change records the previous value in metadata (m0_rekeyed_from, m0_storage_gb_before)
-- so the rollback can restore it.
--
-- The matching seed change (flagship-seed-data.ts keys, earbuds storage_gb: null) must merge
-- right AFTER this is applied, and `jobs/backfill-specs.ts --apply` must not run in between:
-- it looks masters up by the seed key and inserts one when none is found.
--
-- Idempotent: a master already on its new key is not touched; the storage step only touches
-- rows that still hold a storage.

BEGIN;

-- 1. Re-key ----------------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('samsung:galaxy-buds3-pro:64gb', 'samsung:galaxy-buds3-pro:unknown'),
      ('apple:airpods-pro-3:standard',  'apple:airpods-pro-3:unknown'),
      ('sony:wf-1000xm5:64gb',          'sony:wf-1000xm5:unknown'),
      ('sony:wf-1000xm6:standard',      'sony:wf-1000xm6:unknown'),
      -- The normalizer does not split USB-C from Lightning: one Item, apple:airpods-pro-2.
      ('apple:airpods-pro-2-usbc:64gb', 'apple:airpods-pro-2:unknown'),
      -- The Watch Ultra comes in one case size, so its key carries none.
      ('apple:watch-ultra-3-49mm:64gb', 'apple:watch-ultra-3:64gb')
    ) AS t(old_key, new_key)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM rate.master_products WHERE model_key = r.old_key) THEN
      CONTINUE;
    ELSIF EXISTS (SELECT 1 FROM rate.master_products WHERE model_key = r.new_key) THEN
      RAISE NOTICE 'M0 skip %: % already exists, merge manually', r.old_key, r.new_key;
    ELSE
      UPDATE rate.master_products
         SET model_key = r.new_key,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('m0_rekeyed_from', r.old_key),
             updated_at = now()
       WHERE model_key = r.old_key;
    END IF;
  END LOOP;
END
$$;

-- 2. Earbuds carry no storage ----------------------------------------------------------------

UPDATE rate.master_products mp
   SET metadata = COALESCE(mp.metadata, '{}'::jsonb)
         || jsonb_build_object('m0_storage_gb_before', mp.storage_gb),
       storage_gb = NULL,
       updated_at = now()
  FROM rate.categories c
 WHERE c.id = mp.category_id
   AND c.slug = 'earbuds'
   AND mp.storage_gb IS NOT NULL;

COMMIT;
