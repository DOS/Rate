import { expect, test, type Page } from '@playwright/test';

// The contact-page link form talks to shoppers and actually reaches the
// ingest API (DOS/Rate#615).
const JARGON = [
  'Zero-Trust',
  'Quarantine',
  'rate.crawl_jobs',
  'rate.master_products',
  'rate.merchants',
  '(/inspect)',
  'Gatekeeper',
];

function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

// Fills and submits the form, retrying when a click before hydration turned
// into a native reload instead of a fetch.
async function submitForm(page: Page, title: string) {
  await expect(async () => {
    const form = page
      .locator('form')
      .filter({ has: page.locator('#community-quarantine-consent') });
    await form
      .locator('input[type="url"]')
      .fill('https://cellphones.com.vn/op-lung-iphone-16-pro-max.html');
    await form.locator('input[type="text"][required]').fill(title);
    await form.locator('input[type="number"][required]').fill('55000');
    await page.locator('#community-quarantine-consent').check();
    const response = page.waitForResponse('**/api/v1/rate/extension/ingest', {
      timeout: 3000,
    });
    await form.locator('button[type="submit"]').click();
    expect((await response).status()).toBe(200);
  }).toPass();
}

for (const path of ['/contact-us', '/en/contact-us', '/cs/contact-us']) {
  test(`${path} has no internal system names`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('#community-quarantine-consent')).toBeVisible();
    // The page's own sections; the site-wide footer is tracked separately.
    const text = (
      await page.locator('section:not(.rate-footer-cta)').allInnerTexts()
    ).join('\n');
    for (const term of JARGON) {
      expect(text).not.toContain(term);
    }
  });
}

test('link form starts empty with consent unticked', async ({ page }) => {
  await page.goto('/contact-us');
  const consent = page.locator('#community-quarantine-consent');
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  // The live region is mounted before any result so it gets announced.
  await expect(page.getByRole('status')).toBeAttached();
  const form = page.locator('form').filter({ has: consent });
  for (const value of await form
    .locator('input.form-control')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))) {
    expect(value).toBe('');
  }
});

test('an accessory link reaches the API and gets a plain answer', async ({
  page,
}) => {
  await page.goto('/en/contact-us');
  await expect(page.locator('#community-quarantine-consent')).toBeVisible();
  // The route derives the store and item from the URL, so this is a 200 with
  // the accessory verdict rather than a 400 for missing fields.
  await submitForm(page, 'Ốp lưng silicon iPhone 16 Pro Max chống sốc');
  const status = page.getByRole('status');
  await expect(status).toContainText('This link was not accepted');
  await expect(status).toContainText('accessory');
  // Alert text must stay readable on the pale alert background (WCAG 1.4.3).
  const [fg, bg] = await status.locator('.alert').evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.color, cs.backgroundColor];
  });
  const [l1, l2] = [luminance(fg ?? ''), luminance(bg ?? '')];
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('an accepted link shows the thank-you message', async ({ page }) => {
  await page.route('**/api/v1/rate/extension/ingest', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: { accepted: true, jobState: 'enqueued', jobId: 'job-123' },
      }),
    })
  );
  await page.goto('/contact-us');
  await expect(page.locator('#community-quarantine-consent')).toBeVisible();
  await submitForm(page, 'Apple iPhone 16 Pro Max 256GB');
  const status = page.getByRole('status');
  await expect(status).toContainText('Đã nhận link, cảm ơn bạn');
  await expect(status).toContainText('job-123');
});
