import { expect, test, type Page } from '@playwright/test';

// Structured data uses absolute URLs: Google rejects relative ones, which
// left product rich results without an image (DOS/Rate#738).
const URL_KEYS = new Set(['url', 'image', 'item', 'logo', '@id']);

async function jsonLd(page: Page): Promise<unknown[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.map((text) => JSON.parse(text) as unknown);
}

function nodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    return [node, ...Object.values(node).flatMap(nodes)];
  }
  return [];
}

function relativeUrls(data: unknown[]): string[] {
  const out: string[] = [];
  for (const node of nodes(data)) {
    for (const [key, value] of Object.entries(node)) {
      if (!URL_KEYS.has(key)) continue;
      for (const v of Array.isArray(value) ? value : [value]) {
        if (typeof v === 'string' && !/^https:\/\//.test(v))
          out.push(`${key}=${v}`);
      }
    }
  }
  return out;
}

test('product structured data has absolute URLs, url and description', async ({
  page,
}) => {
  expect(
    (await page.goto('/smartphones/iphone-16-pro-max-256gb'))?.status()
  ).toBe(200);
  const data = await jsonLd(page);
  const product = nodes(data).find((n) => n['@type'] === 'Product');
  expect(product).toBeTruthy();
  expect(product!.url).toBe(
    'https://rate.vn/smartphones/iphone-16-pro-max-256gb'
  );
  expect(String(product!.description ?? '').length).toBeGreaterThan(20);
  expect(relativeUrls(data)).toEqual([]);
});

test('home page has Organization and WebSite structured data', async ({
  page,
}) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  const data = await jsonLd(page);
  const types = nodes(data).map((n) => n['@type']);
  expect(types).toContain('Organization');
  expect(types).toContain('WebSite');
  expect(relativeUrls(data)).toEqual([]);
});
