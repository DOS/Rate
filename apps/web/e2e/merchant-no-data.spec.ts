import { expect, test } from '@playwright/test';

// A store with no DOSafe score, no review evidence and no stored combined
// score has no trust score: a neutral "no data yet" tag, no number in the
// page, its title or its description, last in the trust order and outside
// the "safe" count (DOS/Rate#1484).
const NO_DATA_ID = '11111111-1111-4111-8111-111111111484';
const DIRECTORY = '/api/v1/rate/merchants/directory';

interface DirectoryItem {
  id: string;
  name: string;
  trust_score: number | null;
}

test('a store with no data shows no trust score', async ({ page }) => {
  expect((await page.goto(`/merchants/${NO_DATA_ID}`))?.status()).toBe(200);
  await expect(page.getByTestId('merchant-trust-label')).toHaveText(
    'Chưa có dữ liệu'
  );
  await expect(page.getByTestId('merchant-trust-score')).toHaveCount(0);
  const title = await page.title();
  expect(title).toContain('No Data Store');
  expect(title).not.toMatch(/\d+\/100/);
  expect(title).not.toContain('Tin cậy');
  const description = await page
    .locator('meta[name="description"]')
    .getAttribute('content');
  expect(description).toContain('No Data Store');
  expect(description).not.toMatch(/\d+\/100/);
});

test('the directory sorts a store with no data last and never counts it safe', async ({
  page,
  request,
}) => {
  const found = await (
    await request.get(`${DIRECTORY}?q=${encodeURIComponent('No Data Store')}`)
  ).json();
  const item = (found.data.items as DirectoryItem[]).find(
    (m) => m.id === NO_DATA_ID
  );
  expect(item).toBeTruthy();
  expect(item!.trust_score).toBeNull();

  // Default order (trust): every scored store comes before the first one
  // with no score, and the seed has both.
  const first = await (
    await request.get(`${DIRECTORY}?offset=0&limit=500`)
  ).json();
  const trusts = (first.data.items as DirectoryItem[]).map(
    (m) => m.trust_score
  );
  const firstNull = trusts.indexOf(null);
  expect(firstNull).toBeGreaterThan(0);
  expect(trusts.slice(firstNull).every((t) => t === null)).toBe(true);
  const scored = trusts.slice(0, firstNull) as number[];
  for (let i = 1; i < scored.length; i += 1) {
    expect(scored[i]!).toBeLessThanOrEqual(scored[i - 1]!);
  }

  // Not a "safe" store, and the "safe" count is the safe tier.
  const safeNoData = await (
    await request.get(
      `${DIRECTORY}?risk=safe&q=${encodeURIComponent('No Data Store')}`
    )
  ).json();
  expect(safeNoData.data.matched).toBe(0);
  const safe = (
    await (await request.get(`${DIRECTORY}?risk=safe&limit=1`)).json()
  ).data.matched as number;
  await page.goto('/merchants');
  await expect(page.getByTestId('merchant-safe-count')).toHaveText(
    String(safe)
  );
});
