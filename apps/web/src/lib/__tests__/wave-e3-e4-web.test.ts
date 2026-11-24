import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { MasterProduct } from '@repo/shared-data';
import ProductCard from '../../components/product/ProductCard';
import { EMPTY_RADAR_SIGNAL } from '../deal-radar';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  CORE_TECH_CATEGORY_SLUGS,
  WAVE_E1_CATEGORY_SLUGS,
  WAVE_E2_SERVICE_CATEGORY_SLUGS,
  WAVE_E3_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  isCategoryVisibleInDirectory,
  isPlaceCategorySlug,
  isWaveE3CategorySlug,
  isWaveE4PlaceCategorySlug,
} from '../rate-domain-core';
import {
  CATEGORY_FILTER_SCHEMAS,
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
} from '../category-filters';
import {
  formatListingPrice,
  hasListingUnitSuffix,
  resolveListingUnitSuffix,
} from '../locale-format';
import {
  buildPlaceStructuredData,
  formatPlaceLocationBadge,
  formatPlaceReferencePriceRange,
  resolvePlaceJsonLdType,
  sanitizePlaceBranchGroupKey,
  sanitizePlaceCoordinates,
  sanitizePlacePhone,
  sanitizePlaceWebsiteUrl,
} from '../place-details';
import {
  getMasterPlaceDetail,
  getMasterPlaceDetailsBatch,
  getPlaceBranchSiblings,
  type RateSchemaClient,
} from '../rate-api';
import { leaderboardCriteriaForCategory } from '../leaderboard-engine';
import { CLIENT_MESSAGE_SCOPES } from '../client-messages';
import { computeCrossPlatformDealRadarFromData } from '../../server/rate/deals';
import { buildRateOpenApiSpec } from '../../server/rate/openapi';
import { MCP_TOOL_DEFINITIONS } from '../../server/rate/mcp';

const webRoot = join(__dirname, '..', '..', '..');

// 1. Canonical 19-category exports, Wave E3/E4 guards & keyword fallback
assert.equal(CORE_TECH_CATEGORY_SLUGS.length, 5);
assert.equal(WAVE_E1_CATEGORY_SLUGS.length, 5);
assert.equal(WAVE_E2_SERVICE_CATEGORY_SLUGS.length, 2);
assert.equal(WAVE_E3_CATEGORY_SLUGS.length, 3);
assert.equal(WAVE_E4_PLACE_CATEGORY_SLUGS.length, 4);
assert.equal(ALL_CANONICAL_CATEGORY_SLUGS.length, 19);

for (const slug of WAVE_E3_CATEGORY_SLUGS) {
  assert.equal(isCanonicalCategorySlug(slug), true);
  assert.equal(isWaveE3CategorySlug(slug), true);
  assert.equal(isPlaceCategorySlug(slug), false);
}
for (const slug of WAVE_E4_PLACE_CATEGORY_SLUGS) {
  assert.equal(isCanonicalCategorySlug(slug), true);
  assert.equal(isWaveE4PlaceCategorySlug(slug), true);
  assert.equal(isPlaceCategorySlug(slug), true);
  assert.equal(isWaveE3CategorySlug(slug), false);
}

const keywordSamples: Array<[string, string]> = [
  ['Blackmores Omega-3 Double Strength 90 viên', 'supplements'],
  ['La Roche-Posay Cicaplast Baume B5 Serum', 'cosmetics'],
  ['Bỉm quần Huggies Platinum Nature Made M54', 'mother-baby'],
  ['Nhà hàng Phở Thìn 13 Lò Đúc', 'restaurants'],
  ['Quán cà phê Katinat Saigon Kafe', 'cafes'],
  ['Khách sạn Park Hyatt Saigon 5 sao', 'hotels'],
  ['Homestay Pine Hill Đà Lạt View Rừng Thông', 'homestays'],
];
for (const [name, expectedSlug] of keywordSamples) {
  const detected = getMasterProductCategorySlug({
    slug: 'sample-slug',
    name,
  });
  assert.equal(
    detected,
    expectedSlug,
    `"${name}" must classify as ${expectedSlug} instead of falling back to smartphones`
  );
  assert.equal(
    getMasterProductHref({ slug: 'sample-slug', name }),
    `/${expectedSlug}/sample-slug`
  );
}

