import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_CANONICAL_CATEGORY_SLUGS,
  WAVE_E6_PRODUCT_CATEGORY_SLUGS,
  WAVE_E6_SERVICE_CATEGORY_SLUGS,
  getMasterProductCategorySlug,
  getMasterProductHref,
  isCanonicalCategorySlug,
  isCategoryVisibleInDirectory,
  isPlaceCategorySlug,
  isServiceCategorySlug,
  isWaveE6ProductCategorySlug,
  isWaveE6ServiceCategorySlug,
  resolveListingPriceCurrency,
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
import { leaderboardCriteriaForCategory } from '../leaderboard-engine';
import { isCanonicalTrayCategorySlug } from '../../components/compare/compare-tray';
import {
  buildDealCsvRow,
  buildDealJsonItem,
  rankProductsForDealFinder,
} from '../../components/deals/DealFinderWorkspace';
import { parseProductsFilterBounds } from '../../server/rate/api-handler';
import { buildRateOpenApiSpec } from '../../server/rate/openapi';
import {
  MCP_SUPPORTED_CATEGORY_COUNT,
  SUPPORTED_CATEGORY_ENUM,
  buildRateLlmsTxt,
} from '../../server/rate/mcp';
import {
  getCategorySpecTemplate,
  getRatingCriteria,
  getRatingCriteriaVersion,
} from '@repo/shared-data/rules';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import csMessages from '../../../locales/cs.json';

console.warn(
  '🧪 Wave E6 web suite (monitors, cameras, vps-hosting, DOS/Rate#1976)'
);

const webRoot = join(__dirname, '..', '..', '..');
const E6_ALL = ['monitors', 'cameras', 'vps-hosting'] as const;

// 1. Canonical slugs, guards, routes, and criteria v6.
assert.equal(ALL_CANONICAL_CATEGORY_SLUGS.length, 27);
assert.deepEqual([...WAVE_E6_PRODUCT_CATEGORY_SLUGS], ['monitors', 'cameras']);
assert.deepEqual([...WAVE_E6_SERVICE_CATEGORY_SLUGS], ['vps-hosting']);
assert.deepEqual(ALL_CANONICAL_CATEGORY_SLUGS.slice(-3), [...E6_ALL]);

