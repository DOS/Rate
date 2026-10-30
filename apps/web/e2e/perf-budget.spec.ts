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
// Measured on CI on 2026-10-30 (E2E job, PR #1497): JS / CSS KB.
// home 320.3 / 43.5; category 338.8 / 45.4; product 352.1 / 43.5;
// merchant 313.7 / 43.5.
const PAGES: Record<string, { path: string; budget: Budget }> = {
  home: {
    path: '/',
    budget: { html: 1, js: 353 * KB, css: 48 * KB, prefetch: 1 },
  },
  category: {
    path: '/smartphones',
    budget: { html: 1, js: 373 * KB, css: 50 * KB, prefetch: 1 },
  },
  product: {
    path: '/smartphones/iphone-16-pro-max-256gb',
    budget: { html: 1, js: 388 * KB, css: 48 * KB, prefetch: 1 },
  },
  merchant: {
    path: '/merchants/11111111-1111-4111-8111-111111111111',
    budget: { html: 1, js: 346 * KB, css: 48 * KB, prefetch: 1 },
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

for (const [name, { path, budget }] of Object.entries(PAGES)) {
  test(`${name} stays within its phone budget`, async ({ page }) => {
    const { transfers, inFlight } = await recordTransfers(page);
    const fullSizePhotos: string[] = [];
    page.on('request', (req) => {
      const slug = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(
        new URL(req.url()).pathname
      )?.[1];
      if (slug && DEVICE_IMAGE_RENDITIONS[slug]) fullSizePhotos.push(slug);
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
    // its full-size JPEG (#1332, #1415, #1419). The seeded pages above show
    // no such photo today, so this guards pages and seeds that add one.
    expect
      .soft(fullSizePhotos, `${name} requested full-size device photos`)
      .toEqual([]);
  });
}
