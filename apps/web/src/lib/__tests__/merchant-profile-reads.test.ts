import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A merchant profile on a cold render must not wait on one database round trip
// after another: it reads its listings while the merchant loads, and its
// discount analysis is added outside its cache entry from the readers it is
// given, so the product pages' cached entries are reused (DOS/Rate#1217).

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';

const MERCHANT_ID = '00000000-0000-4000-8000-000000001217';
const MASTER_ID = '00000000-0000-4000-9000-000000001217';
const LISTING_ID = '00000000-0000-4000-a000-000000001217';
const SECOND_LISTING_ID = '00000000-0000-4000-a000-000000001240';
const UNCLUSTERED_LISTING_ID = '00000000-0000-4000-a000-000000001241';
const OTHER_LISTING_ID = '00000000-0000-4000-a000-0000000000ff';

const merchantRow = {
  id: MERCHANT_ID,
  platform: 'shopee',
  platform_shop_id: '1217',
  name: 'Shop 1217',
  slug: 'shop-1217',
  is_official: false,
  risk_score: 10,
  review_risk_score: 5,
  metadata: {},
};
const listingRow = {
  id: LISTING_ID,
  merchant_id: MERCHANT_ID,
  platform: 'shopee',
  platform_item_id: '1',
  title: 'Phone 1217',
  price_current: 9_000_000,
  price_original: 12_000_000,
  stock: 3,
  historical_sold: 1,
  rating_star: 5,
  rating_count: 1,
  images: [],
  url: 'https://shopee.vn/product/1217/1',
  cluster_id: MASTER_ID,
};

const listingUrls: string[] = [];
const reviewQueries: string[] = [];

type Route = 'merchant' | 'merchantBySlug' | 'listings' | 'other';

interface Recorded {
  route: string;
  start: number;
  end: number;
}

function routeOf(url: URL): string {
  const table = url.pathname.replace('/rest/v1/', '');
  const query = decodeURIComponent(url.search);
  if (table === 'merchants' && query.includes('id=eq.')) return 'merchant';
  if (table === 'merchants' && query.includes('or=')) return 'merchantBySlug';
  if (table === 'products' && query.includes('merchant_id=eq.'))
    return 'listings';
  return table;
}

