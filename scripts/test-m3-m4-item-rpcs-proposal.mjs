#!/usr/bin/env node
// Replays the DOS-Me Item RPC and M3/M4 PROPOSALS (DOS/Rate#1160) on the migration replay
// stack, after M0 and M1+M2 in the order JOY applies them: a small catalog (a multi-size
// Item with a live unknown variant, an earbuds Item, a draft Item), the Item RPCs twice and
// called as anon and rate_worker, M3 and M4 twice, every verification query, the
// constraints and guard, both rollbacks twice, and a full re-apply. Nothing touches a real
// database.
//
// Usage: node scripts/test-m3-m4-item-rpcs-proposal.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const m0 = read('2026-10-29-dos-me-m0-seed-rekey.sql');
const m1m2 = read('2026-10-28-dos-me-m1-m2-items.sql');
const m1m2Verify = read('2026-10-28-dos-me-m1-m2-items-verify.sql');
const rpcs = read('2026-10-29-dos-me-item-rpcs.sql');
const rpcsRollback = read('2026-10-29-dos-me-item-rpcs-rollback.sql');
const m3m4 = read('2026-10-29-dos-me-m3-m4.sql');
const m3m4Rollback = read('2026-10-29-dos-me-m3-m4-rollback.sql');
const m3m4Verify = read('2026-10-29-dos-me-m3-m4-verify.sql');

const container = `rate-m3-m4-proposal-${process.pid}`;
const removeContainer = () =>
  spawnSync('docker', ['rm', '--force', container], { timeout: 30_000 });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    removeContainer();
    process.exit(130);
  });
}

const expectZero = (file) =>
  [
    ...file.matchAll(
      /^-- (V\d+) [^\n]*expect 0\n(?:--[^\n]*\n)*(SELECT[\s\S]*?;)/gm
    ),
  ].map(([, id, query]) => ({ id, query }));
const m3m4Checks = expectZero(m3m4Verify);
const m1m2Checks = expectZero(m1m2Verify);
assert.equal(
  m3m4Checks.length,
  5,
  'the M3/M4 verification lists its expect-0 queries'
);

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const EARBUDS = 'c0000000-0000-4000-8000-000000000002';
const m = {
  p128: 'a0000000-0000-4000-8000-000000000128',
  p256: 'a0000000-0000-4000-8000-000000000256',
  pUnknown: 'a0000000-0000-4000-8000-0000000000aa',
  buds: 'a0000000-0000-4000-8000-0000000000bd',
  draft: 'a0000000-0000-4000-8000-0000000000df',
};

