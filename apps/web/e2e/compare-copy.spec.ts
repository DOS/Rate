import { expect, test } from '@playwright/test';

// The compare page reads in plain words in every locale: no "radar", "kèo"
// or "Same-Category Lock" (DOS/Rate#668).
const JARGON = ['radar', 'kèo', 'same-category lock', 'audit'];

for (const locale of ['vi', 'en', 'cs']) {
  test(`/compare copy is plain in ${locale}`, async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect(
      (
        await page.goto(
          '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb'
        )
      )?.status()
    ).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1').first()).toBeVisible();
    // CSS uppercases some eyebrows, so compare in lower case.
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const jargon of JARGON) expect(text).not.toContain(jargon);
    expect((await page.title()).toLowerCase()).not.toMatch(/radar|kèo/);
  });
}
