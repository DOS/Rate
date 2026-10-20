/**
 * Behaviour tests for the public write endpoints (issue #155):
 * POST /api/v1/rate/reviews and POST /api/v1/rate/watchlist must act as the
 * signed-in user, never as service_role, and must report failures honestly.
 *
 * The route handlers run for real; only the network is stubbed, so the test sees
 * exactly which Supabase endpoints are called and with which credentials.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SUPABASE_URL = 'https://stub.supabase.test';
const ANON_KEY = 'anon-test-key';
const SERVICE_KEY = 'service-role-test-key';
const GOOD_TOKEN = 'good-user-token';
// A JWT-shaped access token for the cookie session (supabase-js reads its exp).
const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');
const COOKIE_JWT = [
  b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({
    sub: '11111111-2222-4333-8444-555555555555',
    role: 'authenticated',
    email: 'owner@rate.test',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
  'test-signature',
].join('.');
const USER = {
  id: '11111111-2222-4333-8444-555555555555',
  email: 'owner@rate.test',
};
const MASTER_ID = '99999999-8888-4777-8666-555555555555';

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
// eslint-disable-next-line no-restricted-syntax -- a fake key, set so the test can prove no request carries it
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: RecordedCall[] = [];
let rpcResponder: (
  name: string,
  body: unknown
) => { status: number; json: unknown } = () => ({
  status: 500,
  json: { message: 'no responder' },
});

function jsonResponse(status: number, json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  let body: unknown = null;
  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  calls.push({ url, method: init?.method || 'GET', headers, body });

  const { pathname } = new URL(url);
  if (pathname === '/auth/v1/user') {
    return headers.authorization === `Bearer ${GOOD_TOKEN}` ||
      headers.authorization === `Bearer ${COOKIE_JWT}`
      ? jsonResponse(200, {
          ...USER,
          aud: 'authenticated',
          role: 'authenticated',
        })
      : jsonResponse(401, { code: 401, msg: 'invalid JWT' });
  }
  if (pathname.startsWith('/rest/v1/rpc/')) {
    const r = rpcResponder(pathname.slice('/rest/v1/rpc/'.length), body);
    return jsonResponse(r.status, r.json);
  }
  if (pathname === '/rest/v1/master_products') {
    return jsonResponse(200, [
      {
        id: MASTER_ID,
        slug: 'apple-iphone-16-128gb',
        name: 'Apple iPhone 16 128GB',
        brand: 'Apple',
        status: 'published',
        min_price: 20000000,
        max_price: 22000000,
        merchant_count: 0,
        specifications: {},
        key_specs: {},
      },
    ]);
  }
  return jsonResponse(200, []);
}) as typeof fetch;

function rpcCalls(name: string) {
  return calls.filter((c) => c.url.includes(`/rest/v1/rpc/${name}`));
}

function post(url: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const validReview = {
  masterProductId: MASTER_ID,
  authorName: 'Tester',
  comment: 'Màn hình đẹp, pin dùng được hơn một ngày, camera chụp đêm khá tốt.',
  ratingStar: 5,
  reviewerType: 'expert',
  criteriaRatings: {
    screen: 5,
    performance: 4,
    camera: 4,
    battery: 5,
    value: 4,
  },
};

async function testReviews() {
  const { POST } = await import('../reviews/route');
  type Req = Parameters<typeof POST>[0];

  calls = [];
  let res = await POST(post('/api/v1/rate/reviews', validReview) as Req);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'AUTH_REQUIRED');
  assert.equal(rpcCalls('submit_community_review').length, 0);

  calls = [];
  res = await POST(
    post('/api/v1/rate/reviews', validReview, 'forged-token') as Req
  );
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'AUTH_INVALID');
  assert.equal(rpcCalls('submit_community_review').length, 0);

  calls = [];
  res = await POST(
    post(
      '/api/v1/rate/reviews',
      { ...validReview, comment: 'quá ngắn' },
      GOOD_TOKEN
    ) as Req
  );
  assert.equal(res.status, 400);
  assert.equal(rpcCalls('submit_community_review').length, 0);

  calls = [];
  rpcResponder = (_name, body) => ({
    status: 200,
    json: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      author_name: 'Tester',
      rating_star: (body as { p_rating_star: number }).p_rating_star,
      comment: validReview.comment,
      reviewer_type: 'user',
      criteria_ratings: validReview.criteriaRatings,
      verdict: 'authentic',
      flag_category: 'authentic',
      fake_probability: 0.05,
      include_in_rating: true,
      helpfulness_weight: 1,
      reason: 'ok',
      created_at: '2026-10-17T00:00:00Z',
    },
  });
  res = await POST(
    post('/api/v1/rate/reviews', validReview, GOOD_TOKEN) as Req
  );
  assert.equal(res.status, 200);
  const okPayload = await res.json();
  assert.equal(okPayload.ok, true);
  assert.equal(okPayload.mode, 'supabase_rpc');
  assert.equal(okPayload.review.reviewer_type, 'user');
  assert.equal(okPayload.review.helpfulness_weight, 1);
  const [reviewRpc] = rpcCalls('submit_community_review');
  assert.ok(reviewRpc, 'review RPC must be called');
  assert.equal(reviewRpc.headers.authorization, `Bearer ${GOOD_TOKEN}`);
  assert.equal(reviewRpc.headers.apikey, ANON_KEY);
  assert.equal(
    (reviewRpc.body as { p_reviewer_type: string }).p_reviewer_type,
    'user'
  );
  assert.ok(
    calls.every((c) => !JSON.stringify(c.headers).includes(SERVICE_KEY)),
    'no request may carry the service-role key'
  );

  calls = [];
  rpcResponder = () => ({
    status: 500,
    json: { code: 'XX000', message: 'boom' },
  });
  res = await POST(
    post('/api/v1/rate/reviews', validReview, GOOD_TOKEN) as Req
  );
  assert.equal(res.status, 502);
  const failPayload = await res.json();
  assert.equal(failPayload.ok, false);
  assert.equal(failPayload.code, 'PERSIST_FAILED');

  calls = [];
  rpcResponder = () => ({
    status: 404,
    json: { code: 'PGRST202', message: 'Could not find the function' },
  });
  res = await POST(
    post('/api/v1/rate/reviews', validReview, GOOD_TOKEN) as Req
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);

  // Deliberate RPC rejections from the DOS-Me auth gate keep their meaning.
  for (const [sqlstate, status, code] of [
    ['42501', 403, 'FORBIDDEN'],
    ['23505', 409, 'DUPLICATE_REVIEW'],
    ['54000', 429, 'RATE_LIMITED'],
    ['22023', 400, 'REJECTED'],
  ] as const) {
    rpcResponder = () => ({
      status: 400,
      json: { code: sqlstate, message: 'rejected by rpc' },
    });
    res = await POST(
      post('/api/v1/rate/reviews', validReview, GOOD_TOKEN) as Req
    );
    assert.equal(res.status, status, `SQLSTATE ${sqlstate}`);
    const rejected = await res.json();
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, code);
    assert.notEqual(
      rejected.error,
      'rejected by rpc',
      'database error text must never be echoed'
    );
  }

  // The auth-gated RPC stores new reviews unanalyzed and excluded from ratings.
  rpcResponder = () => ({
    status: 200,
    json: {
      id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      author_name: 'Tester',
      rating_star: 5,
      comment: validReview.comment,
      reviewer_type: 'user',
      criteria_ratings: {},
      verdict: 'unanalyzed',
      flag_category: null,
      fake_probability: null,
      include_in_rating: false,
      helpfulness_weight: 0,
      reason: null,
      created_at: '2026-10-17T00:00:00Z',
    },
  });
  res = await POST(
    post('/api/v1/rate/reviews', validReview, GOOD_TOKEN) as Req
  );
  assert.equal(res.status, 200);
  const unanalyzed = (await res.json()).review;
  assert.equal(unanalyzed.verdict, 'unanalyzed');
  assert.equal(unanalyzed.include_in_rating, false);
  assert.equal(unanalyzed.helpfulness_weight, 0);
  assert.equal(unanalyzed.fake_probability, null);

  console.log(
    '  ✅ POST /api/v1/rate/reviews requires a user, runs as that user and never fakes success'
  );
}

async function testWatchlist() {
  const { POST } = await import('../watchlist/route');
  type Req = Parameters<typeof POST>[0];
  const body = {
    slug: 'apple-iphone-16-128gb',
    targetPrice: 19000000,
    subscriberEmail: 'victim@example.com',
    clientFingerprint: 'attacker-chosen',
    locale: 'vi',
  };

  calls = [];
  let res = await POST(post('/api/v1/rate/watchlist', body) as Req);
  assert.equal(res.status, 401);
  assert.equal(rpcCalls('upsert_price_alert').length, 0);

  calls = [];
  res = await POST(
    post(
      '/api/v1/rate/watchlist',
      { ...body, targetPrice: -5 },
      GOOD_TOKEN
    ) as Req
  );
  assert.equal(res.status, 400);
  assert.equal(rpcCalls('upsert_price_alert').length, 0);

  calls = [];
  rpcResponder = () => ({
    status: 200,
    json: { id: 'alert-1', target_price: 19000000 },
  });
  res = await POST(post('/api/v1/rate/watchlist', body, GOOD_TOKEN) as Req);
  assert.equal(res.status, 200);
  const okPayload = await res.json();
  assert.equal(okPayload.ok, true);
  assert.equal(okPayload.persistedInCloud, true);
  const [alertRpc] = rpcCalls('upsert_price_alert');
  assert.ok(alertRpc, 'price alert RPC must be called');
  assert.equal(alertRpc.headers.authorization, `Bearer ${GOOD_TOKEN}`);
  assert.equal(alertRpc.headers.apikey, ANON_KEY);
  const sent = alertRpc.body as Record<string, unknown>;
  assert.equal(
    sent.p_subscriber_email,
    USER.email,
    'recipient must be the account email'
  );
  assert.equal(sent.p_client_fingerprint, `user:${USER.id}`);
  assert.ok(
    calls.every((c) => !JSON.stringify(c.headers).includes(SERVICE_KEY)),
    'no request may carry the service-role key'
  );

  calls = [];
  rpcResponder = () => ({
    status: 500,
    json: { code: 'XX000', message: 'boom' },
  });
  res = await POST(post('/api/v1/rate/watchlist', body, GOOD_TOKEN) as Req);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);

  calls = [];
  rpcResponder = () => ({
    status: 404,
    json: { code: 'PGRST202', message: 'Could not find the function' },
  });
  res = await POST(post('/api/v1/rate/watchlist', body, GOOD_TOKEN) as Req);
  assert.equal(res.status, 200);
  const pending = await res.json();
  assert.equal(pending.ok, true);
  assert.equal(pending.persistedInCloud, false);

  // Deliberate rejections from the DOS-Me price alert auth gate.
  for (const [sqlstate, status, code] of [
    ['22023', 422, 'EMAIL_NOT_VERIFIED'],
    ['42501', 403, 'FORBIDDEN'],
    ['54000', 429, 'RATE_LIMITED'],
    ['P0002', 404, 'NOT_FOUND'],
  ] as const) {
    rpcResponder = () => ({
      status: 400,
      json: { code: sqlstate, message: 'rejected by rpc' },
    });
    res = await POST(post('/api/v1/rate/watchlist', body, GOOD_TOKEN) as Req);
    assert.equal(res.status, status, `SQLSTATE ${sqlstate}`);
    const rejected = await res.json();
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, code);
    assert.notEqual(rejected.error, 'rejected by rpc');
  }

  console.log(
    '  ✅ POST /api/v1/rate/watchlist requires a user, ignores client-chosen email and reports failures'
  );
}

function testSharedDataClients() {
  const distDir = path.resolve(
    __dirname,
    '../../../../../../../../packages/shared-data/dist'
  );
  const script = `
    const root = await import(${JSON.stringify(`file:///${distDir.replace(/\\/g, '/')}/index.js`)});
    const server = await import(${JSON.stringify(`file:///${distDir.replace(/\\/g, '/')}/server.js`)});
    let threw = false;
    try { root.getPublicClient(); } catch { threw = true; }
    console.log(JSON.stringify({
      rootHasAdmin: ['getAdminClient', 'getRateClient', 'getDosafeClient'].some((k) => k in root),
      serverHasAdmin: typeof server.getRateClient === 'function',
      publicThrowsWithoutAnon: threw,
    }));
  `;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete env.SUPABASE_ANON_KEY;
  env.SUPABASE_URL = SUPABASE_URL;
  // eslint-disable-next-line no-restricted-syntax -- a fake key, set so the test can prove no request carries it
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  const out = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      env,
      encoding: 'utf-8',
    }
  );
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout.trim().split('\n').pop() || '{}');
  assert.equal(
    result.rootHasAdmin,
    false,
    '@repo/shared-data root must not export service-role clients'
  );
  assert.equal(
    result.serverHasAdmin,
    true,
    '@repo/shared-data/server must export service-role clients'
  );
  assert.equal(
    result.publicThrowsWithoutAnon,
    true,
    'getPublicClient must throw instead of falling back to the service-role key'
  );
  console.log(
    '  ✅ @repo/shared-data keeps service-role clients behind /server and never falls back to them'
  );
}

/** Builds the Cookie header the web app's @supabase/ssr browser client would send. */
async function cookieSessionHeader(): Promise<string> {
  const { createServerClient } = await import('@supabase/ssr');
  const jar = new Map<string, string>();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const { error } = await client.auth.setSession({
    access_token: COOKIE_JWT,
    refresh_token: 'test-refresh-token',
  });
  assert.equal(error, null, 'setSession must store the cookie session');
  assert.ok(
    jar.size > 0,
    'the session must be written to sb-*-auth-token cookies'
  );
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
}

