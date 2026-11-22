import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import NavbarDarkDynamic, {
  shouldCloseNavbarDrawerOnLinkClick,
  type NavbarLinkClickEventLike,
  type NavbarLinkTargetLike,
} from '../../app/[locale]/components/navbar/NavbarDarkDynamic';
import { buildOffersMarkdown } from '../../components/leaderboard/ProductOffersExplorer';
import { buildShareAuditMarkdown } from '../../components/leaderboard/ProductShareAuditButton';
import { pickClientMessages } from '../client-messages';
import type { RadarSignal } from '../deal-radar';
import { wrapFocusTarget } from '../focus-trap';
import { NBSP } from '../locale-format';
import type { MerchantOffer } from '../rate-domain';

const items = ['close', 'home', 'leaderboard', 'watchlist'];

assert.equal(
  wrapFocusTarget(items, 'watchlist', false),
  'close',
  'Tab on the last element wraps to the first'
);
assert.equal(
  wrapFocusTarget(items, 'close', true),
  'watchlist',
  'Shift+Tab on the first element wraps to the last'
);
assert.equal(
  wrapFocusTarget(items, 'home', false),
  null,
  'Tab inside the trap is left to the browser'
);
assert.equal(
  wrapFocusTarget(items, 'leaderboard', true),
  null,
  'Shift+Tab inside the trap is left to the browser'
);
assert.equal(
  wrapFocusTarget(items, 'hero-search', false),
  'close',
  'Tab from outside the trap comes back to its first element'
);
assert.equal(
  wrapFocusTarget(items, null, true),
  'watchlist',
  'Shift+Tab with nothing focused comes back to the last element'
);
assert.equal(
  wrapFocusTarget(['only'], 'only', false),
  'only',
  'A single element keeps focus'
);
assert.equal(
  wrapFocusTarget([], 'home', false),
  null,
  'An empty trap leaves focus alone'
);

// DOS/Rate#1838: mobile nav drawer link activation & pathname-change reset.
const baseClickEvent: NavbarLinkClickEventLike = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const baseAnchor: NavbarLinkTargetLike = {
  href: '/smartphones',
  target: null,
  hasDownload: false,
};

assert.equal(
  shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, baseAnchor),
  true,
  'Plain primary click or Enter activation on in-drawer link closes the drawer'
);
assert.equal(
  shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, {
    ...baseAnchor,
    href: '/',
    target: '_self',
  }),
  true,
  'Explicit _self target still closes the drawer'
);
assert.equal(
  shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, {
    ...baseAnchor,
    href: '#main-content',
    target: '  _SELF ',
  }),
  true,
  'Hash link with case-insensitive _self closes the drawer'
);

for (const modifier of [
  { metaKey: true },
  { ctrlKey: true },
  { shiftKey: true },
  { altKey: true },
  { button: 1 },
  { button: 2 },
  { defaultPrevented: true },
] as const) {
  assert.equal(
    shouldCloseNavbarDrawerOnLinkClick(
      { ...baseClickEvent, ...modifier },
      baseAnchor
    ),
    false,
    `Modified or prevented click ${JSON.stringify(modifier)} leaves drawer open`
  );
}

for (const nonSelfTarget of [
  '_blank',
  '_BLANK',
  '_top',
  '_parent',
  'ext-tab',
]) {
  assert.equal(
    shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, {
      ...baseAnchor,
      target: nonSelfTarget,
    }),
    false,
    `Non-self target "${nonSelfTarget}" leaves drawer open`
  );
}