// 2. Empty-category gating & 14 new route files
for (const slug of [
  ...WAVE_E3_CATEGORY_SLUGS,
  ...WAVE_E4_PLACE_CATEGORY_SLUGS,
]) {
  assert.equal(isCategoryVisibleInDirectory(slug, 0), false);
  assert.equal(isCategoryVisibleInDirectory(slug, 0, slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 1), true);
  assert.equal(
    existsSync(join(webRoot, 'src/app/[locale]', slug, 'page.tsx')),
    true,
    `missing catalog route for ${slug}`
  );
  assert.equal(
    existsSync(join(webRoot, 'src/app/[locale]', slug, '[slug]/page.tsx')),
    true,
    `missing detail route for ${slug}`
  );
  assert.deepEqual(leaderboardCriteriaForCategory(slug), ['value']);
}

// 3. Minimal non-mobile filter schemas across all 7 categories
const localeCatalogs = Object.fromEntries(
  (['vi', 'en', 'cs'] as const).map((loc) => [
    loc,
    JSON.parse(readFileSync(join(webRoot, 'locales', `${loc}.json`), 'utf8')),
  ])
);

for (const slug of [
  ...WAVE_E3_CATEGORY_SLUGS,
  ...WAVE_E4_PLACE_CATEGORY_SLUGS,
]) {
  const schema = CATEGORY_FILTER_SCHEMAS[slug];
  assert.ok(schema, `CATEGORY_FILTER_SCHEMAS missing ${slug}`);
  assert.equal(schema.categorySlug, slug);
  assert.deepEqual(schema.ramOptionsGb, []);
  assert.deepEqual(schema.storageOptionsGb, []);
  assert.deepEqual(schema.featureCheckboxes, []);
  assert.equal(getCategoryFilterSchema(slug).categorySlug, slug);

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const catalogMsg = localeCatalogs[loc].catalog as Record<string, unknown>;
    const tMock = (key: string) => {
      const parts = key.split('.');
      let cur: unknown = catalogMsg;
      for (const p of parts) {
        cur =
          cur && typeof cur === 'object'
            ? (cur as Record<string, unknown>)[p]
            : undefined;
      }
      assert.equal(typeof cur, 'string', `${loc}.catalog.${key} missing`);
      return cur as string;
    };
    const localized = localizeCategoryFilterSchema(schema, tMock);
    assert.ok(localized.categoryTitle.length > 0);
    assert.ok(localized.categorySubtitle.length > 0);
  }
}

// 4. Unit suffixes & place reference price ranges (with override and zero double suffixes)
assert.equal(resolveListingUnitSuffix('VND', 'restaurants', 'vi'), '/người');
assert.equal(resolveListingUnitSuffix('VND', 'cafes', 'en'), '/person');
assert.equal(resolveListingUnitSuffix('VND', 'restaurants', 'cs'), '/os.');
assert.equal(resolveListingUnitSuffix('VND', 'hotels', 'vi'), '/đêm');
assert.equal(resolveListingUnitSuffix('VND', 'homestays', 'en'), '/night');
assert.equal(resolveListingUnitSuffix('VND', 'hotels', 'cs'), '/noc');
assert.equal(
  resolveListingUnitSuffix('VND', 'hotels', 'vi', 'vnd_per_person'),
  '/người',
  'explicit price_unit overrides category default'
);
assert.equal(
  resolveListingUnitSuffix('VND', 'cafes', 'en', 'vnd_per_night_ref'),
  '/night'
);
assert.equal(resolveListingUnitSuffix('VND', 'supplements', 'vi'), '');
assert.equal(resolveListingUnitSuffix('VND', 'cosmetics', 'en'), '');
assert.equal(resolveListingUnitSuffix('VND', 'mother-baby', 'cs'), '');

assert.equal(hasListingUnitSuffix('VND', 'restaurants'), true);
assert.equal(hasListingUnitSuffix('VND', 'supplements'), false);
assert.equal(
  hasListingUnitSuffix('VND', 'supplements', 'vnd_per_person'),
  true
);

