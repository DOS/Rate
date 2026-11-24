/**
 * Deterministic verification suite for Wave E3 (retail consumables) and
 * Wave E4 PA2 (places) Open-Core readiness across @repo/shared-data and @repo/crawlers.
 * Zero live network, zero prod DDL, and zero private collector logic.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EntityTypeSchema,
  PlaceDetailSchema,
  PlacePriceTierSchema,
  PlacePriceUnitSchema,
  SupportedEcommercePlatformSchema,
  SupportedIngestionPlatformSchema,
} from '@repo/shared-data';
import {
  MINIMUM_RETAIL_CONSUMABLE_PRICE_FLOOR_VND,
  RATING_CRITERIA_ALL_CATEGORIES,
  RATING_CRITERIA_V3_VERSION,
  RATING_CRITERIA_VERSION,
  RATING_CRITERION_KEYS,
  V3_RATING_CRITERIA_CATEGORIES,
  getRatingCriteria,
  getRatingCriteriaVersion,
  minimumListingPriceVnd,
} from '@repo/shared-data/rules';
import { EntityMatcher } from '../entity-matcher.js';
import {
  AiReviewAnalyzer,
  assessReview6Axes,
  isShippingOnlyComment,
} from '../ai-review-analyzer.js';
import { buildRequests } from '../jobs/review-ai-points.js';
import {
  ProductNormalizer,
  SIZELESS_CATEGORY_SLUGS,
  WAVE_E3_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  isAccessoryTitle,
} from '../product-normalizer.js';
import {
  RATING_CRITERIA_V3_VERSION as PROMPT_V3_VERSION,
  aiCategoryOpen,
  checkReviewPoints,
  reviewAiInstructions,
  reviewTextHash,
} from '../review-ai-prompt.js';
import { ShopeeIngestionPipeline, upsertPlaceDetails } from '../shopee-to-supabase.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

interface RecordedMutation {
  table: string;
  op: 'insert' | 'upsert' | 'update';
  payload: unknown;
  options?: unknown;
}

interface RecordedRpc {
  fn: string;
  args: Record<string, unknown>;
}

function createMockSupabase(opts?: {
  placeDetailsError?: { code?: string; message: string } | null;
  withSchemaMethod?: boolean;
}) {
  const mutations: RecordedMutation[] = [];
  const rpcs: RecordedRpc[] = [];
  let seq = 0;

  const categoryRows = [
    'smartphones',
    'supplements',
    'cosmetics',
    'mother-baby',
    'restaurants',
    'cafes',
    'hotels',
    'homestays',
  ].map((slug, idx) => ({
    id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
    slug,
  }));

  function makeBuilder(table: string, defaultRows: unknown[] = []) {
    let pendingResult: { data: unknown; error: unknown } = {
      data: defaultRows,
      error: null,
    };

    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      neq() {
        return builder;
      },
      gt() {
        return builder;
      },
      gte() {
        return builder;
      },
      lt() {
        return builder;
      },
      lte() {
        return builder;
      },
      ilike() {
        return builder;
      },
      in() {
        return builder;
      },
      is() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      insert(payload: unknown) {
        seq += 1;
        mutations.push({ table, op: 'insert', payload });
        pendingResult = {
          data: [{ id: `${table}-id-${seq}` }],
          error: null,
        };
        return builder;
      },
      upsert(payload: unknown, options?: unknown) {
        seq += 1;
        mutations.push({ table, op: 'upsert', payload, options });
        if (table === 'place_details' && opts?.placeDetailsError) {
          pendingResult = { data: null, error: opts.placeDetailsError };
        } else {
          pendingResult = {
            data: [{ id: `${table}-id-${seq}` }],
            error: null,
          };
        }
        return builder;
      },
      update(payload: unknown) {
        mutations.push({ table, op: 'update', payload });
        pendingResult = { data: null, error: null };
        return builder;
      },
      maybeSingle() {
        const d = Array.isArray(pendingResult.data)
          ? (pendingResult.data[0] ?? null)
          : pendingResult.data;
        return Promise.resolve({ data: d, error: pendingResult.error });
      },
      single() {
        const d = Array.isArray(pendingResult.data)
          ? (pendingResult.data[0] ?? null)
          : pendingResult.data;
        return Promise.resolve({ data: d, error: pendingResult.error });
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        return Promise.resolve(pendingResult).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  const clientBody: Record<string, unknown> = {
    from(table: string) {
      if (table === 'categories') {
        return makeBuilder(table, categoryRows);
      }
      return makeBuilder(table, []);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === 'record_price_observation') {
        return { data: 'inserted', error: null };
      }
      if (
        fn === 'match_master_product' ||
        fn === 'match_master_product_fuzzy' ||
        fn === 'match_item'
      ) {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    },
  };

  if (opts?.withSchemaMethod) {
    clientBody.schema = (_schemaName: string) => clientBody;
  }

  return {
    client: clientBody as unknown as RateSupabaseClient,
    mutations,
    rpcs,
  };
}

function createSampleProduct(overrides: Partial<ShopeeProduct> = {}): ShopeeProduct {
  return {
    platform: 'shopee',
    itemId: 'item-1001',
    shopId: 'shop-2001',
    url: 'https://shopee.vn/product/2001/1001',
    title: 'Sample Listing',
    description: 'Clean product description',
    priceMin: 250_000,
    priceMax: 250_000,
    currency: 'VND',
    historicalSold: 10,
    ratingStar: 4.8,
    ratingCount: 12,
    images: ['https://cf.shopee.vn/file/sample.jpg'],
    models: [],
    attributes: [],
    shop: {
      shopId: 'shop-2001',
      name: 'Official Store',
      isMall: true,
      ratingStar: 4.9,
      followerCount: 1000,
      location: 'TP.HCM',
    },
    reviews: [],
    ...overrides,
  };
}

describe('Wave E3 & E4 PA2 shared-data and prompt contracts', () => {
  it('keeps v1 criteria untouched while exposing v3 criteria for all 7 E3/E4 categories', () => {
    assert.equal(RATING_CRITERIA_VERSION, 1);
    assert.equal(RATING_CRITERIA_V3_VERSION, 3);
    assert.equal(PROMPT_V3_VERSION, 3);
    assert.equal(RATING_CRITERIA_ALL_CATEGORIES.length, 20);
    assert.equal(RATING_CRITERION_KEYS.length, 45);
    assert.equal(V3_RATING_CRITERIA_CATEGORIES.size, 7);

    for (const slug of V3_RATING_CRITERIA_CATEGORIES) {
      assert.equal(getRatingCriteriaVersion(slug), 3);
      const list = getRatingCriteria(slug);
      assert.equal(list.length, 5);
      const totalWeight = list.reduce((sum, row) => sum + row.weight, 0);
      assert.equal(totalWeight, 100, `Expected weight sum 100 for ${slug}`);
      assert.equal(
        list.filter(row => row.required).length,
        1,
        `Expected exactly 1 required criterion for ${slug}`
      );
      assert.equal(aiCategoryOpen(slug), true, `Expected AI category open for ${slug}`);
      const instructions = reviewAiInstructions(slug);
      assert.doesNotMatch(instructions, /[\u2013\u2014]/);
      for (const crit of list) {
        assert.ok(
          instructions.includes(`${crit.key}:`),
          `Expected prompt instructions for ${slug} to include ${crit.key}`
        );
      }
    }

    const sampleText =
      'Mon an rat ngon, phuc vu chu dao, khong gian sach se va gia hop ly cho buoi toi.';
    const batch = buildRequests(
      [
        {
          id: '00000000-0000-4000-8000-000000000101',
          text: sampleText,
          textHash: reviewTextHash(sampleText),
          category: 'restaurants',
        },
      ],
      'dos'
    );
    assert.equal(batch.requests.length, 1);
    assert.equal(batch.requests[0].body.messages[0].content, reviewAiInstructions('restaurants'));

    // Verify rule 6 / domain phrasing differentiates E3 retail, E4 places, and hardware.
    assert.match(
      reviewAiInstructions('supplements'),
      /bao bì của chính sản phẩm nếu thuộc tiêu chí packaging/
    );
    assert.match(reviewAiInstructions('restaurants'), /đặt đơn giao hàng online/);
    assert.match(reviewAiInstructions('smartphones'), /Bỏ qua chuyện giao hàng, đóng gói/);

    // Verify checkReviewPoints accepts v3 criteria and rejects cross-category keys.
    const checked = checkReviewPoints(
      'Mon an rat dam da, phuc vu nhanh va chu dao, khong gian sach se.',
      'restaurants',
      [
        {
          kind: 'pro',
          criterion_key: 'food_quality',
          body: 'Mon an dam da',
          evidence: 'Mon an rat dam da',
        },
        {
          kind: 'pro',
          criterion_key: 'cleanliness',
          body: 'Phong tam sach',
          evidence: 'khong gian sach se',
        },
      ]
    );
    assert.equal(checked.points.length, 1);
    assert.equal(checked.points[0].criterion_key, 'food_quality');
    assert.equal(checked.rejected.criterion, 1);
  });

  it('keeps retail extension platforms at 22 while allowing avakids ingestion and 20k/0 price floors', () => {
    assert.equal(SupportedEcommercePlatformSchema.options.length, 22);
    assert.equal(SupportedEcommercePlatformSchema.safeParse('avakids').success, false);
    assert.equal(SupportedIngestionPlatformSchema.safeParse('avakids').success, true);
    assert.equal(EntityTypeSchema.safeParse('place').success, true);
    assert.equal(EntityTypeSchema.safeParse('venue').success, false);
    assert.equal(PlacePriceTierSchema.safeParse('$$').success, true);
    assert.equal(PlacePriceUnitSchema.safeParse('vnd_per_night_ref').success, true);

    assert.equal(MINIMUM_RETAIL_CONSUMABLE_PRICE_FLOOR_VND, 20_000);
    for (const slug of WAVE_E3_CATEGORY_SLUGS) {
      assert.equal(
        minimumListingPriceVnd([], { categorySlug: slug, entityType: 'product' }),
        20_000
      );
    }
    for (const slug of WAVE_E4_PLACE_CATEGORY_SLUGS) {
      assert.equal(minimumListingPriceVnd([], { categorySlug: slug, entityType: 'place' }), 0);
      assert.equal(minimumListingPriceVnd([], { categorySlug: slug }), 0);
    }
    assert.equal(
      minimumListingPriceVnd([], { categorySlug: 'smartphones', entityType: 'place' }),
      0
    );
  });
});

describe('ProductNormalizer Wave E3 retail SKU and Wave E4 places', () => {
  const normalizer = new ProductNormalizer();

  it('normalizes E3 supplements, cosmetics, and mother-baby without hardware specs or accessory drops', () => {
    for (const slug of [...WAVE_E3_CATEGORY_SLUGS, ...WAVE_E4_PLACE_CATEGORY_SLUGS]) {
      assert.equal(SIZELESS_CATEGORY_SLUGS.has(slug), true);
    }

    const supp = normalizer.normalize(
      createSampleProduct({
        title: 'Vien uong Blackmores Evening Primrose Oil 190 vien',
        categorySlug: 'supplements',
        priceMin: 390_000,
        priceMax: 420_000,
      })
    );
    assert.equal(supp.category_slug, 'supplements');
    assert.equal(supp.entity_type, 'product');
    assert.equal(supp.brand, 'Blackmores');
    assert.equal(supp.keyable, true);
    assert.equal(supp.ram_gb, null);
    assert.equal(supp.storage_gb, null);
    assert.equal(supp.screen_size_inch, null);
    assert.equal(supp.has_5g, false);
    assert.deepEqual(supp.key_specs, {});
    assert.match(supp.model, /190/);

    const cosmetic = normalizer.normalize(
      createSampleProduct({
        title: 'Combo 2 Kem chong nang La Roche-Posay Anthelios UVmune 400 50ml',
        categorySlug: 'cosmetics',
        priceMin: 780_000,
        priceMax: 780_000,
      })
    );
    assert.equal(cosmetic.category_slug, 'cosmetics');
    assert.equal(cosmetic.entity_type, 'product');
    assert.equal(cosmetic.brand, 'La Roche-Posay');
    assert.equal(cosmetic.keyable, true);
    assert.match(cosmetic.model, /Combo 2/);
    assert.match(cosmetic.model, /50ml/);

    // Bút / Miếng dán openers must not reject cosmetics listings.
    assert.equal(isAccessoryTitle('But ke mat Maybelline Hyper Sharp', 'cosmetics'), false);
    assert.equal(isAccessoryTitle('Mieng dan mun COSRX Acne Pimple', 'cosmetics'), false);

    // Cream color ("Kem") on a smartphone must not reclassify into cosmetics.
    const creamPhone = normalizer.normalize(
      createSampleProduct({
        title: 'Samsung Galaxy S24 Ultra 256GB Kem',
        priceMin: 24_000_000,
        priceMax: 24_000_000,
      })
    );
    assert.equal(creamPhone.category_slug, 'smartphones');

    // Avakids generic baby product defaults cleanly to mother-baby instead of smartphones.
    const avakidsStroller = normalizer.normalize(
      createSampleProduct({
        platform: 'avakids',
        title: 'Xe day gap gon du lich sieu nhe cho be',
        priceMin: 1_250_000,
        priceMax: 1_250_000,
      })
    );
    assert.equal(avakidsStroller.category_slug, 'mother-baby');
    assert.equal(avakidsStroller.entity_type, 'product');
    assert.equal(avakidsStroller.keyable, true);

    const formula = normalizer.normalize(
      createSampleProduct({
        platform: 'avakids',
        title: 'Sua bot Aptamil Profutura Cesarbiotik so 3 800g',
        categorySlug: 'mother-baby',
        priceMin: 695_000,
        priceMax: 695_000,
      })
    );
    assert.equal(formula.brand, 'Aptamil');
    assert.match(formula.model, /800g/);

    // Tech brands (HP, LG, Sony) must not hijack E3 brand extraction.
    const hpCream = normalizer.normalize(
      createSampleProduct({
        title: 'Kem duong am HP Skin Care 60ml',
        categorySlug: 'cosmetics',
        priceMin: 210_000,
        priceMax: 210_000,
      })
    );
    assert.equal(hpCream.brand, 'Khác');

    // Accented E3 brand names (trailing accented letter + NFD decomposition) and brand stripping.
    const biore = normalizer.normalize(
      createSampleProduct({
        title: 'Sữa rửa mặt Bioré 100g',
        categorySlug: 'cosmetics',
        priceMin: 120_000,
        priceMax: 120_000,
      })
    );
    assert.equal(biore.brand, 'Bioré');
    assert.doesNotMatch(biore.model, /\bbior[eé]\b/iu);

    const moaz = normalizer.normalize(
      createSampleProduct({
        title: 'Máy hút sữa Moaz BéBé MB-002',
        categorySlug: 'mother-baby',
        priceMin: 1_250_000,
        priceMax: 1_250_000,
      })
    );
    assert.equal(moaz.brand, 'Moaz BéBé');
    assert.doesNotMatch(moaz.model, /moaz/iu);

    const lorealNfd = normalizer.normalize(
      createSampleProduct({
        title: "Nước tẩy trang L'Oréal Paris 400ml".normalize('NFD'),
        categorySlug: 'cosmetics',
        priceMin: 185_000,
        priceMax: 185_000,
      })
    );
    assert.equal(lorealNfd.brand, "L'Oréal");

    // NFD Vietnamese phone on avakids stays smartphone rather than falling back to mother-baby.
    const avakidsPhoneNfd = normalizer.normalize(
      createSampleProduct({
        platform: 'avakids',
        title: 'Điện thoại Xiaomi 14'.normalize('NFD'),
        priceMin: 18_000_000,
        priceMax: 18_000_000,
      })
    );
    assert.equal(avakidsPhoneNfd.category_slug, 'smartphones');
    assert.equal(avakidsPhoneNfd.brand, 'Xiaomi');

    // Un-hinted cosmetics openers must classify as cosmetics without accessory rejection,
    // while tech stylus/screen-protector stay tech/accessory respectively.
    const eyeliner = normalizer.normalize(
      createSampleProduct({
        title: 'Bút kẻ mắt Maybelline Hyper Sharp',
        priceMin: 165_000,
        priceMax: 165_000,
      })
    );
    assert.equal(eyeliner.category_slug, 'cosmetics');
    assert.equal(eyeliner.brand, 'Maybelline');
    assert.equal(eyeliner.keyable, true);

    const pimplePatch = normalizer.normalize(
      createSampleProduct({
        title: 'Miếng dán mụn COSRX Acne Pimple Master Patch',
        priceMin: 65_000,
        priceMax: 65_000,
      })
    );
    assert.equal(pimplePatch.category_slug, 'cosmetics');
    assert.equal(pimplePatch.brand, 'COSRX');
    assert.equal(pimplePatch.keyable, true);

    const applePencil = normalizer.normalize(
      createSampleProduct({
        title: 'Bút cảm ứng Apple Pencil Pro',
        priceMin: 3_200_000,
        priceMax: 3_200_000,
      })
    );
    assert.equal(applePencil.category_slug, 'smartphones');
    assert.equal(applePencil.brand, 'Apple');

    const temperedGlass = normalizer.normalize(
      createSampleProduct({
        title: 'Miếng dán cường lực iPhone 16 Pro Max',
        priceMin: 150_000,
        priceMax: 150_000,
      })
    );
    assert.equal(temperedGlass.keyable, false);

    // Parenthesized gift note is dropped cleanly without unbalanced "(".
    const giftSuffix = normalizer.normalize(
      createSampleProduct({
        title: 'Sữa rửa mặt Simple Refreshing (Tặng bông tẩy trang)',
        categorySlug: 'cosmetics',
        priceMin: 130_000,
        priceMax: 130_000,
      })
    );
    assert.equal(giftSuffix.brand, 'Simple');
    assert.equal(giftSuffix.model, 'Sữa rửa mặt Refreshing');
    assert.doesNotMatch(giftSuffix.model, /[()]/);

    // Gift suffix containing a unit is still stripped, while pack sizes in parens stay.
    const giftWithSize = normalizer.normalize(
      createSampleProduct({
        title: 'Sữa rửa mặt Simple Refreshing 150ml (Tặng tuýp mini 10ml)',
        categorySlug: 'cosmetics',
        priceMin: 150_000,
        priceMax: 150_000,
      })
    );
    assert.equal(giftWithSize.model, 'Sữa rửa mặt Refreshing 150ml');

    // Un-hinted Vitamin C serum stays cosmetics; genuine Vitamin C stays supplements.
    const serumVitC = normalizer.normalize(
      createSampleProduct({
        title: 'Serum Garnier Vitamin C 30ml',
        priceMin: 220_000,
        priceMax: 220_000,
      })
    );
    assert.equal(serumVitC.category_slug, 'cosmetics');

    const tabletVitC = normalizer.normalize(
      createSampleProduct({
        title: 'Vitamin C Blackmores Bio C 1000mg 60 viên',
        priceMin: 310_000,
        priceMax: 310_000,
      })
    );
    assert.equal(tabletVitC.category_slug, 'supplements');

    // Parenthetical and trailing pack sizes (>10 tokens) keep distinct E3 model_key identities.
    const cerave50 = normalizer.normalize(
      createSampleProduct({
        title: 'Kem dưỡng ẩm CeraVe Moisturising Cream (50ml)',
        categorySlug: 'cosmetics',
        priceMin: 190_000,
        priceMax: 190_000,
      })
    );
    const cerave340 = normalizer.normalize(
      createSampleProduct({
        title: 'Kem dưỡng ẩm CeraVe Moisturising Cream (340g)',
        categorySlug: 'cosmetics',
        priceMin: 420_000,
        priceMax: 420_000,
      })
    );
    assert.notEqual(cerave50.model_key, cerave340.model_key);
    assert.ok(cerave50.model_key.endsWith(':unknown'));
    assert.match(cerave50.model_key, /50ml/);
    assert.match(cerave340.model_key, /340g/);

    const long50 = normalizer.normalize(
      createSampleProduct({
        title:
          'Kem dưỡng ẩm phục hồi hàng rào bảo vệ da dành cho da rất khô CeraVe Moisturising Cream 50ml',
        categorySlug: 'cosmetics',
        priceMin: 190_000,
        priceMax: 190_000,
      })
    );
    const long340 = normalizer.normalize(
      createSampleProduct({
        title:
          'Kem dưỡng ẩm phục hồi hàng rào bảo vệ da dành cho da rất khô CeraVe Moisturising Cream 340g',
        categorySlug: 'cosmetics',
        priceMin: 420_000,
        priceMax: 420_000,
      })
    );
    assert.notEqual(long50.model_key, long340.model_key);
    assert.match(long50.model_key, /50ml/);
    assert.match(long340.model_key, /340g/);
  });

  it('normalizes E4 places with entity_type place and preserves compound cafe/branch names', () => {
    const cafe = normalizer.normalize(
      createSampleProduct({
        title: 'Phúc Long Coffee + Tea - Nguyễn Thị Minh Khai',
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(cafe.category_slug, 'cafes');
    assert.equal(cafe.entity_type, 'place');
    assert.equal(cafe.brand, 'Phúc Long');
    assert.equal(cafe.keyable, true);
    assert.match(cafe.model, /Coffee \+ Tea/);
    assert.equal(cafe.has_5g, false);
    assert.equal(cafe.screen_size_inch, null);
    assert.deepEqual(cafe.key_specs, {});

    const cafeNfd = normalizer.normalize(
      createSampleProduct({
        title: 'Phúc Long Coffee + Tea - Q1'.normalize('NFD'),
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(cafeNfd.brand, 'Phúc Long');

    const congCafe = normalizer.normalize(
      createSampleProduct({
        title: 'Cộng Cà Phê - Hàng Điếu',
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(congCafe.brand, 'Cộng Cà Phê');
    assert.equal(congCafe.model, 'Hàng Điếu');

    const melia = normalizer.normalize(
      createSampleProduct({
        title: 'Khách sạn Meliá Hà Nội',
        categorySlug: 'hotels',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(melia.brand, 'Meliá');
    assert.doesNotMatch(melia.model, /meli[aá]/iu);

    const highlandsBranch = normalizer.normalize(
      createSampleProduct({
        title: 'Highlands Coffee (Chi nhánh Lê Lợi) - Hà Nội',
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(highlandsBranch.brand, 'Highlands Coffee');
    assert.doesNotMatch(highlandsBranch.model, /[()]/);
    assert.match(highlandsBranch.model, /Chi nhánh Lê Lợi/);

    const hotel = normalizer.normalize(
      createSampleProduct({
        title: 'Khách sạn Mường Thanh Luxury Đà Nẵng',
        categorySlug: 'hotels',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(hotel.category_slug, 'hotels');
    assert.equal(hotel.entity_type, 'place');
    assert.equal(hotel.brand, 'Mường Thanh');
    assert.equal(hotel.keyable, true);

    const homestay = normalizer.normalize(
      createSampleProduct({
        title: 'Homestay Đồi Thông Đà Lạt',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(homestay.category_slug, 'homestays');
    assert.equal(homestay.entity_type, 'place');
    assert.equal(homestay.keyable, true);

    const cafeWithTechName = normalizer.normalize(
      createSampleProduct({
        title: 'The Coffee House - LG Tower',
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    assert.equal(cafeWithTechName.brand, 'The Coffee House');
  });
});

describe('Ingestion pipeline, EntityMatcher, and upsertPlaceDetails Open-Core guards', () => {
  it('enforces the 20k E3 floor, allows unpriced places without 0 VND price_history, and supports avakids', async () => {
    const { client: rejectClient, mutations: rejectMutations } = createMockSupabase();
    const rejectPipeline = new ShopeeIngestionPipeline({
      supabaseClient: rejectClient,
      itemModel: 'off',
    });

    await assert.rejects(
      rejectPipeline.ingestProduct(
        createSampleProduct({
          title: 'Serum B5 La Roche-Posay 30ml',
          categorySlug: 'cosmetics',
          priceMin: 15_000,
          priceMax: 15_000,
        })
      ),
      /below category minimum floor/
    );
    assert.equal(rejectMutations.length, 0);

    await assert.rejects(
      rejectPipeline.ingestProduct(
        createSampleProduct({
          title: 'iPhone 16 Pro Max 256GB',
          priceMin: 0,
          priceMax: 0,
        })
      ),
      /Cannot ingest unpriced or out-of-bounds product listing/
    );

    // Unpriced Wave E4 place ingests cleanly without writing bogus 0 VND price_history rows.
    const {
      client: placeClient,
      mutations: placeMutations,
      rpcs: placeRpcs,
    } = createMockSupabase();
    const placePipeline = new ShopeeIngestionPipeline({
      supabaseClient: placeClient,
      itemModel: 'off',
    });
    const placeResult = await placePipeline.ingestProduct(
      createSampleProduct({
        title: 'Nhà hàng Bún Chả Hương Liên - 24 Lê Văn Hưu',
        categorySlug: 'restaurants',
        entityType: 'place',
        priceMin: 0,
        priceMax: 0,
        url: 'https://rate.vn/restaurants/bun-cha-huong-lien',
      }),
      undefined,
      { skipReviewAnalysis: true }
    );
    assert.ok(placeResult.masterId);
    const masterInsert = placeMutations.find(
      m => m.table === 'master_products' && (m.op === 'upsert' || m.op === 'insert')
    );
    assert.ok(masterInsert);
    assert.equal((masterInsert.payload as Record<string, unknown>).entity_type, 'place');
    assert.equal(
      placeRpcs.some(r => r.fn === 'record_price_observation'),
      false
    );
    assert.equal(
      placeMutations.some(m => m.table === 'price_history'),
      false
    );

    // E3 retail SKU at exact 20,000 VND floor on avakids passes and writes price observation.
    const {
      client: avakidsClient,
      mutations: avakidsMutations,
      rpcs: avakidsRpcs,
    } = createMockSupabase();
    const avakidsPipeline = new ShopeeIngestionPipeline({
      supabaseClient: avakidsClient,
      itemModel: 'off',
    });
    const avakidsResult = await avakidsPipeline.ingestProduct(
      createSampleProduct({
        platform: 'avakids',
        title: 'Khan uot Huggies khong mui goi 64 mieng',
        categorySlug: 'mother-baby',
        priceMin: 20_000,
        priceMax: 20_000,
        url: 'https://www.avakids.com/khan-uot/huggies-64-mieng',
      }),
      undefined,
      { skipReviewAnalysis: true }
    );
    assert.equal(avakidsResult.platform, 'avakids');
    const avakidsMaster = avakidsMutations.find(
      m => m.table === 'master_products' && (m.op === 'upsert' || m.op === 'insert')
    );
    assert.equal((avakidsMaster?.payload as Record<string, unknown>).entity_type, 'product');
    assert.equal(
      avakidsRpcs.some(r => r.fn === 'record_price_observation'),
      true
    );
  });

  it('EntityMatcher seeds place entities for Wave E4 categories', async () => {
    const { client, mutations } = createMockSupabase();
    const matcher = new EntityMatcher(client, undefined, { itemModel: 'off' });
    const normalizer = new ProductNormalizer();
    const candidate = normalizer.normalize(
      createSampleProduct({
        title: 'Highlands Coffee - Vincom Dong Khoi',
        categorySlug: 'cafes',
        priceMin: 0,
        priceMax: 0,
      })
    );
    const res = await matcher.resolveOrCreateMasterProduct(
      candidate,
      '00000000-0000-4000-8000-000000000006',
      candidate.name
    );
    assert.equal(res.isNew, true);
    const insert = mutations.find(
      m => m.table === 'master_products' && (m.op === 'upsert' || m.op === 'insert')
    );
    assert.equal((insert?.payload as Record<string, unknown>).entity_type, 'place');
  });

  it('validates PlaceDetailSchema before DB writes in upsertPlaceDetails', async () => {
    const { client, mutations } = createMockSupabase({ withSchemaMethod: true });

    const validInput = {
      masterId: '00000000-0000-4000-8000-000000000999',
      placeKey: 'pho-thin:vn-hn_w3g4k2d:13-lo-duc',
      branchGroupKey: 'pho-thin',
      geoLat: 21.0155,
      geoLng: 105.8559,
      geohash7: 'w3g4k2d',
      address: '13 Lo Duc, Pham Dinh Ho, Hai Ba Trung, Ha Noi',
      provinceCode: 'vn-hn',
      districtCode: 'hai-ba-trung',
      priceMin: 55_000,
      priceMax: 95_000,
      priceTier: '$' as const,
      priceUnit: 'vnd_per_person' as const,
      openingHours: '06:00-21:00',
      phone: '02438212709',
      website: 'https://example.vn/pho-thin',
      cuisine: 'vietnamese, pho',
      starRating: 4.5,
      sourceIds: { osm: 'node/12345' },
      overtureConfidence: 0.92,
    };

    const parsed = PlaceDetailSchema.parse(validInput);
    assert.equal(parsed.placeKey, validInput.placeKey);

    const out = await upsertPlaceDetails(client, validInput);
    assert.deepEqual(out, {
      masterId: validInput.masterId,
      placeKey: validInput.placeKey,
    });
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].table, 'place_details');
    assert.equal(mutations[0].op, 'upsert');
    assert.deepEqual(mutations[0].options, { onConflict: 'master_id' });
    const row = mutations[0].payload as Record<string, unknown>;
    assert.equal(row.master_id, validInput.masterId);
    assert.equal(row.place_key, validInput.placeKey);
    assert.equal(row.price_unit, 'vnd_per_person');
    assert.equal(row.overture_confidence, 0.92);

    // Invalid payloads must reject via PlaceDetailSchema before touching Supabase.
    const invalidPayloads: Array<Record<string, unknown>> = [
      { ...validInput, priceMin: 120_000, priceMax: 80_000 },
      { ...validInput, geoLat: 21.0, geoLng: null },
      { ...validInput, geohash7: 'INVALID!' },
      { ...validInput, placeKey: 'bad key with spaces' },
      { ...validInput, website: 'javascript:alert(1)' },
      { ...validInput, starRating: 4.55 },
      { ...validInput, overtureConfidence: 1.5 },
    ];
    for (const bad of invalidPayloads) {
      await assert.rejects(upsertPlaceDetails(client, bad as typeof validInput));
    }
    assert.equal(mutations.length, 1, 'Invalid place details must never reach Supabase');

    // Supabase errors surface with master/place_key context.
    const { client: errClient } = createMockSupabase({
      placeDetailsError: { code: '23514', message: 'check constraint failed' },
    });
    await assert.rejects(
      upsertPlaceDetails(errClient, validInput),
      /Failed to upsert place_details/
    );
  });

  it('keeps substantive E4 place and E3 packaging reviews in ratings while excluding delivery-only comments', () => {
    const foodComment = 'Món ăn rất ngon, thịt tươi và rau giòn, giao hàng nhanh.';
    assert.equal(
      isShippingOnlyComment(foodComment, { entityType: 'place', categorySlug: 'restaurants' }),
      false
    );
    const cosmeticPackaging = 'Bao bì đẹp, vòi xịt chắc chắn, giao hàng hơi chậm.';
    assert.equal(
      isShippingOnlyComment(cosmeticPackaging, {
        entityType: 'product',
        categorySlug: 'cosmetics',
      }),
      false
    );
    const deliveryOnly = 'Giao hàng nhanh, shipper thân thiện, đóng gói cẩn thận.';
    assert.equal(
      isShippingOnlyComment(deliveryOnly, { entityType: 'place', categorySlug: 'restaurants' }),
      true
    );
    assert.equal(
      isShippingOnlyComment(deliveryOnly, { entityType: 'product', categorySlug: 'cosmetics' }),
      true
    );

    const foodAssessment = assessReview6Axes(
      { id: 'rev-food', rating_star: 5, comment: foodComment, author_name: 'Lan' },
      { entityType: 'place', categorySlug: 'restaurants' }
    );
    assert.equal(foodAssessment.breakdown.context, 1);
    assert.ok(foodAssessment.breakdown.weight > 0);

    const analyzer = new AiReviewAnalyzer();
    const restaurantResults = analyzer.analyzeWithHeuristics(
      [
        { id: 'rev-food', rating_star: 5, comment: foodComment, author_name: 'Lan' },
        { id: 'rev-ship', rating_star: 5, comment: deliveryOnly, author_name: 'Minh' },
      ],
      { entityType: 'place', categorySlug: 'restaurants' }
    );
    assert.ok(restaurantResults[0].helpfulness_weight > 0);
    assert.equal(restaurantResults[1].helpfulness_weight, 0);
  });
});
