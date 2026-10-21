import { expect, test } from '@playwright/test';

// The home page headings are sentence case and the deal block says "price
// signals" instead of "radar" in every locale (DOS/Rate#666).
const HERO = {
  vi: 'Tra cứu giá thật và độ tin cậy gian hàng trước khi mua',
  en: 'Check real prices and seller trust before you buy',
  cs: 'Ověřte skutečnou cenu a důvěryhodnost prodejce před nákupem',
};

for (const [locale, hero] of Object.entries(HERO)) {
  test(`home page copy is plain in ${locale}`, async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/'))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveText(hero);
    // CSS uppercases some eyebrows, so compare in lower case.
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const jargon of ['radar', 'audit', 'kiểm định', 'kèo']) {
      expect(text).not.toContain(jargon);
    }
  });
}
