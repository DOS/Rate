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

  // #1940: ?star=1..5 server-side filtering + pagination + invalid star -> 400.
  const star5Page1Res = await request.get(
    '/api/v1/rate/reviews?slug=e2e-review-labels-phone&star=5&limit=4'
  );
  expect(star5Page1Res.status()).toBe(200);
  const star5Page1 = (await star5Page1Res.json()) as {
    ok: boolean;
    totalCount: number;
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
    data: Array<{ id: string; rating_star: number }>;
  };
  expect(star5Page1.ok).toBe(true);
  expect(star5Page1.totalCount).toBe(6);
  expect(star5Page1.count).toBe(4);
  expect(star5Page1.hasMore).toBe(true);
  expect(star5Page1.data.every((r) => r.rating_star === 5)).toBe(true);

  const star5Page2Res = await request.get(
    `/api/v1/rate/reviews?slug=e2e-review-labels-phone&star=5&limit=4&cursor=${encodeURIComponent(star5Page1.nextCursor!)}`
  );
  expect(star5Page2Res.status()).toBe(200);
  const star5Page2 = (await star5Page2Res.json()) as {
    totalCount: number;
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
    data: Array<{ id: string; rating_star: number }>;
  };
  expect(star5Page2.totalCount).toBe(6);
  expect(star5Page2.count).toBe(2);
  expect(star5Page2.hasMore).toBe(false);
  expect(star5Page2.nextCursor).toBeNull();
  const star5Ids = [...star5Page1.data, ...star5Page2.data].map((r) => r.id);
  expect(new Set(star5Ids).size).toBe(6);

  const star1EmptyRes = await request.get(
    '/api/v1/rate/reviews?slug=e2e-review-labels-phone&star=1'
  );
  expect(star1EmptyRes.status()).toBe(200);
  const star1Empty = (await star1EmptyRes.json()) as {
    totalCount: number;
    count: number;
    data: unknown[];
  };
  expect(star1Empty.totalCount).toBe(0);
  expect(star1Empty.count).toBe(0);
  expect(star1Empty.data).toEqual([]);

  const star4MainRes = await request.get(
    '/api/v1/rate/reviews?slug=iphone-16-pro-max-256gb&star=4'
  );
  expect(star4MainRes.status()).toBe(200);
  const star4Main = (await star4MainRes.json()) as {
    totalCount: number;
    data: Array<{ author_name: string; rating_star: number }>;
  };
  expect(star4Main.totalCount).toBe(1);
  expect(star4Main.data[0]?.author_name).toBe('Lan Phương');

  for (const invalidStar of ['0', '6', '4.5', 'abc']) {
    const invalidRes = await request.get(
      `/api/v1/rate/reviews?slug=e2e-review-labels-phone&star=${encodeURIComponent(invalidStar)}`
    );
    expect(invalidRes.status()).toBe(400);
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`5-to-1 star histogram is accessible (${colorScheme}) and toggles review filter (#1940)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    expect((await page.goto(PRODUCT))?.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    const histogram = page.getByTestId('review-star-histogram');
    await histogram.scrollIntoViewIfNeeded();
    await expect(histogram).toBeVisible();

    for (const star of [5, 4, 3, 2, 1]) {
      const btn = page.getByTestId(`review-star-histogram-btn-${star}`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.getByTestId('review-star-histogram-btn-5')).toContainText(
      '50%'
    );
    await expect(page.getByTestId('review-star-histogram-btn-4')).toContainText(
      '50%'
    );

    const baseScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(baseScan.violations).toEqual([]);

    // Click 4-star bar: filters to Lan Phương and marks both histogram + chip pressed.
    const reviewsSection = page.locator('#jreviews-section');
    const minhAuthor = reviewsSection.getByText('Minh', { exact: true });
    const lanPhuongAuthor = reviewsSection.getByText('Lan Phương', {
      exact: true,
    });
    const btn4 = page.getByTestId('review-star-histogram-btn-4');
    await btn4.click();
    await expect(btn4).toHaveAttribute('aria-pressed', 'true');
    await expect(lanPhuongAuthor).toBeVisible();
    await expect(minhAuthor).toBeHidden();

    const activeScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(activeScan.violations).toEqual([]);

    // Clicking active 4-star bar toggles back to all stars.
    await btn4.click();
    await expect(btn4).toHaveAttribute('aria-pressed', 'false');
    await expect(minhAuthor).toBeVisible();
    await expect(lanPhuongAuthor).toBeVisible();

    // Clicking a 0-count tier shows empty state and Clear filters resets to all.
    const btn3 = page.getByTestId('review-star-histogram-btn-3');
    await btn3.click();
    await expect(btn3).toHaveAttribute('aria-pressed', 'true');
    await expect(
      reviewsSection.getByText(
        'Không có đánh giá nào khớp với bộ lọc hiện tại.'
      )
    ).toBeVisible();
    await reviewsSection.getByRole('button', { name: 'Xóa lọc' }).click();
    await expect(btn3).toHaveAttribute('aria-pressed', 'false');
    await expect(minhAuthor).toBeVisible();
  });
}

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
