import { expect, test, type Page } from '@playwright/test';

// This cycle's product-page changes, on Item routes (RATE_ITEM_MODEL=nullable_variant,
// DOS/Rate#1150): the size picker in place of the quick specs (#1436), the section
// order and jump row (#1469), a seller with no data (#1484) and the theme toggle
// (#1435). The flag-off pages keep their own specs in the default run.
const ITEM = '/smartphones/e2e-item-phone';
// Above the lazy threshold: the other sizes load on demand (#1285).
const BIG = '/smartphones/e2e-item-big';
const NO_DATA_MERCHANT = '17e00000-0000-4000-8000-0000000d1484';
const ORDER = [
  'specs-section',
  'jreviews-section',
  'pdv-price-history',
  'offers-table',
];

/** Clicks once the page is hydrated: a click before it does nothing. */
async function clickUntil(
  page: Page,
  target: ReturnType<Page['locator']>,
  done: () => Promise<void>
) {
  await expect(async () => {
    await target.click();
    await done();
  }).toPass({ timeout: 15_000 });
}

test('the size picker replaces the quick specs and links each size', async ({
  page,
}) => {
  await page.goto(ITEM);
  const picker = page.getByTestId('pdv-variant-picker');
  await expect(picker).toBeVisible();
  // The published sizes only: the retired unknown variant is no choice.
  const chips = picker.locator('button[data-variant]');
  await expect(chips).toHaveCount(2);
  expect(
    await chips.evaluateAll((b) => b.map((x) => x.dataset.variant))
  ).toEqual(['128gb', '256gb']);
  await expect(picker.locator('[data-variant="128gb"]')).toContainText(
    '10.990.000'
  );
  await expect(picker.locator('[data-variant="256gb"]')).toContainText(
    '12.990.000'
  );
  // The default size is selected. The picker stands where the quick-spec cards were,
  // and the flag-off variant links are not shown on an Item page.
  await expect(picker.locator('[data-variant="128gb"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('pdv-variant-links')).toHaveCount(0);

  // Picking a size writes it to ?v= and switches the sellers below.
  const big = picker.locator('[data-variant="256gb"]');
  await clickUntil(page, big, async () => {
    await expect(big).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  });
  await expect(page).toHaveURL(/\?v=256gb$/);
  await expect(
    page.locator('#offers-table').getByText('E2E Item Phone 256GB').first()
  ).toBeVisible();

  // Each size has its own link: ?v= opens the page on that size.
  await page.goto(`${ITEM}?v=256gb`);
  await expect(
    page.getByTestId('pdv-variant-picker').locator('[data-variant="256gb"]')
  ).toHaveAttribute('aria-pressed', 'true');
});

// The lazy Item also with another size loaded on demand.
for (const path of [ITEM, BIG, `${BIG}?v=256gb`]) {
  test(`${path}: price, jump row, specs, reviews, history, sellers`, async ({
    page,
  }) => {
    await page.goto(path);
    // A size loaded on demand is measured once its panel is in.
    if (path.endsWith('?v=256gb')) {
      await expect(
        page.getByText('E2E Item Big 256GB listing 1').first()
      ).toBeVisible();
    }
    // The "from" price line, the size picker, the jump row, then the sections.
    const selectors = [
      '.rate-pdv-price-line',
      '[data-testid="pdv-variant-picker"]',
      '[data-testid="pdv-jump-nav"]',
      ...ORDER.map((id) => `#${id}`),
    ];
    const tops = await page.evaluate(
      (list) =>
        list.map(
          (selector) =>
            document.querySelector(selector)?.getBoundingClientRect().top ??
            null
        ),
      selectors
    );
    expect(
      tops.every((top) => top !== null),
      JSON.stringify(tops)
    ).toBe(true);
    expect(tops).toEqual([...(tops as number[])].sort((a, b) => a - b));

    const nav = page.getByTestId('pdv-jump-nav');
    const hrefs = await nav
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(ORDER.map((id) => `#${id}`));
    // Every jump target exists once, lazy size panels included.
    for (const id of ORDER) await expect(page.locator(`#${id}`)).toHaveCount(1);
  });
}

test('a seller with no data shows no trust score on the Item page', async ({
  page,
}) => {
  await page.goto(`${ITEM}?v=256gb`);
  const badge = page
    .locator('#offers-table')
    .locator(`a.badge[href$="/merchants/${NO_DATA_MERCHANT}"]`)
    .filter({ visible: true });
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText('chưa có dữ liệu');
  await expect(badge).not.toContainText('%');
  // Its risk scores read "-", never a 0 (the lowest risk).
  const row = badge.locator('xpath=ancestor::tr[1]');
  await expect(row).toContainText('-/100');
  await expect(row).not.toContainText(/(^|[^\d.])0\/100/);
});

test('the theme toggle works on an Item page and is kept on the next one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(ITEM);
  const cycle = page.getByTestId('theme-cycle');
  // The cycle button: one click from system on a light system picks dark. Clicked
  // once only, as a second click would cycle on.
  await expect(cycle).toHaveAttribute('data-theme-choice', 'system');
  await cycle.click();
  await expect(cycle).toHaveAttribute('data-theme-choice', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');

  // Kept on the next Item page, before the body is parsed.
  await page.addInitScript(() => {
    const w = window as unknown as { __firstTheme?: string };
    new MutationObserver((_, observer) => {
      const theme = document.documentElement.getAttribute('data-bs-theme');
      if (theme && !w.__firstTheme && document.body === null) {
        w.__firstTheme = theme;
        observer.disconnect();
      }
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-bs-theme'],
    });
  });
  await page.goto(BIG);
  expect(
    await page.evaluate(
      () => (window as unknown as { __firstTheme?: string }).__firstTheme
    )
  ).toBe('dark');

  // Dark back to the system choice: light again.
  const next = page.getByTestId('theme-cycle');
  await expect(next).toHaveAttribute('data-theme-choice', 'dark');
  await next.click();
  await expect(next).toHaveAttribute('data-theme-choice', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');
});
