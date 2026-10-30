import { expect, test } from '@playwright/test';

// The product hero's price line takes the plural form of its seller count
// and the locale's number format (DOS/Rate#1369, #1370). Czech has three
// forms (1, 2-4, 5+) and groups with a no-break space; English has two. The
// seeded stats: Galaxy 1 seller from 26,490,000; iPhone 2 sellers from
// 28,990,000; the bait-price phone 4 sellers from 3,030,000 (seed.sql).
const CASES = [
  {
    path: '/smartphones/samsung-galaxy-s25-ultra-256gb',
    cs: /^Od 26\s490\s000\s₫ · 1 prodejce$/,
    en: /^From 26\.490\.000\s₫ · 1 seller$/,
  },
  {
    path: '/smartphones/iphone-16-pro-max-256gb',
    cs: /^Od 28\s990\s000\s₫ · 2 prodejci$/,
    en: /^From 28\.990\.000\s₫ · 2 sellers$/,
  },
  {
    path: '/smartphones/e2e-bait-price-phone',
    cs: /^Od 3\s030\s000\s₫ · 4 prodejci$/,
    en: /^From 3\.030\.000\s₫ · 4 sellers$/,
  },
];

for (const locale of ['cs', 'en'] as const) {
  for (const { path, ...copy } of CASES) {
    test(`hero price line on ${path} reads in ${locale}`, async ({
      page,
      baseURL,
    }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const line = page.locator('.rate-pdv-price-line');
      await expect(line).toHaveCount(1);
      expect((await line.innerText()).trim()).toMatch(copy[locale]);
    });
  }
}
