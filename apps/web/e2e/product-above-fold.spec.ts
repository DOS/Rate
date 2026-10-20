import { expect, test } from '@playwright/test';

// On a phone the product name, the price line and the user score are in the
// first screen, not behind a full-screen photo (DOS/Rate#605).
test('product name, price and score are above the fold on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await page.goto('/smartphones/iphone-16-pro-max-256gb');
  expect(res?.status()).toBe(200);
  for (const selector of [
    'h1',
    '.rate-pdv-price-line',
    '.rate-pdv-score-label.is-user',
  ]) {
    const el = page.locator(selector).first();
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box && box.y + box.height, selector).toBeLessThanOrEqual(844);
  }
});
