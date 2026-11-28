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

  // DOS/Rate#1986: unified 36px height & 8px radius across navbar right controls,
  // hero actions, and market price strip; compact 6px radius jump-nav tabs.
  const metrics = await page.evaluate(() => {
    const readBox = (el: Element | null) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        height: Math.round(el.getBoundingClientRect().height),
        radius: cs.borderRadius,
        textTransform: cs.textTransform,
      };
    };
    const navSocial = document.querySelector('.nav-menu.nav-menu-social');
    const navControls = [
      navSocial?.querySelector('[data-testid="theme-cycle"]') ?? null,
      navSocial?.querySelector('button[aria-expanded]') ?? null,
      navSocial?.querySelector('li.list-buttons a') ?? null,
    ].map(readBox);
    const actionControls = [
      document.querySelector('.rate-pdv-actions a[href="#jreviews-section"]'),
      document.querySelector('.rate-pdv-actions button[aria-controls]'),
      document.querySelector('.rate-pdv-actions .rate-chip-btn'),
    ].map(readBox);
    const jumpTab = readBox(
      document.querySelector('[data-testid="pdv-jump-nav"] a')
    );
    const stripControls = [
      document.querySelector(
        'a[href="#pdv-price-history"][data-slot="button"]'
      ),
      document.querySelector(
        'details.rate-export-menu summary[data-slot="button"]'
      ),
    ].map(readBox);
    return { navControls, actionControls, jumpTab, stripControls };
  });
  for (const box of [
    ...metrics.navControls,
    ...metrics.actionControls,
    ...metrics.stripControls,
  ]) {
    expect(box).not.toBeNull();
    expect(box!.height).toBe(36);
    expect(box!.radius).toBe('8px');
  }
  expect(metrics.navControls[2]!.textTransform).toBe('none');
  expect(metrics.jumpTab).toEqual({
    height: 36,
    radius: '6px',
    textTransform: 'none',
  });

  // Leaderboard standing label renders no duplicate trophy icon beside the #1 badge.
  const standingLink = board.locator('a[href^="/leaderboard?cat="]').first();
  await expect(standingLink).toBeVisible();
  await expect(standingLink.locator('svg')).toHaveCount(1);
  const standingLabel = standingLink.locator(
    'xpath=preceding-sibling::span[1]'
  );
  await expect(standingLabel.locator('svg')).toHaveCount(0);
});

test('desktop navbar uses sentence case, lower PDV uses unified 8px buttons, and alternatives never overflow (#2002)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await page.goto(IPHONE);
  expect(res?.status()).toBe(200);

  // 1. Left desktop navbar links use sentence case (no text-transform: capitalize).
  const navTransforms = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.nav-menu:not(.nav-menu-social) > li > a'
      )
    ).filter((el) => el.getBoundingClientRect().width > 0);
    return links.map((el) => ({
      text: el.textContent?.trim() ?? '',
      textTransform: getComputedStyle(el).textTransform,
    }));
  });
  expect(navTransforms.length).toBeGreaterThanOrEqual(3);
  for (const item of navTransforms) {
    expect(item.textTransform, item.text).toBe('none');
  }

  // 2. Lower PDV sections use unified 8px button radius across migrated controls.
  const lowerButtons = await page.evaluate(() => {
    const sections = [
      '#jreviews-section',
      '#pdv-price-history',
      '#offers-table',
    ];
    return sections.map((selector) => {
      const root = document.querySelector(selector);
      const buttons = Array.from(
        root?.querySelectorAll<HTMLElement>('[data-slot="button"]') ?? []
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return {
        selector,
        count: buttons.length,
        radii: [...new Set(buttons.map((el) => getComputedStyle(el).borderRadius))],
      };
    });
  });
  for (const section of lowerButtons) {
    expect(section.count, section.selector).toBeGreaterThan(0);
    expect(section.radii, section.selector).toEqual(['8px']);
  }

  // 3. Alternatives cards wrap unbroken slash-separated titles with zero horizontal overflow or overlap.
  const alternatives = page.getByTestId('same-category-value-alternatives');
  await expect(alternatives).toBeVisible();
  const peerOverflow = await alternatives.evaluate((grid) => {
    const longSlashTitle =
      'Samsung G3 G31H LS27HG310EEXXV 27 inch/FHD/IPS/144Hz/1ms/UltraLongUnbrokenSpecToken';
    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>('[data-slot="card"]')
    );
    for (const card of cards) {
      const link = card.querySelector<HTMLElement>('h4 a');
      if (link) link.textContent = longSlashTitle;
    }
    const results = cards.map((card) => {
      const cardRect = card.getBoundingClientRect();
      const title = card.querySelector<HTMLElement>('h4');
      const titleRect = title?.getBoundingClientRect() ?? null;
      const body = card.querySelector<HTMLElement>('.rate-pdv-peer-body');
      return {
        cardScrollDiff: card.scrollWidth - card.clientWidth,
        bodyScrollDiff: body ? body.scrollWidth - body.clientWidth : 0,
        titleOverflowRight: titleRect
          ? Math.round(titleRect.right - cardRect.right)
          : 0,
        overflowWrap: title ? getComputedStyle(title).overflowWrap : '',
      };
    });
    return {
      cardCount: cards.length,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      results,
    };
  });
  expect(peerOverflow.cardCount).toBeGreaterThan(0);
  expect(peerOverflow.pageScrollWidth).toBeLessThanOrEqual(
    peerOverflow.viewportWidth
  );
  for (const row of peerOverflow.results) {
    expect(row.cardScrollDiff).toBeLessThanOrEqual(1);
    expect(row.bodyScrollDiff).toBeLessThanOrEqual(1);
    expect(row.titleOverflowRight).toBeLessThanOrEqual(1);
    expect(row.overflowWrap).toBe('anywhere');
  }

  // 4. Competitors heading never widens a 375px phone viewport.
  await page.setViewportSize({ width: 375, height: 812 });
  const phoneOverflow = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.rate-pdv-wrap-heading h3, h3.rate-pdv-wrap-heading'
    );
    if (heading) {
      heading.textContent =
        'Lựa chọn thay thế cho Samsung/G3/G31H/LS27HG310EEXXV/27inch/FHD/IPS/144Hz/1ms';
    }
    return {
      hasHeading: Boolean(heading),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(phoneOverflow.hasHeading).toBe(true);
  expect(phoneOverflow.scrollWidth).toBeLessThanOrEqual(
    phoneOverflow.viewportWidth
  );
});

test('multi-variant product surfaces variant picker inside pdv-variant-strip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(VARIANT_PHONE))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/smartphones\/e2e-variant-phone\?v=256gb$/);
  const strip = page.getByTestId('pdv-variant-strip');
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('pdv-variant-picker')).toBeVisible();
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
