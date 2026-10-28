import assert from 'node:assert/strict';

// A merchant profile on a cold render must not wait on one database round trip
// after another: it reads its listings while the merchant loads, and its
// discount analysis is added outside its cache entry from the readers it is
// given, so the product pages' cached entries are reused (DOS/Rate#1217).

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';

const MERCHANT_ID = '00000000-0000-4000-8000-000000001217';
const MASTER_ID = '00000000-0000-4000-9000-000000001217';
const LISTING_ID = '00000000-0000-4000-a000-000000001217';

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
  availability: 'in_stock',
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
      body = offset > 0 ? [] : [listingRow];
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
    // The listing carries its availability (DOS/Rate#1248).
    assert.equal(base.profile.listings[0]?.availability, 'in_stock');
    assert.ok(
      listingUrls.some((q) =>
        /select=[^&]*availability/.test(decodeURIComponent(q))
      ),
      'the listings read selects availability'
    );
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

    // A sold-out listing gets no deal verdict (DOS/Rate#1248).
    const soldOutBase = {
      ...base,
      profile: {
        ...base.profile,
        listings: base.profile.listings.map((l) => ({
          ...l,
          availability: 'out_of_stock' as const,
        })),
      },
    };
    const soldOutProfile = await attachMerchantDiscountAnalysis(soldOutBase, {
      offers: async () => [],
      priceHistory: async () => ({
        ...emptyHistory,
        byOffer: { [LISTING_ID]: analysis },
      }),
    });
    assert.equal(soldOutProfile.listings[0]?.discount_analysis, null);
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
    assert.equal(base.profile.listings.length, 1);
  }

  // 6. An unknown merchant is null, even when the early listings read fails.
  {
    installFetch({ merchantFound: () => false });
    assert.equal(
      await getMerchantProfileById('00000000-0000-4000-8000-0000000000bb'),
      null
    );
    installFetch({ merchantFound: () => false, listingsFail: true });
    assert.equal(
      await getMerchantProfileBase('00000000-0000-4000-8000-0000000000cc'),
      null
    );
  }

  // 7. A failed listings read for the merchant found fails the profile.
  {
    installFetch({ listingsFail: true });
    await assert.rejects(getMerchantProfileBase(MERCHANT_ID));
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(unhandled, [], 'no read may fail unhandled');

  console.warn('  ✅ merchant profile reads suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
