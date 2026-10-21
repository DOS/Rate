import { expect, test } from '@playwright/test';

// The review disclosure badge and the star-distribution warning follow the
// active locale instead of the Vietnamese strings rate-api builds
// (DOS/Rate#566). The seeded phone has six 5-star reviews, five of them
// star-only and one sponsored. Its review weight badges and the score blend
// note are localized the same way (DOS/Rate#574).
const PRODUCT = '/smartphones/e2e-review-labels-phone';
const LABELS = {
  vi: {
    badge: 'Quảng cáo',
    weight: 'nhãn mặc định theo số sao của sàn',
    blendNote:
      'Tỷ trọng: 100% người mua thực chất (đã lọc đánh giá ảo và spam nhận xu)',
    warning:
      'Cảnh báo phân bố sao bất thường: 100% đánh giá là 5 sao tuyệt đối (83% chỉ chấm sao hoặc thiếu chi tiết trải nghiệm)',
  },
  en: {
    badge: 'Advertising',
    weight: 'the platform default label for the star rating',
    blendNote:
      'Weighting: 100% verified buyers (fake reviews and coin spam filtered out)',
    warning:
      'Unusual star distribution: 100% of reviews are a perfect 5 stars (83% are star-only or lack details about the experience)',
  },
  cs: {
    badge: 'Reklama',
    weight: 'výchozí štítek platformy podle počtu hvězdiček',
    blendNote:
      'Váhy: 100 % ověření kupující (falešné recenze a spam za odměny odfiltrovány)',
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
    await expect(
      page
        .getByTestId('review-6axis-breakdown')
        .filter({ hasText: labels.weight })
    ).not.toHaveCount(0);
    // The rating weight badge carries only its number; the 6-axis model's own
    // estimate sits in a separate labelled badge (DOS/Rate#596).
    const ratingWeight = page.getByTestId('review-rating-weight');
    await expect(ratingWeight).toHaveCount(6);
    await expect(ratingWeight.first()).toHaveText(
      /^(Trọng số|Weight|Váha): \d\.\d\dx$/
    );
    // The seeded phone has buyer reviews only, so the note is the user-only one.
    await expect(
      page.getByText(labels.blendNote, { exact: true })
    ).toBeVisible();
    // Plain words in the review section's own labels: no ranking jargon.
    const reviewsText = (
      await page.locator('#jreviews-section').innerText()
    ).toLowerCase();
    for (const jargon of ['wilson', 'audit', 'seeding /', '/ seeding']) {
      expect(reviewsText).not.toContain(jargon);
    }
    if (locale !== 'vi') {
      const text = await page.locator('body').innerText();
      expect(text).not.toContain(LABELS.vi.warning);
      expect(text).not.toContain('Cảnh báo phân bố sao');
      expect(text).not.toContain(LABELS.vi.badge);
      for (const vi of [
        'Trọng số',
        'Tỷ trọng:',
        'Chưa đủ dữ liệu đánh giá',
        'Hiển thị riêng điểm',
      ])
        expect(text).not.toContain(vi);
    }
  });
}
