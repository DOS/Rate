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
