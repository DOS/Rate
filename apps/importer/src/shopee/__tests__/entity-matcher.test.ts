/**
 * Verification Suite for EntityMatcher 3-Tier Canonical Deduplication & Product Condition/Origin Safety (Audit C6, K4):
 * - Tier 1 deterministic model_key match
 * - Tier 2 pg_trgm fuzzy match (>= 0.70 accepted, 0.65..0.69 ambiguous -> seeded as draft)
 * - Tier 3 creation: benchmark_registry -> published; ai_unverified / crawled_title / non-new condition -> draft
 * - Race condition recovery: ignoreDuplicates winner refetch without overwriting status
 */
import assert from 'node:assert/strict';
import { MasterProductSchema } from '@repo/shared-data';
import {
  EntityMatcher,
  ENTITY_MATCH_ACCEPT_THRESHOLD,
  ENTITY_MATCH_CANDIDATE_FLOOR,
} from '../entity-matcher.js';
import {
  ProductNormalizer,
  detectProductCondition,
  detectProductOrigin,
} from '../product-normalizer.js';
import { AiSpecEnricher, getAiSpecEnrichmentJsonSchema } from '../ai-spec-enricher.js';
import { getAiReviewBatchJsonSchema } from '../ai-review-analyzer.js';
import { computeRetryDelayMs, createImporterLogger, sanitizeAiGeneratedText } from '../logger.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

function createShopeeListing(
  title: string,
  priceMin = 28990000,
  description?: string
): ShopeeProduct {
  return {
    itemId: 'item-c6',
    shopId: 'shop-c6',
    title,
    description,
    priceMin,
    priceMax: priceMin,
    priceBeforeDiscount: priceMin,
    currency: 'VND',
    stock: 10,
    historicalSold: 50,
    ratingStar: 4.9,
    ratingCount: 25,
    images: ['https://rate.vn/img/test.png'],
    models: [{ modelId: 'm-c6', name: 'Titan Tự Nhiên', price: priceMin, stock: 10 }],
    attributes: [],
    shop: {
      shopId: 'shop-c6',
      name: 'Official Store',
      isMall: true,
      ratingStar: 4.9,
      followerCount: 10000,
      location: 'Hà Nội',
    },
    reviews: [],
    url: 'https://shopee.vn/product/shop-c6/item-c6',
  };
}

interface MockDbOptions {
  exactMatch?: { id: string; name: string; model_key: string } | null;
  exactErr?: { message: string } | null;
  fuzzyMatches?: Array<{ master_id: string; name: string; similarity: number }>;
  fuzzyErr?: { message: string } | null;
  upsertRows?: Array<{ id: string }>;
  winnerRow?: { id: string } | null;
}

function createMockSupabase(opts: MockDbOptions = {}) {
  const capturedUpserts: Array<{ payload: Record<string, unknown>; options: unknown }> = [];
  const capturedRpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let selectCallCount = 0;

  const client = {
    from(table: string) {
      assert.equal(table, 'master_products');
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  selectCallCount += 1;
                  if (selectCallCount === 1) {
                    return {
                      data: opts.exactMatch ?? null,
                      error: opts.exactErr ?? null,
                    };
                  }
                  return {
                    data: opts.winnerRow ?? { id: 'winner-master-id' },
                    error: null,
                  };
                },
              };
            },
          };
        },
        upsert(payload: Record<string, unknown>, options: unknown) {
          capturedUpserts.push({ payload, options });
          return {
            select(_cols: string) {
              return Promise.resolve({
                data: opts.upsertRows ?? [{ id: 'created-master-id' }],
                error: null,
              });
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      capturedRpcCalls.push({ fn, args });
      return {
        data: opts.fuzzyMatches ?? [],
        error: opts.fuzzyErr ?? null,
      };
    },
  } as unknown as RateSupabaseClient;

  return { client, capturedUpserts, capturedRpcCalls };
}

interface LabeledProductPair {
  id: string;
  titleA: string;
  titleB: string;
  shouldMatchCanonicalCluster: boolean;
}

