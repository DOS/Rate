import { expect, test } from '@playwright/test';

// The catalogue's sort dropdown and filter drawer run on React state; no page
// loads Bootstrap's JavaScript (DOS/Rate#1331, before that #754).
const bootstrapLoaded = () =>
  typeof (window as Window & { bootstrap?: unknown }).bootstrap !== 'undefined';

test('the catalog sort dropdown opens and closes', async ({ page }) => {
  await page.goto('/smartphones');
  const toggle = page.locator('#shortfilter');
  const menu = page.locator('.dropdown-menu').first();
  await toggle.click();
  await expect(menu).toHaveClass(/\bshow\b/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('.dropdown-item').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/\bshow\b/);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator('h1').first().click();
  await expect(menu).not.toHaveClass(/\bshow\b/);
});

test('the catalog filter drawer opens and closes on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/smartphones');
  const trigger = page.locator('a.filterButtons');
  const drawer = page.locator('#filterSlider');
  await trigger.click();
  await expect(drawer).toHaveClass(/\bshow\b/);
  await expect(drawer).toBeVisible();
  await page.locator('#filterSlider .btn-close').click();
  await expect(drawer).not.toHaveClass(/\bshow\b/);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/\bshow\b/);
});

for (const path of [
  '/smartphones',
  '/faq',
  '/smartphones/iphone-16-pro-max-256gb',
]) {
  test(`${path} does not load Bootstrap JS`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(bootstrapLoaded)).toBe(false);
  });
}
