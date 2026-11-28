import { expect, test } from '@playwright/test';

// The product page links the other published variants of its model where the
// quick-spec cards used to be, marks its own, and puts the specs before the
// reviews (DOS/Rate#1436).

test('variant links redirect to the Item picker and mark the selected size', async ({
  page,
}) => {
  await page.goto('/smartphones/e2e-variant-phone-256gb');
  await expect(page).toHaveURL(/\/smartphones\/e2e-variant-phone\?v=256gb$/);
  const picker = page.getByTestId('pdv-variant-picker');
  await expect(picker).toBeVisible();
  const chips = picker.locator('button[data-variant]');
  // The draft 512GB is no choice to offer.
  await expect(chips).toHaveCount(2);
  await expect(picker).not.toContainText('512GB');

  const current = picker.locator('[data-variant="256gb"]');
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect(current).toContainText('256GB');

  const other = picker.locator('button[data-variant="128gb"]');
  await expect(other).toContainText('128GB');
  await expect(other).toContainText('9.990.000');
  await expect(async () => {
    await other.click();
    await expect(other).toHaveAttribute('aria-pressed', 'true', {
      timeout: 500,
    });
  }).toPass({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/smartphones\/e2e-variant-phone\?v=128gb$/);
});

test('a model with no other variant has no variant area and no quick specs', async ({
  page,
}) => {
  // A brand:model:variant key whose model has no other published variant,
  // and a key of another shape that reads no siblings at all.
  for (const slug of ['e2e-solo-phone-128gb', 'iphone-16-pro-max-256gb']) {
    await page.goto(`/smartphones/${slug}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByTestId('pdv-variant-links')).toHaveCount(0);
    // A quick-spec card label that nothing else on the page uses.
    await expect(page.locator('main')).not.toContainText('Độ bền / Kháng nước');
  }
});

test('specs come before reviews', async ({ page }) => {
  await page.goto('/smartphones/iphone-16-pro-max-256gb');
  const order = await page.evaluate(() => {
    const specs = document.getElementById('specs-section');
    const reviews = document.getElementById('jreviews-section');
    if (!specs || !reviews) return null;
    return Boolean(
      specs.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(order).toBe(true);
});
