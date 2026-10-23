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
  // Long store and product names (DOS/Rate#782).
  '/merchants/ffffffff-ffff-4fff-8fff-ffffffff0782',
  '/smartphones/e2e-long-name-phone',
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
      // Long names lead their titles (DOS/Rate#782).
      if (route.endsWith('ffffffff0782')) {
        expect(title.startsWith('Cửa Hàng Ủy Quyền Chính Hãng'), title).toBe(
          true
        );
      }
      if (route.endsWith('e2e-long-name-phone')) {
        expect(title.startsWith('E2E Galaxy Z Fold7'), title).toBe(true);
      }
      // Compare titles keep both product names (DOS/Rate#777).
      if (route.startsWith('/compare/') || route.includes('slugs=')) {
        expect(title).toContain('iPhone 16 Pro Max 256GB');
        expect(title).toContain('Galaxy S25 Ultra 256GB');
      }
      const hrefs = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) => links.map((l) => l.getAttribute('href')));
      expect(new Set(hrefs).size, hrefs.join(' ')).toBe(hrefs.length);
    });
  }
}
