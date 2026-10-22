import { expect, test } from '@playwright/test';

// The rating confidence tier and the deal radar note follow the active locale
// instead of the Vietnamese strings rate-api and deals.ts build
// (DOS/Rate#574). The seeded iPhone is cheapest on Shopee, below the median of
// its two offers, so it carries a genuine-deal note.
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const COPY = {
  vi: {
    radar:
      /^Rẻ hơn trung vị 10 sàn 1\.500\.000 ₫ \(-4\.9%\) tại Apple Flagship Store \(SHOPEE\)\.$/,
    tier: /^(Độ tin cậy|Ít mẫu kiểm chứng|Chưa đủ mẫu kiểm chứng)/,
  },
  en: {
    radar:
      /^1\.500\.000 ₫ below the 10-platform median \(-4\.9%\) at Apple Flagship Store \(SHOPEE\)\.$/,
    tier: /^(High|Medium|Low) confidence|^Few verified samples|^Not enough verified samples/,
  },
  cs: {
    radar:
      /^O 1\.500\.000 ₫ levnější než medián 10 platforem \(-4\.9 %\) u Apple Flagship Store \(SHOPEE\)\.$/,
    tier: /důvěryhodnost|^Málo ověřených vzorků|^Nedostatek ověřených vzorků/,
  },
};

for (const [locale, copy] of Object.entries(COPY)) {
  test(`rating tier and radar note on the product page read in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByTestId('pdv-radar-signal')).toHaveText(copy.radar);
    await expect(
      page.getByTestId('pdv-bayesian-confidence').locator('.rate-pdv-tag')
    ).toHaveText(copy.tier);
    if (locale !== 'vi') {
      const text = await page.locator('body').innerText();
      for (const vi of ['Rẻ hơn trung vị', 'Độ tin cậy', 'Ít mẫu kiểm chứng'])
        expect(text).not.toContain(vi);
    }
  });
}