function postWithCookies(
  url: string,
  body: unknown,
  cookie: string,
  origin?: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: cookie,
    Host: 'localhost',
  };
  if (origin) headers.Origin = origin;
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function testCookieSessions() {
  const { POST } = await import('../watchlist/route');
  type Req = Parameters<typeof POST>[0];
  const body = { slug: 'apple-iphone-16-128gb', targetPrice: 19000000 };
  const cookie = await cookieSessionHeader();
  rpcResponder = () => ({
    status: 200,
    json: { id: 'alert-2', target_price: 19000000 },
  });

  calls = [];
  let res = await POST(
    postWithCookies(
      '/api/v1/rate/watchlist',
      body,
      cookie,
      'http://localhost'
    ) as Req
  );
  assert.equal(res.status, 200, 'a same-origin cookie session is accepted');
  assert.equal(
    res.headers.get('access-control-allow-origin'),
    '*',
    'POST /api/v1/rate/watchlist 200 response must include Access-Control-Allow-Origin: * (#402)'
  );
  const [rpc] = rpcCalls('upsert_price_alert');
  assert.ok(rpc, 'the RPC runs for the cookie session');
  assert.equal(
    rpc.headers.authorization,
    `Bearer ${COOKIE_JWT}`,
    'the RPC carries the cookie session JWT'
  );
  assert.equal(rpc.headers.apikey, ANON_KEY);
  assert.ok(
    calls.every((c) => !c.url.includes('/auth/v1/token')),
    'route handlers never refresh (and burn) the cookie session refresh token'
  );

  for (const origin of ['https://evil.example', undefined]) {
    calls = [];
    res = await POST(
      postWithCookies('/api/v1/rate/watchlist', body, cookie, origin) as Req
    );
    assert.equal(
      res.status,
      403,
      `cookie session from origin ${origin ?? '(none)'} is rejected`
    );
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      '*',
      'authenticateRateRequest 403 rejection must include CORS headers (#402)'
    );
    assert.equal((await res.json()).code, 'CROSS_SITE');
    assert.equal(rpcCalls('upsert_price_alert').length, 0);
  }

  // Over MAX_VALID_VND_PRICE (1_000_000_000) must be rejected with 400 + CORS headers (#402)
  const overMaxPriceRes = await POST(
    postWithCookies(
      '/api/v1/rate/watchlist',
      { slug: 'apple-iphone-16-128gb', targetPrice: 1_500_000_000 },
      cookie,
      'http://localhost'
    ) as Req
  );
  assert.equal(
    overMaxPriceRes.status,
    400,
    'targetPrice > MAX_VALID_VND_PRICE must return 400 (#402)'
  );
  assert.equal(overMaxPriceRes.headers.get('access-control-allow-origin'), '*');

  // Canonical slugs with dots or underscores must pass PriceAlertBodySchema (#402)
  const dotSlugRes = await POST(
    postWithCookies(
      '/api/v1/rate/watchlist',
      { slug: 'ipad-pro-12.9-m2_wifi', targetPrice: 22_000_000 },
      cookie,
      'http://localhost'
    ) as Req
  );
  assert.equal(
    dotSlugRes.status,
    200,
    'PriceAlertBodySchema must accept slugs with dots and underscores (#402)'
  );

  // POST /api/reviews/[id]/vote also accepts same-origin @supabase/ssr cookies and rejects cross-site cookies (#402)
  const { POST: postVote } = await import('@/app/api/reviews/[id]/vote/route');
  type VoteReq = Parameters<typeof postVote>[0];
  const reviewId = '11111111-2222-4333-8444-666666666666';

  const crossSiteVoteRes = await postVote(
    postWithCookies(
      `/api/reviews/${reviewId}/vote`,
      { voteType: 'up' },
      cookie,
      'https://evil.example'
    ) as VoteReq,
    { params: Promise.resolve({ id: reviewId }) }
  );
  assert.equal(
    crossSiteVoteRes.status,
    403,
    'POST /api/reviews/[id]/vote must reject cross-site cookie sessions with 403 (#402)'
  );
  assert.equal((await crossSiteVoteRes.json()).code, 'CROSS_SITE');

  console.log(
    '  ✅ Cookie sessions (@supabase/ssr) work same-origin and are rejected cross-site'
  );
}

