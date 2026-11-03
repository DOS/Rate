#!/usr/bin/env node
// Replays the DOS-Me review AI points PROPOSAL (DOS/Rate#1531, D6 of
// Docs/Proposals/2026-11-03-ai-review-points.html) on the migration replay stack: the proposal
// twice, the text hash equal to the job's (NFC, sha256), 'ai' lines and markers stored as
// rate_worker, the skips (missing, writer, stale), the failed retries, the refusals, the grants,
// the purge, every verification query, the rollback twice and the proposal again. Nothing
// touches a real database.
//
// Usage: node scripts/test-review-ai-points-proposal.mjs (needs Docker)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const proposal = read('2026-11-03-dos-me-review-ai-points.sql');
const rollback = read('2026-11-03-dos-me-review-ai-points-rollback.sql');
const verify = read('2026-11-03-dos-me-review-ai-points-verify.sql');

const container = `rate-review-ai-points-proposal-${process.pid}`;
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
const info = verify.match(/^-- V8 [^\n]*\n((?:SELECT|WITH)[\s\S]*?;)/m)?.[1];
assert.ok(info, 'V8 is there');

// The job's hash (apps/importer review-ai-points).
const jobHash = (text) =>
  createHash('sha256').update(text.normalize('NFC'), 'utf8').digest('hex');

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const LAPTOPS = 'c0000000-0000-4000-8000-000000000002';
const MERCHANT = 'e0000000-0000-4000-8000-000000000001';
const MASTER = 'a0000000-0000-4000-8000-000000000001';
const LAPTOP = 'a0000000-0000-4000-8000-000000000002';
const LISTING = 'b0000000-0000-4000-8000-000000000001';
const LAPTOP_LISTING = 'b0000000-0000-4000-8000-000000000002';
const review = (n) => `d0000000-0000-4000-8000-00000000000${n}`;
// Decomposed diacritics on purpose: the hash must normalize them.
const COMMENT =
  'Pin xài cả ngày vẫn còn, ra nắng hơi khó nhìn. Camera chụp đêm ổn.'.normalize(
    'NFD'
  );
// review: [comment, listing, reviewer_type, platform_review_id]
const REVIEWS = {
  1: [COMMENT, LISTING, 'user', 'p1'],
  2: ['Máy chạy mượt, chơi game không nóng lắm.', LISTING, 'user', 'p2'],
  3: [
    'Đánh giá viết trên Rate, có ưu nhược riêng.',
    LISTING,
    'user',
    'rate_comm_3',
  ],
  4: ['Bài đánh giá chuyên gia về máy này.', LISTING, 'expert', 'p4'],
  5: ['Bàn phím gõ êm, màn hình hơi tối.', LAPTOP_LISTING, 'user', 'p5'],
  6: [
    'Loa to rõ, sạc nhanh, giá hợp lý so với cấu hình.',
    LISTING,
    'user',
    'p6',
  ],
};

const line = (kind, criterion_key, body, evidence, match = 'exact') => ({
  kind,
  criterion_key,
  body,
  evidence,
  match,
});
const row = (n, points, extra = {}) => ({
  id: review(n),
  text_hash: jobHash(REVIEWS[n][0]),
  prompt_version: 'p1',
  criteria_version: 1,
  category: 'smartphones',
  model: 'claude-haiku-5-5',
  batch_id: null,
  failed: false,
  points,
  ...extra,
});
const POINTS_1 = [
  line('pro', 'battery', 'Pin dùng hết ngày', 'pin xài cả ngày vẫn còn'),
  line(
    'con',
    'display',
    'Màn hình khó nhìn ngoài nắng',
    'ra nắng hơi khó nhìn'
  ),
  line('pro', 'camera', 'Chụp đêm ổn', 'Camera chụp đêm ổn', 'unaccented'),
];

