import { expect, test } from '@playwright/test';

// RATE_ITEM_MODEL=nullable_variant on the M0 + M1+M2 proposal schema (DOS/Rate#1159):
// the #1153 routes for one multi-size Item (seed.sql in this folder).
const ITEM = '/smartphones/e2e-item-phone';
const CANONICAL = 'https://rate.vn/smartphones/e2e-item-phone';

const canonicalOf = async (
  request: import('@playwright/test').APIRequestContext,
  path: string
) => {
  const res = await request.get(path);
  expect(res.status(), path).toBe(200);
  return (await res.text()).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
};

test('an old variant URL 308s to the Item URL with its size', async ({
  request,
}) => {
  for (const [variant, key] of [
    ['e2e-item-phone-256gb', '256gb'],
    ['e2e-item-phone-128gb', '128gb'],
  ]) {
    const res = await request.get(`/smartphones/${variant}`, {
      maxRedirects: 0,
    });
    expect(res.status(), variant).toBe(308);
    expect(res.headers().location, variant).toMatch(
      new RegExp(`/smartphones/e2e-item-phone\\?v=${key}$`)
    );
  }
});

test('a retired variant URL 308s to the Item URL without a size', async ({
  request,
}) => {
  const res = await request.get('/smartphones/e2e-item-phone-unknown', {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toMatch(/\/smartphones\/e2e-item-phone$/);
});

test('the Item URL renders and is its own canonical, with or without ?v=', async ({
  request,
}) => {
  expect(await canonicalOf(request, ITEM)).toBe(CANONICAL);
  expect(await canonicalOf(request, `${ITEM}?v=256gb`)).toBe(CANONICAL);
  expect(await canonicalOf(request, `${ITEM}?v=not-a-size`)).toBe(CANONICAL);
});

test('a followed variant redirect lands on the canonical Item page', async ({
  page,
}) => {
  const res = await page.goto('/smartphones/e2e-item-phone-256gb');
  expect(res?.status()).toBe(200);
  expect(page.url()).toMatch(/\/smartphones\/e2e-item-phone\?v=256gb$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    CANONICAL
  );
});

test('a slug that is no published Item or variant of one is a 404', async ({
  request,
}) => {
  for (const path of [
    '/smartphones/e2e-no-such-item',
    // A draft Item and its variant are not public.
    '/smartphones/e2e-draft-phone',
    '/smartphones/e2e-draft-phone-128gb',
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});
