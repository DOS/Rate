import assert from 'node:assert/strict';
import {
  buildProductPoints,
  reviewPointWeight,
  runProductPointsJob,
  type PointReviewRow,
  type ReviewPointRow,
} from '../jobs/product-points.js';
import type { RateSupabaseClient } from '../types.js';

const NOW = new Date('2026-11-01T00:00:00Z');
const PHONES = 'c0000000-0000-4000-8000-000000000001';
const BUDS = 'c0000000-0000-4000-8000-000000000002';
const PHONE = 'a0000000-0000-4000-8000-000000000001';
const EARBUD = 'a0000000-0000-4000-8000-000000000002';
const QUIET = 'a0000000-0000-4000-8000-000000000003';

const review = (
  id: string,
  product_id: string,
  extra: Partial<PointReviewRow> = {}
): PointReviewRow => ({
  id,
  product_id,
  reviewer_type: 'user',
  helpfulness_weight: 1,
  created_at: '2026-11-01T00:00:00Z',
  platform_created_at: null,
  review_flags: { include_in_rating: true, verdict: 'authentic' },
  ...extra,
});
let lineNo = 0;
const point = (
  review_id: string,
  kind: string,
  body: string,
  criterion_key: string | null = null
): ReviewPointRow => {
  lineNo += 1;
  return { id: `p${String(lineNo).padStart(3, '0')}`, review_id, kind, body, criterion_key };
};

const categories = [
  { id: PHONES, slug: 'smartphones' },
  { id: BUDS, slug: 'earbuds' },
];
const masters = [
  { id: PHONE, category_id: PHONES },
  { id: EARBUD, category_id: BUDS },
  { id: QUIET, category_id: PHONES },
];
const listings = [
  { id: 'l-phone', cluster_id: PHONE },
  { id: 'l-buds', cluster_id: EARBUD },
  { id: 'l-quiet', cluster_id: QUIET },
];
const reviews = [
  review('r1', 'l-phone'),
  review('r2', 'l-phone', { helpfulness_weight: '0.8' }),
  review('r3', 'l-phone', { helpfulness_weight: 3 }),
  // Excluded by the analyzer: its lines do not count.
  review('r4', 'l-phone', { review_flags: { include_in_rating: false, verdict: 'suspicious' } }),
  review('r5', 'l-buds'),
  review('r6', 'l-buds'),
  // An expert review Rate published, not analyzed yet.
  review('r7', 'l-buds', {
    reviewer_type: 'expert',
    helpfulness_weight: 0,
    review_flags: [{ include_in_rating: false, verdict: 'unanalyzed' }],
  }),
  // A hostile writer on the quiet master: one review, many cons.
  review('r8', 'l-quiet', { helpfulness_weight: 3 }),
];
const points = [
  point('r1', 'pro', 'Pin trâu, dùng cả ngày'),
  point('r2', 'pro', 'pin rất trâu dùng cả ngày'),
  point('r1', 'con', 'Giá hơi cao so với đối thủ'),
  point('r3', 'con', 'Máy hơi nóng khi chơi game', 'performance'),
  point('r4', 'con', 'Máy hơi nóng khi chơi game', 'performance'),
  point('r4', 'pro', 'Pin trâu dùng cả ngày luôn'),
  point('r5', 'pro', 'Chống ồn tốt khi đi tàu'),
  point('r6', 'pro', 'chống ồn rất tốt khi đi tàu'),
  point('r7', 'con', 'Mic thu tiếng gió khá nhiều', 'calls'),
  point('r8', 'con', 'Pin tụt nhanh kinh khủng'),
  point('r8', 'con', 'Màn hình ám vàng rõ'),
];

