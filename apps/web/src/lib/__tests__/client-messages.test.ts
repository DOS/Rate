import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_MESSAGE_SCOPES, pickClientMessages } from '../client-messages';
import {
  buildRadarIndex,
  getRadarSignal,
  radarExportFields,
} from '../deal-radar';
import {
  formatStorageLabel,
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
} from '../category-filters';
import {
  rankMasterProductsForLeaderboard,
  scoreMasterProductForLeaderboard,
} from '../leaderboard-engine';
import type { MasterProduct } from '../rate-api';

const srcDir = fileURLToPath(new URL('../../', import.meta.url));
const en = JSON.parse(
  readFileSync(new URL('../../../locales/en.json', import.meta.url), 'utf8')
) as Record<string, Record<string, unknown>>;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === '__tests__' ? [] : walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function main() {
  console.warn('🧪 Client messages suite');

  // Shared picks: nested keys and prefixed subsets, nothing else.
  const shared = pickClientMessages(en);
  assert.deepEqual(Object.keys(shared).sort(), [
    'compare',
    'deals',
    'errors',
    'rate',
    'watchlist',
  ]);
  assert.deepEqual(Object.keys(shared.rate as object), ['nav']);
  assert.ok(
    Object.keys(shared.compare as object).every(
      (k) => k.startsWith('tray') || k.startsWith('quickToggle')
    )
  );
  assert.ok(Object.keys(shared.compare as object).length > 0);

  // A scope adds whole namespaces on top of the shared subsets.
  const detail = pickClientMessages(en, 'productDetail');
  assert.deepEqual(detail.productDetail, en.productDetail);
  assert.deepEqual(detail.watchlist, en.watchlist);
  assert.ok(
    Object.keys(detail.compare as object).every(
      (k) => k.startsWith('tray') || k.startsWith('quickToggle')
    )
  );
  assert.equal(detail.developers, undefined);
  assert.equal(pickClientMessages(en, 'home').homePage, undefined);

  // Every namespace a Client Component reads is in some scope, so no route
  // can lose its strings by accident (DOS/Rate#736).
  const covered = new Set(
    Object.values(CLIENT_MESSAGE_SCOPES)
      .flat()
      .map((pick) => pick.split('.')[0]!.replace(/\*$/, ''))
  );
  const missing = new Set<string>();
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    if (!/^['"]use client['"]/m.test(src)) continue;
    for (const m of src.matchAll(
      /useTranslations(?:<[^>]*>)?\(\s*['"]([\w.]+)['"]/g
    )) {
      const ns = m[1]!.split('.')[0]!;
      if (!covered.has(ns)) missing.add(`${ns} (${file.slice(srcDir.length)})`);
    }
  }
  assert.deepEqual([...missing], [], 'client namespaces without a scope');

  // Prototype-key & invalid input guards (#852)
  assert.deepEqual(
    pickClientMessages(null as unknown as Record<string, unknown>),
    {}
  );
  const protoFallback = pickClientMessages(en, 'constructor' as never);
  assert.deepEqual(Object.keys(protoFallback).sort(), [
    'compare',
    'deals',
    'errors',
    'rate',
    'watchlist',
  ]);

  // deal-radar bounds: negative percentages clamp to 0 & control chars stripped from slugs (#852)
  const negExport = radarExportFields({
    verdict: 'none',
    savingsPct: -15,
    fakeMarkupPct: -30,
    spreadPct: -8,
    genuineDeal: null,
    fakeSaleTrap: null,
    priceSpread: null,
  });
  assert.equal(negExport.savingsPct, 0);
  assert.equal(negExport.fakeMarkupPct, 0);
  assert.equal(negExport.spreadPct, 0);

  const radarIdx = buildRadarIndex({
    generatedAt: '2026-06-01T00:00:00Z',
    categoryFilter: 'all',
    totalClustersAnalyzed: 1,
    totalOffersAnalyzed: 2,
    totalMerchantsAnalyzed: 2,
    genuineDeals: [
      {
        id: 'gd-ctrl',
        verdict: 'best_market_deal',
        verdictBadgeVi: 'Giá tốt',
        productSlug: '  iphone-16\u0000-pro  ',
        productName: 'iPhone 16 Pro',
        brand: 'Apple',
        categorySlug: 'smartphones',
        productHref: '/smartphones/iphone-16-pro',
        imageUrl: null,
        platform: 'shopee',
        merchantId: 'm-1',
        merchantName: 'Shop A',
        isOfficialMall: true,
        merchantRiskScore: 5,
        offerUrl: 'https://shopee.vn/a',
        priceCurrent: 24_000_000,
        priceOriginal: 28_000_000,
        marketMedianPrice: 26_000_000,
        marketMinPrice: 24_000_000,
        marketMaxPrice: 28_000_000,
        savingsVsMedianVnd: 2_000_000,
        savingsVsMedianPct: 7.7,
        marketOfferCount: 3,
        claimedDiscountPct: 14.3,
        fakeMarkupPct: 0,
        jreviewsScore10: 9.0,
        explanationVi: 'Tốt',
      },
    ],
    fakeSaleTraps: [],
    priceSpreadLeaders: [],
  });
  assert.equal(getRadarSignal(radarIdx, 'iphone-16-pro').savingsPct, 7.7);

  // category-filters prototype-key & storage guards (#852)
  const protoSchema = getCategoryFilterSchema('constructor', [
    '  Sony\u0007  ',
  ]);
  assert.equal(protoSchema.categorySlug, 'smartphones');
  assert.ok(protoSchema.defaultBrands.includes('Sony'));
  const localizedProto = localizeCategoryFilterSchema(
    { ...protoSchema, categorySlug: '__proto__' },
    (k) => k
  );
  assert.equal(localizedProto.categoryTitle, 'schemas.smartphones.title');
  assert.equal(formatStorageLabel(Number.NaN), '0GB');
  assert.equal(formatStorageLabel(-128), '0GB');
  assert.equal(formatStorageLabel(1024), '1TB');

  // leaderboard-engine count ceiling & limit cap (#852)
  const scored = scoreMasterProductForLeaderboard({
    id: 'p1',
    slug: 'iphone\u0000-16',
    name: 'iPhone\u0007 16',
    brand: 'Apple',
    model: 'iPhone 16',
    user_rating_weighted: 4.8,
    total_reviews: 999_999_999,
    authentic_review_count: 888_888_888,
    merchant_count: 777_777_777,
    min_price: 20_000_000,
  } as unknown as MasterProduct);
  assert.equal(scored.slug, 'iphone-16');
  assert.equal(scored.name, 'iPhone 16');
  assert.equal(scored.authenticReviewCount, 10_000_000);
  assert.equal(scored.merchantCount, 10_000_000);
  const ranked = rankMasterProductsForLeaderboard(
    [
      {
        id: 'p1',
        slug: 'iphone-16',
        name: 'iPhone 16',
        brand: 'Apple',
        model: 'iPhone 16',
        user_rating_weighted: 4.8,
        min_price: 20_000_000,
      } as unknown as MasterProduct,
    ],
    { limit: 999_999, query: 'iphone\u0000' }
  );
  assert.equal(ranked.length, 1);

  console.warn('✅ Client messages suite passed');
}

main();
