import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  WAVE_E2_SERVICE_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  WAVE_E5_PLACE_CATEGORY_SLUGS,
  WAVE_E5_SERVICE_CATEGORY_SLUGS,
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  isCategoryVisibleInDirectory,
  isPlaceCategorySlug,
  isServiceCategorySlug,
  isWaveE2ServiceCategorySlug,
  isWaveE4PlaceCategorySlug,
  isWaveE5PlaceCategorySlug,
  isWaveE5ServiceCategorySlug,
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
  formatPlaceReferencePriceRange,
  resolvePlaceJsonLdType,
} from '../place-details';
import { leaderboardCriteriaForCategory } from '../leaderboard-engine';
import { isCanonicalTrayCategorySlug } from '../../components/compare/compare-tray';
import { parseProductsFilterBounds } from '../../server/rate/api-handler';
import { buildRateOpenApiSpec } from '../../server/rate/openapi';
import {
  MCP_SUPPORTED_CATEGORY_GROUPS,
  SUPPORTED_CATEGORY_ENUM,
} from '../../server/rate/mcp';
import { RATE_ROUTES } from '@repo/shared-data';
import { getRatingCriteriaVersion } from '@repo/shared-data/rules';

console.warn(
  '🧪 Wave E5 dental-clinics and gyms-fitness web suite (DOS/Rate#1937)'
);

const webRoot = join(__dirname, '..', '..', '..');
const E5 = ['dental-clinics', 'gyms-fitness'] as const;
const E5_PHASE2_PLACES = ['spas-aesthetics', 'english-centers'] as const;
const E5_PHASE2_ALL = [
  'spas-aesthetics',
  'english-centers',
  'credit-cards',
] as const;

// 1. Canonical slugs and place/service guards.
assert.deepEqual(
  [...WAVE_E5_PLACE_CATEGORY_SLUGS],
  [...E5, ...E5_PHASE2_PLACES]
);
assert.deepEqual([...WAVE_E5_SERVICE_CATEGORY_SLUGS], ['credit-cards']);
assert.equal(WAVE_E2_SERVICE_CATEGORY_SLUGS.length, 2);
assert.equal(WAVE_E4_PLACE_CATEGORY_SLUGS.length, 4);
assert.equal(ALL_CANONICAL_CATEGORY_SLUGS.length, 24);
assert.deepEqual(ALL_CANONICAL_CATEGORY_SLUGS.slice(-5), [
  ...E5,
  ...E5_PHASE2_ALL,
]);
for (const slug of E5) {
  assert.equal(isCanonicalCategorySlug(slug), true);
  assert.equal(isWaveE5PlaceCategorySlug(slug), true);
  assert.equal(isWaveE4PlaceCategorySlug(slug), false);
  assert.equal(isPlaceCategorySlug(slug), true, `${slug} is a place`);
  assert.equal(getRatingCriteriaVersion(slug), 4);
  assert.equal(isCanonicalTrayCategorySlug(slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 0), false);
  assert.equal(isCategoryVisibleInDirectory(slug, 0, slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 1), true);
  assert.deepEqual(leaderboardCriteriaForCategory(slug), ['value']);
  assert.equal(
    parseProductsFilterBounds(new URLSearchParams({ category: slug }))
      ?.categorySlug,
    slug
  );
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
}
assert.equal(isPlaceCategorySlug('cafes'), true);
assert.equal(isPlaceCategorySlug('smartphones'), false);
assert.equal(RATE_ROUTES.DENTAL_CLINICS, '/dental-clinics');
assert.equal(RATE_ROUTES.GYMS_FITNESS, '/gyms-fitness');

