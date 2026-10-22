import { expect, test } from '@playwright/test';

// The back-to-top control is a labelled button in the page language and
// leaves the URL alone (DOS/Rate#740).
for (const [locale, label] of [
  ['vi', 'Lên đầu trang'],
  ['en', 'Back to top'],
] as const) {
  test(`back to top is a labelled button in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    await page.goto('/faq');
    const button = page.getByRole('button', { name: label });
    await expect(button).toBeHidden();
    await page.mouse.wheel(0, 1500);
    await expect(button).toBeVisible();
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(new URL(page.url()).hash).toBe('');
  });
}
