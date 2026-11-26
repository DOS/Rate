import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PRODUCT = '/smartphones/iphone-16-pro-max-256gb';

test('GET /api/v1/rate/reviews supports keyset pagination without duplicates (#1926)', async ({
  request,
}) => {
  const seenIds: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 3; page += 1) {
    const query: string = cursor
      ? `/api/v1/rate/reviews?slug=e2e-review-labels-phone&limit=2&cursor=${encodeURIComponent(cursor)}`
      : '/api/v1/rate/reviews?slug=e2e-review-labels-phone&limit=2';
    const res = await request.get(query);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      totalCount: number;
      count: number;
      hasMore: boolean;
      nextCursor: string | null;
      data: Array<{ id: string; images?: string[] }>;
    };
    expect(body.ok).toBe(true);
    expect(body.totalCount).toBe(6);
    expect(body.count).toBe(2);
    expect(body.hasMore).toBe(page < 2);
    if (page < 2) {
      expect(typeof body.nextCursor).toBe('string');
    } else {
      expect(body.nextCursor).toBeNull();
    }
    for (const item of body.data as Array<{ id: string; images?: string[] }>) {
      expect(Array.isArray(item.images)).toBe(true);
      seenIds.push(item.id);
    }
    cursor = body.nextCursor;
  }
  expect(seenIds).toHaveLength(6);
  expect(new Set(seenIds).size).toBe(6);

  const badCursor = await request.get(
    '/api/v1/rate/reviews?slug=e2e-review-labels-phone&cursor=bad-cursor'
  );
  expect(badCursor.status()).toBe(400);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`report reason dialog is accessible (${colorScheme}) and submits chosen reason (#1925)`, async ({
    page,
  }) => {
    let capturedBody: { voteType?: string; reportReason?: string } | null =
      null;
    await page.route('**/api/reviews/*/vote', async (route) => {
      capturedBody = route.request().postDataJSON() as {
        voteType?: string;
        reportReason?: string;
      };
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      });
    });

    await page.emulateMedia({ colorScheme });
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    const reportBtn = page
      .getByRole('button', { name: /Báo cáo \(\d+\)/ })
      .first();
    await reportBtn.scrollIntoViewIfNeeded();
    await reportBtn.click();

    const dialog = page.getByTestId('review-report-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type="radio"]')).toHaveCount(5);

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations).toEqual([]);

    // Escape closes the dialog and returns focus to the triggering report button.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(reportBtn).toBeFocused();

    // Reopen, choose "offensive", and submit.
    await reportBtn.click();
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="radio"][value="offensive"]').check();
    await page.getByTestId('review-report-submit-btn').click();

    await expect(dialog).toBeHidden();
    const reportedBtn = page.getByRole('button', {
      name: /Báo cáo \(\d+\)/,
      pressed: true,
    });
    await expect(reportedBtn).toHaveCount(1);
    await expect(reportedBtn).toBeFocused();
    expect(capturedBody).toEqual({
      voteType: 'report',
      reportReason: 'offensive',
    });
    await expect(page.getByText(/Đăng nhập/).first()).toBeVisible();
  });
}
