#!/usr/bin/env node
// Replays the DOS-Me M1+M2 Item migration PROPOSAL (DOS/Rate#1150) on the same throwaway
// PostgreSQL 17 stack as test-migration-replay.mjs: every reference migration, a small
// pre-migration catalog, the proposal twice (idempotency), its verification queries, the
// Item RPCs and triggers as the roles that call them, then the rollback twice and the
// proposal again. The proposal is not a migration: nothing here touches a real database.
//
// Usage: node scripts/test-item-migration-proposal.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const proposalDir = path.join(repoRoot, 'Docs', 'Proposals');
const read = (name) => readFileSync(path.join(proposalDir, name), 'utf8');
const proposal = read('2026-10-28-dos-me-m1-m2-items.sql');
const rollback = read('2026-10-28-dos-me-m1-m2-items-rollback.sql');
const verify = read('2026-10-28-dos-me-m1-m2-items-verify.sql');

const container = `rate-item-proposal-${process.pid}`;
const removeContainer = () =>
  spawnSync('docker', ['rm', '--force', container], { timeout: 30_000 });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    removeContainer();
    process.exit(130);
  });
}

// The verification file's "expect 0" queries, by their V number.
const expectZero = [
  ...verify.matchAll(
    /^-- (V\d+) [^\n]*expect 0\n(?:--[^\n]*\n)*(SELECT[\s\S]*?;)/gm
  ),
].map(([, id, query]) => ({ id, query }));
assert.ok(
  expectZero.length >= 10,
  'the verification file lists its expect-0 queries'
);

const ids = {
  laptops: 'c0000000-0000-4000-8000-000000000001',
  earbuds: 'c0000000-0000-4000-8000-000000000002',
  shop: 'e0000000-0000-4000-8000-000000000001',
  shop2: 'e0000000-0000-4000-8000-000000000002',
  zen1tb: 'a0000000-0000-4000-8000-000000000001',
  wf: 'a0000000-0000-4000-8000-000000000002',
  zenListing: 'b0000000-0000-4000-8000-000000000001',
  zenListing2: 'b0000000-0000-4000-8000-000000000002',
  wfListing: 'b0000000-0000-4000-8000-000000000003',
  review: 'd0000000-0000-4000-8000-000000000001',
};

