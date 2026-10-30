import assert from 'node:assert/strict';
import { getCategorySpecTemplate } from '@repo/shared-data/rules';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  buildProductSpecGroups,
  compareRowIsShown,
  isEmptySpecValue,
} from '../product-spec-rows';
import { getSpecUiDictionary, localizedSpecValue } from '../spec-localizer';

const groupsFor = (
  category: string,
  specs: Record<string, unknown>,
  keySpecs: Record<string, unknown> = {},
  product: Record<string, unknown> = {}
) =>
  buildProductSpecGroups({
    specs: specs as ProductSpecifications,
    keySpecs: keySpecs as KeySpecs,
    product,
    template: getCategorySpecTemplate(category),
    ui: getSpecUiDictionary('vi'),
    locale: 'vi',
  });

const labelsOf = (groups: ReturnType<typeof groupsFor>, group: string) =>
  groups.find((g) => g.group === group)?.rows.map((r) => r.label) ?? null;

function testProductPage() {
  const ui = getSpecUiDictionary('vi');

  // A GPS watch: no cellular value at all, so no cellular group; empty rows
  // of other groups are left out, filled ones kept.
  const watch = groupsFor('smartwatches', {
    display: { size_inch: 1.9, type: 'LTPO OLED', resolution: '' },
    hardware: { chipset: 'Apple S11' },
    battery: { capacity_mah: 327 },
    cellular: { technology: '', data_speed: null, bands_4g: '' },
    connectivity: { bluetooth: '5.3' },
  });
  assert.equal(labelsOf(watch, 'cellular'), null);
  assert.deepEqual(labelsOf(watch, 'display'), [
    ui.fields.screenSize,
    ui.fields.panelType,
  ]);
  assert.deepEqual(labelsOf(watch, 'hardware'), [ui.fields.chipset]);
  // No invented commercial status: an empty availability group is gone
  // (DOS/Rate#1193).
  assert.equal(labelsOf(watch, 'availability'), null);
  // A cellular watch keeps its 4G bands under the 4G-only label.
  const lte = groupsFor('smartwatches', {
    cellular: { has_5g: true, bands_4g: 'B1/B3', bands_5g: 'n78' },
  });
  assert.deepEqual(lte.find((g) => g.group === 'cellular')?.rows, [
    { label: ui.fields.bands4g, value: 'B1/B3' },
  ]);
  for (const { rows } of watch) {
    for (const { value } of rows) {
      assert.ok(!isEmptySpecValue(value), `empty row: ${value}`);
    }
  }

  // Earbuds: an empty FCC row is gone, certifications stay; the hardware
  // card keeps only the audio chip.
  const buds = groupsFor(
    'earbuds',
    {
      hardware: { chipset: 'H2' },
      regulatory: { certifications: 'CE', fcc_approval: '-' },
      multimedia: { audio_features: 'ANC' },
    },
    { battery: '6 giờ' }
  );
  assert.deepEqual(labelsOf(buds, 'regulatory'), [ui.fields.certifications]);
  assert.deepEqual(labelsOf(buds, 'hardware'), [ui.fields.chipset]);
  assert.deepEqual(
    buds.map((g) => g.group),
    ['multimedia', 'battery', 'hardware', 'regulatory']
  );

  // A group with nothing but empty values disappears.
  const bare = groupsFor('earbuds', {
    design: { dimensions: '', weight_g: 0, keys: null },
  });
  assert.equal(labelsOf(bare, 'design'), null);

  // Phones keep their filled rows and flat-column fallbacks.
  const phone = groupsFor(
    'smartphones',
    { hardware: { chipset: 'A18' } },
    {},
    { ram_gb: 8, storage_gb: 128, has_5g: true }
  );
  assert.deepEqual(
    phone.find((g) => g.group === 'hardware')?.rows.map((r) => r.value),
    ['A18', '8 GB', '128 GB']
  );
  assert.equal(
    phone.find((g) => g.group === 'cellular')?.rows[0]?.value,
    ui.has5gYes
  );

  // 5G: unknown is no row, a known false still reads "No".
  const unknown5g = groupsFor('smartphones', { cellular: {} }, {}, {});
  assert.equal(labelsOf(unknown5g, 'cellular'), null);
  const no5g = groupsFor(
    'smartphones',
    { cellular: {} },
    {},
    { has_5g: false }
  );
  assert.deepEqual(
    no5g.find((g) => g.group === 'cellular')?.rows.map((r) => r.value),
    [ui.no]
  );
  const nestedYes = groupsFor(
    'smartphones',
    { cellular: { has_5g: 'yes' } },
    {},
    { has_5g: false }
  );
  assert.equal(
    nestedYes.find((g) => g.group === 'cellular')?.rows[0]?.value,
    ui.has5gYes
  );
  const status = groupsFor('smartphones', {
    availability: { status: 'Available' },
  });
  assert.deepEqual(labelsOf(status, 'availability'), [
    ui.fields.commercialStatus,
  ]);
  console.warn('  ✅ Product page leaves out empty rows and groups');
}

