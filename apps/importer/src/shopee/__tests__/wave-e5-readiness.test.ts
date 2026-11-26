/**
 * Deterministic verification suite for Wave E5 (dental-clinics, gyms-fitness) place
 * readiness across @repo/shared-data and @repo/crawlers (DOS/Rate#1937).
 * Zero live network, zero prod DDL, and zero private collector logic.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  REVIEW_AI_PROMPT_VERSION,
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

  it('builds clinic and gym prompts with per-category valid keys and zero drift on existing categories', () => {
    assert.equal(REVIEW_AI_PROMPT_VERSION, 'v1');

    const dental = reviewAiInstructions('dental-clinics');
    assert.match(dental, /review địa điểm/);
    assert.match(dental, /vô trùng dụng cụ/);
    assert.match(dental, /bác sĩ làm nhẹ tay/);
    assert.doesNotMatch(dental, /food_quality|room_quality|phòng tập rộng/);
    assert.doesNotMatch(dental, /[\u2013\u2014]/);
    for (const crit of getRatingCriteria('dental-clinics')) {
      assert.ok(dental.includes(`- ${crit.key}:`), crit.key);
    }

    const gym = reviewAiInstructions('gyms-fitness');
    assert.match(gym, /huấn luyện viên \(PT\)/);
    assert.match(gym, /phòng tập rộng, máy móc mới/);
    assert.doesNotMatch(gym, /food_quality|room_quality|bác sĩ làm nhẹ tay/);
    assert.doesNotMatch(gym, /[\u2013\u2014]/);
    for (const crit of getRatingCriteria('gyms-fitness')) {
      assert.ok(gym.includes(`- ${crit.key}:`), crit.key);
    }

    // Every criterion_key shown in dental-clinics / gyms-fitness examples must be valid
    // for that exact category (never cross-leaking quality into dental or price into gym).
    for (const slug of WAVE_E5_SLUGS) {
      const prompt = reviewAiInstructions(slug);
      const validKeys = new Set<string>(getRatingCriteria(slug).map(c => c.key));
      const exampleSection = prompt.slice(prompt.indexOf('Ví dụ'));
      const keysInExamples = [...exampleSection.matchAll(/"criterion_key":\s*"([^"]+)"/g)].map(
        m => m[1]!
      );
      assert.ok(keysInExamples.length >= 5, `${slug} must include example criterion keys`);
      for (const key of keysInExamples) {
        assert.ok(validKeys.has(key), `${slug} example used invalid criterion_key "${key}"`);
      }
      // Every example ref + JSON points block in the prompt must pass checkReviewPoints cleanly.
      const examplePairs = [
        ...exampleSection.matchAll(
          /Review ref \d+: "([^"]+)"\nKết quả: (\{"ref": \d+, "points": \[[\s\S]*?\]\})/g
        ),
      ];
      assert.equal(examplePairs.length, 3, `${slug} must have 3 parseable example blocks`);
      for (const [, reviewText, jsonText] of examplePairs) {
        const parsed = JSON.parse(jsonText!) as { points: unknown[] };
        const checkedExample = checkReviewPoints(reviewText!, slug, parsed.points);
        assert.equal(
          checkedExample.points.length,
          parsed.points.length,
          `${slug} example points must all pass checkReviewPoints`
        );
      }
    }

    // Existing categories' prompt text must stay byte-for-byte unchanged (prompt version v1).
    const existingPromptSha256: Readonly<Record<string, string>> = {
      smartphones: 'bbac516e1555846b34a9b9520607031f39041c58a99fd2e33405a2ff4e2d58e3',
      laptops: '70a5cd106d6b4d0a5fc55043c10c5e3f2704564a14f6cd45c226dd494b294056',
      tvs: '885675c2f5c689b261fe367b7a74d251c584d79cf442926f39d78373219dc6d2',
      supplements: '6e1bf1d91b10438c370742f9dcd54964407c89a9ffb97728108ff6c4f1881132',
      cosmetics: '1a3a43d1d1fd7f109aaaa3274768a75cf8aba3f6d870c01b1e1ef15138b2dd30',
      'mother-baby': '9fabe2f05db6e9a070ae1299a95fd084a77e09a61cae9adcc3d4909638f7c2ab',
      restaurants: 'b629b7457c5f097468f613de87cec0ba66c46a392090ae5de6077302d338bfcc',
      cafes: 'acb0c9c79a28096af667c2c8ffba3c6fd7940dc2878d2fcf6a9d14d7aa5c2eb4',
      hotels: '44adb612c5ebc2423fb3296f91bd7cadc0aed312ec9b4bba17a6c6e3b7f13a03',
      homestays: '44adb612c5ebc2423fb3296f91bd7cadc0aed312ec9b4bba17a6c6e3b7f13a03',
    };
    for (const [slug, expectedHash] of Object.entries(existingPromptSha256)) {
      const actualHash = createHash('sha256')
        .update(reviewAiInstructions(slug), 'utf8')
        .digest('hex');
      assert.equal(actualHash, expectedHash, `existing prompt drifted for ${slug}`);
    }

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
    const genuinePlaces: Array<[string, string]> = [
      ['Nha khoa Kim', 'dental-clinics'],
      ['Nha khoa Kim Bình Thạnh', 'dental-clinics'],
      ['Phòng khám nha khoa Paris', 'dental-clinics'],
      ['Phòng khám nha khoa Sài Gòn Smile', 'dental-clinics'],
      ['Nha khoa Paris - Hà Nội', 'dental-clinics'],
      ['Bệnh viện Răng Hàm Mặt TP.HCM', 'dental-clinics'],
      ['California Fitness & Yoga', 'gyms-fitness'],
      ['CitiGym', 'gyms-fitness'],
      ['CitiGym Tân Bình', 'gyms-fitness'],
      ['Phòng tập gym Elite Fitness', 'gyms-fitness'],
      ['Phòng tập gym Hùng Fitness Quận 7', 'gyms-fitness'],
      ['Trung tâm thể hình Elite Fitness', 'gyms-fitness'],
    ];
    for (const [title, expected] of genuinePlaces) {
      assert.equal(detectCategorySlug(title), expected, title);
    }

    // Retail products that mention clinic/gym vocabulary must stay in E3 or default, never Wave E5.
    const retailExpectations: Array<[string, string]> = [
      ['Whey Protein Rule 1 5lbs dùng cho phòng gym', 'supplements'],
      ['Creatine Monohydrate phòng gym', 'supplements'],
      ['Whey protein tập gym 2kg', 'supplements'],
      ['Miếng dán trắng răng chuẩn nha khoa thẩm mỹ', 'cosmetics'],
      ['Bình lắc whey phòng tập gym', 'smartphones'],
      ['Túi đựng đồ đi phòng gym', 'smartphones'],
      ['Thảm tập yoga cho phòng gym', 'smartphones'],
      ['Găng tay tập gym fitness club', 'smartphones'],
      ['Dây kháng lực fitness center tại nhà', 'smartphones'],
      ['Máy tăm nước Panasonic phòng khám nha khoa', 'smartphones'],
      ['Bàn chải điện Oral-B Dental Center khuyên dùng', 'smartphones'],
      ['Kem đánh răng chuẩn nha khoa thẩm mỹ', 'smartphones'],
      ['Gel tẩy trắng răng phòng khám nha khoa', 'smartphones'],
      ['Nước súc miệng chuẩn nha khoa quốc tế', 'smartphones'],
      ['Chỉ nha khoa Oral-B 50m', 'smartphones'],
      ['Tăm chỉ nha khoa thẩm mỹ 50 cây', 'smartphones'],
      ['Găng tay tập gym chống chai', 'smartphones'],
    ];
    for (const [title, expected] of retailExpectations) {
      assert.equal(detectCategorySlug(title), expected, title);
      assert.notEqual(detectCategorySlug(title), 'dental-clinics', title);
      assert.notEqual(detectCategorySlug(title), 'gyms-fitness', title);
    }
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
    assert.equal(
      isShippingOnlyComment('Personal trainer nhiệt tình, giao hàng nhanh.', {
        entityType: 'place',
        categorySlug: 'gyms-fitness',
      }),
      false
    );
    // Ambiguous bare "pt" does not rescue a shipping-only comment.
    assert.equal(
      isShippingOnlyComment('Giao hàng nhanh, pt đóng gói cẩn thận.', {
        entityType: 'place',
        categorySlug: 'gyms-fitness',
      }),
      true
    );
    // Dental and gym domain words stay scoped to their own categories, not Wave E4 places.
    assert.equal(
      isShippingOnlyComment('Bác sĩ giao hàng nhanh, đóng gói cẩn thận.', {
        entityType: 'place',
        categorySlug: 'restaurants',
      }),
      true
    );
    assert.equal(
      isShippingOnlyComment('Giao hàng nhanh, đóng gói gọn cho huấn luyện viên gym.', {
        entityType: 'place',
        categorySlug: 'restaurants',
      }),
      true
    );
    const deliveryOnly = 'Giao hàng nhanh, shipper thân thiện, đóng gói cẩn thận.';
    assert.equal(
      isShippingOnlyComment(deliveryOnly, { entityType: 'place', categorySlug: 'dental-clinics' }),
      true
    );
  });
});
