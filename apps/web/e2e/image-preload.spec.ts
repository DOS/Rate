import { expect, test } from '@playwright/test';

// List thumbnails are lazy, so React does not preload them with the page:
// they would compete with the hero image, the CSS and the scripts
// (DOS/Rate#789). Only the navbar logo and a product page's own hero may be
// preloaded.
const productImagePreloads = (html: string) =>
  [...html.matchAll(/<link[^>]+rel="preload"[^>]+as="image"[^>]*>/g)]
    .map((m) => /href="([^"]+)"/.exec(m[0])?.[1] ?? '')
    .filter((href) => !href.includes('rate-logo'));

for (const route of [
  '/deals',
  '/leaderboard',
  // A store whose listing has a thumbnail (seed.sql, DOS/Rate#769).
  '/merchants/ffffffff-ffff-4fff-8fff-ffffffff0769',
  '/watchlist',
]) {
  test(`${route} preloads no list thumbnail`, async ({ request }) => {
    const res = await request.get(route);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(productImagePreloads(html)).toEqual([]);
    // The page does render thumbnails, so the check above is not vacuous.
    expect(html).toMatch(/<img[^>]+loading="lazy"/);
  });
}

test('a product page preloads only its own hero image', async ({ request }) => {
  const res = await request.get('/smartphones/iphone-16-pro-max-256gb');
  expect(res.status()).toBe(200);
  const preloads = productImagePreloads(await res.text());
  expect(preloads.length).toBeLessThanOrEqual(1);
  for (const href of preloads) expect(href).toContain('iphone-16-pro-max');
});
