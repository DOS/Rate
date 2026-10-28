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

  console.warn('  ✅ merchant profile reads suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