function installFetch(options: {
  merchantFound?: (route: Route | string) => boolean;
  listingsFail?: boolean;
  /** Listings of MERCHANT_ID; any other merchant id lists OTHER_LISTING_ID. */
  listings?: unknown[];
  delayMs?: number;
}) {
  const calls: Recorded[] = [];
  let clock = 0;
  const delay = options.delayMs ?? 20;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    const route = routeOf(url);
    if (route === 'listings') listingUrls.push(url.search);
    if (route === 'reviews') reviewQueries.push(decodeURIComponent(url.search));
    const entry: Recorded = { route, start: clock++, end: -1 };
    calls.push(entry);
    await new Promise((resolve) => setTimeout(resolve, delay));
    entry.end = clock++;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (route === 'listings' && options.listingsFail) {
      return new Response(JSON.stringify({ message: 'listings down' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    let body: unknown = [];
    if (route === 'merchant' || route === 'merchantBySlug') {
      body = options.merchantFound?.(route) === false ? [] : [merchantRow];
    } else if (route === 'listings') {
      const ownListings = decodeURIComponent(url.search).includes(
        `merchant_id=eq.${MERCHANT_ID}`
      );
      body =
        offset > 0
          ? []
          : ownListings
            ? (options.listings ?? [listingRow])
            : [{ ...listingRow, id: OTHER_LISTING_ID }];
    } else if (route === 'master_products') {
      body = [
        {
          id: MASTER_ID,
          slug: 'phone-1217',
          name: 'Phone 1217',
          brand: 'X',
          category_id: null,
          metadata: { category_slug: 'smartphones' },
          min_price: 9_000_000,
          max_price: 9_000_000,
          merchant_count: 1,
        },
      ];
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-range': '0-0/*',
      },
    });
  }) as typeof fetch;
  return calls;
}

/** Error-level log lines written while `run` runs. */
async function captureErrorLogs(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return lines;
}

async function main() {
  console.warn('🧪 merchant profile reads suite (DOS/Rate#1217)');
  const {
    attachMerchantDiscountAnalysis,
    getMerchantProfileBase,
    getMerchantProfileById,
  } = await import('../rate-api');
  const unhandled: unknown[] = [];
  process.on('unhandledRejection', (reason) => unhandled.push(reason));

  const analysis = {
    product_id: LISTING_ID,
    merchant_name: 'Shop 1217',
    platform: 'shopee',
    price_current: 9_000_000,
    price_original: 12_000_000,
    claimed_discount_pct: 25,
    real_discount_vs_median_pct: 0,
    historical_min_price: 9_000_000,
    historical_max_price: 9_000_000,
    historical_median_price: 9_000_000,
    observation_count: 1,
    verdict: 'fake_discount' as const,
    badge_label: 'x',
    explanation: 'x',
  };
  const emptyHistory = {
    points: [],
    lowestEverPrice: null,
    lowestEverDate: null,
    lowestEverMerchant: null,
    highestEverPrice: null,
    currentMinPrice: null,
    fakeDiscountCount: 1,
    genuineDealCount: 0,
  };

  // 1. The base profile reads no offers or price history and carries no
  //    analysis; it records each listing's master instead.
  {
    const calls = installFetch({});
    const base = await getMerchantProfileBase(MERCHANT_ID);
    assert.ok(base);
    assert.deepEqual(base.listingMasterIds, { [LISTING_ID]: MASTER_ID });
    assert.equal(base.profile.listings[0]?.discount_analysis, null);
    assert.equal(base.profile.listings[0]?.master_product?.slug, 'phone-1217');
    const routes = calls.map((c) => c.route);
    for (const own of ['v_products_with_merchant_trust', 'price_history']) {
      assert.ok(!routes.includes(own), `the base profile must not read ${own}`);
    }

    // 2. The listings read starts before the merchant read has answered.
    const merchant = calls.find((c) => c.route === 'merchant');
    const firstListings = calls.find((c) => c.route === 'listings');
    assert.ok(merchant && firstListings);
    assert.ok(
      firstListings.start < merchant.end,
      'listings must be read while the merchant row loads'
    );
    assert.equal(
      routes.filter((r) => r === 'merchant').length,
      1,
      'the merchant row is read once'
    );

    // 3. The analysis comes from the readers, once per master.
    const readerCalls: string[] = [];
    const profile = await attachMerchantDiscountAnalysis(base, {
      offers: async (id) => {
        readerCalls.push(`offers:${id}`);
        return [];
      },
      priceHistory: async (id, offers) => {
        readerCalls.push(`history:${id}:${offers.length}`);
        return { ...emptyHistory, byOffer: { [LISTING_ID]: analysis } };
      },
    });
    assert.deepEqual(readerCalls, [
      `offers:${MASTER_ID}`,
      `history:${MASTER_ID}:0`,
    ]);
    assert.equal(
      profile.listings[0]?.discount_analysis?.verdict,
      'fake_discount'
    );
    assert.equal(
      base.profile.listings[0]?.discount_analysis,
      null,
      'the cached base is not mutated'
    );
  }

  // 4. A failed reader fails the profile: it is never served without its
  //    analysis (DOS/Rate#329).
  {
    installFetch({});
    const base = await getMerchantProfileBase(MERCHANT_ID);
    assert.ok(base);
    await assert.rejects(
      attachMerchantDiscountAnalysis(base, {
        offers: async () => {
          throw new Error('offers unavailable');
        },
        priceHistory: async () => ({ ...emptyHistory, byOffer: {} }),
      }),
      /offers unavailable/
    );
  }

  // 5. A UUID that is not a merchant id falls back to the slug lookup, and
  //    the listings are read again for the merchant actually found.
  {
    const calls = installFetch({
      merchantFound: (route) => route !== 'merchant',
    });
    const base = await getMerchantProfileBase(
      '00000000-0000-4000-8000-0000000000aa'
    );
    assert.ok(base);
    assert.equal(base.profile.id, MERCHANT_ID);
    const listingReads = calls.filter((c) => c.route === 'listings');
    // Page and end-of-list read for the guessed id, then for the real one.
    assert.equal(listingReads.length, 4);
    assert.ok(
      decodeURIComponent(listingUrls.at(-1) ?? '').includes(
        `merchant_id=eq.${MERCHANT_ID}`
      ),
      'the listings used are read for the merchant found'
    );
    assert.deepEqual(
      base.profile.listings.map((l) => l.id),
      [LISTING_ID],
      'the guessed id listings are discarded'
    );
  }

  // 5b. Offers reach the price-history reader; two listings of one master
  //     read it once; an unclustered listing has no master and no analysis;
  //     a listing takes its price from the offers its verdict used (#1240).
  {
    installFetch({
      listings: [
        listingRow,
        { ...listingRow, id: SECOND_LISTING_ID, price_current: 9_500_000 },
        {
          ...listingRow,
          id: UNCLUSTERED_LISTING_ID,
          price_current: 20_000_000,
          cluster_id: null,
        },
      ],
    });
    const base = await getMerchantProfileBase(MERCHANT_ID);
    assert.ok(base);
    assert.deepEqual(base.listingMasterIds, {
      [LISTING_ID]: MASTER_ID,
      [SECOND_LISTING_ID]: MASTER_ID,
    });
    const offer = {
      id: LISTING_ID,
      platform: 'shopee',
      title: 'Phone 1217',
      price_current: 8_500_000,
      price_original: 12_000_000,
      stock: 3,
      rating_star: 5,
      rating_count: 1,
      url: 'https://shopee.vn/product/1217/1',
      merchant: {
        id: MERCHANT_ID,
        name: 'Shop 1217',
        platform: 'shopee',
        is_official: false,
        rating_star: null,
        follower_count: 0,
        location: null,
        risk_score: 10,
        dosafe_risk_score: 10,
        review_risk_score: 5,
        review_risk_breakdown: null,
      },
    } as unknown as Parameters<
      Parameters<typeof attachMerchantDiscountAnalysis>[1]['priceHistory']
    >[1][number];
    let offersCalls = 0;
    const seenOffers: string[][] = [];
    const profile = await attachMerchantDiscountAnalysis(base, {
      offers: async () => {
        offersCalls += 1;
        return [offer];
      },
      priceHistory: async (_id, offers) => {
        seenOffers.push(offers.map((o) => o.id));
        // The price rose to 10.0M since the profile read 9.0M.
        return {
          ...emptyHistory,
          byOffer: {
            [LISTING_ID]: {
              ...analysis,
              price_current: 10_000_000,
              price_original: 13_000_000,
            },
          },
        };
      },
    });
    assert.equal(offersCalls, 1, 'one read per master, not per listing');
    assert.deepEqual(seenOffers, [[LISTING_ID]]);
    const byId = new Map(profile.listings.map((l) => [l.id, l]));
    assert.equal(byId.get(LISTING_ID)?.price_current, 10_000_000);
    assert.equal(byId.get(LISTING_ID)?.price_original, 13_000_000);
    // No verdict: the profile's own price stays.
    assert.equal(byId.get(SECOND_LISTING_ID)?.price_current, 9_500_000);
    assert.equal(byId.get(SECOND_LISTING_ID)?.discount_analysis, null);
    assert.equal(byId.get(UNCLUSTERED_LISTING_ID)?.discount_analysis, null);
    assert.deepEqual(
      profile.listings.map((l) => l.id),
      [SECOND_LISTING_ID, LISTING_ID, UNCLUSTERED_LISTING_ID],
      'listings stay sorted by the price shown'
    );
    assert.equal(profile.min_price, 9_500_000);
    assert.equal(profile.max_price, 20_000_000);
  }

  // 5c. The server layer attaches the analysis outside the profile's cache
  //     entry: a nested unstable_cache skips its cache read, so the product
  //     pages' entries would never be reused (DOS/Rate#1217). A source check,
  //     a tripwire against moving the call back inside: a reflow or rename
  //     breaks it, and it does not prove the call is outside every cache.
  {
    const source = readFileSync(
      join(__dirname, '../../server/rate/index.ts'),
      'utf8'
    );
    const baseEntry = source.match(
      /withRateDataCache\(\s*_getMerchantProfileBase,[\s\S]*?\)\(cleanId\)/
    );
    assert.ok(baseEntry, 'the base profile is a cache entry of its own');
    assert.ok(
      !baseEntry[0].includes('_attachMerchantDiscountAnalysis'),
      'the analysis must not run inside the profile cache entry'
    );
    assert.match(
      source,
      /await _getCachedMerchantProfileBaseByKey\(cleanId\);\s*return base\s*\?\s*_attachMerchantDiscountAnalysis\(base, CACHED_MASTER_READERS\)/,
      'getCachedMerchantProfileById attaches the analysis after the cache read'
    );
  }

  // 5d. A sold-out listing carries its availability, is listed after the
  //     buyable ones, gets no verdict and is out of the store's price range
  //     (DOS/Rate#1248).
  {
    installFetch({
      listings: [
        {
          ...listingRow,
          availability: 'out_of_stock',
          price_current: 2_694_000,
        },
        {
          ...listingRow,
          id: SECOND_LISTING_ID,
          price_current: 9_500_000,
          availability: 'in_stock',
        },
        {
          ...listingRow,
          id: UNCLUSTERED_LISTING_ID,
          price_current: 20_000_000,
          cluster_id: null,
          availability: null,
        },
      ],
    });
    const base = await getMerchantProfileBase(MERCHANT_ID);
    assert.ok(base);
    assert.deepEqual(
      base.profile.listings.map((l) => [l.id, l.availability]),
      [
        [SECOND_LISTING_ID, 'in_stock'],
        [UNCLUSTERED_LISTING_ID, null],
        [LISTING_ID, 'out_of_stock'],
      ]
    );
    assert.equal(base.profile.min_price, 9_500_000);
    const profile = await attachMerchantDiscountAnalysis(base, {
      offers: async () => [],
      priceHistory: async () => ({
        ...emptyHistory,
        byOffer: {
          [LISTING_ID]: { ...analysis, verdict: 'genuine_deal' as const },
          [SECOND_LISTING_ID]: {
            ...analysis,
            product_id: SECOND_LISTING_ID,
            price_current: 9_500_000,
          },
        },
      }),
    });
    const soldOut = profile.listings.find((l) => l.id === LISTING_ID);
    assert.equal(soldOut?.discount_analysis, null, 'no verdict when sold out');
    assert.equal(
      profile.listings.find((l) => l.id === SECOND_LISTING_ID)
        ?.discount_analysis?.verdict,
      'fake_discount',
      'an in-stock listing keeps its verdict'
    );
    assert.equal(soldOut?.price_current, 2_694_000);
    assert.equal(profile.listings.at(-1)?.id, LISTING_ID);
    assert.equal(profile.min_price, 9_500_000);
    assert.equal(profile.max_price, 20_000_000);
  }

  // 6. An unknown merchant is null, even when the early listings read fails.
  {
    installFetch({ merchantFound: () => false });
    assert.equal(
      await getMerchantProfileById('00000000-0000-4000-8000-0000000000bb'),
      null
    );
    installFetch({ merchantFound: () => false, listingsFail: true });
    const errors = await captureErrorLogs(async () => {
      assert.equal(
        await getMerchantProfileBase('00000000-0000-4000-8000-0000000000cc'),
        null
      );
    });
    assert.deepEqual(
      errors,
      [],
      'a discarded speculative read logs nothing (#1240)'
    );
  }

  // 7. A failed listings read for the merchant found fails the profile, and
  //    is logged once.
  {
    installFetch({ listingsFail: true });
    const errors = await captureErrorLogs(async () => {
      await assert.rejects(getMerchantProfileBase(MERCHANT_ID));
    });
    assert.equal(
      errors.filter((line) => line.includes('merchant listings')).length,
      1
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(unhandled, [], 'no read may fail unhandled');

  // 6. Reviews of a listing whose product is not published stay out of the
  //    profile; an unclustered listing's reviews are read (DOS/Rate#1309).
  {
    const DRAFT_LISTING_ID = '00000000-0000-4000-a000-000000001309';
    installFetch({
      listings: [
        listingRow,
        {
          ...listingRow,
          id: DRAFT_LISTING_ID,
          cluster_id: '00000000-0000-4000-9000-000000001309',
        },
        { ...listingRow, id: UNCLUSTERED_LISTING_ID, cluster_id: null },
      ],
    });
    reviewQueries.length = 0;
    const base = await getMerchantProfileBase(MERCHANT_ID);
    assert.ok(base);
    const read = reviewQueries.join(' ');
    assert.ok(read.includes(LISTING_ID), 'a published listing is read');
    assert.ok(read.includes(UNCLUSTERED_LISTING_ID), 'an unclustered one too');
    assert.ok(
      !read.includes(DRAFT_LISTING_ID),
      'a listing of an unpublished product has no review read'
    );
  }

  // A store with neither a DOSafe score (column default 0, no metadata score)
  // nor an analysed review has no trust score, not 100/100 (DOS/Rate#1484).
  {
    const saved = { ...merchantRow };
    Object.assign(merchantRow, {
      risk_score: 0,
      review_risk_score: 0,
      metadata: {},
    });
    try {
      installFetch({});
      const base = await getMerchantProfileBase(MERCHANT_ID);
      assert.ok(base);
      assert.equal(base.profile.dosafe_risk_known, false);
      assert.equal(base.profile.trust_score, null);
      assert.equal(base.profile.risk_score, null);
      // A stored combined score alone keeps the store scored, as before.
      Object.assign(merchantRow, { metadata: { combined_risk_score: 42 } });
      installFetch({});
      const combined = await getMerchantProfileBase(MERCHANT_ID);
      assert.ok(combined);
      assert.equal(combined.profile.risk_score, 42);
      assert.equal(combined.profile.trust_score, 58);
      // A DOSafe score alone scores the store again.
      Object.assign(merchantRow, { metadata: { dosafe_risk_score: 4 } });
      installFetch({});
      const scored = await getMerchantProfileBase(MERCHANT_ID);
      assert.ok(scored);
      assert.equal(typeof scored.profile.trust_score, 'number');
      assert.ok((scored.profile.trust_score ?? 100) < 100);
    } finally {
      Object.assign(merchantRow, saved);
    }
  }

  // Offer cards: a seller with no DOSafe score and no stored review score
  // has no combined risk and no trust, never "trust 100%" from an Official
  // Mall's 0 baseline (DOS/Rate#1484).
  {
    const { mapTrustViewRowToMerchantOffer, mapOfferRowToMerchantOffer } =
      await import('../rate-api');
    const { offerTrustScore } =
      await import('../../components/leaderboard/ProductOffersExplorer');
    const viewRisk = (extra: Record<string, unknown>, dosafe?: number) =>
      mapTrustViewRowToMerchantOffer(
        {
          id: 'o',
          merchant_id: 'm',
          platform: 'shopee',
          title: 't',
          price_current: 1_000_000,
          url: 'https://shopee.vn/p',
          review_risk_score: 0,
          ...extra,
        } as never,
        undefined,
        dosafe
      ).merchant.risk_score;
    assert.equal(viewRisk({ merchant_is_official: true }), null);
    assert.equal(viewRisk({}), null);
    assert.equal(viewRisk({ merchant_is_official: true }, 5), 5);
    assert.equal(viewRisk({ review_risk_score: 42 }), 42);
    assert.equal(viewRisk({ threat_risk_score: 30 }), 30);
    const rawRisk = (merchants: Record<string, unknown>) =>
      mapOfferRowToMerchantOffer({
        id: 'o',
        platform: 'lazada',
        title: 't',
        price_current: 1_000_000,
        url: 'https://www.lazada.vn/p',
        merchants: { id: 'm', name: 'Shop', platform: 'lazada', ...merchants },
      } as never).merchant.risk_score;
    assert.equal(rawRisk({ is_official: true }), null);
    assert.equal(
      rawRisk({ review_risk_score: 0, review_risk_breakdown: {} }),
      null
    );
    assert.equal(rawRisk({ metadata: { dosafe_risk_score: 4 } }), 15);
    assert.equal(rawRisk({ metadata: { review_risk_score: 33 } }), 33);
    // No score is no trust, never 100.
    assert.equal(offerTrustScore(null), null);
    assert.equal(offerTrustScore(undefined), null);
    assert.equal(offerTrustScore(0), 100);
    assert.equal(offerTrustScore(18), 82);
  }

  // A stored importer score whose breakdown has no count is still review
  // evidence: the store keeps its score (DOS/Rate#1484 review).
  {
    const saved = { ...merchantRow };
    Object.assign(merchantRow, {
      risk_score: 0,
      review_risk_score: 68,
      review_risk_breakdown: { review_risk_score: 68 },
      metadata: {},
    });
    try {
      installFetch({});
      const base = await getMerchantProfileBase(MERCHANT_ID);
      assert.ok(base);
      assert.equal(base.profile.risk_score, 68);
      assert.equal(base.profile.trust_score, 32);
    } finally {
      for (const key of Object.keys(merchantRow)) {
        if (!(key in saved))
          delete (merchantRow as Record<string, unknown>)[key];
      }
      Object.assign(merchantRow, saved);
    }
  }

  // Dotted merchant slugs and TikTok Shop handles preserve literal `.` inside
  // double-quoted PostgREST `.or(...)` values without colliding with dotless
  // stores, while rejecting PostgREST operator injection and keeping
  // `sanitizePostgrestFilterToken` strict for `.ilike()` callers (DOS/Rate#1686).
  {
    const { sanitizePostgrestFilterToken } = await import('../rate-api');
    assert.equal(
      sanitizePostgrestFilterToken('anker.vn,id.eq.1()'),
      'ankervnideq1',
      'sanitizePostgrestFilterToken stays strict for .ilike() callers'
    );

    const DOTTED_MERCHANT_ID = '00000000-0000-4000-8000-000000001686';
    const DOTLESS_MERCHANT_ID = '00000000-0000-4000-8000-000000001687';
    const TIKTOK_MERCHANT_ID = '00000000-0000-4000-8000-000000001688';
    const BOUNDARY_MERCHANT_ID = '00000000-0000-4000-8000-000000001689';
    const maxLenSlug = `${'a'.repeat(117)}.vn`;
    assert.equal(maxLenSlug.length, 120);

    const merchantStore = [
      {
        ...merchantRow,
        id: DOTLESS_MERCHANT_ID,
        slug: 'ankervn',
        platform_shop_id: 'ankervn',
        name: 'Dotless Decoy Store',
      },
      {
        ...merchantRow,
        id: DOTTED_MERCHANT_ID,
        slug: 'anker.vn',
        platform_shop_id: '88001686',
        name: 'Anker Vietnam Official',
      },
      {
        ...merchantRow,
        id: TIKTOK_MERCHANT_ID,
        platform: 'tiktok',
        slug: 'viettel-official',
        platform_shop_id: 'viettel.store',
        name: 'Viettel Store TikTok',
      },
      {
        ...merchantRow,
        id: BOUNDARY_MERCHANT_ID,
        slug: maxLenSlug,
        platform_shop_id: 'a',
        name: 'Boundary Slug Store',
      },
    ];

    const seenOrParams: string[] = [];
    let activeStore = merchantStore;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const table = url.pathname.replace('/rest/v1/', '');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (table === 'merchants') {
        const orParam = url.searchParams.get('or') ?? '';
        seenOrParams.push(orParam);
        const match = orParam.match(
          /^\(slug\.eq\."([^"\\]*)",platform_shop_id\.eq\."([^"\\]*)"\)$/
        );
        const matched = match
          ? activeStore.filter(
              (m) => m.slug === match[1] || m.platform_shop_id === match[2]
            )
          : [];
        return new Response(JSON.stringify(matched.slice(0, 1)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (table === 'products') {
        return new Response(JSON.stringify(offset > 0 ? [] : []), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/*',
          },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const ankerBase = await getMerchantProfileBase('  anker.vn  ');
    assert.ok(ankerBase);
    assert.equal(ankerBase.profile.id, DOTTED_MERCHANT_ID);
    assert.equal(
      seenOrParams.at(-1),
      '(slug.eq."anker.vn",platform_shop_id.eq."anker.vn")'
    );

    const tiktokBase = await getMerchantProfileBase('viettel.store');
    assert.ok(tiktokBase);
    assert.equal(tiktokBase.profile.id, TIKTOK_MERCHANT_ID);
    assert.equal(
      seenOrParams.at(-1),
      '(slug.eq."viettel.store",platform_shop_id.eq."viettel.store")'
    );

    // Boundary lengths: 1-char and 120-char identifiers pass.
    const singleCharBase = await getMerchantProfileBase('a');
    assert.ok(singleCharBase);
    assert.equal(singleCharBase.profile.id, BOUNDARY_MERCHANT_ID);
    const maxLenBase = await getMerchantProfileBase(maxLenSlug);
    assert.ok(maxLenBase);
    assert.equal(maxLenBase.profile.id, BOUNDARY_MERCHANT_ID);

    // When `anker.vn` does not exist, looking up `anker.vn` must return null
    // and never collide with dot-stripped `ankervn`.
    activeStore = merchantStore.filter((m) => m.id !== DOTTED_MERCHANT_ID);
    assert.equal(await getMerchantProfileBase('anker.vn'), null);

    // Malformed / injection inputs are rejected before issuing any PostgREST query.
    seenOrParams.length = 0;
    const rejectedInputs = [
      '',
      '   ',
      '.',
      '..',
      '.anker.vn',
      'anker.vn.',
      'anker..vn',
      '-anker',
      '---',
      '_anker',
      '__proto__',
      'anker.vn,id.eq.1',
      'anker.vn,platform_shop_id.neq.0',
      'anker(1)',
      'or(id.eq.1)',
      'anker"vn',
      'anker.vn",id.eq."1',
      "anker'vn",
      'anker\\vn',
      'anker/vn',
      'anker vn',
      'anker\tvn',
      'anker\nvn',
      'anker\u0000.vn',
      'a'.repeat(121),
      `${maxLenSlug}x`,
      '0',
      'null',
      'undefined',
      'NaN',
      'none',
      'na',
      'true',
      'false',
    ];
    for (const bad of rejectedInputs) {
      assert.equal(
        await getMerchantProfileBase(bad),
        null,
        `expected null for invalid merchant identifier: ${JSON.stringify(bad)}`
      );
    }
    assert.deepEqual(
      seenOrParams,
      [],
      'invalid merchant identifiers must not issue PostgREST queries'
    );
  }

  // 8. Under RATE_ITEM_MODEL, /merchants/[id] resolves variant slugs from
  //    listings, recent reviews, and radar entries to canonical Item URLs via
  //    getItemSlugsFor, and unmeasured baseline review_risk_score resolves to
  //    null for audit exports (DOS/Rate#1821).
  {
    const prevFlag = process.env.RATE_ITEM_MODEL;
    process.env.RATE_ITEM_MODEL = 'item';
    const ITEM_ID = '00000000-0000-4000-b000-000000001821';
    const VARIANT_SLUG = 'phone-1217-256gb';
    const CANONICAL_ITEM_SLUG = 'phone-1217';
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        );
        const table = url.pathname.replace('/rest/v1/', '');
        const query = decodeURIComponent(url.search);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (offset > 0) {
          return new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        let body: unknown = [];
        if (table === 'merchants') {
          body = [{ ...merchantRow, review_risk_score: 5, metadata: {} }];
        } else if (table === 'products') {
          body = [listingRow];
        } else if (table === 'master_products') {
          body = query.includes('item_id')
            ? [{ slug: VARIANT_SLUG, item_id: ITEM_ID }]
            : [
                {
                  id: MASTER_ID,
                  slug: VARIANT_SLUG,
                  name: 'Phone 1217 256GB',
                  brand: 'X',
                  category_id: null,
                  metadata: { category_slug: 'smartphones' },
                  min_price: 9_000_000,
                  max_price: 9_000_000,
                  merchant_count: 1,
                },
              ];
        } else if (table === 'items') {
          body = [{ id: ITEM_ID, slug: CANONICAL_ITEM_SLUG }];
        } else if (table === 'reviews') {
          body = [];
        }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/*',
          },
        });
      }) as typeof fetch;

      const { getItemSlugsFor } =
        await import('../../server/rate/item-directory');
      const {
        collectMerchantPageProductSlugs,
        resolveMerchantProductHref,
        resolveMerchantReviewRiskScore,
      } = await import('../../app/[locale]/merchants/[id]/page');
      const { buildMerchantAuditCsv, buildMerchantAuditJson } =
        await import('../../components/merchants/MerchantShareAuditButton');

      const base = await getMerchantProfileBase(MERCHANT_ID);
      assert.ok(base);
      assert.equal(
        base.profile.listings[0]?.master_product?.slug,
        VARIANT_SLUG
      );
      assert.equal(
        resolveMerchantReviewRiskScore(base.profile),
        null,
        'unmeasured store (total_reviews === 0) resolves reviewRiskScore to null despite baseline 5'
      );

      const auditProps = {
        merchantName: base.profile.name,
        platform: base.profile.platform,
        platformShopId: base.profile.platform_shop_id,
        isOfficial: base.profile.is_official,
        trustScore: base.profile.trust_score,
        trustLevelLabel: 'Trusted',
        dosafeRiskScore: base.profile.dosafe_risk_score,
        reviewSeedingRiskScore: resolveMerchantReviewRiskScore(base.profile),
        authenticReviews: base.profile.review_risk_breakdown.authentic_count,
        totalReviews: base.profile.review_risk_breakdown.total_reviews,
        flaggedReviews: 0,
        productCount: base.profile.product_count,
      };
      assert.equal(
        buildMerchantAuditJson(auditProps).merchant.reviewSeedingRiskScore,
        null
      );
      const csvLines = buildMerchantAuditCsv(auditProps)
        .replace(/^\uFEFF/, '')
        .split('\n');
      const headers = csvLines[0]!.split(',');
      const cells = csvLines[1]!.split(',');
      assert.equal(cells[headers.indexOf('SeedingRisk(/100)')], '');

      const slugs = collectMerchantPageProductSlugs(
        {
          ...base.profile,
          recent_reviews: [{ master_slug: VARIANT_SLUG }] as never,
        },
        [
          {
            productSlug: VARIANT_SLUG,
            productHref: `/smartphones/${VARIANT_SLUG}`,
          },
        ]
      );
      const itemSlugBySlug = await getItemSlugsFor(slugs);
      assert.deepEqual(itemSlugBySlug, { [VARIANT_SLUG]: CANONICAL_ITEM_SLUG });
      assert.equal(
        resolveMerchantProductHref({
          categorySlug: 'smartphones',
          productSlug: VARIANT_SLUG,
          itemSlugBySlug,
        }),
        `/smartphones/${CANONICAL_ITEM_SLUG}`
      );
      assert.equal(
        resolveMerchantProductHref({
          categorySlug: 'smartphones',
          productSlug: VARIANT_SLUG,
          hash: '#jreviews-section',
          itemSlugBySlug,
        }),
        `/smartphones/${CANONICAL_ITEM_SLUG}#jreviews-section`
      );
    } finally {
      if (prevFlag === undefined) {
        delete process.env.RATE_ITEM_MODEL;
      } else {
        process.env.RATE_ITEM_MODEL = prevFlag;
      }
    }
  }

  console.warn('  ✅ merchant profile reads suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