function testCompare() {
  assert.equal(compareRowIsShown(['-', '-'], false), false);
  assert.equal(compareRowIsShown(['', ' - '], true), false);
  // "-" stays where another column has a value.
  assert.equal(compareRowIsShown(['-', 'LTE'], false), true);
  assert.equal(compareRowIsShown(['-', 'LTE'], true), true);
  assert.equal(compareRowIsShown(['LTE', 'LTE'], true), false);
  assert.equal(compareRowIsShown(['LTE', 'LTE'], false), true);
  assert.equal(compareRowIsShown(['LTE'], true), true);
  assert.equal(compareRowIsShown(['-'], false), false);
  console.warn('  ✅ Compare keeps "-" only beside a value');
}

// Compare prints no invented value for an unknown spec (DOS/Rate#1193).
async function testCompareUnknownSpecs() {
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
  const { buildSpecGroups } =
    await import('../../components/compare/CompareWorkspace');
  const t = ((key: string) => key) as unknown as Parameters<
    typeof buildSpecGroups
  >[0];
  const rows = new Map(
    buildSpecGroups(t).flatMap((g) => g.rows.map((r) => [r.id, r]))
  );
  const render = (id: string, product: Record<string, unknown>) =>
    rows.get(id)!.renderValue(product as never);
  const unknown = { slug: 'x', specifications: {} };
  for (const id of [
    'cell_5g',
    'mm_speaker',
    'conn_usb_gps',
    'avail_announced',
    'reg_cert',
  ]) {
    assert.equal(render(id, unknown), '-', id);
  }
  // An all-unknown row is hidden in compare.
  assert.equal(
    compareRowIsShown(
      [render('mm_speaker', unknown), render('mm_speaker', unknown)],
      false
    ),
    false
  );
  // Known values are unchanged; the nested 5G flag wins over the flat one,
  // and older text flags still read.
  assert.equal(
    render('cell_5g', {
      specifications: { cellular: { has_5g: false } },
      has_5g: true,
    }),
    'val4gLte'
  );
  assert.equal(
    render('cell_5g', { specifications: { cellular: { has_5g: 'true' } } }),
    'valHas5g'
  );
  assert.equal(
    render('avail_announced', {
      specifications: { availability: { announced: '2025' } },
    }),
    '2025'
  );
  assert.equal(
    render('reg_cert', {
      specifications: { regulatory: { certifications: 'CE' } },
    }),
    'CE'
  );
  assert.equal(render('cell_5g', { ...unknown, has_5g: false }), 'val4gLte');
  assert.equal(render('cell_5g', { ...unknown, has_5g: true }), 'valHas5g');
  assert.equal(
    render('mm_speaker', {
      specifications: { multimedia: { loudspeaker: 'Mono' } },
    }),
    'Mono'
  );
  assert.equal(
    render('conn_usb_gps', {
      specifications: { connectivity: { usb: 'USB-C 3.2', location: 'GPS' } },
    }),
    'USB-C 3.2 | GPS'
  );
  // The resolution text that names its ppi keeps one (DOS/Rate#1214).
  const display = (resolution: string) =>
    render('display_resolution', {
      specifications: { display: { resolution, ppi: 460 } },
    });
  assert.equal(
    display('1290 x 2796 pixels, 19.5:9 ratio (~460 ppi density)'),
    '1290 x 2796 pixels, 19.5:9 ratio (~460 ppi density)'
  );
  assert.equal(display('1290 x 2796 pixels'), '1290 x 2796 pixels (460 ppi)');
  // A bare "No" card slot reaches the localizer spelled out.
  const tValues = ((key: string, values?: { value?: string }) =>
    values?.value ? `${key}: ${values.value}` : key) as unknown as Parameters<
    typeof buildSpecGroups
  >[0];
  const osExp = buildSpecGroups(tValues)
    .flatMap((g) => g.rows)
    .find((r) => r.id === 'hw_os_exp')!;
  assert.equal(
    osExp.renderValue({
      specifications: { hardware: { os: 'iOS 20', storage_expansion: 'No' } },
    } as never),
    'iOS 20 | valCardSlotPrefix: No card slot'
  );
  console.warn('  ✅ Compare shows no invented value for unknown specs');
}

