import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  getSpecUiDictionary,
  specGroupHeading,
  specSectionBadge,
} from '../spec-localizer';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

// The headings a category's spec section shows, in order.
const headings = (category: string, locale: string) => {
  const ui = getSpecUiDictionary(locale);
  const template = getCategorySpecTemplate(category);
  return template.groups.map((group: SpecGroupKey, i: number) =>
    specGroupHeading(ui, group, i + 1, template.has5g)
  );
};

// A stored earbud and a cellular watch the way the enricher filled them:
// phone-shaped, with a screen, RAM, ROM, cameras and 5G.
const phoneShapedSpecs = {
  display: { size_inch: 1, type: 'OLED', refresh_rate_hz: 60, ppi: 326 },
  hardware: { chipset: 'H2', cpu: 'c', ram_gb: 1, storage_gb: 64, os: 'o' },
  camera: { main_camera: '2 mic', front_camera: 'f' },
  battery: { capacity_mah: 500 },
  cellular: {
    has_5g: true,
    technology: 'LTE / 5G',
    data_speed: 'LTE, 5G',
    bands_5g: 'n78',
    sim_type: 'eSIM',
  },
  connectivity: { bluetooth: '5.3', nfc: true },
  multimedia: { audio_features: 'ANC' },
};
const phoneShapedProduct = {
  id: 'm1',
  slug: 'phone-shaped',
  name: 'Phone shaped',
  brand: 'Apple',
  ram_gb: 1,
  storage_gb: 64,
  screen_size_inch: 1,
  has_5g: true,
  specifications: phoneShapedSpecs,
  key_specs: {
    screen: '1 inch',
    chip: 'H2',
    camera: 'mic',
    ram: '1GB',
    storage: '64GB',
    battery: '500 mAh',
  },
};

