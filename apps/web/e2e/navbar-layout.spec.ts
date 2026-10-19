import { expect, test, type Page } from '@playwright/test';

// The server HTML lays the navbar out for the viewport by media query, so
// the page does not jump after hydration, and the phone header fits the
// screen (DOS/Rate#515).
async function cumulativeLayoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 500);
      })
  );
}

for (const viewport of [
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'phone', width: 375, height: 812 },
]) {
  test(`the home page does not shift on load (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await cumulativeLayoutShift(page)).toBeLessThan(0.1);
  });
}

test('the phone header keeps the menu button on screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.locator('.nav-toggle');
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  // Retried until hydration has attached the click handler; clicks only
  // while closed, so a slow first open is not undone by the retry.
  const wrapper = page.locator('.nav-menus-wrapper');
  await expect(async () => {
    if (!/nav-menus-wrapper-open/.test((await wrapper.getAttribute('class')) ?? '')) {
      await toggle.click();
    }
    await expect(wrapper).toHaveClass(
      /nav-menus-wrapper-open/,
      { timeout: 500 }
    );
  }).toPass();
});

test('at exactly 992px only the desktop menu shows', async ({ page }) => {
  await page.setViewportSize({ width: 992, height: 768 });
  await page.goto('/');
  await expect(page.locator('#navigation .mobile_nav')).toBeHidden();
  await expect(page.locator('#navigation .nav-toggle')).toBeHidden();
  // The menu items float, so check a link rather than the zero-height list.
  await expect(
    page.locator('#navigation .nav-menu a[href="/leaderboard"]')
  ).toBeVisible();
});

test('the phone menu works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const menu = page.locator('#rate-nav-menu');
  const toggle = page.locator('.nav-toggle');
  const focusInMenu = () =>
    page.evaluate(() =>
      Boolean(document.activeElement?.closest('#rate-nav-menu'))
    );

  // Closed: Tab never lands on the off-screen links (DOS/Rate#523).
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInMenu()).toBe(false);
  }

  // Space opens it without scrolling and moves focus inside; Escape closes
  // it and gives focus back to the toggle. Retried until hydration.
  // Back at the top, where the header is static, so only Space could
  // scroll (a div role=button scrolled a whole screen).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(async () => {
    if (!/nav-menus-wrapper-open/.test((await menu.getAttribute('class')) ?? '')) {
      await toggle.focus();
      await page.keyboard.press('Space');
    }
    await expect(menu).toHaveClass(/nav-menus-wrapper-open/, { timeout: 500 });
  }).toPass();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await focusInMenu()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
  await expect(toggle).toBeFocused();

  // The hamburger lines stay at the top-left of the 30x30 button, as with
  // the div it replaced (a button centers its content).
  const icon = await toggle.evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    return {
      top: parseFloat(before.top),
      left: parseFloat(before.left),
      width: parseFloat(before.width),
      box: el.getBoundingClientRect().width,
    };
  });
  expect(icon.top).toBe(7);
  expect(icon.left + icon.width).toBeLessThanOrEqual(icon.box);
});
