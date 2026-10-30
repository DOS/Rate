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
      design: { resistance: 'Sạc nhanh 35W' },
      multimedia: { loudspeaker: 'Stereo speakers' },
      battery: { reverse_charging: 'Reverse wireless charging 4.5W' },
      connectivity: { other: 'Stereo reproduktory' },
    } as unknown as ProductSpecifications,
    keySpecs: { battery: 'Up to 20 hours of video playback' } as KeySpecs,
    product: {},
    template: getCategorySpecTemplate('smartphones'),
    ui: getSpecUiDictionary('cs'),
    locale: 'cs',
  }).flatMap((g) => g.rows);
  const rowOf = (value: string) => rows.find((r) => r.value === value);
  assert.equal(rowOf(glass)?.lang, 'en');
  assert.equal(rowOf('LTPO OLED')?.lang, undefined);
  assert.equal(rowOf('Sạc nhanh 35W')?.lang, 'vi');
  // Values from the key specs fallback and a reverse-charging sentence too.
  assert.equal(rowOf('Reverse wireless charging 4.5W')?.lang, 'en');
  assert.equal(rowOf('Up to 20 hours of video playback')?.lang, 'en');
  // Each row keeps its own language: the translated loudspeaker row is not
  // marked because another row's source text reads the same.
  const speaker = localizedSpecValue('Stereo speakers', 'cs');
  assert.notEqual(speaker.text, 'Stereo speakers');
  const loudspeakerLabel = getSpecUiDictionary('cs').fields.loudspeaker;
  const loudspeaker = rows.find((r) => r.label === loudspeakerLabel);
  assert.equal(loudspeaker?.value, speaker.text);
  assert.equal(loudspeaker?.lang, undefined);
  console.warn('  ✅ Spec values carry their language when it differs');
}

