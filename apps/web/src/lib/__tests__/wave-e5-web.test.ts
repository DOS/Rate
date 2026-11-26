import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  WAVE_E4_PLACE_CATEGORY_SLUGS,
  WAVE_E5_PLACE_CATEGORY_SLUGS,
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  isCategoryVisibleInDirectory,
  isPlaceCategorySlug,
  isWaveE4PlaceCategorySlug,
  isWaveE5PlaceCategorySlug,
} from '../rate-domain-core';
import {
  CATEGORY_FILTER_SCHEMAS,
  getCategoryFilterSchema,
  localizeCategoryFilterSchema,
} from '../category-filters';
import {
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

// 1. Canonical slugs and place guards.
assert.deepEqual([...WAVE_E5_PLACE_CATEGORY_SLUGS], [...E5]);
assert.equal(WAVE_E4_PLACE_CATEGORY_SLUGS.length, 4);
assert.equal(ALL_CANONICAL_CATEGORY_SLUGS.length, 21);
assert.deepEqual(ALL_CANONICAL_CATEGORY_SLUGS.slice(-2), [...E5]);
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
// clinic/gym terms that must stay in their E3 or default category.
const keywordSamples: Array<[string, string]> = [
  ['Nha khoa Kim', 'dental-clinics'],
  ['Nha khoa Kim Quận 3', 'dental-clinics'],
  ['Nha khoa Kim Bình Thạnh', 'dental-clinics'],
  ['Phòng khám nha khoa Paris', 'dental-clinics'],
  ['Phòng khám nha khoa Sài Gòn Smile', 'dental-clinics'],
  ['Bệnh viện Răng Hàm Mặt Trung ương', 'dental-clinics'],
  ['California Fitness & Yoga', 'gyms-fitness'],
  ['California Fitness & Yoga Hai Bà Trưng', 'gyms-fitness'],
  ['Phòng tập gym Elite Fitness', 'gyms-fitness'],
  ['Phòng tập gym Hùng Fitness Quận 7', 'gyms-fitness'],
  ['CitiGym', 'gyms-fitness'],
  ['CitiGym Tân Bình', 'gyms-fitness'],
  ['Lenovo Yoga Slim 7 14 inch', 'laptops'],
];
for (const [name, expected] of keywordSamples) {
  assert.equal(
    getMasterProductCategorySlug({ slug: 'sample-slug', name }),
    expected,
    `"${name}" must classify as ${expected}`
  );
}
assert.equal(
  getMasterProductHref({
    slug: 'nha-khoa-kim-q3',
    name: 'Nha khoa Kim Quận 3',
  }),
  '/dental-clinics/nha-khoa-kim-q3'
);
const retailSamples: Array<[string, string]> = [
  ['Whey Protein Rule 1 5lbs dùng cho phòng gym', 'supplements'],
  ['Creatine Monohydrate phòng gym', 'supplements'],
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
];
for (const [name, expected] of retailSamples) {
  const actual = getMasterProductCategorySlug({ slug: 'sample-slug', name });
  assert.equal(actual, expected, `"${name}" must stay ${expected}`);
  assert.notEqual(actual, 'dental-clinics', name);
  assert.notEqual(actual, 'gyms-fitness', name);
}

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

// 6. Route config: dotted place slugs stay with the proxy and away from the 404 rewrite.
const nextConfig = readFileSync(join(webRoot, 'next.config.mjs'), 'utf8');
assert.equal(
  (nextConfig.match(/\|homestays\|dental-clinics\|gyms-fitness\)/g) ?? [])
    .length,
  2
);
const proxySource = readFileSync(join(webRoot, 'src/proxy.ts'), 'utf8');
assert.ok(
  proxySource.includes('[dD][eE][nN][tT][aA][lL]-[cC][lL][iI][nN][iI][cC][sS]')
);
assert.ok(
  proxySource.includes('[gG][yY][mM][sS]-[fF][iI][tT][nN][eE][sS][sS]')
);

// 7. Public API surfaces list both slugs.
const spec = buildRateOpenApiSpec('https://rate.vn') as unknown as {
  components: { schemas: { CanonicalRateCategorySlug: { enum: string[] } } };
};
for (const slug of E5) {
  assert.ok(
    spec.components.schemas.CanonicalRateCategorySlug.enum.includes(slug)
  );
  assert.ok(
    (SUPPORTED_CATEGORY_ENUM.options as readonly string[]).includes(slug)
  );
}
assert.deepEqual(
  MCP_SUPPORTED_CATEGORY_GROUPS.find((g) => g.label === 'Wave E5 places')
    ?.slugs,
  [...E5]
);

console.warn('✅ Wave E5 web suite passed');
