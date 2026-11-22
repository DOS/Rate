import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import { isPlainListing } from '../catalog-listing';
import { pickClientMessages } from '../client-messages';
import { EMPTY_RADAR_SIGNAL } from '../deal-radar';
import type { ItemCatalogRow } from '../item-directory';
import { NBSP } from '../locale-format';

console.warn('🧪 Catalogue plain-listing suite');

// Category, sort and page window only: cached (DOS/Rate#495).
assert.equal(isPlainListing({ categorySlug: 'earbuds' }), true);

// The category comes from ?category=, so only the five canonical slugs
// qualify: anything else would add a cache entry per made-up value.
for (const categorySlug of [undefined, 'all', 'Earbuds', 'random-123', '']) {
  assert.equal(
    isPlainListing({ categorySlug, sort: 'newest' }),
    false,
    String(categorySlug)
  );
}
assert.equal(
  isPlainListing({
    categorySlug: 'smartphones',
    sort: 'price_asc',
    limit: 201,
    offset: 400,
    brands: undefined,
    search: undefined,
  }),
  true
);

// Any filter, free-form or not, keeps the read uncached.
for (const filter of [
  { search: 'iphone' },
  { brands: ['Apple'] },
  { minPrice: 1_000_000 },
  { maxPrice: 9_000_000 },
  { minRating: 4 },
  { ramGb: [8] },
  { storageGb: [256] },
  { has5g: true },
  { hasNfc: true },
  { minBatteryMah: 5000 },
  { minRefreshRateHz: 120 },
  { minFastChargingW: 45 },
  { maxScreenSizeInch: 6.2 },
]) {
  assert.equal(
    isPlainListing({ categorySlug: 'smartphones', ...filter }),
    false,
    JSON.stringify(filter)
  );
}

// Invalid/non-object params or out-of-bounds limit/offset are rejected (#854)
assert.equal(isPlainListing(null as never), false);
assert.equal(isPlainListing([] as never), false);
assert.equal(isPlainListing({ categorySlug: 'smartphones', limit: 0 }), false);
assert.equal(
  isPlainListing({ categorySlug: 'smartphones', limit: 501 }),
  false
);
assert.equal(
  isPlainListing({ categorySlug: 'smartphones', limit: Number.NaN }),
  false
);
assert.equal(
  isPlainListing({ categorySlug: 'smartphones', offset: -1 }),
  false
);
assert.equal(
  isPlainListing({ categorySlug: 'smartphones', offset: 100_001 }),
  false
);

