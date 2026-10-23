import { expect, test } from '@playwright/test';

// A vote the server refuses for a signed-in reader is rolled back on screen
// and in storage, with the reason shown (DOS/Rate#790). Signed-out votes
// (401) stay a browser-only simulation.
const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';
const CASES = [
  { status: 403, code: 'VOTER_NOT_ELIGIBLE', notice: /xác nhận email/ },
  { status: 429, code: 'RATE_LIMIT_EXCEEDED', notice: /vote quá nhanh/ },
  { status: 500, code: 'INTERNAL', notice: /Chưa lưu được vote/ },
];

for (const { status, code, notice } of CASES) {
  test(`a ${status} vote is rolled back with a message`, async ({ page }) => {
    await page.route('**/api/reviews/*/vote', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code }),
      })
    );
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    const vote = page.getByRole('button', { name: /Hữu ích \(\d+\)/ }).first();
    await vote.scrollIntoViewIfNeeded();
    const before = (await vote.innerText()).trim();

    await vote.click();
    await expect(page.getByText(notice)).toBeVisible();
    await expect(vote).toHaveText(before);
    const saved = await page.evaluate(() =>
      Object.entries(window.localStorage)
        .filter(([k]) => /vote/i.test(k))
        .map(([, v]) => v)
        .join('')
    );
    expect(saved === '' || saved === '{}').toBe(true);
  });
}

test('a signed-out vote stays as a browser simulation', async ({ page }) => {
  await page.route('**/api/reviews/*/vote', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    })
  );
  expect((await page.goto(PRODUCT))?.status()).toBe(200);
  const vote = page.getByRole('button', { name: /Hữu ích \(\d+\)/ }).first();
  await vote.scrollIntoViewIfNeeded();
  const count = (s: string) => Number(s.match(/\((\d+)\)/)?.[1] ?? -1);
  const before = count(await vote.innerText());
  await vote.click();
  await expect(page.getByText(/Đăng nhập/).first()).toBeVisible();
  await expect.poll(async () => count(await vote.innerText())).toBe(before + 1);
});
