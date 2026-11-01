#!/usr/bin/env node
// Replays the DOS-Me review submission v2 PROPOSAL (DOS/Rate#1544, phase P3 of #1531) on the
// migration replay stack with the P2 proposal applied: the proposal twice, the criteria lists
// and the line rules against @repo/shared-data (the same lists, the same dodge pattern, the same
// verdicts on a corpus of lines, the same weighted star), a v2 review end to end, every refusal
// with its field, the v1 gates, the grants, every verification query, and the rollback twice.
// Nothing touches a real database.
//
// Usage: pnpm --filter @repo/shared-data build && node scripts/test-review-submission-v2-proposal.mjs
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
const p2 = read('2026-10-31-dos-me-criteria-ratings.sql');
const proposal = read('2026-11-01-dos-me-review-submission-v2.sql');
const rollback = read('2026-11-01-dos-me-review-submission-v2-rollback.sql');
const verify = read('2026-11-01-dos-me-review-submission-v2-verify.sql');

const container = `rate-review-v2-proposal-${process.pid}`;
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
    /^-- (V\d+) [^\n]*expect 0\n(?:--[^\n]*\n)*(SELECT[\s\S]*?;)/gm
  ),
].map(([, id, query]) => ({ id, query }));
assert.equal(checks.length, 6, 'the verification lists its expect-0 queries');

// The proposal carries the dodge pattern of shared-data, character for character.
const patternInSql = proposal.match(
  /review_point_compare\(p_text\) ~ '((?:[^']|'')*)'/
)?.[1];
assert.equal(
  patternInSql?.replaceAll("''", "'"),
  rules.EVASIVE_CON_PATTERN,
  'rate.review_point_is_evasive_con uses EVASIVE_CON_PATTERN'
);

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const EARBUDS = 'c0000000-0000-4000-8000-000000000002';
const GADGETS = 'c0000000-0000-4000-8000-000000000003';
const MERCHANT = 'e0000000-0000-4000-8000-000000000001';
const phone = 'a0000000-0000-4000-8000-000000000001';
const phone2 = 'a0000000-0000-4000-8000-000000000002';
const buds = 'a0000000-0000-4000-8000-000000000003';
const gadget = 'a0000000-0000-4000-8000-000000000004';
const noListing = 'a0000000-0000-4000-8000-000000000005';
const userA = 'f0000000-0000-4000-8000-00000000000a';
const userB = 'f0000000-0000-4000-8000-00000000000b';
const RPC =
  'rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)';

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;