async function run() {
  console.log('🧪 Product points job suite (#1546)');

  // Weights: included user reviews keep theirs, excluded or pending ones are 0,
  // an expert counts at least 1 unless the analyzer excluded it.
  assert.equal(reviewPointWeight(review('a', 'l')), 1);
  assert.equal(reviewPointWeight(review('a', 'l', { helpfulness_weight: '2.5' })), 2.5);
  assert.equal(
    reviewPointWeight(
      review('a', 'l', { review_flags: { include_in_rating: false, verdict: 'unanalyzed' } })
    ),
    0
  );
  assert.equal(reviewPointWeight(review('a', 'l', { review_flags: null })), 0);
  assert.equal(reviewPointWeight(review('a', 'l', { helpfulness_weight: 'NaN' })), 0);
  assert.equal(reviewPointWeight(reviews[6]!), 1);
  assert.equal(
    reviewPointWeight(
      review('a', 'l', {
        reviewer_type: 'expert',
        review_flags: { include_in_rating: false, verdict: 'suspicious' },
      })
    ),
    0
  );

  const built = buildProductPoints({ points, reviews, listings, masters, categories }, NOW);
  const phone = built.get(PHONE)!;
  // Two writers (1 + 0.8) agree on the battery; review 4 is excluded, so the
  // heat con has one writer (r3) and does not show; the price con has one too.
  assert.deepEqual(
    phone.map(p => [p.criterion_key, p.kind, p.label, p.support, p.reviewer_count]),
    [['battery', 'pro', 'Pin trâu, dùng cả ngày', 1.8, 2]]
  );
  assert.equal(phone[0]!.method, 'code');
  assert.equal(phone[0]!.updated_at, NOW.toISOString());
  // Earbuds use their own criteria: "chống ồn" is ANC; the expert's mic con
  // shows on its own.
  const buds = built.get(EARBUD)!;
  assert.deepEqual(buds.map(p => [p.criterion_key, p.kind, p.has_expert]).sort(), [
    ['anc', 'pro', false],
    ['calls', 'con', true],
  ]);
  // One hostile writer shows nothing; the master is listed so old rows clear.
  assert.deepEqual(built.get(QUIET), []);

  // The job against a fake client: a dry run writes nothing; --apply inserts
  // the new rows before deleting the old 'code' rows, and clears a master whose
  // lines no longer show anything.
  const fake = fakeSupabase({
    review_points: points,
    reviews,
    products: listings,
    master_products: masters,
    categories,
    product_points: [
      { id: 'old-1', master_id: PHONE, method: 'code' },
      { id: 'old-2', master_id: QUIET, method: 'code' },
      { id: 'ai-1', master_id: PHONE, method: 'ai' },
    ],
  });
  const dry = await runProductPointsJob(fake.client, { now: NOW });
  assert.deepEqual(dry, { apply: false, masters: 3, points: 3, inserted: 0, deleted: 0 });
  assert.equal(fake.writes.length, 0, 'a dry run writes nothing');

  const applied = await runProductPointsJob(fake.client, { apply: true, now: NOW });
  assert.deepEqual(applied, { apply: true, masters: 3, points: 3, inserted: 3, deleted: 2 });
  assert.deepEqual(
    fake.writes.map(w => `${w.op}:${w.detail}`),
    [`insert:${PHONE}x1`, 'delete:old-1', `insert:${EARBUD}x2`, 'delete:old-2']
  );
  assert.ok(!fake.writes.some(w => w.detail.includes('ai-1')), "'ai' rows stay");

  // One master only.
  const one = fakeSupabase({
    review_points: points,
    reviews,
    products: listings,
    master_products: masters,
    categories,
    product_points: [],
  });
  const single = await runProductPointsJob(one.client, { apply: true, masterId: EARBUD, now: NOW });
  assert.equal(single.masters, 1);
  assert.deepEqual(
    one.writes.map(w => `${w.op}:${w.detail}`),
    [`insert:${EARBUD}x2`]
  );
  await assert.rejects(runProductPointsJob(one.client, { masterId: 'not-a-uuid' }), /UUID/);

  console.log('  ✅ weights, aggregation per master and category, dry run and apply verified');
}

type Row = Record<string, unknown>;

/**
 * A tiny stand-in for the Supabase query builder: select with order/range,
 * in, eq, insert and delete().in(). It records writes.
 */
function fakeSupabase(tables: Record<string, readonly object[]>) {
  const writes: { op: string; detail: string }[] = [];
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])] as Row[];
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter(r => r[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter(r => values.includes(r[column]));
        return builder;
      },
      range: (from: number, to: number) =>
        Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return builder;
  };
  const client = {
    from: (table: string) => ({
      ...query(table),
      insert: (payload: Row[]) => {
        writes.push({ op: 'insert', detail: `${String(payload[0]?.master_id)}x${payload.length}` });
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        in: (_column: string, ids: string[]) => {
          writes.push({ op: 'delete', detail: ids.join(',') });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { client: client as unknown as RateSupabaseClient, writes };
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
