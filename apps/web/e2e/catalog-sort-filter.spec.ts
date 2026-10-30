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
  // Keyboard: ArrowDown opens on the first item, arrows move, Tab out closes.
  await toggle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toHaveClass(/\bshow\b/);
  await expect(menu.locator('.dropdown-item').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('.dropdown-item').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
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
  // Space opens it as on a button.
  await trigger.focus();
  await page.keyboard.press(' ');
  await expect(drawer).toHaveClass(/\bshow\b/);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/\bshow\b/);
  // While open it is a modal dialog and Tab stays inside it.
  await trigger.click();
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await expect(drawer).toHaveAttribute('aria-labelledby', 'filterSliderTitle');
  const pageInert = () =>
    page.evaluate(
      () => !!document.querySelector('#shortfilter')?.closest('[inert]')
    );
  expect(await pageInert(), 'the page behind the drawer is inert').toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.getElementById('filterSlider')?.contains(document.activeElement)
    )
  ).toBe(true);
  // Widening past 992px closes the drawer, so it does not come back later.
  await page.setViewportSize({ width: 1200, height: 844 });
  await expect(drawer).not.toHaveClass(/\bshow\b/);
  expect(await pageInert(), 'closing lifts inert').toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
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
