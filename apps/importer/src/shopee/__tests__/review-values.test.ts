import assert from 'node:assert/strict';
import { getRatingCriteria, reviewValue } from '@repo/shared-data/rules';
import {
  BATCH_ROWS,
  batchValues,
  buildReviewValues,
  changedValues,
  expectedMasterRatings,
  masterRatingMatches,
  reviewValueInput,
  runReviewValuesJob,
  storeBatch,
  type ReviewValueWrite,
  type ValueListingRow,
  type ValuePointRow,
  type ValueReviewRow,
} from '../jobs/review-values.js';
import type { RateSupabaseClient } from '../types.js';

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const M1 = 'a0000000-0000-4000-8000-000000000001';
const M2 = 'a0000000-0000-4000-8000-000000000002';
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const review = (
  n: number,
  product_id: string,
  extra: Partial<ValueReviewRow> = {}
): ValueReviewRow => ({
  id: id(n),
  product_id,
  origin: 'crawl',
  reviewer_type: 'user',
  helpfulness_weight: 1,
  rating_star: 4,
  rating_exact: null,
  comment: null,
  verdict: null,
  criteria_ratings: null,
  images: null,
  is_verified_buyer: null,
  upvotes: 0,
  downvotes: 0,
  value_tier: null,
  review_flags: { include_in_rating: true, verdict: 'authentic', flag_category: null },
  ...extra,
});
const line = (
  n: number,
  kind: string,
  body: string,
  criterion_key: string | null = null,
  method = 'writer'
): ValuePointRow => ({ review_id: id(n), kind, body, criterion_key, method });

const categories = [{ id: PHONES, slug: 'smartphones' }];
const masters = [
  { id: M1, category_id: PHONES },
  { id: M2, category_id: PHONES },
];
const listings: ValueListingRow[] = [
  { id: 'l1', cluster_id: M1, origin: 'crawl' },
  { id: 'l2', cluster_id: M2, origin: 'crawl' },
  { id: 'lseed', cluster_id: M1, origin: 'seed' },
];
const allRated = Object.fromEntries(getRatingCriteria('smartphones').map(c => [c.key, 4]));
const reviews = [
  // A marketplace review: a detailed comment, a photo, the purchase mark, votes.
  review(1, 'l1', {
    rating_star: 5,
    comment:
      'Pin dùng hết một ngày rưỡi, màn hình sáng rõ ngoài nắng, camera chụp đêm ổn, máy không nóng khi chơi game lâu.',
    images: ['https://cf.shopee.vn/file/a.jpg'],
    is_verified_buyer: true,
    upvotes: 9,
    downvotes: 1,
  }),
  // A Rate review (form v2): no comment, its text is the verdict and the lines.
  review(2, 'l1', {
    origin: 'community',
    rating_exact: 4,
    criteria_ratings: allRated,
    verdict: 'Máy mượt, pin dùng hết ngày, đáng tiền trong tầm giá.',
  }),
  // Excluded by the analyzer; not analyzed yet; filler.
  review(3, 'l1', {
    comment: 'Pin trâu, màn đẹp, chụp ảnh nét, dùng mượt mà không lag.',
    review_flags: { include_in_rating: false, verdict: 'suspicious', flag_category: null },
  }),
  review(4, 'l1', { comment: 'Pin trâu, màn đẹp.', review_flags: null }),
  review(5, 'l1', {
    comment: 'Shop giao nhanh, đánh giá để nhận xu nhé.',
    review_flags: {
      include_in_rating: true,
      verdict: 'authentic',
      flag_category: 'low_value_coin_spam',
    },
  }),
  // Seed data is never scored.
  review(6, 'l1', { origin: 'seed', comment: 'Pin trâu.' }),
  // An expert review Rate published, not analyzed yet: it is not gated.
  review(7, 'l2', {
    reviewer_type: 'expert',
    helpfulness_weight: 0,
    comment: 'Đo pin 5000 mAh được 9 giờ màn hình bật.',
    review_flags: { include_in_rating: false, verdict: 'unanalyzed', flag_category: null },
  }),
  review(8, 'l2', { rating_star: 3, comment: 'Ổn.' }),
];
const points = [
  line(2, 'pro', 'Pin dùng cả ngày'),
  line(2, 'con', 'Sạc hơi chậm'),
  line(2, 'pro', 'Chụp đêm rõ nét', 'camera'),
  line(2, 'con', 'Màn hơi tối ngoài nắng', 'display'),
  // An AI line from a marketplace comment earns nothing.
  line(1, 'pro', 'Pin trâu', null, 'ai'),
];