async function testFilterBoundsAndWatchlistPrices() {
  const {
    parseBoundedPositiveIntArrayParam,
    resolveWatchlistMasterPriceBounds,
  } = await import('@/server/rate/api-handler');

  assert.deepEqual(
    parseBoundedPositiveIntArrayParam(
      '8, 12, 16, 16.4, 8, -4, 0, NaN, 99999',
      2048,
      10
    ),
    [8, 12, 16],
    'parseBoundedPositiveIntArrayParam must deduplicate positive integers and filter out floats, non-positive, or > maxValue entries (#535)'
  );
  assert.deepEqual(
    parseBoundedPositiveIntArrayParam('1,2,3,4,5', 100, 3),
    [1, 2, 3],
    'parseBoundedPositiveIntArrayParam must cap output length at maxItems (#535)'
  );
  assert.equal(
    parseBoundedPositiveIntArrayParam('0,-5,99999,abc', 2048, 10),
    undefined,
    'parseBoundedPositiveIntArrayParam must return undefined when no valid numbers remain (#535)'
  );

  assert.deepEqual(
    resolveWatchlistMasterPriceBounds({
      min_price: 20_000_000,
      max_price: 25_000_000,
    }),
    { currentMinPrice: 20_000_000, currentMaxPrice: 25_000_000 },
    'resolveWatchlistMasterPriceBounds must preserve valid min_price and max_price (#535)'
  );
  assert.deepEqual(
    resolveWatchlistMasterPriceBounds({
      min_price: 25_000_000,
      max_price: 5_000_000_000, // corrupted > 1B VND
    }),
    { currentMinPrice: 25_000_000, currentMaxPrice: 25_000_000 },
    'resolveWatchlistMasterPriceBounds must fall back currentMaxPrice to currentMinPrice when max_price > MAX_VALID_VND_PRICE (#535)'
  );
  assert.deepEqual(
    resolveWatchlistMasterPriceBounds({
      min_price: 25_000_000,
      max_price: 19_000_000, // inverted < min_price
    }),
    { currentMinPrice: 25_000_000, currentMaxPrice: 25_000_000 },
    'resolveWatchlistMasterPriceBounds must clamp inverted max_price < min_price to currentMinPrice (#535)'
  );
  assert.deepEqual(
    resolveWatchlistMasterPriceBounds(
      {
        min_price: 0,
        max_price: -100,
      },
      21_500_000
    ),
    { currentMinPrice: 21_500_000, currentMaxPrice: 21_500_000 },
    'resolveWatchlistMasterPriceBounds must fall back to bestOfferPrice when master prices are non-positive (#535)'
  );
  assert.deepEqual(
    resolveWatchlistMasterPriceBounds({
      min_price: 0,
      max_price: -100,
    }),
    { currentMinPrice: 0, currentMaxPrice: 0 },
    'resolveWatchlistMasterPriceBounds must return 0 for non-positive prices without bestOfferPrice (#535)'
  );

  console.log(
    '  ✅ Product filter positive-int array bounds & watchlist master price clamping verified (#535)'
  );
}

