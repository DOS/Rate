import { expect, test, type Page } from '@playwright/test';

// Seeded in apps/web/e2e/seed.sql.
const IPHONE = {
  slug: 'iphone-16-pro-max-256gb',
  name: 'iPhone 16 Pro Max 256GB',
};
const GALAXY = {
  slug: 'samsung-galaxy-s25-ultra-256gb',
  name: 'Galaxy S25 Ultra 256GB',
};

// Next.js awaits metadata before answering HTML-limited crawlers such as Bingbot,
// so they exercise the non-streaming path; the default UA covers streaming.
const BINGBOT =
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';

/** A product card links to the detail page (the name also sits in hidden <option>s). */
const productLink = (page: Page, slug: string) =>
  page.locator(`a[href$="/${slug}"]`).first();

const visibleText = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true }).first();

/** Fails the test on uncaught page errors (hydration failures included). */
function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('home page renders seeded products', async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(visibleText(page, IPHONE.name)).toBeVisible();
  await page.waitForLoadState('networkidle'); // let late hydration errors surface
  expect(errors).toEqual([]);
});

test('category page lists both smartphones', async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto('/smartphones');
  expect(res?.status()).toBe(200);
  await expect(productLink(page, IPHONE.slug)).toBeVisible();
  await expect(productLink(page, GALAXY.slug)).toBeVisible();
  await page.waitForLoadState('networkidle'); // let late hydration errors surface
  expect(errors).toEqual([]);
});

test('product page shows offers and reviews', async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto(`/smartphones/${IPHONE.slug}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    IPHONE.name
  );
  await expect(page.getByText('Apple Flagship Store').first()).toBeVisible();
  await expect(
    page.getByText('pin trâu suốt cả ngày', { exact: false }).first()
  ).toBeVisible();
  await page.waitForLoadState('networkidle'); // let late hydration errors surface
  expect(errors).toEqual([]);
});

// No soft 404s (DOS/Rate#316): unknown detail URLs answer 404 to browsers
// and crawlers, which only works while no loading boundary streams first.
for (const path of [
  '/smartphones/does-not-exist-e2e',
  '/laptops/does-not-exist-e2e',
  '/tablets/does-not-exist-e2e',
  '/earbuds/does-not-exist-e2e',
  '/smartwatches/does-not-exist-e2e',
  '/merchants/00000000-0000-4000-8000-000000000000',
  '/compare/no-such-a-vs-no-such-b',
]) {
  test(`unknown ${path} is a real 404`, async ({ request }) => {
    for (const userAgent of [undefined, BINGBOT]) {
      const res = await request.get(path, {
        headers: userAgent ? { 'user-agent': userAgent } : {},
      });
      expect(res.status(), userAgent ?? 'default user agent').toBe(404);
    }
  });
}

test('unknown product slug shows the not-found page, never indexed', async ({
  page,
}) => {
  await page.goto('/smartphones/does-not-exist-e2e');
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
    'content',
    /noindex/
  );
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText(
    IPHONE.name
  );
});

// A merchant with 250 listings: its reads are chunked under the request-line
// limit, and the review on its last listing still shows (DOS/Rate#329).
test('merchant with hundreds of listings loads every chunk', async ({
  request,
}) => {
  expect((await request.get('/merchants/bulk-listings-store')).status()).toBe(
    200
  );
  const res = await request.get('/api/v1/rate/merchants/bulk-listings-store');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('Đóng gói cẩn thận, giao nhanh.');
});

// The merchant directory reads reviews for every unscored listing, including
// the 250 of bulk-listings-store: chunked, it still loads (DOS/Rate#333).
test('merchant directory loads with a merchant of hundreds of listings', async ({
  request,
}) => {
  expect((await request.get('/merchants')).status()).toBe(200);
  const res = await request.get('/api/v1/rate/merchants');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('bulk-listings-store');
});

// Positive controls for the 404 specs: the same routes resolve seeded rows.
test('merchant and versus pages resolve seeded rows', async ({ request }) => {
  for (const path of [
    '/merchants/11111111-1111-4111-8111-111111111111',
    `/compare/${IPHONE.slug}-vs-${GALAXY.slug}`,
  ]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('compare page shows both products', async ({ page }) => {
  const errors = trackPageErrors(page);
  const res = await page.goto(`/compare?slugs=${IPHONE.slug},${GALAXY.slug}`);
  expect(res?.status()).toBe(200);
  await expect(visibleText(page, IPHONE.name)).toBeVisible();
  await expect(visibleText(page, GALAXY.name)).toBeVisible();
  await page.waitForLoadState('networkidle'); // let late hydration errors surface
  expect(errors).toEqual([]);
});

test('locale prefix redirects and switches the language', async ({ page }) => {
  const res = await page.goto('/en/smartphones');
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/smartphones');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'NEXT_LOCALE')?.value).toBe('en');
});
