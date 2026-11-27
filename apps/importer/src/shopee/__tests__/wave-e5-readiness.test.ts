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
  RATING_CRITERIA_V5_VERSION,
  V4_RATING_CRITERIA_CATEGORIES,
  V5_RATING_CRITERIA_CATEGORIES,
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
  SERVICE_CATEGORY_SLUGS,
  SIZELESS_CATEGORY_SLUGS,
  WAVE_E2_SERVICE_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  WAVE_E5_PLACE_CATEGORY_SLUGS,
  WAVE_E5_SERVICE_CATEGORY_SLUGS,
  detectCategorySlug,
  isAccessoryTitle,
} from '../product-normalizer.js';
import {
  RATING_CRITERIA_V4_VERSION as PROMPT_V4_VERSION,
  RATING_CRITERIA_V5_VERSION as PROMPT_V5_VERSION,
  REVIEW_AI_PROMPT_VERSION,
  aiCategoryOpen,
  checkReviewPoints,
  reviewAiInstructions,
} from '../review-ai-prompt.js';
import type { ShopeeProduct } from '../types.js';

const WAVE_E5_SLUGS = ['dental-clinics', 'gyms-fitness'] as const;
const WAVE_E5_PHASE2_PLACE_SLUGS = ['spas-aesthetics', 'english-centers'] as const;
const WAVE_E5_PHASE2_SLUGS = ['spas-aesthetics', 'english-centers', 'credit-cards'] as const;

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
    assert.equal(RATING_CRITERIA_V5_VERSION, 5);
    assert.equal(PROMPT_V5_VERSION, 5);
    assert.deepEqual([...V4_RATING_CRITERIA_CATEGORIES].sort(), [...WAVE_E5_SLUGS]);
    assert.deepEqual([...V5_RATING_CRITERIA_CATEGORIES].sort(), [
      'credit-cards',
      'english-centers',
      'spas-aesthetics',
    ]);
    assert.equal(RATING_CRITERIA_ALL_CATEGORIES.length, 25);
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
    assert.deepEqual([...WAVE_E5_PLACE_CATEGORY_SLUGS].sort(), [
      'dental-clinics',
      'english-centers',
      'gyms-fitness',
      'spas-aesthetics',
    ]);
    assert.equal(WAVE_E4_PLACE_CATEGORY_SLUGS.size, 4);
    assert.equal(PLACE_CATEGORY_SLUGS.size, 8);
    assert.deepEqual([...WAVE_E2_SERVICE_CATEGORY_SLUGS].sort(), [
      'bank-savings',
      'internet-telecom',
    ]);
    assert.deepEqual([...WAVE_E5_SERVICE_CATEGORY_SLUGS], ['credit-cards']);
    assert.deepEqual([...SERVICE_CATEGORY_SLUGS].sort(), [
      'bank-savings',
      'credit-cards',
      'internet-telecom',
    ]);
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

    // No-hint normalization for Wave E5 chains and clinic prefixes (DOS/Rate#1943).
    const heThongKim = normalizer.normalize(
      createPlace({ title: 'Hệ thống Nha khoa Kim - Chi nhánh Quận 3' })
    );
    assert.equal(heThongKim.category_slug, 'dental-clinics');
    assert.equal(heThongKim.entity_type, 'place');
    assert.equal(heThongKim.brand, 'Nha khoa Kim');

    const getfit = normalizer.normalize(createPlace({ title: 'Getfit Gym Hoàng Diệu' }));
    assert.equal(getfit.category_slug, 'gyms-fitness');
    assert.equal(getfit.entity_type, 'place');
    assert.equal(getfit.brand, 'Getfit Gym');
    assert.equal(getfit.model, 'Hoàng Diệu');

    const swequity = normalizer.normalize(createPlace({ title: 'Swequity Ultimate Fitness' }));
    assert.equal(swequity.category_slug, 'gyms-fitness');
    assert.equal(swequity.entity_type, 'place');
    assert.equal(swequity.brand, 'Swequity');
    assert.equal(swequity.model, 'Ultimate Fitness');
  });

  it('detects clinic and gym titles without a category hint and leaves retail alone', () => {
    const genuinePlaces: Array<[string, string]> = [
      ['Nha khoa Kim', 'dental-clinics'],
      ['Nha khoa Kim Bình Thạnh', 'dental-clinics'],
      ['Hệ thống Nha khoa Kim', 'dental-clinics'],
      ['Hệ thống nha khoa Paris - Chi nhánh Quận 1', 'dental-clinics'],
      ['He thong nha khoa Kim', 'dental-clinics'],
      ['[TP.HCM] Hệ thống Nha khoa Kim', 'dental-clinics'],
      ['Phòng khám nha khoa Paris', 'dental-clinics'],
      ['Phòng khám nha khoa Sài Gòn Smile', 'dental-clinics'],
      ['Nha khoa Paris - Hà Nội', 'dental-clinics'],
      ['Bệnh viện Răng Hàm Mặt TP.HCM', 'dental-clinics'],
      ['California Fitness & Yoga', 'gyms-fitness'],
      ['CitiGym', 'gyms-fitness'],
      ['CitiGym Tân Bình', 'gyms-fitness'],
      ['CitiGym - khong gian tap luyen hien dai', 'gyms-fitness'],
      ['CitiGym - Không gian tập luyện hiện đại', 'gyms-fitness'],
      ['Getfit Gym', 'gyms-fitness'],
      ['Getfit Gym Hoàng Diệu', 'gyms-fitness'],
      ['Getfit Gym - thoi gian tap linh hoat', 'gyms-fitness'],
      ['Getfit Gym - Thời gian tập linh hoạt', 'gyms-fitness'],
      ['Get Fit Gym Quận 4', 'gyms-fitness'],
      ['GetFit Gym', 'gyms-fitness'],
      ['Swequity', 'gyms-fitness'],
      ['Swequity Ultimate Fitness', 'gyms-fitness'],
      ['Swequity Lương Yên', 'gyms-fitness'],
      ['The New Gym', 'gyms-fitness'],
      ['Phòng tập gym ABC', 'gyms-fitness'],
      ['Phòng tập gym ABC - máy móc hiện đại', 'gyms-fitness'],
      ['Phòng tập gym Elite Fitness', 'gyms-fitness'],
      ['Phòng tập gym Hùng Fitness Quận 7', 'gyms-fitness'],
      ['Trung tâm thể hình Elite Fitness', 'gyms-fitness'],
    ];
    for (const [title, expected] of genuinePlaces) {
      assert.equal(detectCategorySlug(title), expected, title);
      assert.equal(detectCategorySlug(title.normalize('NFD')), expected, `${title} (NFD)`);
    }

    // Retail products that mention clinic/gym vocabulary must stay in E3 or default, never Wave E5.
    const retailExpectations: Array<[string, string]> = [
      ['Whey Protein Rule 1 5lbs dùng cho phòng gym', 'supplements'],
      ['Whey Protein Swequity', 'supplements'],
      ['Creatine Monohydrate phòng gym', 'supplements'],
      ['Whey protein tập gym 2kg', 'supplements'],
      ['Miếng dán trắng răng chuẩn nha khoa thẩm mỹ', 'cosmetics'],
      ['Miếng dán trắng răng Hệ thống nha khoa', 'cosmetics'],
      ['Bình lắc whey phòng tập gym', 'smartphones'],
      ['Bình lắc Swequity', 'smartphones'],
      ['Túi đựng đồ đi phòng gym', 'smartphones'],
      ['Túi đựng đồ tập Getfit Gym', 'smartphones'],
      ['Thảm tập yoga cho phòng gym', 'smartphones'],
      ['Găng tay tập gym fitness club', 'smartphones'],
      ['Dây kháng lực fitness center tại nhà', 'smartphones'],
      ['Dây kháng lực get fit tại nhà', 'smartphones'],
      ['Máy tập đa năng cho phòng gym', 'smartphones'],
      ['May tap da nang cho phong gym', 'smartphones'],
      ['May tap da nang cho Getfit Gym', 'smartphones'],
      ['Giàn tạ đa năng cho phòng gym', 'smartphones'],
      ['Gian ta da nang Swequity', 'smartphones'],
      ['Gian tap ta da nang Swequity', 'smartphones'],
      ['Máy chạy bộ điện phòng gym', 'smartphones'],
      ['May chay bo dien California Fitness', 'smartphones'],
      ['Xe đạp tập thể dục phòng gym', 'smartphones'],
      ['Xe dap tap Elite Fitness', 'smartphones'],
      ['Ghế tập tạ đa năng cho phòng gym', 'smartphones'],
      ['Ghe tap ta Getfit Gym', 'smartphones'],
      ['Máy tăm nước Panasonic phòng khám nha khoa', 'smartphones'],
      ['Máy tăm nước Panasonic Hệ thống nha khoa khuyên dùng', 'smartphones'],
      ['Bàn chải điện Oral-B Dental Center khuyên dùng', 'smartphones'],
      ['Bàn chải điện Oral-B Hệ thống Nha khoa Kim khuyên dùng', 'smartphones'],
      ['Kem đánh răng chuẩn nha khoa thẩm mỹ', 'smartphones'],
      ['Kem đánh răng Hệ thống nha khoa', 'smartphones'],
      ['Gel tẩy trắng răng phòng khám nha khoa', 'smartphones'],
      ['Gel tẩy trắng răng Hệ thống nha khoa', 'smartphones'],
      ['Nước súc miệng chuẩn nha khoa quốc tế', 'smartphones'],
      ['Nước súc miệng chuẩn Hệ thống nha khoa', 'smartphones'],
      ['Chỉ nha khoa Oral-B 50m', 'smartphones'],
      ['Tăm chỉ nha khoa thẩm mỹ 50 cây', 'smartphones'],
      ['Găng tay tập gym chống chai', 'smartphones'],
    ];
    for (const [title, expected] of retailExpectations) {
      for (const [label, candidate] of [
        [title, title],
        [`${title} (NFD)`, title.normalize('NFD')],
      ] as const) {
        const actual = detectCategorySlug(candidate);
        assert.equal(actual, expected, label);
        assert.notEqual(actual, 'dental-clinics', label);
        assert.notEqual(actual, 'gyms-fitness', label);
      }
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

describe('Wave E5 Phase 2 (spas-aesthetics, english-centers, credit-cards) readiness', () => {
  const normalizer = new ProductNormalizer();

  it('registers v5 criteria, prompt hints/examples, and aiCategoryOpen exclusions', () => {
    for (const slug of WAVE_E5_PHASE2_SLUGS) {
      assert.equal(getRatingCriteriaVersion(slug), 5);
      assert.equal(CANONICAL_CATEGORY_SLUGS.has(slug), true);
      assert.equal(SIZELESS_CATEGORY_SLUGS.has(slug), true);
      assert.equal(WAVE_E_CATEGORY_SLUGS.has(slug), true);
      assert.equal(isAccessoryTitle('Ốp lưng dịch vụ', slug), false);
      assert.equal(detectCategorySlug('Anything', slug), slug);
      assert.equal(minimumListingPriceVnd(['Gói dịch vụ'], { categorySlug: slug }), 0);
      const list = getRatingCriteria(slug);
      assert.equal(list.length, 5);
      assert.equal(
        list.reduce((sum, row) => sum + row.weight, 0),
        100
      );
      assert.equal(list.filter(row => row.required).length, 1);
    }

    assert.equal(aiCategoryOpen('spas-aesthetics'), true);
    assert.equal(aiCategoryOpen('english-centers'), true);
    assert.equal(aiCategoryOpen('credit-cards'), false);

    for (const slug of WAVE_E5_PHASE2_PLACE_SLUGS) {
      const prompt = reviewAiInstructions(slug);
      assert.match(prompt, /review địa điểm/);
      assert.doesNotMatch(prompt, /[\u2013\u2014]/);
      const validKeys = new Set<string>(getRatingCriteria(slug).map(c => c.key));
      for (const key of validKeys) {
        assert.ok(prompt.includes(`- ${key}:`), `${slug} prompt missing ${key}`);
      }
      const exampleSection = prompt.slice(prompt.indexOf('Ví dụ'));
      const keysInExamples = [...exampleSection.matchAll(/"criterion_key":\s*"([^"]+)"/g)].map(
        m => m[1]!
      );
      assert.ok(keysInExamples.length >= 5, `${slug} must include example criterion keys`);
      for (const key of keysInExamples) {
        assert.ok(validKeys.has(key), `${slug} example used invalid criterion_key "${key}"`);
      }
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

    const built = buildRequests(
      [
        {
          id: 'rev-spa-1',
          text: 'Kỹ thuật viên tay nghề tốt, không chèo kéo, phòng riêng tư sạch sẽ.',
          textHash: 'spa-1',
          category: 'spas-aesthetics',
        },
        {
          id: 'rev-eng-1',
          text: 'Giáo viên bản ngữ nhiệt tình, lộ trình học IELTS rõ ràng dễ hiểu.',
          textHash: 'eng-1',
          category: 'english-centers',
        },
      ],
      'dos'
    );
    assert.equal(built.manifest[0]?.criteria_version, 5);
    assert.equal(built.manifest[1]?.criteria_version, 5);
  });

  it('normalizes spas, English centers, and credit cards with chain/bank brands', () => {
    const spaCases: Array<[string, string]> = [
      ['Thẩm mỹ viện Thu Cúc Quận 1', 'Thu Cúc'],
      ['Bệnh viện Thẩm mỹ Kangnam TP.HCM', 'Kangnam'],
      ['Seoul Center Quận 3', 'Seoul Center'],
      ['Thẩm mỹ viện Ngọc Dung Bình Thạnh', 'Ngọc Dung'],
      ['Thẩm mỹ viện Mailisa TP.HCM', 'Mailisa'],
      ['Gà Spa Quận 10', 'Gà Spa'],
      ['Hasaki Clinic & Spa Quận 3', 'Hasaki Clinic & Spa'],
      ['Shynh House Quận 1', 'Shynh House'],
      ['Menard Facial Salon Quận 1', 'Menard'],
    ];
    for (const [title, expectedBrand] of spaCases) {
      const out = normalizer.normalize(createPlace({ title }));
      assert.equal(out.category_slug, 'spas-aesthetics', title);
      assert.equal(out.entity_type, 'place', title);
      assert.equal(out.brand, expectedBrand, title);
      assert.equal(out.keyable, true, title);
      assert.deepEqual(out.key_specs, {}, title);
      assert.equal(out.storage_gb, null, title);
    }

    const engCases: Array<[string, string]> = [
      ['ILA Vietnam - Cơ sở Quận 1', 'ILA'],
      ['VUS Quang Trung', 'VUS'],
      ['Apollo English Cầu Giấy', 'Apollo English'],
      ['British Council Hà Nội', 'British Council'],
      ['ACET Lê Văn Sỹ', 'ACET'],
      ['Wall Street English Lê Quý Đôn', 'Wall Street English'],
      ['YOLA Quận 3', 'YOLA'],
      ['IELTS Fighter Cầu Giấy', 'IELTS Fighter'],
      ['DOL English Quận 10', 'DOL English'],
      ['ZIM Academy Bình Thạnh', 'ZIM'],
      ['Apax Leaders Hà Đông', 'Apax'],
      ['Language Link Hoàng Đạo Thúy', 'Language Link'],
      ['AMES English Cầu Giấy', 'AMES'],
      ['Ms Hoa TOEIC Quận 3', 'Ms Hoa'],
    ];
    for (const [title, expectedBrand] of engCases) {
      const out = normalizer.normalize(createPlace({ title }));
      assert.equal(out.category_slug, 'english-centers', title);
      assert.equal(out.entity_type, 'place', title);
      assert.equal(out.brand, expectedBrand, title);
      assert.equal(out.keyable, true, title);
    }

    const cardCases: Array<[string, string, ShopeeProduct['platform']]> = [
      ['Thẻ tín dụng VPBank StepUP Cashback', 'VPBank', 'vpbank'],
      ['Thẻ tín dụng Cake by VPBank Freedom', 'Cake by VPBank', 'vpbank'],
      ['Thẻ tín dụng VIB Online Plus 2in1', 'VIB', 'vib'],
      ['Thẻ tín dụng Techcombank Everyday', 'Techcombank', 'techcombank'],
      ['Thẻ tín dụng Sacombank Platinum Cashback', 'Sacombank', 'sacombank'],
      ['Thẻ tín dụng TPBank EVO', 'TPBank', 'tpbank'],
      ['Thẻ tín dụng HSBC Visa Cash Back', 'HSBC', 'hsbc'],
      ['Thẻ tín dụng Shinhan Hi-Point', 'Shinhan Bank', 'shinhan'],
      ['Thẻ tín dụng Eximbank Visa Violet', 'Eximbank', 'shopee'],
      ['Thẻ tín dụng HDBank Petrolimex 4in1', 'HDBank', 'shopee'],
      ['Thẻ tín dụng OCB OMNI Platinum', 'OCB', 'shopee'],
      ['Thẻ tín dụng MSB Visa Online', 'MSB', 'shopee'],
      ['Thẻ tín dụng SeABank SeALady', 'SeABank', 'shopee'],
      ['Thẻ tín dụng Standard Chartered Smart', 'Standard Chartered', 'shopee'],
      ['Thẻ tín dụng UOB One', 'UOB', 'shopee'],
    ];
    for (const [title, expectedBrand, platform] of cardCases) {
      const out = normalizer.normalize(
        createPlace({ title, platform, priceMin: 499_000, priceMax: 499_000 })
      );
      assert.equal(out.category_slug, 'credit-cards', title);
      assert.equal(out.entity_type, 'service', title);
      assert.equal(out.brand, expectedBrand, title);
      assert.equal(out.keyable, true, title);
      assert.deepEqual(out.key_specs, {}, title);
      assert.equal(out.storage_gb, null, title);
    }
  });

  it('guards credit-cards order before bank-savings and blocks retail products from Phase 2 categories', () => {
    // Credit card mentioning "tiết kiệm" still resolves to credit-cards, not bank-savings.
    assert.equal(
      detectCategorySlug('Thẻ tín dụng VPBank hoàn tiền tiết kiệm mua sắm'),
      'credit-cards'
    );
    assert.equal(detectCategorySlug('Gửi tiết kiệm online VPBank 12 tháng'), 'bank-savings');

    // Non-credit-card items must never detect as credit-cards.
    const nonCreditCards: Array<[string, string]> = [
      ['Thẻ quà tặng Gift Card 500k', 'smartphones'],
      ['Thẻ nhớ SanDisk MicroSD 128GB', 'smartphones'],
      ['Thẻ nhớ TF Card 64GB camera', 'smartphones'],
      ['Thẻ SIM 4G Viettel data', 'smartphones'],
      ['Đầu đọc thẻ nhớ USB-C Ugreen', 'smartphones'],
      ['Thẻ cào điện thoại Mobifone 100k', 'smartphones'],
      ['Thẻ game Garena 200k', 'smartphones'],
      ['Thẻ tên nhân viên mica có dây đeo', 'smartphones'],
      ['Ví đựng thẻ tín dụng da bò chống RFID', 'smartphones'],
      ['iPhone 16 Pro Max 256GB trả góp 0% qua thẻ tín dụng', 'smartphones'],
      ['MacBook Air M3 trả góp 0% qua thẻ tín dụng', 'laptops'],
    ];
    for (const [title, expected] of nonCreditCards) {
      const actual = detectCategorySlug(title);
      assert.equal(actual, expected, title);
      assert.notEqual(actual, 'credit-cards', title);
    }

    // Retail skincare/devices and English books/flashcards/pens/toys must stay out of Phase 2 places.
    const phase2RetailGuards: Array<[string, string]> = [
      ['Kem dưỡng da chuẩn spa Thu Cúc', 'cosmetics'],
      ['Serum trị mụn Hasaki Clinic & Spa', 'cosmetics'],
      ['Mặt nạ dưỡng ẩm spa Hàn Quốc', 'cosmetics'],
      ['Lotion dưỡng thể Menard Embellir 130ml', 'smartphones'],
      ['Máy massage mặt nâng cơ chuẩn spa', 'smartphones'],
      ['Máy triệt lông cầm tay chuẩn thẩm mỹ viện', 'smartphones'],
      ['Tinh dầu massage thư giãn spa 100ml', 'smartphones'],
      ['Sách luyện thi IELTS Fighter 4 kỹ năng', 'smartphones'],
      ['Giáo trình tiếng Anh British Council', 'smartphones'],
      ['Bộ thẻ học tiếng Anh Flashcard 500 từ cho bé', 'smartphones'],
      ['Từ điển Anh Việt Oxford cho trung tâm tiếng Anh', 'smartphones'],
      ['Bút chấm đọc tiếng Anh thông minh cho bé', 'smartphones'],
      ['Đồ chơi học tiếng Anh cho trẻ em', 'smartphones'],
      ['Workbook English Academy Grade 5', 'smartphones'],
    ];
    for (const [title, expected] of phase2RetailGuards) {
      for (const candidate of [title, title.normalize('NFD')]) {
        const actual = detectCategorySlug(candidate);
        assert.equal(actual, expected, title);
        assert.notEqual(actual, 'spas-aesthetics', title);
        assert.notEqual(actual, 'english-centers', title);
      }
    }
  });

  it('validates publish blockers and shipping-only review filters for Phase 2 categories', () => {
    const placeDetail = {
      place_key: 'thu-cuc:ho-chi-minh:q1',
      branch_group_key: 'thu-cuc',
      province_code: 'ho-chi-minh',
    };
    for (const slug of WAVE_E5_PHASE2_PLACE_SLUGS) {
      const row: CrawledMasterRow = {
        id: `master-${slug}`,
        model_key: `brand:${slug}-1:unknown`,
        slug: `brand-${slug}-1`,
        name: `Sample ${slug}`,
        brand: 'Brand',
        status: 'draft',
        category_id: `cat-${slug}`,
        entity_type: 'place',
        images: [],
        thumbnail: null,
        specifications: { category_slug: slug, availability: { status: 'Available' } },
      };
      assert.deepEqual(crawledPublishBlockers(row, { categorySlug: slug, placeDetail }), []);
      assert.ok(
        crawledPublishBlockers(row, { categorySlug: slug, placeDetail: null }).some(r =>
          r.includes('missing linked rate.place_details')
        )
      );
    }

    const cardRow: CrawledMasterRow = {
      id: 'master-card-1',
      model_key: 'vpbank:stepup-cashback:unknown',
      slug: 'vpbank-stepup-cashback',
      name: 'VPBank StepUP Cashback',
      brand: 'VPBank',
      status: 'draft',
      category_id: 'cat-credit-cards',
      entity_type: 'service',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'credit-cards', availability: { status: 'Available' } },
    };
    assert.deepEqual(
      crawledPublishBlockers(cardRow, {
        categorySlug: 'credit-cards',
        listings: [
          { price_current: 499_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
        ],
      }),
      []
    );
    assert.ok(
      crawledPublishBlockers(cardRow, {
        categorySlug: 'credit-cards',
        listings: [
          { price_current: 5.5, currency: 'PCT', availability: 'in_stock', origin: 'crawl' },
        ],
      }).some(r => r.includes('currency VND'))
    );
    assert.ok(
      crawledPublishBlockers(
        { ...cardRow, entity_type: 'product' },
        {
          categorySlug: 'credit-cards',
          listings: [
            { price_current: 499_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
          ],
        }
      ).some(r => r.includes('must be "service"'))
    );

    assert.equal(
      isShippingOnlyComment('Kỹ thuật viên tay nghề tốt, không chèo kéo, giao hàng nhanh.', {
        entityType: 'place',
        categorySlug: 'spas-aesthetics',
      }),
      false
    );
    assert.equal(
      isShippingOnlyComment('Giáo viên bản ngữ giảng dạy dễ hiểu, giao hàng nhanh.', {
        entityType: 'place',
        categorySlug: 'english-centers',
      }),
      false
    );
    assert.equal(
      isShippingOnlyComment('Giao hàng nhanh, shipper thân thiện, đóng gói cẩn thận.', {
        entityType: 'place',
        categorySlug: 'spas-aesthetics',
      }),
      true
    );
    // Scoped vocabulary does not leak into restaurants.
    assert.equal(
      isShippingOnlyComment('Kỹ thuật viên giao hàng nhanh, đóng gói cẩn thận.', {
        entityType: 'place',
        categorySlug: 'restaurants',
      }),
      true
    );
  });
});