// 2. Keyword fallback, including a gym name containing "Yoga" and retail titles mentioning
// clinic/gym terms that must stay in their E3 or default category (parity with normalizer).
const keywordSamples: Array<[string, string]> = [
  ['Nha khoa Kim', 'dental-clinics'],
  ['Nha khoa Kim Quận 3', 'dental-clinics'],
  ['Nha khoa Kim Bình Thạnh', 'dental-clinics'],
  ['Hệ thống Nha khoa Kim', 'dental-clinics'],
  ['Hệ thống nha khoa Paris - Chi nhánh Quận 1', 'dental-clinics'],
  ['He thong nha khoa Kim', 'dental-clinics'],
  ['[TP.HCM] Hệ thống Nha khoa Kim', 'dental-clinics'],
  ['Phòng khám nha khoa Paris', 'dental-clinics'],
  ['Phòng khám nha khoa Sài Gòn Smile', 'dental-clinics'],
  ['Nha khoa Paris - Hà Nội', 'dental-clinics'],
  ['Bệnh viện Răng Hàm Mặt Trung ương', 'dental-clinics'],
  ['California Fitness & Yoga', 'gyms-fitness'],
  ['California Fitness & Yoga Hai Bà Trưng', 'gyms-fitness'],
  ['Phòng tập gym Elite Fitness', 'gyms-fitness'],
  ['Phòng tập gym Hùng Fitness Quận 7', 'gyms-fitness'],
  ['Phòng tập gym ABC', 'gyms-fitness'],
  ['Phòng tập gym ABC - máy móc hiện đại', 'gyms-fitness'],
  ['Trung tâm thể hình Elite Fitness', 'gyms-fitness'],
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
  ['Lenovo Yoga Slim 7 14 inch', 'laptops'],
];
for (const [name, expected] of keywordSamples) {
  assert.equal(
    getMasterProductCategorySlug({ slug: 'sample-slug', name }),
    expected,
    `"${name}" must classify as ${expected}`
  );
  assert.equal(
    getMasterProductCategorySlug({
      slug: 'sample-slug',
      name: name.normalize('NFD'),
    }),
    expected,
    `"${name}" (NFD) must classify as ${expected}`
  );
}
assert.equal(
  getMasterProductCategorySlug({
    slug: 'kim-q3',
    name: '',
    model: 'Hệ thống Nha khoa Kim',
  }),
  'dental-clinics'
);
assert.equal(
  getMasterProductCategorySlug({
    slug: 'kim-q3',
    name: '',
    model: 'Hệ thống Nha khoa Kim'.normalize('NFD'),
  }),
  'dental-clinics'
);
assert.equal(
  getMasterProductHref({
    slug: 'nha-khoa-kim-q3',
    name: 'Nha khoa Kim Quận 3',
  }),
  '/dental-clinics/nha-khoa-kim-q3'
);
assert.equal(
  getMasterProductHref({
    slug: 'he-thong-nha-khoa-kim',
    name: 'Hệ thống Nha khoa Kim',
  }),
  '/dental-clinics/he-thong-nha-khoa-kim'
);
assert.equal(
  getMasterProductHref({
    slug: 'getfit-gym-hoang-dieu',
    name: 'Getfit Gym Hoàng Diệu',
  }),
  '/gyms-fitness/getfit-gym-hoang-dieu'
);
assert.equal(
  getMasterProductHref({
    slug: 'swequity-ultimate-fitness',
    name: 'Swequity Ultimate Fitness',
  }),
  '/gyms-fitness/swequity-ultimate-fitness'
);
const retailSamples: Array<[string, string]> = [
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
for (const [name, expected] of retailSamples) {
  for (const [label, candidate] of [
    [name, name],
    [`${name} (NFD)`, name.normalize('NFD')],
  ] as const) {
    const actual = getMasterProductCategorySlug({
      slug: 'sample-slug',
      name: candidate,
    });
    assert.equal(actual, expected, `"${label}" must stay ${expected}`);
    assert.notEqual(actual, 'dental-clinics', label);
    assert.notEqual(actual, 'gyms-fitness', label);
  }
}
assert.equal(
  getMasterProductHref({
    slug: 'may-tap-da-nang-cho-phong-gym',
    name: 'Máy tập đa năng cho phòng gym',
  }),
  '/smartphones/may-tap-da-nang-cho-phong-gym'
);

// 3. Price units keep NULL semantics: no per-person or per-night suffix by default.
for (const slug of E5) {
  for (const loc of ['vi', 'en', 'cs'] as const) {
    assert.equal(resolveListingUnitSuffix('VND', slug, loc), '');
  }
  assert.equal(hasListingUnitSuffix('VND', slug), false);
  assert.equal(
    formatPlaceReferencePriceRange({
      priceMin: 300_000,
      priceMax: 1_500_000,
      categorySlug: slug,
      locale: 'vi',
    }),
    '300.000 ₫ - 1.500.000 ₫'
  );
}

// 4. JSON-LD types.
assert.equal(resolvePlaceJsonLdType('dental-clinics'), 'Dentist');
assert.equal(resolvePlaceJsonLdType('gyms-fitness'), 'ExerciseGym');
assert.equal(resolvePlaceJsonLdType('cafes'), 'CafeOrCoffeeShop');

// 5. Filter schemas and locale parity for every surface that lists categories.
const locales = Object.fromEntries(
  (['vi', 'en', 'cs'] as const).map((loc) => [
    loc,
    JSON.parse(readFileSync(join(webRoot, 'locales', `${loc}.json`), 'utf8')),
  ])
) as Record<'vi' | 'en' | 'cs', Record<string, unknown>>;

const pick = (root: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (cur, key) =>
      cur && typeof cur === 'object'
        ? (cur as Record<string, unknown>)[key]
        : undefined,
    root
  );

const labelKey: Record<(typeof E5)[number], string> = {
  'dental-clinics': 'DentalClinics',
  'gyms-fitness': 'GymsFitness',
};

for (const slug of E5) {
  const schema = CATEGORY_FILTER_SCHEMAS[slug];
  assert.ok(schema, `CATEGORY_FILTER_SCHEMAS missing ${slug}`);
  assert.equal(schema.categorySlug, slug);
  assert.equal(schema.directorySlug, 'places');
  assert.deepEqual(schema.ramOptionsGb, []);
  assert.deepEqual(schema.storageOptionsGb, []);
  assert.equal(getCategoryFilterSchema(slug).categorySlug, slug);
  for (const preset of schema.pricePresets) {
    assert.doesNotMatch(preset.label, /\/(người|đêm)/, 'no unit on presets');
  }

  const k = labelKey[slug];
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const msg = locales[loc];
    const required: readonly (readonly string[])[] = [
      ['rate', 'nav', slug],
      ['rate', 'footer', 'links', slug],
      ['compare', `cat${k}`],
      ['compare', `cat${k}Unit`],
      ['leaderboard', `cat${k}`],
      ['leaderboard', `tab${k}`],
      ['homePage', `catDesc${k}`],
      ['catalog', 'meta', slug, 'titleCount'],
      ['catalog', 'meta', slug, 'titleDefault'],
      ['catalog', 'meta', slug, 'description'],
      ['catalog', 'schemas', slug, 'title'],
      ['catalog', 'schemas', slug, 'subtitle'],
      ['catalog', 'schemas', slug, 'searchPlaceholder'],
    ];
    for (const path of required) {
      const value = pick(msg, path);
      assert.equal(typeof value, 'string', `${loc}.${path.join('.')} missing`);
      assert.doesNotMatch(value as string, /[\u2013\u2014]/);
    }
    for (const preset of schema.pricePresets) {
      assert.equal(
        typeof pick(msg, ['catalog', 'schemas', slug, 'presets', preset.id]),
        'string',
        `${loc} preset ${preset.id} missing for ${slug}`
      );
    }
    const localized = localizeCategoryFilterSchema(schema, (key: string) => {
      const value = pick(msg, ['catalog', ...key.split('.')]);
      assert.equal(typeof value, 'string', `${loc}.catalog.${key} missing`);
      return value as string;
    });
    assert.ok(localized.categoryTitle.length > 0);
  }
}
assert.equal(pick(locales.vi, ['rate', 'nav', 'dental-clinics']), 'Nha khoa');

