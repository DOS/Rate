import { expect, test } from '@playwright/test';

// Bootstrap's JavaScript loads only on the category catalog, which uses its
// sort dropdown and filter drawer; other pages skip it (DOS/Rate#754).
const bootstrapLoaded = () =>
  typeof (window as Window & { bootstrap?: unknown }).bootstrap !== 'undefined';

test('the catalog sort dropdown opens', async ({ page }) => {
  await page.goto('/smartphones');
  await expect.poll(() => page.evaluate(bootstrapLoaded)).toBe(true);
  await page.locator('#shortfilter').click();
  await expect(page.locator('.dropdown-menu').first()).toHaveClass(/\bshow\b/);
});

test('the catalog filter drawer opens on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/smartphones');
  await expect.poll(() => page.evaluate(bootstrapLoaded)).toBe(true);
  await page.locator('a.filterButtons').click();
  await expect(page.locator('#filterSlider')).toHaveClass(/\bshow\b/);
});

for (const path of ['/faq', '/smartphones/iphone-16-pro-max-256gb']) {
  test(`${path} does not load Bootstrap JS`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(bootstrapLoaded)).toBe(false);
  });
}
