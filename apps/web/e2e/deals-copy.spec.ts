import { expect, test } from '@playwright/test';

// /deals reads in plain words in every locale: no "radar", "audit" or
// "kèo thơm" labels, and sentence-case headings (DOS/Rate#659).
const TITLES = {
  vi: 'Deal đáng tiền nhất, đã lọc khuyến mãi ảo trên 10 sàn',
  en: 'Best-value deals with fake sales filtered out (10 stores)',
  cs: 'Nejvýhodnější nabídky bez falešných slev (10 obchodů)',
};

for (const [locale, title] of Object.entries(TITLES)) {
  test(`/deals copy is plain in ${locale}`, async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto('/deals'))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toContainText(title);
    // CSS uppercases some eyebrows, so compare in lower case.
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const jargon of ['radar', 'audit', 'kiểm định', 'kèo thơm']) {
      expect(text).not.toContain(jargon);
    }
  });
}
