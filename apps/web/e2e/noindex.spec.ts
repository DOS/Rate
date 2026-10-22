import { expect, test, type Page } from '@playwright/test';

// API JSON, sign-in screens and /inspect result pages stay out of search
// results; content pages stay indexable (DOS/Rate#746).
const robotsMeta = (page: Page) =>
  page.locator('meta[name="robots"]').getAttribute('content');

test('API responses send X-Robots-Tag: noindex', async ({ request }) => {
  const res = await request.get('/api/v1/rate/stats');
  expect(res.headers()['x-robots-tag']).toBe('noindex');
});

for (const path of ['/login', '/register', '/inspect?q=iPhone%2016']) {
  test(`${path} is noindex`, async ({ page }) => {
    await page.goto(path);
    expect(await robotsMeta(page)).toContain('noindex');
  });
}

for (const path of ['/', '/inspect', '/smartphones/iphone-16-pro-max-256gb']) {
  test(`${path} stays indexable`, async ({ page }) => {
    await page.goto(path);
    expect(await page.locator('meta[name="robots"]').count()).toBe(0);
  });
}
