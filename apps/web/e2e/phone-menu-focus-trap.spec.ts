import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// With the phone menu open, Tab and Shift+Tab cycle inside it, close button
// included; before the fix about half the presses landed on the page behind
// the drawer (DOS/Rate#1098).
async function openMenu(page: Page) {
  const menu = page.locator('#rate-nav-menu');
  const toggle = page.locator('.nav-toggle');
  // Retried until hydration has attached the click handler.
  await expect(async () => {
    if (
      !/nav-menus-wrapper-open/.test((await menu.getAttribute('class')) ?? '')
    ) {
      await toggle.click();
    }
    await expect(menu).toHaveClass(/nav-menus-wrapper-open/, { timeout: 500 });
  }).toPass();
  return { menu, toggle };
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const menu = document.getElementById('rate-nav-menu');
    const box = el?.getBoundingClientRect();
    const view = menu?.getBoundingClientRect();
    return {
      inMenu: Boolean(el?.closest('#rate-nav-menu')),
      isClose: Boolean(el?.matches('.nav-menus-wrapper-close-button')),
      // The drawer scrolls on short screens: the focused item must be in
      // its visible part.
      inView: Boolean(
        box && view && box.top >= view.top - 1 && box.bottom <= view.bottom + 1
      ),
      label: el ? `${el.tagName} ${el.textContent?.trim() ?? ''}` : 'none',
    };
  });

// The non-ignored nodes of Chromium's accessibility tree, as "role:name".
// Playwright's role locators do not drop inert content, so ask the browser.
async function accessibleNodes(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  return nodes
    .filter((n) => !n.ignored)
    .map((n) => `${n.role?.value ?? ''}:${n.name?.value ?? ''}`);
}

// With the phone menu open, screen readers no longer reach the page behind
// the drawer (DOS/Rate#1102).
test('the page behind the open phone menu is inert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const inertCount = () =>
    page.evaluate(() => document.querySelectorAll('[inert]').length);
  const before = await accessibleNodes(page);
  expect(before).toContain('main:');
  expect(before).toContain('contentinfo:');
  const inertBefore = await inertCount();

  const { menu, toggle } = await openMenu(page);
  const open = await accessibleNodes(page);
  expect(open).not.toContain('main:');
  expect(open).not.toContain('contentinfo:');
  // Only the menu and its toggle stay live.
  expect(
    await page.evaluate(() => {
      const menu = document.getElementById('rate-nav-menu')!;
      const toggle = document.querySelector('.nav-toggle')!;
      const live = [...document.querySelectorAll('a[href], button')].filter(
        (el) => !el.closest('[inert]')
      );
      return {
        toggleLive: live.includes(toggle),
        outside: live
          .filter((el) => el !== toggle && !menu.contains(el))
          .map((el) => el.outerHTML.slice(0, 80)),
      };
    })
  ).toEqual({ toggleLive: true, outside: [] });

  // a11y.spec.ts scans the closed page; this covers the open menu.
  const { violations } = await new AxeBuilder({ page })
    .include('#navigation')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.impact} ${v.id}`)).toEqual([]);

  // Escape removes inert and hands focus back to the toggle.
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
  await expect(toggle).toBeFocused();
  expect(await inertCount()).toBe(inertBefore);
  expect(await accessibleNodes(page)).toContain('main:');
});

for (const viewport of [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
]) {
  test(`keyboard focus stays inside the open phone menu (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const { menu, toggle } = await openMenu(page);

    // More presses than the menu has stops, so each direction wraps.
    for (const key of ['Tab', 'Shift+Tab']) {
      let sawClose = false;
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press(key);
        const state = await focused(page);
        expect(state.inMenu, `${key} #${i + 1} moved to ${state.label}`).toBe(
          true
        );
        expect(state.inView, `${key} #${i + 1}: ${state.label} in view`).toBe(
          true
        );
        sawClose ||= state.isClose;
      }
      expect(sawClose, `${key} reaches the close button`).toBe(true);
    }

    // Closing still hands focus back to the toggle.
    await menu.locator('.nav-menus-wrapper-close-button').focus();
    await page.keyboard.press('Enter');
    await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
    await expect(toggle).toBeFocused();
  });
}