assert.equal(
  formatListingPrice(150_000, 'VND', 'vi', {
    categorySlug: 'restaurants',
    includeUnitSuffix: false,
  }),
  '150.000 ₫'
);
assert.equal(
  formatPlaceReferencePriceRange({
    priceMin: 150_000,
    priceMax: 350_000,
    categorySlug: 'restaurants',
    locale: 'vi',
  }),
  '150.000 ₫ - 350.000 ₫/người'
);
assert.equal(
  formatPlaceReferencePriceRange({
    priceMin: 1_200_000,
    priceMax: 2_500_000,
    categorySlug: 'hotels',
    priceUnit: 'vnd_per_night_ref',
    locale: 'en',
  }),
  '1.200.000 ₫ - 2.500.000 ₫/night'
);

// 5. Place sanitization & JSON-LD
assert.equal(sanitizePlaceWebsiteUrl('javascript:alert(1)'), null);
assert.equal(
  sanitizePlaceWebsiteUrl('data:text/html,<script>1</script>'),
  null
);
assert.equal(sanitizePlaceWebsiteUrl('vbscript:msgbox(1)'), null);
assert.equal(sanitizePlaceWebsiteUrl('https://user:pass@rate.vn/place'), null);
assert.equal(sanitizePlaceWebsiteUrl('https://rate.vn:8443/place'), null);
assert.equal(sanitizePlaceWebsiteUrl('http://localhost:3000/place'), null);
assert.equal(sanitizePlaceWebsiteUrl('https://rate.vn/bad path'), null);
assert.equal(
  sanitizePlaceWebsiteUrl('https://pho-thin.vn/menu'),
  'https://pho-thin.vn/menu'
);

assert.deepEqual(sanitizePlacePhone('+84 28 3823 6688'), {
  display: '+84 28 3823 6688',
  href: 'tel:+842838236688',
});
assert.equal(sanitizePlacePhone('123'), null);
assert.deepEqual(sanitizePlacePhone('+84\u00001234567'), {
  display: '+84 1234567',
  href: 'tel:+841234567',
});
assert.equal(sanitizePlacePhone('javascript:alert(1)'), null);

const zeroCoords = sanitizePlaceCoordinates(0, 0);
assert.ok(
  zeroCoords,
  '0,0 coordinates must be accepted rather than treated falsy'
);
assert.equal(zeroCoords.latText, '0.000000');
assert.equal(zeroCoords.lngText, '0.000000');
assert.ok(zeroCoords.mapUrl.includes('mlat=0.000000&mlon=0.000000'));
assert.equal(sanitizePlaceCoordinates(91, 106), null);
assert.equal(sanitizePlaceCoordinates(10, -181), null);
assert.equal(sanitizePlaceCoordinates(null, 106), null);

assert.equal(sanitizePlaceBranchGroupKey('__proto__'), null);
assert.equal(sanitizePlaceBranchGroupKey('constructor'), null);
assert.equal(sanitizePlaceBranchGroupKey('prototype'), null);
assert.equal(sanitizePlaceBranchGroupKey('UpperCase-Key'), null);
assert.equal(
  sanitizePlaceBranchGroupKey('highlands-coffee_vn'),
  'highlands-coffee_vn'
);
assert.equal(
  formatPlaceLocationBadge('quan-1', 'ho-chi-minh'),
  'Quan 1, Ho Chi Minh'
);

assert.equal(resolvePlaceJsonLdType('restaurants'), 'Restaurant');
assert.equal(resolvePlaceJsonLdType('cafes'), 'CafeOrCoffeeShop');
assert.equal(resolvePlaceJsonLdType('hotels'), 'Hotel');
assert.equal(resolvePlaceJsonLdType('homestays'), 'LodgingBusiness');

