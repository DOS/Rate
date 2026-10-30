import { expect, test, type APIRequestContext } from '@playwright/test';

// One indexable URL per page: a product asked for under another category's
// path 308s to its own (DOS/Rate#1366), and a versus pair in the other order
// or another letter case 308s to the sorted pair (DOS/Rate#1367).
const IPHONE = 'iphone-16-pro-max-256gb';
const GALAXY = 'samsung-galaxy-s25-ultra-256gb';
// Category from metadata only: the seeded watch (seed.sql, DOS/Rate#1366).
const WATCH = 'apple-watch-e2e-cellular';

async function redirectTarget(
  request: APIRequestContext,
  path: string,
  baseURL: string | undefined
) {
  const res = await request.get(path, { maxRedirects: 0 });
  expect(res.status(), path).toBe(308);
  // `next start` sends the Location header twice (Vercel sends it once), and
  // headers() would join the two: every copy must name the same target.
  const targets = new Set(
    res
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === 'location')
      .map(({ value }) => new URL(value, baseURL).pathname)
  );
  expect(targets.size, path).toBe(1);
  return [...targets][0];
}

async function canonicalOf(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  expect(res.status(), path).toBe(200);
  return (await res.text()).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
}

test('a product under another category path 308s to its own', async ({
  request,
  baseURL,
}) => {
  for (const category of ['laptops', 'tablets', 'earbuds', 'smartwatches']) {
    expect(
      await redirectTarget(request, `/${category}/${IPHONE}`, baseURL)
    ).toBe(`/smartphones/${IPHONE}`);
  }
  expect(await redirectTarget(request, `/smartphones/${WATCH}`, baseURL)).toBe(
    `/smartwatches/${WATCH}`
  );

  // The product's own path renders and is its own canonical.
  expect(await canonicalOf(request, `/smartphones/${IPHONE}`)).toBe(
    `https://rate.vn/smartphones/${IPHONE}`
  );
  expect(await canonicalOf(request, `/smartwatches/${WATCH}`)).toBe(
    `https://rate.vn/smartwatches/${WATCH}`
  );
});

test('a versus pair has one URL: the sorted order', async ({
  request,
  baseURL,
}) => {
  const sorted = `/compare/${IPHONE}-vs-${GALAXY}`;
  expect(
    await redirectTarget(request, `/compare/${GALAXY}-vs-${IPHONE}`, baseURL)
  ).toBe(sorted);
  expect(
    await redirectTarget(
      request,
      `/compare/${IPHONE.toUpperCase()}-vs-${GALAXY}`,
      baseURL
    )
  ).toBe(sorted);
  expect(await canonicalOf(request, sorted)).toBe(`https://rate.vn${sorted}`);
});
