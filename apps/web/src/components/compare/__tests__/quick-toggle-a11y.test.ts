import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';

import csMessages from '../../../../locales/cs.json';
import enMessages from '../../../../locales/en.json';
import viMessages from '../../../../locales/vi.json';
import { pickClientMessages } from '../../../lib/client-messages';
import { formatPriceVnd } from '../../../lib/locale-format';
import {
  clearCompareTray,
  getCompareTray,
  normalizeTrayItem,
  parseTrayCategorySlugFromPath,
  sanitizeTrayPriceVnd,
  setCompareTray,
  toggleCompareTrayItem,
} from '../compare-tray';
import CompareTrayBar, {
  buildCompareTrayHref,
  formatCompareTrayPriceDisplay,
  formatCompareTrayPriceVnd,
} from '../CompareTrayBar';
import CompareQuickToggle, {
  formatCompareQuickToggleAriaLabel,
  resolveCompareQuickToggleA11y,
} from '../CompareQuickToggle';
import WatchlistQuickToggle, {
  formatWatchlistQuickToggleAriaLabel,
  resolveWatchlistQuickToggleA11y,
} from '../../watchlist/WatchlistQuickToggle';

// WCAG 2.5.3 Label in Name (axe-core 4.14 label-content-name-mismatch,
// DOS/Rate#1666): aria-label must contain the active visible button text
// tokens as a contiguous subsequence after NFKD normalization and stripping
// parentheticals, and toggle buttons must expose aria-pressed across states.

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, '../../../..');

function removeParentheticals(value: string): string {
  let prev: string;
  let current = value;
  do {
    prev = current;
    current = current.replace(/\([^()]*\)/g, '');
  } while (current !== prev);
  return current;
}

function axeCurateTokens(value: string): string[] {
  const normalized = removeParentheticals(
    value.toLowerCase().normalize('NFKD')
  ).replace(/[^\p{L}\p{N}]+/gu, ' ');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const tokens: string[] = [];
  for (const part of segmenter.segment(normalized)) {
    const trimmed = part.segment.trim();
    if (trimmed) tokens.push(trimmed);
  }
  return tokens;
}

function isAxeLabelContainedInName(
  visibleText: string,
  accessibleName: string
): boolean {
  const needle = axeCurateTokens(visibleText);
  if (needle.length === 0) return true;
  const haystack = axeCurateTokens(accessibleName);
  if (haystack.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => word === haystack[i + j])) {
      return true;
    }
  }
  return false;
}

const localeCatalogs = {
  vi: viMessages,
  en: enMessages,
  cs: csMessages,
} as const;

const sampleProducts = [
  'iPhone 16 Pro Max',
  'Samsung Galaxy S25 Ultra (5G, 256GB)',
] as const;

const locales = ['vi', 'en', 'cs'] as const;

