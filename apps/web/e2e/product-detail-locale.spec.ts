import { expect, test } from '@playwright/test';

// The rating confidence tier and the deal radar note follow the active locale
// instead of the Vietnamese strings rate-api and deals.ts build
// (DOS/Rate#574). The seeded iPhone is cheapest on Shopee, below the median of
// its two offers, so it carries a genuine-deal note that names that count
// instead of a fixed "10 platforms" (DOS/Rate#1145).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const COPY = {
  vi: {
    radar:
      /^Rẻ hơn giá trung vị của 2 tin bán 1\.500\.000 ₫ \(-4\.9%\) tại Apple Flagship Store \(SHOPEE\)\.$/,
    tier: /^(Độ tin cậy|Ít mẫu kiểm chứng|Chưa đủ mẫu kiểm chứng)/,
  },
  en: {
    radar:
      /^1\.500\.000 ₫ below the median of 2 listings \(-4\.9%\) at Apple Flagship Store \(SHOPEE\)\.$/,
    tier: /^(High|Medium|Low) confidence|^Few verified samples|^Not enough verified samples/,
  },
  cs: {
    radar:
      // Czech numbers group with a no-break space and use a decimal comma (#1369).
      /^O 1\s500\s000\s₫ levnější než medián cen 2 nabídek \(-4,9\s%\) u Apple Flagship Store \(SHOPEE\)\.$/,
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
      for (const vi of [
        'Rẻ hơn giá trung vị',
        'Độ tin cậy',
        'Ít mẫu kiểm chứng',
      ])
        expect(text).not.toContain(vi);
    }
  });
}
