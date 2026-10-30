/**
 * Verification Suite for ShopeeIngestionPipeline (Audit C5, M7, #280):
 * 1. platformReviewIdFor collision resistance on masked authors across variations/ratings/timestamps
 * 2. init() category lookup error propagation (prevents silent null category_id writes)
 * 3. masterIdHint preservation vs DB error abort vs fallback to EntityMatcher
 * 4. Smart Delta Price Compression via record_price_observation RPC + client-side 7-day fallback & 23505 race recovery
 * 5. Review batch deduplication, 23505 unique-index race retry pass, is_verified_buyer refresh & AiReviewAnalyzer integration
 */
import assert from 'node:assert/strict';
import { trimTrailingSlashes } from '../ai-spec-enricher.js';
import { errorDetail } from '../logger.js';
import {
  ShopeeIngestionPipeline,
  hasPopulatedSpecificationGroups,
  titleNamesStorage,
  titleStorageSizesGb,
  normalizeScrapedProductPrices,
  platformReviewIdFor,
} from '../shopee-to-supabase.js';
import { UnkeyableProductTitleError } from '../product-normalizer.js';
import type { RateSupabaseClient, ShopeeProduct, ShopeeReview } from '../types.js';

function createBaseProduct(overrides: Partial<ShopeeProduct> = {}): ShopeeProduct {
  return {
    platform: 'shopee',
    itemId: 'item-280',
    shopId: 'shop-280',
    title: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
    description: 'Chip A18 Pro, Màn hình 6.9 inch, Pin 4685 mAh',
    priceMin: 28990000,
    priceMax: 28990000,
    priceBeforeDiscount: 31990000,
    currency: 'VND',
    stock: 15,
    historicalSold: 120,
    ratingStar: 4.9,
    ratingCount: 40,
    images: ['https://rate.vn/img/ip16pm.png'],
    models: [{ modelId: 'm-1', name: 'Titan Tự Nhiên - 256GB', price: 28990000, stock: 15 }],
    attributes: [],
    shop: {
      shopId: 'shop-280',
      name: 'Apple Flagship Store',
      isMall: true,
      ratingStar: 4.9,
      followerCount: 250000,
      location: 'TP. Hồ Chí Minh',
    },
    reviews: [],
    url: 'https://shopee.vn/product/shop-280/item-280',
    ...overrides,
  };
}

interface StubPipelineOptions {
  categoriesErr?: { message: string } | null;
  hintRow?: { id: string; storage_gb?: number | null } | null;
  hintErr?: { message: string } | null;
  exactMasterRow?: { id: string; name: string; model_key: string } | null;
  recordPriceRpcResult?: { data: string | null; error: { code?: string; message: string } | null };
  latestPriceObs?: Array<{
    observation_id: string;
    price: number;
    price_original: number | null;
    recorded_at: string;
  }>;
  existingPriceObs?: Array<{ observation_id: string }>;
  latestPriceObsErr?: { code?: string; message: string } | null;
  priceInsertErr?: { code?: string; message: string } | null;
  initialExistingReviewIds?: string[];
  afterRaceExistingReviewIds?: string[];
  firstReviewInsertRace?: boolean;
}

