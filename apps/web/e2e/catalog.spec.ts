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
  const res = await request.get('/api/v1/rate/merchants?q=bulk-listings-store');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('bulk-listings-store');
});

// 1100 extra merchants exceed PostgREST's 1000-row cap; the directory pages its
// read, so the last-ranked one is still searchable (DOS/Rate#358).
test('merchant search reaches merchants past the 1000-row cap', async ({
  request,
}) => {
  const res = await request.get('/api/v1/rate/merchants?q=last-ranked-shop');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('last-ranked-shop');
});

// Search, trust floor and sort filter the cached directory in memory
// (DOS/Rate#457); limit applies after them. By default official stores rank
// first, so the product-count order below is only there if the sort ran.
test('merchant search combines q, sort and limit', async ({ request }) => {
  const res = await request.get(
    '/api/v1/rate/merchants?q=store&sort=products_desc&limit=2'
  );
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data.map((m: { slug: string }) => m.slug)).toEqual([
    'many-offers-store',
    'bulk-listings-store',
  ]);
});

// 1050 offers / listings exceed PostgREST's 1000-row cap: single, batched and
// merchant reads page past it (DOS/Rate#366).
test('offer and listing reads page past the 1000-row cap', async ({
  request,
}) => {
  const product = await (
    await request.get('/api/v1/rate/products/e2e-many-offers-phone')
  ).json();
  expect(product.data.offers).toHaveLength(1050);
  // All-time low/high recorded before the newest 1000 observations (#464).
  expect(product.data.priceHistory.lowestEverPrice).toBe(500000);
  expect(product.data.priceHistory.highestEverPrice).toBe(3000000);
  // Reviews and their analysis on the last listing come through (DOS/Rate#453).
  expect(JSON.stringify(product.data.reviews)).toContain(
    'Review past the 1000-row listing cap.'
  );
  expect(product.data.reviewSummary.total_analyzed).toBe(7);
  // LLM free text is shown with the one-listing scope (DOS/Rate#1244).
  expect(product.data.reviewSummary.ai_summary).toBe(
    'Theo các đánh giá của một nơi bán trong lần phân tích gần nhất: E2E analysis past the 1000-row listing cap.'
  );

  const merchant = await (
    await request.get('/api/v1/rate/merchants/many-offers-store')
  ).json();
  expect(merchant.data.listings).toHaveLength(1050);

  // Batched path: the dearest 50 offers carry the whole price spread.
  const compare = await (
    await request.get(
      '/api/v1/rate/compare?slugs=e2e-many-offers-phone,iphone-16-pro-max-256gb'
    )
  ).json();
  const many = compare.data.find(
    (p: { slug: string }) => p.slug === 'e2e-many-offers-phone'
  );
  expect(many.deal_radar.spreadPct).toBeGreaterThan(0);
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

// The directory renders stores in pages of 48 instead of one card per store
// up front (1100+ seeded), and "show more" appends the next page.
test('merchant directory renders stores progressively', async ({ page }) => {
  await page.goto('/merchants');
  const cardLinks = () =>
    page
      .locator('a[href^="/merchants/"]')
      .evaluateAll(
        (els) => new Set(els.map((e) => e.getAttribute('href'))).size
      );
  const first = await cardLinks();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThanOrEqual(48);
  await page.getByRole('button', { name: /Xem thêm/ }).click();
  await expect.poll(cardLinks).toBeGreaterThan(first);
});

// 201 seeded earbuds: one more than a catalogue page holds (DOS/Rate#466).
test('category catalogue pages past 200 models', async ({ page }) => {
  // Four catalogue renders of 200 models each (DOS/Rate#779).
  test.slow();
  const productSlugs = async () =>
    new Set(
      await page
        .locator('a[href*="/earbuds/e2e-bud-"]')
        .evaluateAll((links) =>
          links.map((a) => (a.getAttribute('href') ?? '').split('?')[0])
        )
    );

  expect((await page.goto('/earbuds'))?.status()).toBe(200);
  const first = await productSlugs();
  expect(first.size).toBe(200);
  const next = page.locator('nav a[rel="next"]');
  await expect(next).toHaveAttribute('href', /[?&]page=2\b/);
  await expect(page.locator('nav a[rel="prev"]')).toHaveCount(0);

  expect((await page.goto('/earbuds?page=2'))?.status()).toBe(200);
  const second = await productSlugs();
  expect(second.size).toBe(1);
  for (const slug of second) expect(first.has(slug)).toBe(false);
  await expect(page.locator('nav a[rel="next"]')).toHaveCount(0);
  await expect(page.locator('nav a[rel="prev"]')).toHaveAttribute(
    'href',
    /\/earbuds$/
  );

  // A sidebar filter change returns to page 1. The URL changes only once the
  // filtered page has rendered (router.replace in a transition), which takes
  // several seconds when the suite runs in parallel. Click once, after
  // hydration: a click after the first navigation commits would toggle the
  // brand off again (DOS/Rate#779).
  await page.waitForLoadState('networkidle');
  await page.locator('label[for^="brand-"]').first().click();
  await expect(page).toHaveURL(/[?&]brands=/, { timeout: 20_000 });
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);

  // Past the last page: a link back to the first page.
  expect((await page.goto('/earbuds?page=5'))?.status()).toBe(200);
  const firstPage = page.getByRole('link', {
    name: /Về trang đầu|First page|První stránka/,
  });
  await expect(firstPage).toHaveAttribute('href', /\/earbuds$/);
});

// Page 2+ of a catalogue is canonical to itself, not to page 1 (DOS/Rate#482).
test('catalogue pages carry their own canonical URL', async ({ request }) => {
  const canonical = async (path: string) => {
    const html = await (await request.get(path)).text();
    return html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  };
  expect(await canonical('/earbuds')).toBe('https://rate.vn/earbuds');
  expect(await canonical('/earbuds?page=2')).toBe(
    'https://rate.vn/earbuds?page=2'
  );
  expect(await canonical('/earbuds?page=2&brands=E2E%20Audio')).toBe(
    'https://rate.vn/earbuds?page=2'
  );
});

// Phase 2B (DOS/Rate#2003): unified 36px/8px shadcn controls across Catalog
// toolbar, sort dropdown, ProductCard CTAs, and Home HeroSearchInspector, plus
// unbroken slash-separated title wrap on ProductCard.
test('catalog toolbar, sort, product cards, and home hero search use unified 8px controls without title overflow (#2003)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto('/smartphones'))?.status()).toBe(200);
  await page.waitForLoadState('networkidle');

  const catalogMetrics = await page.evaluate(() => {
    const readBox = (el: Element | null) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        height: Math.round(el.getBoundingClientRect().height),
        radius: cs.borderRadius,
        textTransform: cs.textTransform,
      };
    };
    const toolbarCta = readBox(
      document.querySelector('[data-testid="catalog-1v1-go-btn"]')
    );
    const exportBtn = readBox(
      document.querySelector(
        '.rate-catalog-toolbar details.rate-export-menu summary[data-slot="button"]'
      )
    );
    const sortBtn = readBox(document.querySelector('#shortfilter'));
    const cardCtas = Array.from(
      document.querySelectorAll('.rate-product-card-cta [data-slot="button"]')
    )
      .slice(0, 4)
      .map(readBox);

    // Inject a long unbroken slash-separated product name into the first card.
    const longSlashTitle =
      'Samsung G3 G31H LS27HG310EEXXV 27 inch/FHD/IPS/144Hz/1ms/UltraLongUnbrokenSpecToken';
    const card = document.querySelector<HTMLElement>('.rate-product-card');
    const body = card?.querySelector<HTMLElement>('.rate-product-card-body');
    const title = card?.querySelector<HTMLElement>('.rate-product-card-title');
    const titleLink = title?.querySelector<HTMLElement>('a');
    if (titleLink) titleLink.textContent = longSlashTitle;
    const cardRect = card?.getBoundingClientRect() ?? null;
    const titleRect = title?.getBoundingClientRect() ?? null;

    return {
      toolbarCta,
      exportBtn,
      sortBtn,
      cardCtas,
      overflow: {
        hasCard: Boolean(card && body && title && titleLink),
        cardScrollDiff: card ? card.scrollWidth - card.clientWidth : 999,
        bodyScrollDiff: body ? body.scrollWidth - body.clientWidth : 999,
        titleOverflowRight:
          cardRect && titleRect
            ? Math.round(titleRect.right - cardRect.right)
            : 999,
        overflowWrap: title ? getComputedStyle(title).overflowWrap : '',
        pageScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      },
    };
  });

  expect(catalogMetrics.toolbarCta).toEqual({
    height: 36,
    radius: '8px',
    textTransform: 'none',
  });
  expect(catalogMetrics.exportBtn).toEqual({
    height: 36,
    radius: '8px',
    textTransform: 'none',
  });
  expect(catalogMetrics.sortBtn).toEqual({
    height: 36,
    radius: '8px',
    textTransform: 'none',
  });
  expect(catalogMetrics.cardCtas.length).toBeGreaterThanOrEqual(2);
  for (const cta of catalogMetrics.cardCtas) {
    expect(cta).toEqual({
      height: 36,
      radius: '8px',
      textTransform: 'none',
    });
  }
  expect(catalogMetrics.overflow.hasCard).toBe(true);
  expect(catalogMetrics.overflow.cardScrollDiff).toBeLessThanOrEqual(1);
  expect(catalogMetrics.overflow.bodyScrollDiff).toBeLessThanOrEqual(1);
  expect(catalogMetrics.overflow.titleOverflowRight).toBeLessThanOrEqual(1);
  expect(catalogMetrics.overflow.overflowWrap).toBe('anywhere');
  expect(catalogMetrics.overflow.pageScrollWidth).toBeLessThanOrEqual(
    catalogMetrics.overflow.viewportWidth
  );

  // Home HeroSearchInspector: mode switcher and submit buttons use 8px radius,
  // with zero pill (999px / 50px) buttons on Home.
  expect((await page.goto('/'))?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  const homeMetrics = await page.evaluate(() => {
    const hero = document.querySelector('.hero-header');
    const modeButtons = Array.from(
      hero?.querySelectorAll<HTMLElement>('button[aria-pressed]') ?? []
    ).map((el) => ({
      height: Math.round(el.getBoundingClientRect().height),
      radius: getComputedStyle(el).borderRadius,
    }));
    const submitBtn = hero?.querySelector<HTMLElement>(
      'form.search-wrap button[type="submit"]'
    );
    const pillButtons = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[data-slot="button"], a.btn'
      )
    )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .filter((el) => {
        const radius = parseFloat(getComputedStyle(el).borderRadius);
        return Number.isFinite(radius) && radius >= 24;
      })
      .map((el) => `${el.tagName}:${el.textContent?.trim().slice(0, 30)}`);
    return {
      modeButtons,
      submitRadius: submitBtn ? getComputedStyle(submitBtn).borderRadius : null,
      pillButtons,
    };
  });
  expect(homeMetrics.modeButtons).toHaveLength(2);
  for (const btn of homeMetrics.modeButtons) {
    expect(btn).toEqual({ height: 36, radius: '8px' });
  }
  expect(homeMetrics.submitRadius).toBe('8px');
  expect(homeMetrics.pillButtons).toEqual([]);
});

