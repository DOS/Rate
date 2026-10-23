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
  // Hold both votes, refuse Minh's while Lan Phương's is still in flight,
  // then refuse hers: each rollback must touch only its own review
  // (DOS/Rate#799). Cards are found by their seeded text because a vote
  // can re-sort the list.
  const MINH = '44444444-4444-4444-8444-444444444441';
  const LAN = '44444444-4444-4444-8444-444444444442';
  const held = new Map<string, () => Promise<void>>();
  await page.route('**/api/reviews/*/vote', async (route) => {
    const id = route.request().url().split('/').at(-2) ?? '';
    held.set(id, () =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'VOTER_NOT_ELIGIBLE' }),
      })
    );
  });
  const stored = () =>
    page.evaluate(() => window.localStorage.getItem('rate_review_votes_v1'));
  const helpful = (text: string) =>
    page
      .locator('div.col-md-6')
      .filter({ hasText: text })
      .getByRole('button', { name: /Hữu ích \(\d+\)/ });
  const minh = helpful('pin trâu suốt cả ngày');
  const lan = helpful('hơi nóng khi chơi game');

  expect((await page.goto(PRODUCT))?.status()).toBe(200);
  await lan.scrollIntoViewIfNeeded();
  await minh.click();
  await lan.click();
  await expect.poll(() => held.size).toBe(2);

  await held.get(MINH)?.();
  await expect(minh).toHaveAttribute('aria-pressed', 'false');
  await expect(lan).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse((await stored()) ?? 'null')).toEqual({ [LAN]: 'up' });

  await held.get(LAN)?.();
  await expect(lan).toHaveAttribute('aria-pressed', 'false');
  await expect(minh).toHaveAttribute('aria-pressed', 'false');
  expect(JSON.parse((await stored()) ?? 'null')).toEqual({});
});
