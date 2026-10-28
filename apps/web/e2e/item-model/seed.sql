-- Item-model E2E fixture (DOS/Rate#1159), applied by `scripts/e2e/run.mjs --item-model`
-- after apps/web/e2e/seed.sql and the DOS-Me M0 + M1+M2 proposals
-- (Docs/Proposals/2026-10-29-dos-me-m0-seed-rekey.sql, 2026-10-28-dos-me-m1-m2-items.sql).
-- Synthetic catalog rows only, no credentials.
--
-- One multi-size Item (`e2e:item-phone`: 128gb and 256gb published, a retired `unknown`)
-- and one draft Item. The M1 trigger creates the Items from the masters' keys.

INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                  storage_gb, min_price, max_price, merchant_count)
VALUES
  ('17e00000-0000-4000-8000-000000000128', 'E2E', 'Item Phone', 'e2e:item-phone:128gb',
   'E2E Item Phone 128GB', 'e2e-item-phone-128gb', 'c0000000-0000-4000-8000-000000000001',
   'published', 128, 10990000, 10990000, 1),
  ('17e00000-0000-4000-8000-000000000256', 'E2E', 'Item Phone', 'e2e:item-phone:256gb',
   'E2E Item Phone 256GB', 'e2e-item-phone-256gb', 'c0000000-0000-4000-8000-000000000001',
   'published', 256, 12990000, 12990000, 1),
  ('17e00000-0000-4000-8000-0000000000aa', 'E2E', 'Item Phone', 'e2e:item-phone:unknown',
   'E2E Item Phone', 'e2e-item-phone-unknown', 'c0000000-0000-4000-8000-000000000001',
   'published', NULL, 9990000, 9990000, 1),
  ('17e00000-0000-4000-8000-0000000000df', 'E2E', 'Draft Phone', 'e2e:draft-phone:128gb',
   'E2E Draft Phone 128GB', 'e2e-draft-phone-128gb', 'c0000000-0000-4000-8000-000000000001',
   'draft', 128, 8990000, 8990000, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current,
                           url, cluster_id)
VALUES
  ('27e00000-0000-4000-8000-000000000128', '11111111-1111-4111-8111-111111111111', 'shopee',
   'e2e_item_128', 'E2E Item Phone 128GB', 10990000, 'https://shopee.vn/e2e-item-128',
   '17e00000-0000-4000-8000-000000000128'),
  ('27e00000-0000-4000-8000-000000000256', '11111111-1111-4111-8111-111111111111', 'shopee',
   'e2e_item_256', 'E2E Item Phone 256GB', 12990000, 'https://shopee.vn/e2e-item-256',
   '17e00000-0000-4000-8000-000000000256'),
  ('27e00000-0000-4000-8000-0000000000aa', '11111111-1111-4111-8111-111111111112', 'tiki',
   'e2e_item_unknown', 'E2E Item Phone', 9990000, 'https://tiki.vn/e2e-item-unknown',
   '17e00000-0000-4000-8000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

-- The 128GB variant is the Item's default; the unknown variant is retired the way the
-- importer does it (its listing keeps the Item with no variant, the variant is archived).
UPDATE rate.items SET default_variant_id = '17e00000-0000-4000-8000-000000000128'
WHERE item_key = 'e2e:item-phone';
SELECT rate.retire_item_unknown_variant(id) FROM rate.items WHERE item_key = 'e2e:item-phone';
SELECT rate.refresh_item_stats(id) FROM rate.items WHERE item_key LIKE 'e2e:%';
