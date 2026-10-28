-- PROPOSAL, NOT APPLIED. DOS-Me migrations M3 (retire `unknown` on multi-size Items) and M4
-- (constraints) for the Item model (DOS/Rate#1160; design
-- Docs/Proposals/2026-10-27-item-variant-listing-model.md sections 4.2, 4.3, 7, 7.2).
-- Applies only AFTER the compatibility window (see 2026-10-29-dos-me-m3-m4.md): M0 and M1+M2
-- applied, every writer Item-aware (importer flag on, Rate Services task 13 handling NULL
-- cluster_id), and the M1+M2 reconciliation queries at zero. Run M3 with the importer and
-- Rate Services writers paused. JOY applies it through DOS-Me.
-- Rollback: 2026-10-29-dos-me-m3-m4-rollback.sql. Verification:
-- 2026-10-29-dos-me-m3-m4-verify.sql.
--
-- Separate transactions (M3; M4 constraints; M4 validation) so each step can ship and be
-- verified on its own; every step aborts with a clear message when a precondition does not
-- hold, and every step is idempotent.

-- M3 ---------------------------------------------------------------------------------------
BEGIN;

-- What M3 changed, for the rollback (design 7.2): one row per retired variant (listing_id
-- NULL) and one per listing moved off it.
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

-- Preconditions (design 7.3): no earbuds master with a sized key (seed drift, fixed by M0),
-- and no price alert on an unknown variant M3 would archive (an alert needs a size; JOY
-- decides per alert before M3: move it to a sized variant or close it).
DO $$
DECLARE
  v_sized_earbuds text;
  v_alerted       text;
BEGIN
  SELECT string_agg(mp.model_key, ', ') INTO v_sized_earbuds
  FROM rate.master_products mp JOIN rate.categories c ON c.id = mp.category_id
  WHERE c.slug = 'earbuds' AND split_part(mp.model_key, ':', 3) <> 'unknown';
  IF v_sized_earbuds IS NOT NULL THEN
    RAISE EXCEPTION 'M3: earbuds masters with a sized key (apply M0 first): %', v_sized_earbuds;
  END IF;
  SELECT string_agg(DISTINCT u.model_key, ', ') INTO v_alerted
  FROM rate.master_products u
  JOIN rate.price_alerts a ON a.master_product_id = u.id AND a.is_active
  WHERE u.variant_key = 'unknown' AND u.status IS DISTINCT FROM 'archived'
    AND EXISTS (SELECT 1 FROM rate.master_products s
                WHERE s.item_id = u.item_id AND s.status IS DISTINCT FROM 'archived'
                  AND s.variant_key ~ '^[0-9]+(gb|tb)$');
  IF v_alerted IS NOT NULL THEN
    RAISE EXCEPTION 'M3: price alerts on unknown variants to retire, decide them first: %', v_alerted;
  END IF;
END $$;

-- Every multi-size Item (a live sized variant, never earbuds) still holding a live unknown
-- variant: retire it through the M2 RPC (same lock order and markers as the importer's
-- calls), then back up exactly what the RPC moved, read from its markers (they include the
-- listings its second sweep caught).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.id AS item_id, u.id AS master_id, u.status
    FROM rate.items i
    JOIN rate.master_products u
      ON u.item_id = i.id AND u.variant_key = 'unknown' AND u.status IS DISTINCT FROM 'archived'
    LEFT JOIN rate.categories c ON c.id = i.category_id
    WHERE COALESCE(c.slug, '') <> 'earbuds'
      AND EXISTS (SELECT 1 FROM rate.master_products s
                  WHERE s.item_id = i.id AND s.status IS DISTINCT FROM 'archived'
                    AND s.variant_key ~ '^[0-9]+(gb|tb)$')
    ORDER BY i.id
  LOOP
    PERFORM rate.retire_item_unknown_variant(r.item_id);
    IF (SELECT status FROM rate.master_products WHERE id = r.master_id) = 'archived' THEN
      INSERT INTO rate.m3_unknown_variant_backup (item_id, master_id, master_status)
      VALUES (r.item_id, r.master_id, r.status);
      INSERT INTO rate.m3_unknown_variant_backup
        (item_id, master_id, master_status, listing_id, listing_cluster_id, listing_variant_src)
      SELECT r.item_id, r.master_id, r.status, p.id, r.master_id,
             p.metadata ->> 'variant_source_before_retire'
      FROM rate.products p
      WHERE p.metadata ->> 'retired_unknown_variant' = r.master_id::text;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- M4 (constraints) ---------------------------------------------------------------------------
BEGIN;

-- Preconditions: every variant and every listing has an Item (a listing that never matched
-- must be matched or archived first, design 7.1).
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

-- master_products is small (one row per variant): the NOT NULL scan is short.
ALTER TABLE rate.master_products ALTER COLUMN item_id SET NOT NULL;
-- The listings CHECK is added NOT VALID here (no scan) and validated in its own transaction
-- below, which takes only SHARE UPDATE EXCLUSIVE, so reads and writes keep running.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'rate.products'::regclass AND conname = 'products_item_id_not_null') THEN
    ALTER TABLE rate.products ADD CONSTRAINT products_item_id_not_null CHECK (item_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

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
  WHERE m.status IS DISTINCT FROM 'archived'
  ORDER BY m.item_id,
           (m.status = 'published') DESC NULLS LAST,
           (m.min_price > 0) DESC NULLS LAST,
           m.min_price ASC NULLS LAST,
           m.sort_order NULLS LAST, m.storage_gb NULLS LAST, m.variant_key, m.id
) d
WHERE d.item_id = i.id AND i.default_variant_id IS NULL;

-- ...and an Item created later (or whose default was cleared) gets its first live variant
-- as default when that variant is written (lock order variant, then Item).
CREATE OR REPLACE FUNCTION rate.items_fill_default_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'archived' THEN
    UPDATE rate.items SET default_variant_id = NEW.id
    WHERE id = NEW.item_id AND default_variant_id IS NULL;
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION rate.items_fill_default_variant() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_master_products_fill_default_variant ON rate.master_products;
CREATE TRIGGER trg_master_products_fill_default_variant
  AFTER INSERT OR UPDATE OF status, item_id ON rate.master_products
  FOR EACH ROW EXECUTE FUNCTION rate.items_fill_default_variant();

COMMIT;

-- M4 (validation, own transaction: SHARE UPDATE EXCLUSIVE only) -------------------------------
ALTER TABLE rate.products VALIDATE CONSTRAINT products_item_id_not_null;