// 6. Route config: dotted place & service slugs stay with the proxy and away from the 404 rewrite.
const nextConfig = readFileSync(join(webRoot, 'next.config.mjs'), 'utf8');
assert.equal(
  (
    nextConfig.match(
      /\|homestays\|dental-clinics\|gyms-fitness\|spas-aesthetics\|english-centers\|credit-cards\)/g
    ) ?? []
  ).length,
  2
);
const proxySource = readFileSync(join(webRoot, 'src/proxy.ts'), 'utf8');
assert.ok(
  proxySource.includes('[dD][eE][nN][tT][aA][lL]-[cC][lL][iI][nN][iI][cC][sS]')
);
assert.ok(
  proxySource.includes('[gG][yY][mM][sS]-[fF][iI][tT][nN][eE][sS][sS]')
);
assert.ok(
  proxySource.includes(
    '[sS][pP][aA][sS]-[aA][eE][sS][tT][hH][eE][tT][iI][cC][sS]'
  )
);
assert.ok(
  proxySource.includes(
    '[eE][nN][gG][lL][iI][sS][hH]-[cC][eE][nN][tT][eE][rR][sS]'
  )
);
assert.ok(
  proxySource.includes('[cC][rR][eE][dD][iI][tT]-[cC][aA][rR][dD][sS]')
);

