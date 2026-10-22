import { expect, test } from '@playwright/test';

// Catalog filters and the product score panel carry no English or internal
// suffixes: no "All" in Vietnamese, no "(Category)", "(Value)" or "Bayesian"
// (DOS/Rate#718).
const ROUTES = ['/smartphones', '/smartphones/iphone-16-pro-max-256gb'];

for (const locale of ['vi', 'en', 'cs']) {
  for (const route of ROUTES) {
    test(`${route} labels are plain in ${locale}`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/bayesian|\(category\)|\(value\)/i);
      if (locale === 'vi' && route === '/smartphones') {
        await expect(page.locator('label[for="rating-all"]')).toHaveText(
          'Tất cả'
        );
      }
    });
  }
}
