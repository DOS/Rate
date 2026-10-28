-- PROPOSAL. Read-only checks for 2026-10-29-dos-me-m0-seed-rekey.sql (DOS/Rate#1212). Run
-- before (as the pre-check) and after. `scripts/test-m0-seed-rekey-proposal.mjs` runs the
-- expect-0 ones on the replay stack.

-- V1 No master still on a drifted seed key.                                   expect 0
SELECT count(*) AS drifted_keys
FROM rate.master_products
WHERE model_key IN ('samsung:galaxy-buds3-pro:64gb', 'apple:airpods-pro-3:standard',
                    'sony:wf-1000xm5:64gb', 'sony:wf-1000xm6:standard',
                    'apple:airpods-pro-2-usbc:64gb', 'apple:watch-ultra-3-49mm:64gb');

-- V2 Earbuds carry no storage size, in the key or the column, category or not. expect 0
SELECT count(*) AS sized_earbuds
FROM rate.master_products mp LEFT JOIN rate.categories c ON c.id = mp.category_id
WHERE (c.slug = 'earbuds' OR mp.model_key IN ('samsung:galaxy-buds3-pro:unknown', 'apple:airpods-pro-3:unknown',
                       'sony:wf-1000xm5:unknown', 'sony:wf-1000xm6:unknown',
                       'apple:airpods-pro-2:unknown'))
  AND (split_part(mp.model_key, ':', 3) <> 'unknown' OR mp.storage_gb IS NOT NULL);

-- V3 No two masters share a model_key (also after a re-key).                    expect 0
SELECT count(*) AS duplicate_keys
FROM (SELECT model_key FROM rate.master_products GROUP BY 1 HAVING count(*) > 1) d;

-- V4 Every listing still points at an existing master.                        expect 0
SELECT count(*) AS orphan_listings
FROM rate.products p
WHERE p.cluster_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM rate.master_products mp WHERE mp.id = p.cluster_id);

-- V5 Pre-check (information): every key this step touches, old and new, with its row.
SELECT model_key, id, status, storage_gb, slug
FROM rate.master_products
WHERE model_key IN ('samsung:galaxy-buds3-pro:64gb', 'samsung:galaxy-buds3-pro:unknown',
                    'apple:airpods-pro-3:standard', 'apple:airpods-pro-3:unknown',
                    'sony:wf-1000xm5:64gb', 'sony:wf-1000xm5:unknown',
                    'sony:wf-1000xm6:standard', 'sony:wf-1000xm6:unknown',
                    'apple:airpods-pro-2-usbc:64gb', 'apple:airpods-pro-2:unknown',
                    'apple:watch-ultra-3-49mm:64gb', 'apple:watch-ultra-3:64gb')
ORDER BY model_key;
