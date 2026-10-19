import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// The /merchants directory is filtered and paged on the server; the page no
// longer ships all 1,100+ seeded stores, yet search, "show more" and the
// exports still cover the whole directory (DOS/Rate#452).
test.describe.configure({ timeout: 120_000 });

test('merchant directory pages on the server', async ({ page, request }) => {
  const res = await page.goto('/merchants');
  expect(res?.status()).toBe(200);
  const html = await res!.text();
  // A low-ranked store is not in the first page's payload.
  expect(html).not.toContain('last_ranked_shop');
  expect(html.length).toBeLessThan(800_000);

  const cards = page.locator('a[href^="/merchants/"]', {
    hasText: /./,
  });
  await expect(cards.first()).toBeVisible();

  // Search reaches a store that was not shipped with the page.
  await page.getByRole('searchbox').first().fill('Last Ranked');
  await expect(page.getByText('Last Ranked Shop').first()).toBeVisible();

  // The API pages consistently: two pages of the default order are disjoint.
  const first = await (
    await request.get('/api/v1/rate/merchants/directory?offset=0&limit=48')
  ).json();
  const second = await (
    await request.get('/api/v1/rate/merchants/directory?offset=48&limit=48')
  ).json();
  expect(first.data.items).toHaveLength(48);
  expect(second.data.items).toHaveLength(48);
  expect(first.data.matched).toBeGreaterThan(1100);
  const firstIds = new Set(first.data.items.map((m: { id: string }) => m.id));
  for (const m of second.data.items) expect(firstIds.has(m.id)).toBe(false);
});

test('merchant CSV export covers every matching store', async ({
  page,
  request,
}) => {
  const total = (
    await (await request.get('/api/v1/rate/merchants/directory?limit=1')).json()
  ).data.matched as number;

  await page.goto('/merchants');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-merchants-csv-btn').click(),
  ]);
  const csv = await readFile((await download.path())!, 'utf8');
  const rows = csv.replace(/^\uFEFF/, '').trim().split(/\r\n/);
  expect(rows.length - 1).toBe(total);
});

test('merchant Markdown copy covers every matching store', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const total = (
    await (await request.get('/api/v1/rate/merchants/directory?limit=1')).json()
  ).data.matched as number;

  await page.goto('/merchants');
  await page.getByTestId('copy-merchants-md-btn').click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
      timeout: 30_000,
    })
    .toContain(`(${total} merchants)`);
  const md = await page.evaluate(() => navigator.clipboard.readText());
  // Title, blank line, header and separator, then one row per store.
  expect(md.trim().split('\n').length - 4).toBe(total);
});
