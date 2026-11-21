import { expect, test } from '@playwright/test';

// Unknown static-asset paths with a dot are a plain 404, not a server error
// (DOS/Rate#732). Browsers and crawlers ask for several of them on their own.
const MISSING = [
  '/foo.png',
  '/nonexistent.png',
  '/a.b',
  '/ads.txt',
  '/manifest.json',
  '/site.webmanifest',
  '/browserconfig.xml',
  '/unknown/asset.js',
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
  await expect(page.locator('h1')).toHaveText('Không tìm thấy trang');
});

// Unknown pages get the static Vietnamese root 404 whatever the cookie
// (DOS/Rate#1373, #1463).
for (const locale of ['vi', 'en'] as const) {
  test(`an unknown page is the Vietnamese 404 with the ${locale} cookie`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/no-such-page'))?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('h1')).toHaveText('Không tìm thấy trang');
  });
}

// Dotted dynamic page routes (/merchants/:id, /compare/:versus, and
// /:category/:slug) pass through proxy.ts and render their target route (or its
// localized route-level not-found state when absent) with page CSP nonces
// instead of being rewritten to /vi/__not-found (DOS/Rate#1807).
const DOTTED_DYNAMIC_PAGES = [
  '/merchants/anker.vn',
  '/merchants/viettel.store',
  '/smartphones/nokia-8.1',
  '/compare/nokia-7.2-vs-nokia-8.1',
];

for (const path of DOTTED_DYNAMIC_PAGES) {
  test(`${path} routes through proxy with page CSP headers`, async ({
    request,
  }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
    expect(res.headers()['content-security-policy'], path).toBeUndefined();
    const reportOnly =
      res.headers()['content-security-policy-report-only'] ?? '';
    expect(reportOnly, path).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  });
}

test('unsorted dotted versus slug reaches VersusComparePage and 308s to canonical order', async ({
  request,
  baseURL,
}) => {
  const res = await request.get('/compare/nokia-8.1-vs-nokia-7.2', {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(308);
  const targets = new Set(
    res
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === 'location')
      .map(({ value }) => new URL(value, baseURL).pathname)
  );
  expect([...targets]).toEqual(['/compare/nokia-7.2-vs-nokia-8.1']);
  expect(res.headers()['content-security-policy']).toBeUndefined();
});

for (const [prefixedPath, cleanPath, locale, expectedH1, expectedTitle] of [
  [
    '/en/merchants/anker.vn',
    '/merchants/anker.vn',
    'en',
    'Page not found',
    'Merchant not found | Rate.vn',
  ],
  [
    '/cs/merchants/anker.vn',
    '/merchants/anker.vn',
    'cs',
    'Stránka nenalezena',
    'Obchod nenalezen | Rate.vn',
  ],
  [
    '/en/smartphones/nokia-8.1',
    '/smartphones/nokia-8.1',
    'en',
    'Page not found',
    'Product not found | Rate.vn',
  ],
  [
    '/cs/compare/nokia-7.2-vs-nokia-8.1',
    '/compare/nokia-7.2-vs-nokia-8.1',
    'cs',
    'Stránka nenalezena',
    'Stránka nenalezena | Rate.vn',
  ],
] as const) {
  test(`${prefixedPath} strips locale via proxy and renders localized route state`, async ({
    page,
    request,
    baseURL,
  }) => {
    const redirectRes = await request.get(prefixedPath, { maxRedirects: 0 });
    expect(redirectRes.status()).toBe(308);
    const targets = new Set(
      redirectRes
        .headersArray()
        .filter(({ name }) => name.toLowerCase() === 'location')
        .map(({ value }) => new URL(value, baseURL).pathname)
    );
    expect([...targets]).toEqual([cleanPath]);
    expect(redirectRes.headers()['set-cookie'] ?? '').toContain(
      `NEXT_LOCALE=${locale}`
    );
    expect(redirectRes.headers()['content-security-policy']).toBeUndefined();

    const pageRes = await page.goto(prefixedPath);
    expect(pageRes?.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe(cleanPath);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveText(expectedH1);
    await expect(page).toHaveTitle(expectedTitle);
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy"]')
    ).toHaveAttribute('content', /script-src 'self' 'unsafe-inline'/);
  });
}
