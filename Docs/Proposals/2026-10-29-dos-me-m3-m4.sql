-- PROPOSAL, NOT APPLIED. DOS-Me migrations M3 (retire `unknown` on multi-size Items) and M4
-- (constraints) for the Item model (DOS/Rate#1160; design
-- Docs/Proposals/2026-10-27-item-variant-listing-model.md sections 4.2, 4.3, 7, 7.2).
-- Applies only AFTER the compatibility window (see 2026-10-29-dos-me-m3-m4.md): M0 and M1+M2
-- applied, every writer Item-aware (importer flag on, Rate Services task 13 handling NULL
-- cluster_id), and the M1+M2 reconciliation queries at zero. JOY applies it through DOS-Me.
-- Rollback: 2026-10-29-dos-me-m3-m4-rollback.sql. Verification:
-- 2026-10-29-dos-me-m3-m4-verify.sql.
--
-- M3 and M4 are separate transactions so M3 can ship and be verified first; M4 aborts with a
-- clear message when a precondition does not hold. Both are idempotent.

-- M3 ---------------------------------------------------------------------------------------
BEGIN;

-- What M3 changed, for the rollback (design 7.2). One row per listing moved off an unknown
-- variant and one row (listing_id NULL) per retired variant.
CREATE TABLE IF NOT EXISTS rate.m3_unknown_variant_backup (
  id                  bigserial PRIMARY KEY,
  item_id             uuid NOT NULL,
  master_id           uuid NOT NULL,
  master_status       text,
  listing_id          uuid,
  listing_cluster_id  uuid,
  listing_variant_src text,
  retired_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rate.m3_unknown_variant_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.m3_unknown_variant_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON rate.m3_unknown_variant_backup TO service_role;

-- Every multi-size Item (a live sized variant, never earbuds) still holding a live unknown
-- variant: back the rows up, then retire through the M2 RPC (one transaction per Item inside
-- this one, same lock order and markers as the importer's calls).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.id AS item_id, u.id AS master_id, u.status
    FROM rate.items i
    JOIN rate.master_products u
      ON u.item_id = i.id AND u.variant_key = 'unknown' AND u.status <> 'archived'
    LEFT JOIN rate.categories c ON c.id = i.category_id
    WHERE COALESCE(c.slug, '') <> 'earbuds'
      AND EXISTS (SELECT 1 FROM rate.master_products s
                  WHERE s.item_id = i.id AND s.status <> 'archived'
                    AND s.variant_key ~ '^[0-9]+(gb|tb)$')
    ORDER BY i.id
  LOOP
    INSERT INTO rate.m3_unknown_variant_backup (item_id, master_id, master_status)
    VALUES (r.item_id, r.master_id, r.status);
    INSERT INTO rate.m3_unknown_variant_backup
      (item_id, master_id, master_status, listing_id, listing_cluster_id, listing_variant_src)
    SELECT r.item_id, r.master_id, r.status, p.id, p.cluster_id, p.variant_source
    FROM rate.products p WHERE p.cluster_id = r.master_id;
    PERFORM rate.retire_item_unknown_variant(r.item_id);
  END LOOP;
END $$;

COMMIT;

-- M4 ---------------------------------------------------------------------------------------
BEGIN;

-- Preconditions: every variant has an Item; every listing has an Item (a listing that never
-- matched must be matched or archived first, design 7.1).
DO $$
DECLARE
  v_masters  bigint;
  v_listings bigint;
BEGIN
  SELECT count(*) INTO v_masters FROM rate.master_products WHERE item_id IS NULL;
  SELECT count(*) INTO v_listings FROM rate.products WHERE item_id IS NULL;
  IF v_masters > 0 OR v_listings > 0 THEN
    RAISE EXCEPTION 'M4: % master(s) and % listing(s) without item_id; reconcile first', v_masters, v_listings;
  END IF;
END $$;

ALTER TABLE rate.master_products ALTER COLUMN item_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.products'::regclass AND conname = 'products_item_id_not_null') THEN
    ALTER TABLE rate.products ADD CONSTRAINT products_item_id_not_null CHECK (item_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE rate.products VALIDATE CONSTRAINT products_item_id_not_null;

-- A listing's variant must belong to the listing's Item (design 4.3). The M1 sync trigger
-- (trg_products_sync_item, which runs first by name) already derives item_id from the
-- variant; this guard is the backstop for any write that gets around it.
CREATE OR REPLACE FUNCTION rate.products_variant_item_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.cluster_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM rate.master_products mp
       WHERE mp.id = NEW.cluster_id AND mp.item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'listing % variant % is not a variant of item %', NEW.id, NEW.cluster_id, NEW.item_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION rate.products_variant_item_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_products_variant_item_guard ON rate.products;
CREATE TRIGGER trg_products_variant_item_guard
  BEFORE INSERT OR UPDATE OF cluster_id, item_id ON rate.products
  FOR EACH ROW EXECUTE FUNCTION rate.products_variant_item_guard();

-- Every Item names its default variant: the cheapest priced published one, else the first
-- published one, else the first live one (by sort_order, storage, key). Only where unset.
UPDATE rate.items i
SET default_variant_id = d.id
FROM (
  SELECT DISTINCT ON (m.item_id) m.item_id, m.id
  FROM rate.master_products m
  WHERE m.status <> 'archived'
  ORDER BY m.item_id,
           (m.status = 'published') DESC,
           (m.min_price > 0) DESC NULLS LAST,
           m.min_price ASC NULLS LAST,
           m.sort_order NULLS LAST, m.storage_gb NULLS LAST, m.variant_key, m.id
) d
WHERE d.item_id = i.id AND i.default_variant_id IS NULL;

COMMIT;
