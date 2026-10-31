import { expect, test } from '@playwright/test';

// The ranked deals list shows 12 at a time instead of the whole catalogue in
// one very long column (DOS/Rate#633).
test('deals load 12 at a time and filters restart paging', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/deals');
  const cards = page.locator('#rate-ranked-deals > div');
  await expect(cards).toHaveCount(12);
  const more = page.locator('button[aria-controls="rate-ranked-deals"]');
  await expect(more).toBeVisible();

  // A click before hydration does nothing; retry until the next page shows.
  await expect(async () => {
    if ((await cards.count()) === 12) await more.click();
    await expect(cards).toHaveCount(24, { timeout: 500 });
  }).toPass();

  // Keyboard focus moves to the first newly shown card.
  await expect(cards.nth(12).locator('a[href]').first()).toBeFocused();

  // Any filter change starts again from the first page: the budget...
  const budget = page.locator('input[type="range"]').first();
  await budget.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(cards).toHaveCount(12);

  // ...or a search.
  await expect(async () => {
    if ((await cards.count()) === 12) await more.click();
    await expect(cards).toHaveCount(24, { timeout: 500 });
  }).toPass();
  await page.locator('input[type="search"]').first().fill('a');
  await expect(cards).toHaveCount(12);

  // Going back to the earlier search starts at the first page again.
  await page.locator('input[type="search"]').first().fill('');
  await expect(cards).toHaveCount(12);
});
