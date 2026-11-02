#!/usr/bin/env node
// Replays the DOS-Me review value PROPOSAL (DOS/Rate#1547, phase P6 of #1531) on the migration
// replay stack (P2 and P3 included): a master with crawled and community reviews, the proposal
// twice with no rating change, the factor equal to the shared module's for every completeness,
// values from the shared module stored as rate_worker and the rating they lift, the writer's
// refusals and grants, every verification query, the rollback twice (the lift is gone) and the
// proposal again. Nothing touches a real database.
//
// Usage: pnpm --filter @repo/shared-data build && node scripts/test-review-value-proposal.mjs
// (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const rules = await import(
  pathToFileURL(
    path.join(repoRoot, 'packages', 'shared-data', 'dist', 'rules', 'index.js')
  ).href
);
const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const proposal = read('2026-11-02-dos-me-review-value-score.sql');
const rollback = read('2026-11-02-dos-me-review-value-score-rollback.sql');
const verify = read('2026-11-02-dos-me-review-value-score-verify.sql');

const container = `rate-review-value-proposal-${process.pid}`;
const removeContainer = () =>
  spawnSync('docker', ['rm', '--force', container], { timeout: 30_000 });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    removeContainer();
    process.exit(130);
  });
}

const checks = [
  ...verify.matchAll(
    /^-- (V\d+) [^\n]*(?:\n--[^\n]*)*expect 0\n((?:SELECT|WITH)[\s\S]*?;)/gm
  ),
].map(([, id, query]) => ({ id, query }));
assert.deepEqual(
  checks.map((c) => c.id),
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'],
  'the verification lists its expect-0 queries'
);

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const MERCHANT = 'e0000000-0000-4000-8000-000000000001';
const MASTER = 'a0000000-0000-4000-8000-000000000001';
const LISTING = 'b0000000-0000-4000-8000-000000000001';
const review = (n) => `d0000000-0000-4000-8000-00000000000${n}`;
// review: [star, helpfulness_weight, community]
const REVIEWS = {
  1: [5, 1, false],
  2: [4, 1, false],
  3: [2, 1, false],
  4: [4, 2.8, false],
  5: [3, 1, true],
};

const phone = rules.getRatingCriteria('smartphones');
const allRated = Object.fromEntries(phone.map((c) => [c.key, 4]));
const general = [
  { kind: 'pro', criterionKey: null, body: 'Pin dùng cả ngày' },
  { kind: 'con', criterionKey: null, body: 'Sạc hơi chậm' },
];
const base = {
  categorySlug: 'smartphones',
  gated: false,
  depth: 'detailed',
  criteriaRatings: allRated,
  verdict: 'Máy mượt, pin dùng hết ngày, đáng tiền trong tầm giá.',
  points: general,
  hasRealPhoto: false,
  verifiedPurchase: false,
  helpfulVotes: 0,
  unhelpfulVotes: 0,
  authorTrust: null,
};
// Review 1 complete (35), 4 complete (35, its weight hits the cap), 5 a standard Rate review
// (25), 2 an imported review with a photo (5, but weight 0), 3 gated.
const values = {
  1: rules.reviewValue({
    ...base,
    hasRealPhoto: true,
    points: [
      ...general,
      { kind: 'pro', criterionKey: 'camera', body: 'Chụp đêm rõ nét' },
      { kind: 'con', criterionKey: 'display', body: 'Màn hơi tối ngoài nắng' },
    ],
  }),
  2: rules.reviewValue({
    ...base,
    criteriaRatings: null,
    verdict: null,
    points: [],
    depth: 'specific_short',
    verifiedPurchase: true,
    helpfulVotes: 3,
    hasRealPhoto: true,
  }),
  3: rules.reviewValue({ ...base, gated: true }),
  5: rules.reviewValue(base),
};
values[4] = values[1];
assert.equal(values[1].completeness, 35);
assert.equal(values[5].completeness, 25);
assert.equal(values[2].completeness, 5, 'a photo');
assert.equal(values[2].weightCompleteness, 0, 'no pros and cons: no lift');
const payload = (ids) =>
  JSON.stringify(
    ids.map((n) => ({
      id: review(n),
      score: values[n].score,
      breakdown: values[n],
    }))
  );