for (const locale of locales) {
  const fullMessages = localeCatalogs[locale];
  const sharedClientMessages = pickClientMessages(
    fullMessages as unknown as Record<string, unknown>
  );
  const tCompare = createTranslator({
    locale,
    messages: sharedClientMessages as unknown as typeof fullMessages,
    namespace: 'compare',
  });
  const tWatchlist = createTranslator({
    locale,
    messages: sharedClientMessages as unknown as typeof fullMessages,
    namespace: 'watchlist',
  });

  for (const itemName of sampleProducts) {
    for (const compact of [true, false] as const) {
      const compareCases = [
        {
          name: 'idle',
          selected: false,
          limitAlert: false,
          expectedLabel: compact
            ? fullMessages.compare.quickToggleShortAdd
            : fullMessages.compare.quickToggleAddBtn,
        },
        {
          name: 'selected',
          selected: true,
          limitAlert: false,
          expectedLabel: compact
            ? fullMessages.compare.quickToggleShortSelected
            : fullMessages.compare.quickToggleSelectedBtn,
        },
        {
          name: 'limitAlert',
          selected: false,
          limitAlert: true,
          expectedLabel: compact
            ? fullMessages.compare.quickToggleShortLimit
            : fullMessages.compare.quickToggleLimitBtn,
        },
        {
          name: 'selected+limitAlert',
          selected: true,
          limitAlert: true,
          expectedLabel: compact
            ? fullMessages.compare.quickToggleShortLimit
            : fullMessages.compare.quickToggleLimitBtn,
        },
      ] as const;

      for (const c of compareCases) {
        const res = resolveCompareQuickToggleA11y(tCompare, {
          compact,
          selected: c.selected,
          limitAlert: c.limitAlert,
          itemName,
        });
        assert.equal(res.visibleLabel, c.expectedLabel);
        assert.equal(res.ariaPressed, c.selected);
        assert.equal(res.ariaLabel, `${c.expectedLabel}: ${itemName}`);
        assert.ok(axeCurateTokens(res.visibleLabel).length > 0);
        assert.equal(
          isAxeLabelContainedInName(res.visibleLabel, res.ariaLabel),
          true,
          `${locale} compare (compact=${compact}, ${c.name}): "${res.ariaLabel}" contains "${res.visibleLabel}"`
        );
        assert.equal(
          isAxeLabelContainedInName(
            res.visibleLabel,
            `${itemName} (${res.visibleLabel})`
          ),
          false,
          `${locale} compare: parenthesized visible label is stripped by axe-core 4.14`
        );
      }

      const watchlistCases = [
        {
          name: 'idle',
          watched: false,
          expectedLabel: compact
            ? fullMessages.watchlist.quickToggleShortUnwatched
            : fullMessages.watchlist.quickToggleBtnUnwatched,
        },
        {
          name: 'watched',
          watched: true,
          expectedLabel: compact
            ? fullMessages.watchlist.quickToggleShortWatched
            : fullMessages.watchlist.quickToggleBtnWatched,
        },
      ] as const;

      for (const w of watchlistCases) {
        const res = resolveWatchlistQuickToggleA11y(tWatchlist, {
          compact,
          watched: w.watched,
          itemName,
        });
        assert.equal(res.visibleLabel, w.expectedLabel);
        assert.equal(res.ariaPressed, w.watched);
        assert.equal(res.ariaLabel, `${w.expectedLabel}: ${itemName}`);
        assert.ok(axeCurateTokens(res.visibleLabel).length > 0);
        assert.equal(
          isAxeLabelContainedInName(res.visibleLabel, res.ariaLabel),
          true,
          `${locale} watchlist (compact=${compact}, ${w.name}): "${res.ariaLabel}" contains "${res.visibleLabel}"`
        );
        assert.equal(
          isAxeLabelContainedInName(
            res.visibleLabel,
            `${itemName} (${res.visibleLabel})`
          ),
          false,
          `${locale} watchlist: parenthesized visible label is stripped by axe-core 4.14`
        );
      }
    }

    // Regression guards: hardcoded idle labels fail WCAG 2.5.3 in active compact states.
    const staleCompareAria = `${fullMessages.compare.quickToggleShortAdd}: ${itemName}`;
    assert.equal(
      isAxeLabelContainedInName(
        fullMessages.compare.quickToggleShortSelected,
        staleCompareAria
      ),
      false,
      `${locale}: stale quickToggleShortAdd aria-label fails when selected`
    );
    assert.equal(
      isAxeLabelContainedInName(
        fullMessages.compare.quickToggleShortLimit,
        staleCompareAria
      ),
      false,
      `${locale}: stale quickToggleShortAdd aria-label fails when limitAlert`
    );
    const staleWatchlistAria = `${fullMessages.watchlist.quickToggleShortUnwatched}: ${itemName}`;
    assert.equal(
      isAxeLabelContainedInName(
        fullMessages.watchlist.quickToggleShortWatched,
        staleWatchlistAria
      ),
      false,
      `${locale}: stale quickToggleShortUnwatched aria-label fails when watched`
    );
  }

  // SSR render verification across compact and standard modes for two distinct cards.
  const Provider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;
  for (const compact of [true, false] as const) {
    const html = renderToStaticMarkup(
      React.createElement(
        Provider,
        {
          locale,
          messages: sharedClientMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(
          'div',
          null,
          React.createElement(CompareQuickToggle, {
            compact,
            item: {
              slug: 'iphone-16-pro-max',
              name: 'iPhone 16 Pro Max',
              brand: 'Apple',
              thumbnail: null,
              min_price: 29_990_000,
            },
          }),
          React.createElement(WatchlistQuickToggle, {
            compact,
            item: {
              slug: 'galaxy-s25-ultra',
              name: 'Galaxy S25 Ultra',
              brand: 'Samsung',
              thumbnail: null,
              min_price: 27_990_000,
            },
          })
        )
      )
    );
    const buttons = [
      ...html.matchAll(
        /<button\b([^>]*)>[\s\S]*?<span>([^<]+)<\/span>\s*<\/button>/g
      ),
    ];
    assert.equal(
      buttons.length,
      3,
      `${locale} compact=${compact} button count`
    );
    const ariaLabels = new Set<string>();
    for (const [, attrs, spanText] of buttons) {
      const ariaMatch = attrs!.match(/\baria-label="([^"]+)"/);
      const pressedMatch = attrs!.match(/\baria-pressed="([^"]+)"/);
      assert.ok(ariaMatch, `${locale} button must emit aria-label`);
      assert.equal(pressedMatch?.[1], 'false');
      ariaLabels.add(ariaMatch[1]!);
      assert.equal(
        isAxeLabelContainedInName(spanText!, ariaMatch[1]!),
        true,
        `${locale} rendered aria-label "${ariaMatch[1]}" contains "${spanText}"`
      );
    }
    assert.equal(ariaLabels.size, 3, 'distinct accessible names across cards');
  }
}

