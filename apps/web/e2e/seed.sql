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

-- A published phone whose price history read fails on purpose (FAULT_RULES in
-- scripts/e2e/run.mjs); everything else about it reads normally.
INSERT INTO rate.master_products
  (id, category_id, brand, model, model_key, name, slug, min_price, max_price, merchant_count, status, metadata)
VALUES ('22222222-2222-4222-8222-22222222fa17', 'c0000000-0000-4000-8000-000000000001', 'E2E', 'Price Fault Phone',
  'e2e_price_fault_phone', 'E2E Price Fault Phone', 'e2e-price-fault-phone', 1000000, 1000000, 1, 'published',
  '{"category_slug": "smartphones"}');
-- Sold by its own merchant, so no other seeded profile reads its history.
INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddfa17', 'shopee', 'shop_price_fault', 'Price Fault Store', 'price-fault-store', false);
INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, category_id, price_current, url, cluster_id)
VALUES ('cccccccc-cccc-4ccc-8ccc-ccccccccfa17', 'dddddddd-dddd-4ddd-8ddd-ddddddddfa17', 'shopee', 'item_fault',
  'E2E Price Fault Phone', 'c0000000-0000-4000-8000-000000000001', 1000000, 'https://shopee.vn/item-fault',
  '22222222-2222-4222-8222-22222222fa17');

-- 1100 small merchants push the directory past PostgREST's 1000-row cap, and
-- "Last Ranked Shop" sorts after all of them (fewest followers), so an unpaged
-- merchants read always drops it.
INSERT INTO rate.merchants (platform, platform_shop_id, name, slug, follower_count)
SELECT 'shopee', 'bulk_shop_' || g, 'Bulk Shop ' || g, 'bulk-shop-' || g, 1
FROM generate_series(1, 1100) AS g;
INSERT INTO rate.merchants (platform, platform_shop_id, name, slug, follower_count)
VALUES ('shopee', 'last_ranked_shop', 'Last Ranked Shop', 'last-ranked-shop', 0);

-- A phone with 1050 offers from one store: past PostgREST's 1000-row cap. The
-- 50 dearest offers cost double, so a truncated (price-ordered) read loses the
-- whole price spread as well as 50 offers and 50 store listings.
INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1050', 'shopee', 'shop_many_offers', 'Many Offers Store', 'many-offers-store', false);
INSERT INTO rate.master_products
  (id, category_id, brand, model, model_key, name, slug, min_price, max_price, merchant_count, status, metadata)
VALUES ('22222222-2222-4222-8222-222222221050', 'c0000000-0000-4000-8000-000000000001', 'E2E', 'Many Offers Phone',
  'e2e_many_offers_phone', 'E2E Many Offers Phone', 'e2e-many-offers-phone', 1000000, 2000000, 1, 'published',
  '{"category_slug": "smartphones"}');
INSERT INTO rate.products (merchant_id, platform, platform_item_id, title, category_id, price_current, url, cluster_id)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1050', 'shopee', 'many_' || g, 'E2E Many Offers Phone #' || g,
  'c0000000-0000-4000-8000-000000000001', CASE WHEN g <= 1000 THEN 1000000 ELSE 2000000 END,
  'https://shopee.vn/many-' || g, '22222222-2222-4222-8222-222222221050'
FROM generate_series(1, 1050) AS g;
-- Its only review and review analysis sit on the last-inserted listing, which an
-- unpaged listing-id read (insertion order, capped at 1000) never reaches.
INSERT INTO rate.reviews (product_id, author_name, rating_star, comment, reviewer_type)
SELECT id, 'Khoa', 5, 'Review past the 1000-row listing cap.', 'user'
FROM rate.products WHERE platform_item_id = 'many_1050';
INSERT INTO rate.review_analysis (product_id, total_reviews_analyzed, authenticity_score, ai_summary)
SELECT id, 7, 90, 'E2E analysis past the 1000-row listing cap.'
FROM rate.products WHERE platform_item_id = 'many_1050';

-- A merchant with 250 listings: reads that pass every listing id to one in.()
-- would exceed the request-line limit the E2E proxy enforces. Its newest review
-- sits on the last listing, so it shows only if every chunk is read.
INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb250', 'shopee', 'shop_bulk', 'Bulk Listings Store', 'bulk-listings-store', false);
INSERT INTO rate.products (merchant_id, platform, platform_item_id, title, price_current, url)
SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb250', 'shopee', 'bulk_' || g, 'Phụ kiện số ' || g, 100000 + g, 'https://shopee.vn/bulk-' || g
FROM generate_series(1, 250) AS g;
INSERT INTO rate.reviews (product_id, author_name, rating_star, comment, reviewer_type)
SELECT id, 'Thảo', 4, 'Đóng gói cẩn thận, giao nhanh.', 'user'
FROM rate.products WHERE platform_item_id = 'bulk_250';

