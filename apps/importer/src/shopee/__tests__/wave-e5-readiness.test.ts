/**
 * Deterministic verification suite for Wave E5 (dental-clinics, gyms-fitness) place
 * readiness across @repo/shared-data and @repo/crawlers (DOS/Rate#1937).
 * Zero live network, zero prod DDL, and zero private collector logic.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RATING_CRITERIA_ALL_CATEGORIES,
  RATING_CRITERIA_V4_VERSION,
  V4_RATING_CRITERIA_CATEGORIES,
  getRatingCriteria,
  getRatingCriteriaVersion,
  minimumListingPriceVnd,
} from '@repo/shared-data/rules';
import { isShippingOnlyComment } from '../ai-review-analyzer.js';
import { buildRequests } from '../jobs/review-ai-points.js';
import {
  WAVE_E_CATEGORY_SLUGS,
  crawledPublishBlockers,
  type CrawledMasterRow,
} from '../jobs/publish-masters.js';
import {
  CANONICAL_CATEGORY_SLUGS,
  PLACE_CATEGORY_SLUGS,
  ProductNormalizer,
  SIZELESS_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  WAVE_E5_PLACE_CATEGORY_SLUGS,
  detectCategorySlug,
  isAccessoryTitle,
} from '../product-normalizer.js';
import {
  RATING_CRITERIA_V4_VERSION as PROMPT_V4_VERSION,
  aiCategoryOpen,
  checkReviewPoints,
  reviewAiInstructions,
} from '../review-ai-prompt.js';
import type { ShopeeProduct } from '../types.js';

const WAVE_E5_SLUGS = ['dental-clinics', 'gyms-fitness'] as const;

function createPlace(overrides: Partial<ShopeeProduct> = {}): ShopeeProduct {
  return {
    platform: 'shopee',
    itemId: 'place-1001',
    shopId: 'place-2001',
    url: 'https://example.vn/place/2001/1001',
    title: 'Sample Place',
    description: 'Clean place description',
    priceMin: 0,
    priceMax: 0,
    currency: 'VND',
    historicalSold: 0,
    ratingStar: 4.8,
    ratingCount: 12,
    images: [],
    models: [],
    attributes: [],
    shop: {
      shopId: 'place-2001',
      name: 'Sample Place',
      isMall: false,
      ratingStar: 4.8,
      followerCount: 0,
      location: 'TP.HCM',
    },
    reviews: [],
    ...overrides,
  };
}

describe('Wave E5 shared-data and prompt contracts', () => {
  it('exposes criteria v4 for dental-clinics and gyms-fitness only', () => {
    assert.equal(RATING_CRITERIA_V4_VERSION, 4);
    assert.equal(PROMPT_V4_VERSION, 4);
    assert.deepEqual([...V4_RATING_CRITERIA_CATEGORIES].sort(), [...WAVE_E5_SLUGS]);
    assert.equal(RATING_CRITERIA_ALL_CATEGORIES.length, 22);
    for (const slug of WAVE_E5_SLUGS) {
      assert.equal(getRatingCriteriaVersion(slug), 4);
      assert.equal(aiCategoryOpen(slug), true);
      const list = getRatingCriteria(slug);
      assert.equal(list.length, 5);
      assert.equal(
        list.reduce((sum, row) => sum + row.weight, 0),
        100
      );
      assert.equal(list.filter(row => row.required).length, 1);
      assert.equal(minimumListingPriceVnd(['Gói tập 12 tháng'], { categorySlug: slug }), 0);
    }
    assert.equal(getRatingCriteriaVersion('cafes'), 3);
  });

  it('builds clinic and gym prompts with their own hints and examples', () => {
    const dental = reviewAiInstructions('dental-clinics');
    assert.match(dental, /review địa điểm/);
    assert.match(dental, /vô trùng dụng cụ/);
    assert.match(dental, /bác sĩ làm nhẹ tay/);
    assert.doesNotMatch(dental, /food_quality|room_quality/);
    assert.doesNotMatch(dental, /[\u2013\u2014]/);
    for (const crit of getRatingCriteria('dental-clinics')) {
      assert.ok(dental.includes(`- ${crit.key}:`), crit.key);
    }

    const gym = reviewAiInstructions('gyms-fitness');
    assert.match(gym, /huấn luyện viên \(PT\)/);
    assert.match(gym, /phòng tập rộng, máy móc mới/);
    assert.doesNotMatch(gym, /food_quality|room_quality/);
    assert.doesNotMatch(gym, /[\u2013\u2014]/);

    // Existing place prompts keep their own examples and shared hints.
    const restaurants = reviewAiInstructions('restaurants');
    assert.match(restaurants, /món phở đậm đà/);
    assert.match(restaurants, /vệ sinh khu vực ăn uống và chế biến/);
    assert.doesNotMatch(restaurants, /bác sĩ làm nhẹ tay/);

    const built = buildRequests(
      [
        {
          id: 'rev-dental-1',
          text: 'Bác sĩ làm nhẹ tay, phòng khám sạch sẽ, chi phí hợp lý so với chất lượng',
          textHash: 'dental-1',
          category: 'dental-clinics',
        },
      ],
      'dos'
    );
    assert.equal(built.manifest[0]?.criteria_version, 4);

    const checked = checkReviewPoints(
      'Bac si lam nhe tay, phong kham sach se, chi phi hop ly.',
      'dental-clinics',
      [
        {
          kind: 'pro',
          criterion_key: 'service_attitude',
          body: 'Bac si nhe tay',
          evidence: 'Bac si lam nhe tay',
        },
        {
          kind: 'pro',
          criterion_key: 'food_quality',
          body: 'Khong thuoc danh muc',
          evidence: 'phong kham sach se',
        },
      ]
    );
    assert.equal(checked.points.length, 1);
    assert.equal(checked.points[0]?.criterion_key, 'service_attitude');
    assert.equal(checked.rejected.criterion, 1);
  });
});

describe('Wave E5 importer normalization', () => {
  const normalizer = new ProductNormalizer();

  it('registers Wave E5 slugs as sizeless place categories', () => {
    assert.deepEqual([...WAVE_E5_PLACE_CATEGORY_SLUGS].sort(), [...WAVE_E5_SLUGS]);
    assert.equal(WAVE_E4_PLACE_CATEGORY_SLUGS.size, 4);
    assert.equal(PLACE_CATEGORY_SLUGS.size, 6);
    for (const slug of WAVE_E5_SLUGS) {
      assert.equal(CANONICAL_CATEGORY_SLUGS.has(slug), true);
      assert.equal(PLACE_CATEGORY_SLUGS.has(slug), true);
      assert.equal(SIZELESS_CATEGORY_SLUGS.has(slug), true);
      assert.equal(WAVE_E_CATEGORY_SLUGS.has(slug), true);
      assert.equal(isAccessoryTitle('Ốp lưng phòng khám', slug), false);
      assert.equal(detectCategorySlug('Anything', slug), slug);
    }
  });

  it('normalizes dental clinics and gyms as places with chain brands', () => {
    const kim = normalizer.normalize(
      createPlace({ title: 'Nha khoa Kim - Chi nhánh Quận 3', categorySlug: 'dental-clinics' })
    );
    assert.equal(kim.category_slug, 'dental-clinics');
    assert.equal(kim.entity_type, 'place');
    assert.equal(kim.brand, 'Nha khoa Kim');
    assert.equal(kim.keyable, true);
    assert.match(kim.model, /Chi nhánh Quận 3/);
    assert.doesNotMatch(kim.model, /Nha khoa Kim/i);
    assert.deepEqual(kim.key_specs, {});
    assert.equal(kim.storage_gb, null);

    const cali = normalizer.normalize(
      createPlace({
        title: 'California Fitness & Yoga - Hai Bà Trưng',
        categorySlug: 'gyms-fitness',
      })
    );
    assert.equal(cali.category_slug, 'gyms-fitness');
    assert.equal(cali.entity_type, 'place');
    assert.equal(cali.brand, 'California Fitness & Yoga');
    assert.match(cali.model, /Hai Bà Trưng/);

    const citi = normalizer.normalize(
      createPlace({ title: 'CitiGym Tân Bình', categorySlug: 'gyms-fitness' })
    );
    assert.equal(citi.brand, 'CitiGym');
    assert.equal(citi.model, 'Tân Bình');
  });

  it('detects clinic and gym titles without a category hint and leaves retail alone', () => {
    assert.equal(detectCategorySlug('Phòng khám nha khoa Sài Gòn Smile'), 'dental-clinics');
    assert.equal(detectCategorySlug('Nha khoa Paris - Hà Nội'), 'dental-clinics');
    assert.equal(detectCategorySlug('Bệnh viện Răng Hàm Mặt TP.HCM'), 'dental-clinics');
    assert.equal(detectCategorySlug('Phòng tập gym Hùng Fitness Quận 7'), 'gyms-fitness');
    assert.equal(detectCategorySlug('Trung tâm thể hình Elite Fitness'), 'gyms-fitness');

    // Retail products that only mention the vocabulary are not places.
    assert.notEqual(detectCategorySlug('Chỉ nha khoa Oral-B 50m'), 'dental-clinics');
    assert.notEqual(detectCategorySlug('Găng tay tập gym chống chai'), 'gyms-fitness');
    assert.equal(detectCategorySlug('Whey protein tập gym 2kg'), 'supplements');
  });
});

describe('Wave E5 publish and review guards', () => {
  const placeRow: CrawledMasterRow = {
    id: 'master-dental-1',
    model_key: 'nha-khoa-kim:quan-3:unknown',
    slug: 'nha-khoa-kim-quan-3',
    name: 'Nha khoa Kim Quận 3',
    brand: 'Nha khoa Kim',
    status: 'draft',
    category_id: 'cat-dental-clinics',
    entity_type: 'place',
    images: [],
    thumbnail: null,
    specifications: {
      category_slug: 'dental-clinics',
      availability: { status: 'Available' },
    },
  };
  const placeDetail = {
    place_key: 'nha-khoa-kim:ho-chi-minh:q3',
    branch_group_key: 'nha-khoa-kim',
    province_code: 'ho-chi-minh',
  };

  it('requires place_details and entity_type place for Wave E5 masters', () => {
    assert.deepEqual(
      crawledPublishBlockers(placeRow, {
        categorySlug: 'dental-clinics',
        listings: [],
        activeListingCount: 0,
        placeDetail,
      }),
      []
    );
    assert.ok(
      crawledPublishBlockers(placeRow, { categorySlug: 'dental-clinics', placeDetail: null }).some(
        r => r.includes('missing linked rate.place_details')
      )
    );
    assert.ok(
      crawledPublishBlockers(
        { ...placeRow, entity_type: 'product' },
        { categorySlug: 'dental-clinics', placeDetail }
      ).some(r => r.includes('must be "place"'))
    );
    assert.deepEqual(
      crawledPublishBlockers(
        {
          ...placeRow,
          category_id: 'cat-gyms-fitness',
          specifications: {
            category_slug: 'gyms-fitness',
            availability: { status: 'Available' },
          },
        },
        { categorySlug: 'gyms-fitness', placeDetail }
      ),
      []
    );
  });

  it('keeps clinic and gym reviews in ratings while excluding delivery-only comments', () => {
    const dental = 'Bác sĩ nhẹ tay, dụng cụ tiệt trùng kỹ, giao hàng nhanh.';
    assert.equal(
      isShippingOnlyComment(dental, { entityType: 'place', categorySlug: 'dental-clinics' }),
      false
    );
    const gym = 'Máy tập mới, huấn luyện viên nhiệt tình, giao hàng nhanh.';
    assert.equal(
      isShippingOnlyComment(gym, { entityType: 'place', categorySlug: 'gyms-fitness' }),
      false
    );
    assert.equal(isShippingOnlyComment(gym, { categorySlug: 'gyms-fitness' }), false);
    const deliveryOnly = 'Giao hàng nhanh, shipper thân thiện, đóng gói cẩn thận.';
    assert.equal(
      isShippingOnlyComment(deliveryOnly, { entityType: 'place', categorySlug: 'dental-clinics' }),
      true
    );
  });
});