async function runCatalogSyncGuardsAndI18nSuite() {
  const extMap = (
    Module as unknown as {
      _extensions?: Record<string, (mod: { exports: unknown }) => void>;
    }
  )._extensions;
  if (extMap && !extMap['.css']) {
    extMap['.css'] = (mod) => {
      mod.exports = { bar: 'bar' };
    };
  }

  const {
    default: ListSidebarOne,
    applySidebarBrandToggle,
    resolveSidebarActiveBrands,
  } = await import('../../app/[locale]/components/list-sidebar-one');
  const {
    buildCatalogPageItemSlugMap,
    formatCatalogPriceChip,
    isValidCatalogPageVersusPair,
    lookupCatalogPageOwnSlug,
    pickCatalogVersusPair,
  } = await import('../../app/[locale]/smartphones/page');
  const {
    default: CategoryCatalogToolbar,
    buildCatalogCsvRow,
    buildCatalogItemSlugMap,
    buildCatalogJsonProductEntry,
    buildCatalogMarkdown,
    isValidCatalogVersusPair,
    lookupCatalogOwnSlug,
    resolveCatalogExportSlug,
  } = await import('../../components/leaderboard/CategoryCatalogToolbar');

  // 1. Sidebar ?brand= fallback seeding and legacy brand cleanup (#1828).
  assert.deepEqual(resolveSidebarActiveBrands(null, 'Apple'), ['Apple']);
  assert.deepEqual(resolveSidebarActiveBrands('', '  Apple\u0000  '), [
    'Apple',
  ]);
  assert.deepEqual(resolveSidebarActiveBrands(',', 'Samsung'), ['Samsung']);
  assert.deepEqual(resolveSidebarActiveBrands('Samsung,Xiaomi', 'Apple'), [
    'Samsung',
    'Xiaomi',
  ]);
  assert.deepEqual(resolveSidebarActiveBrands(null, 'Apple,Samsung'), []);
  assert.deepEqual(resolveSidebarActiveBrands(null, null), []);

  // Adding a second brand when URL started with ?brand=Apple keeps Apple and deletes legacy brand.
  const addBrandParams = new URLSearchParams(
    'brand=Apple&page=2&sort=price_asc'
  );
  applySidebarBrandToggle(addBrandParams, 'Samsung');
  assert.equal(addBrandParams.get('brand'), null);
  assert.equal(addBrandParams.get('brands'), 'Apple,Samsung');
  assert.equal(addBrandParams.get('sort'), 'price_asc');

  // Unchecking Apple when URL started with ?brand=Apple clears both brand and brands.
  const removeSingleBrandParams = new URLSearchParams('brand=Apple');
  applySidebarBrandToggle(removeSingleBrandParams, 'apple');
  assert.equal(removeSingleBrandParams.toString(), '');

  // Unchecking the active brands entry when stale ?brand=Apple also existed never resurrects Apple.
  const noResurrectParams = new URLSearchParams('brands=Samsung&brand=Apple');
  applySidebarBrandToggle(noResurrectParams, 'Samsung');
  assert.equal(noResurrectParams.get('brand'), null);
  assert.equal(noResurrectParams.get('brands'), null);
  assert.equal(noResurrectParams.toString(), '');

  const stubRouter: AppRouterInstance = {
    bfcacheId: 'test',
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
  };
  const Provider = NextIntlClientProvider as unknown as React.ComponentType<{
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

  for (const locale of ['vi', 'en', 'cs'] as const) {
    const sidebarHtml = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: stubRouter },
        React.createElement(
          PathnameContext.Provider,
          { value: '/smartphones' },
          React.createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams('brand=Apple') },
            React.createElement(
              Provider,
              {
                locale,
                messages: pickClientMessages(
                  localeCatalogs[locale] as unknown as Record<string, unknown>,
                  'catalog'
                ),
                timeZone: 'Asia/Ho_Chi_Minh',
              },
              React.createElement(ListSidebarOne, {
                categorySlug: 'smartphones',
                brandFacets: [
                  { name: 'Apple', count: 12 },
                  { name: 'Samsung', count: 9 },
                ],
              })
            )
          )
        )
      )
    );
    assert.match(
      sidebarHtml,
      /<input[^>]*id="brand-apple"[^>]*checked=""/,
      `${locale}: ?brand=Apple renders Apple checkbox checked in ListSidebarOne`
    );
    assert.doesNotMatch(
      sidebarHtml,
      /<input[^>]*id="brand-samsung"[^>]*checked=""/,
      `${locale}: ?brand=Apple leaves Samsung unchecked`
    );
    if (locale === 'vi') {
      assert.match(sidebarHtml, /tr ₫/);
    } else {
      assert.match(sidebarHtml, /M VND/);
      assert.doesNotMatch(
        sidebarHtml,
        /tr ₫/,
        `${locale}: RangeSlider must not leak Vietnamese "tr ₫"`
      );
    }
  }

  // 2. Prototype-safe Object.hasOwn lookups + isParseableVersusPair 1v1 guards (#1828).
  const plainSlugMap: Record<string, string> = {
    'iphone-16-256gb': 'iphone-16',
    'galaxy-s24-256gb': 'galaxy-s24',
  };
  for (const protoKey of [
    'toString',
    'constructor',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
  ]) {
    assert.equal(lookupCatalogPageOwnSlug(plainSlugMap, protoKey), undefined);
    assert.equal(lookupCatalogOwnSlug(plainSlugMap, protoKey), undefined);
    assert.equal(
      isValidCatalogPageVersusPair(protoKey, 'iphone-16-256gb', plainSlugMap),
      false,
      `page guard rejects prototype slug ${protoKey}`
    );
    assert.equal(
      isValidCatalogVersusPair(protoKey, 'iphone-16-256gb', plainSlugMap),
      false,
      `toolbar guard rejects prototype slug ${protoKey}`
    );
  }

  // Safe storage of own prototype-named keys in item slug maps.
  const protoMapPage = buildCatalogPageItemSlugMap([
    { slug: 'toString', item_slug: 'safe-item-one' },
    { slug: '__proto__', item_slug: 'safe-item-two' },
  ]);
  assert.equal(Object.getPrototypeOf(protoMapPage), Object.prototype);
  assert.equal(
    lookupCatalogPageOwnSlug(protoMapPage, 'toString'),
    'safe-item-one'
  );
  assert.equal(
    lookupCatalogPageOwnSlug(protoMapPage, '__proto__'),
    'safe-item-two'
  );
  assert.equal(lookupCatalogPageOwnSlug(protoMapPage, 'valueOf'), undefined);

  const protoMapToolbar = buildCatalogItemSlugMap([
    {
      slug: 'toString',
      item_slug: 'safe-item-one',
    } as unknown as ItemCatalogRow,
    {
      slug: '__proto__',
      item_slug: 'safe-item-two',
    } as unknown as ItemCatalogRow,
  ]);
  assert.equal(Object.getPrototypeOf(protoMapToolbar), Object.prototype);
  assert.equal(
    lookupCatalogOwnSlug(protoMapToolbar, 'toString'),
    'safe-item-one'
  );
  assert.equal(
    lookupCatalogOwnSlug(protoMapToolbar, '__proto__'),
    'safe-item-two'
  );
  assert.equal(lookupCatalogOwnSlug(protoMapToolbar, 'constructor'), undefined);

  // Unparseable -vs- pairs & ending -vs pairs.
  assert.equal(
    isValidCatalogPageVersusPair('phone-a-vs-b', 'iphone-16', {}),
    false
  );
  assert.equal(
    isValidCatalogVersusPair('phone-a-vs-b', 'iphone-16', {}),
    false
  );
  assert.equal(
    isValidCatalogPageVersusPair('phone-a-256gb', 'iphone-16-256gb', {
      'phone-a-256gb': 'phone-a-vs-b',
      'iphone-16-256gb': 'iphone-16',
    }),
    false
  );
  assert.equal(
    isValidCatalogVersusPair('phone-a-256gb', 'iphone-16-256gb', {
      'phone-a-256gb': 'phone-a-vs-b',
      'iphone-16-256gb': 'iphone-16',
    }),
    false
  );
  // Two slugs both ending in -vs fail round-trip in both orders.
  assert.equal(isValidCatalogPageVersusPair('alpha-vs', 'beta-vs', {}), false);
  assert.equal(isValidCatalogVersusPair('alpha-vs', 'beta-vs', {}), false);
  // Single slug ending in -vs paired with normal slug round-trips in canonical reversed order.
  assert.equal(isValidCatalogPageVersusPair('alpha-vs', 'zeta', {}), true);
  assert.equal(isValidCatalogVersusPair('alpha-vs', 'zeta', {}), true);

  // pickCatalogVersusPair skips unparseable first row and picks valid pair.
  const pickedPair = pickCatalogVersusPair(
    [
      { slug: 'broken-a-vs-b', brand: 'Broken' },
      { slug: 'iphone-16-256gb', brand: 'Apple' },
      { slug: 'galaxy-s24-256gb', brand: 'Samsung' },
    ],
    plainSlugMap
  );
  assert.deepEqual(
    pickedPair?.map((r) => r.slug),
    ['iphone-16-256gb', 'galaxy-s24-256gb']
  );
  assert.equal(
    pickCatalogVersusPair([{ slug: 'alpha-vs' }, { slug: 'beta-vs' }], {}),
    null
  );

  // CategoryCatalogToolbar SSR skips unparseable rows and hides picker if none parseable.
  const rowBrokenVs = {
    id: 'r-broken',
    slug: 'broken-a-vs-b',
    name: 'Broken VS Phone',
    brand: 'Test',
    min_price: 10_000_000,
  } as unknown as ItemCatalogRow;
  const rowIphone = {
    id: 'r-iphone',
    slug: 'apple-iphone-16-256gb',
    item_slug: 'apple-iphone-16',
    name: 'iPhone 16',
    brand: 'Apple',
    min_price: 21_990_000,
    max_price: 24_990_000,
    rating_score: 4.8,
    expert_rating: 9.1,
    authentic_review_count: 1200,
    merchant_count: 5,
  } as unknown as ItemCatalogRow;
  const rowGalaxy = {
    id: 'r-galaxy',
    slug: 'samsung-galaxy-s24-256gb',
    item_slug: 'samsung-galaxy-s24',
    name: 'Galaxy S24',
    brand: 'Samsung',
    min_price: 18_990_000,
    max_price: 21_490_000,
    rating_score: 4.6,
    expert_rating: 8.8,
    authentic_review_count: 85,
    merchant_count: 4,
  } as unknown as ItemCatalogRow;

  const skippedBrokenToolbarHtml = renderToStaticMarkup(
    React.createElement(
      Provider,
      {
        locale: 'en',
        messages: pickClientMessages(
          enMessages as unknown as Record<string, unknown>,
          'catalog'
        ),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      React.createElement(CategoryCatalogToolbar, {
        categorySlug: 'smartphones',
        categoryTitle: 'Smartphones',
        products: [rowBrokenVs, rowIphone, rowGalaxy],
      })
    )
  );
  assert.match(
    skippedBrokenToolbarHtml,
    /href="\/en\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"|href="\/compare\/apple-iphone-16-vs-samsung-galaxy-s24"/,
    'CategoryCatalogToolbar skips unparseable first row and links valid canonical Item pair'
  );
  assert.doesNotMatch(skippedBrokenToolbarHtml, /broken-a-vs-b/);

  const allUnparseableToolbarHtml = renderToStaticMarkup(
    React.createElement(
      Provider,
      {
        locale: 'en',
        messages: pickClientMessages(
          enMessages as unknown as Record<string, unknown>,
          'catalog'
        ),
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      React.createElement(CategoryCatalogToolbar, {
        categorySlug: 'smartphones',
        categoryTitle: 'Smartphones',
        products: [
          rowBrokenVs,
          { ...rowBrokenVs, id: 'r-broken-2', slug: 'other-c-vs-d' },
        ],
      })
    )
  );
  assert.doesNotMatch(
    allUnparseableToolbarHtml,
    /data-testid="catalog-1v1-go-btn"/,
    'CategoryCatalogToolbar hides 1v1 Go button when all pairs are unparseable'
  );

  // 3. Canonical Item slugs in toolbar CSV & JSON exports (#1828).
  assert.equal(resolveCatalogExportSlug(rowIphone), 'apple-iphone-16');
  assert.equal(
    resolveCatalogExportSlug(
      { slug: 'samsung-galaxy-s24-256gb' },
      { 'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24' }
    ),
    'samsung-galaxy-s24'
  );
  assert.equal(resolveCatalogExportSlug({ slug: 'toString' }, {}), 'toString');
  const csvRow = buildCatalogCsvRow(
    rowIphone,
    1,
    'smartphones',
    EMPTY_RADAR_SIGNAL
  );
  assert.equal(csvRow[1], 'apple-iphone-16');
  const jsonEntry = buildCatalogJsonProductEntry(
    rowIphone,
    1,
    EMPTY_RADAR_SIGNAL
  );
  assert.equal(jsonEntry.slug, 'apple-iphone-16');

  // 4. Localized price chips & Markdown export headers/title across vi/en/cs (#1828).
  const tVi = createTranslator({
    locale: 'vi',
    messages: viMessages,
    namespace: 'catalog',
  });
  const tEn = createTranslator({
    locale: 'en',
    messages: enMessages,
    namespace: 'catalog',
  });
  const tCs = createTranslator({
    locale: 'cs',
    messages: csMessages,
    namespace: 'catalog',
  });

  assert.equal(
    formatCatalogPriceChip(0, 7_000_000, 50, tVi as never),
    'Giá: 0 ₫ - 7tr'
  );
  assert.equal(
    formatCatalogPriceChip(25_000_000, 0, 50, tVi as never),
    'Giá: 25tr - 50tr+'
  );
  assert.equal(
    formatCatalogPriceChip(0, 7_000_000, 50, tEn as never),
    'Price: 0 VND - 7M VND'
  );
  assert.equal(
    formatCatalogPriceChip(25_000_000, 0, 50, tEn as never),
    'Price: 25M VND - 50M+ VND'
  );
  assert.equal(
    formatCatalogPriceChip(0, 7_000_000, 50, tCs as never),
    'Cena: 0 VND - 7M VND'
  );
  assert.equal(
    formatCatalogPriceChip(25_000_000, 0, 50, tCs as never),
    'Cena: 25M VND - 50M+ VND'
  );

  const mdVi = buildCatalogMarkdown(
    [rowIphone, rowGalaxy],
    'Điện thoại thông minh',
    () => EMPTY_RADAR_SIGNAL,
    'vi',
    tVi as never
  );
  assert.match(
    mdVi,
    /^### 📂 Danh mục ngành hàng Rate\.vn: Điện thoại thông minh \(2 thiết bị\)/
  );
  assert.match(
    mdVi,
    /\| # \| Mẫu máy \| Hãng \| Điểm người mua \(\/5\.0\) \| Điểm chuyên gia \(\/10\) \| Đánh giá thật \| Giá thấp nhất \(VNĐ\) \| Tín hiệu giá \|/
  );
  assert.match(
    mdVi,
    /\| 1 \| iPhone 16 \| Apple \| 4\.8\/5\.0 \| 9\.1\/10 \| 1\.200 \| 21\.990\.000 ₫ \|/
  );

  const mdEnSingle = buildCatalogMarkdown(
    [rowIphone],
    'Smartphones',
    () => EMPTY_RADAR_SIGNAL,
    'en',
    tEn as never
  );
  assert.match(
    mdEnSingle,
    /^### 📂 Rate\.vn category catalog: Smartphones \(1 device\)/
  );
  assert.match(
    mdEnSingle,
    /\| # \| Model \| Brand \| User rating \(\/5\.0\) \| Expert score \(\/10\) \| Authentic reviews \| Min price \(VND\) \| Price signal \|/
  );

  const mdCs = buildCatalogMarkdown(
    [rowIphone, rowGalaxy],
    'Chytré telefony',
    () => EMPTY_RADAR_SIGNAL,
    'cs',
    tCs as never
  );
  assert.match(
    mdCs,
    /^### 📂 Katalog kategorie Rate\.vn: Chytré telefony \(2 zařízení\)/
  );
  assert.match(
    mdCs,
    /\| # \| Model \| Značka \| Hodnocení kupujících \(\/5,0\) \| Hodnocení expertů \(\/10\) \| Skutečné recenze \| Nejnižší cena \(VND\) \| Cenový signál \|/
  );
  assert.ok(
    mdCs.includes(
      `4,8/5,0 | 9,1/10 | 1${NBSP}200 | 21${NBSP}990${NBSP}000${NBSP}₫`
    ),
    'Czech Markdown export formats ratings, review counts, and VND prices in cs locale'
  );
}

runCatalogSyncGuardsAndI18nSuite()
  .then(() => {
    console.warn(
      '✅ Catalogue plain-listing, ?brand= sync, 1v1 guards & i18n suite passed'
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
