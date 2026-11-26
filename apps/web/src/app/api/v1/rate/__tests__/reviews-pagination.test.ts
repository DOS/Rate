import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

const MASTER_ID = '99999999-9999-4999-8999-999999990001';
const MASTER_SLUG = 'paginated-test-phone';
const LISTING_IDS = Array.from(
  { length: 160 },
  (_, idx) => `88888888-8888-4888-8888-${String(idx + 1).padStart(12, '0')}`
);
const CATEGORY_ID = '77777777-7777-4777-8777-777777770001';

interface StubReviewRow {
  id: string;
  product_id: string;
  author_name: string;
  rating_star: number;
  comment: string;
  variation: string | null;
  images: string[] | null;
  created_at: string;
  reviewer_type: 'user' | 'expert';
  upvotes: number;
  downvotes: number;
  report_count: number;
  helpfulness_weight: number;
  criteria_ratings: Record<string, number>;
  review_flags: {
    verdict: 'authentic' | 'suspicious' | 'fake' | 'unanalyzed' | null;
    flag_category:
      | 'authentic'
      | 'low_value_coin_spam'
      | 'seeding_fake'
      | 'competitor_sabotage'
      | 'review_bombing'
      | null;
    include_in_rating: boolean | null;
  } | null;
}

const uuidFor = (n: number) =>
  `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;

// 65 reviews split across two chunks of listings (listing 1 and listing 160),
// with two tied timestamps to verify secondary sort & cursor tie-breaking.
const ALL_REVIEWS: StubReviewRow[] = Array.from({ length: 65 }, (_, idx) => {
  const num = idx + 1;
  // Reviews 1 and 2 share the exact same microsecond timestamp; higher UUID sorts first.
  const createdAt =
    num === 1 || num === 2
      ? '2026-11-26T04:00:00.123456+00:00'
      : `2026-11-${String(Math.max(1, 25 - Math.floor(idx / 3))).padStart(2, '0')}T${String(23 - (idx % 24)).padStart(2, '0')}:00:00.000000Z`;
  const id =
    num === 1 ? uuidFor(999) : num === 2 ? uuidFor(111) : uuidFor(900 - num);
  return {
    id,
    product_id: idx % 2 === 0 ? LISTING_IDS[0]! : LISTING_IDS[159]!,
    author_name: `Buyer ${num}`,
    rating_star: 5,
    comment: `Detailed review number ${num} with real-world battery feedback.`,
    variation: null,
    images:
      num === 1
        ? [
            'http://insecure.example.com/drop.jpg',
            'https://cdn.example.com/pic-1.jpg',
            'https://cdn.example.com/pic-1.jpg',
            'https://cdn.example.com/pic-2.jpg',
            'https://cdn.example.com/pic-3.jpg',
            'https://cdn.example.com/pic-4.jpg',
            'https://cdn.example.com/pic-5.jpg',
            'https://cdn.example.com/pic-6.jpg',
            'https://cdn.example.com/pic-7-dropped.jpg',
          ]
        : [],
    created_at: createdAt,
    reviewer_type: 'user',
    upvotes: 1,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: 1.2,
    criteria_ratings: { display: 5 },
    review_flags: {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    },
  };
});

// Product with 55 leading fake reviews followed by 8 authentic reviews for hideFake pagination.
const HIDE_FAKE_MASTER = '99999999-9999-4999-8999-999999990002';
const HIDE_FAKE_SLUG = 'hide-fake-paged-phone';
const HIDE_FAKE_LISTING = '88888888-8888-4888-8888-999999990002';
const HIDE_FAKE_ROWS: StubReviewRow[] = Array.from({ length: 63 }, (_, idx) => {
  const num = idx + 1;
  const isFake = num <= 55;
  return {
    id: uuidFor(5000 - num),
    product_id: HIDE_FAKE_LISTING,
    author_name: isFake ? `Fake ${num}` : `Real ${num - 55}`,
    rating_star: 5,
    comment: isFake ? 'Coin spam copy' : `Authentic experience ${num - 55}`,
    variation: null,
    images: [],
    created_at: `2026-10-${String(Math.max(1, 28 - Math.floor(idx / 3))).padStart(2, '0')}T${String(23 - (idx % 24)).padStart(2, '0')}:00:00Z`,
    reviewer_type: 'user',
    upvotes: 0,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: isFake ? 0 : 1.1,
    criteria_ratings: {},
    review_flags: {
      verdict: isFake ? 'fake' : 'authentic',
      flag_category: isFake ? 'seeding_fake' : 'authentic',
      include_in_rating: !isFake,
    },
  };
});

// Multi-chunk (>150 listings) product where Chunk 1 has 52 newer fake reviews
// followed by an authentic review at position 53 (newer than Chunk 2's authentic review),
// verifying the chunk frontier prevents skipping Chunk 1's authentic review (#1926).
const MULTI_CHUNK_HF_MASTER = '99999999-9999-4999-8999-999999990003';
const MULTI_CHUNK_HF_SLUG = 'multi-chunk-hide-fake-phone';
const MULTI_CHUNK_HF_ROWS: StubReviewRow[] = [
  ...Array.from({ length: 52 }, (_, idx) => ({
    id: uuidFor(7000 - idx),
    product_id: LISTING_IDS[0]!,
    author_name: `Chunk1 Fake ${idx + 1}`,
    rating_star: 5,
    comment: 'Spam',
    variation: null,
    images: [],
    created_at: `2026-09-${String(28 - Math.floor(idx / 3)).padStart(2, '0')}T${String(23 - (idx % 24)).padStart(2, '0')}:00:00Z`,
    reviewer_type: 'user' as const,
    upvotes: 0,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: 0,
    criteria_ratings: {},
    review_flags: {
      verdict: 'fake' as const,
      flag_category: 'seeding_fake' as const,
      include_in_rating: false,
    },
  })),
  {
    id: uuidFor(6500),
    product_id: LISTING_IDS[0]!,
    author_name: 'Chunk1 Authentic',
    rating_star: 5,
    comment: 'Authentic review sitting past the first 50 fake rows in chunk 1.',
    variation: null,
    images: [],
    created_at: '2026-09-05T12:00:00Z',
    reviewer_type: 'user',
    upvotes: 2,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: 1.5,
    criteria_ratings: {},
    review_flags: {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    },
  },
  {
    id: uuidFor(6400),
    product_id: LISTING_IDS[159]!,
    author_name: 'Chunk2 Authentic Older',
    rating_star: 4,
    comment: 'Older authentic review in chunk 2.',
    variation: null,
    images: [],
    created_at: '2026-09-01T12:00:00Z',
    reviewer_type: 'user',
    upvotes: 1,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: 1.2,
    criteria_ratings: {},
    review_flags: {
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
    },
  },
];

function parseInValues(filter: string | null): string[] | null {
  if (!filter) return null;
  if (filter.startsWith('eq.')) return [filter.slice(3)];
  if (filter.startsWith('in.(')) {
    return filter
      .slice(4, -1)
      .split(',')
      .map((s) => s.replace(/^"|"$/g, ''));
  }
  return null;
}

function parseOrCursor(
  orParam: string | null
): { createdAt: string; id: string } | null {
  if (!orParam) return null;
  const m =
    /created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)/i.exec(
      orParam
    );
  if (!m) return null;
  return { createdAt: m[1]!, id: m[3]!.toLowerCase() };
}

function jsonResp(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

let activeReviewsSet: StubReviewRow[] = ALL_REVIEWS;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const { pathname, searchParams } = new URL(url);
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();

  if (pathname === '/rest/v1/categories') {
    return jsonResp(200, [{ id: CATEGORY_ID, slug: 'smartphones' }]);
  }
  if (pathname === '/rest/v1/master_products') {
    const idFilter = searchParams.get('id');
    const slugFilter = searchParams.get('slug');
    const isHideFake =
      idFilter === `eq.${HIDE_FAKE_MASTER}` ||
      slugFilter === `eq.${HIDE_FAKE_SLUG}`;
    const isMultiChunkHf =
      idFilter === `eq.${MULTI_CHUNK_HF_MASTER}` ||
      slugFilter === `eq.${MULTI_CHUNK_HF_SLUG}`;
    const row = isMultiChunkHf
      ? {
          id: MULTI_CHUNK_HF_MASTER,
          slug: MULTI_CHUNK_HF_SLUG,
          name: 'Multi Chunk Hide Fake Phone',
          brand: 'Test',
          status: 'published',
          category_id: CATEGORY_ID,
          specifications: {},
          key_specs: {},
        }
      : isHideFake
        ? {
            id: HIDE_FAKE_MASTER,
            slug: HIDE_FAKE_SLUG,
            name: 'Hide Fake Phone',
            brand: 'Test',
            status: 'published',
            category_id: CATEGORY_ID,
            specifications: {},
            key_specs: {},
          }
        : {
            id: MASTER_ID,
            slug: MASTER_SLUG,
            name: 'Paginated Test Phone',
            brand: 'Test',
            status: 'published',
            category_id: CATEGORY_ID,
            specifications: {},
            key_specs: {},
          };
    activeReviewsSet = isMultiChunkHf
      ? MULTI_CHUNK_HF_ROWS
      : isHideFake
        ? HIDE_FAKE_ROWS
        : ALL_REVIEWS;
    return jsonResp(
      200,
      headers.get('accept')?.includes('application/vnd.pgrst.object+json')
        ? row
        : [row]
    );
  }
  if (pathname === '/rest/v1/products') {
    const cluster = searchParams.get('cluster_id');
    const rows =
      cluster === `eq.${HIDE_FAKE_MASTER}`
        ? [{ id: HIDE_FAKE_LISTING }]
        : LISTING_IDS.map((id) => ({ id }));
    const offset = Number(searchParams.get('offset') ?? 0);
    const limit = Number(searchParams.get('limit') ?? rows.length);
    const slice = rows.slice(offset, offset + limit);
    return jsonResp(200, slice, {
      'Content-Range': `0-${Math.max(0, slice.length - 1)}/${rows.length}`,
    });
  }
  if (pathname === '/rest/v1/reviews') {
    const wantedProducts = parseInValues(searchParams.get('product_id'));
    let matching = wantedProducts
      ? activeReviewsSet.filter((r) => wantedProducts.includes(r.product_id))
      : [...activeReviewsSet];

    const totalMatching = matching.length;
    const cursor = parseOrCursor(searchParams.get('or'));
    if (cursor) {
      const { isAfterReviewCursor } = await import('@/lib/review-cursor');
      matching = matching.filter((r) => isAfterReviewCursor(r, cursor));
    }

    const { compareReviewOrderDesc } = await import('@/lib/review-cursor');
    matching.sort(compareReviewOrderDesc);

    const limit = Number(searchParams.get('limit') ?? matching.length);
    const sliced = matching.slice(0, limit);
    const prefer = headers.get('prefer') ?? '';
    const countHeader: Record<string, string> = prefer.includes('count=exact')
      ? { 'Content-Range': `0-0/${totalMatching}` }
      : {};
    if (method === 'HEAD') {
      return jsonResp(200, null, countHeader);
    }
    return jsonResp(200, sliced, countHeader);
  }
  return jsonResp(200, []);
}) as typeof fetch;

async function main() {
  console.warn(
    '🧪 Reviews keyset pagination & photos API suite (#1924, #1926)'
  );

  const { getMasterProductReviews, getMasterProductReviewsPage } =
    await import('@/lib/rate-api');
  const { GET } = await import('../reviews/route');
  const { buildRateOpenApiSpec } = await import('@/server/rate/openapi');

  // 1. #1924: getMasterProductReviews selects and sanitizes images onto ReviewItem.
  activeReviewsSet = ALL_REVIEWS;
  const first50 = await getMasterProductReviews(MASTER_ID);
  assert.equal(first50.length, 50);
  assert.equal(first50[0]?.id, ALL_REVIEWS[0]?.id);
  assert.equal(first50[1]?.id, ALL_REVIEWS[1]?.id);
  assert.deepEqual(first50[0]?.images, [
    'https://cdn.example.com/pic-1.jpg',
    'https://cdn.example.com/pic-2.jpg',
    'https://cdn.example.com/pic-3.jpg',
    'https://cdn.example.com/pic-4.jpg',
    'https://cdn.example.com/pic-5.jpg',
    'https://cdn.example.com/pic-6.jpg',
  ]);

  // 2. #1926: getMasterProductReviewsPage paginates past 50 without hard cap.
  const page60 = await getMasterProductReviewsPage(MASTER_ID, { limit: 60 });
  assert.equal(page60.reviews.length, 60);
  assert.equal(page60.totalCount, 65);
  assert.equal(page60.hasMore, true);
  assert.ok(page60.nextCursor);

  const pageRest = await getMasterProductReviewsPage(MASTER_ID, {
    limit: 60,
    cursor: (await import('@/lib/review-cursor')).parseReviewCursor(
      page60.nextCursor
    ),
  });
  assert.equal(pageRest.reviews.length, 5);
  assert.equal(pageRest.totalCount, 65);
  assert.equal(pageRest.hasMore, false);
  assert.equal(pageRest.nextCursor, null);

  // 3. Multi-page GET /api/v1/rate/reviews walks all 65 reviews with zero duplicates.
  const get = (query: string, ip = '198.51.100.10') =>
    GET(
      new NextRequest(`http://localhost/api/v1/rate/reviews?${query}`, {
        headers: { 'x-forwarded-for': ip },
      })
    );

  const collectedIds: string[] = [];
  let cursor: string | null = null;
  for (let pageIdx = 0; pageIdx < 3; pageIdx += 1) {
    const q = cursor
      ? `slug=${MASTER_SLUG}&limit=25&cursor=${encodeURIComponent(cursor)}`
      : `slug=${MASTER_SLUG}&limit=25`;
    const res = await get(q);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.totalCount, 65);
    if (pageIdx < 2) {
      assert.equal(body.count, 25);
      assert.equal(body.hasMore, true);
      assert.equal(typeof body.nextCursor, 'string');
    } else {
      assert.equal(body.count, 15);
      assert.equal(body.hasMore, false);
      assert.equal(body.nextCursor, null);
    }
    if (pageIdx === 0) {
      assert.equal(body.data[0]?.images?.length, 6);
    }
    for (const item of body.data as Array<{ id: string }>) {
      collectedIds.push(item.id);
    }
    cursor = body.nextCursor;
  }
  assert.equal(collectedIds.length, 65);
  assert.equal(new Set(collectedIds).size, 65);

  // 4. hideFake=1 skips leading fake reviews across batches and paginates authentics.
  const hfPage1Res = await get(`slug=${HIDE_FAKE_SLUG}&hideFake=1&limit=5`);
  assert.equal(hfPage1Res.status, 200);
  const hfPage1 = await hfPage1Res.json();
  assert.equal(hfPage1.totalCount, 63);
  assert.equal(hfPage1.count, 5);
  assert.equal(hfPage1.hasMore, true);
  assert.ok(hfPage1.nextCursor);
  assert.deepEqual(
    hfPage1.data.map((r: { author_name: string }) => r.author_name),
    ['Real 1', 'Real 2', 'Real 3', 'Real 4', 'Real 5']
  );

  const hfPage2Res = await get(
    `slug=${HIDE_FAKE_SLUG}&hideFake=1&limit=5&cursor=${encodeURIComponent(hfPage1.nextCursor)}`
  );
  assert.equal(hfPage2Res.status, 200);
  const hfPage2 = await hfPage2Res.json();
  assert.equal(hfPage2.totalCount, 63);
  assert.equal(hfPage2.count, 3);
  assert.equal(hfPage2.hasMore, false);
  assert.equal(hfPage2.nextCursor, null);
  assert.deepEqual(
    hfPage2.data.map((r: { author_name: string }) => r.author_name),
    ['Real 6', 'Real 7', 'Real 8']
  );

  // 4b. Multi-chunk hideFake frontier preserves chunk 1's newer authentic review ahead of chunk 2's older one.
  const multiHfPage1Res = await get(
    `slug=${MULTI_CHUNK_HF_SLUG}&hideFake=1&limit=1`
  );
  assert.equal(multiHfPage1Res.status, 200);
  const multiHfPage1 = await multiHfPage1Res.json();
  assert.equal(multiHfPage1.data[0]?.author_name, 'Chunk1 Authentic');
  assert.equal(multiHfPage1.hasMore, true);

  const multiHfPage2Res = await get(
    `slug=${MULTI_CHUNK_HF_SLUG}&hideFake=1&limit=1&cursor=${encodeURIComponent(multiHfPage1.nextCursor)}`
  );
  assert.equal(multiHfPage2Res.status, 200);
  const multiHfPage2 = await multiHfPage2Res.json();
  assert.equal(multiHfPage2.data[0]?.author_name, 'Chunk2 Authentic Older');
  assert.equal(multiHfPage2.hasMore, false);

  // 5. Invalid cursor (including impossible calendar dates) -> 400.
  const badCalendarCursor = Buffer.from(
    JSON.stringify({
      v: 1,
      c: '2026-02-31T00:00:00Z',
      i: '44444444-4444-4444-8444-444444444441',
    })
  ).toString('base64url');
  for (const bad of ['not-a-valid-cursor', badCalendarCursor]) {
    const badCursorRes = await get(
      `slug=${MASTER_SLUG}&cursor=${encodeURIComponent(bad)}`
    );
    assert.equal(badCursorRes.status, 400);
    assert.equal((await badCursorRes.json()).ok, false);
  }

  // 6. Rate limiting: 60 req/min per IP -> 61st returns 429 with Retry-After: 60.
  const limitedIp = '198.51.100.77';
  for (let i = 0; i < 60; i += 1) {
    const r = await get(`slug=${MASTER_SLUG}&limit=1`, limitedIp);
    assert.equal(r.status, 200, `request ${i + 1} allowed`);
  }
  const rateLimited = await get(`slug=${MASTER_SLUG}&limit=1`, limitedIp);
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get('retry-after'), '60');
  assert.equal((await rateLimited.json()).code, 'RATE_LIMIT_EXCEEDED');

  const otherIp = await get(`slug=${MASTER_SLUG}&limit=1`, '198.51.100.78');
  assert.equal(otherIp.status, 200);

  // 7. OpenAPI documents cursor, nextCursor, hasMore, 429, and ReviewItem.images.
  const spec = buildRateOpenApiSpec('https://rate.vn');
  const reviewsGet = spec.paths['/api/v1/rate/reviews']?.get;
  assert.ok(reviewsGet);
  assert.ok(reviewsGet.parameters?.some((p) => p.name === 'cursor'));
  assert.ok(reviewsGet.responses['429']);
  const okSchema = reviewsGet.responses['200']?.content?.['application/json']
    ?.schema as { properties?: Record<string, unknown> } | undefined;
  const okProps = okSchema?.properties ?? {};
  assert.ok(okProps.nextCursor);
  assert.ok(okProps.hasMore);
  const reviewItemProps = (
    spec.components.schemas.ReviewItem as {
      properties: Record<string, unknown>;
    }
  ).properties;
  assert.deepEqual(reviewItemProps.images, {
    type: 'array',
    maxItems: 6,
    items: { type: 'string', format: 'uri' },
    description: 'Sanitized HTTPS review photo URLs (at most 6).',
  });

  console.warn(
    '✅ Reviews keyset pagination & photos API suite passed (#1924, #1926)'
  );
}

main();
