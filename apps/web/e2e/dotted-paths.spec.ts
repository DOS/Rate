import { expect, test } from '@playwright/test';

// Unknown single-segment paths with a dot are a plain 404, not a server error
// (DOS/Rate#732). Browsers and crawlers ask for several of them on their own.
const MISSING = [
  '/foo.png',
  '/a.b',
  '/ads.txt',
  '/manifest.json',
  '/site.webmanifest',
  '/browserconfig.xml',
];

for (const path of MISSING) {
  test(`${path} is a 404`, async ({ request }) => {
    expect((await request.get(path)).status()).toBe(404);
  });
}

test('real root files still load', async ({ request }) => {
  for (const path of ['/favicon.ico', '/icon.png', '/robots.txt']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('iOS gets the touch icon at its default paths', async ({ request }) => {
  for (const path of [
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toBe('image/png');
  }
});

test('a missing dotted path shows the not-found page', async ({ page }) => {
  expect((await page.goto('/foo.png'))?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('404');
});

// The cookie still picks the locale of an ordinary 404.
for (const [locale, title] of [
  ['vi', 'Không tìm thấy trang'],
  ['en', 'Page not found'],
] as const) {
  test(`an unknown page is a localized 404 in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/no-such-page'))?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveText(title);
  });
}
