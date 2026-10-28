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
  sanitizeHttpUrl,
  sanitizeHttpUrlList,
  toBoundedPositiveInt,
  toBoundedPositiveNumber,
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
  fuzzyMatches?: Array<{
    master_id: string;
    name: string;
    similarity: number;
    model_key?: string;
  }>;
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
  // "+" marks a Plus model and must not collapse onto the base model (#597).
  {
    id: 'pair-plus-1-redmi-note13-pro-plus-vs-pro',
    titleA: 'Xiaomi Redmi Note 13 Pro+ 5G 8GB 256GB Chính hãng',
    titleB: 'Xiaomi Redmi Note 13 Pro 5G 8GB 256GB Chính hãng',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-plus-2-s24-plus-sign-vs-s24',
    titleA: 'Samsung Galaxy S24+ 12GB 256GB Chính hãng',
    titleB: 'Samsung Galaxy S24 8GB 256GB Chính hãng',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-plus-4-redmi-note13-pro-plus-sign-vs-word',
    titleA: 'Xiaomi Redmi Note 13 Pro+ 5G 8GB 256GB Chính hãng',
    titleB: 'Xiaomi Redmi Note 13 Pro Plus 5G 8GB 256GB Chính hãng',
    shouldMatchCanonicalCluster: true,
  },
  {
    id: 'pair-plus-5-redmi-note13-pro-plus-word-vs-pro',
    titleA: 'Xiaomi Redmi Note 13 Pro Plus 5G 8GB 256GB Chính hãng',
    titleB: 'Xiaomi Redmi Note 13 Pro 5G 8GB 256GB Chính hãng',
    shouldMatchCanonicalCluster: false,
  },
  {
    id: 'pair-plus-3-s24-plus-sign-vs-word',
    titleA: 'Samsung Galaxy S24+ 12GB 256GB Chính hãng',
    titleB: 'Samsung Galaxy S24 Plus 12GB 256GB Chính hãng',
    shouldMatchCanonicalCluster: true,
  },
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
  assert.equal(
    normalizer.normalize(createShopeeListing('Xiaomi Redmi Note 13 8GB / 512 GB')).storage_gb,
    512
  );
  const longRunStart = Date.now();
  for (const marker of ['1', 'ROM:', 'dung lượng']) {
    normalizer.normalize(createShopeeListing(`Samsung Galaxy ${marker}${' '.repeat(50_000)}x`));
  }
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
  // DOS/Rate#1200 (#1105 option (a)): a title with no storage never links to a sized
  // master; it seeds a draft. A ':unknown' master still takes it, and earbuds keep
  // their legacy ':64gb' seed keys.
  const zenbookBare = normalizer.normalize(
    createShopeeListing('Laptop ASUS Zenbook S 14 UX5406AA-SU348W')
  );
  assert.equal(zenbookBare.storage_gb, null);
  const zenbook1tb = {
    master_id: 'master-zenbook-1tb',
    name: 'Asus Zenbook S 14 1TB',
    similarity: 0.86,
    model_key: 'asus:zenbook-s-14:1024gb',
  };
  const storagelessDb = createMockSupabase({ fuzzyMatches: [zenbook1tb] });
  const storagelessRes = await new EntityMatcher(
    storagelessDb.client,
    offlineEnricher
  ).resolveOrCreateMasterProduct(zenbookBare);
  assert.equal(storagelessRes.isNew, true, 'a storage-less title must not link to the 1TB master');
  assert.notEqual(storagelessRes.masterId, 'master-zenbook-1tb');
  assert.equal(storagelessDb.capturedUpserts[0]?.payload.model_key, 'asus:zenbook-s-14:unknown');
  assert.equal(storagelessDb.capturedUpserts[0]?.payload.status, 'draft');

  const unknownMasterRes = await new EntityMatcher(
    createMockSupabase({
      fuzzyMatches: [
        zenbook1tb,
        {
          master_id: 'master-zenbook-unknown',
          name: 'Asus Zenbook S 14',
          similarity: 0.8,
          model_key: 'asus:zenbook-s-14:unknown',
        },
      ],
    }).client,
    offlineEnricher
  ).resolveOrCreateMasterProduct(zenbookBare);
  assert.deepEqual(unknownMasterRes, { masterId: 'master-zenbook-unknown', isNew: false });

  // A title that states its storage matches a sized master as before.
  const zenbookSized = normalizer.normalize(
    createShopeeListing('Laptop ASUS Zenbook S 14 UX5406AA 32GB 1TB')
  );
  const sizedRes = await new EntityMatcher(
    createMockSupabase({ fuzzyMatches: [zenbook1tb] }).client,
    offlineEnricher
  ).resolveOrCreateMasterProduct(zenbookSized);
  assert.deepEqual(sizedRes, { masterId: 'master-zenbook-1tb', isNew: false });

  const earbuds = normalizer.normalize(createShopeeListing('Tai nghe Sony WF-1000XM5 chính hãng'));
  assert.equal(earbuds.storage_gb, null);
  const earbudsRes = await new EntityMatcher(
    createMockSupabase({
      fuzzyMatches: [
        {
          master_id: 'master-wf1000xm5',
          name: 'Sony WF-1000XM5',
          similarity: 0.9,
          model_key: 'sony:wf-1000xm5:64gb',
        },
      ],
    }).client,
    offlineEnricher
  ).resolveOrCreateMasterProduct(earbuds);
  assert.deepEqual(earbudsRes, { masterId: 'master-wf1000xm5', isNew: false });
  // Watches too: Series 10 has one storage and no only_storage_gb benchmark.
  const watch = normalizer.normalize(createShopeeListing('Apple Watch Series 10 42mm GPS'));
  assert.equal(watch.storage_gb, null);
  const watchRes = await new EntityMatcher(
    createMockSupabase({
      fuzzyMatches: [
        {
          master_id: 'master-series-10-42',
          name: 'Apple Watch Series 10 42mm',
          similarity: 0.9,
          model_key: 'apple:watch-series-10-42mm:64gb',
        },
      ],
    }).client,
    offlineEnricher
  ).resolveOrCreateMasterProduct(watch);
  assert.deepEqual(watchRes, { masterId: 'master-series-10-42', isNew: false });
  // DOS/Rate#1196: an unknown 5G stays null through the normalizer, the enricher and the
  // seed; known values are kept.
  const no5gInfo = normalizer.normalize(createShopeeListing('Samsung Galaxy A26 128GB'));
  assert.equal(no5gInfo.has_5g, null, 'a phone title with no 5G says nothing about it');
  assert.deepEqual(no5gInfo.specifications.cellular ?? {}, {});
  assert.equal(
    normalizer.normalize(createShopeeListing('Samsung Galaxy A26 5G 128GB')).has_5g,
    true
  );
  assert.equal(normalizer.normalize(createShopeeListing('Xiaomi Pad 7 128GB')).has_5g, null);
  assert.equal(
    normalizer.normalize(createShopeeListing('Laptop ASUS Vivobook 15 X1504VA 512GB')).has_5g,
    false
  );
  assert.equal(
    normalizer.normalize(createShopeeListing('Samsung Galaxy S24 Ultra 256GB')).has_5g,
    true,
    'a registry model keeps its known 5G'
  );
  const enrichedNo5g = await offlineEnricher.enrichCandidate(no5gInfo, 'Samsung Galaxy A26 128GB');
  assert.equal(enrichedNo5g.has_5g, null, 'the enricher must not turn an unknown 5G into false');
  assert.equal(
    (await offlineEnricher.enrichCandidate({ ...no5gInfo, has_5g: false })).has_5g,
    false
  );
  assert.equal((await offlineEnricher.enrichCandidate({ ...no5gInfo, has_5g: true })).has_5g, true);
  const no5gSeedDb = createMockSupabase();
  await new EntityMatcher(no5gSeedDb.client, offlineEnricher).resolveOrCreateMasterProduct(
    no5gInfo
  );
  assert.equal(no5gSeedDb.capturedUpserts[0]?.payload.has_5g, null);
  const known5gSeedDb = createMockSupabase();
  await new EntityMatcher(known5gSeedDb.client, offlineEnricher).resolveOrCreateMasterProduct(
    normalizer.normalize(createShopeeListing('Samsung Galaxy A26 5G 128GB'))
  );
  assert.equal(known5gSeedDb.capturedUpserts[0]?.payload.has_5g, true);
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

  // 8. DOS/Rate#821: Tier 2 malformed fuzzy row filtering, Tier 3 image/spec bounds, and enrichMasterProductById zero/out-of-bounds fallback
  assert.equal(sanitizeHttpUrl('https://rate.vn/img/a.png'), 'https://rate.vn/img/a.png');
  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeHttpUrl('[object Object]'), null);
  assert.deepEqual(
    sanitizeHttpUrlList([
      'https://rate.vn/img/1.png',
      '[object Object]',
      'javascript:alert(1)',
      'https://rate.vn/img/1.png',
    ]),
    ['https://rate.vn/img/1.png']
  );

  const malformedFuzzyDb = createMockSupabase({
    fuzzyMatches: [
      { master_id: '', name: 'Missing ID', similarity: 0.95 },
      { master_id: 'nan-sim', name: 'NaN Sim', similarity: Number.NaN },
      { master_id: 'valid-fuzzy-821', name: 'Samsung Galaxy S24 Ultra 256GB', similarity: 0.78 },
    ],
  });
  const malformedFuzzyMatcher = new EntityMatcher(malformedFuzzyDb.client, offlineEnricher);
  const malformedFuzzyRes = await malformedFuzzyMatcher.resolveOrCreateMasterProduct(s24New);
  assert.deepEqual(malformedFuzzyRes, { masterId: 'valid-fuzzy-821', isNew: false });

  const tier3BoundsDb = createMockSupabase();
  const tier3BoundsMatcher = new EntityMatcher(tier3BoundsDb.client, offlineEnricher);
  await tier3BoundsMatcher.resolveOrCreateMasterProduct({
    ...s24New,
    ram_gb: 0,
    storage_gb: 999_999,
    screen_size_inch: -5,
    battery_mah: 9_999_999,
    images: ['[object Object]', 'https://rate.vn/img/valid.png', 'javascript:void(0)'],
  });
  const seededRow = tier3BoundsDb.capturedUpserts[0]?.payload;
  assert.equal(seededRow?.ram_gb, null);
  assert.equal(seededRow?.storage_gb, null);
  assert.equal(seededRow?.screen_size_inch, null);
  assert.equal(seededRow?.battery_mah, null);
  assert.deepEqual(seededRow?.images, ['https://rate.vn/img/valid.png']);
  assert.equal(seededRow?.thumbnail, 'https://rate.vn/img/valid.png');

  let updatedRow821: Record<string, unknown> | undefined;
  let forwardedParams821: Record<string, unknown> | undefined;
  const enrichDb821 = {
    from(table: string) {
      assert.equal(table, 'master_products');
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: 'master-821',
                      brand: 'Samsung',
                      model: 'Galaxy S24 Ultra',
                      storage_gb: 0,
                      ram_gb: 99999,
                      screen_size_inch: 0,
                      battery_mah: -100,
                      has_5g: false,
                      name: 'Samsung Galaxy S24 Ultra 256GB',
                      description: '',
                      colors: ['Titanium Gray'],
                      specifications: { category_slug: 'smartphones' },
                      key_specs: {},
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updatedRow821 = payload;
          return {
            async eq() {
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as RateSupabaseClient;
  const stubEnricher821 = {
    async fetchSpecsFromAi(params: Record<string, unknown>) {
      forwardedParams821 = params;
      return {
        ram_gb: 12,
        storage_gb: 256,
        screen_size_inch: 6.8,
        battery_mah: 5000,
        has_5g: true,
        specifications: { display: { size_inch: 6.8 } },
        key_specs: { ram: '12GB' },
      };
    },
  } as unknown as AiSpecEnricher;
  const enrichMatcher821 = new EntityMatcher(enrichDb821, stubEnricher821);
  assert.equal(await enrichMatcher821.enrichMasterProductById('master-821'), true);
  assert.equal(forwardedParams821?.storageGb, null);
  assert.equal(forwardedParams821?.ramGb, null);
  assert.equal(updatedRow821?.ram_gb, 12);
  assert.equal(updatedRow821?.storage_gb, 256);
  assert.equal(updatedRow821?.screen_size_inch, 6.8);
  assert.equal(updatedRow821?.battery_mah, 5000);
  console.log('  ✅ [8/8] DOS/Rate#821 EntityMatcher bounds & HTTP URL sanitization passed');

  // 9. DOS/Rate#876: EntityMatcher URL C1 control/whitespace/port bounds, boolean numeric rejection & logger control-char sanitization
  assert.equal(
    sanitizeHttpUrl('https://rate.vn/img/\u0085bad.png'),
    null,
    'sanitizeHttpUrl must reject C1 control characters'
  );
  assert.equal(
    sanitizeHttpUrl('https://rate.vn/img/\u00A0bad.png'),
    null,
    'sanitizeHttpUrl must reject Unicode non-breaking space'
  );
  assert.equal(
    sanitizeHttpUrl('https://rate.vn:8443/img/bad.png'),
    null,
    'sanitizeHttpUrl must reject non-default ports'
  );
  assert.equal(
    toBoundedPositiveInt(true, 2048),
    null,
    'toBoundedPositiveInt must reject boolean true'
  );
  assert.equal(
    toBoundedPositiveNumber(true, 120),
    null,
    'toBoundedPositiveNumber must reject boolean true'
  );
  assert.equal(
    sanitizeAiGeneratedText('Máy\u0085rất\u0000tốt', Number.NaN),
    'Máy rất tốt',
    'sanitizeAiGeneratedText must strip C1 control chars and fall back to default maxLen when given NaN'
  );
  assert.equal(sanitizeAiGeneratedText('Máy rất tốt', true as unknown as number), 'Máy rất tốt');
  const ctrlLogger = createImporterLogger('Comp\u0000\nName', {
    runId: '  run\u0000\r\n123  ',
    jobId: '  job\u0085456  ',
    platform: '  shopee\u0007  ',
  });
  const ctrlEntry = ctrlLogger.formatEntry('info', '  evt\u0000\nname  ', 'ok');
  assert.equal(ctrlEntry.component, 'Comp Name');
  assert.equal(ctrlEntry.run_id, 'run 123');
  assert.equal(ctrlEntry.job_id, 'job 456');
  assert.equal(ctrlEntry.platform, 'shopee');
  assert.equal(ctrlEntry.event, 'evt name');
  console.log('  ✅ [9/9] DOS/Rate#876 EntityMatcher & Logger control-char/boolean bounds passed');

  // 10. DOS/Rate#1142: masters keep only the spec fields their category has.
  const enrichByCategory = async (
    row: Record<string, unknown>,
    aiResult: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined> => {
    let updated: Record<string, unknown> | undefined;
    const db = {
      from() {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          }),
          update(payload: Record<string, unknown>) {
            updated = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    } as unknown as RateSupabaseClient;
    const enricher = { fetchSpecsFromAi: async () => aiResult } as unknown as AiSpecEnricher;
    assert.equal(
      await new EntityMatcher(db, enricher).enrichMasterProductById(String(row.id)),
      true
    );
    return updated;
  };
  const phoneShapedAi = {
    ram_gb: 1,
    storage_gb: 64,
    screen_size_inch: 1,
    battery_mah: 515,
    has_5g: true,
    specifications: {
      display: { size_inch: 1, refresh_rate_hz: 60, ppi: 300 },
      hardware: { ram_gb: 1, storage_gb: 64, chipset: 'BES2700' },
      camera: { main_camera: '3 High-SNR Microphones' },
      cellular: { has_5g: true, bands_5g: 'n78', bands_4g: 'LTE' },
      battery: { capacity_mah: 515 },
      multimedia: { audio_features: 'ANC, LDAC' },
      connectivity: { bluetooth: '5.4', wlan: 'Auto Switch' },
    },
    key_specs: { screen: '1"', camera: 'Mic', ram: '1GB', storage: '64GB', battery: '515 mAh' },
  };
  const budsRow = await enrichByCategory(
    {
      id: 'buds-1142',
      brand: 'Samsung',
      model: 'Galaxy Buds3 Pro',
      name: 'Samsung Galaxy Buds3 Pro',
      ram_gb: 1,
      storage_gb: 64,
      screen_size_inch: 1,
      has_5g: false,
      specifications: { category_slug: 'earbuds', display: { size_inch: 1 } },
      key_specs: { ram: '1GB' },
    },
    phoneShapedAi
  );
  assert.equal(budsRow?.ram_gb, null, 'earbuds keep no RAM, even one stored before');
  assert.equal(budsRow?.storage_gb, null);
  assert.equal(budsRow?.screen_size_inch, null);
  assert.equal(budsRow?.has_5g, false);
  assert.equal(budsRow?.battery_mah, 515);
  const budsSpecs = budsRow?.specifications as Record<string, Record<string, unknown>>;
  assert.equal(budsSpecs.display, undefined);
  assert.deepEqual(budsSpecs.hardware, { chipset: 'BES2700' }, 'the audio chip stays');
  assert.equal(budsSpecs.camera, undefined);
  assert.equal(budsSpecs.cellular, undefined);
  assert.equal(budsSpecs.connectivity?.wlan, undefined);
  assert.equal(budsSpecs.connectivity?.bluetooth, '5.4');
  assert.equal(budsSpecs.multimedia?.audio_features, 'ANC, LDAC');
  assert.equal(budsSpecs.category_slug, 'earbuds');
  assert.deepEqual(budsRow?.key_specs, { battery: '515 mAh' });

  const watchRow = await enrichByCategory(
    {
      id: 'watch-1142',
      brand: 'Apple',
      model: 'Watch Ultra 2',
      name: 'Apple Watch Ultra 2 64GB',
      storage_gb: 64,
      has_5g: true,
      specifications: { category_slug: 'smartwatches' },
      key_specs: {},
    },
    phoneShapedAi
  );
  // A watch keeps its stored 5G facts (a few models have RedCap 5G); only the
  // page hides them, and the camera it cannot have is dropped.
  assert.equal(watchRow?.has_5g, true);
  assert.equal(watchRow?.storage_gb, 64);
  const watchSpecs = watchRow?.specifications as Record<string, Record<string, unknown>>;
  assert.equal(watchSpecs.camera, undefined);
  assert.equal(watchSpecs.cellular?.has_5g, true);
  assert.equal(watchSpecs.cellular?.bands_5g, 'n78');
  assert.equal(watchSpecs.cellular?.bands_4g, 'LTE');
  assert.equal(watchSpecs.display?.size_inch, 1);

  // A category guessed from the title does not scope the write: a master
  // without a stored category keeps its RAM even when its name says "tai nghe".
  const guessedRow = await enrichByCategory(
    {
      id: 'guess-1142',
      brand: 'Samsung',
      model: 'Galaxy S25',
      name: 'Samsung Galaxy S25 tặng tai nghe Galaxy Buds',
      ram_gb: 12,
      storage_gb: 256,
      has_5g: true,
      specifications: {},
      key_specs: {},
    },
    phoneShapedAi
  );
  assert.equal(guessedRow?.ram_gb, 12);
  assert.equal(guessedRow?.storage_gb, 256);
  assert.equal(guessedRow?.has_5g, true);

  const budsInsertDb = createMockSupabase();
  await new EntityMatcher(budsInsertDb.client, offlineEnricher).resolveOrCreateMasterProduct({
    ...s24New,
    model_key: 'samsung:galaxy-buds3-pro',
    category_slug: 'earbuds',
    ram_gb: 1,
    storage_gb: 64,
    screen_size_inch: 1,
    has_5g: true,
  });
  const budsInsert = budsInsertDb.capturedUpserts[0]?.payload;
  assert.equal(budsInsert?.ram_gb, null);
  assert.equal(budsInsert?.storage_gb, null);
  assert.equal(budsInsert?.screen_size_inch, null);
  assert.equal(budsInsert?.has_5g, false);
  console.log('  ✅ [10/10] DOS/Rate#1142 category spec templates on master writes passed');
  console.log('🎉 All EntityMatcher & Open-Core Audit C6/C8/T15/Low tests passed!');
}

runEntityMatcherSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
