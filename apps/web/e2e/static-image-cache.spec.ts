import { expect, test } from '@playwright/test';

// Unhashed static images are cached for a day and reused for a week while
// revalidating, instead of a revalidation per page view (DOS/Rate#1062).
// Pages keep revalidating, and hashed build files stay immutable.
const CACHED = 'public, max-age=86400, stale-while-revalidate=604800';

for (const path of [
  '/img/rate-logo-64.png',
  '/img/devices/apple-iphone-16-128gb.jpg',
  '/img/rate-og.png',
  '/favicon.ico',
]) {
  test(`${path} is cached for a day`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe(CACHED);
  });
}

test('pages and build assets keep their own caching', async ({
  page,
  request,
}) => {
  const html = await request.get('/smartphones');
  expect(html.headers()['cache-control']).not.toBe(CACHED);

  const css: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/_next/static/') && r.url().endsWith('.css'))
      css.push(r.headers()['cache-control'] ?? '');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(css.length).toBeGreaterThan(0);
  for (const value of css) expect(value).toContain('immutable');
});