const LABELED_ENTITY_RESOLUTION_BENCHMARK: ReadonlyArray<LabeledProductPair> = [
  {
    id: 'pair-1-iphone16pm-256-shopee-vs-tiki',
    titleA: '[Mã ELBAU5 giảm 5%] Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    titleB: 'Apple iPhone 16 Pro Max 256GB Titan Tự Nhiên - Hàng Chính Hãng VN/A',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-2-s24ultra-256-cellphones-vs-tgdd',
    titleA: 'Điện thoại Samsung Galaxy S24 Ultra 5G 12GB/256GB Chính hãng',
    titleB: 'Samsung Galaxy S24 Ultra 12GB RAM 256GB ROM Bảo hành 12 tháng',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-3-xiaomi15ultra-512-lazada-vs-hoangha',
    titleA: 'Điện thoại Xiaomi 15 Ultra 5G (16GB/512GB) Chính hãng DGW',
    titleB: 'Xiaomi 15 Ultra 16GB 512GB Hàng chính hãng nguyên seal',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-4-macbook-air-m4-256-fpt-vs-phongvu',
    titleA: 'Laptop Apple MacBook Air M4 13 inch 16GB/256GB Chính hãng SA/A',
    titleB: 'Apple MacBook Air 13 inch M4 2025 16GB RAM 256GB SSD',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-5-ipad-pro-m4-256-shopee-vs-didongviet',
    titleA: 'Máy tính bảng Apple iPad Pro M4 11 inch WiFi 256GB Chính hãng',
    titleB: 'Apple iPad Pro 11 inch M4 2024 WiFi 256GB Nguyên Seal',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-6-airpods-pro-2-usbc-shopee-vs-tiki',
    titleA: 'Tai nghe Bluetooth Apple AirPods Pro 2 (USB-C) Chính hãng VN/A',
    titleB: 'Tai nghe không dây Apple AirPods Pro Gen 2 MagSafe Type-C',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-7-storage-mismatch-256-vs-512',
    titleA: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    titleB: 'Điện thoại Apple iPhone 16 Pro Max 512GB Chính hãng VN/A',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-8-tier-mismatch-pro-vs-promax',
    titleA: 'Điện thoại Apple iPhone 16 Pro 256GB Chính hãng VN/A',
    titleB: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-9-tier-mismatch-s24plus-vs-s24ultra',
    titleA: 'Điện thoại Samsung Galaxy S24 Plus 256GB Chính hãng',
    titleB: 'Điện thoại Samsung Galaxy S24 Ultra 256GB Chính hãng',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-10-condition-mismatch-new-vs-likenew99',
    titleA: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A Mới 100%',
    titleB: 'Điện thoại Apple iPhone 16 Pro Max 256GB Likenew 99% Zin Nguyên Bản',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-11-condition-mismatch-new-vs-used',
    titleA: 'Điện thoại Samsung Galaxy S24 Ultra 256GB Chính hãng',
    titleB: 'Điện thoại Samsung Galaxy S24 Ultra 256GB Máy cũ đã qua sử dụng',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-12-origin-mismatch-vna-vs-lla-imported',
    titleA: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    titleB: 'Điện thoại Apple iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay',
    shouldMatchCanonicalCluster: false,
  },
];

