import { expect, test, type Locator, type Page } from '@playwright/test';

// On the light theme the obsidian surfaces turn light (DOS/Rate#1435). A
// control drawn with light ink for the dark ground then vanished: the versus
// custom-weights button and the compare tray's title, collapse and remove
// buttons were near-white on a near-white ground (DOS/Rate#1521). axe missed
// them, so measure each control's text against the ground it sits on, in
// both themes: 4.5:1 (WCAG 2.1 1.4.3).
const VERSUS =
  '/compare/iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb';

const trayItems = [
  ['iphone-16-pro-max-256gb', 'iPhone 16 Pro Max 256GB', 28990000],
  ['samsung-galaxy-s25-ultra-256gb', 'Galaxy S25 Ultra 256GB', 26490000],
].map(([slug, name, min_price]) => ({
  slug,
  name,
  min_price,
  thumbnail: null,
  brand: '',
}));

type Measure = { text: string; ratio: number; color: string; ground: string };

// The text colour of each visible control against the ground it sits on.
// Translucent grounds are composited down to the first opaque one (white if
// none); a gradient counts as its lightest stop, the worst case for light
// ink. The text's own alpha and its opacity chain are composited over that
// ground too, so a faded label is measured as it is seen.
async function contrastOf(controls: Locator): Promise<Measure[]> {
  return controls.evaluateAll((els) => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba[] =>
      (css.match(/rgba?\([^)]+\)/g) ?? []).map((m) => {
        const [r = 0, g = 0, b = 0, a = 1] = m
          .replace(/rgba?\(|\)/g, '')
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(Number);
        return [r, g, b, a];
      });
    const lum = ([r, g, b]: Rgba) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const over = (top: Rgba, base: Rgba, alpha = top[3]): Rgba => [
      top[0] * alpha + base[0] * (1 - alpha),
      top[1] * alpha + base[1] * (1 - alpha),
      top[2] * alpha + base[2] * (1 - alpha),
      1,
    ];
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        // Background layers from the control outwards, up to an opaque one.
        const layers: Rgba[] = [];
        let opacity = 1;
        for (let n: Element | null = el; n; n = n.parentElement) {
          const s = getComputedStyle(n);
          opacity *= Number(s.opacity);
          const stops = parse(s.backgroundImage).filter((c) => c[3] > 0);
          const fill = parse(s.backgroundColor).filter((c) => c[3] > 0);
          const layer =
            stops.sort((a, b) => lum(b) - lum(a))[0] ?? fill[0] ?? null;
          if (!layer) continue;
          layers.push(layer);
          if (layer[3] >= 1) break;
        }
        let ground: Rgba = [255, 255, 255, 1];
        for (const layer of layers.reverse()) ground = over(layer, ground);
        const color = getComputedStyle(el).color;
        const fg: Rgba = parse(color)[0] ?? [0, 0, 0, 1];
        const seen = over(fg, ground, fg[3] * opacity);
        const a = lum(seen);
        const b = lum(ground);
        return {
          text: (el.textContent ?? el.getAttribute('aria-label') ?? '')
            .trim()
            .slice(0, 40),
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          color,
          ground: `rgb(${ground
            .slice(0, 3)
            .map((v) => Math.round(v))
            .join(', ')})`,
        };
      });
  });
}

// Controls fade their colour in: wait until it has settled.
async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

function expectReadable(measures: Measure[], where: string) {
  const low = measures.filter((m) => m.ratio < 4.5);
  expect(
    low.map(
      (m) => `${m.text}: ${m.color} on ${m.ground} = ${m.ratio.toFixed(2)}:1`
    ),
    `${where}: controls below 4.5:1`
  ).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test('versus scoreboard and matchup controls are readable', async ({
      page,
    }) => {
      const res = await page.goto(VERSUS);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute(
        'data-bs-theme',
        colorScheme
      );
      await settled(page);

      const scoreboard = page.locator('.rate-scoreboard-dark').first();
      // The custom-weights toggle in its inactive state, the one axe missed.
      const weights = scoreboard.getByRole('button', {
        name: 'Tùy chỉnh trọng số',
      });
      await expect(weights.first()).toBeVisible();
      await expect(weights.first()).toHaveAttribute('aria-expanded', 'false');
      const weightMeasures = await contrastOf(weights);
      expect(weightMeasures.length).toBeGreaterThan(0);
      expectReadable(weightMeasures, 'custom-weights button');

      const controls = await contrastOf(
        page.locator(
          '.rate-scoreboard-dark :is(button, select), form:has(select) :is(select, button:not([disabled]))'
        )
      );
      expect(controls.length, 'controls measured').toBeGreaterThan(3);
      expectReadable(controls, 'versus controls');

      // The matchup selects follow the theme: no obsidian field on light.
      const selects = page.locator('form:has(select) select');
      await expect(selects).toHaveCount(2);
      for (const select of await selects.all()) {
        const ground = await select.evaluate(
          (el) => getComputedStyle(el).backgroundColor
        );
        const [r = 0, g = 0, b = 0] = (ground.match(/\d+/g) ?? []).map(Number);
        const light = (r + g + b) / 3 > 128;
        expect(light, `matchup select ground ${ground}`).toBe(
          colorScheme === 'light'
        );
      }
    });

    test('compare tray title and buttons are readable', async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('rate_compare_tray_v1', value);
      }, JSON.stringify(trayItems));
      await page.goto('/deals');
      const tray = page.locator('div.position-fixed.bottom-0 .card').first();
      await expect(tray.locator('#rate-compare-tray-items')).toBeVisible();
      await settled(page);
      const measures = await contrastOf(
        tray.locator(':is(button, a, .fw-bold)')
      );
      // Title, collapse, clear, compare and one remove button per item.
      expect(measures.length).toBeGreaterThanOrEqual(5);
      expectReadable(measures, 'compare tray');
    });
  });
}
