import path from 'node:path';
import { expect, test } from '@playwright/test';

// Light and dark screenshots of the main pages for review (DOS/Rate#1435).
// CI uploads them as the `theme-screenshots` artifact; they assert nothing
// beyond the page loading in the theme asked for.
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/smartphones' },
  { name: 'product', path: '/smartphones/iphone-16-pro-max-256gb' },
  {
    name: 'compare',
    path: '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
  },
  {
    name: 'versus',
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
  },
  { name: 'merchant', path: '/merchants/11111111-1111-4111-8111-111111111111' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'deals', path: '/deals' },
  { name: 'developers', path: '/developers' },
  { name: 'not-found', path: '/theme-unknown-page', status: 404 },
  // Phone width: the product page's section order (DOS/Rate#1469).
  {
    name: 'product-phone',
    path: '/smartphones/iphone-16-pro-max-256gb',
    width: 390,
  },
];

for (const theme of ['light', 'dark'] as const) {
  for (const { name, path: url, status = 200, width = 1280 } of PAGES) {
    test(`screenshot ${name} (${theme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      expect((await page.goto(url))?.status()).toBe(status);
      await expect(page.locator('html')).toHaveAttribute(
        'data-bs-theme',
        theme
      );
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: path.join(
          testInfo.project.outputDir,
          'theme-screenshots',
          `${name}-${theme}.png`
        ),
        fullPage: true,
      });
    });
  }
}
