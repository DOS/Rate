import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function runExtensionLookupRouteTests(): Promise<void> {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

  let catalogRows: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    const body =
      url.pathname === '/rest/v1/rpc/search_master_products' ? catalogRows : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/*' },
    });
  }) as typeof fetch;

  try {
    const { NextRequest } = await import('next/server');
    const { GET } = await import('../route');
    const baseMaster = {
      id: '22222222-2222-4222-8222-222222222128',
      slug: 'apple-iphone-16-128gb',
      name: 'Apple iPhone 16 128GB',
      brand: 'Apple',
      model: 'iPhone 16',
      status: 'published',
      storage_gb: 128,
      ram_gb: 8,
      min_price: 21_990_000,
      max_price: 23_990_000,
      merchant_count: 3,
      total_reviews: 24,
      authentic_review_count: 20,
      specifications: { category_slug: 'smartphones' },
      key_specs: {},
    };

    const queryLookup = async (ipSuffix: number, query: string) => {
      const res = await GET(
        new NextRequest(
          `http://localhost/api/v1/rate/extension/lookup?${query}`,
          { headers: { 'x-forwarded-for': `198.51.100.${ipSuffix}` } }
        )
      );
      assert.equal(res.status, 200);
      return (await res.json()) as {
        ok: boolean;
        data: { masterProduct: Record<string, unknown> | null };
      };
    };

    catalogRows = [
      {
        ...baseMaster,
        rating_score: 4.35,
        user_rating_weighted: 4.8,
        average_rating: 4.9,
      },
    ];
    const storedHalfUp = await queryLookup(
      91,
      'title=Apple+iPhone+16+128GB&mode=pill'
    );
    assert.equal(storedHalfUp.data.masterProduct?.rating_score, 4.35);
    assert.equal(storedHalfUp.data.masterProduct?.rating_score_5, 4.4);

    catalogRows = [{ ...baseMaster, rating_score: 4.249, average_rating: 4.9 }];
    const singleRound = await queryLookup(
      92,
      'title=Apple+iPhone+16+128GB&mode=pill'
    );
    assert.equal(singleRound.data.masterProduct?.rating_score, 4.249);
    assert.equal(singleRound.data.masterProduct?.rating_score_5, 4.2);

    catalogRows = [
      { ...baseMaster, rating_score: null, user_rating_weighted: 4.05 },
    ];
    const fallbackWeighted = await queryLookup(
      93,
      'title=Apple+iPhone+16+128GB&mode=pill'
    );
    assert.equal(fallbackWeighted.data.masterProduct?.rating_score, null);
    assert.equal(fallbackWeighted.data.masterProduct?.rating_score_5, 4.1);

    catalogRows = [
      {
        ...baseMaster,
        rating_score: null,
        user_rating_weighted: 0,
        average_rating: 0,
      },
    ];
    const unrated = await queryLookup(
      94,
      'title=Apple+iPhone+16+128GB&mode=pill'
    );
    assert.equal(unrated.data.masterProduct?.rating_score, null);
    assert.equal(unrated.data.masterProduct?.rating_score_5, null);

    catalogRows = [];
    const missing = await queryLookup(95, 'title=Unknown+Model+XYZ&mode=pill');
    assert.equal(missing.data.masterProduct, null);
    console.warn(
      '  ✅ GET /api/v1/rate/extension/lookup exposes rating_score & rating_score_5 (#1656)'
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevAnon === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runExtensionLookupRouteTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
