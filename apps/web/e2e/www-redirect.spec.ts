import { expect, test } from '@playwright/test';

// www.rate.vn redirects to the apex with path and query, and the apex itself
// is served as before (DOS/Rate#744).
test('www host redirects to rate.vn with path and query', async ({
  request,
}) => {
  const res = await request.get('/smartphones?sort=price', {
    headers: { host: 'www.rate.vn' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(308);
  expect(res.headers()['location']).toBe(
    'https://rate.vn/smartphones?sort=price'
  );

  const root = await request.get('/', {
    headers: { host: 'www.rate.vn' },
    maxRedirects: 0,
  });
  expect(root.status()).toBe(308);
  // "https://rate.vn" and "https://rate.vn/" are the same URL.
  expect(root.headers()['location']).toMatch(/^https:\/\/rate\.vn\/?$/);
});

test('the apex host is not redirected', async ({ request }) => {
  const res = await request.get('/smartphones', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
});
