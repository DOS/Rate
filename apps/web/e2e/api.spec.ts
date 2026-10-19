import { expect, test } from '@playwright/test';

test('public products API reads the seeded catalog', async ({ request }) => {
  const res = await request.get('/api/v1/rate/products?category=smartphones');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(JSON.stringify(body)).toContain('iphone-16-pro-max-256gb');
});

test('product detail API returns 404 for an unknown slug', async ({
  request,
}) => {
  const res = await request.get('/api/v1/rate/products/does-not-exist-e2e');
  expect(res.status()).toBe(404);
});

test('anonymous review submission is rejected', async ({
  request,
  baseURL,
}) => {
  const res = await request.post('/api/v1/rate/reviews', {
    headers: { origin: baseURL! },
    data: {
      productSlug: 'iphone-16-pro-max-256gb',
      rating: 5,
      comment: 'Anonymous write must not land.',
    },
  });
  expect(res.status()).toBe(401);
});

test('anonymous watchlist write is rejected', async ({ request, baseURL }) => {
  const res = await request.post('/api/v1/rate/watchlist', {
    headers: { origin: baseURL! },
    data: { productSlug: 'iphone-16-pro-max-256gb', targetPrice: 25000000 },
  });
  expect(res.status()).toBe(401);
});

// Inspect looks merchants up in the database by id, shop id or name instead of
// reading the whole directory per request (DOS/Rate#372).
test('inspect resolves the matched offer merchant by id', async ({
  request,
}) => {
  const res = await request.get(
    '/api/v1/rate/inspect?q=iphone-16-pro-max-256gb'
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.merchantProfile.name).toBe('Apple Flagship Store');
});

test('inspect keyword search finds a merchant by name', async ({ request }) => {
  const res = await request.get('/api/v1/rate/inspect?q=Last%20Ranked');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('last-ranked-shop');
});

test('inspect treats LIKE wildcards in a keyword literally', async ({
  request,
}) => {
  const res = await request.get('/api/v1/rate/inspect?q=%25');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.matchedType).not.toBe('merchant');
});

// More filtered reviews are seeded than the 60-review sample holds; the
// platform-wide counts must include every one of them (DOS/Rate#455).
test('platform review verdict counts cover every review', async ({
  request,
}) => {
  const res = await request.get('/api/v1/rate/stats');
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data.filteredSeedingCount).toBeGreaterThanOrEqual(120);
  expect(
    data.authenticReviewsCount + data.filteredSeedingCount
  ).toBeLessThanOrEqual(data.totalReviewsCount);
});

// The sitemap lists the whole catalogue: 1,100+ seeded merchants, past the
// old 200-merchant cap (DOS/Rate#460).
test('sitemap lists every merchant and product page', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(
    (xml.match(/\/merchants\/[0-9a-f-]{36}</g) ?? []).length
  ).toBeGreaterThan(1100);
  expect(xml).toContain('/smartphones/e2e-many-offers-phone<');
});

// 201 seeded earbuds share one rating: a query for one outside the 100
// best-rated must still find it (DOS/Rate#473).
test('leaderboard filters the whole category, not its top 100', async ({
  request,
}) => {
  const res = await request.get(
    '/api/v1/rate/leaderboard?category=earbuds&q=E2E%20Bud%20150&limit=5'
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.items.map((i: { slug: string }) => i.slug)).toEqual([
    'e2e-bud-150',
  ]);
});