try {
  const { sql, asRole } = startRateDb({ name: container });
  const checkAll = (checks, when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} after ${when}`);
  };

  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES
      ('${PHONES}', 'Điện thoại', 'smartphones'), ('${EARBUDS}', 'Tai nghe', 'earbuds');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug) VALUES
      ('e0000000-0000-4000-8000-000000000001', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      storage_gb, min_price, max_price, has_5g, key_specs)
    VALUES
      ('${m.p128}', 'Acme', 'Phone X', 'acme:phone-x:128gb', 'Acme Phone X 128GB', 'acme-phone-x-128gb',
       '${PHONES}', 'published', 128, 10000000, 10000000, true, '{"chip": "Acme A1"}'),
      ('${m.p256}', 'Acme', 'Phone X', 'acme:phone-x:256gb', 'Acme Phone X 256GB', 'acme-phone-x-256gb',
       '${PHONES}', 'published', 256, 12000000, 12000000, true, '{"chip": "Acme A1"}'),
      ('${m.pUnknown}', 'Acme', 'Phone X', 'acme:phone-x:unknown', 'Acme Phone X', 'acme-phone-x-unknown',
       '${PHONES}', 'published', NULL, 0, 0, true, '{}'),
      ('${m.buds}', 'Acme', 'Buds', 'acme:buds:unknown', 'Acme Buds', 'acme-buds',
       '${EARBUDS}', 'published', NULL, 2000000, 2000000, false, '{}'),
      ('${m.draft}', 'Acme', 'Draft', 'acme:draft:128gb', 'Acme Draft 128GB', 'acme-draft-128gb',
       '${PHONES}', 'draft', 128, 5000000, 5000000, false, '{}');
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES
      ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'shopee', 'u1',
       'Acme Phone X', 9500000, 'https://shopee.vn/u1', '${m.pUnknown}'),
      ('b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'shopee', 'u2',
       'Acme Phone X', 9600000, 'https://shopee.vn/u2', '${m.pUnknown}'),
      ('b0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'shopee', 'x128',
       'Acme Phone X 128GB', 10000000, 'https://shopee.vn/x128', '${m.p128}'),
      ('b0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'shopee', 'b1',
       'Acme Buds', 2000000, 'https://shopee.vn/b1', '${m.buds}');
  `);

  sql(m0);
  sql(m1m2);
  sql(rpcs);
  sql(rpcs);

  // Item RPCs, as the web (anon) and the worker call them.
  const search = (args) =>
    asRole(
      'anon',
      `SELECT slug || '|' || array_to_string(matching_variant_keys, ',') || '|' || coalesce(matching_min_price::bigint::text, '-') || '|' || total_count
       FROM rate.search_items_v1(${args}) ORDER BY slug`
    );
  assert.equal(
    search(`p_category_id => '${PHONES}'`),
    'acme-phone-x|128gb,256gb,unknown|10000000|1',
    'one row per published Item; the draft Item is not listed'
  );
  assert.equal(
    search(`p_category_id => '${PHONES}', p_storage_gb => ARRAY[256]`),
    'acme-phone-x|256gb|12000000|1',
    '?storage= means "has a variant of that size"; the price is that size'
  );
  assert.equal(
    search(`p_search => 'phone x'`),
    'acme-phone-x|128gb,256gb,unknown|10000000|1'
  );
  assert.equal(
    search(`p_category_id => '${PHONES}', p_storage_gb => ARRAY[512]`),
    ''
  );
  assert.equal(
    asRole(
      'anon',
      `SELECT brand || '=' || count FROM rate.get_category_brand_facets_v2('${PHONES}')`
    ),
    'Acme=1'
  );
  assert.equal(
    asRole(
      'anon',
      `SELECT entity_kind || '|' || slug FROM rate.search_catalog_autocomplete_v2('acme phone', 5) LIMIT 1`
    ),
    'item|acme-phone-x'
  );
  assert.equal(
    asRole(
      'rate_worker',
      `SELECT count(*) FROM rate.search_items_v1(p_limit => 5)`
    ),
    '2'
  );

  // M3 + M4, twice.
  sql(m3m4);
  sql(m3m4);
  checkAll(m3m4Checks, 'M3/M4');
  checkAll(m1m2Checks, 'M3/M4 (M1+M2 checks)');
  assert.equal(
    sql(`SELECT status FROM rate.master_products WHERE id = '${m.pUnknown}'`),
    'archived'
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM rate.products WHERE cluster_id IS NULL AND item_id IS NOT NULL`
    ),
    '2',
    'the unknown variant listings keep their Item with no variant'
  );
  assert.equal(
    sql(`SELECT count(*) FILTER (WHERE listing_id IS NULL) || '|' || count(*) FILTER (WHERE listing_id IS NOT NULL)
         FROM rate.m3_unknown_variant_backup`),
    '1|2',
    'one retired variant and its two listings backed up, once'
  );
  assert.equal(
    sql(`SELECT status FROM rate.master_products WHERE id = '${m.buds}'`),
    'published',
    'earbuds keep their single unknown variant'
  );
  assert.equal(
    sql(
      `SELECT default_variant_id FROM rate.items WHERE item_key = 'acme:phone-x'`
    ),
    m.p128,
    'the default variant is the cheapest priced published one'
  );
  // After M3 the archived unknown no longer counts as a matching size.
  assert.equal(
    search(`p_category_id => '${PHONES}'`),
    'acme-phone-x|128gb,256gb|10000000|1'
  );

  // M4 constraints.
  assert.throws(
    () =>
      sql(`INSERT INTO rate.products (merchant_id, platform, platform_item_id, title, price_current, url)
           VALUES ('e0000000-0000-4000-8000-000000000001', 'shopee', 'orphan', 'X', 1, 'https://shopee.vn/o')`),
    /products_item_id_not_null/
  );
  assert.throws(
    () =>
      sql(
        `UPDATE rate.master_products SET item_id = NULL WHERE id = '${m.p128}'`
      ),
    /null value in column "item_id"/
  );
  assert.throws(
    () =>
      sql(`BEGIN;
           ALTER TABLE rate.products DISABLE TRIGGER trg_products_sync_item;
           UPDATE rate.products SET item_id = (SELECT id FROM rate.items WHERE item_key = 'acme:buds')
           WHERE platform_item_id = 'x128';
           COMMIT;`),
    /is not a variant of item/
  );
  sql('ROLLBACK;');

  // Rollbacks (twice each), then everything again.
  sql(m3m4Rollback);
  sql(m3m4Rollback);
  assert.equal(
    sql(`SELECT status || '|' || (SELECT count(*) FROM rate.products WHERE cluster_id = '${m.pUnknown}')
         FROM rate.master_products WHERE id = '${m.pUnknown}'`),
    'published|2',
    'M3 rollback puts the unknown variant and its listings back'
  );
  assert.equal(
    sql(`SELECT to_regclass('rate.m3_unknown_variant_backup') IS NULL`),
    't'
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM pg_constraint WHERE conname = 'products_item_id_not_null'`
    ),
    '0'
  );
  sql(rpcsRollback);
  sql(rpcsRollback);
  assert.equal(
    sql(
      `SELECT to_regprocedure('rate.search_catalog_autocomplete_v2(text,integer)') IS NULL`
    ),
    't'
  );
  sql(rpcs);
  sql(m3m4);
  checkAll(m3m4Checks, 'rollback and re-apply');

  console.log(
    `Item RPC and M3/M4 proposals passed: RPCs as anon and rate_worker, M3/M4 twice, ${m3m4Checks.length} checks, constraints, rollbacks and re-apply`
  );
} finally {
  removeContainer();
}