const placeSchema = buildPlaceStructuredData({
  name: 'Pho Thin Lo Duc',
  categorySlug: 'restaurants',
  canonicalUrl: 'https://rate.vn/restaurants/pho-thin-lo-duc',
  placeDetail: {
    master_id: '11111111-1111-4111-8111-111111111111',
    place_key: 'vn:hanoi:pho-thin-lo-duc',
    branch_group_key: 'pho-thin',
    geo_lat: 0,
    geo_lng: 0,
    geohash7: null,
    address: '13 Lo Duc',
    province_code: 'ha-noi',
    district_code: 'hai-ba-trung',
    price_min: 70_000,
    price_max: 95_000,
    price_tier: '$$',
    price_unit: 'vnd_per_person',
    opening_hours: '06:00-21:00',
    phone: '+84 24 3971 2738',
    website: 'https://phothin.vn',
    cuisine: 'Pho Ha Noi',
    star_rating: null,
    overture_confidence: 0.95,
    created_at: '',
    updated_at: '',
  },
  ratingValue: 4.7,
  ratingCount: 0,
});
assert.equal(placeSchema['@type'], 'Restaurant');
assert.equal(placeSchema.priceRange, '$$');
assert.equal(placeSchema.telephone, '+84 24 3971 2738');
assert.equal(placeSchema.servesCuisine, 'Pho Ha Noi');
assert.deepEqual(placeSchema.geo, {
  '@type': 'GeoCoordinates',
  latitude: 0,
  longitude: 0,
});
assert.equal(
  'aggregateRating' in placeSchema,
  false,
  'omit aggregateRating when ratingCount is 0'
);

