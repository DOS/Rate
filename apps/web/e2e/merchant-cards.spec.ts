import { expect, test } from '@playwright/test';

// Merchant directory cards are compact on phones and speak plainly
// (DOS/Rate#635).
test('merchant cards stay compact on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/merchants');
  const card = page
    .locator('[data-testid="merchant-deal-radar-badge"]')
    .first();
  await expect(card).toBeVisible();
  const heights = await page
    .locator('.rate-card:has([data-testid="merchant-deal-radar-badge"])')
    .evaluateAll((els) =>
      els.slice(0, 6).map((el) => el.getBoundingClientRect().height)
    );
  expect(heights.length).toBeGreaterThan(0);
  // Before #635 these cards were 640-710px tall at this width.
  for (const h of heights) expect(h).toBeLessThan(600);
});

for (const [path, lang] of [
  ['/merchants', 'vi'],
  ['/en/merchants', 'en'],
  ['/cs/merchants', 'cs'],
] as const) {
  test(`merchant directory copy is plain on ${lang}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(
      page.locator('[data-testid="merchant-deal-radar-badge"]').first()
    ).toBeVisible();
    const text = (
      await page
        .locator('.hero-banner, section:not(.rate-footer-cta)')
        .allInnerTexts()
    )
      .join('\n')
      .toLowerCase();
    for (const term of [
      'dosafe threat risk',
      'ai review risk',
      'dual risk',
      'jreviews',
      'kiểm toán',
      'audit profile',
      'seeding',
      'đánh giá ảo (≤',
      'fake reviews (≤',
      'dosafe.threat_intel',
    ]) {
      expect(text).not.toContain(term);
      expect((await page.title()).toLowerCase()).not.toContain(term);
    }
  });
}
