import { expect, test } from '@playwright/test';

// A listing at a quarter of what every other store asks is a bait price: it
// does not set the product's "from" price, and the offers table labels it
// and lists it after the plausible offers (DOS/Rate#797).
const PRODUCT = '/smartphones/e2e-bait-price-phone';

test('a bait-price listing does not set the lowest price', async ({ page }) => {
  expect((await page.goto(PRODUCT))?.status()).toBe(200);

  // Title and hero price take the cheapest plausible offer (3,030,000).
  await expect(page).toHaveTitle(/3\.030\.000/);
  await expect(page).not.toHaveTitle(/750\.000/);
  await expect(page.locator('.rate-pdv-price-line')).toContainText('3.030.000');

  // JSON-LD lowPrice follows it.
  const ld = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent();
  expect(ld).toContain('"lowPrice":3030000');

  // Outside the offers table the bait price appears nowhere: not as the
  // all-time low, the price history's current best, nor the radar floor.
  const outsideTable = await page.evaluate(() => {
    const clone = document
      .querySelector('main')!
      .cloneNode(true) as HTMLElement;
    clone.querySelector('#offers-table')?.remove();
    return clone.innerText;
  });
  expect(outsideTable).not.toContain('750.000');

  // The bait offer is labelled once and is not ranked first by price.
  const table = page.locator('#offers-table');
  await expect(table.getByTestId('offer-implausibly-low')).toHaveCount(1);
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).not.toContainText('750.000');
  // Its row carries no deal verdict next to the warning.
  const baitRow = table.locator('tbody tr', { hasText: '750.000' });
  await expect(baitRow).toHaveCount(1);
  await expect(baitRow).not.toContainText(/Đáy giá lịch sử|Giảm giá thật/);
});