// Control-character, empty-fragment, and non-string itemName edge cases.
assert.equal(
  formatCompareQuickToggleAriaLabel('  Compare\u0000 ', ' iPhone\r\n16 '),
  'Compare: iPhone 16'
);
assert.equal(formatCompareQuickToggleAriaLabel('Compare', '   '), 'Compare');
assert.equal(formatCompareQuickToggleAriaLabel('Compare', null), 'Compare');
assert.equal(
  formatCompareQuickToggleAriaLabel('Compare', undefined),
  'Compare'
);
assert.equal(
  formatWatchlistQuickToggleAriaLabel('   ', '  Galaxy\u0007 S25 '),
  'Galaxy S25'
);
assert.equal(
  formatWatchlistQuickToggleAriaLabel('Watch price', null),
  'Watch price'
);
assert.equal(
  formatWatchlistQuickToggleAriaLabel('Watch price', undefined),
  'Watch price'
);

// Source-level guards ensure both compact and standard branches wire ariaLabel + ariaPressed.
const compareSrc = fs.readFileSync(
  path.join(webRoot, 'src/components/compare/CompareQuickToggle.tsx'),
  'utf8'
);
const watchlistSrc = fs.readFileSync(
  path.join(webRoot, 'src/components/watchlist/WatchlistQuickToggle.tsx'),
  'utf8'
);
assert.equal([...compareSrc.matchAll(/aria-label=\{ariaLabel\}/g)].length, 2);
assert.equal(
  [...compareSrc.matchAll(/aria-pressed=\{ariaPressed\}/g)].length,
  2
);
assert.doesNotMatch(compareSrc, /aria-label=\{`\$\{t\('quickToggleShortAdd'\)/);
assert.equal([...watchlistSrc.matchAll(/aria-label=\{ariaLabel\}/g)].length, 2);
assert.equal(
  [...watchlistSrc.matchAll(/aria-pressed=\{ariaPressed\}/g)].length,
  2
);
assert.doesNotMatch(
  watchlistSrc,
  /aria-label=\{`\$\{t\('quickToggleShortUnwatched'\)/
);

// DOS/Rate#1728: parseTrayCategorySlugFromPath & normalizeTrayItem categoryPath precedence.
assert.equal(parseTrayCategorySlugFromPath('/earbuds'), 'earbuds');
assert.equal(parseTrayCategorySlugFromPath('earbuds'), 'earbuds');
assert.equal(parseTrayCategorySlugFromPath('/earbuds/'), 'earbuds');
assert.equal(
  parseTrayCategorySlugFromPath('  /SMARTWATCHES/?sort=score#top  '),
  'smartwatches'
);
assert.equal(
  parseTrayCategorySlugFromPath('/laptops/asus-expertbook-b5'),
  'laptops'
);
assert.equal(parseTrayCategorySlugFromPath('/en/tablets'), 'tablets');
assert.equal(
  parseTrayCategorySlugFromPath('/cs/earbuds/marshall-minor-iv?ref=1'),
  'earbuds'
);
assert.equal(
  parseTrayCategorySlugFromPath('https://evil.example/earbuds'),
  undefined
);
assert.equal(parseTrayCategorySlugFromPath('//earbuds/foo'), undefined);
assert.equal(parseTrayCategorySlugFromPath('/earbuds/../laptops'), undefined);
assert.equal(parseTrayCategorySlugFromPath('/earbuds/%2e%2e'), undefined);
assert.equal(parseTrayCategorySlugFromPath('/earbuds\\laptops'), undefined);
assert.equal(parseTrayCategorySlugFromPath('/unknown-cat'), undefined);
assert.equal(parseTrayCategorySlugFromPath(''), undefined);
assert.equal(parseTrayCategorySlugFromPath('/'), undefined);
assert.equal(parseTrayCategorySlugFromPath(null), undefined);

const nonSmartphonePathCases = [
  ['marshall-minor-iv', 'Marshall Minor IV', 'Marshall', '/earbuds', 'earbuds'],
  ['jbl-live-pro-2', 'JBL Live Pro 2', 'JBL', '/earbuds/', 'earbuds'],
  [
    'ticwatch-pro-5',
    'TicWatch Pro 5',
    'Mobvoi',
    '/smartwatches?sort=score#top',
    'smartwatches',
  ],
  ['asus-expertbook-b5', 'ASUS ExpertBook B5', 'ASUS', '/laptops', 'laptops'],
  ['nokia-t21', 'Nokia T21', 'Nokia', '/tablets', 'tablets'],
] as const;

for (const [
  slug,
  name,
  brand,
  categoryPath,
  expectedCat,
] of nonSmartphonePathCases) {
  const normalized = normalizeTrayItem({
    slug,
    name,
    brand,
    thumbnail: null,
    min_price: 0,
    categoryPath,
  });
  assert.equal(normalized.categorySlug, expectedCat, `${name} categorySlug`);
  assert.equal(normalized.categoryPath, `/${expectedCat}`);
}

assert.equal(
  normalizeTrayItem({
    slug: 'marshall-minor-iv',
    name: 'Marshall Minor IV',
    brand: 'Marshall',
    thumbnail: null,
    min_price: 3_290_000,
    categorySlug: 'tablets',
    categoryPath: '/earbuds',
  }).categorySlug,
  'tablets'
);
assert.equal(
  normalizeTrayItem({
    slug: 'marshall-minor-iv',
    name: 'Marshall Minor IV',
    brand: 'Marshall',
    thumbnail: null,
    min_price: 3_290_000,
    categorySlug: 'invalid-cat' as never,
    categoryPath: '/earbuds',
  }).categorySlug,
  'earbuds'
);
assert.equal(
  'categoryPath' in
    normalizeTrayItem({
      slug: 'iphone-16-pro',
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      thumbnail: null,
      min_price: 25_990_000,
      categoryPath: undefined,
    }),
  false
);

// Stateful tray preservation across non-smartphone categoryPath toggles (#1728).
{
  const originalWindowDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'window'
  );
  const store = new Map<string, string>();
  const mockTarget = new EventTarget();
  const mockWindow = Object.assign(mockTarget, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
    writable: true,
  });

  try {
    const sameCategoryPairs = [
      {
        expectedCat: 'earbuds',
        first: {
          slug: 'airpods-pro-2',
          name: 'AirPods Pro 2',
          brand: 'Apple',
          thumbnail: null,
          min_price: 5_490_000,
          categoryPath: '/earbuds',
        },
        second: {
          slug: 'marshall-minor-iv',
          name: 'Marshall Minor IV',
          brand: 'Marshall',
          thumbnail: null,
          min_price: 0,
          categoryPath: '/earbuds',
        },
      },
      {
        expectedCat: 'smartwatches',
        first: {
          slug: 'apple-watch-series-10',
          name: 'Apple Watch Series 10',
          brand: 'Apple',
          thumbnail: null,
          min_price: 10_990_000,
          categoryPath: '/smartwatches',
        },
        second: {
          slug: 'ticwatch-pro-5',
          name: 'TicWatch Pro 5',
          brand: 'Mobvoi',
          thumbnail: null,
          min_price: 7_490_000,
          categoryPath: '/smartwatches',
        },
      },
      {
        expectedCat: 'laptops',
        first: {
          slug: 'macbook-air-m3',
          name: 'MacBook Air M3',
          brand: 'Apple',
          thumbnail: null,
          min_price: 25_990_000,
          categoryPath: '/laptops',
        },
        second: {
          slug: 'asus-expertbook-b5',
          name: 'ASUS ExpertBook B5',
          brand: 'ASUS',
          thumbnail: null,
          min_price: 0,
          categoryPath: '/laptops',
        },
      },
      {
        expectedCat: 'tablets',
        first: {
          slug: 'ipad-air-m2',
          name: 'iPad Air M2',
          brand: 'Apple',
          thumbnail: null,
          min_price: 16_990_000,
          categoryPath: '/tablets',
        },
        second: {
          slug: 'nokia-t21',
          name: 'Nokia T21',
          brand: 'Nokia',
          thumbnail: null,
          min_price: 3_990_000,
          categoryPath: '/tablets',
        },
      },
    ] as const;

    for (const pair of sameCategoryPairs) {
      clearCompareTray();
      const firstRes = toggleCompareTrayItem(pair.first);
      assert.equal(firstRes.added, true);
      assert.equal(firstRes.items.length, 1);
      assert.equal(firstRes.items[0]?.categorySlug, pair.expectedCat);

      const secondRes = toggleCompareTrayItem(pair.second);
      assert.equal(secondRes.added, true);
      assert.equal(Boolean(secondRes.categorySwitched), false);
      assert.deepEqual(
        secondRes.items.map((x) => x.slug),
        [pair.first.slug, pair.second.slug],
        `${pair.expectedCat} tray must preserve existing item when categoryPath matches`
      );
      assert.deepEqual(
        getCompareTray().map((x) => x.categorySlug),
        [pair.expectedCat, pair.expectedCat]
      );
    }

    // Cross-category guard still switches cleanly between smartphones and earbuds.
    setCompareTray([
      {
        slug: 'iphone-16-pro',
        name: 'iPhone 16 Pro',
        brand: 'Apple',
        thumbnail: null,
        min_price: 25_990_000,
        categoryPath: '/smartphones',
      },
    ]);
    const switched = toggleCompareTrayItem({
      slug: 'marshall-minor-iv',
      name: 'Marshall Minor IV',
      brand: 'Marshall',
      thumbnail: null,
      min_price: 3_290_000,
      categoryPath: '/earbuds',
    });
    assert.equal(switched.categorySwitched, true);
    assert.deepEqual(
      switched.items.map((x) => [x.slug, x.categorySlug]),
      [['marshall-minor-iv', 'earbuds']]
    );
    clearCompareTray();
  } finally {
    if (originalWindowDesc) {
      Object.defineProperty(globalThis, 'window', originalWindowDesc);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
}

// CompareTrayBar price display ("-" vs "0 ₫"), cat= href, and aria-hidden remove glyph (#1728).
assert.equal(formatCompareTrayPriceVnd(-50_000), '0 ₫');
assert.equal(formatCompareTrayPriceVnd(0), '0 ₫');
assert.equal(formatCompareTrayPriceVnd(25_990_000, 'vi'), '25.990.000 ₫');
assert.equal(sanitizeTrayPriceVnd(' 25990000 '), 25_990_000);
assert.equal(formatCompareTrayPriceDisplay(' 25990000 ', 'vi'), '25.990.000 ₫');
assert.equal(sanitizeTrayPriceVnd('25\n990000'), 0);
assert.equal(sanitizeTrayPriceVnd('25\u0000990000'), 0);

for (const unpriced of [
  0,
  -50_000,
  null,
  undefined,
  '',
  '0x100000',
  '25\n990000',
  '25\u0000990000',
  true,
  Number.NaN,
  9_000_000_000,
]) {
  assert.equal(formatCompareTrayPriceDisplay(unpriced, 'vi'), '-');
  assert.equal(formatCompareTrayPriceDisplay(unpriced, 'en'), '-');
  assert.equal(formatCompareTrayPriceDisplay(unpriced, 'cs'), '-');
}

assert.equal(
  buildCompareTrayHref([
    {
      slug: 'marshall-minor-iv',
      name: 'Marshall Minor IV',
      brand: 'Marshall',
      thumbnail: null,
      min_price: 0,
      categoryPath: '/earbuds',
    },
    {
      slug: 'airpods-pro-2',
      name: 'AirPods Pro 2',
      brand: 'Apple',
      thumbnail: null,
      min_price: 5_490_000,
      categoryPath: '/earbuds',
    },
  ]),
  '/compare?cat=earbuds&slugs=marshall-minor-iv,airpods-pro-2'
);
assert.equal(
  buildCompareTrayHref([
    {
      slug: 'ticwatch-pro-5',
      name: 'TicWatch Pro 5',
      brand: 'Mobvoi',
      thumbnail: null,
      min_price: 7_490_000,
      categoryPath: '/smartwatches',
    },
  ]),
  '/compare?cat=smartwatches&slugs=ticwatch-pro-5'
);

const mockTrayRouter: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  bfcacheId: 'test',
};
const TrayIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
  children?: React.ReactNode;
}>;

