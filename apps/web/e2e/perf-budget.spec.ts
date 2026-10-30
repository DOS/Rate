import { devices, expect, test, type Page } from '@playwright/test';
import { DEVICE_IMAGE_RENDITIONS } from '../src/lib/device-image-renditions';

// Performance budget for the main pages on a phone (DOS/Rate#1496): what a
// first load transfers, so this cycle's wins (#1330, #1415, #1416, #1419)
// do not quietly come back. Bytes are compressed bytes on the wire, from the
// browser's own network events, against the production build `run.mjs`
// serves. Budgets are today's numbers plus about 10%; a deliberate increase
// is a one-line change here, made in review with the numbers the failure
// prints.
const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
test.use(phone);

type Kind = 'html' | 'js' | 'css' | 'prefetch';
type Budget = Record<Kind, number>;

const KB = 1024;
// Measured on CI on 2026-10-30 (E2E job, PR #1497), KB of HTML / JS / CSS /
// prefetch: home 39.5 / 320.3 / 43.5 / 0; category 39.9 / 338.8 / 45.4 /
// 6.3-7.9; product 50.8 / 352.1 / 43.5 / 1.7-5.7; merchant 29.9 / 313.7 /
// 43.5 / 3.4. Budgets add about 10%. How many links a page prefetches on
// its own depends on timing, so prefetch takes the highest run plus 25%, at
// least 4 KB: a full page prefetched on sight is tens of KB.
// photo: a device photo with sized renditions the page lists.
const PAGES: Record<string, { path: string; budget: Budget; photo?: string }> =
  {
    home: {
      path: '/',
      budget: { html: 44 * KB, js: 353 * KB, css: 48 * KB, prefetch: 4 * KB },
    },
    category: {
      path: '/smartphones',
      budget: { html: 44 * KB, js: 373 * KB, css: 50 * KB, prefetch: 10 * KB },
    },
    product: {
      path: '/smartphones/iphone-16-pro-max-256gb',
      budget: { html: 56 * KB, js: 388 * KB, css: 48 * KB, prefetch: 8 * KB },
    },
    merchant: {
      path: '/merchants/11111111-1111-4111-8111-111111111111',
      budget: { html: 33 * KB, js: 346 * KB, css: 48 * KB, prefetch: 5 * KB },
      photo: 'apple-iphone-16-pro-max-256gb',
    },
  };

type Transfer = { url: string; kind: Kind | 'other'; bytes: number };

/**
 * Every response the page loads, with its bytes on the wire (response
 * headers included, the same on every run), and how many tracked requests
 * are still loading.
 */
async function recordTransfers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const pending = new Map<string, Omit<Transfer, 'bytes'>>();
  const done: Transfer[] = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    // The page never navigates here, so every RSC request is a prefetch,
    // with or without the next-router-prefetch header (a full prefetch
    // sends none).
    const kind: Transfer['kind'] =
      e.type === 'Document'
        ? 'html'
        : new URL(e.request.url).searchParams.has('_rsc')
          ? 'prefetch'
          : e.type === 'Script'
            ? 'js'
            : e.type === 'Stylesheet'
              ? 'css'
              : 'other';
    pending.set(e.requestId, { url: e.request.url, kind });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const req = pending.get(e.requestId);
    pending.delete(e.requestId);
    if (req) done.push({ ...req, bytes: e.encodedDataLength });
  });
  cdp.on('Network.loadingFailed', (e) => {
    pending.delete(e.requestId);
  });
  const inFlight = () =>
    [...pending.values()].filter((r) => r.kind !== 'other').length;
  return { transfers: done, inFlight };
}

function summary(transfers: Transfer[], kind: Kind) {
  const files = transfers.filter((t) => t.kind === kind);
  const total = files.reduce((sum, t) => sum + t.bytes, 0);
  const largest = [...files]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((t) => `${(t.bytes / KB).toFixed(1)} KB ${new URL(t.url).pathname}`)
    .join('\n  ');
  return { total, largest };
}

for (const [name, { path, budget, photo }] of Object.entries(PAGES)) {
  test(`${name} stays within its phone budget`, async ({ page }) => {
    const { transfers, inFlight } = await recordTransfers(page);
    const fullSizePhotos: string[] = [];
    const sizedPhotos: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      const slug = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(pathname)?.[1];
      if (slug && DEVICE_IMAGE_RENDITIONS[slug]) fullSizePhotos.push(slug);
      if (photo && pathname.startsWith(`/img/devices/sized/${photo}-`))
        sizedPhotos.push(pathname);
    });
    expect((await page.goto(path))?.status()).toBe(200);
    // No hover or touch: what loads here loads for every visitor. Prefetches
    // start after hydration, on idle; one that starts in the wait is counted
    // once it has finished.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect.poll(inFlight, { timeout: 10_000 }).toBe(0);

    for (const kind of ['html', 'js', 'css', 'prefetch'] as const) {
      const { total, largest } = summary(transfers, kind);
      expect
        .soft(
          total,
          `${name} ${kind}: ${(total / KB).toFixed(1)} KB against a budget of ${(budget[kind] / KB).toFixed(1)} KB. Largest:\n  ${largest || '(none)'}`
        )
        .toBeLessThanOrEqual(budget[kind]);
    }
    // A device photo with pre-sized WebP renditions loads one of those, never
    // its full-size JPEG (#1332, #1415, #1419). The merchant page lists one
    // (seed.sql, #1500); its thumbnail is lazy, so it is brought into view
    // once the totals above are read, and its WebP must load.
    // Recorded from the start: Chrome may load a lazy image near the fold
    // during the first load already.
    if (photo) {
      await page
        .locator(`img[src="/img/devices/${photo}.jpg"]`)
        .first()
        .scrollIntoViewIfNeeded();
      await expect
        .poll(() => sizedPhotos.length, {
          message: `${name} never loaded the sized WebP of ${photo}`,
        })
        .toBeGreaterThan(0);
      await page.waitForLoadState('networkidle');
    }
    expect
      .soft(fullSizePhotos, `${name} requested full-size device photos`)
      .toEqual([]);
  });
}
