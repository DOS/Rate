#!/usr/bin/env node
// Replays the DOS-Me criteria ratings PROPOSAL (DOS/Rate#1543, phase P2 of #1531) on the
// migration replay stack: a small catalog with criteria reviews, the proposal twice, the
// rating and criteria scores it computes, the refresh wrapper as the worker calls it, every
// verification query, the grants, the rollback twice, then the same on top of M0 and M1+M2
// (whose Item-aware refresh the wrapper must keep). Nothing touches a real database.
//
// Usage: node scripts/test-criteria-ratings-proposal.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const proposal = read('2026-10-31-dos-me-criteria-ratings.sql');
const rollback = read('2026-10-31-dos-me-criteria-ratings-rollback.sql');
const verify = read('2026-10-31-dos-me-criteria-ratings-verify.sql');
const m0 = read('2026-10-29-dos-me-m0-seed-rekey.sql');
const m1m2 = read('2026-10-28-dos-me-m1-m2-items.sql');

const container = `rate-criteria-proposal-${process.pid}`;
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
const checks = expectZero(verify);
assert.equal(checks.length, 6, 'the verification lists its expect-0 queries');

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const MERCHANT = 'e0000000-0000-4000-8000-000000000001';
const rated = 'a0000000-0000-4000-8000-000000000001';
const empty = 'a0000000-0000-4000-8000-000000000002';
const listing = 'b0000000-0000-4000-8000-000000000001';
const review = (n) => `d0000000-0000-4000-8000-00000000000${n}`;

