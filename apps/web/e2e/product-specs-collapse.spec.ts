import { expect, test } from '@playwright/test';

// On phones the spec section shows three groups until expanded, so price
// history and sellers are not buried under ten stacked cards (DOS/Rate#621).
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';

test('phone shows three spec groups and expands to all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  const groups = page.locator('#specs-section .rate-phone-collapsible > *');
  const total = await groups.count();
  expect(total).toBeGreaterThan(3);
  await expect(groups.nth(2)).toBeVisible();
  await expect(groups.nth(3)).toBeHidden();

  const section = page.locator('#specs-section');
  const collapsedHeight = (await section.boundingBox())?.height ?? 0;
  const toggle = page.locator('#specs-section button[aria-expanded]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // A click before hydration does nothing; retry until it opens.
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
      timeout: 500,
    });
  }).toPass();
  await expect(groups.nth(total - 1)).toBeVisible();
  // Collapsed, the section is far shorter than the full ten-group stack.
  const expandedHeight = (await section.boundingBox())?.height ?? 0;
  expect(expandedHeight - collapsedHeight).toBeGreaterThan(1500);
});

test('desktop shows every spec group and no toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PRODUCT);
  const groups = page.locator('#specs-section .rate-phone-collapsible > *');
  await expect(groups.last()).toBeVisible();
  await expect(
    page.locator('#specs-section button[aria-expanded]')
  ).toBeHidden();
});
