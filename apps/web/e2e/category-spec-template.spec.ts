import { expect, test } from '@playwright/test';

// Each category shows its own spec template: an earbud stored with
// phone-shaped specs shows no screen, RAM, ROM or camera, and a watch never
// shows 5G (DOS/Rate#1142). The seeded bud carries every one of those values.
const BUD = '/earbuds/e2e-bud-002';

test('earbud page shows audio specs and no phone fields', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BUD);
  const specs = page.locator('#specs-section');
  const headings = specs.locator('h3');
  await expect(headings.first()).toHaveText(/^1\. Âm thanh/);
  // Groups with no value are hidden (DOS/Rate#1186) and no sale status is
  // invented (DOS/Rate#1193): the seeded bud has audio, battery and
  // Bluetooth, nothing else.
  await expect(headings).toHaveCount(3);
  await expect(headings.nth(1)).toHaveText(/^2\. Pin/);
  await expect(specs).toContainText('E2E 10.5mm driver');
  await expect(specs).toContainText('E2E ANC');
  for (const text of [
    'Màn hình',
    'Bộ nhớ RAM',
    'Bộ nhớ trong',
    'Camera',
    '60 Hz',
    '300 ppi',
    'E2E Mic Array',
    'E2E Audio Engine',
    '5G',
    'Phần cứng',
    'Pháp lý',
    'Đang kinh doanh',
  ]) {
    await expect(specs).not.toContainText(text);
  }
  const main = page.locator('main');
  await expect(main).not.toContainText('1GB');
  await expect(main).not.toContainText('64GB');
  await expect(main).not.toContainText('1 inch');
  await expect(main).not.toContainText('E2E Mic Array');
});

test('earbud card carries no RAM or storage chip', async ({ page }) => {
  await page.goto('/earbuds?q=E2E%20Bud%20002');
  const card = page
    .locator('a[href="/earbuds/e2e-bud-002"]')
    .first()
    .locator('xpath=ancestor::article[1]');
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('GB');
  await expect(card).not.toContainText('5G');
});

test('a watch page never shows 5G', async ({ page }) => {
  // The seeded watch is stored with a 5G flag; read through the smartwatch
  // template, the flag and the 5G group label are gone while the rest of the
  // page still renders. (A phone under /smartwatches 308s to its own
  // category since DOS/Rate#1366.)
  await page.goto('/smartwatches/apple-watch-e2e-cellular');
  const meta = page.locator('.rate-pdv-meta');
  await expect(meta).toContainText('Apple');
  await expect(meta).not.toContainText('5G');
  const specs = page.locator('#specs-section');
  await expect(specs).toContainText('Màn hình');
  // One language per page (DOS/Rate#1529).
  await expect(specs).not.toContainText('(Display)');
  // The seeded watch has no network value left once 5G is dropped, so the
  // cellular group is hidden (DOS/Rate#1186); the 4G-only bands label is
  // covered by product-spec-rows.test.ts.
  await expect(specs).not.toContainText('Mạng Di động');
  await expect(specs).not.toContainText('5G');
  await expect(specs).not.toContainText('Camera');
});