try {
  const { sql, asRole } = startRateDb({ name: container });
  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} after ${when}`);
  };

  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES ('${PHONES}', 'Điện thoại', 'smartphones');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('${MERCHANT}', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      storage_gb, min_price, max_price)
    VALUES
      ('${rated}', 'Acme', 'Phone X', 'acme:phone-x:128gb', 'Acme Phone X 128GB',
       'acme-phone-x-128gb', '${PHONES}', 'published', 128, 10000000, 10000000),
      ('${empty}', 'Acme', 'Phone Y', 'acme:phone-y:128gb', 'Acme Phone Y 128GB',
       'acme-phone-y-128gb', '${PHONES}', 'published', 128, 9000000, 9000000);
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES ('${listing}', '${MERCHANT}', 'shopee', 'x1', 'Acme Phone X 128GB', 10000000,
            'https://shopee.vn/x1', '${rated}');
    -- Three criteria reviews (one with its exact 0.1 star), one excluded from the rating,
    -- one marketplace review with no criteria and weight 2.
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type, criteria_ratings)
    VALUES
      ('${review(1)}', '${listing}', 5, 'Màn hình đẹp, pin ổn.', 'user', '{"display": 5, "value": 4}'),
      ('${review(2)}', '${listing}', 4, 'Dùng tốt trong tầm giá.', 'user', '{"display": 4, "value": 4}'),
      ('${review(3)}', '${listing}', 3, 'Màn hơi tối ngoài nắng.', 'user', '{"display": 3}'),
      ('${review(4)}', '${listing}', 1, 'Giao sai màu.', 'user', '{"display": 1, "value": 1}'),
      ('${review(5)}', '${listing}', 5, 'Máy chạy mượt.', 'user', '{}');
    INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
    VALUES
      ('${review(1)}', 'authentic', true, 'replay', 'v1', 'h1'),
      ('${review(2)}', 'authentic', true, 'replay', 'v1', 'h2'),
      ('${review(3)}', 'authentic', true, 'replay', 'v1', 'h3'),
      ('${review(4)}', 'suspicious', false, 'replay', 'v1', 'h4'),
      ('${review(5)}', 'authentic', true, 'replay', 'v1', 'h5');
    UPDATE rate.reviews SET helpfulness_weight = 1
    WHERE id IN ('${review(1)}', '${review(2)}', '${review(3)}', '${review(4)}');
    UPDATE rate.reviews SET helpfulness_weight = 2 WHERE id = '${review(5)}';
    SELECT rate.refresh_master_product_rating('${rated}');
  `);

  const masterRow = (id) =>
    sql(
      `SELECT coalesce(rating_score::text, '-') || '|' || rating_weight_sum || '|' || criteria_scores::text
       FROM rate.master_products WHERE id = '${id}'`
    );
  // Weights 1 + 1 + 1 + 2 = 5 (review 4 is excluded); stars 5, 4.3 (exact), 3, 5.
  // (3 * 4.2 + 5 + 4.3 + 3 + 10) / (3 + 5) = 34.9 / 8 = 4.36.
  // display: 3 writers, weight 3: (12.6 + 5 + 4 + 3) / 6 = 4.10. value: 2 writers, hidden.
  const expected =
    '4.36|5.00|{"display": {"score": 4.10, "writers": 3, "weight_sum": 3.00}}';

  const applyAndCheck = (when) => {
    sql(proposal);
    sql(proposal);
    sql(`UPDATE rate.reviews SET rating_exact = 4.3 WHERE id = '${review(2)}'`);
    // The worker's usual call goes through the wrapper: the live body, then the extras.
    asRole(
      'rate_worker',
      `SELECT rate.refresh_master_product_rating('${rated}')`
    );
    assert.equal(masterRow(rated), expected, `rating and criteria ${when}`);
    assert.equal(
      masterRow(empty),
      '-|0.00|{}',
      `a master with no reviews ${when}`
    );
    assert.equal(
      sql(
        `SELECT user_rating_weighted FROM rate.master_products WHERE id = '${rated}'`
      ),
      '4.40',
      `the live body still fills user_rating_weighted ${when}`
    );
    checkAll(when);
    for (const fn of [
      `rate.refresh_master_rating_extras('${rated}')`,
      `rate.refresh_master_product_rating('${rated}')`,
      `rate.refresh_master_product_rating_base('${rated}')`,
    ])
      assert.throws(
        () => asRole('anon', `SELECT ${fn}`),
        /permission denied/,
        `anon ${fn}`
      );
    assert.equal(
      asRole('anon', `SELECT count(*) FROM rate.review_points`),
      '0',
      `anon reads review_points ${when}`
    );
    assert.throws(
      () =>
        asRole(
          'anon',
          `INSERT INTO rate.product_points (master_id, kind, label) VALUES ('${rated}', 'pro', 'Pin tốt')`
        ),
      /permission denied|row-level security/,
      `anon cannot write product_points ${when}`
    );
    asRole(
      'rate_worker',
      `INSERT INTO rate.product_points (master_id, kind, label, support, reviewer_count)
       VALUES ('${rated}', 'pro', 'Màn hình đẹp', 2, 2)`
    );
    assert.throws(
      () =>
        sql(
          `INSERT INTO rate.review_points (review_id, kind, body) VALUES ('${review(1)}', 'pro', 'ok')`
        ),
      /review_points_body_check/,
      `a pro line under 5 characters is refused ${when}`
    );
  };

  const rollBackAndCheck = (when) => {
    sql(rollback);
    sql(rollback);
    assert.equal(
      sql(`SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'rate' AND column_name IN ('rating_exact', 'rating_score', 'criteria_scores')`),
      '0',
      `columns dropped ${when}`
    );
    assert.equal(
      sql(`SELECT to_regclass('rate.review_points') IS NULL AND to_regclass('rate.product_points') IS NULL
                  AND to_regprocedure('rate.refresh_master_product_rating_base(uuid)') IS NULL`),
      't',
      `tables and the base name gone ${when}`
    );
    asRole(
      'rate_worker',
      `SELECT rate.refresh_master_product_rating('${rated}')`
    );
    assert.equal(
      sql(
        `SELECT user_rating_weighted FROM rate.master_products WHERE id = '${rated}'`
      ),
      '4.40',
      `the restored refresh still works ${when}`
    );
  };

  applyAndCheck('on the reference stack');
  rollBackAndCheck('on the reference stack');

  // The order JOY applies them in: M0, M1+M2 (an Item-aware refresh), then this proposal.
  sql(m0);
  sql(m1m2);
  applyAndCheck('after M0 and M1+M2');
  rollBackAndCheck('after M0 and M1+M2');
  // A full re-apply after a rollback.
  applyAndCheck('re-applied after a rollback');

  console.log('criteria ratings proposal: apply, verify and rollback replayed');
} finally {
  removeContainer();
}
