-- Minimal catalog for the browser E2E suite (scripts/e2e/run.mjs): one
-- category, two published smartphones with offers from two merchants, price
-- history and reviews that count toward the rating. Fixed ids keep the specs
-- readable.

INSERT INTO rate.categories (id, name, slug, display_order)
VALUES ('c0000000-0000-4000-8000-000000000001', 'Điện thoại', 'smartphones', 1);

INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'shopee', 'shop_1', 'Apple Flagship Store', 'apple-flagship-store', true),
  ('11111111-1111-4111-8111-111111111112', 'tiki', 'shop_2', 'Samsung Official Store', 'samsung-official-store', true),
  -- Its listing query fails on purpose (FAULT_MARKERS in scripts/e2e/run.mjs).
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeefa17', 'shopee', 'shop_fault', 'Faulty Listings Store', 'faulty-listings-store', false);

INSERT INTO rate.master_products
  (id, category_id, brand, model, model_key, name, slug, ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g,
   min_price, max_price, merchant_count, status, metadata)
VALUES
  ('22222222-2222-4222-8222-222222222221', 'c0000000-0000-4000-8000-000000000001', 'Apple', 'iPhone 16 Pro Max',
   'apple_iphone_16_pro_max_256gb', 'iPhone 16 Pro Max 256GB', 'iphone-16-pro-max-256gb', 8, 256, 6.9, 4685, true,
   28990000, 31990000, 2, 'published', '{"category_slug": "smartphones"}'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000001', 'Samsung', 'Galaxy S25 Ultra',
   'samsung_galaxy_s25_ultra_256gb', 'Galaxy S25 Ultra 256GB', 'samsung-galaxy-s25-ultra-256gb', 12, 256, 6.9, 5000, true,
   26490000, 27990000, 1, 'published', '{"category_slug": "smartphones"}');

INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, category_id, brand, price_current, price_original, url, cluster_id)
VALUES
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', 'shopee', 'item_1',
   'iPhone 16 Pro Max 256GB VN/A', 'c0000000-0000-4000-8000-000000000001', 'Apple', 28990000, 34990000,
   'https://shopee.vn/item-1', '22222222-2222-4222-8222-222222222221'),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111112', 'tiki', 'item_2',
   'iPhone 16 Pro Max 256GB chính hãng', 'c0000000-0000-4000-8000-000000000001', 'Apple', 31990000, 34990000,
   'https://tiki.vn/item-2', '22222222-2222-4222-8222-222222222221'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111112', 'tiki', 'item_3',
   'Samsung Galaxy S25 Ultra 256GB', 'c0000000-0000-4000-8000-000000000001', 'Samsung', 26490000, 33990000,
   'https://tiki.vn/item-3', '22222222-2222-4222-8222-222222222222');

INSERT INTO rate.price_history (product_id, price, price_original, recorded_at)
SELECT p.id, p.price_current + d.days * 100000, p.price_original, now() - make_interval(days => d.days)
FROM rate.products p
CROSS JOIN (VALUES (0), (7), (14), (30)) AS d(days);

INSERT INTO rate.reviews (id, product_id, author_name, rating_star, comment, reviewer_type, platform_created_at)
VALUES
  ('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'Minh', 5,
   'Máy dùng rất mượt, pin trâu suốt cả ngày, camera chụp đêm đẹp.', 'user', now() - interval '3 days'),
  ('44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333331', 'Lan', 4,
   'Màn hình đẹp, hơi nóng khi chơi game lâu nhưng vẫn ổn.', 'user', now() - interval '5 days'),
  ('44444444-4444-4444-8444-444444444443', '33333333-3333-4333-8333-333333333333', 'Huy', 5,
   'Bút S Pen tiện, zoom 100x rõ hơn mong đợi.', 'user', now() - interval '2 days');

INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
SELECT id, 'authentic', true, 'e2e-seed', 'v1', 'seed-' || id FROM rate.reviews;

SELECT rate.refresh_master_product_rating(id) FROM rate.master_products;