-- 120 old reviews flagged as seeding, more than the newest-60 sample the home
-- page shows: platform-wide verdict counts must include all of them
-- (DOS/Rate#455). They are older than every other review, so they only fill
-- recent-review slots the other seeded reviews leave free.
INSERT INTO rate.reviews (product_id, author_name, rating_star, comment, reviewer_type, created_at)
SELECT id, 'Seeder', 5, 'Sản phẩm tốt tuyệt vời ' || platform_item_id, 'user', now() - interval '60 days'
FROM rate.products
WHERE platform_item_id IN (SELECT 'bulk_' || g FROM generate_series(1, 120) AS g);
INSERT INTO rate.review_flags (review_id, verdict, fake_probability, detector, detector_version, input_hash, include_in_rating, flag_category)
SELECT r.id, 'fake', 0.95, 'e2e', '1', 'e2e-' || r.id, false, 'seeding_fake'
FROM rate.reviews r WHERE r.author_name = 'Seeder';

-- 1100 recent observations at 1,000,000 on one many-offers listing, plus an
-- all-time low (500,000) and high (3,000,000) recorded before them: the
-- product's lowest/highest ever must come from the whole history, not the
-- newest 1000 rows (DOS/Rate#464).
INSERT INTO rate.price_history (product_id, price, recorded_at)
SELECT id, 1000000, now() - (g || ' minutes')::interval
FROM rate.products, generate_series(1, 1100) AS g
WHERE platform_item_id = 'many_1';
INSERT INTO rate.price_history (product_id, price, recorded_at)
SELECT id, v.price, now() - v.age
FROM rate.products,
  (VALUES (500000, interval '90 days'), (3000000, interval '80 days')) AS v(price, age)
WHERE platform_item_id = 'many_1';

-- An earbuds category with 201 models: one more than a catalogue page holds,
-- so /earbuds needs a second page (DOS/Rate#466).
INSERT INTO rate.categories (id, name, slug, display_order)
VALUES ('c0000000-0000-4000-8000-000000000005', 'Tai nghe', 'earbuds', 5);
-- All 201 share one created_at on purpose: pages must still be disjoint,
-- which relies on search_master_products ordering by id last (DOS/Rate#469).
INSERT INTO rate.master_products
  (category_id, brand, model, model_key, name, slug, min_price, max_price, merchant_count, status, metadata, created_at)
SELECT 'c0000000-0000-4000-8000-000000000005', 'E2E Audio', 'Bud ' || g, 'e2e_bud_' || g,
  'E2E Bud ' || lpad(g::text, 3, '0'), 'e2e-bud-' || lpad(g::text, 3, '0'), 500000, 500000, 0, 'published',
  '{"category_slug": "earbuds"}', timestamptz '2026-10-01 00:00:00+00'
FROM generate_series(1, 201) AS g;
-- One shared rating, so the leaderboard ranks them (unrated models are left
-- out) and every bud ties: past the 100 best-rated, only a search over the
-- whole category finds them (DOS/Rate#473).
UPDATE rate.master_products SET user_rating_weighted = 4
WHERE slug LIKE 'e2e-bud-%';

-- A phone whose six 5-star reviews are mostly star-only, one of them a
-- sponsored post: the product page shows the star-distribution warning and a
-- disclosure badge, which must follow the active locale (DOS/Rate#566). Its
-- rating is never refreshed, so it stays off the leaderboard, and its reviews
-- are older than every other review, so they take no recent-review slot.
INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffff0566', 'shopee', 'shop_review_labels', 'Review Labels Store', 'review-labels-store', false);
INSERT INTO rate.master_products
  (id, category_id, brand, model, model_key, name, slug, min_price, max_price, merchant_count, status, metadata)
VALUES ('22222222-2222-4222-8222-222222220566', 'c0000000-0000-4000-8000-000000000001', 'E2E', 'Review Labels Phone',
  'e2e_review_labels_phone', 'E2E Review Labels Phone', 'e2e-review-labels-phone', 3000000, 3000000, 1, 'published',
  '{"category_slug": "smartphones"}');
INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, category_id, price_current, url, cluster_id)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccc0566', 'ffffffff-ffff-4fff-8fff-ffffffff0566', 'shopee', 'item_review_labels',
  'E2E Review Labels Phone', 'c0000000-0000-4000-8000-000000000001', 3000000, 'https://shopee.vn/item-review-labels',
  '22222222-2222-4222-8222-222222220566');
INSERT INTO rate.reviews (product_id, author_name, rating_star, comment, reviewer_type, platform_created_at, created_at)
SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccc0566', v.author, 5, v.comment, 'user',
  now() - interval '100 days', now() - interval '100 days'
FROM (VALUES
  ('Labels 1', 'Máy được tài trợ, dùng rất mượt và pin trâu cả ngày.'),
  ('Labels 2', 'Tốt'), ('Labels 3', 'Ok'), ('Labels 4', 'Rất tốt'), ('Labels 5', 'Đẹp'), ('Labels 6', 'Ổn')
) AS v(author, comment);
INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
SELECT id, 'authentic', true, 'e2e-seed', 'v1', 'seed-' || id
FROM rate.reviews WHERE product_id = 'cccccccc-cccc-4ccc-8ccc-cccccccc0566';
-- The analyzer's Vietnamese template texts, which the product page shows in
-- the active locale (DOS/Rate#647).
UPDATE rate.review_flags SET reason = 'Đánh giá chi tiết, hợp lệ từ người dùng thực tế.'
WHERE review_id IN (SELECT id FROM rate.reviews WHERE product_id = 'cccccccc-cccc-4ccc-8ccc-cccccccc0566');
INSERT INTO rate.review_analysis (product_id, total_reviews_analyzed, authenticity_score, pros, ai_summary)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccc0566', 6, 95, ARRAY['Nhận phản hồi tích cực từ người dùng thực tế'],
  'Đã phân tích 6 đánh giá: giữ lại 6 đánh giá thực chất (điểm JReviews có trọng số: 5/5★) và loại bỏ 0 đánh giá rác/nhận xu/seeding/bom hàng khỏi điểm tổng.');