// 6. Hardened Place DB readers (branch query filters + invalid input short-circuits)
async function verifyPlaceDbReaders() {
  let called = false;
  const mockNeverCalledClient = {
    from: () => {
      called = true;
      throw new Error('must not call DB on invalid key');
    },
  } as unknown as RateSchemaClient;

  for (const badKey of [
    '__proto__',
    'constructor',
    'prototype',
    'Bad Key!',
    'a/b',
    '',
  ]) {
    const res = await getPlaceBranchSiblings(
      badKey,
      '11111111-1111-4111-8111-111111111111',
      { client: mockNeverCalledClient }
    );
    assert.deepEqual(res, []);
  }
  assert.equal(called, false);

  const recordedCalls: Array<{ op: string; args: unknown[] }> = [];
  const fakeSiblingRows = [
    {
      master_id: '22222222-2222-4222-8222-222222222222',
      address: '42 Tran Quoc Thao',
      province_code: 'ho-chi-minh',
      district_code: 'quan-3',
      price_min: 45_000,
      price_max: 75_000,
      price_tier: '$',
      price_unit: 'vnd_per_person',
      master_products: {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'katinat-tran-quoc-thao',
        name: 'Katinat Tran Quoc Thao',
        model: 'Katinat',
        category_id: null,
        metadata: { category_slug: 'cafes' },
        specifications: null,
        status: 'published',
        entity_type: 'place',
        rating_score: 4.5,
        total_reviews: 12,
      },
    },
    {
      master_id: '33333333-3333-4333-8333-333333333333',
      address: 'Draft leak',
      province_code: 'ho-chi-minh',
      district_code: 'quan-1',
      price_min: 50_000,
      price_max: 80_000,
      price_tier: '$',
      price_unit: 'vnd_per_person',
      master_products: {
        id: '33333333-3333-4333-8333-333333333333',
        slug: 'katinat-draft',
        name: 'Katinat Draft',
        model: 'Katinat',
        category_id: null,
        metadata: { category_slug: 'cafes' },
        specifications: null,
        status: 'draft',
        entity_type: 'place',
        rating_score: 4.9,
        total_reviews: 99,
      },
    },
  ];
  const siblingBuilder = {
    select(sel: string) {
      recordedCalls.push({ op: 'select', args: [sel] });
      return siblingBuilder;
    },
    eq(col: string, val: unknown) {
      recordedCalls.push({ op: 'eq', args: [col, val] });
      return siblingBuilder;
    },
    neq(col: string, val: unknown) {
      recordedCalls.push({ op: 'neq', args: [col, val] });
      return siblingBuilder;
    },
    limit(n: number) {
      recordedCalls.push({ op: 'limit', args: [n] });
      return Promise.resolve({ data: fakeSiblingRows, error: null });
    },
  };
  const mockSiblingClient = {
    from: (table: string) => {
      recordedCalls.push({ op: 'from', args: [table] });
      return siblingBuilder;
    },
  } as unknown as RateSchemaClient;

  const siblings = await getPlaceBranchSiblings(
    'katinat-chain',
    '11111111-1111-4111-8111-111111111111',
    { client: mockSiblingClient, categorySlugById: new Map() }
  );
  assert.equal(siblings.length, 1);
  assert.equal(siblings[0]?.slug, 'katinat-tran-quoc-thao');
  assert.equal(siblings[0]?.href, '/cafes/katinat-tran-quoc-thao');
  assert.ok(
    recordedCalls.some(
      (c) =>
        c.op === 'eq' &&
        c.args[0] === 'master_products.status' &&
        c.args[1] === 'published'
    )
  );
  assert.ok(
    recordedCalls.some(
      (c) =>
        c.op === 'eq' &&
        c.args[0] === 'master_products.entity_type' &&
        c.args[1] === 'place'
    )
  );
  assert.ok(
    recordedCalls.some(
      (c) =>
        c.op === 'neq' &&
        c.args[0] === 'master_id' &&
        c.args[1] === '11111111-1111-4111-8111-111111111111'
    )
  );
  assert.ok(recordedCalls.some((c) => c.op === 'limit' && c.args[0] === 24));

  const detailBuilder = {
    select: () => detailBuilder,
    eq: () => detailBuilder,
    maybeSingle: () =>
      Promise.resolve({
        data: {
          master_id: '11111111-1111-4111-8111-111111111111',
          place_key: 'vn:hcm:katinat-dong-khoi',
          branch_group_key: 'katinat-chain',
          geo_lat: '0',
          geo_lng: 0,
          geohash7: null,
          address: '101 Dong Khoi',
          province_code: 'ho-chi-minh',
          district_code: 'quan-1',
          price_min: 55000,
          price_max: 89000,
          price_tier: '$$',
          price_unit: 'vnd_per_person',
          opening_hours: '07:00-22:30',
          phone: '+84 28 3823 6688',
          website: 'javascript:alert(1)',
          cuisine: 'Coffee & Tea',
          star_rating: '4.5',
          overture_confidence: 0.91,
          created_at: '2026-11-24T00:00:00Z',
          updated_at: '2026-11-24T00:00:00Z',
        },
        error: null,
      }),
  };
  const detail = await getMasterPlaceDetail(
    '11111111-1111-4111-8111-111111111111',
    {
      client: { from: () => detailBuilder } as unknown as RateSchemaClient,
    }
  );
  assert.ok(detail);
  assert.equal(detail.geo_lat, 0);
  assert.equal(detail.geo_lng, 0);
  assert.equal(
    detail.website,
    null,
    'unsafe website stripped at read boundary'
  );
  assert.equal(detail.star_rating, 4.5);

  const batchBuilder = {
    select: () => batchBuilder,
    in: () =>
      Promise.resolve({
        data: [
          {
            master_id: '11111111-1111-4111-8111-111111111111',
            province_code: 'ho-chi-minh',
            district_code: 'quan-1',
            price_min: 55000,
            price_max: 89000,
            price_tier: '$$',
            price_unit: 'vnd_per_person',
            cuisine: 'Coffee',
            star_rating: null,
          },
        ],
        error: null,
      }),
  };
  const batch = await getMasterPlaceDetailsBatch(
    ['11111111-1111-4111-8111-111111111111'],
    { client: { from: () => batchBuilder } as unknown as RateSchemaClient }
  );
  assert.equal(batch.size, 1);
  assert.equal(
    batch.get('11111111-1111-4111-8111-111111111111')?.price_unit,
    'vnd_per_person'
  );
}

