import { expect, test } from '@playwright/test';

// Leaderboard and compare selectors are named button groups that expose the
// pressed choice, not colour alone, and no tab roles without tab panels
// (DOS/Rate#1067).
test('leaderboard selectors expose their state', async ({ page }) => {
  expect((await page.goto('/leaderboard?criterion=user'))?.status()).toBe(200);
  await expect(page.getByRole('tab')).toHaveCount(0);

  const groups = [
    page.getByRole('group', { name: 'Chọn ngành hàng' }),
    page.getByRole('group', { name: /Xếp hạng theo tiêu chí/ }),
    page.getByRole('group', { name: 'Lọc theo tầm giá' }),
  ];
  for (const group of groups) {
    await expect(group).toBeVisible();
    await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
  }
  await expect(groups[1]!.getByRole('button', { pressed: true })).toContainText(
    'Điểm người mua thực chất'
  );

  // Choosing a price segment moves the pressed state.
  const price = groups[2]!;
  const unpressed = price.getByRole('button', { pressed: false }).first();
  const label = (await unpressed.innerText()).trim();
  await unpressed.click();
  await expect(price.getByRole('button', { pressed: true })).toHaveText(label);
});

// No seeded product has a criterion score, as on rate.vn today: the criterion
// tabs, the persona presets and the weight sliders would only empty the list,
// so they are not shown, and a criterion URL opens on the combined score
// (DOS/Rate#1553).
test('criteria with no scored product get no tab or persona', async ({
  page,
}) => {
  expect(
    (await page.goto('/leaderboard?cat=smartphones&criterion=camera'))?.status()
  ).toBe(200);
  const criteria = page.getByRole('group', { name: /Xếp hạng theo tiêu chí/ });
  await expect(criteria.getByRole('button')).toHaveCount(3);
  await expect(criteria.getByRole('button', { pressed: true })).toContainText(
    'Điểm tổng hợp'
  );
  await expect(
    page.getByRole('group', { name: /Gợi ý theo nhu cầu/ })
  ).toHaveCount(0);
  await expect(
    page.locator('button[aria-controls="leaderboard-weight-sliders"]')
  ).toHaveCount(0);
});

test('the compare category switcher exposes its state', async ({ page }) => {
  expect((await page.goto('/compare'))?.status()).toBe(200);
  await expect(page.getByRole('tab')).toHaveCount(0);
  const group = page.getByRole('group', { name: 'Chọn danh mục đối chiếu' });
  await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
});

// Forced colours drop the colours that mark the pressed button; it must still
// look different from the others (DOS/Rate#1086).
for (const [path, name] of [
  ['/leaderboard', 'Chọn ngành hàng'],
  ['/compare', 'Chọn danh mục đối chiếu'],
] as const) {
  test(`the pressed category stands out in forced colors on ${path}`, async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    expect((await page.goto(path))?.status()).toBe(200);
    const group = page.getByRole('group', { name });
    const look = (pressed: boolean) =>
      group
        .getByRole('button', { pressed })
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(group.getByRole('button', { pressed: false })).not.toHaveCount(
      0
    );
    expect(await look(true)).not.toBe(await look(false));
  });
}