try {
  const { sql, asRole } = startRateDb({ name: container });

  // A pre-migration catalog: a sized laptop variant with two listings and a review, and an
  // earbuds line keyed `unknown` (single-variant Item).
  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES
      ('${ids.laptops}', 'Laptop', 'laptops'), ('${ids.earbuds}', 'Tai nghe', 'earbuds');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug) VALUES
      ('${ids.shop}', 'shopee', 's1', 'Shop 1', 'shop-1'),
      ('${ids.shop2}', 'tiki', 's2', 'Shop 2', 'shop-2');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      specifications, key_specs, min_price, max_price)
    VALUES
      ('${ids.zen1tb}', 'Asus', 'Zenbook S 14', 'asus:zenbook-s-14:1024gb', 'Asus Zenbook S 14 1TB',
       'asus-zenbook-s-14-1tb', '${ids.laptops}', 'published',
       '{"hardware": {"chipset": "Core Ultra 7 258V", "storage_gb": 1024, "ram_gb": 32}}',
       '{"chip": "Core Ultra 7", "storage": "1TB", "ram": "32GB"}', 30000000, 31000000),
      ('${ids.wf}', 'Sony', 'WF-1000XM5', 'sony:wf-1000xm5:unknown', 'Sony WF-1000XM5',
       'sony-wf-1000xm5', '${ids.earbuds}', 'draft', '{}', '{}', 0, 0);
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES
      ('${ids.zenListing}', '${ids.shop}', 'shopee', 'z1', 'Asus Zenbook S 14 1TB', 30000000, 'https://shopee.vn/z1', '${ids.zen1tb}'),
      ('${ids.zenListing2}', '${ids.shop2}', 'tiki', 'z2', 'Asus Zenbook S 14 1TB', 31000000, 'https://tiki.vn/z2', '${ids.zen1tb}'),
      ('${ids.wfListing}', '${ids.shop}', 'shopee', 'w1', 'Sony WF-1000XM5', 5000000, 'https://shopee.vn/w1', '${ids.wf}');
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type)
    VALUES ('${ids.review}', '${ids.zenListing}', 4, 'Máy mỏng nhẹ, pin dùng cả ngày.', 'user');
    INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
    VALUES ('${ids.review}', 'authentic', true, 'replay', 'v1', 'h');
    UPDATE rate.reviews SET helpfulness_weight = 1 WHERE id = '${ids.review}';
  `);

  // The proposal applies twice on a live catalog.
  sql(proposal);
  sql(proposal);

  const checkVerify = (when) => {
    for (const { id, query } of expectZero) {
      assert.equal(sql(query), '0', `${id} after ${when}`);
    }
  };
  checkVerify('the backfill');

  // Backfill: one Item per brand:model, sizes stripped from slug, name and specs.
  assert.equal(
    sql(
      `SELECT slug || '|' || name || '|' || status FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    'asus-zenbook-s-14|Asus Zenbook S 14|published'
  );
  assert.equal(
    sql(`SELECT (specifications #>> '{hardware,chipset}') || '|' || coalesce(specifications #>> '{hardware,storage_gb}', '-')
         || '|' || coalesce(key_specs ->> 'storage', '-') FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`),
    'Core Ultra 7 258V|-|-'
  );
  assert.equal(
    sql(
      `SELECT slug || '|' || status FROM rate.items WHERE item_key = 'sony:wf-1000xm5'`
    ),
    'sony-wf-1000xm5|draft'
  );
  assert.equal(
    sql(`SELECT string_agg(DISTINCT variant_source, ',') FROM rate.products`),
    'legacy'
  );
  // Item stats and the pooled rating, mirrored onto the variant.
  assert.equal(
    sql(`SELECT min_price::bigint || '|' || listing_count || '|' || merchant_count || '|' || user_rating_weighted
         || '|' || authentic_review_count FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`),
    '30000000|2|2|4.00|1'
  );
  assert.equal(
    sql(
      `SELECT user_rating_weighted || '|' || authentic_review_count FROM rate.master_products WHERE id = '${ids.zen1tb}'`
    ),
    '4.00|1'
  );

  // RLS: anon sees published Items only and runs no Item RPC.
  assert.equal(asRole('anon', 'SELECT count(*) FROM rate.items'), '1');
  for (const fn of [
    `rate.match_item('Asus Zenbook S 14', 'Asus', NULL, 0.3)`,
    `rate.refresh_item_stats('${ids.zen1tb}')`,
    `rate.retire_item_unknown_variant('${ids.zen1tb}')`,
  ]) {
    assert.throws(
      () => asRole('anon', `SELECT * FROM ${fn}`),
      /permission denied for function/
    );
  }

  // The worker: reads draft Items, fuzzy-matches on Item names, and its inserts get their
  // Item from the M1 trigger (SECURITY DEFINER; the worker has no write grant on items).
  assert.equal(asRole('rate_worker', 'SELECT count(*) FROM rate.items'), '2');
  assert.equal(
    asRole(
      'rate_worker',
      `SELECT item_key FROM rate.match_item('Asus Zenbook S 14 OLED', 'Asus', 'Zenbook S 14', 0.3) LIMIT 1`
    ),
    'asus:zenbook-s-14'
  );
  assert.throws(
    () =>
      asRole(
        'rate_worker',
        `INSERT INTO rate.items (item_key, slug, name, brand, model) VALUES ('x:y', 'x-y', 'X', 'X', 'Y')`
      ),
    /permission denied for table items/
  );
  // It may update an Item's specs (RS#700), never its status or key.
  asRole(
    'rate_worker',
    `UPDATE rate.items SET key_specs = key_specs || '{"os": "Windows 11"}' WHERE item_key = 'asus:zenbook-s-14'`
  );
  assert.equal(
    sql(
      `SELECT key_specs ->> 'os' FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    'Windows 11'
  );
  for (const change of [
    `status = 'archived'`,
    `item_key = 'x:y'`,
    `min_price = 1`,
  ]) {
    assert.throws(
      () =>
        asRole(
          'rate_worker',
          `UPDATE rate.items SET ${change} WHERE item_key = 'asus:zenbook-s-14'`
        ),
      /permission denied for table items/,
      change
    );
  }
  asRole(
    'rate_worker',
    `INSERT INTO rate.master_products (brand, model, model_key, name, slug, category_id, status)
     VALUES ('Asus', 'Zenbook S 14', 'asus:zenbook-s-14:512gb', 'Asus Zenbook S 14 512GB', 'asus-zenbook-s-14-512gb', '${ids.laptops}', 'draft'),
            ('Apple', 'iPhone 17', 'apple:iphone-17:256gb', 'Apple iPhone 17 256GB', 'apple-iphone-17-256gb', NULL, 'published'),
            ('Asus', 'Zenbook S 14', 'asus:zenbook-s-14:unknown', 'Asus Zenbook S 14', 'asus-zenbook-s-14-unknown', '${ids.laptops}', 'draft')`
  );
  assert.equal(
    sql(`SELECT count(DISTINCT item_id) || '|' || string_agg(variant_key, ',' ORDER BY variant_key)
         FROM rate.master_products WHERE model_key LIKE 'asus:zenbook-s-14:%'`),
    '1|1024gb,512gb,unknown'
  );
  assert.equal(
    sql(
      `SELECT slug || '|' || name || '|' || status FROM rate.items WHERE item_key = 'apple:iphone-17'`
    ),
    'apple-iphone-17|Apple iPhone 17|published',
    'a published variant creates a published Item'
  );

  // A listing's Item follows its variant.
  const unknownId = sql(
    `SELECT id FROM rate.master_products WHERE model_key = 'asus:zenbook-s-14:unknown'`
  );
  const iphoneId = sql(
    `SELECT id FROM rate.master_products WHERE model_key = 'apple:iphone-17:256gb'`
  );
  asRole(
    'rate_worker',
    `INSERT INTO rate.products (merchant_id, platform, platform_item_id, title, price_current, url, cluster_id, variant_source)
     VALUES ('${ids.shop}', 'shopee', 'z3', 'Asus Zenbook S 14', 28000000, 'https://shopee.vn/z3', '${unknownId}', NULL)`
  );
  assert.equal(
    sql(
      `SELECT p.item_id = mp.item_id FROM rate.products p JOIN rate.master_products mp ON mp.id = '${unknownId}' WHERE p.platform_item_id = 'z3'`
    ),
    't'
  );

  // A hand-set variant survives a racing ingest; an override moves it on purpose.
  sql(
    `UPDATE rate.products SET variant_source = 'manual' WHERE id = '${ids.zenListing2}'`
  );
  asRole(
    'rate_worker',
    `UPDATE rate.products SET cluster_id = '${iphoneId}', variant_source = 'title' WHERE id = '${ids.zenListing2}'`
  );
  assert.equal(
    sql(
      `SELECT cluster_id || '|' || variant_source FROM rate.products WHERE id = '${ids.zenListing2}'`
    ),
    `${ids.zen1tb}|manual`
  );
  // The Item a listing leaves is refreshed by the move itself (no caller refresh).
  sql(`BEGIN; SET LOCAL rate.variant_override = 'on';
       UPDATE rate.products SET cluster_id = '${iphoneId}' WHERE id = '${ids.zenListing2}'; COMMIT;`);
  assert.equal(
    sql(
      `SELECT cluster_id || '|' || variant_source FROM rate.products WHERE id = '${ids.zenListing2}'`
    ),
    `${iphoneId}|manual`
  );
  assert.equal(
    sql(
      `SELECT listing_count FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    '2',
    'the left Item lost the moved listing (z1, z3 remain)'
  );
  // The writer refreshes the Item the listing joins, as the importer does.
  asRole(
    'rate_worker',
    `SELECT rate.refresh_item_stats(item_id) FROM rate.master_products WHERE id = '${iphoneId}'`
  );
  assert.equal(
    sql(
      `SELECT listing_count FROM rate.items WHERE item_key = 'apple:iphone-17'`
    ),
    '1'
  );
  // A writer that knows no Items refreshes only the variant (the old RPC): its Item follows.
  sql(
    `UPDATE rate.products SET price_current = 29000000 WHERE id = '${ids.zenListing}'`
  );
  asRole(
    'service_role',
    `SELECT rate.refresh_master_market_stats('${ids.zen1tb}')`
  );
  assert.equal(
    sql(
      `SELECT min_price::bigint FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    '29000000'
  );

  // Retire: the multi-size Item's unknown variant goes; its listing keeps the Item.
  assert.equal(
    asRole(
      'rate_worker',
      `SELECT rate.retire_item_unknown_variant(item_id) FROM rate.master_products WHERE id = '${unknownId}'`
    ),
    '1'
  );
  assert.equal(
    sql(`SELECT (p.cluster_id IS NULL) || '|' || (p.item_id = mp.item_id) || '|' || mp.status
         FROM rate.products p, rate.master_products mp WHERE p.platform_item_id = 'z3' AND mp.id = '${unknownId}'`),
    'true|true|archived'
  );
  assert.equal(
    sql(
      `SELECT unknown_variant_listing_count FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    '1'
  );
  // A writer that still holds the retired variant's id cannot put a listing back on it.
  asRole(
    'rate_worker',
    `INSERT INTO rate.products (merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
     VALUES ('${ids.shop2}', 'tiki', 'z4', 'Asus Zenbook S 14', 28500000, 'https://tiki.vn/z4', '${unknownId}')`
  );
  assert.equal(
    sql(`SELECT (p.cluster_id IS NULL) || '|' || (p.item_id = mp.item_id)
         FROM rate.products p, rate.master_products mp WHERE p.platform_item_id = 'z4' AND mp.id = '${unknownId}'`),
    'true|true'
  );
  asRole(
    'rate_worker',
    `SELECT rate.refresh_item_stats(item_id) FROM rate.master_products WHERE id = '${unknownId}'`
  );
  // A caller's own override survives the retire call.
  assert.equal(
    sql(`BEGIN; SET LOCAL rate.variant_override = 'on';
         SELECT rate.retire_item_unknown_variant(item_id) FROM rate.master_products WHERE id = '${unknownId}';
         SELECT current_setting('rate.variant_override'); COMMIT;`),
    '0\non'
  );
  // Earbuds and an Item without a live unknown variant are left alone.
  assert.equal(
    sql(
      `SELECT rate.retire_item_unknown_variant(item_id) FROM rate.master_products WHERE id = '${ids.wf}'`
    ),
    '0'
  );
  assert.equal(
    sql(
      `SELECT rate.retire_item_unknown_variant(item_id) FROM rate.master_products WHERE id = '${unknownId}'`
    ),
    '0'
  );

  // A vote on a listing with no variant still rates its Item.
  sql(`INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type)
       SELECT 'd0000000-0000-4000-8000-000000000002', id, 2, 'Nóng máy khi chạy nặng.', 'user'
       FROM rate.products WHERE platform_item_id = 'z3';
     INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
     VALUES ('d0000000-0000-4000-8000-000000000002', 'authentic', true, 'replay', 'v1', 'h2');
     INSERT INTO auth.users (id) VALUES ('f0000000-0000-4000-8000-000000000001');
     INSERT INTO rate.review_votes (review_id, voter_id, vote)
     VALUES ('d0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'up');`);
  assert.equal(
    sql(
      `SELECT authentic_review_count FROM rate.items WHERE item_key = 'asus:zenbook-s-14'`
    ),
    '2',
    'the vote trigger refreshed the Item rating through products.item_id'
  );

  checkVerify('the trigger and RPC checks');

  // Rollback (twice), then the proposal applies again on the same data.
  sql(rollback);
  sql(rollback);
  assert.equal(sql(`SELECT to_regclass('rate.items') IS NULL`), 't');
  assert.equal(
    sql(`SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'rate' AND column_name IN ('item_id', 'variant_key', 'variant_source', 'sort_order')`),
    '0'
  );
  // The retired variant and its listing are back; ratings are per variant again.
  assert.equal(
    sql(`SELECT p.cluster_id || '|' || mp.status FROM rate.products p
         JOIN rate.master_products mp ON mp.id = p.cluster_id WHERE p.platform_item_id = 'z3'`),
    `${unknownId}|draft`
  );
  assert.equal(
    sql(
      `SELECT authentic_review_count FROM rate.master_products WHERE id = '${ids.zen1tb}'`
    ),
    '1',
    'the pooled Item rating is not left on the variant'
  );
  sql(proposal);
  // The importer retires the restored unknown variant again on its next write.
  sql(
    `SELECT rate.retire_item_unknown_variant(item_id) FROM rate.master_products WHERE id = '${unknownId}'`
  );
  checkVerify('rollback and re-apply');

  console.log(
    `Item migration proposal passed: applied twice, ${expectZero.length} verification checks, triggers and RPCs exercised, rollback and re-apply`
  );
} finally {
  removeContainer();
}
