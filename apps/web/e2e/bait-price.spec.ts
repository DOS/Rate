import { expect, test } from '@playwright/test';

// A listing below 40% of the lower median of the other stores is a bait
// price: it does not set the product's "from" price, and the offers table
// labels it and lists it after the plausible offers (DOS/Rate#797). The seed
// keeps it at 1,250,000: under 40% of 3,140,000 and above the 1,200,000
// accessory floor, which would otherwise answer first.
const PRODUCT = '/smartphones/e2e-bait-price-phone';

test('a bait-price listing does not set the lowest price', async ({ page }) => {
  expect((await page.goto(PRODUCT))?.status()).toBe(200);

  // Title and hero price read the stored min_price, which leaves the bait
  // listing out (3,030,000; DOS/Rate#802, #1141).
  await expect(page).toHaveTitle(/3\.030\.000/);
  await expect(page).not.toHaveTitle(/1\.250\.000/);
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
  expect(outsideTable).not.toContain('1.250.000');

  // The bait offer is labelled once and is not ranked first by price.
  const table = page.locator('#offers-table');
  await expect(table.getByTestId('offer-implausibly-low')).toHaveCount(1);
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).not.toContainText('1.250.000');
  // Its row carries no deal verdict next to the warning.
  const baitRow = table.locator('tbody tr', { hasText: '1.250.000' });
  await expect(baitRow).toHaveCount(1);
  await expect(baitRow).not.toContainText(/Đáy giá lịch sử|Giảm giá thật/);
});

const BAIT_URL =
  'https://www.lazada.vn/products/e2e-bait-price-phone-i7970797.html';

test('inspecting the bait listing warns instead of endorsing it', async ({
  page,
  request,
}) => {
  const res = await request.get(
    `/api/v1/rate/inspect?q=${encodeURIComponent(BAIT_URL)}`
  );
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: {
      matchedOffer: { price_current: number } | null;
      priceVerdict: { verdict: string; implausiblyLow?: boolean };
    };
  };
  expect(body.data.matchedOffer?.price_current).toBe(1250000);
  expect(body.data.priceVerdict.verdict).not.toBe('genuine_deal');
  expect(body.data.priceVerdict.implausiblyLow).toBe(true);

  // The offers table's "Inspect" link adds the listing's price.
  const withPrice = await request.get(
    `/api/v1/rate/inspect?q=${encodeURIComponent(BAIT_URL)}&price=1250000`
  );
  const withPriceBody = (await withPrice.json()) as typeof body;
  expect(withPriceBody.data.priceVerdict.implausiblyLow).toBe(true);

  expect(
    (await page.goto(`/inspect?q=${encodeURIComponent(BAIT_URL)}`))?.status()
  ).toBe(200);
  await expect(page.getByTestId('inspect-implausibly-low')).toBeVisible();
  // Its offers list labels the bait listing once and lists it last (#805).
  const baitBadge = page.getByTestId('inspect-offer-implausibly-low');
  await expect(baitBadge).toHaveCount(1);
  const offersTable = page.locator('table', { has: baitBadge });
  await expect(offersTable.locator('tbody tr').first()).not.toContainText(
    '1.250.000'
  );
  await expect(offersTable.locator('tbody tr').last()).toContainText(
    '1.250.000'
  );
  await expect(page.locator('main')).not.toContainText(
    'Giá niêm yết khớp với lịch sử giá thật.'
  );
});
