import { expect, test } from '@playwright/test';

// Category pages carry a breadcrumb and a summary ItemList of the listed
// products, all with absolute URLs (DOS/Rate#750).
test('category page structured data matches the product cards', async ({
  page,
}) => {
  expect((await page.goto('/smartphones'))?.status()).toBe(200);
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const graph = blocks.flatMap(
    (text) =>
      (JSON.parse(text) as { '@graph'?: Record<string, unknown>[] })[
        '@graph'
      ] ?? []
  );
  const breadcrumb = graph.find((n) => n['@type'] === 'BreadcrumbList') as
    { itemListElement: { item: string }[] } | undefined;
  const list = graph.find((n) => n['@type'] === 'ItemList') as
    { itemListElement: { position: number; url: string }[] } | undefined;
  expect(breadcrumb?.itemListElement.map((i) => i.item)).toEqual([
    'https://rate.vn',
    'https://rate.vn/smartphones',
  ]);
  expect(list?.itemListElement.length).toBeGreaterThan(0);
  const urls = list!.itemListElement.map((i) => i.url);
  expect(urls.every((u) => u.startsWith('https://rate.vn/smartphones/'))).toBe(
    true
  );
  expect(list!.itemListElement.map((i) => i.position)).toEqual(
    urls.map((_, i) => i + 1)
  );
  // The listed products are the cards on the page.
  const firstSlug = urls[0]!.split('/').pop()!;
  await expect(
    page.locator(`a[href="/smartphones/${firstSlug}"]`).first()
  ).toBeAttached();
});
