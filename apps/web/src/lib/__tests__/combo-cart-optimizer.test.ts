import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_VALID_VND_PRICE } from '@repo/shared-data/rules';
import {
  COMBO_CART_MAX_CANDIDATES_PER_ITEM,
  COMBO_CART_MAX_SEARCH_NODES,
  optimizeComboCart,
  type ComboCartItemInput,
  type ComboCartOfferInput,
} from '@/lib/combo-cart-optimizer';
import { evaluateMerchantTrustBadge } from '@/lib/merchant-trust-badge';

function makeOffer(
  id: string,
  storeId: string,
  price: number,
  opts?: {
    platform?: string;
    isOfficial?: boolean;
    riskScore?: number | null;
    availability?: 'in_stock' | 'out_of_stock' | 'discontinued' | null;
    merchantName?: string;
    url?: string;
  }
): ComboCartOfferInput {
  const platform = opts?.platform ?? 'shopee';
  return {
    id,
    platform,
    title: `Listing ${id}`,
    price_current: price,
    url: opts?.url ?? `https://shopee.vn/product/1/${id}`,
    availability: opts?.availability ?? 'in_stock',
    merchant: {
      id: storeId,
      name: opts?.merchantName ?? `Store ${storeId}`,
      platform,
      is_official: opts?.isOfficial ?? false,
      risk_score: opts?.riskScore === undefined ? 10 : opts.riskScore,
    },
  };
}

