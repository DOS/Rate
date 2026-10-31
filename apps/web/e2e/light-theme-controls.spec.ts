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

// The text colour of each visible control against the ground it sits on,
// composited the way the browser paints it: every element from <html> down
// to the control lays its background colour, then its gradient (counted as
// its lightest stop, the worst case for light ink), over what is below; an
// element's opacity fades its whole group (ground and text) into the
// backdrop. The text's own alpha is composited last.
async function contrastOf(controls: Locator): Promise<Measure[]> {
  return controls.evaluateAll((els) => {
    type Rgb = [number, number, number];
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
    const lum = ([r, g, b]: Rgb | Rgba) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const mix = (base: Rgb, top: Rgb | Rgba, alpha: number): Rgb => [
      top[0] * alpha + base[0] * (1 - alpha),
      top[1] * alpha + base[1] * (1 - alpha),
      top[2] * alpha + base[2] * (1 - alpha),
    ];
    type Node = { fill?: Rgba; stop?: Rgba; opacity: number };
    const paint = (path: Node[], text: Rgba | null): Rgb => {
      const render = (i: number, backdrop: Rgb): Rgb => {
        const node = path[i]!;
        let c = backdrop;
        if (node.fill) c = mix(c, node.fill, node.fill[3]);
        if (node.stop) c = mix(c, node.stop, node.stop[3]);
        const inner =
          i + 1 < path.length
            ? render(i + 1, c)
            : text
              ? mix(c, text, text[3])
              : c;
        return mix(backdrop, inner, node.opacity);
      };
      return render(0, [255, 255, 255]);
    };
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const path: Node[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) {
          const s = getComputedStyle(n);
          const stops = parse(s.backgroundImage).filter((c) => c[3] > 0);
          path.unshift({
            fill: parse(s.backgroundColor).find((c) => c[3] > 0),
            stop: stops.sort((a, b) => lum(b) - lum(a))[0],
            opacity: Number(s.opacity),
          });
        }
        const color = getComputedStyle(el).color;
        const fg = parse(color)[0] ?? [0, 0, 0, 1];
        const ground = paint(path, null);
        const seen = paint(path, fg);
        const a = lum(seen);
        const b = lum(ground);
        return {
          text: (el.textContent ?? el.getAttribute('aria-label') ?? '')
            .trim()
            .slice(0, 40),
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          color,
          ground: `rgb(${ground.map((v) => Math.round(v)).join(', ')})`,
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

      // The custom-weights toggle is not offered while no seeded product
      // has a criterion score (DOS/Rate#1556); the other controls are.
      await expect(page.locator('.rate-scoreboard-dark').first()).toBeVisible();

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
