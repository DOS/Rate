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
import type { MasterProduct } from '@repo/shared-data';

import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import { pickClientMessages } from '../client-messages';
import { EMPTY_RADAR_SIGNAL, type RadarSignal } from '../deal-radar';
import { NBSP } from '../locale-format';
import { isSizeRequiredAnswer, watchlistSizeChoices } from '../watchlist-sizes';
import {
  clearCompareTray,
  getCompareTray,
  toggleCompareTrayItem,
} from '../../components/compare/compare-tray';
import PriceWatchButton, {
  handlePriceWatchInputKeyDown,
  handlePriceWatchPopoverEscape,
  shouldDismissPriceWatchOnOutsidePress,
} from '../../components/watchlist/PriceWatchButton';
import WatchlistWorkspace, {
  buildWatchlistPortfolioMarkdown,
  formatWatchlistTargetControlAriaLabel,
  handleWatchlistInlineTargetKeyDown,
  resolveWatchlistDetailHref,
  sanitizeWatchlistMarkdownCell,
  type LiveWatchlistDeal,
} from '../../components/watchlist/WatchlistWorkspace';
import type { WatchlistItem } from '../../components/watchlist/watchlist-store';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, '../../..');

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

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const mockRouter: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  bfcacheId: 'test',
};

const IntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
  children?: React.ReactNode;
}>;

const localeCatalogs = {
  vi: viMessages,
  en: enMessages,
  cs: csMessages,
} as const;

const locales = ['vi', 'en', 'cs'] as const;

function makeMockWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