function main() {
  console.warn('Testing combo-cart-optimizer & merchant-trust-badge (#1882)');

  // =========================================================================
  // 1. Multi-store beats single-store, grouping, and savings math
  // =========================================================================
  const itemsMultiBeatsSingle: ComboCartItemInput[] = [
    {
      slug: 'iphone-16',
      name: 'iPhone 16',
      offers: [
        makeOffer('o1', 'store-all', 20_000_000, {
          platform: 'cellphones',
          isOfficial: true,
          riskScore: 5,
        }),
        makeOffer('o2', 'store-b', 18_500_000, {
          platform: 'shopee',
          isOfficial: true,
          riskScore: 10,
        }),
      ],
    },
    {
      slug: 'airpods-pro-2',
      name: 'AirPods Pro 2',
      offers: [
        makeOffer('o3', 'store-all', 6_000_000, {
          platform: 'cellphones',
          isOfficial: true,
          riskScore: 5,
        }),
        makeOffer('o4', 'store-c', 5_000_000, {
          platform: 'lazada',
          isOfficial: false,
          riskScore: 15,
        }),
      ],
    },
    {
      slug: 'watch-10',
      name: 'Apple Watch 10',
      offers: [
        makeOffer('o5', 'store-all', 11_000_000, {
          platform: 'cellphones',
          isOfficial: true,
          riskScore: 5,
        }),
        makeOffer('o6', 'store-b', 10_000_000, {
          platform: 'shopee',
          isOfficial: true,
          riskScore: 10,
        }),
      ],
    },
  ];

  const resMulti = optimizeComboCart(itemsMultiBeatsSingle, {
    minTrust: 80,
    maxStores: 3,
    shippingVndPerOrder: 0,
  });
  assert.ok(resMulti.singleStoreBest);
  assert.equal(resMulti.singleStoreBest.totalVnd, 37_000_000);
  assert.equal(resMulti.singleStoreBest.distinctStoreCount, 1);
  assert.equal(resMulti.singleStoreBest.storeGroups.length, 1);
  assert.equal(resMulti.singleStoreBest.storeGroups[0]!.itemCount, 3);

  assert.ok(resMulti.multiStoreOptimal);
  assert.equal(resMulti.multiStoreOptimal.totalVnd, 33_500_000);
  assert.equal(resMulti.multiStoreOptimal.distinctStoreCount, 2);
  assert.equal(resMulti.multiStoreOptimal.storeGroups.length, 2);
  assert.equal(resMulti.savingsVsSingleStoreVnd, 3_500_000);
  assert.equal(resMulti.savingsVsSingleStorePct, 9.5);
  assert.equal(resMulti.cheapestPerItemSubtotalVnd, 33_500_000);
  assert.deepEqual(resMulti.uncoveredSlugs, []);

  // =========================================================================
  // 2. Shipping cost flips multi-store back to single-store (or fewer stores)
  // =========================================================================
  // Without shipping: store-a+b+c = 9.8M + 4.8M + 2.8M = 17.4M vs store-all = 18.0M
  // With shipping = 400_000/order: 3 stores = 17.4M + 1.2M = 18.6M vs 1 store = 18.0M + 0.4M = 18.4M!
  const itemsShippingFlip: ComboCartItemInput[] = [
    {
      slug: 'item-1',
      name: 'Item 1',
      offers: [
        makeOffer('s1', 'store-all', 10_000_000, { isOfficial: true }),
        makeOffer('s2', 'store-b', 9_800_000, { isOfficial: true }),
      ],
    },
    {
      slug: 'item-2',
      name: 'Item 2',
      offers: [
        makeOffer('s3', 'store-all', 5_000_000, { isOfficial: true }),
        makeOffer('s4', 'store-c', 4_800_000, { isOfficial: true }),
      ],
    },
    {
      slug: 'item-3',
      name: 'Item 3',
      offers: [
        makeOffer('s5', 'store-all', 3_000_000, { isOfficial: true }),
        makeOffer('s6', 'store-d', 2_800_000, { isOfficial: true }),
      ],
    },
  ];
  const noShip = optimizeComboCart(itemsShippingFlip, {
    shippingVndPerOrder: 0,
    maxStores: 3,
  });
  assert.equal(noShip.multiStoreOptimal!.distinctStoreCount, 3);
  assert.equal(noShip.multiStoreOptimal!.totalVnd, 17_400_000);
  assert.equal(noShip.savingsVsSingleStoreVnd, 600_000);

  const highShip = optimizeComboCart(itemsShippingFlip, {
    shippingVndPerOrder: 400_000,
    maxStores: 3,
  });
  assert.equal(highShip.singleStoreBest!.totalVnd, 18_400_000);
  assert.equal(highShip.multiStoreOptimal!.distinctStoreCount, 1);
  assert.equal(highShip.multiStoreOptimal!.totalVnd, 18_400_000);
  assert.equal(highShip.multiStoreOptimal!.shippingVnd, 400_000);
  assert.equal(highShip.savingsVsSingleStoreVnd, 0);

  // =========================================================================
  // 3. officialOnly, minTrust (including null fail-closed & float boundary), maxStores
  // =========================================================================
  const itemsTrustFilter: ComboCartItemInput[] = [
    {
      slug: 'p1',
      name: 'P1',
      offers: [
        makeOffer('cheap-null', 'store-null', 1_000_000, {
          riskScore: null,
          isOfficial: true,
        }),
        makeOffer('cheap-risky', 'store-risky', 1_100_000, {
          riskScore: 20.1,
          isOfficial: true,
        }),
        makeOffer('non-off-safe', 'store-nonoff', 1_200_000, {
          riskScore: 10,
          isOfficial: false,
        }),
        makeOffer('boundary-safe', 'store-boundary', 1_500_000, {
          riskScore: 20,
          isOfficial: true,
        }),
      ],
    },
    {
      slug: 'p2',
      name: 'P2',
      offers: [
        makeOffer('p2-nonoff', 'store-nonoff', 2_000_000, {
          riskScore: 10,
          isOfficial: false,
        }),
        makeOffer('p2-boundary', 'store-boundary', 2_500_000, {
          riskScore: 20,
          isOfficial: true,
        }),
      ],
    },
  ];

  // Default minTrust=80 rejects riskScore=null and riskScore=20.1, keeps riskScore=20
  const trust80 = optimizeComboCart(itemsTrustFilter, {
    minTrust: 80,
    officialOnly: false,
  });
  assert.equal(trust80.multiStoreOptimal!.totalVnd, 3_200_000);
  assert.equal(
    trust80.singleStoreBest!.allocations[0]!.storeKey,
    'store-nonoff'
  );

  // officialOnly=true excludes store-nonoff, leaving store-boundary
  const officialOnlyRes = optimizeComboCart(itemsTrustFilter, {
    minTrust: 80,
    officialOnly: true,
  });
  assert.equal(officialOnlyRes.multiStoreOptimal!.totalVnd, 4_000_000);
  assert.equal(officialOnlyRes.multiStoreOptimal!.allOfficial, true);
  assert.equal(
    officialOnlyRes.multiStoreOptimal!.allocations[0]!.storeKey,
    'store-boundary'
  );

  // minTrust=0 allows null riskScore
  const trust0 = optimizeComboCart(itemsTrustFilter, {
    minTrust: 0,
    officialOnly: false,
  });
  assert.equal(trust0.multiStoreOptimal!.totalVnd, 3_000_000);
  assert.equal(
    trust0.multiStoreOptimal!.allocations[0]!.storeKey,
    'store-null'
  );

  // IEEE-754 decimal trust boundary: minTrust = 80.3 => maxRisk = 19.7
  const decimalTrustRes = optimizeComboCart(
    [
      {
        slug: 'd1',
        name: 'D1',
        offers: [
          makeOffer('d1-ok', 's-ok', 5_000_000, { riskScore: 19.7 }),
          makeOffer('d1-bad', 's-bad', 4_000_000, { riskScore: 19.8 }),
        ],
      },
      {
        slug: 'd2',
        name: 'D2',
        offers: [makeOffer('d2-ok', 's-ok', 5_000_000, { riskScore: 19.7 })],
      },
    ],
    { minTrust: 80.3 }
  );
  assert.equal(
    decimalTrustRes.multiStoreOptimal!.allocations[0]!.storeKey,
    's-ok'
  );

  // maxStores = 2 prevents 3-store split
  const maxStoresCap = optimizeComboCart(
    [
      {
        slug: 'm1',
        name: 'M1',
        offers: [
          makeOffer('m1a', 's1', 900_000),
          makeOffer('m1x', 's-shared', 1_000_000),
        ],
      },
      {
        slug: 'm2',
        name: 'M2',
        offers: [
          makeOffer('m2b', 's2', 900_000),
          makeOffer('m2x', 's-shared', 1_000_000),
        ],
      },
      {
        slug: 'm3',
        name: 'M3',
        offers: [makeOffer('m3c', 's3', 900_000)],
      },
    ],
    { maxStores: 2, minTrust: 80 }
  );
  assert.equal(maxStoresCap.singleStoreBest, null);
  assert.equal(maxStoresCap.multiStoreOptimal!.distinctStoreCount, 2);
  assert.equal(maxStoresCap.multiStoreOptimal!.totalVnd, 2_900_000);

  // maxStores = 1 with no common store returns null for both
  const maxStoresOneNoSingle = optimizeComboCart(
    [
      {
        slug: 'u1',
        name: 'U1',
        offers: [makeOffer('u1', 'only-a', 1_000_000)],
      },
      {
        slug: 'u2',
        name: 'U2',
        offers: [makeOffer('u2', 'only-b', 1_000_000)],
      },
    ],
    { maxStores: 1 }
  );
  assert.equal(maxStoresOneNoSingle.singleStoreBest, null);
  assert.equal(maxStoresOneNoSingle.multiStoreOptimal, null);
  assert.equal(maxStoresOneNoSingle.cheapestPerItemSubtotalVnd, 2_000_000);
  assert.deepEqual(maxStoresOneNoSingle.uncoveredSlugs, []);

  // =========================================================================
  // 4. Bait, out-of-stock, discontinued, invalid prices, and uncovered items
  // =========================================================================
  const baitAndOosRes = optimizeComboCart(
    [
      {
        slug: 'b1',
        name: 'B1',
        offers: [
          makeOffer('oos-1', 'store-a', 100_000, {
            availability: 'out_of_stock',
          }),
          makeOffer('disc-1', 'store-a', 200_000, {
            availability: 'discontinued',
          }),
          makeOffer('zero-price', 'store-a', 0),
          makeOffer('float-price', 'store-a', 1_500_000.5),
          makeOffer('over-max', 'store-a', MAX_VALID_VND_PRICE + 1),
          makeOffer('natural-bait', 'store-bait', 500_000),
          makeOffer('real-1', 'store-real-1', 10_000_000),
          makeOffer('real-2', 'store-real-2', 10_500_000),
          makeOffer('real-3', 'store-real-3', 11_000_000),
        ],
      },
      {
        slug: 'b2',
        name: 'B2',
        implausiblyLowOfferIds: ['caller-bait'],
        offers: [
          makeOffer('caller-bait', 'store-real-1', 50_000),
          makeOffer('b2-real', 'store-real-1', 2_000_000),
        ],
      },
    ],
    { minTrust: 80 }
  );
  assert.ok(baitAndOosRes.singleStoreBest);
  assert.equal(baitAndOosRes.singleStoreBest.totalVnd, 12_000_000);
  assert.equal(
    baitAndOosRes.diagnostics.itemDiagnostics[0]!.baitExcludedCount,
    1
  );
  assert.equal(
    baitAndOosRes.diagnostics.itemDiagnostics[1]!.baitExcludedCount,
    1
  );

  // Uncovered item
  const uncoveredRes = optimizeComboCart([
    {
      slug: 'has-offer',
      name: 'Has Offer',
      offers: [makeOffer('h1', 'store-a', 2_000_000)],
    },
    {
      slug: 'no-offer',
      name: 'No Offer',
      offers: [
        makeOffer('oos-only', 'store-a', 1_000_000, {
          availability: 'out_of_stock',
        }),
      ],
    },
  ]);
  assert.equal(uncoveredRes.singleStoreBest, null);
  assert.equal(uncoveredRes.multiStoreOptimal, null);
  assert.equal(uncoveredRes.cheapestPerItemSubtotalVnd, null);
  assert.deepEqual(uncoveredRes.uncoveredSlugs, ['no-offer']);

  // =========================================================================
  // 5. Multi-item store beyond top-8 included in 14-candidate window (Plan B only)
  // =========================================================================
  const eightCheaperForItem1 = Array.from({ length: 8 }, (_, i) =>
    makeOffer(`i1-${i}`, `solo-i1-${i}`, 1_000_000 + i * 10_000)
  );
  const eightCheaperForItem2 = Array.from({ length: 8 }, (_, i) =>
    makeOffer(`i2-${i}`, `solo-i2-${i}`, 1_000_000 + i * 10_000)
  );
  const sharedStoreBeyondTop8Item1 = makeOffer(
    'i1-shared',
    'shared-rank-10',
    1_150_000
  );
  const sharedStoreBeyondTop8Item2 = makeOffer(
    'i2-shared',
    'shared-rank-10',
    1_150_000
  );
  const rank10Res = optimizeComboCart(
    [
      {
        slug: 'r1',
        name: 'R1',
        offers: [...eightCheaperForItem1, sharedStoreBeyondTop8Item1],
      },
      {
        slug: 'r2',
        name: 'R2',
        offers: [...eightCheaperForItem2, sharedStoreBeyondTop8Item2],
      },
      {
        slug: 'r3',
        name: 'R3',
        offers: [makeOffer('i3-solo', 'solo-r3', 1_000_000)],
      },
    ],
    { shippingVndPerOrder: 400_000, maxStores: 2 }
  );
  // r3 is only sold by solo-r3 so Plan A (singleStoreBest) is null.
  // Top-8 solos for r1/r2 plus solo-r3 need 3 stores (> maxStores: 2).
  // Plan B MUST reach rank-10 shared-rank-10 (in the 14-candidate window):
  // 1.15M + 1.15M + 1.0M + 2*400k = 4.1M across 2 stores.
  assert.equal(rank10Res.singleStoreBest, null);
  assert.ok(rank10Res.multiStoreOptimal);
  assert.equal(rank10Res.multiStoreOptimal.totalVnd, 4_100_000);
  assert.equal(rank10Res.multiStoreOptimal.distinctStoreCount, 2);
  assert.deepEqual(
    rank10Res.multiStoreOptimal.allocations.map((a) => a.storeKey),
    ['shared-rank-10', 'shared-rank-10', 'solo-r3']
  );
  assert.deepEqual(
    rank10Res.multiStoreOptimal.storeGroups.map((g) => g.storeKey),
    ['shared-rank-10', 'solo-r3']
  );
  assert.equal(rank10Res.diagnostics.candidateTrimmed, false);
  assert.equal(rank10Res.diagnostics.nodeCapReached, false);
  assert.equal(rank10Res.diagnostics.searchComplete, true);

  // =========================================================================
  // 6. Hard candidate cap (14) & node cap (<= 50_000) bound check
  // =========================================================================
  const makePairShared = (prefix: string, price: number) =>
    Array.from({ length: 6 }, (_, storeIdx) =>
      makeOffer(`${prefix}-${storeIdx}`, `${prefix}-${storeIdx}`, price, {
        isOfficial: true,
        riskScore: 10,
      })
    );
  const stressItems: ComboCartItemInput[] = Array.from(
    { length: 5 },
    (_, itemIdx) => {
      const soloOffers = Array.from({ length: 8 }, (__, storeIdx) =>
        makeOffer(
          `aa-solo-${itemIdx}-${storeIdx}`,
          `aa-solo-${itemIdx}-${storeIdx}`,
          1_000_000,
          { isOfficial: true, riskScore: 10 }
        )
      );
      const extraOffers: ComboCartOfferInput[] = [];
      if (itemIdx === 0 || itemIdx === 1) {
        extraOffers.push(...makePairShared('zz-ab', 1_000_000));
      }
      if (itemIdx === 2 || itemIdx === 3) {
        extraOffers.push(...makePairShared('zz-cd', 1_000_001));
      }
      if (itemIdx === 3 || itemIdx === 4) {
        extraOffers.push(...makePairShared('zz-de', 1_000_001));
      }
      return {
        slug: `stress-${itemIdx}`,
        name: `Stress ${itemIdx}`,
        offers: [...soloOffers, ...extraOffers],
      };
    }
  );
  const stressRes = optimizeComboCart(stressItems, {
    maxStores: 5,
    shippingVndPerOrder: 0,
  });
  assert.ok(stressRes.multiStoreOptimal);
  assert.equal(stressRes.multiStoreOptimal.totalVnd, 5_000_000);
  assert.ok(
    stressRes.diagnostics.searchNodesVisited <= COMBO_CART_MAX_SEARCH_NODES,
    `nodesVisited=${stressRes.diagnostics.searchNodesVisited} must not exceed ${COMBO_CART_MAX_SEARCH_NODES}`
  );
  assert.equal(stressRes.diagnostics.nodeCapReached, true);
  assert.equal(stressRes.diagnostics.candidateTrimmed, true);
  assert.equal(stressRes.diagnostics.searchComplete, false);
  for (const diag of stressRes.diagnostics.itemDiagnostics) {
    assert.ok(diag.candidateStoreCount <= COMBO_CART_MAX_CANDIDATES_PER_ITEM);
  }

  // =========================================================================
  // 7. Deterministic tie-breakers (Plan A & store dedupe) + Prototype-key safety
  // =========================================================================
  const tieRes = optimizeComboCart([
    {
      slug: '__proto__',
      name: 'Proto Item',
      offers: [
        makeOffer('t1', 'store-unofficial', 1_000_000, {
          isOfficial: false,
          riskScore: 5,
        }),
        makeOffer('t2', 'store-official-lowtrust', 1_000_000, {
          isOfficial: true,
          riskScore: 15,
        }),
        makeOffer('t3', 'store-official-hightrust', 1_000_000, {
          isOfficial: true,
          riskScore: 5,
        }),
        // Same store duplicate offer should pick cheaper offer
        makeOffer('t4-dup-expensive', '__proto__', 1_200_000, {
          isOfficial: true,
          riskScore: 0,
        }),
        makeOffer('t4-dup-cheap', '__proto__', 1_000_000, {
          isOfficial: true,
          riskScore: 0,
        }),
      ],
    },
    {
      slug: 'constructor',
      name: 'Constructor Item',
      offers: [
        makeOffer('c1', 'store-unofficial', 1_000_000, {
          isOfficial: false,
          riskScore: 5,
        }),
        makeOffer('c2', 'store-official-lowtrust', 1_000_000, {
          isOfficial: true,
          riskScore: 15,
        }),
        makeOffer('c3', 'store-official-hightrust', 1_000_000, {
          isOfficial: true,
          riskScore: 5,
        }),
        makeOffer('c4', '__proto__', 1_000_000, {
          isOfficial: true,
          riskScore: 0,
        }),
      ],
    },
  ]);
  // __proto__ store has riskScore: 0 (trustScore: 100) vs store-official-hightrust (trustScore: 95)
  assert.equal(tieRes.singleStoreBest!.allocations[0]!.storeKey, '__proto__');
  assert.equal(tieRes.singleStoreBest!.allocations[0]!.offerId, 't4-dup-cheap');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);

  // ID-less offers on same platform must NOT merge onto a bare platform key,
  // and omitted offer IDs must not collide with synthetic 'anon-0' bait IDs.
  const idlessRes = optimizeComboCart(
    [
      {
        slug: 'idless-1',
        name: 'Idless 1',
        implausiblyLowOfferIds: ['anon-0'],
        offers: [
          {
            id: null,
            platform: 'shopee',
            price_current: 1_000_000,
            availability: 'in_stock',
            merchant: {
              id: null,
              name: 'Shop Alpha',
              platform: 'shopee',
              risk_score: 10,
            },
          },
          {
            id: null,
            platform: 'shopee',
            price_current: 1_200_000,
            availability: 'in_stock',
            merchant: {
              id: null,
              name: 'Shopee',
              platform: 'shopee',
              risk_score: 10,
            },
          },
        ],
      },
      {
        slug: 'idless-2',
        name: 'Idless 2',
        implausiblyLowOfferIds: ['anon-0'],
        offers: [
          {
            id: null,
            platform: 'shopee',
            price_current: 1_000_000,
            availability: 'in_stock',
            merchant: {
              id: null,
              name: 'Shop Beta',
              platform: 'shopee',
              risk_score: 10,
            },
          },
        ],
      },
    ],
    { shippingVndPerOrder: 0, maxStores: 2 }
  );
  assert.equal(idlessRes.singleStoreBest, null);
  assert.ok(idlessRes.multiStoreOptimal);
  assert.equal(idlessRes.multiStoreOptimal.totalVnd, 2_000_000);
  assert.equal(idlessRes.multiStoreOptimal.distinctStoreCount, 2);

  // Equal-price dominance with shippingVndPerOrder: 0 -> fewer distinct stores wins
  const dominanceRes = optimizeComboCart(
    [
      {
        slug: 'dom-1',
        name: 'Dom 1',
        offers: [
          makeOffer('d1-a', 'aa-solo-1', 1_000_000, {
            isOfficial: true,
            riskScore: 10,
          }),
          makeOffer('d1-z', 'zz-shared', 1_000_000, {
            isOfficial: true,
            riskScore: 10,
          }),
        ],
      },
      {
        slug: 'dom-2',
        name: 'Dom 2',
        offers: [
          makeOffer('d2-a', 'aa-solo-2', 1_000_000, {
            isOfficial: true,
            riskScore: 10,
          }),
          makeOffer('d2-z', 'zz-shared', 1_000_000, {
            isOfficial: true,
            riskScore: 10,
          }),
        ],
      },
    ],
    { shippingVndPerOrder: 0, maxStores: 2 }
  );
  assert.ok(dominanceRes.multiStoreOptimal);
  assert.equal(dominanceRes.multiStoreOptimal.totalVnd, 2_000_000);
  assert.equal(dominanceRes.multiStoreOptimal.distinctStoreCount, 1);
  assert.equal(
    dominanceRes.multiStoreOptimal.allocations[0]!.storeKey,
    'zz-shared'
  );

  // Input length bounds
  assert.throws(
    () =>
      optimizeComboCart([
        { slug: 'only-one', name: 'One', offers: [makeOffer('1', 's', 1000)] },
      ]),
    RangeError
  );
  assert.throws(
    () =>
      optimizeComboCart([
        { slug: 'dup', name: 'D1', offers: [] },
        { slug: 'DUP', name: 'D2', offers: [] },
      ]),
    RangeError
  );
  assert.throws(
    () =>
      optimizeComboCart(
        Array.from({ length: 6 }, (_, i) => ({
          slug: `six-${i}`,
          name: `Six ${i}`,
          offers: [],
        }))
      ),
    RangeError
  );

  // =========================================================================
  // 8. Truthful Verified Safe Merchant Badge evaluator
  // =========================================================================
  const safeOfficial = evaluateMerchantTrustBadge({
    dosafe_risk_score: 15,
    review_risk_score: 20,
    review_risk_breakdown: { total_reviews: 42 },
    risk_score: 20,
    is_official: true,
    offerCount: 5,
    activeFakeDiscountCount: 0,
  });
  assert.equal(safeOfficial.verifiedSafe, true);
  assert.equal(safeOfficial.badgeCode, 'verified_safe');
  assert.deepEqual(safeOfficial.failedReasons, []);
  assert.ok(safeOfficial.reasons.includes('official_store'));

  // Non-official store needs combined trust >= 85
  const safeNonOfficial = evaluateMerchantTrustBadge({
    dosafe_risk_score: 10,
    review_risk_score: 15,
    risk_score: 15,
    is_official: false,
    offerCount: 2,
    activeFakeDiscountCount: 0,
  });
  assert.equal(safeNonOfficial.verifiedSafe, true);
  assert.ok(safeNonOfficial.reasons.includes('combined_trust_high'));

  const nonOfficialLowTrust = evaluateMerchantTrustBadge({
    dosafe_risk_score: 10,
    review_risk_score: 16,
    risk_score: 16, // trust = 84 < 85
    is_official: false,
    offerCount: 2,
    activeFakeDiscountCount: 0,
  });
  assert.equal(nonOfficialLowTrust.verifiedSafe, false);
  assert.equal(nonOfficialLowTrust.badgeCode, null);
  assert.ok(
    nonOfficialLowTrust.failedReasons.includes('trust_score_below_threshold')
  );

  // Missing DOSafe score or dosafe_risk_known === false fails closed
  const missingDosafe = evaluateMerchantTrustBadge({
    dosafe_risk_score: 0,
    dosafe_risk_known: false,
    review_risk_score: 5,
    is_official: true,
    offerCount: 3,
    activeFakeDiscountCount: 0,
  });
  assert.equal(missingDosafe.verifiedSafe, false);
  assert.ok(missingDosafe.failedReasons.includes('missing_dosafe_score'));

  // Whitespace-only or boolean dosafe_risk_score must fail closed; numeric 0 and '0' pass
  for (const blankDosafe of [' ', '\t', false as unknown as number]) {
    const blankRes = evaluateMerchantTrustBadge({
      dosafe_risk_score: blankDosafe,
      review_risk_score: 5,
      is_official: true,
      offerCount: 3,
      activeFakeDiscountCount: 0,
    });
    assert.equal(blankRes.verifiedSafe, false);
    assert.ok(blankRes.failedReasons.includes('missing_dosafe_score'));
  }
  const zeroStringDosafe = evaluateMerchantTrustBadge({
    dosafe_risk_score: '0',
    review_risk_score: 5,
    is_official: true,
    offerCount: 3,
    activeFakeDiscountCount: 0,
  });
  assert.equal(zeroStringDosafe.verifiedSafe, true);
  assert.equal(zeroStringDosafe.signals.dosafeRiskScore, 0);

  // DOSafe > 15 fails
  const highDosafe = evaluateMerchantTrustBadge({
    dosafe_risk_score: 15.1,
    review_risk_score: 5,
    is_official: true,
    offerCount: 3,
    activeFakeDiscountCount: 0,
  });
  assert.equal(highDosafe.verifiedSafe, false);
  assert.ok(highDosafe.failedReasons.includes('dosafe_risk_too_high'));

  // Review risk null (or total_reviews === 0 baseline) passes
  const unmeasuredReviewSafe = evaluateMerchantTrustBadge({
    dosafe_risk_score: 8,
    review_risk_score: 25, // baseline only because total_reviews is 0
    review_risk_breakdown: { total_reviews: 0 },
    risk_score: 8,
    is_official: false,
    offerCount: 1,
    activeFakeDiscountCount: 0,
  });
  assert.equal(unmeasuredReviewSafe.verifiedSafe, true);
  assert.equal(unmeasuredReviewSafe.signals.reviewRiskScore, null);
  assert.ok(unmeasuredReviewSafe.reasons.includes('review_risk_unmeasured'));

  // Review risk > 20 with evidence fails
  const highReviewRisk = evaluateMerchantTrustBadge({
    dosafe_risk_score: 5,
    review_risk_score: 21,
    review_risk_breakdown: { total_reviews: 10 },
    is_official: true,
    offerCount: 4,
    activeFakeDiscountCount: 0,
  });
  assert.equal(highReviewRisk.verifiedSafe, false);
  assert.ok(highReviewRisk.failedReasons.includes('review_risk_too_high'));

  // Zero active offers fails
  const zeroOffers = evaluateMerchantTrustBadge({
    dosafe_risk_score: 5,
    review_risk_score: null,
    is_official: true,
    offerCount: 0,
    activeFakeDiscountCount: 0,
  });
  assert.equal(zeroOffers.verifiedSafe, false);
  assert.ok(zeroOffers.failedReasons.includes('no_active_offers'));

  // Active fake discounts > 0 or unverified null fails
  const fakeDiscounts = evaluateMerchantTrustBadge({
    dosafe_risk_score: 5,
    review_risk_score: 5,
    is_official: true,
    offerCount: 3,
    activeFakeDiscountCount: 1,
  });
  assert.equal(fakeDiscounts.verifiedSafe, false);
  assert.ok(
    fakeDiscounts.failedReasons.includes('active_fake_discounts_detected')
  );

  const missingFakeAudit = evaluateMerchantTrustBadge({
    dosafe_risk_score: 5,
    review_risk_score: 5,
    is_official: true,
    offerCount: 3,
  });
  assert.equal(missingFakeAudit.verifiedSafe, false);
  assert.ok(
    missingFakeAudit.failedReasons.includes('missing_fake_discount_audit')
  );

  // Truthfulness: no fabricated 180-day window strings anywhere in module source
  const badgeSrc = readFileSync(
    path.resolve(__dirname, '../merchant-trust-badge.ts'),
    'utf8'
  );
  assert.equal(/180[-\s]*day|180\s*ng[àa]y/i.test(badgeSrc), false);

  console.warn('All combo-cart-optimizer & merchant-trust-badge tests passed');
}

main();