async function run() {
  console.log('🧪 Review values job suite (#1547)');

  // Inputs: gates, depth on the whole text, photo, purchase mark and votes.
  const input = (n: number) =>
    reviewValueInput(
      reviews.find(r => r.id === id(n))!,
      points.filter(p => p.review_id === id(n)),
      'smartphones'
    );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 7, 8].map(n => input(n).gated),
    [false, false, true, true, true, false, false]
  );
  assert.equal(input(1).depth, 'detailed', 'a comment on the product');
  assert.equal(input(7).depth, 'expert_depth', 'a measurement');
  assert.equal(input(2).depth, 'detailed', 'the verdict and the lines are its text');
  assert.equal(input(5).depth, 'filler');
  assert.equal(input(1).hasRealPhoto, true);
  assert.equal(input(1).verifiedPurchase, true);
  assert.deepEqual([input(1).helpfulVotes, input(1).unhelpfulVotes], [9, 1]);
  assert.equal(input(1).authorTrust, null);
  assert.equal(input(1).points[0]!.method, 'ai');
  assert.equal(input(2).points.length, 4);

  const values = buildReviewValues({ reviews, points, listings, masters, categories });
  assert.deepEqual(
    [...values.keys()],
    [1, 2, 3, 4, 5, 7, 8].map(id),
    'seed reviews are not scored'
  );
  assert.deepEqual(values.get(id(2)), reviewValue(input(2)));
  assert.equal(values.get(id(2))!.completeness, 30, 'everything but a photo');
  assert.equal(values.get(id(1))!.weightCompleteness, 0, 'a photo without pros and cons');
  assert.equal(values.get(id(3))!.score, 0);
  assert.equal(values.get(id(3))!.tier, null);

  // Only what changed is stored: the number, the breakdown (key order aside) or the tier.
  const v1 = values.get(id(1))!;
  const reordered = Object.fromEntries(Object.entries(v1).reverse());
  const stored = [
    { review_id: id(1), value_score: v1.score, value_breakdown: reordered },
    { review_id: id(8), value_score: values.get(id(8))!.score, value_breakdown: values.get(id(8)) },
    { review_id: id(2), value_score: 1, value_breakdown: values.get(id(2)) },
  ];
  const tiers = new Map<string, string | null>([
    [id(1), v1.tier],
    [id(8), 'excellent'],
  ]);
  assert.deepEqual(
    changedValues(values, stored, tiers).map(r => r.id),
    [2, 3, 4, 5, 7, 8].map(id),
    'review 1 is unchanged; 8 has a drifted tier; 2 a different number'
  );

  // Batches: at most BATCH_ROWS rows, and a byte limit.
  const many: ReviewValueWrite[] = Array.from({ length: BATCH_ROWS * 2 + 1 }, (_, i) => ({
    id: id(i),
    score: v1.score,
    breakdown: v1,
  }));
  assert.deepEqual(
    batchValues(many).map(b => b.length),
    [BATCH_ROWS, BATCH_ROWS, 1]
  );
  const big = {
    ...v1,
    gaps: Array.from({ length: 20_000 }, () => 'photo'),
  } as unknown as typeof v1;
  const heavy = Array.from({ length: 40 }, (_, i) => ({ id: id(i), score: 1, breakdown: big }));
  const heavyBatches = batchValues(heavy);
  assert.ok(heavyBatches.length > 1, 'the byte limit splits a batch');
  assert.ok(
    heavyBatches.every(b => Buffer.byteLength(JSON.stringify(b)) <= 1_500_000),
    'every batch fits the byte limit'
  );

  // The rating a master should have (V5): P2's estimate with P6's weight.
  const rated = expectedMasterRatings({
    reviews: [
      review(11, 'l1', { rating_star: 5, criteria_ratings: { battery: 4 } }),
      review(12, 'l1', { rating_exact: 4, rating_star: 4, criteria_ratings: { battery: 5 } }),
      review(13, 'l1', {
        rating_star: 2,
        helpfulness_weight: 0.4,
        criteria_ratings: { battery: 3, 'Bad Key': 5 },
      }),
      // Not counted: excluded, no flag, an expert, weight 0, seed, a seed listing.
      review(14, 'l1', {
        review_flags: { include_in_rating: false, verdict: 'fake', flag_category: null },
      }),
      review(15, 'l1', { review_flags: null }),
      review(16, 'l1', { reviewer_type: 'expert' }),
      review(17, 'l1', { helpfulness_weight: 0 }),
      review(18, 'l1', { origin: 'seed' }),
      review(19, 'lseed'),
      // A NULL include counts.
      review(20, 'l2', {
        rating_star: 3,
        review_flags: { include_in_rating: null, verdict: null, flag_category: null },
      }),
    ],
    listings,
    values: new Map([[id(11), { weightCompleteness: 35 }]]),
  });
  // M1: weights 1.25, 1, 0.4: (12.6 + 6.25 + 4 + 0.8) / 5.65 = 4.186.
  assert.deepEqual(rated.get(M1), {
    rating_score: 4.186,
    rating_weight_sum: 2.65,
    criteria_scores: {
      // (12.6 + 5 + 5 + 1.2) / 5.65; three writers, shown 2.4.
      battery: { score: 4.212, weight_sum: 2.65, writers: 3 },
    },
  });
  assert.deepEqual(rated.get(M2), { rating_score: 3.9, rating_weight_sum: 1, criteria_scores: {} });
  assert.ok(
    masterRatingMatches(
      {
        id: M1,
        rating_score: '4.186',
        rating_weight_sum: '2.65',
        criteria_scores: { battery: { score: 4.212, weight_sum: 2.65, writers: 3 } },
      },
      rated.get(M1)
    )
  );
  assert.ok(
    !masterRatingMatches(
      { id: M1, rating_score: 4.186, rating_weight_sum: 2.65, criteria_scores: {} },
      rated.get(M1)
    ),
    'a missing criterion is stale'
  );
  assert.ok(
    !masterRatingMatches(
      { id: M2, rating_score: 3.95, rating_weight_sum: 1, criteria_scores: {} },
      rated.get(M2)
    )
  );
  assert.ok(
    masterRatingMatches(
      { id: M2, rating_score: null, rating_weight_sum: 0, criteria_scores: {} },
      undefined
    ),
    'a master with nothing counted has no rating'
  );

  // A deadlock is retried; a refusal stops the run.
  let calls = 0;
  const flaky = {
    rpc: () => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? { data: null, error: { code: '40P01', message: 'deadlock detected' } }
          : { data: 1, error: null }
      );
    },
  } as unknown as RateSupabaseClient;
  assert.equal(await storeBatch(flaky, many.slice(0, 1), async () => {}), 1);
  assert.equal(calls, 2);
  const refusing = {
    rpc: () =>
      Promise.resolve({
        data: null,
        error: { code: '22023', message: 'row 0 has values out of range' },
      }),
  } as unknown as RateSupabaseClient;
  await assert.rejects(
    storeBatch(refusing, many.slice(0, 1), async () => {}),
    /22023/
  );
  let deadlocks = 0;
  const stuck = {
    rpc: () => {
      deadlocks += 1;
      return Promise.resolve({
        data: null,
        error: { code: '40P01', message: 'deadlock detected' },
      });
    },
  } as unknown as RateSupabaseClient;
  await assert.rejects(
    storeBatch(stuck, many.slice(0, 1), async () => {}),
    /40P01/
  );
  assert.equal(deadlocks, 4, 'four attempts, then the run stops');

  // The job against a fake client.
  const fake = fakeSupabase({
    reviews,
    review_points: points,
    review_values: [],
    products: listings,
    master_products: masters.map(m => ({
      ...m,
      rating_score: null,
      rating_weight_sum: 0,
      criteria_scores: {},
    })),
    categories,
  });
  // The masters as P2 and P6 rate them once the values are stored, except M2,
  // which another transaction held during its refresh.
  const after = expectedMasterRatings({ reviews, listings, values });
  fake.onStore = () => {
    const m1 = fake.tables.master_products!.find(r => r.id === M1)!;
    Object.assign(m1, after.get(M1));
  };

  const dry = await runReviewValuesJob(fake.client);
  assert.equal(dry.apply, false);
  assert.equal(dry.reviews, 7);
  assert.equal(dry.changed, 7);
  assert.equal(fake.stores.length, 0, 'a dry run stores nothing');
  assert.deepEqual(dry.staleMasters, [M1, M2], 'the baseline differs before any value is stored');

  const applied = await runReviewValuesJob(fake.client, { apply: true });
  assert.equal(applied.stored, 7);
  assert.equal(fake.stores.length, 1);
  assert.deepEqual(
    fake.stores[0]!.map(r => r.id),
    [1, 2, 3, 4, 5, 7, 8].map(id),
    'one batch in review id order'
  );
  assert.deepEqual(applied.staleMasters, [M2], 'M2 is reported after a fresh read');
  assert.equal(
    fake.tables.reviews!.find(r => r.id === id(2))!.value_tier,
    values.get(id(2))!.tier,
    'the tier is public'
  );

  const again = await runReviewValuesJob(fake.client, { apply: true });
  assert.equal(again.changed, 0, 'a second run stores nothing');
  assert.equal(fake.stores.length, 1);

  // One master only.
  const one = fakeSupabase({
    reviews,
    review_points: points,
    review_values: [],
    products: listings,
    master_products: masters.map(m => ({
      ...m,
      rating_score: null,
      rating_weight_sum: 0,
      criteria_scores: {},
    })),
    categories,
  });
  const single = await runReviewValuesJob(one.client, { apply: true, masterId: M2 });
  assert.equal(single.reviews, 2);
  assert.deepEqual(
    one.stores[0]!.map(r => r.id),
    [7, 8].map(id)
  );
  await assert.rejects(runReviewValuesJob(one.client, { masterId: 'not-a-uuid' }), /UUID/);

  console.log(
    '  ✅ inputs, changed values, batches, deadlock retry, V5 check, dry run and apply verified'
  );
}

