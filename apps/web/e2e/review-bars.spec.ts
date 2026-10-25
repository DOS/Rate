import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The review authenticity bar draws the percentages shown in its badges, so it
// is hidden from assistive tech instead of carrying a label no role supports
// (DOS/Rate#1071).
test('the review authenticity bar is decorative', async ({ page }) => {
  expect(
    (await page.goto('/smartphones/iphone-16-pro-max-256gb'))?.status()
  ).toBe(200);
  const bars = page.locator('.progress:has(.progress-bar.bg-success)');
  await expect(bars.first()).toBeAttached();
  for (const bar of await bars.all()) {
    if (await bar.getAttribute('aria-label')) {
      expect(await bar.getAttribute('role')).not.toBeNull();
    }
  }

  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withRules(['aria-prohibited-attr'])
    .analyze();
  expect([...results.violations, ...results.incomplete]).toEqual([]);
});
