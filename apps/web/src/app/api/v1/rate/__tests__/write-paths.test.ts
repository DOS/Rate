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
    assert.equal((await res.json()).code, 'CROSS_SITE');
    assert.equal(rpcCalls('upsert_price_alert').length, 0);
  }

  console.log(
    '  ✅ Cookie sessions (@supabase/ssr) work same-origin and are rejected cross-site'
  );
}

async function main() {
  console.log('🧪 Public write-path security suite (#155)');
  await testReviews();
  await testWatchlist();
  await testCookieSessions();
  testSharedDataClients();
  console.log('✅ Public write-path security suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