const SCREEN_RAM_CAMERA_RE =
  /\b(?:\d+(?:\.\d+)?\s*(?:"|inch|Hz|ppi)|\d+\s*GB|RAM|ROM|mic|camera)\b/i;
const FIVE_G_RE = /\b5G\b/;

async function testSurfaces() {
  // /compare (DOS/Rate#1166): an earbud has no screen, hardware memory,
  // camera or cellular row; a watch no 5G row and no 5G in its network text.
  const nodeModule = await import('node:module');
  const extMap = (
    nodeModule.default as unknown as {
      _extensions?: Record<string, (mod: { exports: unknown }) => void>;
    }
  )._extensions;
  if (extMap && !extMap['.css']) {
    extMap['.css'] = (mod) => {
      mod.exports = {};
    };
  }
  const { buildSpecGroups, filterSpecGroupsForCategory } =
    await import('../../components/compare/CompareWorkspace');
  const t = ((key: string) => key) as unknown as Parameters<
    typeof buildSpecGroups
  >[0];
  const all = buildSpecGroups(t);
  const rowIds = (category: string) =>
    filterSpecGroupsForCategory(all, category).flatMap((g) =>
      g.rows.map((r) => r.id)
    );
  const groupIds = (category: string) =>
    filterSpecGroupsForCategory(all, category).map((g) => g.id);
  assert.deepEqual(
    groupIds('smartphones'),
    all.map((g) => g.id)
  );
  assert.deepEqual(rowIds('smartphones'), rowIds('tablets'));
  assert.deepEqual(groupIds('earbuds'), [
    'market_trust',
    'multimedia',
    'battery',
    'connectivity',
    'hardware',
    'design',
    'availability',
    'regulatory',
  ]);
  const budRows = rowIds('earbuds');
  for (const id of [
    'display_size',
    'display_refresh',
    'hw_cpu_gpu',
    'hw_ram',
    'hw_storage',
    'hw_os_exp',
    'cam_main',
    'cell_5g',
    'conn_nfc',
  ]) {
    assert.ok(!budRows.includes(id), `earbuds compare has no ${id}`);
  }
  assert.ok(budRows.includes('hw_chipset'));
  const watchRows = rowIds('smartwatches');
  assert.ok(!watchRows.includes('cell_5g'));
  assert.ok(!groupIds('smartwatches').includes('camera'));
  assert.ok(watchRows.includes('hw_ram') && watchRows.includes('cell_sim'));

  const render = (category: string) => {
    const product = applyCategorySpecTemplate(
      category,
      phoneShapedProduct as never
    );
    return filterSpecGroupsForCategory(all, category)
      .filter((g) => g.id !== 'market_trust')
      .flatMap((g) => g.rows.map((r) => `${r.id}=${r.renderValue(product)}`));
  };
  const budCells = render('earbuds');
  assert.ok(
    budCells.every(
      (c) => c.startsWith('hw_chipset=') || !SCREEN_RAM_CAMERA_RE.test(c)
    ),
    budCells.join(' | ')
  );
  const watchCells = render('smartwatches');
  assert.ok(
    watchCells.every((c) => !FIVE_G_RE.test(c)),
    watchCells.join(' | ')
  );
  assert.ok(watchCells.includes('cell_sim=eSIM | LTE'), watchCells.join(' | '));

  // Spec export (Markdown, CSV and JSON share the rows).
  const { buildProductSpecExportRows } =
    await import('../../components/leaderboard/ProductSpecsExportToolbar');
  const exportRows = (category?: string) =>
    buildProductSpecExportRows(
      phoneShapedSpecs as never,
      phoneShapedProduct.key_specs,
      category
    );
  assert.equal(exportRows().length, 13);
  assert.equal(exportRows('smartphones').length, 13);
  const budExport = exportRows('earbuds');
  assert.deepEqual(
    budExport.map(([, attr]) => attr),
    [
      'Chipset & CPU/GPU',
      'Capacity & Fast Charging',
      'Dimensions, Weight & IP Rating',
      'WLAN, Bluetooth & USB',
      'Audio & Speakers',
      'Release & MSRP',
      'Certifications & SAR',
    ]
  );
  assert.equal(budExport[0]?.[2], 'H2');
  assert.ok(
    budExport.every(([, , v]) => !SCREEN_RAM_CAMERA_RE.test(v)),
    JSON.stringify(budExport)
  );
  const watchExport = exportRows('smartwatches');
  assert.ok(!watchExport.some(([grp]) => grp.startsWith('3. Camera')));
  assert.ok(
    watchExport.every(([, , v]) => !FIVE_G_RE.test(v)),
    JSON.stringify(watchExport)
  );
  assert.ok(
    watchExport.some(([, , v]) => v === 'LTE | eSIM | LTE'),
    JSON.stringify(watchExport)
  );

  // The key spec line outside the product page.
  const { buildKeySpecLine } = await import('../product-competitors');
  assert.equal(
    buildKeySpecLine(phoneShapedProduct as never, 'earbuds'),
    'H2 • 500 mAh'
  );
  assert.equal(
    buildKeySpecLine(phoneShapedProduct as never),
    'H2 • 1GB • 64GB • 500 mAh'
  );

  // The leaderboard rows, the export toolbar on the product page and REST
  // API v1 read the scoped product.
  const leaderboard = readSource(
    '../../components/leaderboard/LeaderboardExplorer.tsx'
  );
  assert.match(
    leaderboard,
    /\.map\(\(p\) => applyCategorySpecTemplate\(activeCategory, p\)\)/
  );
  const compare = readSource('../../components/compare/CompareWorkspace.tsx');
  assert.match(
    compare,
    /storedProducts\.map\(\(p\) => applyCategorySpecTemplate\(activeCategory, p\)\)/
  );
  const detail = readSource('../../app/[locale]/smartphones/[slug]/page.tsx');
  assert.match(detail, /categorySlug=\{categorySlug\}/);
  assert.match(detail, /buildKeySpecLine\(product, categorySlug\)/);
  const apiList = readSource('../../app/api/v1/rate/products/route.ts');
  assert.match(
    apiList,
    /\.\.\.applyCategorySpecTemplate\(getMasterProductCategorySlug\(p\), p\)/
  );
  const apiDetail = readSource(
    '../../app/api/v1/rate/products/[slug]/route.ts'
  );
  assert.match(
    apiDetail,
    /const product = applyCategorySpecTemplate\(\s*getMasterProductCategorySlug\(storedProduct\),\s*storedProduct\s*\)/
  );
  const apiCompare = readSource('../../app/api/v1/rate/compare/route.ts');
  assert.match(
    apiCompare,
    /\.\.\.applyCategorySpecTemplate\(lockedCategory, p\)/
  );
  console.warn('  ✅ Compare, leaderboard, export and API v1 scoped');
}

async function main() {
  console.warn('🧪 Category spec template suite (DOS/Rate#1142)');

  // Phones keep the ten numbered groups, worded as before.
  const phone = headings('smartphones', 'vi');
  assert.equal(phone.length, 10);
  assert.equal(phone[0], '1. Màn hình (Display)');
  assert.equal(phone[5], '6. Mạng Di động & 5G (Cellular)');
  assert.equal(phone[9], '10. Pháp lý, Chứng nhận & SAR (Regulatory)');
  assert.deepEqual(headings('tablets', 'en'), headings('smartphones', 'en'));
  assert.equal(
    specSectionBadge(getSpecUiDictionary('vi'), 10),
    '10 nhóm thông số'
  );

  // Earbuds open on audio and never show a screen, hardware, camera or
  // cellular group, in any locale.
  for (const locale of ['vi', 'en', 'cs']) {
    const ui = getSpecUiDictionary(locale);
    const buds = headings('earbuds', locale);
    assert.equal(buds.length, 7);
    assert.ok(buds[0]!.startsWith('1. '));
    assert.ok(buds[0]!.endsWith(ui.groups.multimedia.replace(/^\d+\.\s*/, '')));
    for (const group of ['display', 'camera', 'cellular'] as const) {
      const label = ui.groups[group].replace(/^\d+\.\s*/, '');
      assert.ok(
        !buds.some((h: string) => h.endsWith(label)),
        `earbuds (${locale}) must not show ${group}`
      );
    }
    assert.equal(specSectionBadge(ui, buds.length).startsWith('7 '), true);
  }
  assert.deepEqual(headings('earbuds', 'en'), [
    '1. Audio & multimedia',
    '2. Battery & charging',
    '3. Connectivity & sensors',
    '4. Hardware & performance',
    '5. Design & durability',
    '6. Availability & MSRP',
    '7. Regulatory, certifications & SAR',
  ]);

  // Smartwatches: no camera group and no "5G" anywhere in the headings.
  for (const locale of ['vi', 'en', 'cs']) {
    const watch = headings('smartwatches', locale);
    assert.equal(watch.length, 9);
    assert.ok(
      watch.every((h: string) => !h.includes('5G')),
      watch.join(' | ')
    );
  }
  assert.equal(headings('smartwatches', 'vi')[4], '5. Mạng Di động (Cellular)');

  // The card chips read only what the template leaves: an earbud has no
  // "1GB RAM · 64GB" and a cellular watch no "5G".
  const buds = applyCategorySpecTemplate('earbuds', {
    ram_gb: 1,
    storage_gb: 1,
    has_5g: false,
    key_specs: { screen: '1"', ram: '1GB', chip: 'H2' },
  });
  assert.equal(buds.ram_gb, null);
  assert.equal(buds.storage_gb, null);
  assert.deepEqual(buds.key_specs, { chip: 'H2' });
  const ultra2 = applyCategorySpecTemplate('smartwatches', {
    storage_gb: 64,
    has_5g: true,
  });
  assert.equal(ultra2.has_5g, false);
  assert.equal(ultra2.storage_gb, 64);

  // The detail page, the category cards and the home cards all apply it.
  const detail = readSource('../../app/[locale]/smartphones/[slug]/page.tsx');
  assert.match(
    detail,
    /const product = applyCategorySpecTemplate\(categorySlug, storedProduct\)/
  );
  assert.match(detail, /applyCategorySpecTemplate\(categorySlug, peer\)/);
  assert.match(detail, /specTemplate\.groups\.map\(/);
  assert.doesNotMatch(detail, /specUi\.groups\.\w+\}/);
  const catalog = readSource('../../app/[locale]/smartphones/page.tsx');
  assert.match(
    catalog,
    /applyCategorySpecTemplate\(\s*categorySlug,\s*storedItem/
  );
  const home = readSource('../../app/[locale]/page.tsx');
  assert.match(
    home,
    /applyCategorySpecTemplate\(\s*getMasterProductCategorySlug/
  );

  await testSurfaces();
  console.warn('  ✅ Category spec templates passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