// Compare matrix cells mark their spec values, so only those get a language;
// the Czech catalogue text around them does not (DOS/Rate#1392).
async function testCompareCellLanguage() {
  const { createTranslator } = await import('next-intl');
  const { compareCellSegments, plainCompareCell } =
    await import('../compare-cell');
  const { buildSpecGroups } =
    await import('../../components/compare/CompareWorkspace');
  const csMessages = JSON.parse(
    (await import('node:fs')).readFileSync(
      (await import('node:path')).join(__dirname, '../../../locales/cs.json'),
      'utf8'
    )
  );
  const cs = createTranslator({
    locale: 'cs',
    messages: csMessages,
    namespace: 'compare',
  });
  const t = cs as unknown as Parameters<typeof buildSpecGroups>[0];
  const rows = new Map(
    buildSpecGroups(t).flatMap((g) => g.rows.map((r) => [r.id, r]))
  );
  const product = {
    slug: 'x',
    specifications: {
      hardware: {
        os: 'iOS 18',
        storage_expansion: 'microSDXC (dedicated slot)',
      },
      design: { colors: ['Desert titanium', 'Black'], biometrics: 'Face ID' },
      display: { protection: 'Ceramic Shield glass' },
    },
  } as never;

  const osExp = rows.get('hw_os_exp')!;
  const plain = osExp.renderValue(product);
  assert.doesNotMatch(plain, /[\uE000\uE001]/, 'renderValue is plain text');
  assert.equal(plain, plainCompareCell(osExp.renderCell!(product)));
  const segments = compareCellSegments(osExp.renderCell!(product));
  const prefix = segments.find((s) => !s.spec && /karta/i.test(s.text));
  assert.ok(prefix, 'the Czech card-slot prefix is catalogue text');
  const slot = segments.find((s) => s.spec && /microSDXC/.test(s.text));
  assert.ok(slot, 'the card-slot value is a spec part');
  assert.equal(localizedSpecValue(slot.text, 'cs').lang, 'en');

  const colorsCell = compareCellSegments(
    rows.get('design_bio_colors')!.renderCell!(product)
  );
  assert.ok(
    colorsCell.some((s) => s.spec && s.text === 'Desert titanium, Black')
  );
  assert.ok(colorsCell.some((s) => !s.spec && /Barvy/.test(s.text)));

  // Every row, with every field set: no Czech catalogue prefix ends up inside
  // a spec part, and a boolean is catalogue text.
  const full = {
    slug: 'z',
    specifications: {
      display: {
        type: 'LTPO OLED',
        resolution: '1179x2556',
        protection: 'Ceramic Shield glass',
        features: 'Dynamic Island',
      },
      hardware: {
        chipset: 'Apple A18',
        cpu: 'Hexa-core',
        gpu: 'Apple GPU',
        os: 'iOS 18',
        storage_expansion: 'No card slot',
      },
      camera: {
        main_camera: '48 MP',
        second_camera: '12 MP',
        third_camera: '12 MP tele',
        fourth_camera: 'LiDAR',
        video_recording: '4K@60fps',
        flash: 'Dual LED',
        front_camera: '12 MP',
      },
      battery: {
        type: 'Li-Ion, non-removable',
        charging: 'Wireless fast charging',
        reverse_charging: 'Reverse wireless charging 4.5W',
      },
      design: {
        dimensions: '147.6 x 71.6 x 7.8 mm',
        materials: 'Glass front',
        resistance: 'IP68 dust/water resistant',
        biometrics: 'Face ID',
        colors: ['Black'],
      },
      cellular: {
        sim_type: 'Nano-SIM and eSIM',
        technology: 'GSM / LTE / 5G',
        bands_5g: 'n1, n78',
        data_speed: '5G',
      },
      connectivity: {
        wlan: 'Wi-Fi 7',
        bluetooth: '5.3',
        nfc: true,
        usb: 'USB-C',
        location: 'GPS',
        sensors: 'Face ID, accelerometer',
      },
      multimedia: {
        loudspeaker: 'Stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial audio',
      },
      availability: {
        announced: '2024, September',
        status: 'Available',
        prices_msrp: '$799',
      },
      regulatory: {
        certifications: 'CE',
        fcc_approval: 'BCG-E8726A',
        sar_head: '1.2 W/kg',
        sar_body: '1.1 W/kg',
      },
    },
  } as never;
  const prefixes = [
    'valCardSlotPrefix',
    'valColorsPrefix',
    'valReverseChargePrefix',
    'valSarHeadPrefix',
    'valSarBodyPrefix',
  ].map((key) =>
    (csMessages.compare[key] as string).split('{value}')[0]!.trim()
  );
  const yes = csMessages.compare.boolYes as string;
  const no = csMessages.compare.boolNo as string;
  for (const [id, row] of rows) {
    if (!row.renderCell) continue;
    for (const segment of compareCellSegments(row.renderCell(full))) {
      if (!segment.spec) continue;
      for (const prefix of prefixes) {
        assert.ok(
          !segment.text.includes(prefix),
          `${id}: "${prefix}" inside a spec part`
        );
      }
      assert.notEqual(segment.text, yes, `${id}: Yes is catalogue text`);
      assert.notEqual(segment.text, no, `${id}: No is catalogue text`);
    }
  }
  // A prefixed value of "-" leaves its prefix catalogue text too.
  const dashed = {
    slug: 'd',
    specifications: {
      hardware: { os: 'iOS 18', storage_expansion: '-' },
      regulatory: { certifications: 'CE', sar_head: '-' },
    },
  } as never;
  for (const id of ['hw_os_exp', 'reg_cert']) {
    for (const segment of compareCellSegments(
      rows.get(id)!.renderCell!(dashed)
    )) {
      if (!segment.spec) continue;
      for (const prefix of prefixes) {
        assert.ok(
          !segment.text.includes(prefix),
          `${id}: "${prefix}" inside a spec part`
        );
      }
    }
  }
  const battery = compareCellSegments(
    rows.get('bat_details')!.renderCell!(full)
  );
  assert.ok(
    battery.some((s) => s.spec && s.text === 'Reverse wireless charging 4.5W')
  );
  // A raw string is a spec value; a boolean is not.
  const nfc = compareCellSegments(
    rows.get('conn_nfc')!.renderCell!({
      slug: 'n',
      specifications: { connectivity: { nfc: 'Yes, market dependent' } },
    } as never)
  );
  assert.deepEqual(nfc, [{ text: 'Yes, market dependent', spec: true }]);

  // A catalogue-only cell has no spec part at all.
  const reviews = compareCellSegments(
    rows.get('rating_weighted')!.renderCell!({
      slug: 'y',
      specifications: {},
    } as never)
  );
  assert.ok(
    reviews.every((s) => !s.spec),
    'no spec part in a review cell'
  );
  console.warn('  ✅ Compare cells mark only their spec values');
}

async function main() {
  console.warn('🧪 Product spec rows suite (DOS/Rate#1186)');
  testProductPage();
  testCompare();
  testValueLanguage();
  await testCompareUnknownSpecs();
  await testCompareCellLanguage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