// 7. Public API surfaces list all Wave E5 slugs.
const spec = buildRateOpenApiSpec('https://rate.vn') as unknown as {
  components: { schemas: { CanonicalRateCategorySlug: { enum: string[] } } };
};
for (const slug of [...E5, ...E5_PHASE2_ALL]) {
  assert.ok(
    spec.components.schemas.CanonicalRateCategorySlug.enum.includes(slug),
    `OpenAPI enum missing ${slug}`
  );
  assert.ok(
    (SUPPORTED_CATEGORY_ENUM.options as readonly string[]).includes(slug),
    `MCP enum missing ${slug}`
  );
}
assert.deepEqual(
  MCP_SUPPORTED_CATEGORY_GROUPS.find((g) => g.label === 'Wave E5 places')
    ?.slugs,
  [...E5, ...E5_PHASE2_PLACES]
);
assert.deepEqual(
  MCP_SUPPORTED_CATEGORY_GROUPS.find((g) => g.label === 'Wave E5 services')
    ?.slugs,
  ['credit-cards']
);

// 8. Wave E5 Phase 2 (spas-aesthetics, english-centers, credit-cards) checks (DOS/Rate#1968).
assert.equal(RATE_ROUTES.SPAS_AESTHETICS, '/spas-aesthetics');
assert.equal(RATE_ROUTES.ENGLISH_CENTERS, '/english-centers');
assert.equal(RATE_ROUTES.CREDIT_CARDS, '/credit-cards');

for (const slug of E5_PHASE2_ALL) {
  assert.equal(isCanonicalCategorySlug(slug), true);
  assert.equal(getRatingCriteriaVersion(slug), 5);
  assert.equal(isCanonicalTrayCategorySlug(slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 0), false);
  assert.equal(isCategoryVisibleInDirectory(slug, 0, slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 1), true);
  assert.deepEqual(leaderboardCriteriaForCategory(slug), ['value']);
  assert.equal(
    parseProductsFilterBounds(new URLSearchParams({ category: slug }))
      ?.categorySlug,
    slug
  );
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
}

for (const slug of E5_PHASE2_PLACES) {
  assert.equal(isWaveE5PlaceCategorySlug(slug), true);
  assert.equal(isPlaceCategorySlug(slug), true);
  assert.equal(isServiceCategorySlug(slug), false);
  for (const loc of ['vi', 'en', 'cs'] as const) {
    assert.equal(resolveListingUnitSuffix('VND', slug, loc), '');
  }
  assert.equal(hasListingUnitSuffix('VND', slug), false);
}