assert.equal(
  shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, {
    ...baseAnchor,
    hasDownload: true,
  }),
  false,
  'Download link leaves drawer open'
);
for (const emptyHref of ['', '   ', null, undefined]) {
  assert.equal(
    shouldCloseNavbarDrawerOnLinkClick(baseClickEvent, {
      ...baseAnchor,
      href: emptyHref,
    }),
    false,
    `Empty href ${String(emptyHref)} leaves drawer open`
  );
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
const sharedMessages = pickClientMessages(
  viMessages as unknown as Record<string, unknown>
);

const defaultNavHtml = renderToStaticMarkup(
  React.createElement(
    AppRouterContext.Provider,
    { value: mockRouter },
    React.createElement(
      PathnameContext.Provider,
      { value: '/smartphones' },
      React.createElement(
        IntlProvider,
        {
          locale: 'vi',
          messages: sharedMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(NavbarDarkDynamic, { links: [] })
      )
    )
  )
);
assert.match(defaultNavHtml, /id="rate-nav-menu"/);
assert.doesNotMatch(defaultNavHtml, /nav-menus-wrapper-open/);

const customLinksHtml = renderToStaticMarkup(
  React.createElement(
    AppRouterContext.Provider,
    { value: mockRouter },
    React.createElement(
      PathnameContext.Provider,
      { value: '/' },
      React.createElement(
        IntlProvider,
        {
          locale: 'vi',
          messages: sharedMessages,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(NavbarDarkDynamic, {
          links: [
            { id: 'internal', label: 'Smartphones', href: '/smartphones' },
            {
              id: 'docs',
              label: 'External Docs',
              href: 'https://rate.vn/developers',
              newTab: true,
            },
          ],
        })
      )
    )
  )
);
assert.match(
  customLinksHtml,
  /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/
);

const navbarSource = readFileSync(
  new URL(
    '../../app/[locale]/components/navbar/NavbarDarkDynamic.tsx',
    import.meta.url
  ),
  'utf8'
);
const intentLinkTags = [
  ...navbarSource.matchAll(/<IntentLink\b[\s\S]*?>/g),
].map((m) => m[0]);
assert.ok(
  intentLinkTags.length >= 9,
  'NavbarDarkDynamic renders all header and drawer IntentLink instances'
);
for (const tag of intentLinkTags) {
  assert.match(
    tag,
    /\bonClick=\{handleNavLinkClick\}/,
    `Every NavbarDarkDynamic IntentLink must wire handleNavLinkClick: ${tag}`
  );
}
assert.doesNotMatch(
  navbarSource,
  /onClick=\{\(\)\s*=>\s*setCategoriesOpen\(false\)\}/,
  'Category links must close both mobile drawer and desktop dropdown via handleNavLinkClick'
);
assert.match(
  navbarSource,
  /const pathname = usePathname\(\);/,
  'NavbarDarkDynamic tracks active pathname'
);
assert.match(
  navbarSource,
  /if \(openForPathname !== pathname\) \{[\s\S]*?setToggle\(false\);[\s\S]*?setCategoriesOpen\(false\);/,
  'NavbarDarkDynamic resets toggle and categoriesOpen when pathname changes'
);

// DOS/Rate#1838: Czech Markdown exports in ProductOffersExplorer and
// ProductShareAuditButton route VND and scores through locale-format helpers
// while keeping vi and en outputs 100% identical.
const mdOffers: MerchantOffer[] = [
  {
    id: 'offer-1',
    platform: 'shopee',
    title: 'iPhone 16 Pro 256GB',
    price_current: 15_990_000,
    price_original: 18_990_000,
    url: 'https://shopee.vn/item-1',
    availability: 'in_stock',
    merchant: {
      id: 'm1',
      name: 'Apple Flagship Store',
      platform: 'shopee',
      is_official: true,
      risk_score: 10,
      dosafe_risk_score: 10,
    },
  } as unknown as MerchantOffer,
  {
    id: 'offer-2',
    platform: 'lazada',
    title: 'iPhone 16 Pro 256GB LazMall',
    price_current: 16_490_000,
    price_original: null,
    url: 'https://lazada.vn/item-2',
    availability: 'in_stock',
    merchant: {
      id: 'm2',
      name: 'Mobile World',
      platform: 'lazada',
      is_official: false,
      risk_score: null,
      dosafe_risk_score: null,
    },
  } as unknown as MerchantOffer,
];

const sampleRadarSignal = {
  verdict: 'genuine_deal',
  savingsPct: 13.1,
  fakeMarkupPct: 0,
  spreadPct: 0,
  genuineDeal: {
    verdict: 'genuine_all_time_low',
    savingsVsMedianVnd: 1_550_000,
    savingsVsMedianPct: 13.1,
    merchantName: 'Apple Flagship Store',
    platform: 'shopee',
    marketOfferCount: 3,
  },
  fakeSaleTrap: null,
  priceSpread: null,
} as unknown as RadarSignal;

const catalogs = {
  vi: viMessages,
  en: enMessages,
  cs: csMessages,
} as const;

for (const locale of ['vi', 'en'] as const) {
  const msgs = catalogs[locale];
  const tDetail = createTranslator({
    locale,
    messages: msgs,
    namespace: 'productDetail',
  });
  const tVerdict = createTranslator({
    locale,
    messages: msgs,
    namespace: 'priceVerdict',
  });
  const offersMd = buildOffersMarkdown({
    productName: 'iPhone 16 Pro',
    offers: mdOffers,
    byOffer: {},
    radarSignal: sampleRadarSignal,
    locale,
    t: tDetail,
    tVerdict,
  });
  assert.match(offersMd, /\| 90% \| 15\.990\.000 ₫ \| 18\.990\.000 ₫ \|/);
  assert.match(offersMd, /\*\*500\.000 ₫ \(3\.1%\)\*\*/);

  const shareMd = buildShareAuditMarkdown({
    name: 'iPhone 16 Pro',
    brand: 'Apple',
    modelKey: 'apple:iphone-16-pro',
    userScore5: 4.5,
    expertScore10: 8.4,
    authenticReviews: 12,
    minPriceVnd: 15_990_000,
    offerCount: 3,
    keySpecLine: '6.3" OLED, A18 Pro',
    radarSignal: sampleRadarSignal,
    url: 'https://rate.vn/smartphones/iphone-16-pro',
    locale,
    t: tDetail,
  });
  assert.match(shareMd, /★ 4\.50\/5\.0 \(12 /);
  assert.match(shareMd, /8\.4\/10/);
  assert.match(shareMd, /15\.990\.000 ₫ \(3 /);
}

{
  const tDetailCs = createTranslator({
    locale: 'cs',
    messages: csMessages,
    namespace: 'productDetail',
  });
  const tVerdictCs = createTranslator({
    locale: 'cs',
    messages: csMessages,
    namespace: 'priceVerdict',
  });
  const csOffersMd = buildOffersMarkdown({
    productName: 'iPhone 16 Pro',
    offers: mdOffers,
    byOffer: {},
    radarSignal: sampleRadarSignal,
    locale: 'cs',
    t: tDetailCs,
    tVerdict: tVerdictCs,
  });
  assert.ok(
    csOffersMd.includes(
      `| SHOPEE | Apple Flagship Store | Yes | 90${NBSP}% | 15${NBSP}990${NBSP}000${NBSP}₫ | 18${NBSP}990${NBSP}000${NBSP}₫ | Stabilní cena |`
    ),
    `Unexpected cs offers row: ${csOffersMd}`
  );
  assert.ok(
    csOffersMd.includes(
      `| LAZADA | Mobile World | No | Důvěryhodnost: zatím bez dat | 16${NBSP}490${NBSP}000${NBSP}₫ | - | Stabilní cena |`
    ),
    `Unexpected cs second row: ${csOffersMd}`
  );
  assert.ok(
    csOffersMd.includes(`**500${NBSP}000${NBSP}₫ (3,1${NBSP}%)**`),
    `Expected Czech spread formatting in: ${csOffersMd}`
  );
  assert.ok(
    csOffersMd.includes(`🔥 Minimum napříč obchody (-13,1${NBSP}%)`),
    `Expected Czech radar signal in: ${csOffersMd}`
  );
  assert.doesNotMatch(csOffersMd, /15\.990\.000|18\.990\.000|500\.000|\(3\.1/);

  const csShareMd = buildShareAuditMarkdown({
    name: 'iPhone 16 Pro',
    brand: 'Apple',
    modelKey: 'apple:iphone-16-pro',
    userScore5: 4.345,
    expertScore10: 8.4,
    authenticReviews: 3,
    minPriceVnd: 15_990_000,
    offerCount: 3,
    keySpecLine: '6.3" OLED, A18 Pro',
    radarSignal: sampleRadarSignal,
    url: 'https://rate.vn/smartphones/iphone-16-pro',
    locale: 'cs',
    t: tDetailCs,
  });
  assert.ok(
    csShareMd.includes('★ 4,35/5,0 (3 AI-ověřené recenze)'),
    `Expected Czech decimal comma buyer score in: ${csShareMd}`
  );
  assert.ok(
    csShareMd.includes('8,4/10'),
    `Expected Czech decimal comma expert score in: ${csShareMd}`
  );
  assert.ok(
    csShareMd.includes(
      `15${NBSP}990${NBSP}000${NBSP}₫ (3 zkontrolované zdroje)`
    ),
    `Expected Czech space-grouped VND in: ${csShareMd}`
  );
  assert.doesNotMatch(csShareMd, /15\.990\.000|4\.35\/|8\.4\/10/);

  const csFallbackShareMd = buildShareAuditMarkdown({
    name: 'iPhone 16 Pro',
    brand: 'Apple',
    modelKey: 'apple:iphone-16-pro',
    userScore5: 0,
    expertScore10: null,
    authenticReviews: 0,
    minPriceVnd: 0,
    offerCount: 0,
    url: 'https://rate.vn/smartphones/iphone-16-pro',
    locale: 'cs',
    t: tDetailCs,
  });
  assert.ok(
    csFallbackShareMd.includes(csMessages.productDetail.shareAuditMdNoReviews)
  );
  assert.ok(
    csFallbackShareMd.includes(csMessages.productDetail.shareAuditMdNoExpert)
  );
  assert.ok(
    csFallbackShareMd.includes(csMessages.productDetail.shareAuditUpdating)
  );
}

for (const rel of [
  '../../components/leaderboard/ProductOffersExplorer.tsx',
  '../../components/leaderboard/ProductShareAuditButton.tsx',
] as const) {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.doesNotMatch(
    src,
    /toLocaleString\s*\(\s*['"]vi-VN['"]/,
    `${rel} must not hardcode toLocaleString('vi-VN')`
  );
}

console.log('focus-trap: ok');
