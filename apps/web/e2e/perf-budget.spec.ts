import { devices, expect, test, type Page } from '@playwright/test';

// Performance budget for the main pages on a phone (DOS/Rate#1496): what a
// first load transfers, so this cycle's wins (#1330, #1415, #1416, #1419)
// do not quietly come back. Bytes are compressed bytes on the wire, from the
// browser's own network events, against the production build `run.mjs`
// serves. Budgets are today's numbers plus about 10%; a deliberate increase
// is a one-line change here, made in review with the numbers the failure
// prints.
const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
test.use(phone);

type Budget = { js: number; css: number; prefetch: number };

const KB = 1024;
const PAGES: Record<string, { path: string; budget: Budget }> = {
  home: { path: '/', budget: { js: 1, css: 1, prefetch: 1 } },
  category: { path: '/smartphones', budget: { js: 1, css: 1, prefetch: 1 } },
  product: {
    path: '/smartphones/iphone-16-pro-max-256gb',
    budget: { js: 1, css: 1, prefetch: 1 },
  },
  merchant: {
    path: '/merchants/11111111-1111-4111-8111-111111111111',
    budget: { js: 1, css: 1, prefetch: 1 },
  },
};

type Transfer = {
  url: string;
  kind: 'js' | 'css' | 'prefetch' | 'other';
  bytes: number;
};

/** Every response the page loads, with its bytes on the wire. */
async function recordTransfers(page: Page): Promise<Transfer[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const pending = new Map<string, Omit<Transfer, 'bytes'>>();
  const done: Transfer[] = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    const url = new URL(e.request.url);
    const isPrefetch =
      url.searchParams.has('_rsc') &&
      Object.keys(e.request.headers).some(
        (h) => h.toLowerCase() === 'next-router-prefetch'
      );
    const kind = isPrefetch
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
    if (req) done.push({ ...req, bytes: e.encodedDataLength });
  });
  return done;
}

function summary(transfers: Transfer[], kind: Transfer['kind']) {
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
    const transfers = await recordTransfers(page);
    const images: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith('/img/devices/')) images.push(url.pathname);
    });
    expect((await page.goto(path))?.status()).toBe(200);
    // No hover or touch: what loads here loads for every visitor. Prefetches
    // start after hydration, on idle.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    for (const kind of ['js', 'css', 'prefetch'] as const) {
      const { total, largest } = summary(transfers, kind);
      expect
        .soft(
          total,
          `${name} ${kind}: ${(total / KB).toFixed(1)} KB against a budget of ${(budget[kind] / KB).toFixed(1)} KB. Largest:\n  ${largest || '(none)'}`
        )
        .toBeLessThanOrEqual(budget[kind]);
    }
    // A device photo goes through the resized /_next/image path, never as
    // the full-size original (#1415, #1419).
    expect
      .soft(images, `${name} requested full-size device photos`)
      .toEqual([]);
  });
}
