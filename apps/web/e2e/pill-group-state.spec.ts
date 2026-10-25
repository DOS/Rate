import { expect, test, type Page } from '@playwright/test';

// Single-select pill groups across the site are named groups that expose the
// pressed choice, not only its colour (DOS/Rate#1069).
const PAGES: { path: string; groups: (string | RegExp)[] }[] = [
  {
    path: '/smartphones/iphone-16-pro-max-256gb',
    groups: ['Gian hàng:', 'Khoảng thời gian', 'Chu kỳ sử dụng'],
  },
  {
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
    groups: [/Chấm theo nhu cầu/],
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
  await python.click();
  await expect(python).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
});
