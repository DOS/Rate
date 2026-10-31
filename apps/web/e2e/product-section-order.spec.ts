import { expect, test } from '@playwright/test';

// The product comes first: the page reads price box, specs, reviews, price
// history, then the sellers last, with a jump row to each (DOS/Rate#1469,
// #1530), and phones show the first three reviews until expanded.
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
// Six seeded reviews (seed.sql, DOS/Rate#566).
const MANY_REVIEWS = '/smartphones/e2e-review-labels-phone';
const ORDER = [
  'specs-section',
  'jreviews-section',
  'pdv-price-history',
  'offers-table',
];

test('specs come first, then reviews, price history and sellers', async ({
  page,
}) => {
  await page.goto(PRODUCT);
  const tops = await page.evaluate(
    (ids) =>
      ids.map(
        (id) => document.getElementById(id)?.getBoundingClientRect().top ?? null
      ),
    ORDER
  );
  expect(tops.every((top) => top !== null)).toBe(true);
  const sorted = [...(tops as number[])].sort((a, b) => a - b);
  expect(tops).toEqual(sorted);
});

test('the jump row links to every section on the page', async ({ page }) => {
  await page.goto(PRODUCT);
  const nav = page.getByTestId('pdv-jump-nav');
  await expect(nav.getByRole('link')).toHaveCount(4);
  const hrefs = await nav
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(ORDER.map((id) => `#${id}`));
  for (const id of ORDER) await expect(page.locator(`#${id}`)).toHaveCount(1);
});

test('phones show three reviews until the rest are asked for', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MANY_REVIEWS);
  const cards = page.locator('#jreviews-section .rate-phone-collapsible > *');
  await expect(cards).toHaveCount(6);
  await expect(cards.filter({ visible: true })).toHaveCount(3);
  const more = page.locator('#jreviews-section button[aria-expanded]');
  await expect(more).toHaveText(/3/);
  // A click before hydration does nothing; retry until it opens.
  await expect(async () => {
    if ((await more.getAttribute('aria-expanded')) !== 'true') {
      await more.click();
    }
    await expect(more).toHaveAttribute('aria-expanded', 'true', {
      timeout: 500,
    });
  }).toPass();
  await expect(cards.filter({ visible: true })).toHaveCount(6);
});

test('wider screens show every review', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(MANY_REVIEWS);
  const cards = page.locator('#jreviews-section .rate-phone-collapsible > *');
  await expect(cards.filter({ visible: true })).toHaveCount(6);
});
