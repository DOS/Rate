import { expect, test } from '@playwright/test';

// A listing whose stored images start with "[object Object]" (as some crawled
// TGDD rows do) shows its first real image, and the page never requests the
// junk entry as a URL (DOS/Rate#810).
const PROFILE = '/merchants/ffffffff-ffff-4fff-8fff-ffffffff0769';

test('a listing thumbnail skips stored entries that are not URLs', async ({
  page,
}) => {
  const junk: string[] = [];
  page.on('request', (req) => {
    if (/object(%20|\s)Object/i.test(req.url())) junk.push(req.url());
  });
  expect((await page.goto(PROFILE))?.status()).toBe(200);
  const thumb = page.locator('img[alt="E2E Bud 001 chính hãng"]');
  await expect(thumb).toHaveAttribute(
    'src',
    '/img/devices/apple-airpods-pro-3-usb-c.jpg'
  );
  await page.waitForLoadState('networkidle');
  expect(junk).toEqual([]);
});