// English values the localizer leaves as they were are marked lang="en" on
// a Czech or Vietnamese page, Vietnamese ones lang="vi" (DOS/Rate#1371).
function testValueLanguage() {
  const glass = 'Ceramic Shield glass (2024 generation)';
  assert.deepEqual(localizedSpecValue(glass, 'cs'), {
    text: glass,
    lang: 'en',
  });
  assert.equal(localizedSpecValue(glass, 'en').lang, undefined);
  assert.equal(localizedSpecValue(glass, 'vi').lang, 'en');
  // Names and units alone are not English text.
  assert.equal(localizedSpecValue('Apple A18 Pro', 'cs').lang, undefined);
  assert.equal(localizedSpecValue('120 Hz, 2556x1179', 'cs').lang, undefined);
  // An English unit word is English: the Czech page would say "palce".
  assert.equal(localizedSpecValue('6.1 inch', 'cs').lang, 'en');
  // Vietnamese source text on an English or Czech page.
  assert.equal(localizedSpecValue('Sạc nhanh 35W', 'cs').lang, 'vi');
  assert.equal(localizedSpecValue('Sạc nhanh 35W', 'vi').lang, undefined);
  // A value the localizer changed is the page's language: no mark.
  const yes = localizedSpecValue(true, 'cs');
  assert.equal(yes.lang, undefined);
  const translated = localizedSpecValue('September 2024', 'cs');
  assert.notEqual(translated.text, 'September 2024');
  assert.equal(translated.lang, undefined);

  const rows = buildProductSpecGroups({
    specs: {
      display: { type: 'LTPO OLED', protection: glass },
      design: { colors: 'Hồng, Đen' },
    } as unknown as ProductSpecifications,
    keySpecs: {} as KeySpecs,
    product: {},
    template: getCategorySpecTemplate('smartphones'),
    ui: getSpecUiDictionary('cs'),
    locale: 'cs',
  }).flatMap((g) => g.rows);
  const rowOf = (value: string) => rows.find((r) => r.value === value);
  assert.equal(rowOf(glass)?.lang, 'en');
  assert.equal(rowOf('LTPO OLED')?.lang, undefined);
  console.warn('  ✅ Spec values carry their language when it differs');
}

async function main() {
  console.warn('🧪 Product spec rows suite (DOS/Rate#1186)');
  testProductPage();
  testCompare();
  testValueLanguage();
  await testCompareUnknownSpecs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
