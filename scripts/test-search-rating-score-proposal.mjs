#!/usr/bin/env node
// Replays the DOS-Me search rating PROPOSAL (DOS/Rate#1545) on the migration replay stack: P2
// (rating_score), then DOS/DOS.Me#1497's function (the proposal's rollback file is #1497's body),
// the verification showing the old order and filter disagree with the shown rating, the proposal
// twice, the new order, filter and grants, every verification query, the rollback twice and the
// proposal again. Nothing touches a real database.
//
// Usage: node scripts/test-search-rating-score-proposal.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const p2 = read('2026-10-31-dos-me-criteria-ratings.sql');
const proposal = read('2026-11-02-dos-me-search-rating-score.sql');
const rollback = read('2026-11-02-dos-me-search-rating-score-rollback.sql');
const verify = read('2026-11-02-dos-me-search-rating-score-verify.sql');

const container = `rate-search-rating-proposal-${process.pid}`;
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
    /^-- (V\d+) [^\n]*expect 0\n(?:--[^\n]*\n)*((?:SELECT|WITH)[\s\S]*?;)/gm
  ),
].map(([, id, query]) => ({ id, query }));
assert.deepEqual(
  checks.map((c) => c.id),
  ['V1', 'V2', 'V3', 'V4', 'V5'],
  'the verification lists its expect-0 queries'
);

const PHONES = 'c0000000-0000-4000-8000-000000000001';
// name: [rating_score, user_rating_weighted, average_rating, expert_rating, status]
const PRODUCTS = {
  a: ['4.814', '4.2', null, null, 'published'], // shown 4.814 (the stored score wins)
  b: [null, '4.9', '4.1', null, 'published'], // shown 4.9 (weighted)
  c: [null, '0', '9.0', '4.9', 'published'], // shown 4.5 (a 0-10 average)
  d: [null, null, null, '4.95', 'published'], // no shown rating: expert only
  e: ['4.6', '4.95', null, null, 'published'], // shown 4.6; the old order put it first
  f: ['0', '4.0', null, null, 'published'], // a zero score falls back: shown 4.0
  g: ['5', '5', '5', '5', 'draft'], // never listed
};
const id = (name) =>
  `a0000000-0000-4000-8000-0000000000${name.charCodeAt(0).toString(16)}`;
const nameOf = Object.fromEntries(
  Object.keys(PRODUCTS).map((name) => [id(name), name])
);

try {
  const { sql, asRole } = startRateDb({ name: container });
  const verifyResults = () =>
    Object.fromEntries(checks.map(({ id: v, query }) => [v, sql(query)]));
  const checkAll = (when) => {
    for (const [v, result] of Object.entries(verifyResults()))
      assert.equal(result, '0', `${v} ${when}`);
  };
  const listed = (args, role = 'anon') =>
    asRole(
      role,
      `SELECT string_agg(s.id::text, ',' ORDER BY s.ordinality)
       FROM rate.search_master_products(${args}) WITH ORDINALITY AS s`
    )
      .split('\n')
      .filter(Boolean)
      .join('')
      .split(',')
      .filter(Boolean)
      .map((x) => nameOf[x])
      .join('');

  sql(p2);
  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES ('${PHONES}', 'Điện thoại', 'smartphones');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      rating_score, user_rating_weighted, average_rating, expert_rating)
    VALUES ${Object.entries(PRODUCTS)
      .map(
        ([name, [score, weighted, average, expert, status]]) =>
          `('${id(name)}', 'Acme', 'P${name}', 'acme:p${name}', 'Acme P${name}', 'acme-p${name}',
            '${PHONES}', '${status}', ${score ?? 'NULL'}, ${weighted ?? 'NULL'},
            ${average ?? 'NULL'}, ${expert ?? 'NULL'})`
      )
      .join(',\n')};
  `);

  // DOS/DOS.Me#1497 first: the rollback file is its function, byte for byte.
  sql(rollback);
  const rowsOf = (sqlArgs) =>
    `p_sort => 'rating_desc', p_limit => 50${sqlArgs}`;
  assert.equal(
    listed(rowsOf('')),
    'cebafd',
    "#1497 orders by user_rating_weighted, then average_rating, unscaled (c's 9/10 first)"
  );
  assert.equal(
    listed(rowsOf(', p_min_rating => 4.9')),
    'cebd',
    "#1497's filter lets an expert-only product through"
  );
  const before = verifyResults();
  assert.equal(before.V1, '0', 'V1 holds for #1497');
  assert.equal(before.V3, '0', 'V3 holds for #1497');
  for (const v of ['V2', 'V4', 'V5'])
    assert.notEqual(before[v], '0', `${v} catches #1497's rating`);

  const checkProposal = (when) => {
    // 4.9, 4.814, 4.6, 4.5, 4.0, then the product with no shown rating.
    assert.equal(listed(rowsOf('')), 'baecfd', `rating order ${when}`);
    assert.equal(
      listed(rowsOf(''), 'authenticated'),
      'baecfd',
      `authenticated ${when}`
    );
    assert.equal(listed(rowsOf(''), 'service_role'), 'baecfd');
    assert.equal(
      listed(rowsOf(', p_min_rating => 4.6')),
      'bae',
      `minimum 4.6 ${when}`
    );
    assert.equal(
      listed(rowsOf(', p_min_rating => 4.5')),
      'baec',
      `minimum 4.5 keeps 4.5 ${when}`
    );
    assert.equal(
      listed(rowsOf(', p_min_rating => 4.95')),
      '',
      `an expert-only product has no shown rating ${when}`
    );
    // Other sorts and filters are #1497's.
    assert.equal(
      listed(`p_sort => 'default', p_limit => 50`).length,
      6,
      `the draft stays out ${when}`
    );
    assert.equal(listed(`p_search => 'Acme Pc'`), 'c', `search ${when}`);
    checkAll(when);
  };

  sql(proposal);
  sql(proposal);
  checkProposal('after the proposal (applied twice)');

  sql(rollback);
  sql(rollback);
  assert.equal(listed(rowsOf('')), 'cebafd', 'rollback restores #1497');
  assert.notEqual(verifyResults().V2, '0', 'V2 after the rollback');

  sql(proposal);
  checkProposal('after the proposal again');

  console.log(
    'search rating proposal: #1497, apply, order, filter, grants, verify and rollback replayed'
  );
} finally {
  removeContainer();
}
