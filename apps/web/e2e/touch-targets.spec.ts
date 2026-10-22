import { expect, type Locator, type Page, test } from '@playwright/test';

// On phones, small standalone controls answer taps across at least 44x44px
// (DOS/Rate#717).
const hitsAround = async (page: Page, target: Locator, reach = 21) => {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const handle = await target.elementHandle();
  return page.evaluate(
    ([points, el]) =>
      points.every(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return hit === el || (el as Element).contains(hit);
      }),
    [
      [
        [cx - reach, cy],
        [cx + reach, cy],
        [cx, cy - reach],
        [cx, cy + reach],
      ],
      handle,
    ] as const
  );
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

test('the menu toggle answers taps across 44x44px', async ({ page }) => {
  await page.goto('/faq');
  expect(await hitsAround(page, page.locator('.nav-toggle'))).toBe(true);
});

test('the compare remove button answers taps across 44x44px', async ({
  page,
}) => {
  await page.goto(
    '/compare?slugs=iphone-16-pro-max-256gb,samsung-galaxy-s25-ultra-256gb'
  );
  const remove = page
    .getByRole('button', { name: /^(Xóa|Remove) .*Galaxy S25 Ultra/ })
    .first();
  await remove.scrollIntoViewIfNeeded();
  const box = await remove.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // The visible circle stays 24px.
  const dot = await remove.locator('.rate-remove-dot').boundingBox();
  expect(Math.round(dot!.width)).toBe(24);

  // The compare tray's remove buttons too (the tray starts collapsed on a
  // phone, so expand it first).
  await page.evaluate(() =>
    window.localStorage.setItem(
      'rate_compare_tray_v1',
      JSON.stringify([
        {
          slug: 'iphone-16-pro-max-256gb',
          name: 'iPhone 16 Pro Max 256GB',
          brand: 'Apple',
          thumbnail: null,
          min_price: 28990000,
        },
      ])
    )
  );
  await page.goto('/deals');
  const toggle = page.locator(
    'button[aria-controls="rate-compare-tray-items"]'
  );
  await toggle.click();
  const trayRemove = page.locator('#rate-compare-tray-items button').first();
  const trayBox = await trayRemove.boundingBox();
  expect(trayBox!.width).toBeGreaterThanOrEqual(44);
  expect(trayBox!.height).toBeGreaterThanOrEqual(44);
});

test('footer links are at least 44px tall on a phone', async ({ page }) => {
  await page.goto('/faq');
  const links = page.locator('.footer-widget .footer-menu li a');
  expect(await links.count()).toBeGreaterThan(3);
  for (const box of await links.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height)
  )) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});