assert.equal(isWaveE5ServiceCategorySlug('credit-cards'), true);
assert.equal(isWaveE2ServiceCategorySlug('credit-cards'), false);
assert.equal(isServiceCategorySlug('credit-cards'), true);
assert.equal(isServiceCategorySlug('bank-savings'), true);
assert.equal(isServiceCategorySlug('internet-telecom'), true);
assert.equal(isPlaceCategorySlug('credit-cards'), false);

// Credit cards use yearly fee suffixes (/năm, /yr, /rok) on VND prices.
assert.equal(resolveListingUnitSuffix('VND', 'credit-cards', 'vi'), '/năm');
assert.equal(resolveListingUnitSuffix('VND', 'credit-cards', 'en'), '/yr');
assert.equal(resolveListingUnitSuffix('VND', 'credit-cards', 'cs'), '/rok');
assert.equal(hasListingUnitSuffix('VND', 'credit-cards'), true);
assert.match(
  formatListingPrice(499_000, 'VND', 'vi', { categorySlug: 'credit-cards' }),
  /499\.000.*\/năm$/
);
assert.match(
  formatListingPrice(499_000, 'VND', 'en', { categorySlug: 'credit-cards' }),
  /499[.,]000.*\/yr$/
);
assert.match(
  formatListingPrice(499_000, 'VND', 'cs', { categorySlug: 'credit-cards' }),
  /499.*000.*\/rok$/
);

// Phase 2 JSON-LD types.
assert.equal(resolvePlaceJsonLdType('spas-aesthetics'), 'DaySpa');
assert.equal(
  resolvePlaceJsonLdType('english-centers'),
  'EducationalOrganization'
);

// Phase 2 keyword fallback (credit-cards before bank-savings, spas/english after E3 retail guards).
const phase2KeywordSamples: Array<[string, string]> = [
  ['Thẻ tín dụng VPBank StepUP Cashback', 'credit-cards'],
  ['Thẻ tín dụng Vietcombank Visa Signature', 'credit-cards'],
  ['Thẻ tín dụng ACB hoàn tiền tiết kiệm', 'credit-cards'],
  ['The tin dung VIB Online Plus 2in1', 'credit-cards'],
  ['HSBC Visa Cash Back Credit Card', 'credit-cards'],
  ['Gửi tiết kiệm online Vietcombank 12 tháng', 'bank-savings'],
  ['Thẩm mỹ viện Thu Cúc Quận 1', 'spas-aesthetics'],
  ['Bệnh viện Thẩm mỹ Kangnam TP.HCM', 'spas-aesthetics'],
  ['Hasaki Clinic & Spa Quận 3', 'spas-aesthetics'],
  ['Gà Spa Quận 10', 'spas-aesthetics'],
  ['Seoul Center Bình Thạnh', 'spas-aesthetics'],
  ['ILA Vietnam Cơ sở Quận 1', 'english-centers'],
  ['VUS Quang Trung', 'english-centers'],
  ['British Council Hà Nội', 'english-centers'],
  ['IELTS Fighter Cầu Giấy', 'english-centers'],
  ['DOL English Quận 10', 'english-centers'],
  ['Ms Hoa TOEIC Quận 3', 'english-centers'],
];
for (const [name, expected] of phase2KeywordSamples) {
  assert.equal(
    getMasterProductCategorySlug({ slug: 'sample-slug', name }),
    expected,
    `"${name}" must classify as ${expected}`
  );
  assert.equal(
    getMasterProductCategorySlug({
      slug: 'sample-slug',
      name: name.normalize('NFD'),
    }),
    expected,
    `"${name}" (NFD) must classify as ${expected}`
  );
}

