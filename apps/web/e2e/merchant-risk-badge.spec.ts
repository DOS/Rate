import { expect, test } from '@playwright/test';

// The merchant page used to show a red "scam risk" badge and "risk alert" for
// any DOSafe score above 0, so every store looked like a scam while the home
// cards called the same 4/100 "no scam detected" (DOS/Rate#1140).
const LOW = '/merchants/11111111-1111-4111-8111-111111111140';
const HIGH = '/merchants/11111111-1111-4111-8111-111111111160';

test('a 4/100 DOSafe store shows no scam warning', async ({ page }) => {
  expect((await page.goto(LOW))?.status()).toBe(200);
  const badge = page.getByTestId('merchant-scam-badge');
  await expect(badge).toHaveText('Rủi ro lừa đảo: 4/100');
  await expect(badge).toHaveAttribute('data-tone', 'good');
  await expect(badge).not.toHaveClass(/bg-danger/);
  const status = page.getByTestId('merchant-scam-status');
  await expect(status).not.toHaveText('Có cảnh báo rủi ro');
  await expect(status).toHaveClass(/text-success/);
  // No reviews analysed: no "100%" authentic ratio.
  const summary = page.getByTestId('merchant-review-summary');
  await expect(summary).toHaveText('Chưa có đánh giá để phân tích.');
  await expect(summary).not.toContainText('%');
});

test('a 60/100 DOSafe store shows the scam warning', async ({ page }) => {
  expect((await page.goto(HIGH))?.status()).toBe(200);
  const badge = page.getByTestId('merchant-scam-badge');
  await expect(badge).toHaveAttribute('data-tone', 'bad');
  await expect(badge).toHaveClass(/bg-danger/);
  const status = page.getByTestId('merchant-scam-status');
  await expect(status).toHaveText('Có cảnh báo rủi ro');
  await expect(status).toHaveClass(/text-danger/);
});

// A store with no DOSafe score (the column's default 0, no metadata score) is
// neither clean nor a scam warning: no number at all (DOS/Rate#1479).
const UNKNOWN = '/merchants/11111111-1111-4111-8111-111111111111';

test('a store with no DOSafe score shows no score and no tone', async ({
  page,
}) => {
  expect((await page.goto(UNKNOWN))?.status()).toBe(200);
  const badge = page.getByTestId('merchant-scam-badge');
  await expect(badge).toHaveText('Rủi ro lừa đảo: chưa đủ dữ liệu');
  await expect(badge).toHaveAttribute('data-tone', 'unknown');
  await expect(badge).not.toContainText('/100');
  const status = page.getByTestId('merchant-scam-status');
  await expect(status).toHaveText('Chưa có dữ liệu DOSafe');
  await expect(status).not.toHaveClass(/text-success/);
});