try {
  const { sql, asRole } = startRateDb({ name: container });
  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} ${when}`);
  };
  sql(p2);
  sql(proposal);
  sql(proposal);

  // 1. The criteria lists equal rating-criteria.ts.
  const stored = sql(
    `SELECT string_agg(category_slug || ':' || key || ':' || weight || ':' || required || ':' || position,
       ',' ORDER BY category_slug, position) FROM rate.rating_criteria WHERE criteria_version = ${rules.RATING_CRITERIA_VERSION}`
  );
  const expected = rules.RATING_CRITERIA_CATEGORIES.flatMap((slug) =>
    rules
      .getRatingCriteria(slug)
      .map((c, i) => `${slug}:${c.key}:${c.weight}:${c.required}:${i}`)
  )
    .sort((a, b) => {
      const [sa, , , , pa] = a.split(':');
      const [sb, , , , pb] = b.split(':');
      return sa < sb ? -1 : sa > sb ? 1 : Number(pa) - Number(pb);
    })
    .join(',');
  assert.equal(
    stored,
    expected,
    'rate.rating_criteria equals rating-criteria.ts'
  );

  // 2. The line rules agree with review-form.ts on a corpus of real and tricky lines.
  const corpus = [
    'Pin trâu, dùng cả ngày',
    'không có',
    'Không có nhược điểm nào cả',
    'khong co gi de che',
    'chưa thấy ạ',
    'mình không thấy gì để chê',
    'Chả có gì',
    'khum có',
    'không chê được gì',
    'chưa gặp vấn đề gì',
    'không có ý kiến',
    'Mọi thứ đều ổn',
    'none',
    '10/10',
    'ok',
    'giá hơi cao',
    'không có jack 3.5mm',
    'chưa có gì nổi bật',
    'hỏng luôn',
    'aaaaa',
    '.....',
    '🔥🔥🔥🔥🔥',
    'ＫＨÔＮＧ CÓ',
    'không​ có',
    'Sạc nhanh!!!',
    'sắc nét',
    'Không có nhược điểm',
    'Tất cả đều tốt',
    'nothing to complain about',
    'Camera chụp đêm hơi nhiễu',
  ];
  for (const line of corpus) {
    const row = sql(
      `SELECT rate.review_point_compare(${q(line)}) || '|' || rate.review_point_is_evasive_con(${q(line)})`
    );
    assert.equal(
      row,
      `${rules.comparablePoint(line)}|${rules.isEvasiveCon(line)}`,
      `compare and dodge for ${JSON.stringify(line)}`
    );
  }
  assert.notEqual(
    sql(`SELECT rate.review_point_compare('sạc')`),
    sql(`SELECT rate.review_point_compare('sắc')`),
    'diacritics stay'
  );

  // 3. The weighted star equals weightedReviewStar on many random sets.
  sql(`
    INSERT INTO rate.categories (id, name, slug) VALUES
      ('${PHONES}', 'Điện thoại', 'smartphones'),
      ('${EARBUDS}', 'Tai nghe', 'earbuds'),
      ('${GADGETS}', 'Đồ chơi', 'gadgets');
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug)
    VALUES ('${MERCHANT}', 'shopee', 's1', 'Shop 1', 'shop-1');
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, category_id, status)
    VALUES
      ('${phone}', 'Acme', 'Phone X', 'acme:phone-x', 'Acme Phone X', 'acme-phone-x', '${PHONES}', 'published'),
      ('${phone2}', 'Acme', 'Phone Y', 'acme:phone-y', 'Acme Phone Y', 'acme-phone-y', '${PHONES}', 'published'),
      ('${buds}', 'Acme', 'Buds', 'acme:buds', 'Acme Buds', 'acme-buds', '${EARBUDS}', 'published'),
      ('${gadget}', 'Acme', 'Toy', 'acme:toy', 'Acme Toy', 'acme-toy', '${GADGETS}', 'published'),
      ('${noListing}', 'Acme', 'Phone Z', 'acme:phone-z', 'Acme Phone Z', 'acme-phone-z', '${PHONES}', 'published');
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES
      ('b0000000-0000-4000-8000-000000000001', '${MERCHANT}', 'shopee', 'p1', 'Acme Phone X', 10000000, 'https://shopee.vn/p1', '${phone}'),
      ('b0000000-0000-4000-8000-000000000002', '${MERCHANT}', 'shopee', 'p2', 'Acme Phone Y', 9000000, 'https://shopee.vn/p2', '${phone2}'),
      ('b0000000-0000-4000-8000-000000000003', '${MERCHANT}', 'shopee', 'p3', 'Acme Buds', 1000000, 'https://shopee.vn/p3', '${buds}'),
      ('b0000000-0000-4000-8000-000000000004', '${MERCHANT}', 'shopee', 'p4', 'Acme Toy', 100000, 'https://shopee.vn/p4', '${gadget}');
    INSERT INTO auth.users (id, email, email_confirmed_at, created_at) VALUES
      ('${userA}', 'a@example.test', now(), now() - interval '30 days'),
      ('${userB}', 'b@example.test', now(), now() - interval '30 days');
  `);
  const call = (claims, args) =>
    sql(`SET ROLE authenticated; SET request.jwt.claims = ${q(JSON.stringify(claims))};
      SELECT rate.submit_community_review_v2(${args})::text; RESET ROLE;`);
  const asA = { sub: userA, role: 'authenticated' };
  const asB = { sub: userB, role: 'authenticated' };
  const good = {
    criteria: {
      performance: 5,
      camera: 4,
      battery: 3,
      display: 5,
      design: 4,
      value: 4,
    },
    verdict: 'Máy mạnh, camera ổn, pin chỉ vừa đủ một ngày.',
    pros: ['Hiệu năng mạnh, chơi game mượt', 'Màn hình sáng rõ ngoài nắng'],
    cons: ['Pin chỉ đủ một ngày dùng vừa'],
    points: {
      battery: {
        pros: ['Sạc nhanh 30 phút được 60%'],
        cons: ['Máy hơi nóng khi sạc'],
      },
    },
  };
  const args = (r, master = phone) =>
    [
      q(master),
      j(r.criteria),
      q(r.verdict),
      j(r.pros),
      j(r.cons),
      j(r.points ?? {}),
    ].join(', ');
  const fails = (claims, r, pattern, detail, master = phone) => {
    assert.throws(
      () => call(claims, args(r, master)),
      (err) => {
        assert.match(err.message, pattern);
        if (detail)
          assert.match(
            err.message,
            new RegExp(`DETAIL:\\s+${detail.replaceAll('.', '\\.')}`)
          );
        return true;
      },
      `${pattern} ${detail ?? ''}`
    );
  };

  // Refusals, each with its field. Nothing is written by a refused call.
  fails(
    asA,
    { ...good, criteria: { ...good.criteria, value: undefined } },
    /bắt buộc/,
    'criteria.value'
  );
  fails(
    asA,
    { ...good, criteria: { value: 4, performance: 5, camera: 4 } },
    /tối đa 2 tiêu chí/,
    'criteria'
  );
  fails(
    asA,
    { ...good, criteria: { ...good.criteria, camera: 4.3 } },
    /bước 0,5/,
    'criteria.camera'
  );
  fails(
    asA,
    { ...good, criteria: { ...good.criteria, camera: '4' } },
    /bước 0,5/,
    'criteria.camera'
  );
  fails(
    asA,
    { ...good, criteria: { ...good.criteria, anc: 4 } },
    /không thuộc danh mục/,
    'criteria.anc'
  );
  fails(asA, { ...good, verdict: 'Ngắn quá' }, /20 đến 300/, 'verdict');
  fails(asA, { ...good, pros: [] }, /Cần từ 1 đến 5 ưu điểm/, 'pros');
  fails(
    asA,
    {
      ...good,
      cons: Array(6)
        .fill(0)
        .map((_, i) => `Nhược điểm số ${i}`),
    },
    /Cần từ 1 đến 5 nhược điểm/,
    'cons'
  );
  fails(
    asA,
    { ...good, cons: ['Không có nhược điểm nào cả'] },
    /cụ thể/,
    'cons.0'
  );
  fails(
    asA,
    { ...good, pros: ['Pin trâu', 'Màn hình đẹp', 'pin   trâu!'] },
    /trùng/,
    'pros.2'
  );
  fails(asA, { ...good, pros: ['Tốt'] }, /5 đến 150/, 'pros.0');
  fails(asA, { ...good, pros: ['aaaaaaa'] }, /chưa có nội dung/, 'pros.0');
  fails(
    asA,
    { ...good, cons: ['Màn hình sáng rõ ngoài nắng!'] },
    /vừa là ưu điểm vừa là nhược điểm/,
    'cons.0'
  );
  fails(
    asA,
    { ...good, points: { anc: { pros: ['Chống ồn tốt lắm'] } } },
    /không thuộc danh mục/,
    'criterion_points.anc'
  );
  fails(
    asA,
    {
      ...good,
      points: {
        battery: {
          cons: ['a1', 'b', 'c', 'd'].map((x) => `Pin tụt nhanh ${x}`),
        },
      },
    },
    /Cần từ 0 đến 3 nhược điểm/,
    'criterion_points.battery.cons'
  );
  fails(
    asA,
    { ...good, points: { battery: { cons: ['chưa thấy gì'] } } },
    /cụ thể/,
    'criterion_points.battery.cons.0'
  );
  fails(asA, good, /chưa có tiêu chí/, 'criteria', gadget);
  fails(asA, good, /Không tìm thấy listing/, null, noListing);
  fails({ role: 'anon' }, good, /đăng nhập/, null);
  fails(
    { sub: userA, role: 'authenticated', is_anonymous: true },
    good,
    /tài khoản thật/,
    null
  );
  assert.equal(
    sql(`SELECT count(*) FROM rate.reviews`),
    '0',
    'refused calls write nothing'
  );
  assert.throws(
    () => asRole('anon', `SELECT ${RPC.replace(/\(.*\)/, '')}(${args(good)})`),
    /permission denied/,
    'anon cannot call v2'
  );

  // A good review: the star, the 0.1 star, the verdict, the version and every line.
  const result = JSON.parse(call(asA, args(good)));
  const exact = rules.weightedReviewStar('smartphones', good.criteria);
  assert.equal(Number(result.rating_exact), exact);
  assert.equal(result.rating_star, Math.round(exact));
  assert.equal(result.criteria_version, rules.RATING_CRITERIA_VERSION);
  assert.equal(result.points, 5);
  assert.equal(result.include_in_rating, false);
  assert.equal(
    sql(`SELECT string_agg(coalesce(criterion_key, '-') || ':' || kind || ':' || position || ':' || body, ' / '
           ORDER BY criterion_key NULLS FIRST, kind DESC, position)
         FROM rate.review_points WHERE review_id = '${result.id}'`),
    '-:pro:0:Hiệu năng mạnh, chơi game mượt / -:pro:1:Màn hình sáng rõ ngoài nắng / -:con:0:Pin chỉ đủ một ngày dùng vừa / battery:pro:0:Sạc nhanh 30 phút được 60% / battery:con:0:Máy hơi nóng khi sạc'
  );
  assert.equal(
    sql(`SELECT comment = verdict FROM rate.reviews WHERE id = '${result.id}'`),
    't',
    'without free text the verdict is the comment'
  );
  // One review per user and master; v1 and v2 share that rule.
  fails(asA, good, /đã gửi đánh giá/, null);
  // Earbuds rate their own list; the weighted star matches shared-data on random sets.
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let n = 0; n < 40; n += 1) {
    const criteria = {};
    for (const c of rules.getRatingCriteria('earbuds'))
      if (c.required || next() > 0.3)
        criteria[c.key] = 1 + Math.round(next() * 8) / 2;
    const skipped =
      rules.getRatingCriteria('earbuds').length - Object.keys(criteria).length;
    if (skipped > rules.MAX_SKIPPED_CRITERIA) continue;
    const star = sql(
      `SELECT round(sum(s.star * c.weight) / sum(c.weight), 1)
       FROM jsonb_each_text(${j(criteria)}) AS s0(key, v)
       CROSS JOIN LATERAL (SELECT s0.v::numeric AS star) s
       JOIN rate.rating_criteria c ON c.key = s0.key AND c.category_slug = 'earbuds' AND c.criteria_version = 1`
    );
    assert.equal(
      Number(star),
      rules.weightedReviewStar('earbuds', criteria),
      JSON.stringify(criteria)
    );
  }
  const budsReview = JSON.parse(
    call(
      asB,
      args(
        {
          ...good,
          criteria: { sound: 4.5, anc: 3, battery: 4, comfort: 5, value: 4 },
          points: {},
        },
        buds
      )
    )
  );
  assert.equal(
    Number(budsReview.rating_exact),
    rules.weightedReviewStar('earbuds', {
      sound: 4.5,
      anc: 3,
      battery: 4,
      comfort: 5,
      value: 4,
    })
  );
  // Keyword rules still exclude, now over the lines too.
  const spam = JSON.parse(
    call(
      asB,
      args({ ...good, pros: ['Inbox zalo để được giá tốt hơn'] }, phone2)
    )
  );
  assert.equal(spam.flag_category, 'seeding_fake');
  checkAll('after v2 reviews');

  // 4. The rollback twice; reviews and their lines stay; the proposal applies again.
  sql(rollback);
  sql(rollback);
  assert.equal(
    sql(`SELECT count(*) FROM pg_proc WHERE pronamespace = 'rate'::regnamespace
         AND proname IN ('submit_community_review_v2', 'review_point_list', 'review_point_compare')`),
    '0'
  );
  assert.equal(sql(`SELECT to_regclass('rate.rating_criteria') IS NULL`), 't');
  assert.equal(
    sql(`SELECT count(*) FROM rate.review_points`),
    '12',
    'lines stay: 5 + 3 + 4'
  );
  assert.equal(
    sql(
      `SELECT has_function_privilege('authenticated', 'rate.submit_community_review(uuid, text, integer, text, text, text, jsonb)', 'EXECUTE')`
    ),
    't',
    'v1 is untouched'
  );
  sql(proposal);
  checkAll('after the rollback and a re-apply');

  console.log(
    'review submission v2 proposal: shared-data parity, refusals, a review end to end, verify and rollback replayed'
  );
} finally {
  removeContainer();
}