async function runEntityMatcherSuite() {
  console.log(
    '🧪 Running EntityMatcher 3-Tier & Condition/Origin Verification Suite (Audit C6)...'
  );
  const normalizer = new ProductNormalizer();
  const offlineEnricher = new AiSpecEnricher({ apiKey: '' });

  // 1. Condition & Origin Detection (Audit C6)
  assert.equal(
    detectProductCondition('Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A'),
    'new'
  );
  assert.equal(
    detectProductCondition(
      'Điện thoại Samsung Galaxy S24 Ultra 256GB Mới 100% - Hỗ trợ thu cũ đổi mới'
    ),
    'new',
    'Trade-in promotion ("thu cũ đổi mới") must not misclassify a new phone as used'
  );
  assert.equal(
    detectProductCondition('Điện thoại Apple iPhone 15 Pro Max 256GB Likenew 99% Zin Nguyên Bản'),
    'like_new_99'
  );
  assert.equal(
    detectProductCondition('Điện thoại Samsung Galaxy S23 Ultra 256GB Hàng trưng bày 98%'),
    'like_new_99'
  );
  assert.equal(
    detectProductCondition('Điện thoại iPhone 14 Pro Max 128GB Máy cũ đã qua sử dụng'),
    'used'
  );
  assert.equal(
    detectProductCondition('Điện thoại Apple iPhone 15 Pro 256GB Hàng Tân Trang Apple CPO'),
    'refurbished'
  );

  assert.equal(
    detectProductOrigin('Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A'),
    'official_vna'
  );
  assert.equal(
    detectProductOrigin('Điện thoại Apple iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay'),
    'imported'
  );
  assert.equal(
    detectProductOrigin('Điện thoại Xiaomi 15 Pro 256GB Nội địa Trung nguyên seal'),
    'imported'
  );
  assert.equal(detectProductOrigin('Điện thoại Samsung Galaxy S24 Ultra 256GB'), 'unknown');

  const likeNewCandidate = normalizer.normalize(
    createShopeeListing('Điện thoại Apple iPhone 16 Pro Max 256GB Likenew 99% Bản Mỹ LL/A')
  );
  assert.equal(likeNewCandidate.condition, 'like_new_99');
  assert.equal(likeNewCandidate.origin, 'imported');
  assert.equal(
    likeNewCandidate.needs_review,
    true,
    'Non-new listings must set needs_review = true so they never auto-publish'
  );
  // Storage parsing is unchanged by the size regex's digit lookbehind, and a
  // title with a huge digit run (CodeQL polynomial-regex input) stays fast.
  assert.equal(
    normalizer.normalize(createShopeeListing('Samsung Galaxy A55 8GB RAM 256GB')).storage_gb,
    256
  );
  assert.equal(
    normalizer.normalize(createShopeeListing('Apple MacBook Pro M4 1,5TB SSD')).storage_gb,
    1536
  );
  const longRunStart = Date.now();
  normalizer.normalize(createShopeeListing(`Samsung Galaxy ${'9'.repeat(50_000)}`));
  assert.ok(
    Date.now() - longRunStart < 1_000,
    'a 50k-digit title must not hang the storage parser'
  );
  console.log('  ✅ [1/7] ProductCondition & ProductOrigin detection (Audit C6) passed');

  // 2. Tier 1 Deterministic Exact Match
  const s24New = normalizer.normalize(
    createShopeeListing('Điện thoại Samsung Galaxy S24 Ultra 12GB RAM 256GB Chính hãng VN/A')
  );
  assert.equal(s24New.condition, 'new');
  assert.equal(s24New.origin, 'official_vna');
  assert.equal(s24New.needs_review, false);

  const tier1Db = createMockSupabase({
    exactMatch: {
      id: 'master-exact-1',
      name: 'Samsung Galaxy S24 Ultra 256GB',
      model_key: 'samsung:galaxy-s24-ultra:256gb',
    },
  });
  const tier1Matcher = new EntityMatcher(tier1Db.client, offlineEnricher);
  const tier1Res = await tier1Matcher.resolveOrCreateMasterProduct(s24New);
  assert.deepEqual(tier1Res, { masterId: 'master-exact-1', isNew: false });
  assert.equal(tier1Db.capturedRpcCalls.length, 0, 'Tier 1 hit must not call Tier 2 RPC');
  console.log('  ✅ [2/7] Tier 1 deterministic model_key match passed');

  // 3. Tier 2 Fuzzy Match (>= 0.70 accepted; 0.65..0.69 ambiguous -> draft)
  const tier2AcceptDb = createMockSupabase({
    fuzzyMatches: [
      {
        master_id: 'master-fuzzy-75',
        name: 'Samsung Galaxy S24 Ultra 256GB',
        similarity: 0.75,
      },
    ],
  });
  const tier2AcceptMatcher = new EntityMatcher(tier2AcceptDb.client, offlineEnricher);
  const tier2AcceptRes = await tier2AcceptMatcher.resolveOrCreateMasterProduct(s24New);
  assert.deepEqual(tier2AcceptRes, { masterId: 'master-fuzzy-75', isNew: false });
  assert.equal(
    tier2AcceptDb.capturedRpcCalls[0]?.args.p_similarity_threshold,
    ENTITY_MATCH_CANDIDATE_FLOOR
  );
  assert.equal(ENTITY_MATCH_ACCEPT_THRESHOLD, 0.7);

  const tier2AmbiguousDb = createMockSupabase({
    fuzzyMatches: [
      {
        master_id: 'master-fuzzy-67',
        name: 'Samsung Galaxy S24 Plus 256GB',
        similarity: 0.67,
      },
    ],
  });
  const tier2AmbiguousMatcher = new EntityMatcher(tier2AmbiguousDb.client, offlineEnricher);
  const tier2AmbiguousRes = await tier2AmbiguousMatcher.resolveOrCreateMasterProduct(s24New);
  assert.equal(tier2AmbiguousRes.isNew, true);
  assert.equal(
    tier2AmbiguousDb.capturedUpserts[0]?.payload.status,
    'draft',
    'Ambiguous Tier 2 similarity (0.65..0.69) must seed new Master Product as draft'
  );
  console.log('  ✅ [3/7] Tier 2 fuzzy match threshold & ambiguous draft fallback passed');

  // 4. Tier 3 Creation Status: benchmark_registry (new) -> published; non-new or crawled_title -> draft
  const tier3PublishedDb = createMockSupabase();
  const tier3PublishedMatcher = new EntityMatcher(tier3PublishedDb.client, offlineEnricher);
  await tier3PublishedMatcher.resolveOrCreateMasterProduct(s24New);
  assert.equal(
    tier3PublishedDb.capturedUpserts[0]?.payload.status,
    'published',
    'Verified benchmark_registry + new condition + confident storage must seed as published'
  );

  const tier3LikeNewDb = createMockSupabase();
  const tier3LikeNewMatcher = new EntityMatcher(tier3LikeNewDb.client, offlineEnricher);
  await tier3LikeNewMatcher.resolveOrCreateMasterProduct(likeNewCandidate);
  assert.equal(
    tier3LikeNewDb.capturedUpserts[0]?.payload.status,
    'draft',
    'Like-new / used listing must seed as draft even when model is in benchmark registry'
  );

  const unverifiedModelCandidate = normalizer.normalize(
    createShopeeListing('Điện thoại Tecno Camon 30 Premier 5G 12GB/512GB Chính hãng')
  );
  assert.equal(unverifiedModelCandidate.is_benchmark_enriched, false);
  assert.equal(unverifiedModelCandidate.spec_source, 'crawled_title');
  const tier3UnverifiedDb = createMockSupabase();
  const tier3UnverifiedMatcher = new EntityMatcher(tier3UnverifiedDb.client, offlineEnricher);
  await tier3UnverifiedMatcher.resolveOrCreateMasterProduct(unverifiedModelCandidate);
  assert.equal(
    tier3UnverifiedDb.capturedUpserts[0]?.payload.status,
    'draft',
    'Unverified crawled_title specs must seed as draft'
  );
  console.log('  ✅ [4/7] Tier 3 creation status rules (published vs draft) passed');

  // 5. Race Condition Winner Refetch
  const raceDb = createMockSupabase({
    upsertRows: [], // Empty array simulates ignoreDuplicates conflict when another worker won the race
    winnerRow: { id: 'winner-from-concurrent-worker' },
  });
  const raceMatcher = new EntityMatcher(raceDb.client, offlineEnricher);
  const raceRes = await raceMatcher.resolveOrCreateMasterProduct(s24New);
  assert.deepEqual(raceRes, {
    masterId: 'winner-from-concurrent-worker',
    isNew: false,
  });
  console.log('  ✅ [5/7] Concurrent worker race-condition winner refetch passed');

  // 6. Labeled Cross-Platform SKU Pair Precision / Recall Benchmark (Audit C6)
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const pair of LABELED_ENTITY_RESOLUTION_BENCHMARK) {
    const candA = normalizer.normalize(createShopeeListing(pair.titleA));
    const candB = normalizer.normalize(createShopeeListing(pair.titleB));
    const sameModelKey = candA.model_key === candB.model_key;
    const sameCondition = candA.condition === candB.condition;
    const incompatibleOrigin =
      (candA.origin === 'official_vna' && candB.origin === 'imported') ||
      (candA.origin === 'imported' && candB.origin === 'official_vna');
    const predictedMatch =
      sameModelKey &&
      sameCondition &&
      !incompatibleOrigin &&
      !candA.needs_review &&
      !candB.needs_review;

    if (pair.shouldMatchCanonicalCluster && predictedMatch) tp += 1;
    else if (!pair.shouldMatchCanonicalCluster && predictedMatch) fp += 1;
    else if (!pair.shouldMatchCanonicalCluster && !predictedMatch) tn += 1;
    else fn += 1;
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  assert.equal(precision, 1, `Expected 100% precision on SKU benchmark, got ${precision}`);
  assert.equal(recall, 1, `Expected 100% recall on SKU benchmark, got ${recall}`);
  assert.equal(f1, 1);
  assert.equal(tp + tn, LABELED_ENTITY_RESOLUTION_BENCHMARK.length);
  console.log(
    `  ✅ [6/7] Labeled SKU pair benchmark (${LABELED_ENTITY_RESOLUTION_BENCHMARK.length} pairs): Precision=${(precision * 100).toFixed(0)}%, Recall=${(recall * 100).toFixed(0)}%, F1=${(f1 * 100).toFixed(0)}%`
  );

  // 7. Audit C8, T15 & Low Verification (Zod 4 JSON Schema, URL/Phone Redaction, MasterProductSchema defaults, Structured Logger)
  const parsedMaster = MasterProductSchema.parse({
    id: '018f1a50-0000-7000-8000-000000000001',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    model_key: 'apple:iphone-16-pro-max:256gb',
    name: 'Apple iPhone 16 Pro Max 256GB',
    slug: 'apple-iphone-16-pro-max-256gb',
  });
  assert.equal(parsedMaster.status, 'draft');
  assert.equal(parsedMaster.average_rating, null);

  const reviewJsonSchema = getAiReviewBatchJsonSchema();
  assert.equal(reviewJsonSchema.type, 'object');
  assert.ok(reviewJsonSchema.properties && 'reviews' in (reviewJsonSchema.properties as object));

  const specJsonSchema = getAiSpecEnrichmentJsonSchema();
  assert.equal(specJsonSchema.type, 'object');
  assert.ok(specJsonSchema.properties && 'specifications' in (specJsonSchema.properties as object));

  const sanitizedSummary = sanitizeAiGeneratedText(
    '<b>Máy tốt</b> nhưng liên hệ Zalo 0912.345.678 hoặc +84 987 654 321 tại https://phishing.example.com/deal và shopee.vn/fake-shop để nhận quà!'
  );
  assert.ok(!sanitizedSummary.includes('0912.345.678'));
  assert.ok(!sanitizedSummary.includes('987 654 321'));
  assert.doesNotMatch(sanitizedSummary, /phishing\.example\.com/);
  assert.ok(!sanitizedSummary.includes('shopee.vn/fake-shop'));
  assert.ok(sanitizedSummary.includes('[phone-removed]'));
  assert.ok(sanitizedSummary.includes('[link-removed]'));

  const delay0 = computeRetryDelayMs(0, 250, 2000, () => 0.5);
  const delay1 = computeRetryDelayMs(1, 250, 2000, () => 0.5);
  assert.ok(delay0 >= 125 && delay0 <= 250);
  assert.ok(delay1 >= 250 && delay1 <= 500);

  const testLogger = createImporterLogger('TestComponent', {
    runId: 'run-test-1',
    platform: 'shopee',
  });
  const entry = testLogger.formatEntry(
    'info',
    'test.redaction',
    'Connecting via http://user1:pass1@proxy.vn:8080 with Bearer secret_token_123 for buyer@example.com',
    { apiKey: 'sk-1234567890abcdef' } // gitleaks:allow -- fake key for the redaction test
  );
  assert.equal(entry.service, '@repo/crawlers');
  assert.equal(entry.run_id, 'run-test-1');
  assert.ok(entry.message.includes('http://u***:p***@proxy.vn:8080'));
  assert.ok(entry.message.includes('Bearer [REDACTED]'));
  assert.ok(entry.message.includes('b***@example.com'));
  assert.equal(entry.meta?.apiKey, '[REDACTED]');
  console.log(
    '  ✅ [7/7] Zod 4 JSON Schema, URL/phone prompt-injection filter, MasterProductSchema defaults & structured logger passed'
  );

  console.log('🎉 All EntityMatcher & Open-Core Audit C6/C8/T15/Low tests passed!');
}

runEntityMatcherSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
