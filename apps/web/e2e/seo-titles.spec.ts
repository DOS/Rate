import { expect, test } from '@playwright/test';

// Titles fit a search result (at most 65 characters) and no page declares
// hreflang alternates that all share one URL: every locale is served from the
// same address, chosen by cookie (DOS/Rate#765).
const ROUTES = [
  '/',
  '/smartphones/iphone-16-pro-max-256gb',
  '/merchants/11111111-1111-4111-8111-111111111112',
  '/compare',
  // Titles built from two product names (DOS/Rate#777).
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
  '/deals',
  '/about-us',
  '/faq',
  '/contact-us',
  '/privacy-policy',
];

for (const locale of ['vi', 'en', 'cs']) {
  for (const route of ROUTES) {
    test(`${route} title and alternates in ${locale}`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(route))?.status()).toBe(200);
      const title = await page.title();
      expect(title.length, title).toBeLessThanOrEqual(65);
      const hrefs = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) => links.map((l) => l.getAttribute('href')));
      expect(new Set(hrefs).size, hrefs.join(' ')).toBe(hrefs.length);
    });
  }
}