async function testDealRadarAndApiRouteGuards() {
  const { computeCrossPlatformDealRadarFromData } =
    await import('@/server/rate/deals');
  const { buildRadarIndex, radarExportFields, selectMerchantRadar } =
    await import('@/lib/deal-radar');
  const { GET: getLookup } = await import('@/app/api/v1/rate/lookup/route');

  const radarResponse = computeCrossPlatformDealRadarFromData(
    [
      {
        master: {
          id: MASTER_ID,
          slug: 'galaxy-s24-ultra',
          name: 'Samsung Galaxy S24 Ultra',
          brand: 'Samsung',
          model: 'Galaxy S24 Ultra',
          expert_rating: 99,
          user_rating_weighted: Number.NaN,
          average_rating: 0,
        } as unknown as Parameters<
          typeof computeCrossPlatformDealRadarFromData
        >[0][number]['master'],
        offers: [
          {
            id: 'offer-1',
            platform: 'shopee',
            url: 'https://shopee.vn/product/100/200',
            price_current: 24_000_000,
            price_original: 28_000_000,
            merchant: {
              id: 'shop-1',
              name: 'Official Store',
              is_official: true,
              risk_score: -50,
            },
          },
          {
            id: 'offer-2',
            platform: 'lazada',
            url: 'https://www.lazada.vn/products/s24-i123.html',
            price_current: 26_000_000,
            price_original: 32_000_000,
            merchant: {
              id: 'shop-2',
              name: 'Retail Store',
              is_official: false,
              risk_score: 500,
            },
          },
        ] as unknown as Parameters<
          typeof computeCrossPlatformDealRadarFromData
        >[0][number]['offers'],
      },
    ],
    { limit: 2.9 }
  );
  assert.equal(radarResponse.genuineDeals.length, 1);
  assert.equal(
    radarResponse.genuineDeals[0]!.jreviewsScore10,
    null,
    'computeCrossPlatformDealRadarFromData must sanitize out-of-range (>10) or NaN ratings to null (#544)'
  );
  assert.equal(
    radarResponse.genuineDeals[0]!.merchantRiskScore,
    0,
    'resolveEffectiveMerchantRisk must clamp negative merchant risk scores to 0 (#544)'
  );
  assert.equal(
    radarResponse.fakeSaleTraps.length,
    1,
    'computeCrossPlatformDealRadarFromData must detect inflated fake sale trap (#544)'
  );
  assert.equal(
    radarResponse.fakeSaleTraps[0]!.merchantRiskScore,
    100,
    'resolveEffectiveMerchantRisk must clamp merchant risk scores >100 to 100 (#544)'
  );

  // Deal radar UI helpers must guard against NaN/Infinity/out-of-bounds percentages (#544)
  const malformedPayload: typeof radarResponse = {
    ...radarResponse,
    genuineDeals: [
      {
        ...radarResponse.genuineDeals[0]!,
        savingsVsMedianPct: Number.POSITIVE_INFINITY,
      },
    ],
    priceSpreadLeaders: [
      {
        ...radarResponse.priceSpreadLeaders[0]!,
        spreadPct: Number.NaN,
      },
    ],
  };
  const index = buildRadarIndex(malformedPayload);
  const sig = index.get('galaxy-s24-ultra');
  assert.ok(sig);
  assert.equal(
    sig.savingsPct,
    0,
    'buildRadarIndex must clamp non-finite savingsVsMedianPct to 0 (#544)'
  );
  assert.equal(
    sig.spreadPct,
    0,
    'buildRadarIndex must clamp NaN spreadPct to 0 (#544)'
  );
  const exportFields = radarExportFields({
    ...sig,
    savingsPct: Number.NaN,
    fakeMarkupPct: Number.POSITIVE_INFINITY,
    spreadPct: 99_999,
  });
  assert.equal(exportFields.savingsPct, 0);
  assert.equal(exportFields.fakeMarkupPct, 0);
  assert.equal(exportFields.spreadPct, 10_000);
  assert.equal(
    selectMerchantRadar(malformedPayload, {
      id: 'shop-1',
      name: 'Official Store',
    }).bestSavingsPct,
    0,
    'selectMerchantRadar must clamp non-finite savingsVsMedianPct to 0 (#544)'
  );

  // GET /api/v1/rate/lookup 400 response must include PUBLIC_API_CORS_HEADERS (#544)
  type LookupReq = Parameters<typeof getLookup>[0];
  const badLookupRes = await getLookup({
    nextUrl: new URL('http://localhost/api/v1/rate/lookup'),
    headers: new Headers(),
  } as unknown as LookupReq);
  assert.equal(badLookupRes.status, 400);
  assert.equal(
    badLookupRes.headers.get('Access-Control-Allow-Origin'),
    '*',
    'GET /api/v1/rate/lookup 400 response must include CORS headers (#544)'
  );

  console.log(
    '  ✅ Deal Radar numeric bounds & lookup 400 CORS headers verified (#544)'
  );
}

