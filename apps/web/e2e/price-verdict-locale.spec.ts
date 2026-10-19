import { expect, test } from '@playwright/test';

// Price verdicts follow the active locale instead of the Vietnamese strings
// rate-api builds (DOS/Rate#559). The API payload still carries those strings,
// so this checks the visible text, not the raw HTML.
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const VI_VERDICT_TEXT = [
  'Cảnh báo Giảm giá ảo',
  'Nghi nâng giá gốc',
  'Giảm giá thật',
  'Đáy giá lịch sử',
  'Giá ổn định',
  'trung vị lịch sử',
];
const LABELS = {
  en: [
    'Fake discount alert',
    'Suspected inflated list price',
    'Real discount',
    'Historic low',
    'Stable price',
  ],
  cs: [
    'Varování: falešná sleva',
    'Podezření na navýšenou původní cenu',
    'Skutečná sleva',
    'Historické minimum',
    'Stabilní cena',
  ],
};

for (const [locale, labels] of Object.entries(LABELS)) {
  test(`price verdicts on the product page read in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    await page.goto(PRODUCT);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const text = await page.locator('body').innerText();
    for (const vi of VI_VERDICT_TEXT) expect(text).not.toContain(vi);
    expect(labels.some((label) => text.includes(label))).toBe(true);
  });
}