const phase2NegativeGuards: Array<[string, string]> = [
  ['Thẻ quà tặng Gift Card 500k', 'smartphones'],
  ['Thẻ nhớ SanDisk MicroSD 128GB', 'smartphones'],
  ['Thẻ SIM 4G Viettel data', 'smartphones'],
  ['Thẻ cào điện thoại Viettel 100k', 'smartphones'],
  ['Thẻ game Garena 200k', 'smartphones'],
  ['Ví đựng thẻ tín dụng da bò chống RFID', 'smartphones'],
  ['iPhone 16 Pro Max 256GB trả góp 0% qua thẻ tín dụng', 'smartphones'],
  ['Kem dưỡng da chuẩn spa Thu Cúc', 'cosmetics'],
  ['Serum trị mụn Hasaki Clinic & Spa', 'cosmetics'],
  ['Máy massage mặt nâng cơ chuẩn spa', 'smartphones'],
  ['Máy triệt lông cầm tay chuẩn thẩm mỹ viện', 'smartphones'],
  ['Sách luyện thi IELTS Fighter 4 kỹ năng', 'smartphones'],
  ['Bộ thẻ học tiếng Anh Flashcard 500 từ', 'smartphones'],
  ['Bút chấm đọc tiếng Anh thông minh cho bé', 'smartphones'],
  ['Từ điển Anh Việt Oxford cho trung tâm tiếng Anh', 'smartphones'],
  ['Đồ chơi học tiếng Anh cho trẻ em', 'smartphones'],
];
for (const [name, expected] of phase2NegativeGuards) {
  for (const candidate of [name, name.normalize('NFD')]) {
    const actual = getMasterProductCategorySlug({
      slug: 'sample-slug',
      name: candidate,
    });
    assert.equal(actual, expected, `"${name}" must stay ${expected}`);
    assert.notEqual(actual, 'credit-cards', name);
    assert.notEqual(actual, 'spas-aesthetics', name);
    assert.notEqual(actual, 'english-centers', name);
  }
}

// Phase 2 filter schemas & locale parity across vi/en/cs.
const phase2LabelKey: Record<(typeof E5_PHASE2_ALL)[number], string> = {
  'spas-aesthetics': 'SpasAesthetics',
  'english-centers': 'EnglishCenters',
  'credit-cards': 'CreditCards',
};
for (const slug of E5_PHASE2_ALL) {
  const schema = CATEGORY_FILTER_SCHEMAS[slug];
  assert.ok(schema, `CATEGORY_FILTER_SCHEMAS missing ${slug}`);
  assert.equal(schema.categorySlug, slug);
  assert.equal(
    schema.directorySlug,
    slug === 'credit-cards' ? 'services' : 'places'
  );
  assert.equal(getCategoryFilterSchema(slug).categorySlug, slug);
  const k = phase2LabelKey[slug];
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const msg = locales[loc];
    const required: readonly (readonly string[])[] = [
      ['rate', 'nav', slug],
      ['rate', 'footer', 'links', slug],
      ['compare', `cat${k}`],
      ['compare', `cat${k}Unit`],
      ['leaderboard', `cat${k}`],
      ['leaderboard', `tab${k}`],
      ['homePage', `catDesc${k}`],
      ['catalog', 'meta', slug, 'titleCount'],
      ['catalog', 'meta', slug, 'titleDefault'],
      ['catalog', 'meta', slug, 'description'],
      ['catalog', 'schemas', slug, 'title'],
      ['catalog', 'schemas', slug, 'subtitle'],
      ['catalog', 'schemas', slug, 'searchPlaceholder'],
      ...(slug === 'credit-cards'
        ? ([['deals', `cat${k}`]] as const)
        : ([] as const)),
    ];
    for (const path of required) {
      const value = pick(msg, path);
      assert.equal(typeof value, 'string', `${loc}.${path.join('.')} missing`);
      assert.doesNotMatch(value as string, /[\u2013\u2014]/);
    }
    for (const preset of schema.pricePresets) {
      assert.equal(
        typeof pick(msg, ['catalog', 'schemas', slug, 'presets', preset.id]),
        'string',
        `${loc} preset ${preset.id} missing for ${slug}`
      );
    }
    const localized = localizeCategoryFilterSchema(schema, (key: string) => {
      const value = pick(msg, ['catalog', ...key.split('.')]);
      assert.equal(typeof value, 'string', `${loc}.catalog.${key} missing`);
      return value as string;
    });
    assert.ok(localized.categoryTitle.length > 0);
  }
}

console.warn('✅ Wave E5 web suite passed');