test('a tap beside the open phone menu closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const { menu, toggle } = await openMenu(page);
  // The page shows to the right of the 320px drawer. The URL must not
  // change: a navigation would remount the navbar closed and pass for the
  // wrong reason.
  const url = page.url();
  await page.mouse.click(370, 600);
  await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
  await expect(page).toHaveURL(url);
  await expect(toggle).toBeFocused();
});

test('a drag out of or into the open phone menu keeps it open', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const { menu } = await openMenu(page);
  for (const [from, to] of [
    [160, 370],
    [370, 160],
  ] as const) {
    await page.mouse.move(from, 800);
    await page.mouse.down();
    await page.mouse.move(to, 800, { steps: 5 });
    await page.mouse.up();
    await expect(menu).toHaveClass(/nav-menus-wrapper-open/);
  }
});

// After a click on a blank spot in the drawer, Tab goes on from that spot
// and still wraps inside the menu (DOS/Rate#1102).
test('Tab after a click on a blank spot stays in the phone menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenu(page);
  // The bottom of the drawer, below its last item.
  const spot = { x: 160, y: 835 };
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, spot)
  ).toBe('rate-nav-menu');
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.mouse.click(spot.x, spot.y);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      'BODY'
    );
    await page.keyboard.press(key);
    const state = await focused(page);
    expect(state.inMenu, `${key} moved to ${state.label}`).toBe(true);
    // Past the last item, Tab wraps to the close button, the first stop.
    if (key === 'Tab') expect(state.isClose).toBe(true);
  }
});

// Content added while the menu is open is inert too, and closing the menu
// clears only the inert it set: an element that other code made inert,
// before or while the menu was open, stays inert (DOS/Rate#1110).
test('the open phone menu covers late content and keeps foreign inert', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Inert before the menu opens: not ours to clear.
  await page.evaluate(() => {
    document.querySelector('footer')!.inert = true;
  });
  const { menu } = await openMenu(page);

  await page.evaluate(() => {
    const toast = document.createElement('button');
    toast.id = 'late-toast';
    toast.textContent = 'Late toast';
    document.body.append(toast);
    const extra = document.createElement('a');
    extra.id = 'late-nav-link';
    extra.href = '/late';
    extra.textContent = 'Late nav link';
    document.getElementById('rate-nav-menu')!.parentElement!.append(extra);
    // Other code makes an element inert that the menu already holds.
    const held = [...document.querySelectorAll<HTMLElement>('[inert]')].find(
      (el) => el.contains(document.querySelector('main'))
    )!;
    held.dataset.testHeld = '';
    held.inert = true;
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        ['late-toast', 'late-nav-link'].map((id) =>
          Boolean(document.getElementById(id)!.closest('[inert]'))
        )
      )
    )
    .toEqual([true, true]);
  expect(await accessibleNodes(page)).not.toContain('button:Late toast');

  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
  expect(
    await page.evaluate(() => ({
      toast: document.getElementById('late-toast')!.inert,
      link: document.getElementById('late-nav-link')!.inert,
      held: document.querySelector<HTMLElement>('[data-test-held]')!.inert,
      footer: document.querySelector('footer')!.inert,
    }))
  ).toEqual({ toast: false, link: false, held: true, footer: true });
});

// At 320px (supported since DOS/Rate#809) the drawer leaves the toggle in
// view, so the live toggle is never a hidden button (DOS/Rate#1110).
test('the open phone menu leaves the toggle visible at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const { menu, toggle } = await openMenu(page);
  // The drawer slides in over 0.8s.
  await expect
    .poll(async () => (await menu.boundingBox())?.x)
    .toBeGreaterThanOrEqual(0);
  const drawer = (await menu.boundingBox())!;
  const button = (await toggle.boundingBox())!;
  expect(drawer.x + drawer.width).toBeLessThanOrEqual(button.x);
  expect(
    await toggle.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return (
        document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        ) === el
      );
    })
  ).toBe(true);

  // Escape hands focus back to the toggle, which is on screen.
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toBeInViewport();
});
