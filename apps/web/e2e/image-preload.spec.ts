import { expect, test, type APIResponse } from '@playwright/test';

// List thumbnails are lazy, so React does not preload them with the page:
// they would compete with the hero image, the CSS and the scripts
// (DOS/Rate#789). Only the navbar logo and a product page's own hero may be
// preloaded. React puts image preloads in the `Link` response header first
// and only the overflow into <link> tags, so both are read.
async function productImagePreloads(res: APIResponse): Promise<string[]> {
  const html = await res.text();
  const fromHtml = [
    ...html.matchAll(/<link[^>]+rel="preload"[^>]+as="image"[^>]*>/g),
  ].map((m) => /href="([^"]+)"/.exec(m[0])?.[1] ?? '');
  const fromHeader = (res.headers()['link'] ?? '')
    .split(/,(?=\s*<)/)
    .filter(
      (entry) => /rel="?preload"?/.test(entry) && /as="?image"?/.test(entry)
    )
    .map((entry) => /<([^>]+)>/.exec(entry)?.[1] ?? '');
  return [...fromHtml, ...fromHeader].filter(
    (href) => !href.includes('rate-logo')
  );
}

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
    expect(await productImagePreloads(res)).toEqual([]);
    // The page does render thumbnails, so the check above is not vacuous.
    expect(await res.text()).toMatch(/<img[^>]+loading="lazy"/);
  });
}

test('a product page preloads only its own hero image', async ({ request }) => {
  const res = await request.get('/smartphones/iphone-16-pro-max-256gb');
  expect(res.status()).toBe(200);
  const preloads = await productImagePreloads(res);
  // At most the hero (fetchPriority="high"); the seeded phone has no picture,
  // so here nothing at all.
  expect(preloads.length).toBeLessThanOrEqual(1);
  for (const href of preloads) expect(href).toContain('iphone-16-pro-max');
});
