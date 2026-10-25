import { expect, test } from '@playwright/test';

// The leaderboard and comparison pages carry a summary ItemList: each item has
// a position, a name and its product page URL, and no embedded Product, whose
// markup belongs on the product page (DOS/Rate#1059).
const PAGES = [
  { path: '/leaderboard', minItems: 2 },
  {
    path: '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb',
    minItems: 2,
  },
];

for (const { path, minItems } of PAGES) {
  test(`${path} has a summary ItemList`, async ({ page }) => {
    expect((await page.goto(path))?.status()).toBe(200);
    const blocks = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).map((text) => JSON.parse(text) as Record<string, unknown>);
    const nodes = blocks.flatMap(
      (b) => (b['@graph'] as Record<string, unknown>[] | undefined) ?? [b]
    );
    const list = nodes.find((n) => n['@type'] === 'ItemList') as
      { itemListElement: Record<string, unknown>[] } | undefined;
    expect(list).toBeDefined();
    const items = list!.itemListElement;
    expect(items.length).toBeGreaterThanOrEqual(minItems);
    items.forEach((item, i) => {
      expect(item['@type']).toBe('ListItem');
      expect(item.position).toBe(i + 1);
      expect(typeof item.name).toBe('string');
      expect(String(item.url)).toMatch(/^https:\/\/rate\.vn\/[a-z-]+\/[\w-]+$/);
      expect(item.item).toBeUndefined();
    });
    expect(JSON.stringify(list)).not.toContain('"Product"');
  });
}