for (const locale of locales) {
  const fullMessages = localeCatalogs[locale];
  const sharedClientMessages = pickClientMessages(
    fullMessages as unknown as Record<string, unknown>
  );
  const trayHtml = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockTrayRouter },
      React.createElement(
        TrayIntlProvider,
        {
          locale,
          messages: sharedClientMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(CompareTrayBar, {
          initialItems: [
            {
              slug: 'marshall-minor-iv',
              name: 'Marshall Minor IV',
              brand: 'Marshall',
              thumbnail: null,
              min_price: 0,
              categoryPath: '/earbuds',
            },
            {
              slug: 'airpods-pro-2',
              name: 'AirPods Pro 2',
              brand: 'Apple',
              thumbnail: null,
              min_price: 5_490_000,
              categoryPath: '/earbuds',
            },
          ],
        })
      )
    )
  );

  assert.match(
    trayHtml,
    /href="\/compare\?cat=earbuds&amp;slugs=marshall-minor-iv,airpods-pro-2"/,
    `${locale} CompareTrayBar link includes cat=earbuds and slugs`
  );
  assert.doesNotMatch(
    trayHtml,
    />0[\s\u00a0]*₫</,
    `${locale} CompareTrayBar must not render "0 ₫" for unpriced items`
  );
  assert.equal(
    trayHtml.includes(`>${formatPriceVnd(0, locale)}<`),
    false,
    `${locale} CompareTrayBar omits formatted zero VND price cell`
  );
  assert.match(
    trayHtml,
    />-</,
    `${locale} CompareTrayBar renders "-" for unpriced Marshall Minor IV`
  );
  assert.equal(
    trayHtml.includes(formatPriceVnd(5_490_000, locale)),
    true,
    `${locale} CompareTrayBar renders formatted price for AirPods Pro 2`
  );
  assert.equal(
    [
      ...trayHtml.matchAll(
        /<button\b[^>]*rate-remove-target[^>]*><span aria-hidden="true">×<\/span><\/button>/g
      ),
    ].length,
    2,
    `${locale} CompareTrayBar wraps remove button × inside <span aria-hidden="true">`
  );
}

console.log('quick-toggle-a11y: ok');
