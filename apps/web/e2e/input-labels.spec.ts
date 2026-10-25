import { expect, test } from '@playwright/test';

// A placeholder is not a label: it disappears as soon as the user types.
// Every visible field must be named by a <label>, aria-label or
// aria-labelledby (WCAG 1.3.1, 3.3.2; DOS/Rate#1077).
const PAGES = ['/smartphones', '/deals', '/merchants', '/leaderboard'];

for (const path of PAGES) {
  test(`visible fields have a label on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(
      page.locator('input:not([type=hidden]):visible').first()
    ).toBeVisible();
    const unlabelled = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input:not([type=hidden]), select, textarea'
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter(
          (el) =>
            !el.labels?.length &&
            !el.getAttribute('aria-label')?.trim() &&
            !el.getAttribute('aria-labelledby')
        )
        .map((el) => `${el.type} name=${el.name} placeholder=${el.placeholder}`)
    );
    expect(unlabelled).toEqual([]);
  });
}

test('catalog search fields are named by their visible captions', async ({
  page,
}) => {
  await page.goto('/smartphones');
  await expect(page.getByRole('textbox', { name: 'Tìm máy' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Hãng' })).toBeVisible();
});