type Row = Record<string, unknown>;

/**
 * A tiny stand-in for the Supabase query builder (select with order/range,
 * in, then) and the writer RPC, which upserts rate.review_values and sets the
 * public tier as rate.store_review_values does.
 */
function fakeSupabase(seed: Record<string, readonly object[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map(r => ({ ...(r as Row) }))])
  );
  const stores: ReviewValueWrite[][] = [];
  const state: { onStore: (() => void) | null } = { onStore: null };
  const copy = (row: Row): Row => ({ ...row });
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      order: () => builder,
      in: (column: string, values: unknown[]) => {
        rows = rows.filter(r => values.includes(r[column]));
        return builder;
      },
      range: (from: number, to: number) =>
        Promise.resolve({ data: rows.slice(from, to + 1).map(copy), error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows.map(copy), error: null }).then(resolve),
    };
    return builder;
  };
  const client = {
    from: (table: string) => query(table),
    rpc: (name: string, args: { p_values: ReviewValueWrite[] }) => {
      assert.equal(name, 'store_review_values');
      stores.push(args.p_values);
      let changed = 0;
      for (const row of JSON.parse(JSON.stringify(args.p_values)) as ReviewValueWrite[]) {
        const values = tables.review_values!;
        const old = values.find(v => v.review_id === row.id);
        if (old) {
          old.value_score = row.score;
          old.value_breakdown = row.breakdown;
        } else {
          values.push({
            review_id: row.id,
            value_score: row.score,
            value_breakdown: row.breakdown,
          });
        }
        changed += 1;
        const target = tables.reviews!.find(r => r.id === row.id);
        if (target) target.value_tier = row.breakdown.tier;
      }
      state.onStore?.();
      return Promise.resolve({ data: changed, error: null });
    },
  };
  return {
    client: client as unknown as RateSupabaseClient,
    tables,
    stores,
    set onStore(fn: () => void) {
      state.onStore = fn;
    },
  };
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