for (const slug of E6_ALL) {
  assert.equal(isCanonicalCategorySlug(slug), true);
  assert.equal(isPlaceCategorySlug(slug), false);
  assert.equal(getRatingCriteriaVersion(slug), 6);
  assert.equal(getRatingCriteria(slug).length, 5);
  assert.equal(isCanonicalTrayCategorySlug(slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 0), false);
  assert.equal(isCategoryVisibleInDirectory(slug, 0, slug), true);
  assert.equal(isCategoryVisibleInDirectory(slug, 1), true);
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

assert.equal(isWaveE6ProductCategorySlug('monitors'), true);
assert.equal(isWaveE6ProductCategorySlug('cameras'), true);
assert.equal(isWaveE6ProductCategorySlug('vps-hosting'), false);
assert.equal(isWaveE6ServiceCategorySlug('vps-hosting'), true);
assert.equal(isServiceCategorySlug('vps-hosting'), true);
assert.equal(isServiceCategorySlug('monitors'), false);
assert.equal(isServiceCategorySlug('cameras'), false);

// 2. Leaderboard criteria & spec templates.
assert.deepEqual(leaderboardCriteriaForCategory('monitors'), [
  'screen',
  'performance',
  'value',
]);
assert.deepEqual(leaderboardCriteriaForCategory('cameras'), [
  'performance',
  'camera',
  'battery',
  'value',
]);
assert.deepEqual(leaderboardCriteriaForCategory('vps-hosting'), [
  'performance',
  'value',
]);
assert.equal(getCategorySpecTemplate('monitors').screen, true);
assert.equal(
  getCategorySpecTemplate('cameras').groups.includes('camera'),
  false
);
assert.deepEqual(
  [...getCategorySpecTemplate('vps-hosting').groups],
  ['availability', 'regulatory']
);

// 3. Monthly price suffix for vps-hosting AND explicit vnd_per_month unit.
assert.equal(resolveListingUnitSuffix('VND', 'vps-hosting', 'vi'), '/tháng');
assert.equal(resolveListingUnitSuffix('VND', 'vps-hosting', 'en'), '/mo');
assert.equal(resolveListingUnitSuffix('VND', 'vps-hosting', 'cs'), '/měs.');
assert.equal(
  resolveListingUnitSuffix('VND', '/vps-hosting/nhanhoa-vps-a', 'vi'),
  '/tháng'
);
assert.equal(
  resolveListingUnitSuffix('VND', null, 'vi', 'vnd_per_month'),
  '/tháng'
);
assert.equal(
  resolveListingUnitSuffix('VND', null, 'en', 'vnd_per_month'),
  '/mo'
);
assert.equal(
  resolveListingUnitSuffix('VND', null, 'cs', 'vnd_per_month'),
  '/měs.'
);
assert.equal(hasListingUnitSuffix('VND', 'vps-hosting'), true);
assert.equal(hasListingUnitSuffix('VND', 'monitors'), false);
assert.equal(hasListingUnitSuffix('VND', 'cameras'), false);
assert.equal(
  resolveListingPriceCurrency({ categorySlug: 'vps-hosting' }),
  'VND'
);
assert.match(
  formatListingPrice(180_000, 'VND', 'vi', { categorySlug: 'vps-hosting' }),
  /\/tháng$/
);

// 4. Category fallback detection (including hyphenated slugs) & anti-hijacking guards.
const fallbackCases: Array<[{ slug: string; name?: string }, string]> = [
  [
    {
      slug: 'dell-ultrasharp-u2724d',
      name: 'Màn hình Dell UltraSharp U2724D 27 inch',
    },
    'monitors',
  ],
  [
    {
      slug: 'asus-tuf-gaming-vg27aq3a',
      name: 'Màn hình ASUS TUF Gaming VG27AQ3A',
    },
    'monitors',
  ],
  [{ slug: 'lg-ultragear-27gr75q-b' }, 'monitors'],
  [{ slug: 'man-hinh-gaming-27-inch-180hz' }, 'monitors'],
  [
    {
      slug: 'apple-studio-display-27',
      name: 'Apple Studio Display 27 inch 5K',
    },
    'monitors',
  ],
  [{ slug: 'asus-proart-display-pa279crv' }, 'monitors'],
  [{ slug: 'lenovo-legion-r27q-30' }, 'monitors'],
  [{ slug: 'hp-omen-27q' }, 'monitors'],
  [{ slug: 'msi-mag-274qrf-qd-e2' }, 'monitors'],
  [{ slug: 'lg-27up850n-w' }, 'monitors'],
  [
    { slug: 'sony-alpha-a6700', name: 'Máy ảnh Sony Alpha A6700 Body' },
    'cameras',
  ],
  [
    {
      slug: 'may-anh-sony-a7-iv-lens-28-70mm',
      name: 'Máy ảnh Sony A7 IV + Lens 28-70mm',
    },
    'cameras',
  ],
  [{ slug: 'gopro-hero-13-black' }, 'cameras'],
  [{ slug: 'dji-osmo-action-5-pro' }, 'cameras'],
  [{ slug: 'may-anh-canon-eos-r50-kit' }, 'cameras'],
  [
    { slug: 'nhanhoa-cloud-vps-nvme-a', name: 'Cloud VPS NVMe Nhân Hòa' },
    'vps-hosting',
  ],
  [{ slug: 'hostvn-wordpress-hosting-pro' }, 'vps-hosting'],
  // Anti-hijacking negatives
  [
    {
      slug: 'iphone-16-pro-max',
      name: 'iPhone 16 Pro Max màn hình OLED 6.9 inch camera 48MP',
    },
    'smartphones',
  ],
  [
    {
      slug: 'samsung-galaxy-s24-ultra',
      name: 'Samsung Galaxy S24 Ultra màn hình OLED 120Hz',
    },
    'smartphones',
  ],
  [
    {
      slug: 'asus-tuf-gaming-a15',
      name: 'Laptop ASUS TUF Gaming A15 màn hình 15.6 inch',
    },
    'laptops',
  ],
  [
    {
      slug: 'asus-rog-strix-g16',
      name: 'ASUS ROG Strix G16 màn hình 16 inch 165Hz RTX 4060',
    },
    'laptops',
  ],
  [
    {
      slug: 'lenovo-legion-r7000p',
      name: 'Lenovo Legion R7000P màn hình 16 inch 2.5K',
    },
    'laptops',
  ],
  [
    {
      slug: 'hp-omen-16b',
      name: 'HP OMEN 16b màn hình 16.1 inch QHD',
    },
    'laptops',
  ],
  [
    { slug: 'asus-proart-p16-h7606', name: 'ASUS ProArt P16 H7606 OLED' },
    'smartphones',
  ],
  [{ slug: 'dell-e7470-core-i5', name: 'Dell E7470 Core i5' }, 'smartphones'],
  [
    { slug: 'lg-55uq7550psf', name: 'LG 55UQ7550PSF 55 inch 4K' },
    'smartphones',
  ],
  [
    { slug: 'msi-mag-b760m-mortar', name: 'MSI MAG B760M Mortar' },
    'smartphones',
  ],
  [{ slug: 'msi-mpg-a850g', name: 'MSI MPG A850G PCIE5' }, 'smartphones'],
  [
    { slug: 'ipad-pro-m4-oled', name: 'iPad Pro M4 màn hình OLED 13 inch' },
    'tablets',
  ],
  [
    { slug: 'garmin-fenix-8', name: 'Garmin Fenix 8 màn hình AMOLED' },
    'smartwatches',
  ],
  [
    {
      slug: 'jbl-tour-pro-3',
      name: 'JBL Tour Pro 3 tai nghe màn hình cảm ứng',
    },
    'earbuds',
  ],
  [
    {
      slug: 'xiaomi-air-purifier-4',
      name: 'Máy lọc không khí Xiaomi Smart Air Purifier 4 màn hình OLED',
    },
    'air-purifiers',
  ],
  [
    { slug: 'zestech-z800', name: 'Màn hình Android Zestech Z800+ cho ô tô' },
    'smartphones',
  ],
  [
    { slug: 'anker-power-bank', name: 'Pin dự phòng Anker màn hình LCD' },
    'smartphones',
  ],
  [{ slug: 'lg-oled-55-c4', name: 'Smart Tivi LG OLED 55 inch 4K' }, 'tvs'],
  // Vietnamese places sharing Nhân Hòa / Long Vân names must NEVER hijack to vps-hosting
  [{ slug: 'nha-khoa-nhan-hoa', name: 'Nha khoa Nhân Hòa' }, 'dental-clinics'],
  [{ slug: 'khach-san-long-van', name: 'Khách sạn Long Vân' }, 'hotels'],
  [{ slug: 'spa-nhan-hoa', name: 'Spa Nhân Hòa' }, 'spas-aesthetics'],
  [{ slug: 'quan-ca-phe-long-van', name: 'Quán Cà Phê Long Vân' }, 'cafes'],
  [{ slug: 'nha-hang-nhan-hoa', name: 'Nhà hàng Nhân Hòa' }, 'restaurants'],
  [{ slug: 'homestay-long-van', name: 'Homestay Long Vân' }, 'homestays'],
  // VPS Securities must NOT classify as vps-hosting
  [
    { slug: 'vps-smartone', name: 'VPS SmartOne - Tài khoản giao dịch' },
    'smartphones',
  ],
  [
    { slug: 'ezviz-c8c-2k', name: 'Camera an ninh WiFi EZVIZ C8C' },
    'smartphones',
  ],
  [
    { slug: '70mai-a810', name: 'Camera hành trình ô tô 70mai A810' },
    'smartphones',
  ],
  [
    { slug: 'north-bayou-f80', name: 'Giá treo màn hình North Bayou F80' },
    'smartphones',
  ],
  [
    { slug: 'sony-fe-50mm-f18', name: 'Ống kính Sony FE 50mm f/1.8' },
    'smartphones',
  ],
  [
    {
      slug: 'sigma-30mm-lens-sony',
      name: 'Sigma 30mm f/1.4 Lens cho máy ảnh Mirrorless Sony',
    },
    'smartphones',
  ],
  [
    {
      slug: 'godox-tt685ii-flash',
      name: 'Godox TT685II Đèn flash cho máy ảnh Canon',
    },
    'smartphones',
  ],
  [
    {
      slug: 'dji-rs4-mini-gimbal',
      name: 'DJI RS 4 Mini Gimbal cho máy ảnh Mirrorless',
    },
    'smartphones',
  ],
  [
    { slug: 'nikon-z-24-70mm-f2-8-s', name: 'Nikon Z 24-70mm f/2.8 S' },
    'smartphones',
  ],
  [
    { slug: 'nikon-z-50mm-f1-8-s', name: 'Nikon Z 50mm f/1.8 S' },
    'smartphones',
  ],
  [
    { slug: 'sony-a95l-65-inch', name: 'Sony A95L 65 inch QD-OLED' },
    'smartphones',
  ],
  // ASCII / hyphenated slug guards
  [{ slug: 'chan-de-roi-man-hinh-dell' }, 'smartphones'],
  [{ slug: 'den-treo-man-hinh-xiaomi' }, 'smartphones'],
  [{ slug: 'man-hinh-thay-the-iphone' }, 'smartphones'],
  [{ slug: 'man-hinh-zin-laptop' }, 'laptops'],
  [{ slug: 'man-hinh-zin-27-inch' }, 'smartphones'],
  [{ slug: 'chan-may-anh-benro' }, 'smartphones'],
  [{ slug: 'tui-dung-may-anh-peak' }, 'smartphones'],
  [{ slug: 'pin-roi-sony-np-fz100' }, 'smartphones'],
  [{ slug: 'camera-ngoai-troi-360' }, 'smartphones'],
  [{ slug: 'camera-noi-soi-tai' }, 'smartphones'],
  [{ slug: 'camera-o-to-4k' }, 'smartphones'],
];
for (const [item, expected] of fallbackCases) {
  assert.equal(
    getMasterProductCategorySlug(item),
    expected,
    `Fallback mismatch for ${JSON.stringify(item)}`
  );
}
assert.equal(
  getMasterProductHref({
    slug: 'dell-ultrasharp-u2724d',
    specifications: { category_slug: 'monitors' },
  }),
  '/monitors/dell-ultrasharp-u2724d'
);

// 5. Next config, proxy, OpenAPI, MCP, filters, and locale parity.
const nextConfigSrc = readFileSync(join(webRoot, 'next.config.mjs'), 'utf8');
const proxySrc = readFileSync(join(webRoot, 'src/proxy.ts'), 'utf8');
for (const slug of E6_ALL) {
  assert.ok(nextConfigSrc.includes(slug), `next.config.mjs missing ${slug}`);
  assert.ok(
    slug in CATEGORY_FILTER_SCHEMAS,
    `CATEGORY_FILTER_SCHEMAS missing ${slug}`
  );
  const schema = getCategoryFilterSchema(slug);
  assert.equal(schema.categorySlug, slug);
  const localizedEn = localizeCategoryFilterSchema(schema, (k) => {
    const parts = k.split('.');
    let cur: unknown = (enMessages as Record<string, unknown>).catalog;
    for (const p of parts) {
      cur =
        cur && typeof cur === 'object'
          ? (cur as Record<string, unknown>)[p]
          : undefined;
    }
    return typeof cur === 'string' ? cur : k;
  });
  assert.ok(localizedEn.categoryTitle.length > 0);
}
assert.ok(proxySrc.includes('[mM][oO][nN][iI][tT][oO][rR][sS]'));
assert.ok(proxySrc.includes('[cC][aA][mM][eE][rR][aA][sS]'));
assert.ok(proxySrc.includes('[vV][pP][sS]-[hH][oO][sS][tT][iI][nN][gG]'));

const openApi = buildRateOpenApiSpec();
const categoryEnum = (
  openApi.components.schemas.CanonicalRateCategorySlug as { enum: string[] }
).enum;
assert.equal(categoryEnum.length, 27);
for (const slug of E6_ALL) {
  assert.ok(categoryEnum.includes(slug));
  assert.ok(SUPPORTED_CATEGORY_ENUM.options.includes(slug));
}
assert.equal(MCP_SUPPORTED_CATEGORY_COUNT, 27);
const llmsTxt = buildRateLlmsTxt();
assert.ok(
  llmsTxt.includes(
    '`availability` + `regulatory` only on Wave E2/E3/E4/E5 and `vps-hosting`'
  ),
  '/llms.txt spec summary must include vps-hosting'
);

// ReDoS safety check on adversarial long strings in web fallback detector.
{
  const start = performance.now();
  for (const slug of [
    '0'.repeat(5000),
    '-'.repeat(5000),
    `dell-u${'0'.repeat(5000)}`,
    `sony-a${'0'.repeat(5000)}`,
    `nikon-z-${'0'.repeat(5000)}mm`,
  ]) {
    getMasterProductCategorySlug({ slug });
  }
  const elapsedMs = performance.now() - start;
  assert.ok(
    elapsedMs < 50,
    `Expected linear web fallback runtime (<50ms), got ${elapsedMs.toFixed(2)}ms`
  );
}

// 6. Deal Radar omits costPerPointVnd for vps-hosting service rows.
const ranked = rankProductsForDealFinder(
  [
    {
      id: 'vps-1',
      model_key: 'nhan-hoa:cloud-vps-a:unknown',
      slug: 'nhan-hoa-cloud-vps-a',
      name: 'Nhân Hòa Cloud VPS A',
      brand: 'Nhân Hòa',
      model: 'Cloud VPS A',
      status: 'published',
      min_price: 180_000,
      max_price: 240_000,
      merchant_count: 1,
      user_rating_weighted: 4.5,
      authentic_review_count: 5,
      rating_score: 4.5,
      total_reviews: 5,
      specifications: { category_slug: 'vps-hosting' },
      metadata: { price_currency: 'VND' },
    },
  ] as unknown as Parameters<typeof rankProductsForDealFinder>[0],
  {
    categoryFilter: 'vps-hosting',
    persona: 'default',
    maxBudgetVnd: 0,
    searchQuery: '',
  }
);
assert.equal(ranked.length, 1);
const jsonDeal = buildDealJsonItem(ranked[0]!, null);
assert.equal(jsonDeal.costPerPointVnd, null);
const csvDeal = buildDealCsvRow(ranked[0]!, 'default', 'https://rate.vn', null);
assert.equal(csvDeal[9], '');

// 7. Locale parity across en, vi, cs and zero em/en-dashes in Wave E6 copy.
for (const [lang, msg] of [
  ['en', enMessages],
  ['vi', viMessages],
  ['cs', csMessages],
] as const) {
  const nav = msg.rate.nav as Record<string, string>;
  const footerLinks = msg.rate.footer.links as Record<string, string>;
  const meta = msg.catalog.meta as Record<string, unknown>;
  const schemas = msg.catalog.schemas as Record<string, unknown>;
  for (const slug of E6_ALL) {
    assert.ok(nav[slug], `${lang} nav.${slug}`);
    assert.ok(footerLinks[slug], `${lang} footer.${slug}`);
    assert.ok(meta[slug], `${lang} meta.${slug}`);
    assert.ok(schemas[slug], `${lang} schemas.${slug}`);
  }
  const serialized = JSON.stringify({
    nav: E6_ALL.map((s) => nav[s]),
    meta: E6_ALL.map((s) => meta[s]),
    schemas: E6_ALL.map((s) => schemas[s]),
  });
  assert.doesNotMatch(serialized, /[\u2013\u2014]|&\x6ddash;/);
}
for (const slug of E6_ALL) {
  assert.match(
    (enMessages.catalog.meta as Record<string, { titleCount: string }>)[slug]!
      .titleCount,
    /\{count, plural, one \{# /
  );
  assert.match(
    (csMessages.catalog.meta as Record<string, { titleCount: string }>)[slug]!
      .titleCount,
    /\{count, plural, one \{# .* few \{# .* other \{# /
  );
}

console.warn('✅ Wave E6 web suite passed');
