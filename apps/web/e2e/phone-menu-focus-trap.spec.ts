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
  const { menu } = await openMenu(page);
  // The page shows to the right of the 320px drawer. The URL must not
  // change: a navigation would remount the navbar closed and pass for the
  // wrong reason.
  const url = page.url();
  await page.mouse.click(370, 600);
  await expect(menu).not.toHaveClass(/nav-menus-wrapper-open/);
  await expect(page).toHaveURL(url);
});
