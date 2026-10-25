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
  { path: '/deals', groups: [/Ngành hàng/, /Ưu tiên chấm điểm/] },
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

test('compare custom weights are named on the sliders toggle', async ({
  page,
}) => {
  expect(
    (
      await page.goto(
        '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb'
      )
    )?.status()
  ).toBe(200);
  const toggle = page.getByRole('button', { name: /Tùy chỉnh trọng số/ });
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', {
      timeout: 500,
    });
  }).toPass();
  // useId ids hold characters that need escaping in a #id selector.
  const panelId = (await toggle.getAttribute('aria-controls')) ?? '';
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toBeVisible();
  await expect(toggle).not.toHaveAccessibleName(/Trọng số tùy chỉnh/);
  await panel.locator('input[type="range"]').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(toggle).toHaveAccessibleName(/Trọng số tùy chỉnh/);
  const presets = page.getByRole('group', { name: /Chấm theo nhu cầu/ });
  await expect(presets.getByRole('button', { pressed: true })).toHaveCount(0);
});