// 320px phone reflow check across vi and cs locales (DOS/Rate#2003):
// HeroSearchInspector mode switcher buttons wrap cleanly inside the viewport
// with zero clipping or horizontal overflow.
for (const locale of ['vi', 'cs'] as const) {
  test(`home hero search mode buttons fit a 320px screen in ${locale} (#2003)`, async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL ?? '' }]);
    await page.setViewportSize({ width: 320, height: 640 });
    expect((await page.goto('/'))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.evaluate(() => document.fonts.ready);
    const phoneMetrics = await page.evaluate(() => {
      const hero = document.querySelector('.hero-header');
      const modeButtons = Array.from(
        hero?.querySelectorAll<HTMLElement>('button[aria-pressed]') ?? []
      ).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          left: rect.left,
          right: rect.right,
          scrollDiff: el.scrollWidth - el.clientWidth,
          radius: getComputedStyle(el).borderRadius,
        };
      });
      return {
        modeButtons,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(phoneMetrics.scrollWidth, locale).toBeLessThanOrEqual(320);
    expect(phoneMetrics.modeButtons, locale).toHaveLength(2);
    for (const btn of phoneMetrics.modeButtons) {
      expect(btn.width, locale).toBeGreaterThan(0);
      expect(btn.left, locale).toBeGreaterThanOrEqual(0);
      expect(btn.right, locale).toBeLessThanOrEqual(320);
      expect(btn.scrollDiff, locale).toBeLessThanOrEqual(1);
      expect(btn.radius, locale).toBe('8px');
    }
  });
}
