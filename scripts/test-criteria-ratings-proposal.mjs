#!/usr/bin/env node
// Replays the DOS-Me criteria ratings PROPOSAL (DOS/Rate#1543, phase P2 of #1531) on the
// migration replay stack: a small catalog with criteria reviews, the proposal twice, the rating
// and criteria scores its triggers keep current (review writes, a weight change, a flag that
// leaves the rating), every verification query, the grants, the rollback twice; then the
// proposal BEFORE M0 and M1+M2 (an Item pools its variants' reviews), the M1+M2 rollback under
// it, and the proposal applied again AFTER M1+M2. Nothing touches a real database.
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
const m1m2Rollback = read('2026-10-28-dos-me-m1-m2-items-rollback.sql');

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
const x128 = 'a0000000-0000-4000-8000-000000000128';
const x256 = 'a0000000-0000-4000-8000-000000000256';
const empty = 'a0000000-0000-4000-8000-0000000000ee';
const listing128 = 'b0000000-0000-4000-8000-000000000128';
const listing256 = 'b0000000-0000-4000-8000-000000000256';
const review = (n) => `d0000000-0000-4000-8000-00000000000${n}`;

try {
  const { sql, asRole } = startRateDb({ name: container });
  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} ${when}`);
  };
  const row = (id) =>
    sql(
      `SELECT coalesce(rating_score::text, '-') || '|' || rating_weight_sum || '|' || criteria_scores::text
       FROM rate.master_products WHERE id = '${id}'`
    );
  const weighted = (id) =>
    sql(
      `SELECT user_rating_weighted FROM rate.master_products WHERE id = '${id}'`
    );

  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES ('${PHONES}', 'Điện thoại', 'smartphones');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('${MERCHANT}', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      storage_gb, min_price, max_price)
    VALUES
      ('${x128}', 'Acme', 'Phone X', 'acme:phone-x:128gb', 'Acme Phone X 128GB',
       'acme-phone-x-128gb', '${PHONES}', 'published', 128, 10000000, 10000000),
      ('${x256}', 'Acme', 'Phone X', 'acme:phone-x:256gb', 'Acme Phone X 256GB',
       'acme-phone-x-256gb', '${PHONES}', 'published', 256, 12000000, 12000000),
      ('${empty}', 'Acme', 'Phone Y', 'acme:phone-y:128gb', 'Acme Phone Y 128GB',
       'acme-phone-y-128gb', '${PHONES}', 'published', 128, 9000000, 9000000);
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES
      ('${listing128}', '${MERCHANT}', 'shopee', 'x128', 'Acme Phone X 128GB', 10000000,
       'https://shopee.vn/x128', '${x128}'),
      ('${listing256}', '${MERCHANT}', 'shopee', 'x256', 'Acme Phone X 256GB', 12000000,
       'https://shopee.vn/x256', '${x256}');
    -- On the 128GB: three criteria reviews, one excluded from the rating, one marketplace
    -- review with no criteria and weight 2. On the 256GB: one criteria review.
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type, criteria_ratings)
    VALUES
      ('${review(1)}', '${listing128}', 5, 'Màn hình đẹp, pin ổn.', 'user',
       '{"display": 5, "value": 4, "Bad Key!": 5, "camera": "5"}'),
      ('${review(2)}', '${listing128}', 4, 'Dùng tốt trong tầm giá.', 'user', '{"display": 4, "value": 4}'),
      ('${review(3)}', '${listing128}', 3, 'Màn hơi tối ngoài nắng.', 'user', '{"display": 3}'),
      ('${review(4)}', '${listing128}', 1, 'Giao sai màu.', 'user', '{"display": 1, "value": 1}'),
      ('${review(5)}', '${listing128}', 5, 'Máy chạy mượt.', 'user', '{}'),
      ('${review(6)}', '${listing256}', 2, 'Màn ám vàng.', 'user', '{"display": 2}');
    INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
    VALUES
      ('${review(1)}', 'authentic', true, 'replay', 'v1', 'h1'),
      ('${review(2)}', 'authentic', true, 'replay', 'v1', 'h2'),
      ('${review(3)}', 'authentic', true, 'replay', 'v1', 'h3'),
      ('${review(4)}', 'suspicious', false, 'replay', 'v1', 'h4'),
      ('${review(5)}', 'authentic', true, 'replay', 'v1', 'h5'),
      ('${review(6)}', 'authentic', true, 'replay', 'v1', 'h6');
    UPDATE rate.reviews SET helpfulness_weight = 1 WHERE id <> '${review(5)}';
    UPDATE rate.reviews SET helpfulness_weight = 2 WHERE id = '${review(5)}';
    SELECT rate.refresh_master_product_rating('${x128}');
    SELECT rate.refresh_master_product_rating('${x256}');
  `);

  // Per master (no Items yet). 128GB: weights 1 + 1 + 1 + 2 = 5 (review 4 is excluded), stars
  // 5, 4.3 (exact), 3, 5: (3 * 4.2 + 22.3) / 8 = 4.36. display: 3 writers, weight 3:
  // (12.6 + 12) / 6 = 4.10. value has 2 writers (hidden); a bad key and a string star are not
  // criteria. 256GB: (12.6 + 2) / 4 = 3.65, one writer, no criteria.
  const per128 =
    '4.36|5.00|{"display": {"score": 4.10, "writers": 3, "weight_sum": 3.00}}';
  const per256 = '3.65|1.00|{}';

  const applyAndCheckPerMaster = (when) => {
    sql(proposal);
    sql(proposal);
    // A criteria review gets its exact star: the reviews trigger refreshes the master.
    asRole(
      'rate_worker',
      `UPDATE rate.reviews SET rating_exact = 4.3 WHERE id = '${review(2)}'`
    );
    assert.equal(row(x128), per128, `128GB ${when}`);
    assert.equal(row(x256), per256, `256GB ${when}`);
    assert.equal(row(empty), '-|0.00|{}', `a master with no reviews ${when}`);
    assert.equal(
      weighted(x128),
      '4.40',
      `user_rating_weighted untouched ${when}`
    );
    checkAll(`after applying ${when}`);

    // A flag that takes a review out of the rating refreshes it, and back.
    sql(
      `UPDATE rate.review_flags SET include_in_rating = false WHERE review_id = '${review(3)}'`
    );
    assert.equal(
      row(x128),
      '4.56|4.00|{}',
      `review 3 out of the rating ${when}`
    );
    sql(
      `UPDATE rate.review_flags SET include_in_rating = true WHERE review_id = '${review(3)}'`
    );
    assert.equal(row(x128), per128, `review 3 back ${when}`);

    for (const fn of [
      `rate.refresh_master_rating_extras('${x128}')`,
      `rate.master_rating_extras('${x128}')`,
    ]) {
      assert.throws(
        () => asRole('anon', `SELECT * FROM ${fn}`),
        /permission denied/,
        `anon ${fn}`
      );
      assert.throws(
        () => asRole('rate_worker', `SELECT * FROM ${fn}`),
        /permission denied/,
        `worker ${fn}`
      );
    }
    assert.equal(
      asRole('anon', 'SELECT count(*) FROM rate.review_points'),
      '0',
      `anon reads review_points ${when}`
    );
    for (const role of ['anon', 'authenticated', 'rate_worker'])
      assert.throws(
        () =>
          asRole(
            role,
            `INSERT INTO rate.review_points (review_id, kind, body) VALUES ('${review(1)}', 'pro', 'Pin trâu')`
          ),
        /permission denied|row-level security/,
        `${role} cannot write review_points ${when}`
      );
    assert.throws(
      () =>
        asRole(
          'anon',
          `INSERT INTO rate.product_points (master_id, kind, label) VALUES ('${x128}', 'pro', 'Pin tốt')`
        ),
      /permission denied|row-level security/,
      `anon cannot write product_points ${when}`
    );
    asRole(
      'rate_worker',
      `INSERT INTO rate.product_points (master_id, kind, label, support, reviewer_count)
       VALUES ('${x128}', 'pro', 'Màn hình đẹp', 2, 2)`
    );
    assert.throws(
      () =>
        sql(
          `INSERT INTO rate.review_points (review_id, kind, body) VALUES ('${review(1)}', 'pro', 'ok')`
        ),
      /review_points_body_check/,
      `a pro line under 5 characters is refused ${when}`
    );
    // A weight above 3 counts as 3: review 5 at weight 9 equals review 5 at weight 3.
    sql(
      `UPDATE rate.reviews SET helpfulness_weight = 9 WHERE id = '${review(5)}'`
    );
    const capped = row(x128);
    sql(
      `UPDATE rate.reviews SET helpfulness_weight = 3 WHERE id = '${review(5)}'`
    );
    assert.equal(row(x128), capped, `weight capped at 3 ${when}`);
    sql(
      `UPDATE rate.reviews SET helpfulness_weight = 2 WHERE id = '${review(5)}'`
    );
    assert.equal(row(x128), per128, `weight restored ${when}`);
  };

  const rollBackAndCheck = (when) => {
    sql(rollback);
    sql(rollback);
    assert.equal(
      sql(`SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'rate'
             AND column_name IN ('rating_exact', 'rating_score', 'criteria_scores')`),
      '0',
      `columns dropped ${when}`
    );
    assert.equal(
      sql(
        `SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_%rating_extras%'`
      ),
      '0',
      `triggers dropped ${when}`
    );
    assert.equal(
      sql(`SELECT to_regclass('rate.review_points') IS NULL AND to_regclass('rate.product_points') IS NULL
                  AND to_regprocedure('rate.refresh_master_rating_extras(uuid)') IS NULL`),
      't',
      `tables and functions dropped ${when}`
    );
    asRole(
      'rate_worker',
      `SELECT rate.refresh_master_product_rating('${x128}')`
    );
    sql(`INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type)
         VALUES ('d0000000-0000-4000-8000-0000000000ff', '${listing256}', 4, 'Ổn.', 'user');
         DELETE FROM rate.reviews WHERE id = 'd0000000-0000-4000-8000-0000000000ff';`);
  };

  // 1. On the reference stack.
  applyAndCheckPerMaster('on the reference stack');
  rollBackAndCheck('on the reference stack');

  // 2. The proposal first, then M0 and M1+M2: the two sizes become one Item, and both
  // variants show the Item's pooled rating. Weights 5 + 1 = 6, stars 22.3 + 2:
  // (12.6 + 24.3) / 9 = 4.10. display: 4 writers, weight 4: (12.6 + 14) / 7 = 3.80.
  applyAndCheckPerMaster('before M1+M2');
  sql(m0);
  sql(m1m2);
  const pooled =
    '4.10|6.00|{"display": {"score": 3.80, "writers": 4, "weight_sum": 4.00}}';
  assert.equal(
    sql(
      `SELECT count(DISTINCT item_id) FROM rate.master_products WHERE id IN ('${x128}', '${x256}')`
    ),
    '1',
    'the two sizes share one Item'
  );
  assert.equal(row(x128), pooled, '128GB shows the Item rating');
  assert.equal(row(x256), pooled, '256GB shows the Item rating');
  checkAll('after M1+M2 on top');
  // A vote's weight change on the Item path (refresh_item_rating, not the master refresh):
  // review 5 at weight 1: weights 5, stars 5 + 4.3 + 3 + 5 + 2 = 19.3, (12.6 + 19.3) / 8 = 3.99.
  sql(
    `UPDATE rate.reviews SET helpfulness_weight = 1 WHERE id = '${review(5)}'`
  );
  asRole('rate_worker', `SELECT rate.refresh_master_product_rating('${x256}')`);
  const pooledAfterVote =
    '3.99|5.00|{"display": {"score": 3.80, "writers": 4, "weight_sum": 4.00}}';
  assert.equal(row(x128), pooledAfterVote, '128GB after the vote');
  assert.equal(row(x256), pooledAfterVote, '256GB after the vote');
  checkAll('after a vote on the Item path');

  // 3. The M1+M2 rollback under the proposal: the triggers stay and the 128GB, whose review
  // changes, goes back to its own rating. The 256GB keeps the pooled values until something
  // touches it: V6 shows it, and the runbook's step after an M1+M2 rollback (the backfill of
  // section 8 again) brings it back.
  sql(m1m2Rollback);
  sql(
    `UPDATE rate.reviews SET helpfulness_weight = 2 WHERE id = '${review(5)}'`
  );
  assert.equal(row(x128), per128, '128GB after the M1+M2 rollback');
  const stale = checks.find(({ id }) => id === 'V6');
  assert.equal(sql(stale.query), '1', 'V6 shows the 256GB as out of date');
  const backfill = proposal.slice(proposal.lastIndexOf('BEGIN;'));
  assert.match(backfill, /refresh_master_rating_extras/, 'the backfill step');
  sql(backfill);
  assert.equal(row(x256), per256, '256GB after the M1+M2 rollback');
  checkAll('after the M1+M2 rollback');

  // 4. M1+M2 again, then the proposal applied (again) after it: same pooled values.
  sql(m1m2);
  sql(proposal);
  assert.equal(row(x128), pooled, '128GB, proposal after M1+M2');
  assert.equal(row(x256), pooled, '256GB, proposal after M1+M2');
  checkAll('with the proposal applied after M1+M2');
  rollBackAndCheck('after M1+M2');

  console.log(
    'criteria ratings proposal: apply, triggers, Items, verify and rollback replayed'
  );
} finally {
  removeContainer();
}
