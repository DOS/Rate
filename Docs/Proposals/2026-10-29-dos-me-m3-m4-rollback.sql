-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-29-dos-me-m3-m4.sql (DOS/Rate#1160). M4 first,
-- then M3 from its backup table. Run with the writers paused. Re-runnable.

-- M4 ---------------------------------------------------------------------------------------
BEGIN;
DROP TRIGGER IF EXISTS trg_master_products_fill_default_variant ON rate.master_products;
DROP FUNCTION IF EXISTS rate.items_fill_default_variant();
DROP TRIGGER IF EXISTS trg_products_variant_item_guard ON rate.products;
DROP FUNCTION IF EXISTS rate.products_variant_item_guard();
ALTER TABLE rate.products DROP CONSTRAINT IF EXISTS products_item_id_not_null;
ALTER TABLE rate.master_products ALTER COLUMN item_id DROP NOT NULL;
-- default_variant_id values stay: nullable data M1+M2 already allowed.
COMMIT;

-- M3 ---------------------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  r         record;
  v_skipped bigint;
BEGIN
  IF to_regclass('rate.m3_unknown_variant_backup') IS NULL THEN
    RETURN;
  END IF;
  -- The variants first (so the listings' triggers see them live), then their listings, with
  -- the hand-set-variant guard switched off for this transaction.
  PERFORM set_config('rate.variant_override', 'on', true);
  FOR r IN
    SELECT DISTINCT ON (b.master_id) b.master_id, b.master_status
    FROM rate.m3_unknown_variant_backup b
    WHERE b.listing_id IS NULL
    ORDER BY b.master_id, b.id
  LOOP
    UPDATE rate.master_products mp
    SET status = r.master_status,
        metadata = mp.metadata - 'status_before_retire' - 'retired_by'
    WHERE mp.id = r.master_id;
  END LOOP;
  -- Only a listing still carrying the retire marker for that variant: any later variant or
  -- Item change cleared the marker (M1 trigger), and that change wins over the rollback.
  UPDATE rate.products p
  SET cluster_id = b.listing_cluster_id,
      variant_source = b.listing_variant_src,
      metadata = p.metadata - 'retired_unknown_variant' - 'variant_source_before_retire'
  FROM rate.m3_unknown_variant_backup b
  WHERE b.listing_id = p.id
    AND p.cluster_id IS NULL
    AND p.item_id = b.item_id
    AND p.metadata ->> 'retired_unknown_variant' = b.master_id::text;
  SELECT count(*) INTO v_skipped
  FROM rate.m3_unknown_variant_backup b
  JOIN rate.products p ON p.id = b.listing_id
  WHERE p.cluster_id IS DISTINCT FROM b.listing_cluster_id;
  IF v_skipped > 0 THEN
    RAISE NOTICE 'M3 rollback: % listing(s) changed after M3 were left as they are', v_skipped;
  END IF;
  FOR r IN SELECT DISTINCT b.master_id, b.item_id FROM rate.m3_unknown_variant_backup b LOOP
    PERFORM rate.refresh_master_market_stats(r.master_id);
    PERFORM rate.refresh_item_stats(r.item_id);
  END LOOP;
END $$;
DROP TABLE IF EXISTS rate.m3_unknown_variant_backup;
COMMIT;