async function testLeaderboardEngineAndMerchantDirectoryGuards() {
  const {
    scoreMasterProductForLeaderboard,
    rankMasterProductsForLeaderboard,
    comparePositiveMinPrices,
  } = await import('@/lib/leaderboard-engine');
  const {
    DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    summarizeMerchantDirectory,
    pageMerchantDirectory,
  } = await import('@/lib/merchant-directory');

  const scored = scoreMasterProductForLeaderboard({
    id: MASTER_ID,
    slug: 'iphone-16-pro-max',
    name: 'iPhone 16 Pro Max',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    user_rating_weighted: 999,
    expert_rating: Number.POSITIVE_INFINITY,
    authentic_review_count: -5,
    total_reviews: 12,
    min_price: 30_000_000,
    max_price: 20_000_000,
    merchant_count: -3,
  } as unknown as Parameters<typeof scoreMasterProductForLeaderboard>[0]);

  assert.equal(
    scored.userScore5,
    0,
    'scoreMasterProductForLeaderboard must reject user_rating_weighted > 10 (#552)'
  );
  assert.equal(
    scored.expertScore10,
    null,
    'scoreMasterProductForLeaderboard must reject non-finite expert_rating (#552)'
  );
  assert.equal(
    scored.authenticReviewCount,
    12,
    'scoreMasterProductForLeaderboard must fall back to safeTotal when authentic_review_count <= 0 (#552)'
  );
  assert.equal(
    scored.maxPrice,
    30_000_000,
    'scoreMasterProductForLeaderboard must clamp maxPrice >= minPrice (#552)'
  );
  assert.equal(
    scored.merchantCount,
    0,
    'scoreMasterProductForLeaderboard must clamp negative merchant_count to 0 (#552)'
  );

  const ranked = rankMasterProductsForLeaderboard(
    [
      {
        id: 'm-1',
        slug: 'p-1',
        name: 'Phone 1',
        brand: 'Apple',
        model: 'P1',
        user_rating_weighted: 4.8,
        min_price: 20_000_000,
        max_price: 22_000_000,
      },
      {
        id: 'm-2',
        slug: 'p-2',
        name: 'Phone 2',
        brand: 'Apple',
        model: 'P2',
        user_rating_weighted: 4.6,
        min_price: 18_000_000,
        max_price: 19_000_000,
      },
    ] as unknown as Parameters<typeof rankMasterProductsForLeaderboard>[0],
    { limit: 1.9 }
  );
  assert.equal(
    ranked.length,
    1,
    'rankMasterProductsForLeaderboard must floor fractional limit (#552)'
  );
  assert.equal(
    comparePositiveMinPrices(5_000_000_000, 20_000_000),
    'B',
    'comparePositiveMinPrices must treat prices > 1B VND as invalid (#552)'
  );

  const merchants = [
    {
      id: 's-1',
      platform: 'shopee',
      platform_shop_id: 'shop-1',
      name: 'Store 1',
      is_official: true,
      trust_score: Number.NaN,
      review_risk_score: -10,
      product_count: 5,
      follower_count: 1000,
    },
    {
      id: 's-2',
      platform: 'lazada',
      platform_shop_id: 'shop-2',
      name: 'Store 2',
      is_official: false,
      trust_score: 90,
      review_risk_score: 5,
      product_count: 10,
      follower_count: 500,
    },
  ] as unknown as Parameters<typeof summarizeMerchantDirectory>[0];

  const dirSummary = summarizeMerchantDirectory(merchants);
  assert.equal(
    dirSummary.avgTrust,
    45,
    'summarizeMerchantDirectory must clamp NaN trust_score to 0 instead of returning NaN avgTrust (#552)'
  );
  const pagedNan = pageMerchantDirectory(
    merchants,
    DEFAULT_MERCHANT_DIRECTORY_FILTERS,
    Number.NaN,
    Number.NaN
  );
  assert.equal(
    pagedNan.items.length,
    2,
    'pageMerchantDirectory must fall back to offset=0 and MERCHANT_PAGE_SIZE when offset/limit are NaN (#552)'
  );

  console.log(
    '  ✅ Leaderboard engine score/price bounds & merchant directory NaN/pagination guards verified (#552)'
  );
}

