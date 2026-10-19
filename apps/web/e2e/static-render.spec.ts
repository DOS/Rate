import { expect, test } from '@playwright/test';

// Pages without searchParams are cached after their first render instead of
// rendering on every request (DOS/Rate#491).
const CACHED = ['/faq', '/smartphones/iphone-16-pro-max-256gb', '/'];

for (const path of CACHED) {
  test(`${path} is served from the page cache after its first render`, async ({
    request,
  }) => {
    expect((await request.get(path)).status()).toBe(200);
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
    expect(res.headers()['cache-control'] ?? '').not.toContain('no-store');
  });
}

test('each locale has its own cached page and <html lang>', async ({
  request,
}) => {
  for (const locale of ['vi', 'en', 'cs']) {
    const headers = { cookie: `NEXT_LOCALE=${locale}` };
    await request.get('/faq', { headers });
    const res = await request.get('/faq', { headers });
    expect(res.headers()['x-nextjs-cache']).toMatch(/^(HIT|STALE)$/);
    expect(await res.text()).toContain(`<html lang="${locale}"`);
  }
});

test('a page that reads searchParams still renders per request', async ({
  request,
}) => {
  const res = await request.get('/smartphones?page=2');
  expect(res.status()).toBe(200);
  expect(res.headers()['x-nextjs-cache']).toBeUndefined();
});

// The plain catalogue listing (no filter) shares the data cache; a filtered
// one still queries every time (DOS/Rate#495). The e2e proxy logs RPC calls.
type RpcCall = { fn: string; body: string };
// Exact RPC bodies of the two catalogue reads below (seeded earbuds category,
// sorted by newest), which no other spec makes.
const EARBUDS = '"p_category_id":"c0000000-0000-4000-8000-000000000005"';
const PLAIN_BODY = `{${EARBUDS},"p_sort":"newest","p_limit":201,"p_offset":0}`;
const FILTERED_BODY = `{${EARBUDS},"p_min_rating":3,"p_sort":"newest","p_limit":201,"p_offset":0}`;
async function catalogueReads(
  request: import('@playwright/test').APIRequestContext,
  body: string
): Promise<number> {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const log = (await (
    await request.get(`${supabase}/__e2e/rpc-log`)
  ).json()) as RpcCall[];
  return log.filter(
    (call) => call.fn === 'search_master_products' && call.body === body
  ).length;
}

test('the plain catalogue listing is served from the data cache', async ({
  request,
}) => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'needs the e2e stack');
  expect((await request.get('/earbuds?sort=newest')).status()).toBe(200);
  const first = await catalogueReads(request, PLAIN_BODY);
  expect((await request.get('/earbuds?sort=newest')).status()).toBe(200);
  expect(await catalogueReads(request, PLAIN_BODY)).toBe(first);
});

test('a filtered catalogue listing still queries every time', async ({
  request,
}) => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'needs the e2e stack');
  const path = '/earbuds?sort=newest&rating=3';
  expect((await request.get(path)).status()).toBe(200);
  const first = await catalogueReads(request, FILTERED_BODY);
  expect(first).toBeGreaterThan(0);
  expect((await request.get(path)).status()).toBe(200);
  expect(await catalogueReads(request, FILTERED_BODY)).toBe(first + 1);
});

test('the document declares its charset once', async ({ request }) => {
  const html = await (await request.get('/faq')).text();
  expect(html.match(/<meta charSet="utf-8"\/>/gi)).toHaveLength(1);
});
