/**
 * Verification Suite for EntityMatcher 3-Tier Canonical Deduplication & Product Condition/Origin Safety (Audit C6, K4):
 * - Tier 1 deterministic model_key match
 * - Tier 2 pg_trgm fuzzy match (>= 0.70 accepted, 0.65..0.69 ambiguous -> seeded as draft)
 * - Tier 3 creation: benchmark_registry -> published; ai_unverified / crawled_title / non-new condition -> draft
 * - Race condition recovery: ignoreDuplicates winner refetch without overwriting status
 */
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { AiSpecEnricher } from '../ai-spec-enricher.js';
import type { ShopeeProduct } from '../types.js';

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
  } as unknown as SupabaseClient<any, 'rate'>;

  return { client, capturedUpserts, capturedRpcCalls };
}

async function runEntityMatcherSuite() {
  console.log('🧪 Running EntityMatcher 3-Tier & Condition/Origin Verification Suite (Audit C6)...');
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
  console.log('  ✅ [1/5] ProductCondition & ProductOrigin detection (Audit C6) passed');

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
  console.log('  ✅ [2/5] Tier 1 deterministic model_key match passed');

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
  console.log('  ✅ [3/5] Tier 2 fuzzy match threshold & ambiguous draft fallback passed');

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
  console.log('  ✅ [4/5] Tier 3 creation status rules (published vs draft) passed');

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
  console.log('  ✅ [5/5] Concurrent worker race-condition winner refetch passed');

  console.log('🎉 All EntityMatcher & Condition/Origin tests passed!');
}

runEntityMatcherSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
