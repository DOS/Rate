-- Standalone monotonic main-sync mirror of 20261212180000_rate_m0_seed_rekey.sql (DOS/DOS.Me#2015, DOS/Rate#1150).
-- Safe to run after 20261212180000 on dev/beta and standalone after 20261213101000 on main/prod.

-- Item model step M0 (DOS/Rate#1150, DOS/Rate#1212, DOS/DOS.Me#2015).
-- Data-only migration applied before M1+M2 (20261212183000_rate_m1_m2_items.sql).
--
-- What it does (data only, no DDL):
-- 1. Re-keys the six flagship-seed masters whose stored model_key the normalizer never
--    produces, so new listings hit Tier 1 and M2 creates their Items under the normalizer's
--    Item keys. Ids and slugs do not change, so listings, alerts, reviews and public URLs
--    keep pointing at the same rows. A rename whose target key is already taken by another
--    master is skipped with a NOTICE (that pair needs a reviewed merge, not a rename).
-- 2. Clears storage_gb on earbuds masters (earbuds have no storage axis).
-- Each change records the previous value in metadata (m0_rekeyed_from, m0_storage_gb_before)
-- so scripts/ops/rate-m0-seed-rekey-rollback.sql can restore it.
--
-- Idempotent: a master already on its new key is not touched; the storage step only touches
-- rows that still hold a storage_gb value.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Re-key flagship-seed masters -------------------------------------------------------------

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

-- Match by category slug as well as by the re-keyed earbuds keys for any master whose
-- category_id is NULL.
UPDATE rate.master_products mp
   SET metadata = COALESCE(mp.metadata, '{}'::jsonb)
         || jsonb_build_object('m0_storage_gb_before', mp.storage_gb),
       storage_gb = NULL,
       updated_at = now()
 WHERE mp.storage_gb IS NOT NULL
   AND (mp.model_key IN ('samsung:galaxy-buds3-pro:unknown', 'apple:airpods-pro-3:unknown',
                       'sony:wf-1000xm5:unknown', 'sony:wf-1000xm6:unknown',
                       'apple:airpods-pro-2:unknown')
        OR EXISTS (SELECT 1 FROM rate.categories c
                   WHERE c.id = mp.category_id AND c.slug = 'earbuds'));

COMMIT;
