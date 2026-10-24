import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AiReviewAnalyzer } from '../ai-review-analyzer.js';
import {
  extractGsmArenaDataSpecs,
  MAX_ARENA_CATALOG_ITEMS,
  parseGsmArenaBrandCatalogHtml,
  parseGsmArenaHtmlToSpecs,
  parsePhoneArenaCatalogHtml,
} from '../arena-spec-syncer.js';
import { MAX_CLUSTER_PEER_ROWS, resolveClusterPeerFloorPrice } from '../cluster-peer-floor.js';
import { MAX_ENTITY_IMAGES, sanitizeHttpUrl, sanitizeHttpUrlList } from '../entity-matcher.js';
import { computeRetryDelayMs, redactSensitiveString, sanitizeLogMeta } from '../logger.js';
import {
  loadAndScoreMerchant,
  rescoreMerchantReviewRisk,
  toValidPrice,
  uniqueIds,
  writeMerchantReviewRisk,
} from '../merchant-review-risk.js';
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
  const sharedChild = { status: 'active' };
  circularObj.firstRef = sharedChild;
  circularObj.secondRef = sharedChild;
  circularObj.d1 = {
    d2: {
      d3: {
        d4: {
          leafNote: `Bearer ${'z'.repeat(24)}`,
          tooDeepObj: { nope: true },
        },
      },
    },
  };
  const sanitizedMeta = sanitizeLogMeta(circularObj) as Record<string, unknown>;
  assert.equal(sanitizedMeta.ok, 'fine');
  assert.equal(sanitizedMeta.nanVal, null);
  assert.equal(sanitizedMeta.apiKey, '[REDACTED]');
  assert.equal(sanitizedMeta.self, '[Circular]');
  assert.deepEqual(sanitizedMeta.firstRef, { status: 'active' });
  assert.deepEqual(
    sanitizedMeta.secondRef,
    { status: 'active' },
    'Shared non-circular DAG object references must not be marked [Circular]'
  );
  const d4Out = (
    ((sanitizedMeta.d1 as Record<string, unknown>).d2 as Record<string, unknown>).d3 as Record<
      string,
      unknown
    >
  ).d4 as Record<string, unknown>;
  assert.equal(d4Out.leafNote, 'Bearer [REDACTED]');
  assert.equal(d4Out.tooDeepObj, '[MaxDepth]');

  const boundaryStraddle = `${'a'.repeat(7990)} http://admin:${'p'.repeat(16)}@proxy.example.com`;
  const redactedBoundary = redactSensitiveString(boundaryStraddle);
  assert.equal(redactedBoundary.includes('p'.repeat(16)), false);
  assert.equal(redactedBoundary.length <= 8000, true);

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

  // DOS/Rate#862: resolveClusterPeerFloorPrice, merchant-review-risk, and Arena/Entity URL bounds
  assert.equal(
    resolveClusterPeerFloorPrice(null as unknown as never[], 'p-1', 25_000_000),
    25_000_000,
    'Non-array peerRows falls back to fallbackMasterMinPrice instead of throwing'
  );
  assert.equal(
    resolveClusterPeerFloorPrice(
      [
        null as unknown as never,
        { id: '  p-self  ', price_current: 15_000_000, merchants: { is_official: true } },
        { id: 'p-bool', price_current: true, merchants: { is_official: true } },
        { id: 'p-peer', price_current: 28_990_000, merchants: { is_official: false } },
      ],
      'p-self',
      true as unknown as number
    ),
    28_990_000,
    'Self-exclusion trims IDs and boolean prices/fallbacks are rejected'
  );
  assert.equal(MAX_CLUSTER_PEER_ROWS, 1000);

  assert.equal(toValidPrice(true), 0, 'toValidPrice rejects boolean true');
  assert.equal(mapStoredReview(null as unknown as ReviewRow), null);
  assert.equal(mapStoredReview({ ...review('   ', 'p', null) }), null);
  assert.equal(
    mapStoredReview({
      ...review('  r-trim  ', 'p', null),
      rating_star: true as unknown as number,
    })?.raw.rating_star,
    5,
    'boolean rating_star falls back to 5 instead of coercing true -> 1'
  );

  const boundedScoreMerchants = scoreMerchants(
    new AiReviewAnalyzer(),
    [
      {
        id: 'm-prev-bad',
        platform: 'shopee',
        is_official: false,
        follower_count: true as unknown as number,
        review_risk_score: 999,
      },
    ],
    [{ id: 'p-prev', merchant_id: 'm-prev-bad', cluster_id: 'c1', price_current: 10_000_000 }],
    [review('r-prev', 'p-prev', { verdict: 'authentic', flag_category: 'authentic' })],
    new Map()
  );
  assert.equal(
    boundedScoreMerchants[0]?.previousScore,
    null,
    'Out-of-range previousScore > 100 is normalized to null'
  );

  assert.deepEqual(uniqueIds(['  m-2  ', '', '   ', 'm-1\u0000bad', 'm-1', 'm-2']), ['m-1', 'm-2']);
  assert.equal(await loadAndScoreMerchant(scoped.client, new AiReviewAnalyzer(), '   '), null);
  await assert.rejects(
    () =>
      writeMerchantReviewRisk(
        scoped.client,
        '   ',
        boundedScoreMerchants[0]!.risk,
        '2026-10-24T00:00:00.000Z'
      ),
    /Invalid merchantId/
  );

  assert.equal(sanitizeHttpUrl('https://user:pass@example.com/a.jpg'), null);
  const cappedImgs = sanitizeHttpUrlList(
    Array.from({ length: 70 }, (_, i) => `https://cdn.example.com/img-${i}.jpg`)
  );
  assert.equal(cappedImgs.length, MAX_ENTITY_IMAGES);

  const parsedArenaCreds = parseGsmArenaHtmlToSpecs('<h1 data-spec="modelname">Test Phone</h1>', {
    gsmarenaUrl: 'https://user:pass@www.gsmarena.com/test-1.php',
    phonearenaUrl: 'https://admin:secret@www.phonearena.com/phones/Test_id1',
  });
  assert.equal(parsedArenaCreds.gsmarenaUrl, undefined);
  assert.equal(parsedArenaCreds.phonearenaUrl, undefined);
  assert.deepEqual(extractGsmArenaDataSpecs(null as unknown as string), {});
  assert.deepEqual(parseGsmArenaBrandCatalogHtml(null as unknown as string), []);
  assert.deepEqual(parsePhoneArenaCatalogHtml(null as unknown as string), []);
  assert.equal(MAX_ARENA_CATALOG_ITEMS, 500);

  // DOS/Rate#910: loadAndScore trims master_products.id & skips nullish master rows, and runReviewRiskBackfill tolerates nullish options
  const tablesWithUntrimmedMaster: Record<string, unknown[]> = {
    merchants: [
      {
        id: 'm-cheap',
        platform: 'lazada',
        is_official: false,
        follower_count: 0,
        review_risk_score: 20,
      },
    ],
    products: [
      { id: 'p-cheap', merchant_id: 'm-cheap', cluster_id: 'c1', price_current: 9_000_000 },
    ],
    reviews: [
      review('c1', 'p-cheap', {
        verdict: 'authentic',
        flag_category: 'authentic',
        include_in_rating: true,
      }),
    ],
    master_products: [null, { id: '  c1\u0000  ', min_price: 29_000_000 }],
  };
  const untrimmedMasterClient = {
    from: (name: string) => table(tablesWithUntrimmedMaster[name] ?? []),
  } as never;
  const nullOptsRes = await runReviewRiskBackfill(untrimmedMasterClient, undefined as never);
  assert.equal(nullOptsRes.apply, false);
  assert.equal(nullOptsRes.scored, 1);
  assert.equal(
    nullOptsRes.changed,
    1,
    'Master min_price keyed by trimmed c1 detects price anomaly (score 60 != previousScore 20)'
  );

  // DOS/Rate#912: EntityMatcher, AiSpecEnricher, ShopeeToSupabase & MerchantReviewRisk bounds
  const { EntityMatcher } = await import('../entity-matcher.js');
  const { AiSpecEnricher } = await import('../ai-spec-enricher.js');
  const { hasPopulatedSpecificationGroups, normalizeScrapedProductPrices } =
    await import('../shopee-to-supabase.js');
  const enricher912 = new AiSpecEnricher(null as unknown as never);
  assert.equal(enricher912.getProviderInfo().provider.length > 0, true);
  const enricherBool912 = new AiSpecEnricher({
    timeoutMs: true as unknown as number,
    temperature: true as unknown as number,
  });
  assert.equal(await enricherBool912.fetchSpecsFromAi(null as unknown as never), null);
  assert.equal(
    await enricherBool912.fetchSpecsFromAi({
      brand: '  \u0000  ',
      model: 'S25',
      storageGb: 256,
      ramGb: 12,
    }),
    null
  );
  await assert.rejects(
    () => enricherBool912.enrichCandidate(null as unknown as never),
    /candidate must be a non-null object/
  );

  const matcher912 = new EntityMatcher({} as never, enricher912);
  await assert.rejects(
    () => matcher912.resolveOrCreateMasterProduct(null as unknown as never),
    /candidate must be a non-null object/
  );
  await assert.rejects(
    () =>
      matcher912.resolveOrCreateMasterProduct({
        model_key: '  \u0000  ',
      } as never),
    /candidate\.model_key must be a non-empty string/
  );
  await assert.rejects(
    () => matcher912.enrichMasterProductById('  \u0000  '),
    /masterId must be a non-empty string/
  );

  assert.equal(
    hasPopulatedSpecificationGroups({
      display: { type: '\u0000\t\n ' },
    }),
    false
  );
  assert.equal(
    hasPopulatedSpecificationGroups({
      cellular: { has_5g: true },
    }),
    true
  );
  assert.throws(
    () => normalizeScrapedProductPrices(null as unknown as never),
    /requires a non-null product object/
  );

  // DOS/Rate#914: RATE_API_V1_ENDPOINTS, scopeSupabaseToRate, resolveClusterPeerFloorPrice & platformReviewIdFor bounds
  const { RATE_API_V1_ENDPOINTS } = await import('@repo/shared-data');
  const { scopeSupabaseToRate } = await import('../types.js');
  const { platformReviewIdFor } = await import('../shopee-to-supabase.js');

  assert.equal(
    RATE_API_V1_ENDPOINTS.PRODUCT_DETAIL('  iphone-16-pro\u0000  '),
    '/api/v1/rate/products/iphone-16-pro'
  );
  assert.equal(
    RATE_API_V1_ENDPOINTS.MERCHANT_DETAIL('  m-123\u0000  '),
    '/api/v1/rate/merchants/m-123'
  );
  assert.equal(RATE_API_V1_ENDPOINTS.REVIEW_VOTE('  rev-1\u0000  '), '/api/reviews/rev-1/vote');

  assert.throws(
    () => scopeSupabaseToRate(null as unknown as never),
    /requires a valid SupabaseClient/
  );
  assert.throws(
    () => scopeSupabaseToRate({} as unknown as never),
    /requires a valid SupabaseClient/
  );

  assert.equal(
    resolveClusterPeerFloorPrice(
      [
        { id: '  p-self\u0000  ', price_current: 5_000_000, merchants: { is_official: true } },
        { id: 'p-peer', price_current: 20_000_000, merchants: { is_official: true } },
      ],
      'p-self'
    ),
    20_000_000
  );

  const fallbackRevHash = platformReviewIdFor({
    reviewId: '  \u0000  ',
    author: 'Alice',
    ratingStar: true as unknown as number,
    comment: 'Great phone',
    images: [],
  });
  assert.equal(
    fallbackRevHash,
    platformReviewIdFor({
      reviewId: '',
      author: 'Alice',
      ratingStar: undefined as unknown as number,
      comment: 'Great phone',
      images: [],
    })
  );

  // DOS/Rate#916: ScrapedProductSchema, ScrapedReviewSchema, and SortSchema bounds
  const {
    KeySpecsSchema,
    ListingFilterSchema,
    ListingSchema,
    MasterProductSchema,
    ReviewReactionSchema,
    ReviewSchema,
    ScrapedProductSchema,
    ScrapedReviewSchema,
    SortSchema,
    UserAuthResponseSchema,
    UserLoginSchema,
  } = await import('@repo/shared-data');
  assert.equal(SortSchema.safeParse({ field: '   ', order: 'asc' }).success, false);
  assert.equal(SortSchema.safeParse({ field: 'a'.repeat(65), order: 'desc' }).success, false);
  assert.equal(SortSchema.safeParse({ field: 'price_min', order: 'asc' }).success, true);

  assert.equal(
    ScrapedReviewSchema.safeParse({
      reviewId: 'r-1',
      author: 'Alice',
      ratingStar: 5,
      comment: 'x'.repeat(10_001),
      images: [],
    }).success,
    false
  );
  assert.equal(
    ScrapedProductSchema.safeParse({
      itemId: '123',
      shopId: '456',
      url: 'https://shopee.vn/item-i.456.123',
      title: 'x'.repeat(1001),
      priceMin: 25_000_000,
      priceMax: 25_000_000,
      shop: { shopId: '456', name: 'Shop', isMall: true },
    }).success,
    false
  );

  // DOS/Rate#918: User, Listing, Review, KeySpecs, and MasterProduct bounds
  assert.equal(UserLoginSchema.safeParse({ identifier: '   ', password: 'secret' }).success, false);
  assert.equal(UserLoginSchema.safeParse({ identifier: 'alice', password: '' }).success, false);
  assert.equal(
    UserAuthResponseSchema.safeParse({
      jwt: '',
      user: {
        id: '018f1234-5678-7abc-9def-0123456789ab',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
        isActive: true,
        emailConfirmed: true,
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
      },
    }).success,
    false
  );
  assert.equal(ListingFilterSchema.safeParse({ search: 's'.repeat(201) }).success, false);
  assert.equal(ListingSchema.shape.tags.safeParse(['t'.repeat(65)]).success, false);
  assert.equal(ReviewSchema.shape.pros.safeParse(['p'.repeat(301)]).success, false);
  assert.equal(
    ReviewReactionSchema.safeParse({
      reviewId: '018f1234-5678-7abc-9def-0123456789ab',
      userId: '018f1234-5678-7abc-9def-0123456789ac',
      type: 'report',
      reason: 'r'.repeat(1001),
    }).success,
    false
  );
  assert.equal(KeySpecsSchema.safeParse({ screen: 's'.repeat(201) }).success, false);
  assert.equal(
    MasterProductSchema.safeParse({
      id: '018f1234-5678-7abc-9def-0123456789ab',
      brand: 'b'.repeat(121),
      model: 'iPhone 16',
      model_key: 'apple_iphone_16',
      name: 'Apple iPhone 16',
      slug: 'apple-iphone-16',
    }).success,
    false
  );

  console.log('✅ Review risk backfill suite passed');
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
