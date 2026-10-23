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

test('a refused vote does not bring back or drop votes on other reviews', async ({
  page,
}) => {
  // Hold both requests, then refuse the first review's vote before the
  // second's, so each rollback runs while the other review has a vote
  // (DOS/Rate#799).
  const held: Array<() => Promise<void>> = [];
  await page.route('**/api/reviews/*/vote', async (route) => {
    held.push(() =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'VOTER_NOT_ELIGIBLE' }),
      })
    );
  });
  expect((await page.goto(PRODUCT))?.status()).toBe(200);
  // Newest-first keeps the cards in place while their vote counts change.
  await page
    .locator('select:has(option[value="newest"])')
    .selectOption('newest');
  const votes = page.getByRole('button', { name: /Hữu ích \(\d+\)/ });
  await votes.nth(1).scrollIntoViewIfNeeded();

  await votes.nth(0).click();
  await votes.nth(1).click();
  await expect.poll(() => held.length).toBe(2);
  await held[0]?.();
  await expect(votes.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await held[1]?.();
  await expect(votes.nth(1)).toHaveAttribute('aria-pressed', 'false');

  await expect(votes.nth(0)).toHaveAttribute('aria-pressed', 'false');
  const saved = await page.evaluate(() =>
    window.localStorage.getItem('rate_review_votes_v1')
  );
  expect(saved).toBe('{}');
});
