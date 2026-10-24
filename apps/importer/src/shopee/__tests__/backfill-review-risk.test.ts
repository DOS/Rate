import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AiReviewAnalyzer } from '../ai-review-analyzer.js';
import { computeRetryDelayMs, redactSensitiveString, sanitizeLogMeta } from '../logger.js';
import { loadAndScoreMerchant, rescoreMerchantReviewRisk } from '../merchant-review-risk.js';
import { mergeKeySpecs } from '../jobs/backfill-specs.js';
import {
  mapStoredReview,
  runReviewRiskBackfill,
  scoreMerchants,
  type MerchantRow,
  type ProductRow,
  type ReviewRow,
} from '../jobs/backfill-review-risk.js';

const review = (
  id: string,
  product_id: string,
  flags: ReviewRow['review_flags'],
  rating_star = 5,
  comment = 'Máy chạy mượt, pin tốt'
): ReviewRow => ({ id, product_id, rating_star, comment, review_flags: flags });

async function run() {
  console.log('🧪 Review risk backfill suite (#691)');

  // Mapping mirrors the web: unanalyzed is skipped, a missing flag is a
  // genuine review, a 'fake' verdict is seeding unless sabotage or bombing.
  assert.equal(mapStoredReview(review('r', 'p', { verdict: 'unanalyzed' })), null);
  const noFlag = mapStoredReview(review('r', 'p', null))!;
  assert.equal(noFlag.result.flag_category, 'authentic');
  assert.equal(noFlag.result.include_in_rating, true);
  assert.equal(
    mapStoredReview(review('r', 'p', { verdict: 'fake', flag_category: 'authentic' }))!.result
      .flag_category,
    'seeding_fake'
  );
  assert.equal(
    mapStoredReview(review('r', 'p', { verdict: 'fake', flag_category: 'competitor_sabotage' }))!
      .result.flag_category,
    'competitor_sabotage'
  );
  assert.equal(
    mapStoredReview(review('r', 'p', { verdict: 'suspicious' }))!.result.flag_category,
    'low_value_coin_spam'
  );
  assert.equal(
    mapStoredReview({ ...review('r', 'p', null), rating_star: null })!.raw.rating_star,
    5
  );

  const merchants: MerchantRow[] = [
    {
      id: 'm-seed',
      platform: 'shopee',
      is_official: false,
      follower_count: 0,
      review_risk_score: 0,
    },
    {
      id: 'm-off',
      platform: 'shopee',
      is_official: true,
      follower_count: 90000,
      review_risk_score: 4,
    },
    {
      id: 'm-cheap',
      platform: 'lazada',
      is_official: false,
      follower_count: 0,
      review_risk_score: 20,
    },
    {
      id: 'm-none',
      platform: 'shopee',
      is_official: false,
      follower_count: 0,
      review_risk_score: 0,
    },
  ];
  const products: ProductRow[] = [
    { id: 'p-seed', merchant_id: 'm-seed', cluster_id: 'c1', price_current: 30_000_000 },
    { id: 'p-off', merchant_id: 'm-off', cluster_id: 'c1', price_current: 29_000_000 },
    { id: 'p-cheap', merchant_id: 'm-cheap', cluster_id: 'c1', price_current: 9_000_000 },
    { id: 'p-none', merchant_id: 'm-none', cluster_id: 'c1', price_current: 31_000_000 },
  ];
  const reviews: ReviewRow[] = [
    review('s1', 'p-seed', { verdict: 'fake', flag_category: 'seeding_fake' }),
    review('s2', 'p-seed', {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    }),
    review(
      's3',
      'p-seed',
      { verdict: 'authentic', flag_category: 'authentic', include_in_rating: true },
      1,
      'Máy lỗi sau 2 ngày'
    ),
    review(
      's4',
      'p-seed',
      { verdict: 'fake', flag_category: 'competitor_sabotage' },
      1,
      'Shop lừa đảo'
    ),
    review('o1', 'p-off', {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    }),
    review('c1', 'p-cheap', {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    }),
    review('n1', 'p-none', { verdict: 'unanalyzed' }),
  ];
  const scores = scoreMerchants(
    new AiReviewAnalyzer(),
    merchants,
    products,
    reviews,
    new Map([['c1', 29_000_000]])
  );
  const byId = new Map(scores.map(s => [s.merchantId, s]));

  // A seller with only unanalyzed reviews is not scored.
  assert.equal(byId.has('m-none'), false);
  // 1/4 seeding: 15 + round(0.25 x 75) = 34; 1/4 genuine complaint is 25%:
  // + round(0.25 x 45) = 11; sabotage adds nothing.
  assert.equal(byId.get('m-seed')!.risk.risk_score, 45);
  assert.equal(byId.get('m-seed')!.risk.sabotage_or_bombing_count, 1);
  // Official store with 90k followers: 15 - 15 - 5, clamped to 0.
  assert.equal(byId.get('m-off')!.risk.risk_score, 0);
  // 9M against the official 29M floor is under 58%: price anomaly +45.
  assert.equal(byId.get('m-cheap')!.risk.price_anomaly_detected, true);
  assert.equal(byId.get('m-cheap')!.risk.risk_score, 60);

  // Dry-run writes nothing; --apply writes only the review risk columns.
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const table = (rows: unknown[]) => ({
    select: () => ({
      order: () => ({
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        updates.push({ id, patch });
        return Promise.resolve({ error: null });
      },
    }),
  });
  const tables: Record<string, unknown[]> = {
    merchants,
    products,
    reviews,
    master_products: [{ id: 'c1', min_price: 29_000_000 }],
  };
  const fakeClient = { from: (name: string) => table(tables[name] ?? []) } as never;

  const dry = await runReviewRiskBackfill(fakeClient, {});
  assert.equal(dry.apply, false);
  assert.equal(dry.scored, 3);
  assert.equal(updates.length, 0, 'dry-run writes nothing');

  const applied = await runReviewRiskBackfill(fakeClient, { apply: true });
  assert.equal(applied.written, 3);
  assert.deepEqual(updates.map(u => u.id).sort(), ['m-cheap', 'm-off', 'm-seed']);
  for (const u of updates) {
    assert.deepEqual(Object.keys(u.patch).sort(), [
      'review_risk_breakdown',
      'review_risk_score',
      'review_risk_updated_at',
      'updated_at',
    ]);
    assert.equal(
      (u.patch.review_risk_breakdown as { total_reviews: number }).total_reviews > 0,
      true
    );
  }

  // DOS/Rate#698: ingestion rescores one seller from a scoped read. It must
  // store exactly the seller's score from a full-table run, even with listings
  // of other sellers, other clusters and unrelated reviews in the tables.
  const wideMerchants: MerchantRow[] = [
    ...merchants,
    { id: 'm-other', platform: 'shopee', is_official: true, follower_count: 0 },
  ];
  const wideProducts: ProductRow[] = [
    ...products,
    { id: 'p-seed-2', merchant_id: 'm-seed', cluster_id: 'c2', price_current: 4_000_000 },
    { id: 'p-other', merchant_id: 'm-other', cluster_id: 'c2', price_current: 9_000_000 },
    { id: 'p-other-3', merchant_id: 'm-other', cluster_id: 'c3', price_current: 1_000_000 },
  ];
  const wideReviews: ReviewRow[] = [
    ...reviews,
    review('s5', 'p-seed-2', { verdict: 'fake', flag_category: 'seeding_fake' }),
    review('s6', 'p-seed-2', null, 2, 'Giao chậm'),
    review('x1', 'p-other-3', { verdict: 'fake', flag_category: 'seeding_fake' }),
  ];
  const wideMasters = [
    { id: 'c1', min_price: 29_000_000 },
    { id: 'c2', min_price: 9_500_000 },
    { id: 'c3', min_price: 1_000_000 },
  ];
  const full = new Map(
    scoreMerchants(
      new AiReviewAnalyzer(),
      wideMerchants,
      wideProducts,
      wideReviews,
      new Map(wideMasters.map(m => [m.id, m.min_price]))
    ).map(s => [s.merchantId, s])
  );
  // m-seed's 4M listing is under 58% of the official 9M peer: price anomaly.
  assert.equal(full.get('m-seed')!.risk.price_anomaly_detected, true);

  // A PostgREST stand-in for the filters the scoped read uses. It embeds
  // `merchants(is_official)` like PostgREST, caps each response at `maxRows`
  // (a lowered max-rows), and records every read so an unfiltered one shows.
  const makeScopedClient = (
    tables: Record<string, ReadonlyArray<Record<string, unknown>>>,
    maxRows = 1000
  ) => {
    const reads: string[] = [];
    const writes: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const query = (name: string) => {
      let rows = [...(tables[name] ?? [])];
      const filters: string[] = [];
      const builder = {
        select: (cols: string) => {
          if (cols.includes('merchants(is_official)')) {
            rows = rows.map(r => {
              const m = (tables.merchants ?? []).find(x => x.id === r.merchant_id);
              return { ...r, merchants: m ? { is_official: m.is_official } : null };
            });
          }
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters.push(`${col}=`);
          rows = rows.filter(r => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          assert.equal(vals.length <= 100, true, `${name}.${col} in() chunk of ${vals.length}`);
          filters.push(`${col} in`);
          rows = rows.filter(r => vals.includes(r[col]));
          return builder;
        },
        order: () => builder,
        range: (from: number, to: number) => {
          reads.push(`${name}[${filters.join(',')}]`);
          const end = Math.min(to + 1, from + maxRows);
          return Promise.resolve({ data: rows.slice(from, end), error: null });
        },
        maybeSingle: () => {
          reads.push(`${name}[${filters.join(',')}]`);
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            writes.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
      };
      return builder;
    };
    return { client: { from: query } as never, reads, writes };
  };

  const scoped = makeScopedClient({
    merchants: wideMerchants as unknown as Array<Record<string, unknown>>,
    products: wideProducts as unknown as Array<Record<string, unknown>>,
    reviews: wideReviews as unknown as Array<Record<string, unknown>>,
    master_products: wideMasters,
  });

  for (const merchantId of ['m-seed', 'm-off', 'm-cheap', 'm-other']) {
    const one = await loadAndScoreMerchant(scoped.client, new AiReviewAnalyzer(), merchantId);
    assert.deepEqual(one, full.get(merchantId), `${merchantId}: scoped == full-table score`);
  }
  assert.equal(
    await loadAndScoreMerchant(scoped.client, new AiReviewAnalyzer(), 'm-none'),
    null,
    'a seller with only unanalyzed reviews is not scored'
  );
  assert.equal(
    scoped.reads.every(r => /\[.+\]/.test(r)),
    true,
    `every scoped read is filtered: ${scoped.reads.join(' ')}`
  );
  assert.equal(
    scoped.reads.some(r => r.startsWith('merchants[id in')),
    false,
    'peer official flags come embedded, not from a merchants read'
  );

  // Ingestion stores the seller-wide score, overwriting a single-product one.
  const rescored = await rescoreMerchantReviewRisk(scoped.client, new AiReviewAnalyzer(), 'm-seed');
  assert.equal(rescored!.risk.risk_score, full.get('m-seed')!.risk.risk_score);
  assert.equal(scoped.writes.length, 1);
  assert.equal(scoped.writes[0]!.id, 'm-seed');
  assert.equal(scoped.writes[0]!.patch.review_risk_score, full.get('m-seed')!.risk.risk_score);
  assert.equal(
    (scoped.writes[0]!.patch.review_risk_breakdown as { total_reviews: number }).total_reviews,
    6,
    'all six analyzed reviews of both listings'
  );
  await rescoreMerchantReviewRisk(scoped.client, new AiReviewAnalyzer(), 'm-none');
  assert.equal(scoped.writes.length, 1, 'no write for a seller without analyzed reviews');

  // A large seller: 230 listings over 120 clusters (several in() chunks), a
  // peer without a merchant, an official peer setting one cluster's floor,
  // and responses capped at 37 rows so every read pages.
  const bigMerchants: MerchantRow[] = [
    { id: 'm-big', platform: 'shopee', is_official: false, follower_count: 1200 },
    { id: 'm-mall', platform: 'shopee', is_official: true, follower_count: 0 },
  ];
  const bigProducts: ProductRow[] = [];
  const bigReviews: ReviewRow[] = [];
  const bigMasters: Array<{ id: string; min_price: number }> = [];
  for (let i = 0; i < 230; i += 1) {
    const cluster = `bc${String(i % 120).padStart(3, '0')}`;
    const id = `bp${String(i).padStart(3, '0')}`;
    bigProducts.push({ id, merchant_id: 'm-big', cluster_id: cluster, price_current: 3_000_000 });
    bigReviews.push(
      review(
        `br${i}a`,
        id,
        i % 7 === 0 ? { verdict: 'fake', flag_category: 'seeding_fake' } : null
      ),
      review(`br${i}b`, id, null, i % 5 === 0 ? 1 : 5, i % 5 === 0 ? 'Hàng lỗi' : 'Tốt')
    );
  }
  for (let c = 0; c < 120; c += 1) {
    const cluster = `bc${String(c).padStart(3, '0')}`;
    bigMasters.push({ id: cluster, min_price: 3_100_000 });
    bigProducts.push({
      id: `peer${c}`,
      merchant_id: c === 7 ? null : 'm-mall',
      cluster_id: cluster,
      price_current: c === 99 ? 9_000_000 : 3_200_000,
    });
  }
  const bigFull = scoreMerchants(
    new AiReviewAnalyzer(),
    bigMerchants,
    bigProducts,
    bigReviews,
    new Map(bigMasters.map(m => [m.id, m.min_price]))
  ).find(s => s.merchantId === 'm-big')!;
  // 3M against the official 9M peer of cluster bc099: price anomaly.
  assert.equal(bigFull.risk.price_anomaly_detected, true);
  assert.equal(bigFull.risk.total_reviews, 460);
  const big = makeScopedClient(
    {
      merchants: bigMerchants as unknown as Array<Record<string, unknown>>,
      products: bigProducts as unknown as Array<Record<string, unknown>>,
      reviews: bigReviews as unknown as Array<Record<string, unknown>>,
      master_products: bigMasters,
    },
    37
  );
  assert.deepEqual(
    await loadAndScoreMerchant(big.client, new AiReviewAnalyzer(), 'm-big'),
    bigFull,
    'large seller: scoped == full-table score across chunks and pages'
  );

  // The pipeline awaits the rescore for the product's seller after the
  // per-product analysis (comments stripped, so a commented-out call fails).
  const pipelineSrc = readFileSync(
    fileURLToPath(new URL('../shopee-to-supabase.ts', import.meta.url)),
    'utf8'
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const persistAt = pipelineSrc.indexOf('.persistAnalysisToSupabase(');
  const rescoreCall =
    /await rescoreMerchantReviewRisk\(\s*this\.supabase,\s*this\.reviewAnalyzer,\s*merchantId\s*\)/g;
  rescoreCall.lastIndex = Math.max(persistAt, 0);
  const rescoreMatch = rescoreCall.exec(pipelineSrc);
  assert.equal(
    persistAt > 0 && rescoreMatch !== null && rescoreMatch.index > persistAt,
    true,
    'ingestion awaits the seller rescore after persistAnalysisToSupabase'
  );

  // DOS/Rate#838: mapStoredReview vocabulary validation, follower_count ceiling, and mergeKeySpecs sanitization
  const badVocab = mapStoredReview({
    id: 'r-838',
    product_id: 'p-1',
    rating_star: -10,
    comment: 'Tốt',
    review_flags: { verdict: 'unknown_verdict', flag_category: 'unknown_category' },
  })!;
  assert.equal(badVocab.result.verdict, 'authentic');
  assert.equal(badVocab.result.flag_category, 'authentic');
  assert.equal(badVocab.raw.rating_star, 5);

  const overflowMerchants: MerchantRow[] = [
    {
      id: 'm-overflow',
      platform: 'shopee',
      is_official: false,
      follower_count: 999_999_999,
      review_risk_score: 0,
    },
  ];
  const overflowScores = scoreMerchants(
    new AiReviewAnalyzer(),
    overflowMerchants,
    [{ id: 'p-ov', merchant_id: 'm-overflow', cluster_id: 'c1', price_current: 10_000_000 }],
    [review('r-ov', 'p-ov', { verdict: 'authentic', flag_category: 'authentic' })],
    new Map()
  );
  assert.equal(
    overflowScores[0]?.risk.risk_score,
    15,
    'scoreMerchants must ignore overflowed follower_count > 100M rather than granting the 50k+ follower discount'
  );

  const mergedSpecs = mergeKeySpecs(
    {
      screen: '  6.9"\u0007 OLED  ',
      price_spread_audit: {
        verdict: '  tight_market_consensus  ',
        spread_vnd: Number.NaN,
        platform_count: 3,
      },
    },
    {
      chip: 'A'.repeat(600),
      ram: '   ',
    }
  );
  assert.equal(mergedSpecs.screen, '6.9" OLED');
  assert.equal((mergedSpecs.chip as string).length, 500);
  assert.equal('ram' in mergedSpecs, false);
  assert.deepEqual(mergedSpecs.price_spread_audit, {
    verdict: 'tight_market_consensus',
    platform_count: 3,
  });

  // DOS/Rate#840: computeRetryDelayMs bounds, redactSensitiveString & sanitizeLogMeta hardening, and mergeKeySpecs key safety
  assert.equal(
    Number.isInteger(computeRetryDelayMs(Number.NaN, Number.NaN, Number.NaN, () => Number.NaN)),
    true,
    'computeRetryDelayMs must return a finite integer when inputs are NaN'
  );
  assert.equal(
    computeRetryDelayMs(0, 400, 400, () => 1.0),
    400,
    'computeRetryDelayMs must never exceed maxDelayMs when randomFn returns 1.0'
  );

  const fakeGeminiToken = `AIza${'x'.repeat(24)}`;
  const fakeGhToken = `ghp_${'y'.repeat(24)}`;
  const redacted = redactSensitiveString(
    `GET https://api.example.com/v1?api_key=${'s'.repeat(12)}&token=${'t'.repeat(12)} ${fakeGeminiToken} ${fakeGhToken}`
  );
  assert.equal(redacted.includes('s'.repeat(12)), false);
  assert.equal(redacted.includes('t'.repeat(12)), false);
  assert.equal(redacted.includes(fakeGeminiToken), false);
  assert.equal(redacted.includes(fakeGhToken), false);

  const circularObj: Record<string, unknown> = {
    ok: 'fine',
    nanVal: Number.NaN,
    apiKey: 'secret-val',
  };
  circularObj.self = circularObj;
  const sanitizedMeta = sanitizeLogMeta(circularObj) as Record<string, unknown>;
  assert.equal(sanitizedMeta.ok, 'fine');
  assert.equal(sanitizedMeta.nanVal, null);
  assert.equal(sanitizedMeta.apiKey, '[REDACTED]');
  assert.equal(sanitizedMeta.self, '[Circular]');

  const keyBoundedSpecs = mergeKeySpecs(
    {
      ['  display   type  ']: 'LTPO OLED',
      ['constructor']: 'polluted',
      ['K'.repeat(120)]: 'too-long-key',
    },
    {
      nested: {
        ['prototype']: 'blocked',
        ['  refresh   rate  ']: '120Hz',
      },
    }
  );
  assert.equal(keyBoundedSpecs['display type'], 'LTPO OLED');
  assert.equal(Object.hasOwn(keyBoundedSpecs, 'constructor'), false);
  assert.equal(Object.hasOwn(keyBoundedSpecs, 'K'.repeat(120)), false);
  assert.deepEqual(keyBoundedSpecs.nested, { 'refresh rate': '120Hz' });

  console.log('✅ Review risk backfill suite passed');
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
