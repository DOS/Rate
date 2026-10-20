import { expect, test } from '@playwright/test';

// The review disclosure badge and the star-distribution warning follow the
// active locale instead of the Vietnamese strings rate-api builds
// (DOS/Rate#566). The seeded phone has six 5-star reviews, five of them
// star-only and one sponsored.
const PRODUCT = '/smartphones/e2e-review-labels-phone';
const LABELS = {
  vi: {
    badge: 'Quảng cáo',
    warning:
      'Cảnh báo phân bố sao bất thường: 100% đánh giá là 5 sao tuyệt đối (83% chỉ chấm sao hoặc thiếu chi tiết trải nghiệm)',
  },
  en: {
    badge: 'Advertising',
    warning:
      'Unusual star distribution: 100% of reviews are a perfect 5 stars (83% are star-only or lack details about the experience)',
  },
  cs: {
    badge: 'Reklama',
    warning:
      'Neobvyklé rozložení hvězdiček: 100 % recenzí má plných 5 hvězdiček (83 % jen s hvězdičkami nebo bez podrobností o zkušenosti)',
  },
};

for (const [locale, labels] of Object.entries(LABELS)) {
  test(`review labels on the product page read in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByTestId('star-distribution-anomaly-alert')
    ).toHaveText(labels.warning);
    await expect(
      page.locator('.badge', { hasText: labels.badge }).first()
    ).toBeVisible();
    if (locale !== 'vi') {
      const text = await page.locator('body').innerText();
      expect(text).not.toContain(LABELS.vi.warning);
      expect(text).not.toContain('Cảnh báo phân bố sao');
      expect(text).not.toContain(LABELS.vi.badge);
    }
  });
}
