import { expect, test } from '@playwright/test';

// Vietnamese marketplace text (review comments, listing titles) is marked
// lang="vi" outside the vi locale and left unmarked on vi pages
// (DOS/Rate#699).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const COMMENT = 'Máy dùng rất mượt, pin trâu suốt cả ngày';
const VI_TITLE = 'iPhone 16 Pro Max 256GB chính hãng';
const PLAIN_TITLE = 'iPhone 16 Pro Max 256GB VN/A';

for (const locale of ['en', 'cs', 'vi']) {
  test(`marketplace text language is marked in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);

    const comment = page.locator('p', { hasText: COMMENT });
    const viTitle = page.locator('td', { hasText: VI_TITLE }).first();
    const plainTitle = page.locator('td', { hasText: PLAIN_TITLE }).first();
    await expect(comment).toHaveCount(1);
    await expect(viTitle).toHaveCount(1);

    if (locale === 'vi') {
      await expect(comment).not.toHaveAttribute('lang', /./);
      await expect(viTitle).not.toHaveAttribute('lang', /./);
    } else {
      await expect(comment).toHaveAttribute('lang', 'vi');
      await expect(viTitle).toHaveAttribute('lang', 'vi');
    }
    // A title without Vietnamese letters keeps the page language.
    await expect(plainTitle).not.toHaveAttribute('lang', /./);
  });
}
