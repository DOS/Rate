-- PROPOSAL. Read-only verification for 2026-10-28-dos-me-m1-m2-items.sql (DOS/Rate#1150,
-- design section 7.3). Run before (inventory), after M1+M2, and again as the reconciliation
-- after the last writer ships Item-aware code. Every query is a SELECT. Expected results are
-- in the trailing comments; `scripts/test-item-migration-proposal.mjs` runs them on the
-- replay stack and fails on any non-expected value.

-- V1 Every variant has an Item.                                               expect 0
SELECT count(*) AS masters_without_item FROM rate.master_products WHERE item_id IS NULL;

-- V2 Every listing on a variant has an Item.                                  expect 0
SELECT count(*) AS listings_without_item
FROM rate.products WHERE item_id IS NULL AND cluster_id IS NOT NULL;

-- V3 A listing's Item is its variant's Item.                                  expect 0
SELECT count(*) AS listing_item_mismatch
FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE p.item_id IS DISTINCT FROM mp.item_id;

-- V4 variant_key is the key's third segment.                                  expect 0
SELECT count(*) AS variant_key_drift
FROM rate.master_products
WHERE variant_key IS DISTINCT FROM NULLIF(split_part(model_key, ':', 3), '');

-- V5 An Item's key is its variants' brand:model.                              expect 0
SELECT count(*) AS item_key_drift
FROM rate.master_products mp JOIN rate.items i ON i.id = mp.item_id
WHERE i.item_key <> split_part(mp.model_key, ':', 1) || ':' || split_part(mp.model_key, ':', 2);

-- V6 A published variant never sits under an unpublished Item.               expect 0
SELECT count(*) AS published_variant_hidden
FROM rate.master_products mp JOIN rate.items i ON i.id = mp.item_id
WHERE mp.status = 'published' AND i.status <> 'published';

-- V7 Item "from" price = min over its published, priced variants.            expect 0
SELECT count(*) AS item_min_price_drift
FROM rate.items i
WHERE i.min_price IS DISTINCT FROM (
  SELECT COALESCE(min(mp.min_price) FILTER (WHERE mp.min_price > 0), 0)
  FROM rate.master_products mp
  WHERE mp.item_id = i.id AND mp.status = 'published');

-- V8 Item listing counts.                                                     expect 0
SELECT count(*) AS item_count_drift
FROM rate.items i
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS listings,
         (count(*) FILTER (WHERE p.cluster_id IS NULL))::integer AS unknown
  FROM rate.products p WHERE p.item_id = i.id AND p.origin = 'crawl'
) c
WHERE (i.listing_count, i.unknown_variant_listing_count) IS DISTINCT FROM (c.listings, c.unknown);

-- V9 An Item slug may only equal one of its own variants' slugs.             expect 0
SELECT count(*) AS foreign_slug_clash
FROM rate.items i JOIN rate.master_products mp ON mp.slug = i.slug
WHERE mp.item_id IS DISTINCT FROM i.id;

-- V10 Item names and slugs carry no storage.                                  expect 0
SELECT count(*) AS sized_item_names
FROM rate.items
WHERE slug ~ '-[0-9]+(gb|tb)$' OR name ~* '[[:space:]][0-9]+[[:space:]]?(gb|tb)$';

-- V11 Item specs carry no storage or RAM (variant overrides).                 expect 0
SELECT count(*) AS sized_item_specs
FROM rate.items
WHERE specifications #> '{hardware,storage_gb}' IS NOT NULL
   OR specifications #> '{hardware,ram_gb}' IS NOT NULL
   OR key_specs ? 'storage' OR key_specs ? 'ram';

-- V12 The variant rating mirrors its Item's.                                  expect 0
SELECT count(*) AS rating_mirror_drift
FROM rate.master_products mp JOIN rate.items i ON i.id = mp.item_id
WHERE (COALESCE(mp.user_rating_weighted, 0), COALESCE(mp.authentic_review_count, 0))
  IS DISTINCT FROM (COALESCE(i.user_rating_weighted, 0), i.authentic_review_count);

-- V13 variant_source values (information): legacy after the backfill, then evidence values.
SELECT COALESCE(variant_source, '(null)') AS variant_source, count(*)
FROM rate.products GROUP BY 1 ORDER BY 1;

-- V14 Multi-size Items still holding a live unknown variant (retire candidates). expect 0
-- after the importer's retire call; information before (list them with i.item_key).
SELECT count(*) AS retire_candidates
FROM rate.items i
JOIN rate.master_products u ON u.item_id = i.id AND u.variant_key = 'unknown' AND u.status <> 'archived'
WHERE EXISTS (SELECT 1 FROM rate.master_products s
              WHERE s.item_id = i.id AND s.status <> 'archived' AND s.variant_key ~ '^[0-9]+(gb|tb)$');

-- V15 Published variant counts per Item, for the page smoke test (information).
SELECT i.slug, count(mp.id) AS variants
FROM rate.items i JOIN rate.master_products mp ON mp.item_id = i.id
WHERE i.status = 'published' GROUP BY 1 ORDER BY 2 DESC, 1;