// The rating as master_rating_extras computes it, from the shared module's factor.
const expectedScore = (lifted) => {
  let sum = 0;
  let weights = 0;
  for (const [n, [star, weight]] of Object.entries(REVIEWS)) {
    const factor = lifted
      ? rules.completenessWeightFactor(values[n]?.weightCompleteness)
      : 1;
    const w = Math.min(3, weight * factor);
    sum += w * star;
    weights += w;
  }
  return ((3 * 4.2 + sum) / (3 + weights)).toFixed(3);
};

try {
  const { sql, asRole } = startRateDb({ name: container });
  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} ${when}`);
  };
  const score = () =>
    sql(`SELECT rating_score FROM rate.master_products WHERE id = '${MASTER}'`);
  const stored = () =>
    sql(`SELECT count(*) FROM rate.reviews WHERE value_breakdown IS NOT NULL`);
  const store = (json, role = 'rate_worker') =>
    asRole(role, `SELECT rate.store_review_values($v$${json}$v$::jsonb)`);

  const rows = Object.entries(REVIEWS)
    .map(
      ([n, [star, , community]]) =>
        `('${review(n)}', '${LISTING}', ${star}, 'Máy dùng ổn định, pin tốt.', 'user', ` +
        `${community ? `'rate_comm_${n}'` : 'NULL'})`
    )
    .join(',\n');
  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES ('${PHONES}', 'Điện thoại', 'smartphones');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('${MERCHANT}', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      storage_gb, min_price, max_price)
    VALUES ('${MASTER}', 'Acme', 'Phone X', 'acme:phone-x:128gb', 'Acme Phone X 128GB',
            'acme-phone-x-128gb', '${PHONES}', 'published', 128, 10000000, 10000000);
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES ('${LISTING}', '${MERCHANT}', 'shopee', 'x128', 'Acme Phone X 128GB', 10000000,
            'https://shopee.vn/x128', '${MASTER}');
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type, platform_review_id)
    VALUES ${rows};
    INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
    SELECT id, 'authentic', true, 'replay', 'v1', id::text FROM rate.reviews;
    ${Object.entries(REVIEWS)
      .map(
        ([n, [, weight]]) =>
          `UPDATE rate.reviews SET helpfulness_weight = ${weight} WHERE id = '${review(n)}';`
      )
      .join('\n')}
  `);
  assert.equal(
    sql(`SELECT count(*) FROM rate.reviews WHERE origin = 'community'`),
    '1'
  );
  const before = score();
  assert.equal(before, expectedScore(false), 'P2 rates the master');

  // Applied twice: no stored rating changes, every check passes.
  sql(proposal);
  sql(proposal);
  assert.equal(score(), before, 'applying moves no rating');
  checkAll('after the proposal');

  // The factor equals the shared module's for every completeness and for junk.
  const samples = [
    ...Array.from({ length: 36 }, (_, c) => [
      `{"weightCompleteness": ${c}}`,
      c,
    ]),
    ['{"weightCompleteness": 35.5}', 35.5],
    ['{"weightCompleteness": -1}', -1],
    ['{"weightCompleteness": 1e9}', 1e9],
    ['{"weightCompleteness": "35"}', '35'],
    ['{"weightCompleteness": null}', null],
    ['{}', undefined],
    ['[35]', undefined],
  ];
  for (const [json, completeness] of samples)
    assert.equal(
      Number(sql(`SELECT rate.review_completeness_factor('${json}'::jsonb)`)),
      rules.completenessWeightFactor(completeness),
      `factor of ${json}`
    );
  assert.equal(Number(sql(`SELECT rate.review_completeness_factor(NULL)`)), 1);

  // The writer accepts every output of the module over a grid of its inputs (each completeness
  // item on or off, every depth, gated, verified, votes, trust), so a module change the SQL
  // does not follow fails here, not in production. Reviews that do not exist are only checked.
  const grid = [];
  const extraLines = [
    { kind: 'pro', criterionKey: 'camera', body: 'Chụp đêm rõ nét' },
    { kind: 'con', criterionKey: 'display', body: 'Màn hơi tối ngoài nắng' },
  ];
  for (const depth of Object.keys(rules.REVIEW_SPECIFICITY_POINTS))
    for (let bits = 0; bits < 64; bits += 1)
      grid.push(
        rules.reviewValue({
          ...base,
          depth,
          criteriaRatings: bits & 1 ? allRated : {},
          verdict: bits & 2 ? base.verdict : null,
          points: [
            ...(bits & 4 ? general : []),
            ...(bits & 8 ? extraLines : []),
          ],
          hasRealPhoto: Boolean(bits & 16),
          verifiedPurchase: Boolean(bits & 32),
          gated: depth === 'detailed' && bits % 7 === 0,
          helpfulVotes: bits % 9,
          unhelpfulVotes: bits % 4,
          authorTrust: bits % 5 === 0 ? null : (bits % 11) / 10,
        })
      );
  assert.ok(grid.some((v) => v.weightCompleteness < v.completeness));
  assert.ok(new Set(grid.map((v) => v.tier)).size === 4, 'every tier and null');
  for (let i = 0; i < grid.length; i += 400)
    assert.equal(
      store(
        JSON.stringify(
          grid.slice(i, i + 400).map((v, j) => ({
            id: `f0000000-0000-4000-8000-${String(i + j).padStart(12, '0')}`,
            score: v.score,
            breakdown: v,
          }))
        )
      ),
      '0',
      'grid rows are accepted (and no such review exists)'
    );

  // Stored as rate_worker, community review included: the rating lifts as the module says.
  assert.equal(store(payload([1, 2, 3, 4, 5])), '5');
  assert.equal(stored(), '5');
  const lifted = score();
  assert.equal(lifted, expectedScore(true), 'the lifted rating');
  assert.notEqual(lifted, before);
  assert.equal(
    sql(
      `SELECT rating_weight_sum FROM rate.master_products WHERE id = '${MASTER}'`
    ),
    // 1.25 + 1 + 1 + 3 (2.8 x 1.25 capped) + 1.1786
    '7.43'
  );
  assert.equal(
    sql(`SELECT value_score FROM rate.reviews WHERE id = '${review(1)}'`),
    values[1].score.toFixed(2)
  );
  // The same values again change nothing; a new score with the same completeness refreshes
  // nothing either (the rating stays).
  assert.equal(store(payload([1, 2, 3, 4, 5])), '0');
  const rescored = { ...values[5], helpful: 4.1, score: values[5].score + 4.1 };
  assert.equal(
    store(
      JSON.stringify([
        { id: review(5), score: rescored.score, breakdown: rescored },
      ])
    ),
    '1'
  );
  assert.equal(score(), lifted);
  assert.equal(store(payload([5])), '1');
  checkAll('after storing values');

  // Refusals: nothing is written by a call with one bad row.
  const refuse = (json, pattern, role = 'rate_worker') =>
    assert.throws(() => store(json, role), pattern);
  const good = { id: review(2), score: values[2].score, breakdown: values[2] };
  const bad = (change) =>
    JSON.stringify([
      good,
      {
        ...good,
        ...change,
        breakdown: { ...good.breakdown, ...change.breakdown },
      },
    ]);
  sql(
    `UPDATE rate.reviews SET value_score = NULL, value_breakdown = NULL WHERE id = '${review(2)}'`
  );
  refuse('{"id": 1}', /p_values must be a JSON array/);
  refuse(
    JSON.stringify(Array.from({ length: 1001 }, () => good)),
    /at most 1000 rows/
  );
  refuse(bad({ id: 'not-a-uuid' }), /row 1 is not a review value/);
  refuse(bad({ breakdown: { version: 2 } }), /row 1 is not a review value/);
  refuse(
    bad({ breakdown: { completeness: '35' } }),
    /row 1 is not a review value/
  );
  refuse(
    bad({ breakdown: { completeness: 7 } }),
    /row 1 has values out of range/
  );
  refuse(
    bad({ breakdown: { completeness: 40 } }),
    /row 1 has values out of range/
  );
  refuse(bad({ score: 99 }), /row 1 has values out of range/);
  refuse(bad({ breakdown: { gated: true } }), /row 1 has values out of range/);
  refuse(
    bad({
      score: 101,
      breakdown: { score: 101, trust: 10 + 101 - values[2].score },
    }),
    /row 1 has values out of range/
  );
  // Only a shape the module could produce: its keys, its tier, its gaps, its parts.
  const shape = /row 1 is not a review value/;
  const range = /row 1 has values out of range/;
  refuse(bad({ breakdown: { note: 'x' } }), shape);
  refuse(bad({ breakdown: { gated: 'true' } }), shape);
  refuse(bad({ breakdown: { gaps: 'photo' } }), shape);
  refuse(bad({ breakdown: { gaps: [1] } }), shape);
  refuse(bad({ score: '20' }), shape);
  refuse('[1]', /row 0 is not a review value/);
  const noTier = { ...good.breakdown };
  delete noTier.tier;
  refuse(JSON.stringify([good, { ...good, breakdown: noTier }]), shape);
  refuse(bad({ breakdown: { tier: 'excellent' } }), range);
  refuse(bad({ breakdown: { gaps: ['photo', 'photo'] } }), range);
  refuse(bad({ breakdown: { gaps: ['bribe'] } }), range);
  refuse(bad({ breakdown: { verified: 7 } }), range);
  refuse(bad({ breakdown: { helpful: -1 } }), range);
  // Specificity 13 is no depth's points (keep the sum right so only the part fails).
  refuse(
    bad({
      score: values[2].score + 1,
      breakdown: { score: values[2].score + 1, specificity: 13 },
    }),
    range
  );
  // A photo's 5 off the weight needs a photo and no pros and cons, and never 10.
  refuse(bad({ breakdown: { weightCompleteness: -5 } }), range);
  // ...and a photo without pros and cons must take its 5 off.
  refuse(bad({ breakdown: { weightCompleteness: 5 } }), range);
  refuse(
    JSON.stringify([
      {
        ...good,
        breakdown: { ...values[1], weightCompleteness: 30 },
        id: review(1),
        score: values[1].score,
      },
    ]),
    /row 0 has values out of range/
  );
  refuse(
    JSON.stringify(
      Array.from({ length: 900 }, () => ({ ...good, pad: 'x'.repeat(3000) }))
    ),
    /at most 1000 rows and 2 MB/
  );
  // rate_worker writing a crawled review's columns directly meets the CHECKs: no full factor
  // without the completeness behind it.
  assert.throws(
    () =>
      asRole(
        'rate_worker',
        `UPDATE rate.reviews SET value_breakdown = '{"completeness": 0, "weightCompleteness": 35}'
         WHERE id = '${review(2)}'`
      ),
    /reviews_value_breakdown_completeness/
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM rate.reviews WHERE id = '${review(2)}' AND value_breakdown IS NULL`
    ),
    '1',
    'a refused call writes nothing'
  );
  for (const role of ['anon', 'authenticated'])
    refuse(
      payload([2]),
      /permission denied for function store_review_values/,
      role
    );
  // The CHECKs hold against a direct write (service_role bypasses RLS, not CHECKs).
  assert.throws(
    () =>
      sql(
        `UPDATE rate.reviews SET value_breakdown = '{"weightCompleteness": 12}' WHERE id = '${review(2)}'`
      ),
    /reviews_value_breakdown_completeness/
  );
  assert.throws(
    () =>
      sql(
        `UPDATE rate.reviews SET value_breakdown = '[]' WHERE id = '${review(2)}'`
      ),
    /reviews_value_breakdown_object/
  );
  // A review listed twice: the last row wins; an unknown review is skipped.
  assert.equal(
    store(
      JSON.stringify([
        { id: review(2), score: values[5].score, breakdown: values[5] },
        good,
        { ...good, id: 'd0000000-0000-4000-8000-0000000000ff' },
      ])
    ),
    '1'
  );
  assert.equal(
    sql(
      `SELECT value_breakdown ->> 'completeness' FROM rate.reviews WHERE id = '${review(2)}'`
    ),
    '5',
    'the last row, not the first'
  );
  assert.equal(score(), lifted);
  checkAll('after the refusals');

  // Rollback twice: the lift is gone, the values stay, the functions and CHECKs go.
  sql(rollback);
  sql(rollback);
  assert.equal(score(), before, 'the rollback removes the lift');
  assert.equal(stored(), '5', 'the rollback keeps the stored values');
  assert.equal(
    sql(
      `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'rate' AND p.proname IN ('store_review_values', 'review_completeness_factor')`
    ),
    '0'
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM pg_constraint WHERE conname LIKE 'reviews_value_breakdown_%'`
    ),
    '0'
  );
  // P2's rating still works: a weight change refreshes the master.
  sql(
    `UPDATE rate.reviews SET helpfulness_weight = 1 WHERE id = '${review(4)}'`
  );
  REVIEWS[4][1] = 1;
  assert.equal(score(), expectedScore(false));

  // Applied again over kept values: its last section lifts their masters again.
  sql(proposal);
  assert.equal(score(), expectedScore(true));
  checkAll('after the re-apply');

  console.log(
    'review value proposal: shared-module parity, values stored and refused, rating lift, verify and rollback replayed'
  );
} finally {
  removeContainer();
}
