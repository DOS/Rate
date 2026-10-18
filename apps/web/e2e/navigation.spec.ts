import { expect, test } from '@playwright/test';

// Seeded in apps/web/e2e/seed.sql.
const SLUG = 'iphone-16-pro-max-256gb';

test('navigation progress shows during a slow client navigation', async ({
  page,
}) => {
  await page.goto('/smartphones');
  // Hold the destination's RSC payload so the pending state is observable.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/smartphones/${SLUG}*`, async (route) => {
    if (route.request().headers()['rsc']) await held;
    await route.continue();
  });

  const bar = page.getByTestId('navigation-progress');
  await expect(bar).toHaveCount(0);
  await page
    .locator(`a[href$="/${SLUG}"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(bar).toBeVisible();

  release();
  await expect(page).toHaveURL(new RegExp(`/smartphones/${SLUG}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test('same-page and external links do not start the progress bar', async ({
  page,
}) => {
  await page.goto('/smartphones');
  await page.evaluate(() => {
    const links: Array<[href: string, text: string]> = [
      ['#top', 'hash'],
      ['https://example.com/', 'external'],
    ];
    for (const [href, text] of links) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      a.addEventListener('click', (e) => e.preventDefault());
      document.body.prepend(a);
    }
  });
  await page.getByText('hash', { exact: true }).click();
  await page.getByText('external', { exact: true }).click();
  await expect(page.getByTestId('navigation-progress')).toHaveCount(0);
});
