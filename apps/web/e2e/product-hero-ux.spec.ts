import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Hero decluttering, collapsed empty score boxes, aligned seller count,
// variant + color strip under price, and Light/Dark WCAG 2.2 AA (DOS/Rate#1945).
const HERO_WATCH = '/smartwatches/e2e-hero-watch-49mm-64gb';
const IPHONE = '/smartphones/iphone-16-pro-max-256gb';
const VARIANT_PHONE = '/smartphones/e2e-variant-phone-256gb';

test('hero removes duplicate CTAs, aligns seller counts, collapses empty boxes, and hides (0) count', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await page.goto(HERO_WATCH);
  expect(res?.status()).toBe(200);

  // Price line and jump nav seller count both show 3 (ignoring the 4th out-of-stock listing).
  await expect(page.locator('.rate-pdv-price-line')).toContainText('3 nơi bán');
  const offersJump = page.locator(
    '[data-testid="pdv-jump-nav"] a[href="#offers-table"]'
  );
  await expect(offersJump).toContainText('Nơi bán (3)');

  // Variant chip and interactive color links sit inside pdv-variant-strip right under the price,
  // while the left studio photo card contains no color chips.
  const mediaCard = page.locator('.rate-pdv-media-card');
  await expect(mediaCard.locator('.rate-pdv-colors')).toHaveCount(0);
  await expect(
    mediaCard.locator('.rate-pdv-media.is-studio img')
  ).toBeVisible();

  const variantStrip = page.getByTestId('pdv-variant-strip');
  await expect(variantStrip).toBeVisible();
  await expect(page.getByTestId('pdv-single-variant-chip')).toHaveText(
    '49mm 64GB'
  );
  const colorLinks = variantStrip.locator(
    '.rate-pdv-color-chip[href="#offers-table"]'
  );
  await expect(colorLinks).toHaveCount(2);
  await expect(colorLinks.nth(0)).toHaveText('Titan Tự Nhiên');
  await expect(colorLinks.nth(1)).toHaveText('Titan Đen');

  // Empty expert score box and 58%-wide empty criteria container are collapsed.
  const board = page.locator('.rate-pdv-board');
  await expect(board).toHaveClass(/\bis-compact\b/);
  await expect(board.locator('.rate-pdv-score.is-expert')).toHaveCount(0);
  await expect(board.locator('.rate-pdv-crit')).toHaveCount(0);
  await expect(page.getByTestId('pdv-criteria-empty')).toBeVisible();

  // 0 verified reviews: user score prints 4.9 cleanly without (0).
  const userScore = page.getByTestId('pdv-user-score');
  await expect(userScore).toBeVisible();
  await expect(userScore.locator('.rate-stars-value')).toHaveText('4.9');
  await expect(userScore.locator('.rate-stars-count')).toHaveCount(0);

  // Actions row has strictly 3 focused controls and no duplicate Specs / Compare links.
  const actions = page.locator('.rate-pdv-actions');
  await expect(actions.locator('a[href="#jreviews-section"]')).toHaveText(
    'Viết / Xem đánh giá'
  );
  await expect(actions.locator('a[href="#specs-section"]')).toHaveCount(0);
  await expect(actions.locator('a[href^="/compare"]')).toHaveCount(0);
  await expect(
    actions.getByRole('button', { name: /Theo dõi giảm giá/i })
  ).toHaveCount(1);
  await expect(actions.locator('.rate-chip-btn')).toHaveCount(1);

  // Leaderboard standing label renders no duplicate trophy icon beside the #1 badge.
  const standingLink = board.locator('a[href^="/leaderboard?cat="]').first();
  await expect(standingLink).toBeVisible();
  await expect(standingLink.locator('svg')).toHaveCount(1);
  const standingLabel = standingLink.locator(
    'xpath=preceding-sibling::span[1]'
  );
  await expect(standingLabel.locator('svg')).toHaveCount(0);
});

test('multi-variant product surfaces variant links inside pdv-variant-strip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(VARIANT_PHONE))?.status()).toBe(200);
  const strip = page.getByTestId('pdv-variant-strip');
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('pdv-variant-links')).toBeVisible();
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
]) {
  test(`watch hero with photo, variant, colors, score, and jump nav fits above fold at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    expect((await page.goto(HERO_WATCH))?.status()).toBe(200);
    for (const selector of [
      'h1',
      '.rate-pdv-price-line',
      '[data-testid="pdv-variant-strip"]',
      '[data-testid="pdv-hero-score"]',
      '[data-testid="pdv-jump-nav"]',
    ]) {
      const el = page.locator(selector).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box && box.y + box.height, selector).toBeLessThanOrEqual(
        viewport.height
      );
    }
    const heroScore = page.getByTestId('pdv-hero-score');
    await expect(heroScore.locator('.rate-stars-value')).toHaveText('4.9');
    await expect(heroScore.locator('.rate-stars-count')).toHaveCount(0);
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const path of [HERO_WATCH, IPHONE]) {
    test(`product hero passes WCAG 2.2 AA Axe audit on ${path} (${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 1280, height: 900 });
      expect((await page.goto(path))?.status()).toBe(200);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const summary = violations.map(
        (v) =>
          `${v.impact} ${v.id}: ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`
      );
      expect(summary).toEqual([]);
    });
  }
}
