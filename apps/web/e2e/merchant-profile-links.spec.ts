import { expect, test } from '@playwright/test';

// A merchant profile links only published products: a draft master has no
// product page, so a link to it answered 404 on rate.vn (DOS/Rate#769).
const PROFILE = '/merchants/ffffffff-ffff-4fff-8fff-ffffffff0769';

test('a merchant profile links only products that have a page', async ({
  page,
  request,
}) => {
  const res = await page.goto(PROFILE);
  expect(res?.status()).toBe(200);

  // The published model is linked; the draft listing still shows, unclustered.
  await expect(
    page.locator('a[href="/earbuds/e2e-bud-001"]').first()
  ).toBeVisible();
  await expect(
    page.getByRole('table').getByText('E2E Draft Phone chính hãng')
  ).toBeVisible();
  await expect(
    page
      .getByText(/Chưa ghép với dòng máy nào|Not matched to a model yet/)
      .first()
  ).toBeVisible();
  await expect(page.locator('a[href*="e2e-draft-phone"]')).toHaveCount(0);
  await expect(page.getByText('E2E Draft Phone', { exact: true })).toHaveCount(
    0
  );

  // Every product link on the profile answers 200.
  const hrefs = await page.locator('a[href]').evaluateAll((links) =>
    links
      .map((a) => a.getAttribute('href') || '')
      .filter((h) =>
        /^\/(smartphones|laptops|tablets|earbuds|smartwatches)\/[^/?#]+/.test(h)
      )
      .map((h) => h.split('#')[0]!)
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of new Set(hrefs)) {
    const linked = await request.get(href);
    expect(linked.status(), href).toBe(200);
  }
});
