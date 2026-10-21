import { expect, test } from '@playwright/test';

// The review analyzer stores Vietnamese template texts (summary, default pro,
// review reasons); the product page shows them in the active locale
// (DOS/Rate#647). Seeded on the phone used by review-labels-locale.spec.ts.
const PRODUCT = '/smartphones/e2e-review-labels-phone';
const COPY = {
  vi: {
    summary: 'Đã phân tích 6 đánh giá: giữ lại 6 đánh giá thực chất',
    pro: 'Nhận phản hồi tích cực từ người dùng thực tế',
    reason: 'Đánh giá chi tiết, hợp lệ từ người dùng thực tế.',
  },
  en: {
    summary: 'Analyzed 6 reviews: kept 6 genuine reviews',
    pro: 'Positive feedback from real users',
    reason: 'Detailed, valid review from a real user.',
  },
  cs: {
    summary: 'Analyzováno 6 recenzí: ponecháno 6 skutečných recenzí',
    pro: 'Pozitivní zpětná vazba od skutečných uživatelů',
    reason: 'Podrobná, platná recenze od skutečného uživatele.',
  },
};

for (const [locale, copy] of Object.entries(COPY)) {
  test(`analyzer texts on the product page read in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const body = page.locator('body');
    await expect(body).toContainText(copy.summary);
    await expect(body).toContainText(copy.pro);
    await expect(body).toContainText(copy.reason);
    if (locale !== 'vi') {
      const text = await body.innerText();
      for (const vi of Object.values(COPY.vi)) expect(text).not.toContain(vi);
    }
  });
}
