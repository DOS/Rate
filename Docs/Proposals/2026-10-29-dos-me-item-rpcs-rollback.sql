-- PROPOSAL, NOT APPLIED. Rollback of 2026-10-29-dos-me-item-rpcs.sql (DOS/Rate#1160). New
-- functions only, no data: dropping them is enough. Turn the web's Item catalogue off first
-- (RATE_ITEM_MODEL off) or it falls back to the variant RPCs. Re-runnable.

BEGIN;
DROP FUNCTION IF EXISTS rate.search_catalog_autocomplete_v2(TEXT, INTEGER);
DROP FUNCTION IF EXISTS rate.get_category_brand_facets_v2(UUID);
DROP FUNCTION IF EXISTS rate.search_items_v1(
  UUID, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER[], BOOLEAN, TEXT, INTEGER, INTEGER
);
COMMIT;
