import assert from 'node:assert/strict';

// A merchant profile on a cold render must not wait on one database round trip
// after another: it reads its listings while the merchant loads, analyses its
// masters while the other reads run, and takes each master's offers and price
// history from the readers it is given (DOS/Rate#1217).

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
};

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
    const entry: Recorded = { route, start: clock++, end: -1 };
    calls.push(entry);
    await new Promise((resolve) => setTimeout(resolve, delay));
    entry.end = clock++;
    const offset = Number(url.searchParams.get('offset') ?? 0);
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
  const { getMerchantProfileById } = await import('../rate-api');

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

  // 1. The given readers serve each master: no offers or price-history reads
  //    of its own, and the analysis comes from the reader.
  {
    const calls = installFetch({});
    const readerCalls: string[] = [];
    let readerStart = -1;
    const profile = await getMerchantProfileById(MERCHANT_ID, {
      offers: async (id) => {
        readerCalls.push(`offers:${id}`);
        readerStart = calls.length;
        return [];
      },
      priceHistory: async (id, offers) => {
        readerCalls.push(`history:${id}:${offers.length}`);
        return { ...emptyHistory, byOffer: { [LISTING_ID]: analysis } };
      },
    });
    assert.ok(profile);
    assert.deepEqual(readerCalls, [
      `offers:${MASTER_ID}`,
      `history:${MASTER_ID}:0`,
    ]);
    assert.equal(
      profile.listings[0]?.discount_analysis?.verdict,
      'fake_discount'
    );
    assert.equal(profile.listings[0]?.master_product?.slug, 'phone-1217');
    const routes = calls.map((c) => c.route);
    for (const own of ['v_products_with_merchant_trust', 'price_history']) {
      assert.ok(
        !routes.includes(own),
        `a profile with readers must not read ${own} itself`
      );
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

    // 3. The master analysis starts before the master, category and review
    //    reads have answered.
    const masters = calls.find((c) => c.route === 'master_products');
    assert.ok(masters);
    assert.ok(
      readerStart >= 0 && readerStart <= masters.start + 1,
      'the master analysis must start alongside the master read'
    );
  }

  // 4. A failed reader fails the profile: it must not be cached without its
  //    analysis (DOS/Rate#329).
  {
    installFetch({});
    await assert.rejects(
      getMerchantProfileById(MERCHANT_ID, {
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
    const profile = await getMerchantProfileById(
      '00000000-0000-4000-8000-0000000000aa',
      {
        offers: async () => [],
        priceHistory: async () => ({ ...emptyHistory, byOffer: {} }),
      }
    );
    assert.ok(profile);
    assert.equal(profile.id, MERCHANT_ID);
    const listingReads = calls.filter((c) => c.route === 'listings');
    // Page and end-of-list read for the guessed id, then for the real one.
    assert.equal(listingReads.length, 4);
    assert.equal(profile.listings.length, 1);
  }

  // 6. An unknown merchant is null, and the early listings read does not
  //    surface as an error.
  {
    installFetch({ merchantFound: () => false });
    assert.equal(
      await getMerchantProfileById('00000000-0000-4000-8000-0000000000bb'),
      null
    );
  }

  console.warn('  ✅ merchant profile reads suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
