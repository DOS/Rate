import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MasterProduct } from '@repo/shared-data';
import {
  buildKeySpecLine,
  peerPriceDelta,
  rankRelatedCompetitors,
} from '../product-competitors';
import {
  buildPeerCompareHref,
  buildPeerItemSlugMap,
  resolveCanonicalPeerSlug,
  resolvePeerCompareToken,
  resolvePeerVersusHref,
  withoutCurrentItemPeers,
} from '../item-page';
import { catalogRowSlug } from '../item-directory';
import {
  isParseableVersusPair,
  planVersusRoute,
  type CompareResolution,
} from '../item-compare';
import { computeProductStandingInCategory } from '../leaderboard-engine';
import {
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
} from '../rate-domain';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.warn('🧪 Product competitors suite (#558)');

  // Priced peers come first, closest price first; unpriced peers go last.
  const peers = [
    { slug: 'self', min_price: 20_000_000 },
    { slug: 'unpriced-a', min_price: 0 },
    { slug: 'far', min_price: 40_000_000 },
    { slug: 'near', min_price: 21_000_000 },
    { slug: 'unpriced-b', min_price: null },
    { slug: 'mid', min_price: 15_000_000 },
  ];
  assert.deepEqual(
    rankRelatedCompetitors(peers as never, 'self', 20_000_000).map(
      (p) => p.slug
    ),
    ['near', 'mid', 'far']
  );
  assert.deepEqual(
    rankRelatedCompetitors(peers as never, 'self', 20_000_000, 5).map(
      (p) => p.slug
    ),
    ['near', 'mid', 'far', 'unpriced-a', 'unpriced-b']
  );

  // No "cheaper by" badge against an unpriced side.
  assert.equal(peerPriceDelta(0, 20_000_000), 0);
  assert.equal(peerPriceDelta(19_000_000, 0), 0);
  assert.equal(peerPriceDelta(19_000_000, 20_000_000), -1_000_000);
  assert.equal(peerPriceDelta(21_000_000, 20_000_000), 1_000_000);

  // Spec line falls back to the 10-group specs and the top-level columns.
  assert.equal(
    buildKeySpecLine({
      key_specs: {
        chip: 'A18 Pro',
        ram: '8GB',
        storage: '256GB',
        battery: '4685 mAh',
      },
      specifications: {},
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
    } as never),
    'A18 Pro • 8GB • 256GB • 4685 mAh'
  );
  assert.equal(
    buildKeySpecLine({
      key_specs: {},
      specifications: {
        hardware: { chipset: 'Snapdragon 8 Elite' },
        battery: { capacity_mah: 5000 },
      },
      ram_gb: 12,
      storage_gb: 256,
      battery_mah: null,
    } as never),
    'Snapdragon 8 Elite • 12GB RAM • 256GB • 5000 mAh'
  );
  assert.equal(
    buildKeySpecLine({
      key_specs: null,
      specifications: null,
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
    } as never),
    ''
  );

  // Ratings used on the page: 5-star expert ratings show out of 10, and
  // 10-point user ratings scale to 5 stars.
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 4.6 } as never),
    9.2
  );
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 9.2 } as never),
    9.2
  );
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 0 } as never),
    null
  );
  assert.equal(
    resolveCompareEffectiveUserRating({
      user_rating_weighted: 8.6,
      average_rating: 4,
    } as never),
    4.3
  );
  assert.equal(
    resolveCompareEffectiveUserRating({
      user_rating_weighted: 0,
      average_rating: 4.5,
    } as never),
    4.5
  );

  // DOS/Rate#850: Non-finite/overflowed prices and control characters in buildKeySpecLine.
  assert.equal(peerPriceDelta(Number.NaN, 20_000_000), 0);
  assert.equal(peerPriceDelta(2_000_000_000, 20_000_000), 0);
  assert.equal(
    buildKeySpecLine({
      key_specs: {
        chip: '  A18\u0000\r\nPro  ',
        ram: '8GB',
        storage: '256GB',
        battery: '4685 mAh',
      },
      specifications: {},
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
    } as never),
    'A18 Pro • 8GB • 256GB • 4685 mAh'
  );

  // DOS/Rate#1819: Under RATE_ITEM_MODEL, group category peers by Item before
  // standing & competitor rankings, emit canonical Item URLs, and guard 1v1
  // versus links.
  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevItemModel = process.env.RATE_ITEM_MODEL;
  const prevFetch = globalThis.fetch;
  const { resetRateClientForTests } = await import('../rate-api');
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    resetRateClientForTests();

    const CAT_PHONES = 'c0000000-0000-4000-8000-000000001819';
    const ITEM_SELF = '11111111-1111-4111-8111-111111111819';
    const ITEM_S25 = '11111111-1111-4111-8111-222222221819';
    const ITEM_XIAOMI = '11111111-1111-4111-8111-333333331819';
    const ITEM_VS_SLUG = '11111111-1111-4111-8111-444444441819';

    const V_SELF_128 = '22222222-2222-4222-8222-111111110128';
    const V_SELF_256 = '22222222-2222-4222-8222-111111110256';
    const V_S25_256 = '22222222-2222-4222-8222-222222220256';
    const V_S25_512 = '22222222-2222-4222-8222-222222220512';
    const V_S25_1TB = '22222222-2222-4222-8222-222222221024';
    const V_XIAOMI_512 = '22222222-2222-4222-8222-333333330512';
    const V_VS_STD = '22222222-2222-4222-8222-444444440001';
    const V_PIXEL_LONE = '22222222-2222-4222-8222-555555550128';

    const makePeer = (
      id: string,
      slug: string,
      name: string,
      brand: string,
      minPrice: number,
      ratingScore: number,
      storageGb: number | null = 256
    ): MasterProduct =>
      ({
        id,
        slug,
        name,
        brand,
        model: name,
        model_key: `${brand.toLowerCase()}:${slug}`,
        variant_name: storageGb ? `${storageGb}GB` : null,
        category_id: CAT_PHONES,
        status: 'published',
        storage_gb: storageGb,
        ram_gb: 12,
        min_price: minPrice,
        max_price: minPrice + 1_000_000,
        merchant_count: 3,
        rating_score: ratingScore,
        user_rating_weighted: ratingScore,
        average_rating: ratingScore,
        expert_rating: 9.0,
        authentic_review_count: 12,
        total_reviews: 12,
        images: [],
        thumbnail: null,
        key_specs: { chip: 'Flagship SoC', battery: '5000 mAh' },
        metadata: { category_slug: 'smartphones' },
        specifications: {
          category_slug: 'smartphones',
        } as MasterProduct['specifications'],
      }) as unknown as MasterProduct;

    const storedCategoryPeers: MasterProduct[] = [
      makePeer(
        V_SELF_128,
        'apple-iphone-16-pro-128gb',
        'Apple iPhone 16 Pro 128GB',
        'Apple',
        25_990_000,
        4.8,
        128
      ),
      makePeer(
        V_SELF_256,
        'apple-iphone-16-pro-256gb',
        'Apple iPhone 16 Pro 256GB',
        'Apple',
        28_990_000,
        4.8,
        256
      ),
      makePeer(
        V_S25_256,
        'samsung-galaxy-s25-ultra-256gb',
        'Samsung Galaxy S25 Ultra 256GB',
        'Samsung',
        27_990_000,
        4.9,
        256
      ),
      makePeer(
        V_S25_512,
        'samsung-galaxy-s25-ultra-512gb',
        'Samsung Galaxy S25 Ultra 512GB',
        'Samsung',
        29_490_000,
        4.9,
        512
      ),
      makePeer(
        V_S25_1TB,
        'samsung-galaxy-s25-ultra-1tb',
        'Samsung Galaxy S25 Ultra 1TB',
        'Samsung',
        30_990_000,
        4.9,
        1024
      ),
      makePeer(
        V_XIAOMI_512,
        'xiaomi-15-ultra-512gb',
        'Xiaomi 15 Ultra 512GB',
        'Xiaomi',
        24_990_000,
        4.7,
        512
      ),
      makePeer(
        V_VS_STD,
        'rog-vs-edition-256gb',
        'ASUS ROG VS Edition 256GB',
        'ASUS',
        26_990_000,
        4.6,
        256
      ),
      makePeer(
        V_PIXEL_LONE,
        'google-pixel-10-pro',
        'Google Pixel 10 Pro',
        'Google',
        23_990_000,
        4.6,
        256
      ),
    ];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const q = decodeURIComponent(url.search);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/*',
          },
        });
      if (Number(url.searchParams.get('offset') ?? 0) > 0) return json([]);
      if (url.pathname === '/rest/v1/items') {
        return json([
          {
            id: ITEM_SELF,
            item_key: 'apple:iphone-16-pro',
            slug: 'Apple-iPhone-16-Pro',
            name: 'Apple iPhone 16 Pro',
            brand: 'Apple',
            model: 'iPhone 16 Pro',
            category_id: CAT_PHONES,
            default_variant_id: V_SELF_256,
            min_price: 25_990_000,
            max_price: 29_990_000,
            price_variant_count: 2,
            merchant_count: 6,
            listing_count: 8,
            unknown_variant_listing_count: 0,
            updated_at: '2026-11-21T00:00:00Z',
          },
          {
            id: ITEM_S25,
            item_key: 'samsung:galaxy-s25-ultra',
            slug: 'samsung-galaxy-s25-ultra',
            name: 'Samsung Galaxy S25 Ultra',
            brand: 'Samsung',
            model: 'Galaxy S25 Ultra',
            category_id: CAT_PHONES,
            default_variant_id: V_S25_256,
            min_price: 27_990_000,
            max_price: 31_990_000,
            price_variant_count: 3,
            merchant_count: 7,
            listing_count: 9,
            unknown_variant_listing_count: 0,
            updated_at: '2026-11-21T00:00:00Z',
          },
          {
            id: ITEM_XIAOMI,
            item_key: 'xiaomi:15-ultra',
            slug: 'xiaomi-15-ultra',
            name: 'Xiaomi 15 Ultra',
            brand: 'Xiaomi',
            model: '15 Ultra',
            category_id: CAT_PHONES,
            default_variant_id: V_XIAOMI_512,
            min_price: 24_990_000,
            max_price: 25_990_000,
            price_variant_count: 1,
            merchant_count: 4,
            listing_count: 4,
            unknown_variant_listing_count: 0,
            updated_at: '2026-11-21T00:00:00Z',
          },
          {
            id: ITEM_VS_SLUG,
            item_key: 'asus:rog-vs-edition',
            slug: 'asus-rog-vs-edition',
            name: 'ASUS ROG VS Edition',
            brand: 'ASUS',
            model: 'ROG VS Edition',
            category_id: CAT_PHONES,
            default_variant_id: V_VS_STD,
            min_price: 26_990_000,
            max_price: 27_990_000,
            price_variant_count: 1,
            merchant_count: 2,
            listing_count: 2,
            unknown_variant_listing_count: 0,
            updated_at: '2026-11-21T00:00:00Z',
          },
        ]);
      }
      if (url.pathname === '/rest/v1/master_products') {
        if (q.includes('select=id,item_id&')) {
          return json([
            { id: V_SELF_128, item_id: ITEM_SELF },
            { id: V_SELF_256, item_id: ITEM_SELF },
            { id: V_S25_256, item_id: ITEM_S25 },
            { id: V_S25_512, item_id: ITEM_S25 },
            { id: V_S25_1TB, item_id: ITEM_S25 },
            { id: V_XIAOMI_512, item_id: ITEM_XIAOMI },
            { id: V_VS_STD, item_id: ITEM_VS_SLUG },
            { id: V_PIXEL_LONE, item_id: null },
          ]);
        }
        if (q.includes('item_id=in.')) {
          return json([
            {
              id: V_SELF_128,
              item_id: ITEM_SELF,
              slug: 'apple-iphone-16-pro-128gb',
              name: 'Apple iPhone 16 Pro 128GB',
              variant_key: '128gb',
              variant_name: '128GB',
              sort_order: 1,
              storage_gb: 128,
              min_price: 25_990_000,
              max_price: 26_990_000,
              merchant_count: 4,
            },
            {
              id: V_SELF_256,
              item_id: ITEM_SELF,
              slug: 'apple-iphone-16-pro-256gb',
              name: 'Apple iPhone 16 Pro 256GB',
              variant_key: '256gb',
              variant_name: '256GB',
              sort_order: 2,
              storage_gb: 256,
              min_price: 28_990_000,
              max_price: 29_990_000,
              merchant_count: 5,
            },
            {
              id: V_S25_256,
              item_id: ITEM_S25,
              slug: 'samsung-galaxy-s25-ultra-256gb',
              name: 'Samsung Galaxy S25 Ultra 256GB',
              variant_key: '256gb',
              variant_name: '256GB',
              sort_order: 1,
              storage_gb: 256,
              min_price: 27_990_000,
              max_price: 28_990_000,
              merchant_count: 5,
            },
            {
              id: V_S25_512,
              item_id: ITEM_S25,
              slug: 'samsung-galaxy-s25-ultra-512gb',
              name: 'Samsung Galaxy S25 Ultra 512GB',
              variant_key: '512gb',
              variant_name: '512GB',
              sort_order: 2,
              storage_gb: 512,
              min_price: 29_490_000,
              max_price: 30_490_000,
              merchant_count: 4,
            },
            {
              id: V_S25_1TB,
              item_id: ITEM_S25,
              slug: 'samsung-galaxy-s25-ultra-1tb',
              name: 'Samsung Galaxy S25 Ultra 1TB',
              variant_key: '1024gb',
              variant_name: '1TB',
              sort_order: 3,
              storage_gb: 1024,
              min_price: 30_990_000,
              max_price: 31_990_000,
              merchant_count: 3,
            },
            {
              id: V_XIAOMI_512,
              item_id: ITEM_XIAOMI,
              slug: 'xiaomi-15-ultra-512gb',
              name: 'Xiaomi 15 Ultra 512GB',
              variant_key: '512gb',
              variant_name: '512GB',
              sort_order: 1,
              storage_gb: 512,
              min_price: 24_990_000,
              max_price: 25_990_000,
              merchant_count: 4,
            },
            {
              id: V_VS_STD,
              item_id: ITEM_VS_SLUG,
              slug: 'rog-vs-edition-256gb',
              name: 'ASUS ROG VS Edition 256GB',
              variant_key: '256gb',
              variant_name: '256GB',
              sort_order: 1,
              storage_gb: 256,
              min_price: 26_990_000,
              max_price: 27_990_000,
              merchant_count: 2,
            },
          ]);
        }
      }
      return json([]);
    }) as typeof fetch;

    const { groupCatalogRowsByItem } =
      await import('../../server/rate/item-directory');
    const currentProduct = storedCategoryPeers[1]!; // apple-iphone-16-pro-256gb (28.99M)

    // Flag on: 3 Samsung storage sizes collapse into 1 rival Item, self Item
    // (standing under 128gb) is excluded, and standing counts 5 distinct Items.
    process.env.RATE_ITEM_MODEL = 'item';
    const groupedOn = await groupCatalogRowsByItem(storedCategoryPeers);
    const rivalPeersOn = withoutCurrentItemPeers(groupedOn, {
      productId: currentProduct.id,
      productSlug: currentProduct.slug,
      itemSlug: 'Apple-iPhone-16-Pro',
      // Simulate 128gb failing loadItemPageContext so only itemSlug/route knows it.
      siblingSlugs: [currentProduct.slug],
      siblingIds: [currentProduct.id],
    });
    assert.deepEqual(
      rivalPeersOn.map((p) => resolveCanonicalPeerSlug(p)),
      [
        'samsung-galaxy-s25-ultra',
        'xiaomi-15-ultra',
        'asus-rog-vs-edition',
        'google-pixel-10-pro',
      ],
      'rival peers contain at most one entry per Item and exclude current Item'
    );
    const rankedOn = rankRelatedCompetitors(
      rivalPeersOn,
      currentProduct.slug,
      Number(currentProduct.min_price),
      4
    );
    assert.deepEqual(
      rankedOn.map((p) => ({
        slug: p.slug,
        canonical: resolveCanonicalPeerSlug({
          slug: p.slug,
          item_slug: catalogRowSlug(p),
        }),
        name: p.name,
      })),
      [
        {
          slug: 'samsung-galaxy-s25-ultra-256gb',
          canonical: 'samsung-galaxy-s25-ultra',
          name: 'Samsung Galaxy S25 Ultra',
        },
        {
          slug: 'rog-vs-edition-256gb',
          canonical: 'asus-rog-vs-edition',
          name: 'ASUS ROG VS Edition',
        },
        {
          slug: 'xiaomi-15-ultra-512gb',
          canonical: 'xiaomi-15-ultra',
          name: 'Xiaomi 15 Ultra',
        },
        {
          slug: 'google-pixel-10-pro',
          canonical: 'google-pixel-10-pro',
          name: 'Google Pixel 10 Pro',
        },
      ],
      'Samsung S25 Ultra appears once (cheapest 256GB standing row) instead of 3 times'
    );

    const standingOn = computeProductStandingInCategory(
      currentProduct,
      rivalPeersOn
    );
    const combinedBadgeOn = standingOn.find((b) => b.criterion === 'combined');
    assert.ok(combinedBadgeOn);
    assert.equal(
      combinedBadgeOn.totalInCategory,
      5,
      'category standing counts 5 distinct Items (4 rivals + current Item)'
    );
    assert.equal(
      combinedBadgeOn.rank,
      2,
      'ranks #2 behind 1 Samsung Item rather than #4 behind 3 Samsung variants'
    );

    // Canonical & guarded 1v1 versus links:
    const peerSlugMap = buildPeerItemSlugMap(
      { slug: currentProduct.slug, itemSlug: 'Apple-iPhone-16-Pro' },
      rankedOn
    );
    assert.ok(peerSlugMap);
    // 1. Samsung S25 Ultra -> canonical sorted Item 1v1 URL, 0 redirect hops.
    const vsSamsung = resolvePeerVersusHref(
      currentProduct.slug,
      rankedOn[0]!.slug,
      peerSlugMap
    );
    assert.equal(
      vsSamsung,
      '/compare/Apple-iPhone-16-Pro-vs-samsung-galaxy-s25-ultra'
    );
    const s25Sides = vsSamsung!.replace(/^\/compare\//, '').split('-vs-');
    assert.equal(s25Sides.length, 2);
    assert.equal(isParseableVersusPair(s25Sides[0]!, s25Sides[1]!), true);
    const selfRes: CompareResolution = {
      kind: 'item',
      item: {
        id: ITEM_SELF,
        slug: 'Apple-iPhone-16-Pro',
        default_variant_id: V_SELF_256,
      },
      variants: [
        {
          id: V_SELF_256,
          slug: 'apple-iphone-16-pro-256gb',
          variant_key: '256gb',
        },
      ],
    };
    const s25Res: CompareResolution = {
      kind: 'item',
      item: {
        id: ITEM_S25,
        slug: 'samsung-galaxy-s25-ultra',
        default_variant_id: V_S25_256,
      },
      variants: [
        {
          id: V_S25_256,
          slug: 'samsung-galaxy-s25-ultra-256gb',
          variant_key: '256gb',
        },
      ],
    };
    assert.deepEqual(
      planVersusRoute(
        { slug: s25Sides[0]!, resolution: selfRes },
        { slug: s25Sides[1]!, resolution: s25Res }
      ),
      {
        kind: 'render',
        slugA: 'apple-iphone-16-pro-256gb',
        slugB: 'samsung-galaxy-s25-ultra-256gb',
        canonical: vsSamsung,
      },
      'emitted 1v1 link renders directly in planVersusRoute without 308 or 404'
    );

    // 2. ASUS ROG VS Edition (`item_slug: 'asus-rog-vs-edition'`) -> detail URL
    //    uses canonical Item slug, while 1v1 link is suppressed (null) because
    //    `planVersusRoute` 404s any Item slug containing `-vs-` (#1275).
    assert.equal(resolveCanonicalPeerSlug(rankedOn[1]!), 'asus-rog-vs-edition');
    assert.equal(
      resolvePeerVersusHref(
        currentProduct.slug,
        rankedOn[1]!.slug,
        peerSlugMap
      ),
      null,
      'suppresses 1v1 link when rival Item slug contains -vs-'
    );

    // 3. Unlinked Google Pixel 10 Pro -> pairs canonical current Item with lone slug.
    assert.equal(
      resolvePeerVersusHref(
        currentProduct.slug,
        rankedOn[3]!.slug,
        peerSlugMap
      ),
      '/compare/Apple-iPhone-16-Pro-vs-google-pixel-10-pro'
    );

    // 4. Multi-item `/compare?slugs=` tokens pin multi-size Items and keep
    //    single-size Item / unlinked slugs unambiguous.
    assert.equal(
      resolvePeerCompareToken({
        id: currentProduct.id,
        slug: currentProduct.slug,
        item_slug: 'Apple-iPhone-16-Pro',
        variant_key: '256gb',
      }),
      'Apple-iPhone-16-Pro@256gb'
    );
    assert.equal(
      resolvePeerCompareToken(rankedOn[0]!),
      'samsung-galaxy-s25-ultra@256gb'
    );
    assert.equal(resolvePeerCompareToken(rankedOn[2]!), 'xiaomi-15-ultra');
    assert.equal(resolvePeerCompareToken(rankedOn[3]!), 'google-pixel-10-pro');

    // Shared-slug multi-size Item (`item_slug === slug`) still pins `@variantKey`
    // so `/compare` selects the standing size instead of `default_variant_id`.
    assert.equal(
      resolvePeerCompareToken({
        id: 'v-base-256',
        slug: 'base',
        item_slug: 'base',
        item_variants: [
          { id: 'v-base-256', variant_key: '256gb' },
          { id: 'v-base-512', variant_key: '512gb' },
        ],
      }),
      'base@256gb'
    );

    // `buildPeerCompareHref` preserves category (`cat=`) and appends
    // `variant.<token>=<slug>` fallback hints for irregular / 1TB / shared-slug
    // / retail-alias masters while staying clean when pins match directly.
    assert.equal(
      buildPeerCompareHref('smartphones', [
        {
          id: currentProduct.id,
          slug: 'apple-iphone-16-pro-256gb',
          item_slug: 'apple-iphone-16-pro',
          variant_key: '256gb',
        },
        {
          id: V_S25_256,
          slug: 'samsung-galaxy-s25-ultra-256gb',
          item_slug: 'samsung-galaxy-s25-ultra',
          variant_key: '256gb',
        },
      ]),
      '/compare?cat=smartphones&slugs=apple-iphone-16-pro@256gb,samsung-galaxy-s25-ultra@256gb'
    );
    assert.equal(
      buildPeerCompareHref('laptops', [
        {
          id: 'v-1tb',
          slug: 'macbook-pro-14-1tb',
          item_slug: 'macbook-pro-14',
          variant_key: '1024gb',
        },
        {
          id: 'v-base-256',
          slug: 'base',
          item_slug: 'base',
          variant_key: '256gb',
        },
      ]),
      '/compare?cat=laptops&slugs=macbook-pro-14@1024gb,base@256gb&variant.macbook-pro-14%401024gb=macbook-pro-14-1tb&variant.base%40256gb=base'
    );

    // `nullable_variant` mode groups identically to `item` mode:
    process.env.RATE_ITEM_MODEL = 'nullable_variant';
    const groupedNullable = await groupCatalogRowsByItem(storedCategoryPeers);
    assert.equal(groupedNullable.length, groupedOn.length);

    // 5. Edge-case guards: unsafe Item & fallback slugs, control characters,
    //    prototype keys, same-Item pairs, `-vs` suffix reversal, and unparseable
    //    `-vs` collisions.
    for (const unsafe of [
      '../evil',
      'a/b',
      '__proto__',
      'constructor',
      'null',
      '0',
      `a${'b'.repeat(120)}`,
    ]) {
      assert.equal(
        resolveCanonicalPeerSlug({
          slug: 'safe-peer-slug',
          item_slug: unsafe,
        }),
        'safe-peer-slug',
        `unsafe item_slug ${unsafe} falls back to variant slug`
      );
      assert.equal(
        resolveCanonicalPeerSlug({
          slug: unsafe,
          item_slug: unsafe,
        }),
        '',
        `unsafe fallback slug ${unsafe} returns empty string`
      );
    }
    assert.equal(resolveCanonicalPeerSlug({ slug: '..' }), '');
    assert.equal(
      resolveCanonicalPeerSlug({ slug: '_retail-1tb' }),
      '_retail-1tb',
      'underscore-prefixed legacy master slug remains valid'
    );
    assert.deepEqual(
      withoutCurrentItemPeers(
        [
          { slug: 'apple-iphone-16-pro-256gb\u0000' },
          { slug: '..' },
          { slug: 'constructor', item_slug: 'constructor' },
          { slug: 'valid-rival-phone\u0000' },
        ],
        { productSlug: 'apple-iphone-16-pro-256gb' }
      ).map((p) => resolveCanonicalPeerSlug(p)),
      ['valid-rival-phone'],
      'strips control chars when matching skipSlugs and drops unsafe slugs'
    );
    const protoMap = buildPeerItemSlugMap(
      { slug: '__proto__', itemSlug: 'safe-item-a' },
      [{ slug: 'constructor', item_slug: 'safe-item-b' }]
    );
    assert.equal(Object.getPrototypeOf(protoMap), null);
    assert.equal(
      resolvePeerVersusHref('__proto__', 'constructor', protoMap),
      '/compare/safe-item-a-vs-safe-item-b'
    );
    assert.equal(
      resolvePeerVersusHref('v-a', 'v-b', {
        'v-a': 'Same-Item',
        'v-b': 'same-item',
      }),
      null,
      'same Item across two variant slugs never emits a 1v1 link'
    );
    assert.equal(
      resolvePeerVersusHref('v-a', 'v-b', {
        'v-a': 'a-phone-vs',
        'v-b': 'z-phone',
      }),
      '/compare/z-phone-vs-a-phone-vs',
      'slug ending in -vs reverses to the parseable order'
    );
    assert.equal(
      resolvePeerVersusHref('vs-a-phone-vs', 'vs-b-phone-vs'),
      null,
      'pair unparseable in both orders returns null'
    );

    // 6. Flag off: peers stay ungrouped, map is null, 1v1 links use variant slugs.
    delete process.env.RATE_ITEM_MODEL;
    const groupedOff = await groupCatalogRowsByItem(storedCategoryPeers);
    assert.equal(groupedOff, storedCategoryPeers);
    assert.equal(
      buildPeerItemSlugMap(
        { slug: currentProduct.slug, itemSlug: null },
        groupedOff
      ),
      null
    );
    assert.equal(
      resolvePeerVersusHref(
        currentProduct.slug,
        'samsung-galaxy-s25-ultra-256gb',
        null
      ),
      '/compare/apple-iphone-16-pro-256gb-vs-samsung-galaxy-s25-ultra-256gb'
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;
    }
    if (prevSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevSupabaseAnonKey;
    }
    if (prevItemModel === undefined) {
      delete process.env.RATE_ITEM_MODEL;
    } else {
      process.env.RATE_ITEM_MODEL = prevItemModel;
    }
    resetRateClientForTests();
  }

  // Verify ProductDetailView wires groupCatalogRowsByItem, canonical Item hrefs,
  // and guarded 1v1 links (#1819).
  const pdvSource = readFileSync(
    join(here, '../../app/[locale]/smartphones/[slug]/page.tsx'),
    'utf8'
  );
  assert.match(pdvSource, /groupCatalogRowsByItem\(storedCategoryPeers\)/);
  assert.match(pdvSource, /withoutCurrentItemPeers\(/);
  assert.match(pdvSource, /catalogRowSlug\(peer\)/);
  assert.match(pdvSource, /resolvePeerVersusHref\(/);
  assert.match(pdvSource, /isParseableVersusPair\(/);

  console.warn('✅ Product competitors suite passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