try {
  const { sql, asRole } = startRateDb({ name: container });
  // Once DOS/Rate mirrors the migration, the reference stack has it: roll it back first.
  if (
    sql(`SELECT to_regclass('rate.review_ai_extractions') IS NOT NULL`) === 't'
  )
    sql(rollback);

  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} ${when}`);
  };
  const store = (rows, role = 'rate_worker') =>
    JSON.parse(
      asRole(
        role,
        `SELECT rate.store_review_ai_points($v$${JSON.stringify(rows)}$v$::jsonb)`
      )
    );
  const lines = (n) =>
    sql(
      `SELECT coalesce(string_agg(kind || ':' || coalesce(criterion_key, '-') || ':' || position || ':' || body, '|'
                         ORDER BY kind DESC, position), '')
       FROM rate.review_points WHERE review_id = '${review(n)}' AND method = 'ai'`
    );
  const marker = (n) =>
    sql(
      `SELECT coalesce((SELECT outcome || ',' || point_count || ',' || rejected_count || ',' || attempts
                        || ',' || prompt_version || ',' || coalesce(lines_prompt_version, '-')
                        || ',' || coalesce(batch_id, '-')
                        FROM rate.review_ai_extractions WHERE review_id = '${review(n)}'), 'none')`
    );
  const counts = (over) => ({
    stored: 0,
    empty: 0,
    rejected: 0,
    failed: 0,
    missing: 0,
    not_crawl: 0,
    writer: 0,
    stale: 0,
    unquoted: 0,
    done: 0,
    exhausted: 0,
    ...over,
  });

  const reviewRows = Object.entries(REVIEWS)
    .map(
      ([n, [comment, listing, type, platformId]]) =>
        `('${review(n)}', '${listing}', 4, $c$${comment}$c$, '${type}', '${platformId}')`
    )
    .join(',\n');
  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES
      ('${PHONES}', 'Điện thoại', 'smartphones'), ('${LAPTOPS}', 'Laptop', 'laptops');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('${MERCHANT}', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status,
                                      storage_gb, min_price, max_price)
    VALUES ('${MASTER}', 'Acme', 'Phone X', 'acme:phone-x:128gb', 'Acme Phone X 128GB',
            'acme-phone-x-128gb', '${PHONES}', 'published', 128, 10000000, 10000000),
           ('${LAPTOP}', 'Acme', 'Book 14', 'acme:book-14', 'Acme Book 14',
            'acme-book-14', '${LAPTOPS}', 'published', NULL, 20000000, 20000000);
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES ('${LISTING}', '${MERCHANT}', 'shopee', 'x128', 'Acme Phone X 128GB', 10000000,
            'https://shopee.vn/x128', '${MASTER}'),
           ('${LAPTOP_LISTING}', '${MERCHANT}', 'shopee', 'b14', 'Acme Book 14', 20000000,
            'https://shopee.vn/b14', '${LAPTOP}');
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type, platform_review_id)
    VALUES ${reviewRows};
    INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
    VALUES ('${review(2)}', NULL, 'pro', 'Máy chạy mượt', 0, 'writer');
  `);
  assert.equal(
    sql(`SELECT string_agg(origin, ',' ORDER BY id) FROM rate.reviews`),
    'crawl,crawl,community,crawl,crawl,crawl'
  );
  const ratingBefore = sql(
    `SELECT coalesce(rating_score::text, '-') || ',' || coalesce(rating_weight_sum::text, '-')
     FROM rate.master_products WHERE id = '${MASTER}'`
  );

  // Applied twice; nothing reads 'ai' lines, so no rating moves.
  sql(proposal);
  sql(proposal);
  checkAll('after the proposal');

  // The hash equals the job's, for decomposed and composed text, emoji and the empty string.
  for (const text of [
    COMMENT,
    COMMENT.normalize('NFC'),
    '',
    'Máy đẹp 😍👍 giao nhanh',
    'é ế',
  ])
    assert.equal(
      sql(`SELECT rate.review_ai_text_hash($t$${text}$t$)`),
      jobHash(text),
      `hash of ${JSON.stringify(text)}`
    );
  assert.equal(
    sql(
      `SELECT rate.review_ai_text_hash(comment) FROM rate.reviews WHERE id = '${review(1)}'`
    ),
    jobHash(COMMENT.normalize('NFC'))
  );

  // A batch row as the job writes it, as rate_worker.
  asRole(
    'rate_worker',
    `INSERT INTO rate.review_ai_batches (id, model, prompt_version, request_count, review_count,
                                         manifest, reserved_usd)
     VALUES ('msgbatch_replay01', 'claude-haiku-5-5', 'p1', 1, 3,
             '[{"custom_id": "r0", "category": "smartphones", "criteria_version": 1, "reviews": []}]', 0.05)`
  );

  // Stored as rate_worker: lines, positions per kind, the marker and its evidence.
  assert.deepEqual(
    store([
      row(1, POINTS_1, { batch_id: 'msgbatch_replay01', rejected: 1 }),
      row(6, []),
      row(6, [], { rejected: 2 }),
    ]),
    counts({ stored: 1, rejected: 1 }),
    'the last row of a review wins'
  );
  assert.equal(
    lines(1),
    'pro:battery:0:Pin dùng hết ngày|pro:camera:1:Chụp đêm ổn|con:display:0:Màn hình khó nhìn ngoài nắng'
  );
  assert.equal(marker(1), 'stored,3,1,1,p1,p1,msgbatch_replay01');
  assert.equal(marker(6), 'rejected,0,2,1,p1,-,-');
  assert.equal(
    sql(
      `SELECT string_agg((e ->> 'position') || ':' || (e ->> 'match') || ':' || (e ->> 'evidence'), '|' ORDER BY o)
       FROM rate.review_ai_extractions x, jsonb_array_elements(x.evidence) WITH ORDINALITY AS t(e, o)
       WHERE x.review_id = '${review(1)}'`
    ),
    '0:exact:pin xài cả ngày vẫn còn|0:exact:ra nắng hơi khó nhìn|1:unaccented:Camera chụp đêm ổn'
  );
  checkAll('after storing');

  // Stored again with fewer lines: replaced, not added. Empty: lines gone, marker empty.
  assert.deepEqual(
    store([row(1, POINTS_1.slice(0, 1), { prompt_version: 'p2' })]),
    counts({ stored: 1 })
  );
  assert.equal(lines(1), 'pro:battery:0:Pin dùng hết ngày');
  assert.equal(marker(1), 'stored,1,0,1,p2,p2,-');
  checkAll('after a re-store');

  // Skips: a missing review, a community and an expert review, a review with a writer line, a
  // changed comment, an exact quote not in the comment; another category is stored.
  assert.deepEqual(
    store([
      { ...row(1, POINTS_1), id: 'd0000000-0000-4000-8000-0000000000ff' },
      row(3, []),
      row(4, []),
      row(2, POINTS_1.slice(0, 1)),
      row(6, POINTS_1.slice(0, 1), { text_hash: jobHash('another text') }),
      row(5, [line('pro', 'keyboard', 'Bàn phím gõ êm', 'Bàn phím gõ êm')], {
        category: 'laptops',
      }),
    ]),
    counts({ missing: 1, not_crawl: 2, writer: 1, stale: 1, stored: 1 })
  );
  assert.equal(lines(2), '', 'writer lines are never mixed with ai lines');
  assert.equal(marker(2), 'none');
  assert.equal(marker(3), 'none');
  assert.equal(
    marker(6),
    'rejected,0,2,1,p1,-,-',
    'a stale row changes nothing'
  );
  assert.equal(lines(5), 'pro:keyboard:0:Bàn phím gõ êm');
  // A made-up quote marked exact is not stored; an unaccented one is the job's to check.
  assert.deepEqual(
    store([row(6, [line('pro', null, 'Loa nghe rất to', 'loa nghe to lắm')])]),
    counts({ unquoted: 1 })
  );
  assert.equal(marker(6), 'rejected,0,2,1,p1,-,-');
  // The laptop listing moves to the phone master: the laptop row is now stale, and V5 still
  // reads the keys against the category the marker was processed with.
  sql(
    `UPDATE rate.products SET cluster_id = '${MASTER}' WHERE id = '${LAPTOP_LISTING}'`
  );
  assert.deepEqual(
    store([row(5, [], { category: 'laptops' })]),
    counts({ stale: 1 })
  );
  checkAll('after a category move');
  sql(
    `UPDATE rate.products SET cluster_id = '${LAPTOP}' WHERE id = '${LAPTOP_LISTING}'`
  );

  // Failed: a late failure never replaces a result of the same key; under a new key it counts
  // attempts and keeps the lines with the version that wrote them; a fourth attempt is refused.
  assert.deepEqual(
    store([row(1, [], { prompt_version: 'p2', failed: true })]),
    counts({ done: 1 })
  );
  assert.equal(marker(1), 'stored,1,0,1,p2,p2,-');
  assert.deepEqual(
    store([row(1, [], { prompt_version: 'p3', failed: true })]),
    counts({ failed: 1 })
  );
  assert.equal(marker(1), 'failed,1,0,1,p3,p2,-');
  store([row(1, [], { prompt_version: 'p3', failed: true })]);
  store([row(1, [], { prompt_version: 'p3', failed: true })]);
  assert.equal(marker(1), 'failed,1,0,3,p3,p2,-');
  assert.deepEqual(
    store([row(1, [], { prompt_version: 'p3', failed: true })]),
    counts({ exhausted: 1 })
  );
  assert.equal(marker(1), 'failed,1,0,3,p3,p2,-');
  assert.equal(
    lines(1),
    'pro:battery:0:Pin dùng hết ngày',
    'a failure keeps the lines'
  );
  checkAll('after failures');
  // Purging p2 removes the p2 lines kept under the p3 failure, with their marker.
  assert.deepEqual(
    JSON.parse(
      asRole('rate_worker', `SELECT rate.purge_review_ai_points('p2')`)
    ),
    { lines: 1, markers: 1 }
  );
  assert.equal(lines(1), '');
  assert.equal(marker(1), 'none');
  assert.deepEqual(
    store([row(1, [], { prompt_version: 'p3' })]),
    counts({ empty: 1 })
  );
  assert.equal(marker(1), 'empty,0,0,1,p3,-,-');
  checkAll('after a purge of a kept version');

  // Refusals: one bad row refuses the call and writes nothing.
  const refuse = (rows, pattern, note) =>
    assert.throws(() => store(rows), pattern, note);
  const shape = /row 1 is not a review AI result/;
  const lineShape = /row 1 has a line that is not a review AI line/;
  const range = /row 1 has a line out of range/;
  const good = row(6, POINTS_1.slice(0, 1));
  const bad = (change) => [good, { ...good, ...change }];
  const badLine = (change) => bad({ points: [{ ...POINTS_1[0], ...change }] });
  refuse({ id: 1 }, /p_rows must be a JSON array/);
  refuse(
    Array.from({ length: 501 }, () => good),
    /at most 500 rows and 2 MB/
  );
  refuse(bad({ id: 'not-a-uuid' }), shape);
  refuse(bad({ text_hash: 'ABC' }), shape);
  refuse(bad({ prompt_version: 'P 1' }), shape);
  refuse(bad({ criteria_version: 1.5 }), shape);
  refuse(bad({ criteria_version: '1' }), shape);
  refuse(bad({ model: 'Claude Haiku' }), shape);
  refuse(bad({ batch_id: 'x' }), shape);
  refuse(bad({ failed: 'yes' }), shape);
  refuse(bad({ rejected: 21 }), shape);
  refuse(bad({ note: 'x' }), shape);
  refuse(bad({ failed: true }), shape, 'a failed row carries no points');
  refuse(bad({ points: Array.from({ length: 7 }, () => POINTS_1[0]) }), shape);
  refuse(
    bad({ criteria_version: 9 }),
    /row 1 has no criteria list smartphones\/9/
  );
  refuse(bad({ category: 'services_x' }), /row 1 has no criteria list/);
  refuse(badLine({ kind: 'neutral' }), lineShape);
  refuse(badLine({ match: 'fuzzy' }), lineShape);
  refuse(badLine({ body: 7 }), lineShape);
  refuse(badLine({ extra: 1 }), lineShape);
  refuse(
    bad({
      points: [
        {
          kind: 'pro',
          body: 'Pin dùng hết ngày',
          evidence: 'a b',
          match: 'exact',
        },
      ],
    }),
    lineShape
  );
  refuse(
    badLine({ criterion_key: 'keyboard' }),
    range,
    'a key of another category'
  );
  refuse(badLine({ body: 'Tốt' }), range);
  refuse(badLine({ body: 'x'.repeat(151) }), range);
  refuse(badLine({ body: 'aaaaaaa' }), range);
  refuse(
    badLine({ kind: 'con', body: 'Không có gì để chê' }),
    range,
    'an evasive con'
  );
  refuse(badLine({ evidence: 'pin' }), range, 'one word of evidence');
  refuse(badLine({ evidence: 'p '.repeat(200) }), range);
  refuse(
    bad({
      points: [
        POINTS_1[0],
        { ...POINTS_1[0], kind: 'con', criterion_key: null },
      ],
    }),
    range,
    'one line as a pro and a con'
  );
  refuse(
    bad({
      points: Array.from({ length: 4 }, (_, i) => ({
        ...POINTS_1[0],
        body: `Pin dùng tốt số ${i + 1}`,
      })),
    }),
    range,
    'four pros'
  );
  const noFlag = { ...good };
  delete noFlag.failed;
  refuse(
    [good, { ...noFlag, points: [] }],
    shape,
    'a result without its failed flag'
  );
  refuse(bad({ failed: null }), shape);
  refuse(bad({ prompt_version: 'all' }), shape);
  assert.throws(
    () =>
      store([row(1, POINTS_1.slice(0, 1), { batch_id: 'msgbatch_unknown' })]),
    /review_ai_extractions_batch_id_fkey/,
    'an unknown batch id'
  );
  for (const role of ['anon', 'authenticated'])
    assert.throws(
      () => store([good], role),
      /permission denied for function store_review_ai_points/
    );
  assert.equal(
    marker(6),
    'rejected,0,2,1,p1,-,-',
    'a refused call writes nothing'
  );

  // Direct writes: rate_worker writes neither lines nor markers; the public reads neither table.
  assert.throws(
    () =>
      asRole(
        'rate_worker',
        `INSERT INTO rate.review_points (review_id, kind, body, method) VALUES ('${review(6)}', 'pro', 'Loa to rõ ràng', 'ai')`
      ),
    /permission denied for table review_points/
  );
  assert.throws(
    () =>
      asRole(
        'rate_worker',
        `UPDATE rate.review_ai_extractions SET outcome = 'empty'`
      ),
    /permission denied for table review_ai_extractions/
  );
  assert.throws(
    () => asRole('rate_worker', `DELETE FROM rate.review_ai_batches`),
    /permission denied for table review_ai_batches/
  );
  assert.equal(
    asRole(
      'rate_worker',
      `UPDATE rate.review_ai_batches SET status = 'stored', cost_usd = 0.0123, output_tokens = 900
       WHERE id = 'msgbatch_replay01' RETURNING status`
    ),
    'stored'
  );
  // A stored batch is closed to rate_worker; service_role still cannot drop its cost.
  assert.equal(
    asRole(
      'rate_worker',
      `UPDATE rate.review_ai_batches SET cost_usd = 0 WHERE id = 'msgbatch_replay01' RETURNING id`
    ),
    ''
  );
  assert.equal(
    sql(
      `SELECT cost_usd FROM rate.review_ai_batches WHERE id = 'msgbatch_replay01'`
    ),
    '0.0123'
  );
  assert.throws(
    () =>
      sql(
        `UPDATE rate.review_ai_batches SET cost_usd = NULL WHERE id = 'msgbatch_replay01'`
      ),
    /review_ai_batches_stored_cost/
  );
  for (const role of ['anon', 'authenticated'])
    for (const table of ['review_ai_batches', 'review_ai_extractions'])
      assert.throws(
        () => asRole(role, `SELECT count(*) FROM rate.${table}`),
        new RegExp(`permission denied for table ${table}`)
      );
  assert.equal(
    asRole(
      'anon',
      `SELECT count(*) FROM rate.review_points WHERE method = 'ai'`
    ),
    '1',
    'the public reads ai lines like writer lines'
  );
  checkAll('after the refusals');
  assert.match(sql(info), /spend\|claude-haiku-5-5\|\d{4}-\d{2}\|0\.0123/);

  // Purge one prompt version, then everything; writer lines stay.
  store([row(1, POINTS_1, { prompt_version: 'p4' })]);
  assert.deepEqual(
    JSON.parse(
      asRole('rate_worker', `SELECT rate.purge_review_ai_points('p4')`)
    ),
    { lines: 3, markers: 1 }
  );
  assert.equal(lines(1), '');
  assert.equal(
    lines(5),
    'pro:keyboard:0:Bàn phím gõ êm',
    'another version stays'
  );
  assert.throws(
    () => asRole('rate_worker', `SELECT rate.purge_review_ai_points('P 4')`),
    /'all' or a prompt version/
  );
  assert.throws(
    () => asRole('rate_worker', `SELECT rate.purge_review_ai_points(NULL)`),
    /'all' or a prompt version/
  );
  assert.throws(
    () => asRole('rate_worker', `SELECT rate.purge_review_ai_points()`),
    /function rate.purge_review_ai_points\(\) does not exist/,
    'a bare call purges nothing'
  );
  assert.throws(
    () => asRole('anon', `SELECT rate.purge_review_ai_points('all')`),
    /permission denied for function purge_review_ai_points/
  );
  assert.deepEqual(
    JSON.parse(
      asRole('rate_worker', `SELECT rate.purge_review_ai_points('all')`)
    ),
    { lines: 1, markers: 2 }
  );
  assert.equal(
    sql(`SELECT count(*) FROM rate.review_points WHERE method = 'writer'`),
    '1'
  );
  checkAll('after the purge');

  // Rollback twice: every object and every ai line is gone; writer lines and ratings stay.
  store([row(1, POINTS_1)]);
  sql(rollback);
  sql(rollback);
  assert.equal(
    sql(
      `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'rate' AND p.proname IN ('store_review_ai_points', 'purge_review_ai_points',
         'review_ai_text_hash')`
    ),
    '0'
  );
  assert.equal(
    sql(
      `SELECT (to_regclass('rate.review_ai_extractions') IS NULL AND to_regclass('rate.review_ai_batches') IS NULL)::text`
    ),
    'true'
  );
  assert.equal(
    sql(`SELECT string_agg(method, ',') FROM rate.review_points`),
    'writer'
  );
  assert.equal(
    sql(
      `SELECT coalesce(rating_score::text, '-') || ',' || coalesce(rating_weight_sum::text, '-')
       FROM rate.master_products WHERE id = '${MASTER}'`
    ),
    ratingBefore,
    'no rating moved'
  );

  // Applied again: empty tables, the writer works.
  sql(proposal);
  checkAll('after the re-apply');
  assert.deepEqual(store([row(1, POINTS_1)]), counts({ stored: 1 }));
  checkAll('after a store on the re-apply');

  console.log(
    'review AI points proposal: hash parity, lines and markers stored, skipped, retried and refused, grants, purge, verify and rollback replayed'
  );
} finally {
  removeContainer();
}
