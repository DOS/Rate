#!/usr/bin/env node
// Replays the DOS-Me M0 seed re-key PROPOSAL (DOS/Rate#1212) on the migration replay stack:
// every reference migration, the six drifted seed masters as the M0 inventory found them
// (with listings), the proposal twice, its verification, then the M1+M2 Item proposal on top
// (the intended order), both rollbacks, and the skip when a target key is already taken.
// The proposal is not a migration: nothing here touches a real database.
//
// Usage: node scripts/test-m0-seed-rekey-proposal.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const m0 = read('2026-10-29-dos-me-m0-seed-rekey.sql');
const m0Rollback = read('2026-10-29-dos-me-m0-seed-rekey-rollback.sql');
const m0Verify = read('2026-10-29-dos-me-m0-seed-rekey-verify.sql');
const items = read('2026-10-28-dos-me-m1-m2-items.sql');
const itemsRollback = read('2026-10-28-dos-me-m1-m2-items-rollback.sql');
const itemsVerify = read('2026-10-28-dos-me-m1-m2-items-verify.sql');

const container = `rate-m0-proposal-${process.pid}`;
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
const m0Checks = expectZero(m0Verify);
const itemChecks = expectZero(itemsVerify);
assert.equal(
  m0Checks.length,
  4,
  'the M0 verification file lists its expect-0 queries'
);

// The six drifted seed masters (M0 inventory, #1150 comment) and one earbuds line already on
// its normalizer key but still holding a storage value.
const masters = [
  [
    'samsung:galaxy-buds3-pro:64gb',
    'samsung-galaxy-buds3-pro',
    'earbuds',
    64,
    'published',
  ],
  [
    'apple:airpods-pro-3:standard',
    'apple-airpods-pro-3-usb-c',
    'earbuds',
    1,
    'published',
  ],
  ['sony:wf-1000xm5:64gb', 'sony-wf-1000xm5', 'earbuds', 64, 'draft'],
  ['sony:wf-1000xm6:standard', 'sony-wf-1000xm6', 'earbuds', 1, 'draft'],
  [
    'apple:airpods-pro-2-usbc:64gb',
    'apple-airpods-pro-2-usb-c',
    'earbuds',
    64,
    'draft',
  ],
  [
    'apple:watch-ultra-3-49mm:64gb',
    'apple-watch-ultra-3-49mm-64gb',
    'smartwatches',
    64,
    'draft',
  ],
  ['jbl:tune-beam:unknown', 'jbl-tune-beam', 'earbuds', 64, 'draft'],
];
const id = (i) => `a0000000-0000-4000-8000-00000000000${i + 1}`;
const listing = (i) => `b0000000-0000-4000-8000-00000000000${i + 1}`;

try {
  const { sql } = startRateDb({ name: container });
  const checkAll = (checks, when) => {
    for (const { id: v, query } of checks)
      assert.equal(sql(query), '0', `${v} after ${when}`);
  };

  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES
      ('c0000000-0000-4000-8000-000000000001', 'Tai nghe', 'earbuds'),
      ('c0000000-0000-4000-8000-000000000002', 'Đồng hồ', 'smartwatches');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('e0000000-0000-4000-8000-000000000001', 'shopee', 's1', 'Shop 1', 'shop-1');
    ${masters
      .map(
        ([key, slug, cat, storage, status], i) => `
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, storage_gb, status)
    SELECT '${id(i)}', split_part('${key}', ':', 1), split_part('${key}', ':', 2), '${key}', '${slug}', '${slug}',
           c.id, ${storage}, '${status}' FROM rate.categories c WHERE c.slug = '${cat}';
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES ('${listing(i)}', 'e0000000-0000-4000-8000-000000000001', 'shopee', 'l${i}', '${slug}', 5000000,
            'https://shopee.vn/l${i}', '${id(i)}');`
      )
      .join('\n')}
  `);
  assert.equal(
    sql(m0Checks[0].query),
    '6',
    'V1 sees the six drifted keys before M0'
  );

  sql(m0);
  sql(m0);
  checkAll(m0Checks, 'M0');
  // Ids, slugs and listings stay; the old key and storage are recorded for the rollback.
  assert.equal(
    sql(`SELECT model_key || '|' || slug || '|' || coalesce(storage_gb::text, '-') || '|' || (metadata ->> 'm0_rekeyed_from')
         FROM rate.master_products WHERE id = '${id(4)}'`),
    'apple:airpods-pro-2:unknown|apple-airpods-pro-2-usb-c|-|apple:airpods-pro-2-usbc:64gb'
  );
  assert.equal(
    sql(
      `SELECT model_key || '|' || storage_gb FROM rate.master_products WHERE id = '${id(5)}'`
    ),
    'apple:watch-ultra-3:64gb|64',
    'a watch keeps its storage'
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM rate.products p JOIN rate.master_products mp ON mp.id = p.cluster_id`
    ),
    String(masters.length)
  );

  // The intended order: M1+M2 after M0 creates the Items under the normalizer's Item keys.
  sql(items);
  checkAll(itemChecks, 'M0 then M1+M2');
  assert.equal(
    sql(`SELECT string_agg(item_key, ',' ORDER BY item_key) FROM rate.items`),
    [
      'apple:airpods-pro-2',
      'apple:airpods-pro-3',
      'apple:watch-ultra-3',
      'jbl:tune-beam',
      'samsung:galaxy-buds3-pro',
      'sony:wf-1000xm5',
      'sony:wf-1000xm6',
    ].join(',')
  );

  // Rollback order: M1+M2 first, then M0 (twice).
  sql(itemsRollback);
  sql(m0Rollback);
  sql(m0Rollback);
  assert.equal(
    sql(
      `SELECT string_agg(model_key || '=' || coalesce(storage_gb::text, '-'), ',' ORDER BY id) FROM rate.master_products`
    ),
    masters.map(([key, , , storage]) => `${key}=${storage}`).join(',')
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM rate.master_products WHERE metadata ? 'm0_rekeyed_from' OR metadata ? 'm0_storage_gb_before'`
    ),
    '0'
  );

  // A target key already taken by another master: that rename is skipped, never merged.
  sql(`INSERT INTO rate.master_products (brand, model, model_key, name, slug, status)
       VALUES ('apple', 'watch-ultra-3', 'apple:watch-ultra-3:64gb', 'Apple Watch Ultra 3', 'apple-watch-ultra-3', 'draft')`);
  sql(m0);
  assert.equal(
    sql(`SELECT model_key FROM rate.master_products WHERE id = '${id(5)}'`),
    'apple:watch-ultra-3-49mm:64gb'
  );
  assert.equal(
    sql(m0Checks[0].query),
    '1',
    'V1 reports the pair left for a manual merge'
  );

  console.log(
    `M0 seed re-key proposal passed: applied twice, ${m0Checks.length} checks, M1+M2 on top, both rollbacks, taken-key skip`
  );
} finally {
  removeContainer();
}
