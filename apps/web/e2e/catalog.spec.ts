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

// Next.js awaits metadata before responding to HTML-limited crawlers such as
// Bingbot; Googlebot renders JavaScript and gets the streamed noindex instead.
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

// Soft 404 today: `[locale]/loading.tsx` starts the stream before the page
// calls notFound(), so the status is already 200 (DOS/Rate#316).
test.fixme('unknown product slug is a real 404 for crawlers', async ({
  request,
}) => {
  const res = await request.get('/smartphones/does-not-exist-e2e', {
    headers: { 'user-agent': BINGBOT },
  });
  expect(res.status()).toBe(404);
});

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
