import { expect, test } from '@playwright/test';

// Category pages and the watchlist read in plain words in every locale: no
// "radar", "audit", "kiểm toán", "kiểm định" or "seeding" (DOS/Rate#664).
const JARGON = ['radar', 'audit', 'kiểm toán', 'kiểm định', 'seeding'];

for (const locale of ['vi', 'en', 'cs']) {
  for (const route of ['/smartphones', '/earbuds', '/watchlist']) {
    test(`${route} copy is plain in ${locale}`, async ({ page, baseURL }) => {
      await page
        .context()
        .addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' },
        ]);
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1').first()).toBeVisible();
      // CSS uppercases some eyebrows, so compare in lower case.
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const jargon of JARGON) expect(text).not.toContain(jargon);
      // Tooltips are not in innerText; check title attributes too.
      const titles = (
        await page
          .locator('[title]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('title')))
      )
        .join(' ')
        .toLowerCase();
      for (const jargon of JARGON) expect(titles).not.toContain(jargon);
      expect((await page.title()).toLowerCase()).not.toMatch(
        /audit|kiểm định|radar/
      );
    });
  }
}
