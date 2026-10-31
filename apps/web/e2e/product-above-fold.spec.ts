import { expect, test } from '@playwright/test';

// On a phone the product name, the price line and the user score are in the
// first screen, not behind a full-screen photo (DOS/Rate#605). The score value
// itself, not only its label, must fit (DOS/Rate#630). So does the whole jump row to
// the sellers, history, specs and reviews (DOS/Rate#1517).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
]) {
  test(`product name, price and score are above the fold at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const res = await page.goto(PRODUCT);
    expect(res?.status()).toBe(200);
    for (const selector of [
      'h1',
      '.rate-pdv-price-line',
      '[data-testid="pdv-hero-score"]',
      '[data-testid="pdv-jump-nav"]',
    ]) {
      const el = page.locator(selector).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box && box.y + box.height, selector).toBeLessThanOrEqual(
        viewport.height
      );
    }
    await expect(page.getByTestId('pdv-hero-score')).toContainText(/\d\.\d/);
  });
}

test('the repeated hero score is hidden on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PRODUCT);
  await expect(page.getByTestId('pdv-user-score')).toBeVisible();
  await expect(page.getByTestId('pdv-hero-score')).toBeHidden();
});
