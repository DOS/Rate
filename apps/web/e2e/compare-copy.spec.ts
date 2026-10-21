import { expect, test } from '@playwright/test';

// The compare and versus pages read in plain words in every locale: no
// "radar", "kèo" or "Same-Category Lock" (DOS/Rate#668).
const JARGON = ['radar', 'kèo', 'same-category lock', 'audit'];
const PAGES = [
  {
    path: '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb',
    radarRow: 'compare-radar-row',
  },
  {
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
    radarRow: 'versus-radar-row',
  },
];

for (const locale of ['vi', 'en', 'cs']) {
  for (const { path, radarRow } of PAGES) {
    test(`${path.split('?')[0]} copy is plain in ${locale}`, async ({
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
      // The price signal row is rendered, so the check below covers it.
      await expect(page.getByTestId(radarRow)).toBeVisible();
      // CSS uppercases some eyebrows, so compare in lower case.
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const jargon of JARGON) expect(text).not.toContain(jargon);
      expect((await page.title()).toLowerCase()).not.toMatch(/radar|kèo/);
    });
  }
}