function createPipelineStubSupabase(opts: StubPipelineOptions = {}) {
  const events: {
    merchantUpserts: number;
    merchantPayloads: Array<Record<string, unknown>>;
    merchantUpdates: Array<Record<string, unknown>>;
    productUpserts: Array<Record<string, unknown>>;
    priceRpcCalls: Array<Record<string, unknown>>;
    priceInserts: Array<Record<string, unknown>>;
    reviewInserts: Array<Array<Record<string, unknown>>>;
    verifiedUpdates: Array<{ verified: boolean; ids: string[] }>;
    marketStatsRefreshed: string[];
  } = {
    merchantUpserts: 0,
    merchantPayloads: [],
    merchantUpdates: [],
    productUpserts: [],
    priceRpcCalls: [],
    priceInserts: [],
    reviewInserts: [],
    verifiedUpdates: [],
    marketStatsRefreshed: [],
  };

  let reviewSelectPass = 0;
  let reviewInsertPass = 0;

  const stub = {
    from(table: string) {
      if (table === 'categories') {
        return {
          select(_cols: string) {
            return Promise.resolve({
              data: opts.categoriesErr
                ? null
                : [
                    { id: 'cat-smartphones', slug: 'smartphones' },
                    { id: 'cat-laptops', slug: 'laptops' },
                  ],
              error: opts.categoriesErr ?? null,
            });
          },
        };
      }

      if (table === 'merchants') {
        return {
          upsert(payload: Record<string, unknown>, _options?: unknown) {
            events.merchantUpserts += 1;
            events.merchantPayloads.push(payload);
            return {
              select(_cols: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: 'merchant-uuid-1' },
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            events.merchantUpdates.push(payload);
            return {
              eq(_col: string, _val: string) {
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === 'master_products') {
        return {
          select(cols: string) {
            return {
              eq(col: string, val: string) {
                return {
                  maybeSingle() {
                    if (col === 'id' && (cols === 'id' || cols.startsWith('id, specifications'))) {
                      return Promise.resolve({
                        data: opts.hintRow ?? null,
                        error: opts.hintErr ?? null,
                      });
                    }
                    if (col === 'id' && cols === 'min_price') {
                      return Promise.resolve({
                        data: { min_price: 28990000 },
                        error: null,
                      });
                    }
                    if (col === 'model_key') {
                      return Promise.resolve({
                        data: opts.exactMasterRow ?? {
                          id: 'master-exact-1',
                          name: 'Apple iPhone 16 Pro Max 256GB',
                          model_key: val,
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
          update(_payload: Record<string, unknown>) {
            return {
              eq(_col: string, _val: string) {
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === 'products') {
        return {
          upsert(payload: Record<string, unknown>, _options?: unknown) {
            events.productUpserts.push(payload);
            return {
              select(_cols: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: 'product-uuid-1' },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'price_history') {
        return {
          select(cols: string) {
            return {
              eq(col: string, _val: string) {
                if (col === 'product_id' && cols.includes('recorded_at')) {
                  return {
                    order(_orderCol: string, _orderOpts: unknown) {
                      return {
                        limit(_n: number) {
                          return Promise.resolve({
                            data: opts.latestPriceObsErr ? null : (opts.latestPriceObs ?? []),
                            error: opts.latestPriceObsErr ?? null,
                          });
                        },
                      };
                    },
                  };
                }
                return {
                  limit(_n: number) {
                    return Promise.resolve({
                      data: opts.existingPriceObs ?? [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            events.priceInserts.push(payload);
            return Promise.resolve({
              data: null,
              error: opts.priceInsertErr ?? null,
            });
          },
        };
      }

      if (table === 'reviews') {
        return {
          select(cols: string) {
            if (cols === 'platform_review_id') {
              return {
                eq(_col: string, _val: string) {
                  // Like PostgREST: filter by the requested ids, and never
                  // return more than max-rows (1000) in one response.
                  const respond = (ids: string[], requested?: string[]) => {
                    const stored = requested ? ids.filter(id => requested.includes(id)) : ids;
                    return Promise.resolve({
                      data: stored.slice(0, 1000).map(id => ({ platform_review_id: id })),
                      error: null,
                    });
                  };
                  const storedNow = () =>
                    reviewSelectPass === 1
                      ? (opts.initialExistingReviewIds ?? [])
                      : (opts.afterRaceExistingReviewIds ?? []);
                  return {
                    not(_notCol: string, _op: string, _notVal: unknown) {
                      reviewSelectPass += 1;
                      return respond(storedNow());
                    },
                    in(_inCol: string, requested: string[]) {
                      // The race refetch is the first lookup after an insert.
                      if (reviewInsertPass > 0 && reviewSelectPass === 1) {
                        reviewSelectPass = 2;
                      } else if (reviewSelectPass === 0) {
                        reviewSelectPass = 1;
                      }
                      return respond(storedNow(), requested);
                    },
                  };
                },
              };
            }
            return {
              eq(_col: string, _val: string) {
                return {
                  order(_orderCol: string, _orderOpts: unknown) {
                    return {
                      limit(_n: number) {
                        return Promise.resolve({
                          data: [
                            {
                              id: 'db-rev-1',
                              platform_review_id: 'rev-explicit-1',
                              author_name: 'Minh Anh',
                              rating_star: 5,
                              comment:
                                'Máy chính hãng VN/A nguyên seal, màn hình 120Hz mượt, pin dùng hơn 1 ngày rất trâu.',
                              variation: 'Titan Tự Nhiên - 256GB',
                              images: [],
                              is_verified_buyer: true,
                              reviewer_type: 'user',
                              upvotes: 3,
                              downvotes: 0,
                              report_count: 0,
                              platform_created_at: '2026-10-01T10:00:00.000Z',
                            },
                          ],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
          insert(rows: Array<Record<string, unknown>>) {
            reviewInsertPass += 1;
            events.reviewInserts.push(rows);
            if (opts.firstReviewInsertRace && reviewInsertPass === 1) {
              return Promise.resolve({
                data: null,
                error: {
                  code: '23505',
                  message:
                    'duplicate key value violates unique constraint "reviews_product_platform_review_idx"',
                },
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          update(payload: Record<string, unknown>) {
            return {
              eq(_col: string, _val: string) {
                if ('is_verified_buyer' in payload) {
                  return {
                    in(_inCol: string, ids: string[]) {
                      events.verifiedUpdates.push({
                        verified: Boolean(payload.is_verified_buyer),
                        ids,
                      });
                      return Promise.resolve({ data: null, error: null });
                    },
                  };
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === 'review_flags' || table === 'review_analysis') {
        return {
          // persistAnalysisToSupabase reads flags written by other detectors first.
          select(_columns: string) {
            return {
              in(_column: string, _ids: unknown[]) {
                return {
                  in(_detectorColumn: string, _detectors: unknown[]) {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
          upsert(_payload: unknown, _options?: unknown) {
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`Unexpected table in stub: ${table}`);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'refresh_master_market_stats') {
        events.marketStatsRefreshed.push(String(args.p_master_id));
        return { data: null, error: null };
      }
      if (fn === 'record_price_observation') {
        events.priceRpcCalls.push(args);
        if (opts.recordPriceRpcResult) {
          return opts.recordPriceRpcResult;
        }
        return { data: 'inserted', error: null };
      }
      if (fn === 'refresh_master_review_stats' || fn === 'refresh_merchant_risk_score') {
        return { data: null, error: null };
      }
      throw new Error(`Unexpected RPC in stub: ${fn}`);
    },
  } as unknown as RateSupabaseClient;

  return { stub, events };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Running ShopeeIngestionPipeline Deterministic Verification Suite');
  console.log('================================================================');

  // 1. platformReviewIdFor collision resistance for masked authors
  const maskedReviewA: ShopeeReview = {
    reviewId: '',
    author: 'n*****3',
    ratingStar: 5,
    comment: '',
    variation: 'Titan Tự Nhiên - 256GB',
    images: [],
    createdAt: '2026-10-01T08:00:00Z',
  };
  const maskedReviewB: ShopeeReview = {
    reviewId: '',
    author: 'n*****3',
    ratingStar: 4,
    comment: '',
    variation: 'Titan Đen - 512GB',
    images: [],
    createdAt: '2026-10-02T09:30:00Z',
  };
  const idA = platformReviewIdFor(maskedReviewA);
  const idB = platformReviewIdFor(maskedReviewB);
  assert.notEqual(
    idA,
    idB,
    'Masked authors with empty/identical comments but different ratings/variations/timestamps must not collide'
  );
  assert.equal(
    platformReviewIdFor({ ...maskedReviewA }),
    idA,
    'Identical fallback review must produce a deterministic hash'
  );
  assert.equal(
    platformReviewIdFor({ ...maskedReviewA, reviewId: 'sp-rev-999' }),
    'sp-rev-999',
    'Explicit platform reviewId must take precedence over fallback hash'
  );
  assert.equal(trimTrailingSlashes('https://api.dos.ai/v1///'), 'https://api.dos.ai/v1');
  assert.equal(
    trimTrailingSlashes(`https://api.dos.ai/${'/'.repeat(5000)}v1///`),
    `https://api.dos.ai/${'/'.repeat(5000)}v1`,
    'trimTrailingSlashes must run in linear time without polynomial regex backtracking'
  );
  console.log(
    '  ✅ [1/6] platformReviewIdFor masked-author collision resistance & linear-time URL normalization passed'
  );

  // 2. init() category lookup error propagation
  const { stub: errCatStub } = createPipelineStubSupabase({
    categoriesErr: { message: 'connection reset by peer' },
  });
  const errCatPipeline = new ShopeeIngestionPipeline({
    supabaseClient: errCatStub,
    apiKey: '',
  });
  await assert.rejects(
    () => errCatPipeline.ingestProduct(createBaseProduct()),
    /Failed to initialize categories: connection reset by peer/,
    'init() must propagate categories query failure instead of writing null category_id'
  );
  console.log('  ✅ [2/6] init() category error propagation passed');

  // 3. masterIdHint preservation vs DB error abort
  const { stub: hintErrStub } = createPipelineStubSupabase({
    hintErr: { message: 'statement timeout on master_products' },
  });
  const hintErrPipeline = new ShopeeIngestionPipeline({
    supabaseClient: hintErrStub,
    apiKey: '',
  });
  await assert.rejects(
    () =>
      hintErrPipeline.ingestProduct(createBaseProduct(), undefined, {
        masterIdHint: 'master-hint-123',
      }),
    /Failed to verify masterIdHint \(master-hint-123\): statement timeout on master_products/,
    'masterIdHint DB error must abort instead of falling through and splitting cluster'
  );

  // A hint to a master that no longer exists is logged, then matched from the title
  // (DOS/Rate#1432).
  const { stub: hintMissingStub } = createPipelineStubSupabase({ hintRow: null });
  const warned: string[] = [];
  const originalWarn = console.warn;
  console.warn = (line: unknown) => {
    warned.push(String(line));
  };
  try {
    await new ShopeeIngestionPipeline({
      supabaseClient: hintMissingStub,
      apiKey: '',
    }).ingestProduct(createBaseProduct(), undefined, { masterIdHint: 'master-gone-1' });
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    warned.some(
      line => line.includes('ingest.master_hint_missing') && line.includes('master-gone-1')
    ),
    'a hint that matches no master is logged'
  );

  const { stub: hintOkStub, events: hintOkEvents } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-verified' },
  });
  const hintOkPipeline = new ShopeeIngestionPipeline({
    supabaseClient: hintOkStub,
    apiKey: '',
  });
  const hintedRes = await hintOkPipeline.ingestProduct(createBaseProduct(), undefined, {
    masterIdHint: 'master-hint-verified',
  });
  assert.equal(hintedRes.masterId, 'master-hint-verified');
  // An accessory found by a crawl for the device is rejected even with the device's hint,
  // before anything is written (DOS/Rate#1505).
  const { stub: accessoryStub, events: accessoryEvents } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-verified' },
  });
  await assert.rejects(
    new ShopeeIngestionPipeline({ supabaseClient: accessoryStub, apiKey: '' }).ingestProduct(
      createBaseProduct({ title: 'Ốp lưng iPad Pro M4 256GB' }),
      undefined,
      { masterIdHint: 'master-hint-verified' }
    ),
    UnkeyableProductTitleError
  );
  assert.equal(accessoryEvents.productUpserts.length, 0);
  assert.equal(hintOkEvents.productUpserts[0]?.cluster_id, 'master-hint-verified');
  assert.equal(hintOkEvents.productUpserts[0]?.category_id, 'cat-smartphones');
  assert.equal(
    hintOkEvents.productUpserts[0]?.historical_sold_display,
    null,
    'An exact sold count stores no label'
  );
  const { stub: labelStub, events: labelEvents } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-verified' },
  });
  await new ShopeeIngestionPipeline({ supabaseClient: labelStub, apiKey: '' }).ingestProduct(
    { ...createBaseProduct(), historicalSold: 20000, historicalSoldDisplay: '20k+' },
    undefined,
    { masterIdHint: 'master-hint-verified' }
  );
  assert.equal(labelEvents.productUpserts[0]?.historical_sold, 20000);
  assert.equal(
    labelEvents.productUpserts[0]?.historical_sold_display,
    '20k+',
    'A sold label (floor) is stored next to the count (DOS/Rate-Services#201)'
  );
  const { stub: badLabelStub, events: badLabelEvents } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-verified' },
  });
  await new ShopeeIngestionPipeline({ supabaseClient: badLabelStub, apiKey: '' }).ingestProduct(
    { ...createBaseProduct(), historicalSoldDisplay: 'x'.repeat(40) },
    undefined,
    { masterIdHint: 'master-hint-verified' }
  );
  assert.equal(
    badLabelEvents.productUpserts[0]?.historical_sold_display,
    null,
    'A malformed label is dropped instead of failing the ingest'
  );

  // A hint whose master has another storage than the page states is not
  // applied: the listing is matched normally (DOS/Rate#1197).
  const { stub: conflictStub, events: conflictEvents } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-512', storage_gb: 512 },
  });
  const conflictRes = await new ShopeeIngestionPipeline({
    supabaseClient: conflictStub,
    apiKey: '',
  }).ingestProduct(
    createBaseProduct({
      title: 'Điện thoại Apple iPhone 16 Pro Max 1TB Chính hãng VN/A',
      models: [{ modelId: 'm-1', name: 'Titan Tự Nhiên - 1TB', price: 28990000, stock: 15 }],
    }),
    undefined,
    { masterIdHint: 'master-hint-512' }
  );
  assert.notEqual(
    conflictRes.masterId,
    'master-hint-512',
    'a 1TB page must not join the 512GB master'
  );
  assert.equal(conflictRes.masterId, 'master-exact-1', 'it falls back to normal matching');
  assert.equal(conflictEvents.productUpserts[0]?.cluster_id, 'master-exact-1');
  // The master it left gets its stats refreshed too.
  assert.ok(conflictEvents.marketStatsRefreshed.includes('master-hint-512'));
  assert.ok(conflictEvents.marketStatsRefreshed.includes('master-exact-1'));

  // A title that also names the hinted size is no conflict.
  assert.equal(titleNamesStorage('iPhone 16 Pro Max 256/512GB', 256), true);
  assert.equal(titleNamesStorage('iPhone 16 Pro Max 256/512GB', 512), true);
  assert.equal(titleNamesStorage('ThinkPad X1 Carbon Gen 12 1TB SSD', 1024), true);
  assert.equal(titleNamesStorage('ThinkPad X1 Carbon Gen 12 1TB SSD', 512), false);
  assert.equal(titleNamesStorage('Model 2512GB', 512), false);
  assert.equal(titleNamesStorage('Model 1.5TB', 512), false);
  assert.equal(titleNamesStorage('Galaxy S25 128/256/512GB', 128), true);
  assert.equal(titleNamesStorage('Ổ cứng 1/2TB', 1024), true);
  assert.equal(titleNamesStorage('SSD 1.5/2TB', 1536), true);
  assert.equal(titleNamesStorage('iPhone 512GB/1TB', 1024), true);
  // RAM and digits glued to a model name are not storage.
  assert.equal(titleNamesStorage('Laptop Lenovo ThinkPad P16 64GB RAM 1TB SSD', 64), false);
  assert.equal(titleNamesStorage('Laptop RAM 16GB SSD 512GB', 16), false);
  assert.equal(titleNamesStorage('Tecno Spark64/128GB', 64), false);
  assert.deepEqual(titleStorageSizesGb('Laptop Lenovo ThinkPad P16 64GB RAM 1TB SSD'), [1024]);
  for (const [title, sizes] of [
    ['Laptop SSD512/1024GB', [512, 1024]],
    ['Samsung Galaxy A55 ROM128/256GB', [128, 256]],
    ['Laptop ASUS Zenbook S 14 UX5406AA SSD 512GB RAM 16GB', [512]],
    ['Laptop RAM: 64GB SSD 1TB', [1024]],
    ['Laptop RAM 16GB SSD 512GB', [512]],
    ['Redmi 12+256GB', [12, 256]],
    ['iPhone 256GB | 512GB', [256, 512]],
    ['Ổ cứng 1 TB', [1024]],
    ['Galaxy S25 128 / 256 / 512GB', [128, 256, 512]],
    ['Laptop Lenovo ThinkPad P16 SSD 1TB 64GB RAM', [1024]],
    ['Apple iPhone 16 Pro Max 256/512GB-VN/A', [256, 512]],
    ['Laptop 64GB RAM 1TB SSD', [1024]],
    ['iPhone 16 Pro 1TB.', [1024]],
  ] as const) {
    assert.deepEqual(titleStorageSizesGb(title), sizes, title);
  }
  // Linear in the title: no backtracking blow-up on a long slash list.
  const longTitle = `Laptop ASUS Zenbook S 14 UX5406AA SSD 1TB ${'128 / '.repeat(400)}X`;
  const started = performance.now();
  titleStorageSizesGb(longTitle);
  assert.ok(performance.now() - started < 50, 'size scan stays fast');
  const { stub: listStub } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-256', storage_gb: 256 },
  });
  const listRes = await new ShopeeIngestionPipeline({
    supabaseClient: listStub,
    apiKey: '',
  }).ingestProduct(
    createBaseProduct({ title: 'Điện thoại Apple iPhone 16 Pro Max 256/512GB Chính hãng VN/A' }),
    undefined,
    { masterIdHint: 'master-hint-256' }
  );
  assert.equal(listRes.masterId, 'master-hint-256');

  // A page that states no storage keeps the hint.
  const { stub: noStorageStub } = createPipelineStubSupabase({
    hintRow: { id: 'master-hint-512', storage_gb: 512 },
  });
  const noStorageRes = await new ShopeeIngestionPipeline({
    supabaseClient: noStorageStub,
    apiKey: '',
  }).ingestProduct(
    createBaseProduct({
      title: 'Điện thoại Apple iPhone 16 Pro Max Chính hãng VN/A',
      models: [{ modelId: 'm-1', name: 'Titan Tự Nhiên', price: 28990000, stock: 15 }],
    }),
    undefined,
    { masterIdHint: 'master-hint-512' }
  );
  assert.equal(noStorageRes.masterId, 'master-hint-512');

  // The same storage, or a master with no storage, keeps the hint too.
  for (const storage_gb of [256, null]) {
    const { stub: sameStub } = createPipelineStubSupabase({
      hintRow: { id: 'master-hint-256', storage_gb },
    });
    const sameRes = await new ShopeeIngestionPipeline({
      supabaseClient: sameStub,
      apiKey: '',
    }).ingestProduct(createBaseProduct(), undefined, { masterIdHint: 'master-hint-256' });
    assert.equal(sameRes.masterId, 'master-hint-256', `hint kept for storage_gb=${storage_gb}`);
  }
  console.log('  ✅ [3/6] masterIdHint preservation & DB error abort passed');

  // 4. Smart Delta Price Compression: client-side 7-day fallback & 23505 race recovery
  const recentAnchor = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { stub: deltaSkipStub, events: deltaSkipEvents } = createPipelineStubSupabase({
    recordPriceRpcResult: {
      data: null,
      error: { code: 'PGRST202', message: 'function record_price_observation does not exist' },
    },
    latestPriceObs: [
      {
        observation_id: 'px-prev',
        price: 28990000,
        price_original: 31990000,
        recorded_at: recentAnchor,
      },
    ],
  });
  const deltaSkipPipeline = new ShopeeIngestionPipeline({
    supabaseClient: deltaSkipStub,
    apiKey: '',
  });
  await deltaSkipPipeline.ingestProduct(createBaseProduct());
  assert.equal(
    deltaSkipEvents.priceInserts.length,
    0,
    'Client-side 7-day delta compression must skip redundant price_history insert when price is unchanged'
  );

  const { stub: priceRaceStub, events: priceRaceEvents } = createPipelineStubSupabase({
    recordPriceRpcResult: {
      data: null,
      error: { code: 'PGRST202', message: 'function record_price_observation does not exist' },
    },
    latestPriceObs: [],
    existingPriceObs: [],
    priceInsertErr: { code: '23505', message: 'duplicate key value violates unique constraint' },
  });
  const priceRacePipeline = new ShopeeIngestionPipeline({
    supabaseClient: priceRaceStub,
    apiKey: '',
  });
  await priceRacePipeline.ingestProduct(createBaseProduct());
  assert.equal(
    priceRaceEvents.priceInserts.length,
    1,
    'Concurrent 23505 price observation insert race must be treated as dedupe without throwing'
  );
  // A failed read of the last observation stops the listing instead of writing a
  // blind, possibly redundant history row, and names the product (DOS/Rate#1431).
  const { stub: obsErrStub, events: obsErrEvents } = createPipelineStubSupabase({
    recordPriceRpcResult: {
      data: null,
      error: { code: 'PGRST202', message: 'function record_price_observation does not exist' },
    },
    latestPriceObsErr: { code: '57014', message: 'canceling statement due to statement timeout' },
  });
  await assert.rejects(
    () =>
      new ShopeeIngestionPipeline({ supabaseClient: obsErrStub, apiKey: '' }).ingestProduct(
        createBaseProduct()
      ),
    /Failed to read the latest price observation \(product product-uuid-1\): canceling statement due to statement timeout \(code 57014\)/
  );
  assert.equal(obsErrEvents.priceInserts.length, 0, 'no blind price_history insert');
  // Error text carries the code when there is one, and names a missing row.
  assert.equal(errorDetail({ message: 'boom', code: '23505' }), ': boom (code 23505)');
  assert.equal(errorDetail({ message: 'boom' }), ': boom');
  assert.equal(errorDetail(null), ': no row returned');
  console.log('  ✅ [4/6] Smart Delta Price Compression & 23505 race recovery passed');

  // 5. Review deduplication, 23505 race retry pass, is_verified_buyer refresh & section reporting
  const reportedSections: string[] = [];
  const { stub: revRaceStub, events: revRaceEvents } = createPipelineStubSupabase({
    initialExistingReviewIds: ['rev-already-stored'],
    afterRaceExistingReviewIds: ['rev-already-stored', 'rev-raced-by-other-worker'],
    firstReviewInsertRace: true,
  });
  const revRacePipeline = new ShopeeIngestionPipeline({
    supabaseClient: revRaceStub,
    apiKey: '',
  });
  await revRacePipeline.ingestProduct(
    createBaseProduct({
      reviews: [
        {
          reviewId: 'rev-already-stored',
          author: 'User 1',
          ratingStar: 5,
          comment: 'Đã có trong DB',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
        {
          reviewId: 'rev-raced-by-other-worker',
          author: 'User 2',
          ratingStar: 5,
          comment: 'Worker khác vừa chèn xong',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
        {
          reviewId: 'rev-explicit-1',
          author: 'Minh Anh',
          ratingStar: 5,
          comment: 'Review mới còn lại sau khi lọc race',
          images: [],
          reviewer: { verifiedPurchase: false },
        },
      ],
    }),
    async section => {
      reportedSections.push(section);
    }
  );
  assert.equal(
    revRaceEvents.reviewInserts.length,
    2,
    'Must retry review insert once after 23505 race'
  );
  assert.equal(
    revRaceEvents.reviewInserts[0]?.length,
    2,
    'Pass 1 should attempt the 2 reviews not in initialExistingReviewIds'
  );
  assert.equal(
    revRaceEvents.reviewInserts[1]?.length,
    1,
    'Pass 2 should insert only the remaining non-raced review'
  );
  assert.equal(revRaceEvents.reviewInserts[1]?.[0]?.platform_review_id, 'rev-explicit-1');
  assert.equal(
    revRaceEvents.verifiedUpdates.length,
    2,
    'Must refresh both verified=true and verified=false cohorts'
  );
  assert.deepEqual(reportedSections, ['merchant', 'master', 'listing', 'price', 'reviews']);
  // The shop upsert carries only the shop's own fields, never metadata or
  // review_risk_*: Rate Services' auditor owns the merchant review risk
  // (DOS/Rate#1341). This stub does not reach the review analysis; that path
  // (persistAnalysisToSupabase, scoreSellerReviewRisk) is checked in
  // test-review-analyzer.ts and backfill-review-risk.test.ts.
  assert.deepEqual(revRaceEvents.merchantUpdates, [], 'no merchants update');
  const MERCHANT_UPSERT_KEYS = [
    'entity_hash',
    'follower_count',
    'is_official',
    'location',
    'name',
    'platform',
    'platform_shop_id',
    'rating_star',
    'updated_at',
    'url',
  ];
  assert.ok(revRaceEvents.merchantPayloads.length > 0);
  for (const payload of revRaceEvents.merchantPayloads) {
    assert.deepEqual(Object.keys(payload).sort(), MERCHANT_UPSERT_KEYS);
  }
  console.log(
    '  ✅ [5/6] Review deduplication, 23505 retry pass & verifiedPurchase refresh passed'
  );

  // A popular product already stores 1200 reviews: more than PostgREST returns
  // in one response. A re-crawled review stored past that cap must still be
  // recognized as a duplicate instead of failing the insert with 23505.
  const { stub: manyStub, events: manyEvents } = createPipelineStubSupabase({
    initialExistingReviewIds: Array.from({ length: 1200 }, (_, i) => `old-${i + 1}`),
  });
  const manyPipeline = new ShopeeIngestionPipeline({ supabaseClient: manyStub, apiKey: '' });
  await manyPipeline.ingestProduct(
    createBaseProduct({
      reviews: [
        {
          reviewId: 'old-1150',
          author: 'User cũ',
          ratingStar: 4,
          comment: 'Review đã lưu từ trước, nằm sau giới hạn 1000 dòng',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
        {
          reviewId: 'brand-new',
          author: 'User mới',
          ratingStar: 5,
          comment: 'Review mới của lần crawl này',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
      ],
    })
  );
  assert.equal(manyEvents.reviewInserts.length, 1, 'One insert, no duplicate-key retry');
  assert.deepEqual(
    manyEvents.reviewInserts[0]?.map(r => r.platform_review_id),
    ['brand-new'],
    'A stored review past the 1000-row cap is still skipped'
  );
  console.log('  ✅ [6/6] Duplicate detection past the 1000-row cap passed');

  // 7. DOS/Rate#821: normalizeScrapedProductPrices HTTP URL sanitization and ingestProduct unpriced rejection
  const sanitizedProduct = normalizeScrapedProductPrices({
    ...createBaseProduct(),
    images: ['[object Object]', 'https://rate.vn/img/clean.png', 'javascript:alert(1)'],
    shop: {
      ...createBaseProduct().shop,
      url: 'javascript:alert(1)',
    },
    reviews: [
      {
        reviewId: 'rev-821',
        author: 'Tester',
        authorAvatar: 'data:image/png;base64,AAAA',
        ratingStar: 5,
        comment: 'Good',
        images: ['[object Object]', 'https://rate.vn/img/rev.png'],
      },
    ],
  });
  assert.deepEqual(sanitizedProduct.images, ['https://rate.vn/img/clean.png']);
  assert.equal(sanitizedProduct.shop.url, undefined);
  assert.equal(sanitizedProduct.reviews[0]?.authorAvatar, undefined);
  assert.deepEqual(sanitizedProduct.reviews[0]?.images, ['https://rate.vn/img/rev.png']);

  const { stub: unpricedStub } = createPipelineStubSupabase();
  const unpricedPipeline = new ShopeeIngestionPipeline({
    supabaseClient: unpricedStub,
    apiKey: '',
  });
  await assert.rejects(
    () => unpricedPipeline.ingestProduct(createBaseProduct({ priceMin: 0, priceMax: 0 })),
    /Cannot ingest unpriced or out-of-bounds product listing/
  );
  console.log('  ✅ [7/7] DOS/Rate#821 HTTP URL sanitization & unpriced rejection passed');

  // 8. DOS/Rate#879: platformReviewIdFor whitespace/control-char/overlong bounds, review videos/profileUrl sanitization & hasPopulatedSpecificationGroups
  assert.equal(
    platformReviewIdFor({ ...maskedReviewA, reviewId: '   \u0000\n  ' }),
    idA,
    'platformReviewIdFor must fall back to SHA-256 hash when reviewId is whitespace or control characters'
  );
  assert.equal(
    platformReviewIdFor({ ...maskedReviewA, reviewId: '  sp-rev\u0000-879  ' }),
    'sp-rev-879',
    'platformReviewIdFor must strip control characters and trim explicit reviewId'
  );
  assert.equal(
    platformReviewIdFor({ ...maskedReviewA, reviewId: 'r'.repeat(161) }),
    idA,
    'platformReviewIdFor must fall back to SHA-256 hash when reviewId exceeds 160 chars'
  );
  assert.equal(
    hasPopulatedSpecificationGroups({ design: { colors: ['   ', ''] } }),
    false,
    'hasPopulatedSpecificationGroups must reject arrays of blank/whitespace strings'
  );
  assert.equal(hasPopulatedSpecificationGroups({ design: { colors: ['Black'] } }), true);

  const sanitized879 = normalizeScrapedProductPrices({
    ...createBaseProduct(),
    reviews: [
      {
        reviewId: 'rev-879',
        author: 'Buyer',
        ratingStar: 5,
        comment: 'Great',
        images: [],
        videos: [
          'javascript:alert(1)',
          'https://rate.vn/vid/1.mp4',
          'https://rate.vn:8443/bad.mp4',
        ],
        reviewer: {
          verifiedPurchase: true,
          profileUrl: 'javascript:alert(1)',
        },
      },
      {
        reviewId: 'rev-879-ok',
        author: 'Buyer 2',
        ratingStar: 5,
        comment: 'Nice',
        images: [],
        reviewer: {
          verifiedPurchase: true,
          profileUrl: 'https://shopee.vn/shop/12345',
        },
      },
    ],
  });
  assert.deepEqual(sanitized879.reviews[0]?.videos, ['https://rate.vn/vid/1.mp4']);
  assert.equal(sanitized879.reviews[0]?.reviewer?.profileUrl, undefined);
  assert.equal(sanitized879.reviews[1]?.reviewer?.profileUrl, 'https://shopee.vn/shop/12345');
  console.log(
    '  ✅ [8/8] DOS/Rate#879 platformReviewIdFor, review videos/profileUrl & spec group bounds passed'
  );
  console.log('\n🎉 ALL SHOPEE INGESTION PIPELINE TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ ShopeeIngestionPipeline test suite failed:', err);
  process.exit(1);
});
