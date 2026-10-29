-- PROPOSAL. Read-only checks for 2026-10-29-dos-me-m3-m4.sql and 2026-10-29-dos-me-item-rpcs.sql
-- (DOS/Rate#1160; design 7.3). Run the M1+M2 verification file too. The CI replay
-- (scripts/test-m3-m4-item-rpcs-proposal.mjs) runs the expect-0 ones.

-- V1 No listing on a live unknown variant of a multi-size Item (after M3).     expect 0
SELECT count(*) AS unknown_on_multi_size
FROM rate.products p
JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE mp.variant_key = 'unknown'
  AND EXISTS (SELECT 1 FROM rate.master_products s WHERE s.item_id = mp.item_id
              AND s.variant_key ~ '^[0-9]+(gb|tb)$' AND s.status <> 'archived');

-- V2 Every variant and every listing has an Item (M4 preconditions).          expect 0
SELECT (SELECT count(*) FROM rate.master_products WHERE item_id IS NULL)
     + (SELECT count(*) FROM rate.products WHERE item_id IS NULL) AS without_item;

-- V3 A listing's variant belongs to its Item.                                  expect 0
SELECT count(*) AS listing_item_mismatch
FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id
WHERE mp.item_id IS DISTINCT FROM p.item_id;

-- V4 Every Item with a live variant names a default variant of its own.        expect 0
SELECT count(*) AS default_variant_missing
FROM rate.items i
WHERE EXISTS (SELECT 1 FROM rate.master_products m WHERE m.item_id = i.id AND m.status <> 'archived')
  AND NOT EXISTS (SELECT 1 FROM rate.master_products m
                  WHERE m.id = i.default_variant_id AND m.item_id = i.id);

-- V5 Earbuds and other single-variant Items still have their variant (M3 never retires them). expect 0
SELECT count(*) AS single_variant_retired
FROM rate.items i
LEFT JOIN rate.categories c ON c.id = i.category_id
WHERE (c.slug = 'earbuds' OR NOT EXISTS (
         SELECT 1 FROM rate.master_products s
         WHERE s.item_id = i.id AND s.variant_key ~ '^[0-9]+(gb|tb)$'))
  AND EXISTS (SELECT 1 FROM rate.m3_unknown_variant_backup b
              WHERE b.item_id = i.id AND b.listing_id IS NULL);

-- V6 (information) M3's work: variants retired and listings moved to "no variant".
SELECT (SELECT count(*) FROM rate.m3_unknown_variant_backup WHERE listing_id IS NULL) AS variants_retired,
       (SELECT count(*) FROM rate.m3_unknown_variant_backup WHERE listing_id IS NOT NULL) AS listings_moved,
       (SELECT count(*) FROM rate.products WHERE cluster_id IS NULL AND item_id IS NOT NULL) AS no_variant_now;

-- V7 (information) Price alerts left on retired unknown variants (an alert needs a size).
SELECT mp.model_key, count(a.id) AS alerts
FROM rate.master_products mp
JOIN rate.price_alerts a ON a.master_product_id = mp.id
WHERE mp.variant_key = 'unknown' AND mp.status = 'archived'
GROUP BY 1 ORDER BY 2 DESC;