// The watchlist asks for a size when an entry names a whole Item
// (DOS/Rate#1278), and exposes WCAG-compliant target editors, categoryPath
// compare toggles, canonical Item hrefs, and localized Markdown exports
// (DOS/Rate#1693).
function main() {
  console.warn('🧪 watchlist sizes & editor a11y suite (DOS/Rate#1278, #1693)');
  const gb = (n: number) => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);

  assert.deepEqual(
    watchlistSizeChoices(
      [
        {
          slug: 'apple-iphone-16-128gb',
          name: 'Apple iPhone 16 128GB',
          variant_key: '128gb',
          storage_gb: 128,
          min_price: 19_990_000,
        },
        {
          slug: 'apple-iphone-16-1024gb',
          name: 'Apple iPhone 16 1TB',
          variant_key: '1024gb',
          storage_gb: 1024,
          min_price: 0,
        },
        // Same label as the first: one choice per label.
        {
          slug: 'apple-iphone-16-128gb-cellular',
          name: 'x',
          variant_key: '128gb-cellular',
          storage_gb: 128,
          min_price: 1,
        },
        // A sizeless variant reads its key; a bad slug is dropped.
        {
          slug: 'buds-standard',
          name: '',
          variant_key: 'standard',
          storage_gb: null,
          min_price: 3_000_000,
        },
        { slug: 'bad slug', variant_key: '256gb', storage_gb: 256 },
      ],
      gb
    ),
    [
      {
        slug: 'apple-iphone-16-128gb',
        name: 'Apple iPhone 16 128GB',
        label: '128GB',
        minPrice: 19_990_000,
      },
      {
        slug: 'apple-iphone-16-1024gb',
        name: 'Apple iPhone 16 1TB',
        label: '1TB',
        minPrice: 0,
      },
      {
        slug: 'buds-standard',
        name: 'buds-standard',
        label: 'standard',
        minPrice: 3_000_000,
      },
    ]
  );
  assert.deepEqual(watchlistSizeChoices(null, gb), []);
  assert.deepEqual(watchlistSizeChoices({ slug: 'x' }, gb), []);

  assert.equal(isSizeRequiredAnswer(422, { code: 'SIZE_REQUIRED' }), true);
  assert.equal(isSizeRequiredAnswer(422, { code: 'VALIDATION' }), false);
  assert.equal(isSizeRequiredAnswer(400, { code: 'SIZE_REQUIRED' }), false);
  assert.equal(isSizeRequiredAnswer(422, null), false);

  // 1. PriceWatchButton keyboard & outside-pointer helpers (#1693)
  {
    let prevented = 0;
    let closed = 0;
    let focused = 0;
    let saved = 0;

    assert.equal(
      handlePriceWatchPopoverEscape(
        {
          key: 'Escape',
          preventDefault: () => {
            prevented += 1;
          },
        },
        {
          closeEditor: () => {
            closed += 1;
          },
          focusTrigger: () => {
            focused += 1;
          },
        }
      ),
      true
    );
    assert.equal(prevented, 1);
    assert.equal(closed, 1);
    assert.equal(focused, 1);

    assert.equal(
      handlePriceWatchPopoverEscape(
        {
          key: 'Escape',
          defaultPrevented: true,
          preventDefault: () => {
            prevented += 1;
          },
        },
        {
          closeEditor: () => {
            closed += 1;
          },
          focusTrigger: () => {
            focused += 1;
          },
        }
      ),
      false,
      'Already defaultPrevented Escape does not run twice'
    );
    assert.equal(closed, 1);

    assert.equal(
      handlePriceWatchInputKeyDown(
        {
          key: 'Enter',
          preventDefault: () => {
            prevented += 1;
          },
        },
        {
          saveTarget: () => {
            saved += 1;
          },
          closeEditor: () => {
            closed += 1;
          },
          focusTrigger: () => {
            focused += 1;
          },
        }
      ),
      'saved'
    );
    assert.equal(saved, 1);
    assert.equal(closed, 1);

    assert.equal(
      handlePriceWatchInputKeyDown(
        {
          key: 'Escape',
          preventDefault: () => {
            prevented += 1;
          },
        },
        {
          saveTarget: () => {
            saved += 1;
          },
          closeEditor: () => {
            closed += 1;
          },
          focusTrigger: () => {
            focused += 1;
          },
        }
      ),
      'closed'
    );
    assert.equal(closed, 2);
    assert.equal(focused, 2);

    assert.equal(
      handlePriceWatchInputKeyDown(
        {
          key: 'ArrowUp',
          preventDefault: () => {
            prevented += 1;
          },
        },
        {
          saveTarget: () => {
            saved += 1;
          },
          closeEditor: () => {
            closed += 1;
          },
          focusTrigger: () => {
            focused += 1;
          },
        }
      ),
      null
    );

    const insideChild = {} as Node;
    const outsideNode = {} as Node;
    const container = {
      contains: (node: Node) =>
        node === insideChild || (node as unknown) === container,
    };
    assert.equal(
      shouldDismissPriceWatchOnOutsidePress(container, {
        target: outsideNode as unknown as EventTarget,
      }),
      true
    );
    assert.equal(
      shouldDismissPriceWatchOnOutsidePress(container, {
        target: insideChild as unknown as EventTarget,
      }),
      false
    );
    assert.equal(
      shouldDismissPriceWatchOnOutsidePress(container, {
        composedPath: () => [
          insideChild as unknown as EventTarget,
          container as unknown as EventTarget,
        ],
      }),
      false
    );
    assert.equal(
      shouldDismissPriceWatchOnOutsidePress(container, {
        composedPath: () => [outsideNode as unknown as EventTarget],
      }),
      true
    );
    assert.equal(
      shouldDismissPriceWatchOnOutsidePress(null, {
        target: outsideNode as unknown as EventTarget,
      }),
      false
    );
  }

  // 2. PriceWatchButton SSR disclosure & label htmlFor across vi/en/cs (#1693)
  for (const locale of locales) {
    const fullMessages = localeCatalogs[locale];
    const pdvMessages = pickClientMessages(
      fullMessages as unknown as Record<string, unknown>,
      'productDetail'
    );

    const closedBtnHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pdvMessages,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(PriceWatchButton, {
            slug: 'apple-iphone-16-256gb',
            name: 'Apple iPhone 16 256GB',
            brand: 'Apple',
            categoryPath: '/smartphones',
            thumbnail: null,
            currentMinPrice: 22_990_000,
          })
        )
      )
    );
    assert.match(
      closedBtnHtml,
      /<button\b[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*>/,
      `${locale}: closed PriceWatchButton trigger exposes aria-expanded="false" and aria-controls`
    );
    assert.doesNotMatch(
      closedBtnHtml,
      /<input\b[^>]*type="number"/,
      `${locale}: closed PriceWatchButton does not mount target input`
    );

    const openBtnHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: mockRouter },
        React.createElement(
          IntlProvider,
          {
            locale,
            messages: pdvMessages,
            timeZone: 'Asia/Ho_Chi_Minh',
          },
          React.createElement(PriceWatchButton, {
            slug: 'apple-iphone-16-256gb',
            name: 'Apple iPhone 16 256GB',
            brand: 'Apple',
            categoryPath: '/smartphones',
            thumbnail: null,
            currentMinPrice: 22_990_000,
            defaultOpen: true,
          })
        )
      )
    );
    const triggerMatch = openBtnHtml.match(
      /<button\b[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"[^>]*>/
    );
    assert.ok(
      triggerMatch?.[1],
      `${locale}: open PriceWatchButton trigger exposes aria-expanded="true" and aria-controls`
    );
    assert.match(
      openBtnHtml,
      new RegExp(`<div id="${escapeRegExp(triggerMatch[1])}"(\\s|>)`),
      `${locale}: open PriceWatchButton mounts popover matching aria-controls`
    );

    const expectedInputLabel = escapeHtmlAttr(
      fullMessages.watchlist.targetInputLabel
    );
    const labelMatch = openBtnHtml.match(
      new RegExp(
        `<label for="([^"]+)" class="input-group-text">${escapeRegExp(expectedInputLabel)}</label>`
      )
    );
    assert.ok(
      labelMatch?.[1],
      `${locale}: PriceWatchButton renders <label for> with targetInputLabel`
    );
    assert.match(
      openBtnHtml,
      new RegExp(
        `<input id="${escapeRegExp(labelMatch[1])}" type="number"(\\s|/)`
      ),
      `${locale}: PriceWatchButton associates <input type="number"> with <label for>`
    );
  }

  // 3. WatchlistWorkspace inline editor a11y, WCAG 2.5.3, Escape/Enter,
  //    categoryPath wiring, and canonical Item product_href (#1693, #1836)
  {
    assert.equal(
      formatWatchlistTargetControlAriaLabel(
        '  Edit target ✎\n ',
        ' Samsung\u0000 Galaxy S25 Ultra (5G, 256GB) '
      ),
      'Edit target ✎: Samsung Galaxy S25 Ultra (5G, 256GB)'
    );
    assert.equal(
      formatWatchlistTargetControlAriaLabel('Edit target ✎', '   '),
      'Edit target ✎'
    );

    let savedInline = 0;
    let cancelledInline = 0;
    let focusedEditBtn = 0;
    let preventedInline = 0;

    assert.equal(
      handleWatchlistInlineTargetKeyDown(
        {
          key: 'Escape',
          preventDefault: () => {
            preventedInline += 1;
          },
        },
        {
          saveTarget: () => {
            savedInline += 1;
          },
          cancelEdit: () => {
            cancelledInline += 1;
          },
          focusEditTrigger: () => {
            focusedEditBtn += 1;
          },
        }
      ),
      'cancelled'
    );
    assert.equal(preventedInline, 1);
    assert.equal(cancelledInline, 1);
    assert.equal(focusedEditBtn, 1);
    assert.equal(savedInline, 0);

    assert.equal(
      handleWatchlistInlineTargetKeyDown(
        {
          key: 'Enter',
          preventDefault: () => {
            preventedInline += 1;
          },
        },
        {
          saveTarget: () => {
            savedInline += 1;
          },
          cancelEdit: () => {
            cancelledInline += 1;
          },
          focusEditTrigger: () => {
            focusedEditBtn += 1;
          },
        }
      ),
      'saved'
    );
    assert.equal(savedInline, 1);
    assert.equal(cancelledInline, 1);

    assert.equal(
      handleWatchlistInlineTargetKeyDown(
        {
          key: 'Enter',
          defaultPrevented: true,
          preventDefault: () => {
            preventedInline += 1;
          },
        },
        {
          saveTarget: () => {
            savedInline += 1;
          },
          cancelEdit: () => {
            cancelledInline += 1;
          },
          focusEditTrigger: () => {
            focusedEditBtn += 1;
          },
        }
      ),
      null
    );
    assert.equal(savedInline, 1);

    // Canonical Item product_href (#1836) takes precedence when valid, with
    // safe fallback to getMasterProductHref(live) and stored categoryPath.
    const variantCatalogRow = {
      id: 'mp-mini-7',
      slug: 'apple-mini-7-128gb',
      name: 'Apple iPad mini 7 128GB',
      brand: 'Apple',
      metadata: { category_slug: 'smartphones' },
    } as unknown as MasterProduct;

    assert.equal(
      resolveWatchlistDetailHref(
        { slug: 'apple-mini-7-128gb', categoryPath: '/smartphones' },
        { product_href: '/tablets/apple-ipad-mini-7' },
        variantCatalogRow
      ),
      '/tablets/apple-ipad-mini-7',
      'Canonical Item product_href wins over stale variant master category'
    );
    assert.equal(
      resolveWatchlistDetailHref(
        { slug: 'apple-mini-7-128gb', categoryPath: '/tablets' },
        { product_href: '/accessories/not-a-catalog-category' },
        variantCatalogRow
      ),
      '/smartphones/apple-mini-7-128gb',
      'Non-catalogue product_href falls back to getMasterProductHref(live)'
    );
    for (const unsafeHref of [
      '//evil.example/phish',
      'https://evil.example/phish',
      '/smartphones/..bad',
      '/smartphones/trailing.',
      '',
    ]) {
      assert.equal(
        resolveWatchlistDetailHref(
          { slug: 'apple-mini-7-128gb', categoryPath: '/tablets' },
          { product_href: unsafeHref },
          null
        ),
        '/tablets/apple-mini-7-128gb',
        `Unsafe product_href "${unsafeHref}" falls back to stored categoryPath`
      );
    }

    // Source-level + tray guard: WatchlistWorkspace passes categoryPath to CompareQuickToggle.
    const workspaceSrc = fs.readFileSync(
      path.join(webRoot, 'src/components/watchlist/WatchlistWorkspace.tsx'),
      'utf8'
    );
    assert.match(
      workspaceSrc,
      /<CompareQuickToggle[\s\S]*?categoryPath:\s*item\.categoryPath[\s\S]*?\/>/,
      'WatchlistWorkspace passes categoryPath: item.categoryPath to <CompareQuickToggle>'
    );

    const originalWindowDesc = Object.getOwnPropertyDescriptor(
      globalThis,
      'window'
    );
    Object.defineProperty(globalThis, 'window', {
      value: makeMockWindow(),
      configurable: true,
      writable: true,
    });
    try {
      clearCompareTray();
      toggleCompareTrayItem({
        slug: 'apple-macbook-air-m4-256gb',
        name: 'Apple MacBook Air M4 256GB',
        brand: 'Apple',
        categoryPath: '/laptops',
        thumbnail: null,
        min_price: 26_990_000,
      });
      const secondLaptop = toggleCompareTrayItem({
        slug: 'asus-zenbook-14-oled',
        name: 'ASUS Zenbook 14 OLED',
        brand: 'ASUS',
        categoryPath: '/laptops',
        thumbnail: null,
        min_price: 24_490_000,
      });
      assert.equal(Boolean(secondLaptop.categorySwitched), false);
      assert.deepEqual(
        getCompareTray().map((x) => [x.slug, x.categorySlug]),
        [
          ['apple-macbook-air-m4-256gb', 'laptops'],
          ['asus-zenbook-14-oled', 'laptops'],
        ]
      );
      clearCompareTray();
    } finally {
      if (originalWindowDesc) {
        Object.defineProperty(globalThis, 'window', originalWindowDesc);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }

    const watchedLaptop: WatchlistItem = {
      slug: 'apple-macbook-air-m4-256gb',
      name: 'Apple MacBook Air M4 (13-inch, 256GB)',
      brand: 'Apple',
      categoryPath: '/laptops',
      thumbnail: null,
      priceWhenAdded: 27_990_000,
      targetPrice: 25_500_000,
      addedAt: '2026-11-20T08:00:00.000Z',
    };
    const laptopCatalogRow = {
      id: 'mp-mba-m4',
      slug: 'apple-macbook-air-m4-256gb',
      name: watchedLaptop.name,
      brand: 'Apple',
      min_price: 26_990_000,
      max_price: 28_990_000,
      merchant_count: 4,
      metadata: { category_slug: 'laptops' },
    } as unknown as MasterProduct;
    const sampleLiveDeals: Record<string, LiveWatchlistDeal> = {
      [watchedLaptop.slug]: {
        slug: watchedLaptop.slug,
        product_href: '/laptops/apple-macbook-air-m4',
        current_min_price: 26_990_000,
        current_max_price: 28_990_000,
        merchant_count: 4,
        platform_count: 3,
        offer_platforms: ['shopee', 'lazada', 'tiki'],
        best_offer: null,
      },
    };

    for (const locale of locales) {
      const fullMessages = localeCatalogs[locale];
      const watchlistMessages = pickClientMessages(
        fullMessages as unknown as Record<string, unknown>,
        'watchlist'
      );
      const visibleEditBtn = fullMessages.watchlist.editTargetBtn;
      const expectedEditAria = `${visibleEditBtn}: ${watchedLaptop.name}`;
      const expectedInputAria = `${fullMessages.watchlist.targetInputLabel}: ${watchedLaptop.name}`;

      assert.equal(
        isAxeLabelContainedInName(visibleEditBtn, expectedEditAria),
        true,
        `${locale}: editTargetBtn aria-label "${expectedEditAria}" contains visible "${visibleEditBtn}" under WCAG 2.5.3`
      );
      assert.equal(
        isAxeLabelContainedInName(
          visibleEditBtn,
          `${watchedLaptop.name} (${visibleEditBtn})`
        ),
        false,
        `${locale}: parenthesized editTargetBtn would fail axe-core 4.14`
      );

      const closedWsHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter },
          React.createElement(
            IntlProvider,
            {
              locale,
              messages: watchlistMessages,
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(WatchlistWorkspace, {
              catalogProducts: [laptopCatalogRow],
              locale,
              initialItems: [watchedLaptop],
              initialLiveDeals: sampleLiveDeals,
            })
          )
        )
      );
      assert.match(
        closedWsHtml,
        new RegExp(
          `<button\\b[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*aria-label="${escapeRegExp(escapeHtmlAttr(expectedEditAria))}"[^>]*>${escapeRegExp(escapeHtmlAttr(visibleEditBtn))}</button>`
        ),
        `${locale}: closed WatchlistWorkspace edit button exposes aria-expanded="false", aria-controls, and WCAG 2.5.3 aria-label`
      );
      assert.doesNotMatch(
        closedWsHtml,
        /<input\b[^>]*type="number"/,
        `${locale}: closed WatchlistWorkspace does not mount inline target input`
      );
      assert.match(
        closedWsHtml,
        /href="\/laptops\/apple-macbook-air-m4"/,
        `${locale}: WatchlistWorkspace card links to canonical Item product_href`
      );

      const openWsHtml = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter },
          React.createElement(
            IntlProvider,
            {
              locale,
              messages: watchlistMessages,
              timeZone: 'Asia/Ho_Chi_Minh',
            },
            React.createElement(WatchlistWorkspace, {
              catalogProducts: [laptopCatalogRow],
              locale,
              initialItems: [watchedLaptop],
              initialEditingSlug: watchedLaptop.slug,
              initialLiveDeals: sampleLiveDeals,
            })
          )
        )
      );
      const editBtnOpenMatch = openWsHtml.match(
        new RegExp(
          `<button\\b[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"[^>]*aria-label="${escapeRegExp(escapeHtmlAttr(expectedEditAria))}"[^>]*>`
        )
      );
      assert.ok(
        editBtnOpenMatch?.[1],
        `${locale}: open WatchlistWorkspace edit button exposes aria-expanded="true" and aria-controls`
      );
      assert.match(
        openWsHtml,
        new RegExp(`<div id="${escapeRegExp(editBtnOpenMatch[1])}"(\\s|>)`),
        `${locale}: open WatchlistWorkspace mounts inline editor matching aria-controls`
      );
      assert.match(
        openWsHtml,
        new RegExp(
          `<input type="number" aria-label="${escapeRegExp(escapeHtmlAttr(expectedInputAria))}"(\\s|/)`
        ),
        `${locale}: open WatchlistWorkspace names inline <input type="number"> with targetInputLabel + item.name`
      );
    }
  }

  // 4. Localized portfolio Markdown export across vi, en, and cs (#1693)
  {
    assert.equal(
      sanitizeWatchlistMarkdownCell('  1\u00a0250 zdrojů | CZ\u0000  ', 'cs'),
      `1${NBSP}250 zdrojů - CZ`,
      'Czech Markdown cell sanitizer preserves NBSP inside pluralized counts'
    );
    assert.equal(
      sanitizeWatchlistMarkdownCell('  Shop\r\nOfficial | VN\u0000  '),
      'Shop Official - VN'
    );

    const floorSignal: RadarSignal = {
      ...EMPTY_RADAR_SIGNAL,
      verdict: 'genuine_deal',
      savingsPct: 12.5,
      spreadPct: 14.2,
      genuineDeal: {
        id: 'o-floor',
        verdict: 'genuine_all_time_low',
        verdictBadgeVi: 'Đáy giá đa sàn',
        productSlug: 'iphone-16-pro-max',
        productName: 'iPhone 16 Pro Max',
        brand: 'Apple',
        categorySlug: 'smartphones',
        productHref: '/smartphones/iphone-16-pro-max',
        imageUrl: null,
        platform: 'shopee',
        merchantId: 'm-1',
        merchantName: 'Apple Flagship Store',
        isOfficialMall: true,
        merchantRiskScore: 5,
        offerUrl: 'https://shopee.vn/item-i.1.2',
        priceCurrent: 27_990_000,
        priceOriginal: 31_990_000,
        marketMedianPrice: 31_990_000,
        marketMinPrice: 27_990_000,
        marketMaxPrice: 33_990_000,
        savingsVsMedianVnd: 4_000_000,
        savingsVsMedianPct: 12.5,
        marketOfferCount: 4,
        claimedDiscountPct: 12.5,
        fakeMarkupPct: 0,
        jreviewsScore10: 9.4,
        explanationVi: 'Floor deal',
      },
      priceSpread: {
        id: 'sp-1',
        productSlug: 'iphone-16-pro-max',
        productName: 'iPhone 16 Pro Max',
        brand: 'Apple',
        categorySlug: 'smartphones',
        productHref: '/smartphones/iphone-16-pro-max',
        imageUrl: null,
        platformCount: 4,
        offerCount: 6,
        minPrice: 27_990_000,
        maxPrice: 31_965_000,
        medianPrice: 29_990_000,
        spreadVnd: 3_975_000,
        spreadPct: 14.2,
        cheapestPlatform: 'shopee',
        cheapestMerchantName: 'Apple Flagship Store',
        cheapestOfferUrl: 'https://shopee.vn/item-i.1.2',
        priciestPlatform: 'tiki',
        priciestMerchantName: 'Tiki Trading',
        explanationVi: 'Spread',
      },
    };
    const trapSignal: RadarSignal = {
      ...EMPTY_RADAR_SIGNAL,
      verdict: 'fake_sale_trap',
      fakeMarkupPct: 35,
      fakeSaleTrap: {
        id: 'o-trap',
        verdict: 'inflated_fake_sale',
        verdictBadgeVi: 'Giảm giá ảo',
        productSlug: 'galaxy-buds3-pro',
        productName: 'Galaxy Buds3 Pro',
        brand: 'Samsung',
        categorySlug: 'earbuds',
        productHref: '/earbuds/galaxy-buds3-pro',
        imageUrl: null,
        platform: 'lazada',
        merchantId: 'm-2',
        merchantName: 'NoName Audio',
        isOfficialMall: false,
        merchantRiskScore: 65,
        offerUrl: 'https://lazada.vn/products/i2.html',
        priceCurrent: 4_500_000,
        priceOriginal: 6_900_000,
        marketMedianPrice: 4_400_000,
        marketMinPrice: 3_990_000,
        marketMaxPrice: 4_600_000,
        savingsVsMedianVnd: 0,
        savingsVsMedianPct: 0,
        marketOfferCount: 3,
        claimedDiscountPct: 34.8,
        fakeMarkupPct: 35,
        jreviewsScore10: 8.6,
        explanationVi: 'Fake sale',
      },
    };

    const mdItems: WatchlistItem[] = [
      {
        slug: 'iphone-16-pro-max',
        name: 'iPhone 16 Pro Max',
        brand: 'Apple',
        categoryPath: '/smartphones',
        thumbnail: null,
        priceWhenAdded: 29_990_000,
        targetPrice: 28_500_000,
        addedAt: '2026-11-20T00:00:00.000Z',
      },
      {
        slug: 'galaxy-buds3-pro',
        name: 'Galaxy Buds3 Pro',
        brand: 'Samsung',
        categoryPath: '/earbuds',
        thumbnail: null,
        priceWhenAdded: 4_990_000,
        targetPrice: 4_200_000,
        addedAt: '2026-11-20T00:00:00.000Z',
      },
    ];
    const mdDeals: Record<string, LiveWatchlistDeal> = {
      'iphone-16-pro-max': {
        slug: 'iphone-16-pro-max',
        current_min_price: 27_990_000,
        current_max_price: 31_965_000,
        merchant_count: 6,
        platform_count: 4,
        offer_platforms: ['shopee', 'lazada', 'tiki', 'cellphones'],
        best_offer: {
          id: 'o-floor',
          title: 'iPhone 16 Pro Max',
          price: 27_990_000,
          original_price: 31_990_000,
          url: 'https://shopee.vn/item-i.1.2',
          platform: 'shopee',
          merchant_name: 'Apple Flagship Store',
          is_official_mall: true,
        },
        radar_signal: floorSignal,
      },
      'galaxy-buds3-pro': {
        slug: 'galaxy-buds3-pro',
        current_min_price: 4_500_000,
        current_max_price: 4_500_000,
        merchant_count: 1_250,
        platform_count: 2,
        offer_platforms: ['lazada', 'shopee'],
        best_offer: null,
        radar_signal: trapSignal,
      },
    };
    const mdStats = {
      totalMinVnd: 1_032_490_000,
      totalTargetVnd: 32_700_000,
      totalSpreadSavingsVnd: 3_975_000,
    };

    const tVi = createTranslator({
      locale: 'vi',
      messages: viMessages,
      namespace: 'watchlist',
    });
    const tEn = createTranslator({
      locale: 'en',
      messages: enMessages,
      namespace: 'watchlist',
    });
    const tCs = createTranslator({
      locale: 'cs',
      messages: csMessages,
      namespace: 'watchlist',
    });

    const viMd = buildWatchlistPortfolioMarkdown({
      items: mdItems,
      productBySlug: new Map(),
      liveDeals: mdDeals,
      portfolioStats: mdStats,
      avgPortfolioRating2d: '4.85',
      t: (key, values) => tVi(key, values as never),
      locale: 'vi',
    });
    assert.ok(viMd.includes('1.032.490.000 ₫'));
    assert.ok(viMd.includes('★ 4.85/5.0'));
    assert.ok(viMd.includes('+14.2% (3.975.000 ₫)'));
    assert.ok(viMd.includes('| 0 ₫ |'));
    assert.ok(viMd.includes('🔥 Đáy giá đa sàn (-12.5%)'));
    assert.ok(viMd.includes('🚨 Cảnh báo giảm giá ảo (+35.0%)'));

    const enMd = buildWatchlistPortfolioMarkdown({
      items: mdItems,
      productBySlug: new Map(),
      liveDeals: mdDeals,
      portfolioStats: mdStats,
      avgPortfolioRating2d: '4.85',
      t: (key, values) => tEn(key, values as never),
      locale: 'en',
    });
    assert.ok(enMd.includes('1.032.490.000 ₫'));
    assert.ok(enMd.includes('★ 4.85/5.0'));
    assert.ok(enMd.includes('+14.2% (3.975.000 ₫)'));
    assert.ok(enMd.includes('🔥 Cross-platform low (-12.5%)'));
    assert.ok(enMd.includes('🚨 Fake sale warning (+35.0%)'));
    assert.equal(enMd.includes('Đáy giá đa sàn'), false);
    assert.equal(enMd.includes('Cảnh báo giảm giá ảo'), false);

    const csMd = buildWatchlistPortfolioMarkdown({
      items: mdItems,
      productBySlug: new Map(),
      liveDeals: mdDeals,
      portfolioStats: mdStats,
      avgPortfolioRating2d: '4.85',
      t: (key, values) => tCs(key, values as never),
      locale: 'cs-CZ',
    });
    assert.ok(
      csMd.includes(`1${NBSP}032${NBSP}490${NBSP}000${NBSP}₫`),
      'cs Markdown formats portfolio total above 1B VND with Czech NBSP'
    );
    assert.ok(
      csMd.includes(`32${NBSP}700${NBSP}000${NBSP}₫`),
      'cs Markdown formats target total with Czech NBSP'
    );
    assert.ok(
      csMd.includes('★ 4,85/5,0'),
      'cs Markdown formats avgPortfolioRating2d and /5.0 with Czech decimal commas'
    );
    assert.ok(
      csMd.includes(`27${NBSP}990${NBSP}000${NBSP}₫`),
      'cs Markdown formats row current_min_price with Czech NBSP'
    );
    assert.ok(
      csMd.includes(`28${NBSP}500${NBSP}000${NBSP}₫`),
      'cs Markdown formats row targetPrice with Czech NBSP'
    );
    assert.ok(
      csMd.includes(`+14,2${NBSP}% (3${NBSP}975${NBSP}000${NBSP}₫)`),
      'cs Markdown formats spreadPct and spreadVnd with Czech comma and NBSP'
    );
    assert.ok(
      csMd.includes(`| 0${NBSP}₫ |`),
      'cs Markdown formats zero spread with Czech NBSP'
    );
    assert.ok(
      csMd.includes(`🔥 Minimum napříč obchody (-12,5${NBSP}%)`),
      'cs Markdown localizes genuine floor radar verdict'
    );
    assert.ok(
      csMd.includes(`🚨 Upozornění na falešnou slevu (+35,0${NBSP}%)`),
      'cs Markdown localizes fake-sale radar verdict'
    );
    assert.ok(
      csMd.includes(`1${NBSP}250 zdrojů`),
      'cs Markdown preserves Czech NBSP in pluralized source count'
    );
    assert.equal(csMd.includes('27.990.000'), false);
    assert.equal(csMd.includes('4.85/5.0'), false);
    assert.equal(csMd.includes('Đáy giá đa sàn'), false);
    assert.equal(csMd.includes('Cảnh báo giảm giá ảo'), false);
  }

  console.warn('  ✅ watchlist sizes & editor a11y suite passed');
}

main();