// 7. Deals radar excludes places while supporting Wave E3 retail categories
const dealRadarMixed = computeCrossPlatformDealRadarFromData(
  [
    {
      master: {
        id: '44444444-4444-4444-8444-444444444444',
        slug: 'pho-place',
        name: 'Pho Place',
        brand: 'Pho Place',
        model: 'Pho Place',
        model_key: 'pho-place',
        min_price: 60_000,
        max_price: 80_000,
        merchant_count: 1,
        status: 'published',
        entity_type: 'place',
        metadata: { category_slug: 'restaurants' },
      } as unknown as MasterProduct,
      offers: [
        {
          id: 'off-place',
          platform: 'shopee',
          title: 'Pho voucher',
          price_current: 40_000,
          price_original: 90_000,
          availability: 'in_stock',
          url: 'https://shopee.vn/item/1',
          merchant: {
            id: 'm1',
            name: 'M1',
            platform: 'shopee',
            trust_score: 90,
          },
        } as never,
      ],
    },
  ],
  { categorySlug: 'all', limit: 20 }
);
assert.equal(dealRadarMixed.genuineDeals.length, 0);
assert.equal(dealRadarMixed.fakeSaleTraps.length, 0);
assert.equal(dealRadarMixed.priceSpreadLeaders.length, 0);

// 8. OpenAPI & MCP & Server-only PlaceDetails & ClientMessages guards
const spec = buildRateOpenApiSpec('https://rate.vn') as unknown as {
  components: {
    schemas: {
      SupportedEcommercePlatform: { enum: string[] };
      CanonicalRateCategorySlug: { enum: string[] };
    };
  };
};
assert.equal(
  spec.components.schemas.SupportedEcommercePlatform.enum.length,
  22
);
assert.equal(spec.components.schemas.CanonicalRateCategorySlug.enum.length, 19);
assert.ok(MCP_TOOL_DEFINITIONS.length > 0);
assert.equal(
  (CLIENT_MESSAGE_SCOPES.productDetail as readonly string[]).includes(
    'placeDetail'
  ),
  false,
  'placeDetail stays server-only and out of productDetail client payload'
);

const placeSectionSrc = readFileSync(
  join(webRoot, 'src/components/product/PlaceDetailsSection.tsx'),
  'utf8'
);
assert.equal(/['"]use client['"]/.test(placeSectionSrc), false);
assert.equal(placeSectionSrc.includes('dangerouslySetInnerHTML'), false);
assert.equal(/[\u2013\u2014]/.test(placeSectionSrc), false);

// 9. ProductCard range & saleState guards for places
const IntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: typeof localeCatalogs.en;
  children?: React.ReactNode;
}>;

const noStockCardHtml = renderToStaticMarkup(
  React.createElement(
    IntlProvider,
    { locale: 'en', messages: localeCatalogs.en },
    React.createElement(ProductCard, {
      slug: 'pho-thin',
      href: '/restaurants/pho-thin',
      categoryPath: '/restaurants',
      name: 'Pho Thin',
      brand: 'Pho Thin',
      thumbnail: null,
      userScore: 4.6,
      reviewCount: 10,
      expertScore: null,
      radarSignal: EMPTY_RADAR_SIGNAL,
      minPrice: 0,
      maxPrice: 350_000,
      currency: 'VND',
      priceUnit: 'vnd_per_person',
      merchantCount: 0,
      saleState: 'no_stock',
    })
  )
);
assert.equal(
  noStockCardHtml.includes('350'),
  false,
  'no_stock card must not render orphaned priceUpTo'
);

const pricedPlaceCardHtml = renderToStaticMarkup(
  React.createElement(
    IntlProvider,
    { locale: 'en', messages: localeCatalogs.en },
    React.createElement(ProductCard, {
      slug: 'pho-thin',
      href: '/restaurants/pho-thin',
      categoryPath: '/restaurants',
      name: 'Pho Thin',
      brand: 'Pho Thin',
      thumbnail: null,
      userScore: 4.6,
      reviewCount: 10,
      expertScore: null,
      radarSignal: EMPTY_RADAR_SIGNAL,
      minPrice: 150_000,
      maxPrice: 350_000,
      currency: 'VND',
      priceUnit: 'vnd_per_person',
      merchantCount: 0,
      saleState: 'on_sale',
    })
  )
);
assert.equal(pricedPlaceCardHtml.includes('150.000 ₫/person'), true);
assert.equal(pricedPlaceCardHtml.includes('350.000 ₫/person'), true);

verifyPlaceDbReaders()
  .then(() => {
    console.warn('wave-e3-e4-web.test.ts passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