async function testRateApiTrustAndOfferBounds() {
  console.log(
    '→ Rate API review trust, dual score, star anomaly, and offer mapping bounds (#557)'
  );
  const {
    computeWilsonLowerBound,
    evaluateReviewTrustAssessment,
    computeCombinedDualScore,
    detectStarDistributionAnomaly,
    computeJReviewsWeight,
    computeBayesianRatingSummary,
    mapTrustViewRowToMerchantOffer,
    mapOfferRowToMerchantOffer,
    filterAndSortMerchants,
  } = await import('../../../../../lib/rate-api');

  assert.equal(
    Number.isFinite(computeWilsonLowerBound(10, 2, Number.NaN)),
    true,
    'computeWilsonLowerBound must fall back to z=1.96 when z is NaN (#557)'
  );
  assert.equal(
    Number.isFinite(computeWilsonLowerBound(10, 2, -5)),
    true,
    'computeWilsonLowerBound must fall back to z=1.96 when z <= 0 (#557)'
  );

  const trustNanVotes = evaluateReviewTrustAssessment({
    rating_star: 5,
    comment: 'Máy dùng rất mượt, pin 5000mAh trụ tốt cả ngày.',
    reviewer_type: 'user',
    upvotes: Number.POSITIVE_INFINITY,
    downvotes: Number.POSITIVE_INFINITY,
    report_count: Number.NaN,
    flag_category: 'authentic',
    verdict: 'authentic',
    include_in_rating: true,
    signals: null,
  });
  assert.equal(
    Number.isFinite(trustNanVotes.breakdown.community),
    true,
    'evaluateReviewTrustAssessment must clamp non-finite vote counts so community factor stays finite (#557)'
  );
  assert.equal(
    Number.isFinite(trustNanVotes.breakdown.weight),
    true,
    'evaluateReviewTrustAssessment must produce finite weight on non-finite vote counts (#557)'
  );

  const dualInf = computeCombinedDualScore({
    userScore: Number.POSITIVE_INFINITY,
    expertScore: 99,
    userConfidence: Number.NaN,
    fallbackAverage: -5,
  });
  assert.equal(
    dualInf.overall,
    0,
    'computeCombinedDualScore must reject non-finite or >10 scores and negative fallbackAverage (#557)'
  );

  const anomalyWithZeroStarRow = detectStarDistributionAnomaly([
    { rating_star: 0, comment: '', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Ok', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Tốt', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Tuyệt vời', flag_category: 'authentic' },
    { rating_star: 5, comment: 'Rất hài lòng', flag_category: 'authentic' },
    { rating_star: 5, comment: '', flag_category: 'authentic' },
  ]);
  assert.equal(
    anomalyWithZeroStarRow.isAnomalous,
    true,
    'detectStarDistributionAnomaly must ignore unrated (0-star) rows instead of counting them as <=3 critical reviews (#557)'
  );
  assert.equal(anomalyWithZeroStarRow.fiveStarRatioPct, 100);

  assert.equal(
    computeJReviewsWeight({
      upvotes: Number.POSITIVE_INFINITY,
      downvotes: Number.POSITIVE_INFINITY,
      reports: Number.NaN,
      flagCategory: 'authentic',
      verdict: 'authentic',
      includeInRating: true,
    }),
    1,
    'computeJReviewsWeight must clamp non-finite vote/report counts instead of returning NaN (#557)'
  );

  const bayesInf = computeBayesianRatingSummary(
    [
      {
        rating_star: 5,
        helpfulness_weight: Number.POSITIVE_INFINITY,
        include_in_rating: true,
      },
    ],
    99
  );
  assert.equal(
    bayesInf.bayesianRating,
    0,
    'computeBayesianRatingSummary must ignore non-finite weights and reject fallbackWeightedRating > 5 (#557)'
  );

  const mappedTrustOffer = mapTrustViewRowToMerchantOffer({
    id: 'off-1',
    merchant_id: 'm-1',
    platform: 'shopee',
    title: 'iPhone 16 Pro 256GB',
    price_current: 5_000_000_000,
    price_original: 6_000_000_000,
    stock: -5,
    rating_star: 9,
    rating_count: -10,
    url: 'https://shopee.vn/product/1/2',
    threat_risk_score: 250,
    dosafe_risk_score: -20,
    review_risk_score: Number.NaN,
  });
  assert.equal(mappedTrustOffer.price_current, 0);
  assert.equal(mappedTrustOffer.rating_star, 5);
  assert.equal(mappedTrustOffer.stock, 0);
  assert.equal(mappedTrustOffer.merchant.risk_score, 100);
  assert.equal(mappedTrustOffer.merchant.dosafe_risk_score, 0);

  const mappedRawOffer = mapOfferRowToMerchantOffer({
    id: 'off-2',
    platform: 'lazada',
    title: 'Galaxy S24 Ultra',
    price_current: 25_990_000,
    price_original: 29_990_000,
    stock: 10,
    rating_star: 4.8,
    rating_count: 20,
    url: 'https://www.lazada.vn/products/p-i123.html',
    merchants: {
      id: 'm-2',
      name: 'Mall',
      platform: 'lazada',
      is_official: true,
      rating_star: 8,
      follower_count: -50,
      risk_score: 180,
    },
  });
  assert.equal(mappedRawOffer.merchant.rating_star, 5);
  assert.equal(mappedRawOffer.merchant.follower_count, 0);
  assert.equal(mappedRawOffer.merchant.risk_score, 100);

  const slicedMerchants = filterAndSortMerchants(
    [
      {
        id: 'm1',
        platform: 'shopee',
        platform_shop_id: 's1',
        name: 'Shop 1',
        slug: null,
        url: null,
        is_official: true,
        rating_star: 4.9,
        follower_count: 100,
        location: null,
        dosafe_risk_score: 0,
        review_risk_score: 0,
        risk_score: 0,
        trust_score: 100,
        product_count: 5,
        min_price: 1000,
        max_price: 2000,
        review_risk_breakdown: {
          total_reviews: 0,
          authentic_count: 0,
          coin_spam_count: 0,
          seeding_fake_count: 0,
          sabotage_or_bombing_count: 0,
          suspicious_ratio_pct: 0,
        },
        updated_at: null,
      },
      {
        id: 'm2',
        platform: 'shopee',
        platform_shop_id: 's2',
        name: 'Shop 2',
        slug: null,
        url: null,
        is_official: false,
        rating_star: 4.8,
        follower_count: 50,
        location: null,
        dosafe_risk_score: 0,
        review_risk_score: 0,
        risk_score: 0,
        trust_score: 90,
        product_count: 3,
        min_price: 1000,
        max_price: 2000,
        review_risk_breakdown: {
          total_reviews: 0,
          authentic_count: 0,
          coin_spam_count: 0,
          seeding_fake_count: 0,
          sabotage_or_bombing_count: 0,
          suspicious_ratio_pct: 0,
        },
        updated_at: null,
      },
    ],
    { limit: 1.8 }
  );
  assert.equal(
    slicedMerchants.length,
    1,
    'filterAndSortMerchants must floor fractional limit (#557)'
  );

  console.log(
    '  ✅ Rate API review trust, dual score, star anomaly, and offer mapping bounds verified (#557)'
  );
}

async function testRequestAuthAndRouteBounds() {
  console.log(
    '→ Request auth Bearer/Origin parsing, voter eligibility, and review/OpenAPI bounds (#578)'
  );
  const { readBearerToken, isSameOriginRequest } =
    await import('@/server/rate/request-auth');
  const { evaluateVoterEligibility } =
    await import('@/app/api/reviews/[id]/vote/route');
  const { toReviewItem } = await import('@/app/api/v1/rate/reviews/route');
  const { normalizeOpenApiServerOrigin, buildRateOpenApiSpec } =
    await import('@/server/rate/openapi');

  assert.equal(
    readBearerToken(
      new Request('https://rate.vn/api/v1/rate/reviews', {
        headers: { Authorization: 'bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' },
      })
    ),
    'eyJhbGciOiJIUzI1NiJ9.payload.sig',
    'readBearerToken must accept case-insensitive Bearer prefix per RFC 6750 (#578)'
  );
  assert.equal(
    readBearerToken(
      new Request('https://rate.vn/api/v1/rate/reviews', {
        headers: { Authorization: `Bearer ${'a'.repeat(5000)}` },
      })
    ),
    '',
    'readBearerToken must reject oversized tokens > 4096 chars (#578)'
  );
  assert.equal(
    readBearerToken(
      new Request('https://rate.vn/api/v1/rate/reviews', {
        headers: { Authorization: 'Bearer tok with space' },
      })
    ),
    '',
    'readBearerToken must reject tokens containing inner whitespace (#578)'
  );

  assert.equal(
    isSameOriginRequest(
      new Request('https://rate.vn/api/v1/rate/reviews', {
        headers: {
          Origin: 'https://RATE.VN',
          'X-Forwarded-Host': 'rate.vn, proxy.internal',
        },
      })
    ),
    true,
    'isSameOriginRequest must extract the first host from comma-separated X-Forwarded-Host and compare case-insensitively (#578)'
  );

  assert.equal(
    evaluateVoterEligibility({
      created_at: 'not-a-valid-timestamp',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    }).eligible,
    false,
    'evaluateVoterEligibility must reject unparseable non-empty created_at strings (#578)'
  );

  const sanitizedReview = toReviewItem(
    {
      id: 'rev-1',
      author_name: 'Tester',
      rating_star: 99,
      comment: 'Đánh giá chi tiết sản phẩm dùng tốt.',
      helpfulness_weight: 50,
      fake_probability: 9.5,
      criteria_ratings: ['invalid-array'],
    },
    { screen: 4.5, performance: 5 }
  );
  assert.equal(sanitizedReview.rating_star, 5);
  assert.equal(sanitizedReview.helpfulness_weight, 10);
  assert.equal(sanitizedReview.fake_probability, 1);
  assert.deepEqual(sanitizedReview.criteria_ratings, {
    screen: 4.5,
    performance: 5,
  });

  assert.equal(
    normalizeOpenApiServerOrigin('javascript:alert(1)'),
    'https://rate.vn',
    'normalizeOpenApiServerOrigin must reject non-http(s) protocols (#578)'
  );
  assert.equal(
    buildRateOpenApiSpec('https://api.rate.vn/some/path?x=1').servers[0]?.url,
    'https://api.rate.vn',
    'buildRateOpenApiSpec must normalize server url to clean origin (#578)'
  );

  console.log(
    '  ✅ Request auth Bearer/Origin parsing, voter eligibility, and review/OpenAPI bounds verified (#578)'
  );
}

async function main() {
  console.log('🧪 Public write-path security suite (#155)');
  await testReviews();
  await testWatchlist();
  await testCookieSessions();
  await testFilterBoundsAndWatchlistPrices();
  await testDealRadarAndApiRouteGuards();
  await testLeaderboardEngineAndMerchantDirectoryGuards();
  await testRateApiTrustAndOfferBounds();
  await testRequestAuthAndRouteBounds();
  testSharedDataClients();
  console.log('✅ Public write-path security suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
