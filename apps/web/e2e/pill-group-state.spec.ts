import { expect, test, type Page } from '@playwright/test';

// Single-select pill groups across the site are named groups that expose the
// pressed choice, not only its colour (DOS/Rate#1069).
const PAGES: { path: string; groups: (string | RegExp)[] }[] = [
  {
    path: '/smartphones/iphone-16-pro-max-256gb',
    groups: ['Gian hàng:', 'Khoảng thời gian', 'Chu kỳ sử dụng'],
  },
  { path: '/deals', groups: [/Ngành hàng/] },
  {
    path: '/merchants',
    groups: ['Lọc theo sàn', 'Lọc theo rủi ro đánh giá'],
  },
  { path: '/developers', groups: [/Chọn nhanh một truy vấn mẫu/, /Mã/] },
];

async function pressedIn(page: Page, name: string | RegExp) {
  const group = page.getByRole('group', { name }).first();
  await expect(group).toBeVisible();
  return group.getByRole('button', { pressed: true });
}

for (const { path, groups } of PAGES) {
  test(`${path} pill groups expose the pressed choice`, async ({ page }) => {
    expect((await page.goto(path))?.status()).toBe(200);
    for (const name of groups) {
      await expect(await pressedIn(page, name)).toHaveCount(1);
    }
  });
}

test('choosing another pill moves the pressed state', async ({ page }) => {
  expect((await page.goto('/developers'))?.status()).toBe(200);
  const group = page.getByRole('group', { name: /Mã/ }).first();
  const python = group.getByRole('button', { name: 'Python' });
  await expect(python).toHaveAttribute('aria-pressed', 'false');
  // A click before hydration does nothing; retry until React handles it.
  await expect(async () => {
    if ((await python.getAttribute('aria-pressed')) !== 'true') {
      await python.click();
    }
    await expect(python).toHaveAttribute('aria-pressed', 'true', {
      timeout: 500,
    });
  }).toPass();
  await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
});

// No seeded product has a criterion score, as on rate.vn today: a persona
// or custom weights would rank exactly like the default, so versus and deals
// do not offer them (DOS/Rate#1556).
test('versus and deals offer no persona without criterion scores', async ({
  page,
}) => {
  expect(
    (
      await page.goto(
        '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb'
      )
    )?.status()
  ).toBe(200);
  await expect(page.locator('.rate-scoreboard-dark')).toBeVisible();
  await expect(
    page.getByRole('group', { name: /Chấm theo nhu cầu/ })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Tùy chỉnh trọng số/ })
  ).toHaveCount(0);

  expect((await page.goto('/deals'))?.status()).toBe(200);
  await expect(page.locator('#rate-ranked-deals > div').first()).toBeVisible();
  await expect(page.locator('#rate-deal-personas')).toHaveCount(0);
});
