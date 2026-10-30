import { expect, test } from '@playwright/test';

// The product page links the other published variants of its model where the
// quick-spec cards used to be, marks its own, and puts the specs before the
// reviews (DOS/Rate#1436).

test('variant links resolve and mark the current variant', async ({ page }) => {
  await page.goto('/smartphones/e2e-variant-phone-256gb');
  const links = page.getByTestId('pdv-variant-links');
  await expect(links).toBeVisible();
  const current = links.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute(
    'data-variant-slug',
    'e2e-variant-phone-256gb'
  );
  await expect(current).toContainText('256GB');
  // The draft 512GB is no choice to offer.
  await expect(links.locator('[data-variant-slug]')).toHaveCount(2);
  await expect(links).not.toContainText('512GB');

  const other = links.locator('a[data-variant-slug="e2e-variant-phone-128gb"]');
  await expect(other).toContainText('128GB');
  await expect(other).toContainText('9.990.000');
  await other.click();
  await expect(page).toHaveURL(/\/smartphones\/e2e-variant-phone-128gb$/);
  await expect(
    page.getByTestId('pdv-variant-links').locator('[aria-current="page"]')
  ).toHaveAttribute('data-variant-slug', 'e2e-variant-phone-128gb');
});

test('a model with no other variant has no variant area and no quick specs', async ({
  page,
}) => {
  await page.goto('/smartphones/iphone-16-pro-max-256gb');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('pdv-variant-links')).toHaveCount(0);
  // The quick-spec card labels are gone from the top area.
  await expect(page.locator('main')).not.toContainText('Vi xử lý (Chipset)');
  await expect(page.locator('main')).not.toContainText('Độ bền / Kháng nước');
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
